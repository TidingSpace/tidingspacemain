'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { COLORS, RADIUS, SHADOW } from '@/lib/designTokens';

type Results = { users: any[]; activities: any[]; groups: any[]; posts: any[] };
type FlatItem = { key: string; href: string; type: string; label: string; sub?: string };

export default function AdminGlobalSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Results | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.trim().length < 2) { setResults(null); return; }
    const id = setTimeout(() => {
      fetch(`/api/admin/search?query=${encodeURIComponent(query)}`).then((r) => r.json()).then((data) => {
        setResults(data);
        setActiveIndex(0);
      });
    }, 250);
    return () => clearTimeout(id);
  }, [query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  // One flat, ordered list — this is what keyboard navigation actually
  // moves through, and what Enter opens, regardless of which labeled
  // section an item visually sits in.
  const flatItems: FlatItem[] = useMemo(() => {
    if (!results) return [];
    return [
      ...results.users.map((u) => ({ key: `user-${u.id}`, href: `/admin/users/${u.id}`, type: 'User', label: u.name, sub: `@${u.handle}` })),
      ...results.activities.map((a) => ({ key: `activity-${a.id}`, href: `/admin/activities/${a.id}`, type: 'Activity', label: a.title, sub: a.organizer?.name ? `by ${a.organizer.name}` : a.category })),
      ...results.groups.map((g) => ({ key: `group-${g.id}`, href: `/groups/${g.id}`, type: 'Group', label: g.name, sub: undefined })),
      ...results.posts.map((p) => ({ key: `post-${p.id}`, href: `/feed/${p.id}`, type: 'Post', label: (p.text ?? '').slice(0, 50) || '(no text)', sub: undefined }))
    ];
  }, [results]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || flatItems.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, flatItems.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const item = flatItems[activeIndex]; if (item) window.location.href = item.href; }
    else if (e.key === 'Escape') { setOpen(false); }
  }

  const hasResults = flatItems.length > 0;

  return (
    <div ref={containerRef} style={{ position: 'relative', width: 320 }}>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search users, activities, groups, posts… (ID, email, organizer)"
        style={{ width: '100%', padding: '8px 12px', borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}`, fontSize: 13.5, outline: 'none', boxSizing: 'border-box' }}
      />
      {open && query.trim().length >= 2 && (
        <div style={{ position: 'absolute', top: '110%', left: 0, right: 0, background: '#fff', borderRadius: RADIUS.md, boxShadow: SHADOW.raised, border: `1px solid ${COLORS.border}`, maxHeight: 400, overflowY: 'auto', zIndex: 50 }}>
          {!hasResults && <div style={{ padding: 16, fontSize: 13, color: COLORS.textFaint }}>No matches.</div>}
          {(['User', 'Activity', 'Group', 'Post'] as const).map((type) => {
            const items = flatItems.filter((i) => i.type === type);
            if (items.length === 0) return null;
            return (
              <div key={type} style={{ padding: '8px 0' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textFaint, textTransform: 'uppercase', padding: '4px 14px' }}>{type}s</div>
                {items.map((item) => {
                  const globalIndex = flatItems.findIndex((f) => f.key === item.key);
                  const active = globalIndex === activeIndex;
                  return (
                    <a
                      key={item.key} href={item.href}
                      onMouseEnter={() => setActiveIndex(globalIndex)}
                      style={{ display: 'block', padding: '8px 14px', textDecoration: 'none', color: COLORS.ink, fontSize: 13.5, background: active ? COLORS.violetTint : 'transparent' }}
                    >
                      {item.label} {item.sub && <span style={{ color: COLORS.textFaint }}>{item.sub}</span>}
                    </a>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
