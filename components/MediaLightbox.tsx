'use client';

import { useEffect } from 'react';

// Fullscreen viewer for a single image. Image-only for now — there's no
// video anywhere in the app yet (every upload path is image-MIME-restricted
// at the Storage level) — but the URL is checked against common video
// extensions so a <video> branch can be dropped in later without touching
// any of the call sites that already use this component.
export default function MediaLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden'; // lock background scroll while open
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const isVideo = /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(10,8,20,0.94)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
      }}
    >
      <button
        onClick={onClose}
        aria-label="Close"
        style={{
          position: 'absolute', top: 16, right: 16, width: 40, height: 40, borderRadius: '50%',
          background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', fontSize: 18,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}
      >
        ✕
      </button>

      {isVideo ? (
        <video
          src={url}
          controls
          autoPlay
          onClick={(e) => e.stopPropagation()}
          style={{ maxWidth: '95vw', maxHeight: '90vh', borderRadius: 8 }}
        />
      ) : (
        <img
          src={url}
          alt=""
          onClick={(e) => e.stopPropagation()}
          style={{ maxWidth: '95vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8 }}
        />
      )}
    </div>
  );
}
