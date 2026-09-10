'use client';

import { useEffect, useState } from 'react';
import AdminHeader from '@/components/admin/AdminHeader';
import AdminCard from '@/components/admin/AdminCard';
import ConfirmationDialog from '@/components/admin/ConfirmationDialog';
import CategoryIcon from '@/components/CategoryIcon';
import LoadingState from '@/components/LoadingState';
import { COLORS, RADIUS } from '@/lib/designTokens';

type Category = { key: string; label: string; icon: string; sort_order: number };

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [editing, setEditing] = useState<Category | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function load() {
    fetch('/api/admin/categories').then((r) => r.json()).then((json) => setCategories(json.categories ?? []));
  }
  useEffect(() => { load(); }, []);

  async function move(cat: Category, direction: -1 | 1) {
    if (!categories) return;
    const idx = categories.findIndex((c) => c.key === cat.key);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= categories.length) return;
    const other = categories[swapIdx];

    // Optimistic reorder — swap sort_order values on both.
    const next = [...categories];
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    setCategories(next);

    await Promise.all([
      fetch(`/api/admin/categories/${cat.key}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sort_order: other.sort_order }) }),
      fetch(`/api/admin/categories/${other.key}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sort_order: cat.sort_order }) })
    ]);
  }

  async function saveEdit(key: string, label: string, icon: string, isNew: boolean) {
    setSaving(true);
    const res = isNew
      ? await fetch('/api/admin/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, label, icon }) })
      : await fetch(`/api/admin/categories/${key}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label, icon }) });
    setSaving(false);
    if (!res.ok) { const j = await res.json(); alert(j.error ?? 'Something went wrong.'); return; }
    setEditing(null);
    setCreating(false);
    load();
  }

  async function confirmDelete() {
    if (!deleting) return;
    setSaving(true);
    const res = await fetch(`/api/admin/categories/${deleting.key}`, { method: 'DELETE' });
    setSaving(false);
    if (!res.ok) { const j = await res.json(); setDeleteError(j.error); return; }
    setDeleting(null);
    setDeleteError(null);
    load();
  }

  if (!categories) return <LoadingState />;

  return (
    <>
      <AdminHeader title="Categories" subtitle={`${categories.length} categories`} actions={
        <button onClick={() => setCreating(true)} style={primaryBtnStyle}>+ New Category</button>
      } />
      <div style={{ padding: 28 }}>
        <AdminCard>
          {categories.map((cat, i) => (
            <div key={cat.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: i < categories.length - 1 ? `1px solid ${COLORS.borderLight}` : 'none' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <button onClick={() => move(cat, -1)} disabled={i === 0} style={reorderBtnStyle(i === 0)}>▲</button>
                <button onClick={() => move(cat, 1)} disabled={i === categories.length - 1} style={reorderBtnStyle(i === categories.length - 1)}>▼</button>
              </div>
              <CategoryIcon src={cat.icon} size={22} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: COLORS.ink }}>{cat.label}</div>
                <div style={{ fontSize: 12, color: COLORS.textFaint }}>{cat.key}</div>
              </div>
              <button onClick={() => setEditing(cat)} style={miniBtnStyle}>Edit</button>
              <button onClick={() => setDeleting(cat)} style={{ ...miniBtnStyle, color: COLORS.danger, borderColor: COLORS.danger }}>Delete</button>
            </div>
          ))}
        </AdminCard>
      </div>

      {(editing || creating) && (
        <CategoryEditDialog
          initial={editing}
          saving={saving}
          onSave={(key, label, icon) => saveEdit(key, label, icon, !editing)}
          onCancel={() => { setEditing(null); setCreating(false); }}
        />
      )}

      <ConfirmationDialog
        open={deleting !== null}
        title={`Delete "${deleting?.label}"?`}
        message={deleteError ?? 'This cannot be undone. Categories still used by any activity cannot be deleted.'}
        confirmLabel="Delete"
        loading={saving}
        onConfirm={confirmDelete}
        onCancel={() => { setDeleting(null); setDeleteError(null); }}
      />
    </>
  );
}

function CategoryEditDialog({ initial, saving, onSave, onCancel }: { initial: Category | null; saving: boolean; onSave: (key: string, label: string, icon: string) => void; onCancel: () => void }) {
  const [key, setKey] = useState(initial?.key ?? '');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? '');

  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(20,10,40,0.35)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: RADIUS.lg, padding: 24, width: 360 }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>{initial ? 'Edit Category' : 'New Category'}</div>
        {!initial && (
          <>
            <FieldLabel>Key (used internally, cannot be changed later)</FieldLabel>
            <input value={key} onChange={(e) => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} placeholder="e.g. surfing" style={inputStyle} />
          </>
        )}
        <FieldLabel>Label</FieldLabel>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Surfing" style={inputStyle} />
        <FieldLabel>Icon path (e.g. /icons/categories/surfing.svg)</FieldLabel>
        <input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="/icons/categories/…" style={inputStyle} />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
          <button onClick={onCancel} style={{ padding: '9px 16px', borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}`, background: '#fff', fontWeight: 600, fontSize: 13.5, cursor: 'pointer' }}>Cancel</button>
          <button onClick={() => onSave(key, label, icon)} disabled={saving || !key || !label || !icon} style={primaryBtnStyle}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 6, marginTop: 12 }}>{children}</label>;
}

const inputStyle: React.CSSProperties = { width: '100%', padding: 9, borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}`, fontSize: 13.5, boxSizing: 'border-box' };
const primaryBtnStyle: React.CSSProperties = { padding: '9px 16px', borderRadius: RADIUS.sm, border: 'none', background: COLORS.violet, color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' };
const miniBtnStyle: React.CSSProperties = { padding: '6px 12px', borderRadius: 8, border: `1px solid ${COLORS.border}`, background: '#fff', color: COLORS.ink, fontSize: 12, fontWeight: 600, cursor: 'pointer' };
function reorderBtnStyle(disabled: boolean): React.CSSProperties {
  return { border: 'none', background: 'none', color: disabled ? COLORS.borderLight : COLORS.textFaint, cursor: disabled ? 'default' : 'pointer', fontSize: 9, padding: 0, lineHeight: 1 };
}
