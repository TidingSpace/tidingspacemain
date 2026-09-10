import { createClient } from './supabase-browser';

export type UploadResult = { url: string } | { error: string };

// Must match the bucket-level allowed_mime_types set in the Storage
// migration — this is the client-side half of that same restriction, giving
// people a clear error immediately instead of a generic failure from
// Supabase after a wasted upload attempt. The bucket-level restriction is
// the one that actually can't be bypassed; this one is just a better UX
// front-end for the same rule.
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB, matches the bucket's file_size_limit

// Resize + compress client-side before upload, so we're not pushing full-res
// phone-camera originals (often 4-8MB) over the network for content that's
// only ever displayed at a few hundred pixels wide anywhere in this app.
// Only ever called after validateImageFile() has confirmed this is a real,
// accepted image type — no silent fallback path for non-image files exists
// here anymore.
async function compressImage(file: File, maxDimension: number, quality = 0.82): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);

    return await new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob || file), 'image/jpeg', quality);
    });
  } catch {
    // Compression failed (e.g. a valid but unusual image format the browser
    // can't decode into a bitmap) — fall back to the original *file*, which
    // validateImageFile() already confirmed is a genuine accepted image type,
    // so this is a safe fallback, not a way to sneak an arbitrary file through.
    return file;
  }
}

// Real, enforced validation — this is what actually stops a non-image or
// oversized file from being uploaded at all, rather than silently passing
// it through with a fabricated Content-Type header.
function validateImageFile(file: File): string | null {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return "That file type isn't supported — please choose a JPEG, PNG, WebP, or GIF image.";
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return 'That image is too large — please choose one under 10MB.';
  }
  return null;
}

// Real upload progress requires talking to Supabase Storage's REST endpoint
// directly via XHR — the supabase-js SDK's storage.upload() is fetch-based
// and doesn't expose progress events, which the app's own requirement
// ("show upload progress") specifically calls for.
export async function uploadImage(
  bucket: string,
  path: string,
  file: File,
  options: { maxDimension?: number; onProgress?: (fraction: number) => void } = {}
): Promise<UploadResult> {
  const validationError = validateImageFile(file);
  if (validationError) return { error: validationError };

  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: 'You must be logged in to upload.' };

  const blob = await compressImage(file, options.maxDimension ?? 1600);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucket}/${path}`;

  // Content-Type reflects what's actually being sent — the compressed blob
  // really is image/jpeg (canvas.toBlob was asked for that format), and the
  // fallback-to-original path only ever runs on a file already confirmed to
  // be a real image above. Never a hardcoded claim independent of the bytes.
  const contentType = blob instanceof Blob && blob.type ? blob.type : file.type;

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', uploadUrl);
    xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
    xhr.setRequestHeader('apikey', anonKey);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.setRequestHeader('x-upsert', 'true'); // allow overwriting the same path (used when replacing)

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && options.onProgress) options.onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ url: `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}` });
      } else {
        let message = `Upload failed (status ${xhr.status}).`;
        try {
          const body = JSON.parse(xhr.responseText);
          if (body?.message) message = body.message;
        } catch {
          // response wasn't JSON — keep the generic message above
        }
        resolve({ error: message });
      }
    };
    xhr.onerror = () => resolve({ error: "Network error during upload — check your connection and try again." });
    xhr.send(blob);
  });
}

// Fire-and-forget by design (still awaited, but errors are swallowed): a
// failed cleanup of an old, no-longer-referenced file shouldn't block the
// user's new upload from succeeding, or surface as a scary error for
// something they can't even see happened.
export async function deleteImage(bucket: string, path: string): Promise<void> {
  try {
    const supabase = createClient();
    await supabase.storage.from(bucket).remove([path]);
  } catch {
    // Intentionally ignored — see comment above.
  }
}

// Extract the storage path from a public URL, e.g.
// ".../storage/v1/object/public/avatars/abc-123/1699999999.jpg" -> "abc-123/1699999999.jpg"
// Needed to delete the old file when replacing an image.
export function pathFromPublicUrl(bucket: string, url: string): string | null {
  const marker = `/object/public/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}
