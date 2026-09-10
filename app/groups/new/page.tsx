'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import PageHeader from '@/components/PageHeader';
import LoadingState from '@/components/LoadingState';
import { COLORS, RADIUS } from '@/lib/designTokens';

export default function NewGroupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.push('/login');
      else setCheckingAuth(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('Give your group a name.');
    setSubmitting(true);
    setError(null);

    const res = await fetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), description: description.trim() || null, is_public: isPublic })
    });
    const json = await res.json();
    setSubmitting(false);

    if (json.error) setError(json.error);
    else router.push(`/groups/${json.group.id}`);
  }

  if (checkingAuth) return <LoadingState />;

  return (
    <div style={{ maxWidth: 420, margin: '0 auto' }}>
      <PageHeader title="Create a Group" backHref="/groups" large={false} />

      <form onSubmit={handleSubmit} style={{ padding: '4px 20px 24px 20px' }}>
        <FieldLabel required>Group Name</FieldLabel>
        <div style={{ position: 'relative', marginBottom: 18 }}>
          <input value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} placeholder="Weekend Hikers" style={inputStyle} />
          <span style={counterStyle}>{name.length}/60</span>
        </div>

        <FieldLabel required={false}>Description</FieldLabel>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="What's this group about?"
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', marginBottom: 18 }}
        />

        <FieldLabel required>Visibility</FieldLabel>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <button type="button" onClick={() => setIsPublic(true)} style={{ ...toggleStyle, ...(isPublic ? toggleActiveStyle : {}) }}>
            Public
          </button>
          <button type="button" onClick={() => setIsPublic(false)} style={{ ...toggleStyle, ...(!isPublic ? toggleActiveStyle : {}) }}>
            Private
          </button>
        </div>
        <p style={{ fontSize: 12, color: COLORS.textFaint, marginTop: 0, marginBottom: 22 }}>
          {isPublic ? 'Anyone can find and join this group.' : "Invite only — you'll need to add members yourself."}
        </p>

        {error && <p style={{ color: COLORS.danger, fontSize: 13, marginBottom: 12 }}>{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          style={{ width: '100%', padding: 15, borderRadius: RADIUS.md, border: 'none', background: COLORS.violet, color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', boxShadow: '0 8px 20px rgba(122,90,248,0.35)' }}
        >
          {submitting ? 'Creating…' : 'Create Group'}
        </button>
      </form>
    </div>
  );
}

function FieldLabel({ children, required }: { children: React.ReactNode; required: boolean }) {
  return (
    <label style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: COLORS.ink, marginBottom: 8 }}>
      {children} {required && <span style={{ color: COLORS.danger }}>*</span>}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: 12, borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}`,
  fontSize: 14, color: COLORS.ink, boxSizing: 'border-box'
};
const counterStyle: React.CSSProperties = {
  position: 'absolute', bottom: 8, right: 12, fontSize: 11, color: COLORS.textFaint, pointerEvents: 'none'
};
const toggleStyle: React.CSSProperties = {
  flex: 1, padding: '9px 0', borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}`,
  background: '#fff', color: COLORS.textSecondary, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textAlign: 'center'
};
const toggleActiveStyle: React.CSSProperties = { background: COLORS.violet, borderColor: COLORS.violet, color: '#fff' };
