'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import Avatar from '@/components/Avatar';
import LoadingState from '@/components/LoadingState';
import ActivityPostCard from '@/components/ActivityPostCard';
import { useImageUpload } from '@/hooks/useImageUpload';
import { uploadImage } from '@/lib/imageUpload';
import { COLORS, RADIUS, SHADOW } from '@/lib/designTokens';

const CHAR_LIMIT = 2000;

type MyActivity = { id: string; title: string; category: string };
type AttachedActivity = {
  id: string; title: string; category: string; cover_image_url: string | null;
  starts_at: string; address: string | null;
};
type Photo = {
  id: string;              // local id, for React keys and removal
  previewUrl: string;      // local blob preview, shown instantly
  uploadedUrl: string | null;
  uploading: boolean;
  progress: number;
  error: string | null;
};

export default function CreatePostPage() {
  const router = useRouter();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const photoUpload = useImageUpload('post-images');

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<{ name: string; avatar_color: string; avatar_url: string | null } | null>(null);
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [attachedFileNames, setAttachedFileNames] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<'public' | 'friends'>('public');
  const [publishing, setPublishing] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [myActivities, setMyActivities] = useState<MyActivity[]>([]);
  const [attachedActivity, setAttachedActivity] = useState<AttachedActivity | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/login'); return; }
      setUserId(data.user.id);
      fetch(`/api/profiles/${data.user.id}`)
        .then((r) => r.json())
        .then((json) => {
          if (json.profile) setProfile(json.profile);
          setLoading(false);
        });
    });
  }, [supabase, router]);

  // Warn before leaving if there's unpublished content
  useEffect(() => {
    const hasUnsavedChanges = text.trim().length > 0 || photos.length > 0 || attachedFileNames.length > 0 || !!attachedActivity;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [text, photos, attachedFileNames, attachedActivity]);

  function handleBack() {
    const hasUnsavedChanges = text.trim().length > 0 || photos.length > 0 || attachedFileNames.length > 0 || !!attachedActivity;
    if (hasUnsavedChanges && !confirm('Discard this post? Your changes will be lost.')) return;
    router.push('/feed');
  }

  // Photos upload immediately on selection — by the time Publish is pressed,
  // the real URLs already exist, rather than uploading everything at once at
  // publish time (avoids one giant blocking upload, and means a failed
  // upload is caught and retryable per-photo, not all-or-nothing).
  async function handleAddPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!userId) return;

    const newPhotos: Photo[] = files.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      previewUrl: URL.createObjectURL(file),
      uploadedUrl: null,
      uploading: true,
      progress: 0,
      error: null
    }));
    setPhotos((prev) => [...prev, ...newPhotos]);

    files.forEach((file, i) => {
      const photoId = newPhotos[i].id;
      const path = `${userId}/${Date.now()}-${i}.jpg`;
      uploadOnePhoto(file, path, photoId);
    });
  }

  async function uploadOnePhoto(file: File, path: string, photoId: string) {
    const result = await uploadImage('post-images', path, file, {
      maxDimension: 1600,
      onProgress: (fraction) => {
        setPhotos((prev) => prev.map((p) => (p.id === photoId ? { ...p, progress: fraction } : p)));
      }
    });
    setPhotos((prev) => prev.map((p) => {
      if (p.id !== photoId) return p;
      if ('url' in result) return { ...p, uploadedUrl: result.url, uploading: false, progress: 1 };
      return { ...p, uploading: false, error: result.error };
    }));
  }

  function removePhoto(photoId: string) {
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === photoId);
      if (target?.uploadedUrl) photoUpload.remove(target.uploadedUrl); // clean up the orphaned Storage file
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== photoId);
    });
  }

  function handleAddFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    setAttachedFileNames((prev) => [...prev, ...files.map((f) => f.name)]);
    e.target.value = '';
  }

  async function openActivityPicker() {
    setPickerOpen(true);
    if (myActivities.length === 0) {
      const json = await fetch('/api/communities').then((r) => r.json());
      setMyActivities((json.communities || []).map((c: any) => c.activity));
    }
  }

  async function selectActivity(activityId: string) {
    const json = await fetch(`/api/activities/${activityId}`).then((r) => r.json());
    if (json.activity) setAttachedActivity(json.activity);
    setPickerOpen(false);
  }

  const anyPhotoStillUploading = photos.some((p) => p.uploading);
  const canPublish = (text.trim().length > 0 || photos.some((p) => p.uploadedUrl)) && !anyPhotoStillUploading;

  async function handlePublish() {
    if (!canPublish || publishing) return;

    if (attachedFileNames.length > 0) {
      const proceed = confirm(
        `File attachments aren't connected yet (backend not implemented) — your post will publish without the ${attachedFileNames.length} file${attachedFileNames.length > 1 ? 's' : ''} you attached. Continue?`
      );
      if (!proceed) return;
    }

    const failedPhotos = photos.filter((p) => p.error);
    if (failedPhotos.length > 0) {
      const proceed = confirm(`${failedPhotos.length} photo(s) failed to upload and won't be included. Continue publishing anyway?`);
      if (!proceed) return;
    }

    setPublishing(true);
    const res = await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'text',
        text: text.trim() || null,
        image_urls: photos.map((p) => p.uploadedUrl).filter(Boolean),
        activity_id: attachedActivity?.id ?? null
      })
    });
    const json = await res.json();
    setPublishing(false);

    if (json.error) {
      alert(`Couldn't publish: ${json.error}`);
      return;
    }
    router.push('/feed');
  }

  if (loading || !profile) return <LoadingState />;

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: `1px solid ${COLORS.border}` }}>
        <button onClick={handleBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.ink, display: 'flex' }} aria-label="Back">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <div style={{ textAlign: 'center' }}>
          <b style={{ fontSize: 17, color: COLORS.ink, display: 'block' }}>Create Post</b>
          <span style={{ fontSize: 11.5, color: COLORS.textFaint, display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: COLORS.textFaint, display: 'inline-block' }} />
            Not published yet
          </span>
        </div>
        <button
          onClick={handlePublish}
          disabled={!canPublish || publishing}
          style={{
            padding: '9px 20px', borderRadius: RADIUS.pill, border: 'none', fontWeight: 700, fontSize: 13.5,
            cursor: canPublish ? 'pointer' : 'default',
            background: canPublish ? COLORS.violet : COLORS.disabledBg,
            color: '#fff'
          }}
        >
          {publishing ? 'Publishing…' : 'Publish'}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px 120px 20px' }}>
        {/* Identity + visibility indicator */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <Avatar name={profile.name} color={profile.avatar_color} avatarUrl={profile.avatar_url} size="md" />
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.ink }}>{profile.name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: COLORS.violet, fontWeight: 600 }}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
              {visibility === 'public' ? 'Public' : 'Friends'}
            </div>
          </div>
        </div>

        {/* Text area */}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, CHAR_LIMIT))}
          placeholder="What's happening?"
          rows={4}
          style={{ width: '100%', border: 'none', outline: 'none', resize: 'none', fontSize: 17, fontFamily: 'inherit', color: COLORS.ink, background: 'transparent' }}
        />
        <div style={{ textAlign: 'right', fontSize: 12, color: COLORS.textFaint, marginBottom: 16 }}>{text.length} / {CHAR_LIMIT}</div>

        {/* Action row */}
        <div style={{ display: 'flex', border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.md, marginBottom: 20, overflow: 'hidden' }}>
          <ActionButton icon={photoIcon} label="Add Photos" onClick={() => fileInputRef.current?.click()} />
          <div style={{ width: 1, background: COLORS.border }} />
          <ActionButton icon={fileIcon} label="Add Files" onClick={() => attachmentInputRef.current?.click()} />
          <div style={{ width: 1, background: COLORS.border }} />
          <ActionButton icon={calendarIcon} label="Attach Activity" onClick={openActivityPicker} />
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={handleAddPhotos} />
        <input ref={attachmentInputRef} type="file" multiple hidden onChange={handleAddFiles} />

        {attachedFileNames.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <SectionLabel>Files</SectionLabel>
            {attachedFileNames.map((name, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.sm, marginBottom: 6, fontSize: 13 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                <button onClick={() => setAttachedFileNames((prev) => prev.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.textFaint }}>✕</button>
              </div>
            ))}
          </div>
        )}

        {/* Photos grid — real upload, real progress, real per-photo errors */}
        {photos.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <SectionLabel>Photos</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {photos.map((p) => (
                <div key={p.id} style={{ position: 'relative', aspectRatio: '1/1', borderRadius: RADIUS.sm, overflow: 'hidden', background: COLORS.surfaceAlt }}>
                  <img src={p.previewUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  {p.uploading && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(28,24,48,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700 }}>
                      {Math.round(p.progress * 100)}%
                    </div>
                  )}
                  {p.error && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(209,67,67,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10.5, fontWeight: 600, padding: 6, textAlign: 'center' }}>
                      Failed
                    </div>
                  )}
                  <button
                    onClick={() => removePhoto(p.id)}
                    aria-label="Remove photo"
                    style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: '50%', background: 'rgba(255,255,255,0.9)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{ aspectRatio: '1/1', borderRadius: RADIUS.sm, border: `1.5px dashed ${COLORS.border}`, background: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer', color: COLORS.textSecondary, fontSize: 11.5, fontWeight: 600 }}
              >
                <span style={{ fontSize: 20 }}>+</span>
                Add More
              </button>
            </div>
          </div>
        )}

        {/* Attached activity */}
        {attachedActivity && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <SectionLabel>Attached Activity <span style={{ fontWeight: 400, textTransform: 'none', color: COLORS.textFaint }}>(optional)</span></SectionLabel>
              <button onClick={() => setAttachedActivity(null)} style={{ background: 'none', border: 'none', color: COLORS.danger, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>✕ Remove</button>
            </div>
            <ActivityPostCard activity={attachedActivity} extras={null} />
          </div>
        )}

        {/* Visibility */}
        <SectionLabel>Visibility</SectionLabel>
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <VisibilityCard
            icon={globeIcon}
            title="Public"
            subtitle="Anyone can see this post"
            active={visibility === 'public'}
            onClick={() => setVisibility('public')}
          />
          <VisibilityCard
            icon={peopleIcon}
            title="Friends"
            subtitle="Only your friends can see"
            active={visibility === 'friends'}
            onClick={() => alert("Friends-only visibility isn't implemented yet — this needs a dedicated friendship system, separate from following. Staying on Public for now.")}
          />
        </div>
      </div>

      {/* Sticky publish bar */}
      <div style={{ position: 'sticky', bottom: 0, background: '#fff', borderTop: `1px solid ${COLORS.border}`, padding: `14px 20px calc(14px + env(safe-area-inset-bottom, 0px)) 20px`, boxShadow: SHADOW.sheet }}>
        <button
          onClick={handlePublish}
          disabled={!canPublish || publishing}
          style={{
            width: '100%', padding: 15, borderRadius: RADIUS.md, border: 'none', fontWeight: 700, fontSize: 15,
            cursor: canPublish ? 'pointer' : 'default',
            background: canPublish ? COLORS.violet : COLORS.disabledBg,
            color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
          }}
        >
          {publishing ? 'Publishing…' : anyPhotoStillUploading ? 'Uploading photos…' : 'Publish Post'}
          {!anyPhotoStillUploading && (
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
          )}
        </button>
        <p style={{ display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'center', fontSize: 11.5, color: COLORS.textFaint, marginTop: 10, marginBottom: 0 }}>
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          Your post will be visible based on the selected visibility.
        </p>
      </div>

      {/* Activity picker sheet */}
      {pickerOpen && (
        <div onClick={() => setPickerOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(20,10,40,0.4)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: '24px 24px 0 0', width: '100%', maxWidth: 480, margin: '0 auto', padding: '20px 20px 28px 20px', maxHeight: '70%', overflowY: 'auto' }}>
            <div style={{ width: 36, height: 4, background: COLORS.border, borderRadius: 10, margin: '0 auto 18px auto' }} />
            <b style={{ fontSize: 16, display: 'block', marginBottom: 14 }}>Attach an activity</b>
            {myActivities.length === 0 && (
              <p style={{ fontSize: 13, color: COLORS.textFaint }}>You're not organizing or attending any activities yet.</p>
            )}
            {myActivities.map((a) => (
              <button
                key={a.id}
                onClick={() => selectActivity(a.id)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 4px', border: 'none', borderBottom: `1px solid ${COLORS.border}`, background: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: COLORS.ink }}
              >
                {a.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ActionButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '13px 8px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: COLORS.violet }}>
      {icon}
      {label}
    </button>
  );
}

function VisibilityCard({ icon, title, subtitle, active, onClick }: { icon: React.ReactNode; title: string; subtitle: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, textAlign: 'left', padding: 14, borderRadius: RADIUS.md, cursor: 'pointer',
        border: active ? `1.5px solid ${COLORS.violet}` : `1px solid ${COLORS.border}`,
        background: active ? COLORS.violetTint : '#fff'
      }}
    >
      <div style={{ color: active ? COLORS.violet : COLORS.textSecondary, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: active ? COLORS.violetDeep : COLORS.ink }}>{title}</div>
      <div style={{ fontSize: 11.5, color: COLORS.textFaint, marginTop: 2 }}>{subtitle}</div>
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.ink, textTransform: 'uppercase', letterSpacing: '.03em' }}>{children}</div>;
}

const photoIcon = <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>;
const fileIcon = <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>;
const calendarIcon = <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>;
const globeIcon = <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>;
const peopleIcon = <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
