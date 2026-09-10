'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { useImageUpload } from '@/hooks/useImageUpload';
import { COLORS, RADIUS } from '@/lib/designTokens';
import { DEFAULT_ACTIVITY_DURATION_MS } from '@/lib/activityTimeState';
import TimeSelect from '@/components/TimeSelect';

// Same reasoning as ActivityMap in Explore — keep Mapbox GL out of the
// initial bundle for this page too.
const LocationPicker = dynamic(() => import('@/components/LocationPicker'), {
  ssr: false,
  loading: () => <div style={{ height: 220, borderRadius: 12, background: '#F7F6FB', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8E8E93', fontSize: 13 }}>Loading map…</div>
});

export type ActivityFormValues = {
  category: string;
  title: string;
  description: string;
  date: string;
  time: string;
  endDate: string;
  endTime: string;
  repeat: 'none' | 'daily' | 'weekly' | 'monthly';
  isFree: boolean;
  price: string;
  capacity: number;
  address: string;
  coords: { lng: number; lat: number } | null;
  coverImageUrl: string | null;
};

// Shared by Create Activity and Edit Activity — the two screens need
// near-identical fields, validation, map picker, and image upload; only the
// header, the Repeat field's presence (editing a single activity shouldn't
// retrigger recurrence generation for a whole new series), the submit
// label, and what actually happens on submit differ between them.
export default function ActivityForm({
  userId,
  initialValues,
  showRepeat,
  submitLabel,
  submittingLabel,
  onSubmit
}: {
  userId: string;
  initialValues?: Partial<ActivityFormValues>;
  showRepeat: boolean;
  submitLabel: string;
  submittingLabel: string;
  onSubmit: (values: ActivityFormValues) => Promise<{ error?: string } | void>;
}) {
  const [categories, setCategories] = useState<{ key: string; label: string; icon: string }[]>([]);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  const [category, setCategory] = useState(initialValues?.category ?? '');
  const [title, setTitle] = useState(initialValues?.title ?? '');
  const [description, setDescription] = useState(initialValues?.description ?? '');
  const [date, setDate] = useState(initialValues?.date ?? '');
  const [time, setTime] = useState(initialValues?.time ?? '');
  // Defaults to visible for new activities (no initialValues) — an end time
  // is what makes the "Live" state actually end and transition to
  // "Finished" rather than staying Live forever, so it's shown by default
  // rather than hidden behind an easy-to-miss checkbox. Editing an existing
  // activity still respects whatever it currently has either way.
  const [hasEndTime, setHasEndTime] = useState(initialValues ? !!(initialValues.endDate || initialValues.endTime) : true);
  const [endDate, setEndDate] = useState(initialValues?.endDate ?? '');
  const [endTime, setEndTime] = useState(initialValues?.endTime ?? '');
  // Tracks whether the organizer has manually set/changed the end time
  // themselves — while false, Start changes keep auto-filling End to
  // Start + 2h; the moment they touch End directly, this flips permanently
  // (for this session) so their choice is never silently overwritten.
  // Starts true when editing an existing activity — its current end
  // setting (even if blank) is a deliberate, already-made choice, not a
  // blank slate to auto-fill the moment the form loads.
  const endTouchedRef = useRef(!!initialValues);
  const [repeat, setRepeat] = useState<'none' | 'daily' | 'weekly' | 'monthly'>(initialValues?.repeat ?? 'none');
  const [isFree, setIsFree] = useState(initialValues?.isFree ?? true);
  const [price, setPrice] = useState(initialValues?.price ?? '10');
  const [capacity, setCapacity] = useState(initialValues?.capacity ?? 15);
  const [address, setAddress] = useState(initialValues?.address ?? '');
  const [coords, setCoords] = useState<{ lng: number; lat: number } | null>(initialValues?.coords ?? null);
  const [inviteNearby, setInviteNearby] = useState(true);
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(initialValues?.coverImageUrl ?? null);
  const coverUpload = useImageUpload('activity-covers');
  const coverInputRef = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-fill End to Start + 2h whenever Start changes, exactly like a
  // modern calendar app — but only until the organizer touches End
  // themselves, at which point their own choice is never overwritten again.
  // Uses the same DEFAULT_ACTIVITY_DURATION_MS the rest of the app computes
  // an activity's effective end time from, so what's shown here as a
  // suggestion matches what the system would silently assume anyway if
  // this were left blank — the prefill and the fallback are the same number.
  useEffect(() => {
    if (endTouchedRef.current) return;
    if (!date || !time) return;
    const start = new Date(`${date}T${time}`);
    if (isNaN(start.getTime())) return;
    const end = new Date(start.getTime() + DEFAULT_ACTIVITY_DURATION_MS);
    const pad = (n: number) => String(n).padStart(2, '0');
    setEndDate(`${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`);
    setEndTime(`${pad(end.getHours())}:${pad(end.getMinutes())}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, time]);

  useEffect(() => {
    fetch('/api/categories')
      .then((r) => r.json())
      .then((json) => {
        if (json.error) setError(`Couldn't load categories: ${json.error}`);
        else if (!json.categories || json.categories.length === 0) setError('No categories found in the database — check that schema.sql ran successfully.');
        else {
          setCategories(json.categories);
          if (!initialValues?.category) setCategory(json.categories[0].key);
        }
        setCategoriesLoaded(true);
      })
      .catch(() => { setError("Couldn't reach the server to load categories."); setCategoriesLoaded(true); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCoverImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const path = `${userId}/cover-${Date.now()}.jpg`;
    const url = await coverUpload.replace(file, path, coverImageUrl, 1600);
    if (url) setCoverImageUrl(url);
  }

  function handleRemoveCoverImage() {
    if (coverImageUrl) coverUpload.remove(coverImageUrl);
    setCoverImageUrl(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!category) return setError('Categories are still loading — wait a second and try again.');
    if (!title.trim()) return setError('Give your activity a title.');
    if (!date || !time) return setError('Pick a date and time.');
    if (!coords) return setError('Set a location on the map.');
    if (hasEndTime) {
      if (!endDate || !endTime) return setError('Pick an end date and time, or turn off "Add an end time."');
      if (new Date(`${endDate}T${endTime}`).getTime() <= new Date(`${date}T${time}`).getTime()) {
        return setError('The end time needs to be after the start time.');
      }
    }

    setSubmitting(true);
    const result = await onSubmit({
      category, title, description, date, time,
      endDate: hasEndTime ? endDate : '', endTime: hasEndTime ? endTime : '',
      repeat, isFree, price, capacity, address, coords, coverImageUrl
    });
    setSubmitting(false);
    if (result?.error) setError(result.error);
  }

  return (
    <form onSubmit={handleSubmit} style={{ padding: '0 20px' }}>

      {/* Cover image — real upload now; scoped to a single cover image per
          the product decision (not the full multi-photo gallery activities
          can also have via photo_urls, which remains a separate, unwired feature) */}
      <FieldLabel required={false}>Cover Photo</FieldLabel>
      <p style={{ fontSize: 12.5, color: COLORS.textFaint, marginTop: -8, marginBottom: 10 }}>Show what your activity is all about.</p>
      {coverImageUrl ? (
        <div style={{ position: 'relative', width: 140, height: 140, borderRadius: RADIUS.md, overflow: 'hidden', marginBottom: 8 }}>
          <Image src={coverImageUrl} alt="" width={140} height={140} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          {coverUpload.uploading && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(28,24,48,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 700 }}>
              {Math.round(coverUpload.progress * 100)}%
            </div>
          )}
          <button
            type="button"
            onClick={handleRemoveCoverImage}
            aria-label="Remove cover photo"
            style={{ position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: '50%', background: 'rgba(255,255,255,0.9)', border: 'none', cursor: 'pointer', fontSize: 12 }}
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => coverInputRef.current?.click()}
          disabled={coverUpload.uploading}
          style={{
            width: 90, height: 90, borderRadius: RADIUS.md, border: `1.5px dashed ${COLORS.border}`,
            background: 'none', color: COLORS.violet, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 8
          }}
        >
          {coverUpload.uploading ? (
            `${Math.round(coverUpload.progress * 100)}%`
          ) : (
            <>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke={COLORS.violet} strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Add Photo
            </>
          )}
        </button>
      )}
      <input ref={coverInputRef} type="file" accept="image/*" hidden onChange={handleCoverImageChange} />
      {coverUpload.error && <p style={{ color: COLORS.danger, fontSize: 12, marginBottom: 8 }}>{coverUpload.error}</p>}
      <div style={{ marginBottom: 14 }} />

      {/* Title */}
      <FieldLabel required>Activity Title</FieldLabel>
      <div style={{ position: 'relative', marginBottom: 18 }}>
        <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 60))} placeholder="e.g. Sunset Yoga in the Park" style={inputStyle} />
        <span style={counterStyle}>{title.length}/60</span>
      </div>

      {/* Description */}
      <FieldLabel required>Description</FieldLabel>
      <div style={{ position: 'relative', marginBottom: 18 }}>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, 500))}
          placeholder="Tell people more about your activity..."
          rows={3}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', paddingBottom: 22 }}
        />
        <span style={counterStyle}>{description.length}/500</span>
      </div>

      {/* Category — single real selector; see note below on why there's no separate icon dropdown */}
      <FieldLabel required>Category</FieldLabel>
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        style={{ ...inputStyle, marginBottom: 18, appearance: 'none', cursor: 'pointer' }}
      >
        {categories.map((c) => (
          <option key={c.key} value={c.key}>{c.label}</option>
        ))}
      </select>

      {/* Date & Time */}
      <FieldLabel required>Date &amp; Time</FieldLabel>
      <div style={{ display: 'flex', gap: 10, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.sm, padding: 12, marginBottom: 14, alignItems: 'center' }}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={dateTimeInputStyle} />
        <TimeSelect value={time} onChange={setTime} />
      </div>

      {/* End time — optional (ends_at is nullable in the schema; not every
          activity needs one). Once set, this is what drives the "Ending
          Soon" / "Finished" states and the "LIVE" indicator that shows for
          the whole stretch between start and end. */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: hasEndTime ? 10 : 18, cursor: 'pointer' }}>
        <input type="checkbox" checked={hasEndTime} onChange={(e) => setHasEndTime(e.target.checked)} style={{ width: 16, height: 16, accentColor: COLORS.violet, cursor: 'pointer' }} />
        <span style={{ fontSize: 13.5, fontWeight: 600, color: COLORS.ink }}>Add an end time</span>
      </label>
      {hasEndTime && (
        <div style={{ display: 'flex', gap: 10, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.sm, padding: 12, marginBottom: 18, alignItems: 'center' }}>
          <input type="date" value={endDate} onChange={(e) => { endTouchedRef.current = true; setEndDate(e.target.value); }} style={dateTimeInputStyle} />
          <TimeSelect value={endTime} onChange={(v) => { endTouchedRef.current = true; setEndTime(v); }} />
        </div>
      )}

      {/* Repeat — create only. Editing one activity shouldn't retrigger
          generating a whole new recurring series. */}
      {showRepeat && (
        <>
          <FieldLabel required={false}>Repeat</FieldLabel>
          <select value={repeat} onChange={(e) => setRepeat(e.target.value as typeof repeat)} style={{ ...inputStyle, marginBottom: 18, appearance: 'none', cursor: 'pointer' }}>
            <option value="none">Does not repeat</option>
            <option value="daily">Every day</option>
            <option value="weekly">Every week</option>
            <option value="monthly">Every month</option>
          </select>
          {repeat !== 'none' && (
            <p style={{ fontSize: 12, color: COLORS.textFaint, marginTop: -12, marginBottom: 18 }}>
              Creates occurrences {repeat === 'daily' ? 'daily' : repeat === 'weekly' ? 'weekly' : 'monthly'} for the next 6 months. Each one can be joined separately.
            </p>
          )}
        </>
      )}

      {/* Location */}
      <FieldLabel required>Location</FieldLabel>
      <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.md, padding: 12, marginBottom: 18 }}>
        <LocationPicker onChange={(lng, lat) => setCoords({ lng, lat })} center={coords ? [coords.lng, coords.lat] : undefined} />
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Address or meeting point (shown to confirmed attendees)"
          style={{ ...bareInputStyle, width: '100%', marginTop: 10, padding: '8px 0 0 0', borderTop: `1px solid ${COLORS.border}` }}
        />
      </div>

      {/* Spots / Price / Visibility */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <div style={{ flex: 1 }}>
          <FieldLabel required>Spots</FieldLabel>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.sm, padding: '8px 10px' }}>
            <button type="button" onClick={() => setCapacity((c) => Math.max(2, c - 1))} style={stepperBtnStyle}>−</button>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{capacity}</span>
            <button type="button" onClick={() => setCapacity((c) => c + 1)} style={stepperBtnStyle}>+</button>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <FieldLabel required>Price</FieldLabel>
          <div style={{ display: 'flex', gap: 4 }}>
            <button type="button" onClick={() => setIsFree(true)} style={{ ...miniToggleStyle, ...(isFree ? miniToggleActiveStyle : {}) }}>Free</button>
            <button type="button" onClick={() => setIsFree(false)} style={{ ...miniToggleStyle, ...(!isFree ? miniToggleActiveStyle : {}) }}>Paid</button>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <FieldLabel required>Visibility</FieldLabel>
          <div style={{ display: 'flex', gap: 4 }}>
            <button type="button" style={{ ...miniToggleStyle, ...miniToggleActiveStyle }}>Public</button>
            <button
              type="button"
              onClick={() => alert('Private activities are a planned post-MVP feature — they need their own invitation and permission system, not just a toggle. For now, every activity is public.')}
              style={{ ...miniToggleStyle, opacity: 0.5, cursor: 'pointer' }}
            >
              Private
            </button>
          </div>
        </div>
      </div>
      {!isFree && (
        <div style={{ marginTop: -10, marginBottom: 18 }}>
          <input type="number" min="0" step="0.5" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="$ amount" style={inputStyle} />
          <p style={{ fontSize: 11.5, color: COLORS.textMuted, marginTop: 6 }}>
            Shown to attendees as info only — they pay you directly (cash, card, etc.). Tiding Space doesn't process payments.
          </p>
        </div>
      )}

      {/* Invite Nearby People — stub, needs the notifications system that doesn't exist yet */}
      <ToggleRow
        icon={<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={COLORS.violet} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>}
        title="Invite Nearby People"
        subtitle="Let people near this location know about your activity."
        active={inviteNearby}
        onClick={() => alert("This needs a real notifications system, which doesn't exist yet — the toggle is visual for now and won't actually notify anyone.")}
      />

      {/* Additional Settings — stub, no schema for this yet */}
      <div
        onClick={() => alert('Additional settings (requirements, items to bring) — coming soon.')}
        style={{ display: 'flex', alignItems: 'center', gap: 12, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.md, padding: 14, marginBottom: 24, cursor: 'pointer' }}
      >
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: COLORS.violetTint, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke={COLORS.violet} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink }}>Additional Settings</div>
          <div style={{ fontSize: 12, color: COLORS.textFaint }}>Add requirements, bring items, or any other details.</div>
        </div>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke={COLORS.textFaint} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
      </div>

      {error && <p style={{ color: '#D14343', fontSize: 13, marginBottom: 14 }}>{error}</p>}

      <button type="submit" disabled={submitting || !categoriesLoaded} style={submitBtnStyle}>
        {submitting ? submittingLabel : !categoriesLoaded ? 'Loading…' : submitLabel}
      </button>
    </form>
  );
}

function FieldLabel({ children, required }: { children: React.ReactNode; required: boolean }) {
  return (
    <label style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: COLORS.ink, marginBottom: 8 }}>
      {children} {required && <span style={{ color: '#D14343' }}>*</span>}
    </label>
  );
}

function ToggleRow({ icon, title, subtitle, active, onClick }: { icon: React.ReactNode; title: string; subtitle: string; active: boolean; onClick: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.md, padding: 14, marginBottom: 14 }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', background: COLORS.violetTint, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink }}>{title}</div>
        <div style={{ fontSize: 12, color: COLORS.textFaint }}>{subtitle}</div>
      </div>
      <button
        type="button"
        onClick={onClick}
        style={{
          width: 42, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative',
          background: active ? COLORS.violet : COLORS.border, flexShrink: 0
        }}
      >
        <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: active ? 21 : 3, transition: 'left .15s ease' }} />
      </button>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: 12, borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}`,
  fontSize: 14, color: COLORS.ink, boxSizing: 'border-box'
};
// Explicit min-width and appearance:auto (not appearance:none, which some
// global reset styles apply and which can suppress the browser's own
// calendar/clock picker indicator) — this is what actually makes the
// native grey picker icon show up reliably for *both* fields, not just
// date. Plain, unwrapped native inputs — no custom icon layered on top —
// so this is genuinely the browser's own picker, matching how date already
// looked, rather than a lookalike Claude built.
// minWidth is an explicit floor, not 0 — with two flex:1 inputs sharing one
// row, minWidth:0 would let either one shrink below what it actually needs
// to show its own value AND the browser's native picker icon, which is
// exactly the squeeze that can make that icon disappear or get clipped.
// 110px comfortably fits the longest realistic date/time value plus the icon.
const dateTimeInputStyle: React.CSSProperties = {
  border: 'none', outline: 'none', fontSize: 14, color: COLORS.ink, background: 'transparent',
  flex: 1, minWidth: 110, appearance: 'auto', WebkitAppearance: 'auto' as any
};
const bareInputStyle: React.CSSProperties = {
  border: 'none', outline: 'none', fontSize: 14, color: COLORS.ink, background: 'transparent', flex: 1
};
const counterStyle: React.CSSProperties = {
  position: 'absolute', bottom: 8, right: 12, fontSize: 11, color: COLORS.textFaint, pointerEvents: 'none'
};
const stepperBtnStyle: React.CSSProperties = {
  width: 24, height: 24, borderRadius: '50%', border: `1px solid ${COLORS.border}`, background: '#fff',
  color: COLORS.violet, fontSize: 16, fontWeight: 700, cursor: 'pointer', lineHeight: 1
};
const miniToggleStyle: React.CSSProperties = {
  flex: 1, padding: '9px 0', borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}`,
  background: '#fff', color: COLORS.textSecondary, fontWeight: 600, fontSize: 12.5, cursor: 'pointer'
};
const miniToggleActiveStyle: React.CSSProperties = { background: COLORS.violet, borderColor: COLORS.violet, color: '#fff' };
const submitBtnStyle: React.CSSProperties = {
  width: '100%', padding: 15, borderRadius: RADIUS.md, border: 'none',
  background: COLORS.violet, color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer',
  boxShadow: '0 8px 20px rgba(122,90,248,0.35)'
};
