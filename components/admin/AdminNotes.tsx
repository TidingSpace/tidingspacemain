'use client';

import { useEffect, useState } from 'react';
import AdminCard from '@/components/admin/AdminCard';
import EmptyState from '@/components/EmptyState';
import { COLORS, RADIUS } from '@/lib/designTokens';

type Note = { id: string; content: string; created_at: string; updated_at: string; admin: { name: string; handle: string } | null };

// Internal-only notes, reused across User/Activity/Group/Organizer detail
// pages — never rendered anywhere in the public application.
export default function AdminNotes({ targetType, targetId }: { targetType: 'user' | 'activity' | 'group' | 'organizer'; targetId: string }) {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [saving, setSaving] = useState(false);

  function load() {
    fetch(`/api/admin/notes?targetType=${targetType}&targetId=${targetId}`).then((r) => r.json()).then((json) => setNotes(json.notes ?? []));
  }
  useEffect(() => { load(); }, [targetType, targetId]);

  async function addNote() {
    if (!draft.trim()) return;
    setSaving(true);
    const res = await fetch('/api/admin/notes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetType, targetId, content: draft })
    });
    setSaving(false);
    if (!res.ok) { alert("Couldn't save that note — please try again."); return; }
    setDraft('');
    load();
  }

  async function saveEdit(id: string) {
    if (!editDraft.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/admin/notes/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: editDraft })
    });
    setSaving(false);
    if (!res.ok) { alert("Couldn't save that edit — please try again."); return; }
    setEditingId(null);
    load();
  }

  async function deleteNote(id: string) {
    if (!confirm('Delete this note? This cannot be undone.')) return;
    const res = await fetch(`/api/admin/notes/${id}`, { method: 'DELETE' });
    if (!res.ok) { alert("Couldn't delete that note — please try again."); return; }
    load();
  }

  return (
    <AdminCard title="Internal Notes">
      <div style={{ fontSize: 11.5, color: COLORS.textFaint, marginBottom: 10 }}>Visible only to admins — never shown in the public application.</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a note…"
          style={{ flex: 1, padding: 9, borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}`, fontSize: 13, minHeight: 60, resize: 'vertical', fontFamily: 'inherit' }}
        />
        <button
          onClick={addNote}
          disabled={saving || !draft.trim()}
          style={{ padding: '0 16px', borderRadius: RADIUS.sm, border: 'none', background: COLORS.violet, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', alignSelf: 'stretch' }}
        >
          Add
        </button>
      </div>

      {notes === null ? null : notes.length === 0 ? <EmptyState message="No notes yet." /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {notes.map((n) => (
            <div key={n.id} style={{ padding: 10, borderRadius: RADIUS.sm, background: COLORS.surfaceAlt }}>
              {editingId === n.id ? (
                <>
                  <textarea value={editDraft} onChange={(e) => setEditDraft(e.target.value)} style={{ width: '100%', padding: 8, borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}`, fontSize: 13, minHeight: 50, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    <button onClick={() => saveEdit(n.id)} style={{ fontSize: 12, fontWeight: 600, color: COLORS.violet, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Save</button>
                    <button onClick={() => setEditingId(null)} style={{ fontSize: 12, color: COLORS.textFaint, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Cancel</button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 13.5, color: COLORS.ink, whiteSpace: 'pre-wrap' }}>{n.content}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                    <span style={{ fontSize: 11.5, color: COLORS.textFaint }}>
                      {n.admin?.name ?? 'Unknown admin'} · {new Date(n.created_at).toLocaleString()}
                      {n.updated_at !== n.created_at ? ' (edited)' : ''}
                    </span>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={() => { setEditingId(n.id); setEditDraft(n.content); }} style={{ fontSize: 11.5, color: COLORS.textSecondary, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Edit</button>
                      <button onClick={() => deleteNote(n.id)} style={{ fontSize: 11.5, color: COLORS.danger, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Delete</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </AdminCard>
  );
}
