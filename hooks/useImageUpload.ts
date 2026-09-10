import { useState } from 'react';
import { uploadImage, deleteImage, pathFromPublicUrl } from '@/lib/imageUpload';

export function useImageUpload(bucket: string) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File, path: string, maxDimension?: number): Promise<string | null> {
    setUploading(true);
    setProgress(0);
    setError(null);
    const result = await uploadImage(bucket, path, file, { maxDimension, onProgress: setProgress });
    setUploading(false);
    if ('error' in result) {
      setError(result.error);
      return null;
    }
    return result.url;
  }

  // Upload the new file, then clean up the old one it's replacing (if any) —
  // this is the "don't leave orphaned files in Storage" behavior for the
  // explicit replace case.
  async function replace(file: File, newPath: string, oldUrl: string | null, maxDimension?: number): Promise<string | null> {
    const url = await upload(file, newPath, maxDimension);
    if (url && oldUrl) {
      const oldPath = pathFromPublicUrl(bucket, oldUrl);
      if (oldPath && oldPath !== newPath) deleteImage(bucket, oldPath);
    }
    return url;
  }

  async function remove(url: string): Promise<void> {
    const path = pathFromPublicUrl(bucket, url);
    if (path) await deleteImage(bucket, path);
  }

  return { upload, replace, remove, uploading, progress, error, setError };
}
