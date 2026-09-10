'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { COLORS } from '@/lib/designTokens';
import LoadingState from '@/components/LoadingState';
import ErrorState from '@/components/ErrorState';
import PageHeader from '@/components/PageHeader';
import ActivityForm, { type ActivityFormValues } from '@/components/ActivityForm';

export default function EditActivityPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const supabase = createClient();

  const [userId, setUserId] = useState<string | null>(null);
  const [initialValues, setInitialValues] = useState<Partial<ActivityFormValues> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { router.push('/login'); return; }
      if (cancelled) return;
      setUserId(data.user.id);

      const res = await fetch(`/api/activities/${params.id}`);
      const json = await res.json();
      if (cancelled) return;

      if (json.error || !json.activity) { setError('Activity not found.'); setLoading(false); return; }
      if (json.activity.organizer_id !== data.user.id) { setError("You can only edit activities you organize."); setLoading(false); return; }

      // Split the stored ISO timestamp back into separate date/time inputs,
      // and the stored cents back into the Free/Paid + dollar-amount shape
      // the form actually edits — same conversions Create does in reverse.
      const startsAt = new Date(json.activity.starts_at);
      const pad = (n: number) => String(n).padStart(2, '0');
      const date = `${startsAt.getFullYear()}-${pad(startsAt.getMonth() + 1)}-${pad(startsAt.getDate())}`;
      const time = `${pad(startsAt.getHours())}:${pad(startsAt.getMinutes())}`;

      let endDate = '';
      let endTime = '';
      if (json.activity.ends_at) {
        const endsAt = new Date(json.activity.ends_at);
        endDate = `${endsAt.getFullYear()}-${pad(endsAt.getMonth() + 1)}-${pad(endsAt.getDate())}`;
        endTime = `${pad(endsAt.getHours())}:${pad(endsAt.getMinutes())}`;
      }

      setInitialValues({
        category: json.activity.category,
        title: json.activity.title,
        description: json.activity.description ?? '',
        date, time, endDate, endTime,
        isFree: json.activity.price_cents === 0,
        price: json.activity.price_cents ? String(json.activity.price_cents / 100) : '10',
        capacity: json.activity.capacity,
        address: json.activity.address ?? '',
        coords: { lng: json.activity.longitude, lat: json.activity.latitude },
        coverImageUrl: json.activity.cover_image_url
      });
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function handleSubmit(values: ActivityFormValues) {
    if (!values.coords) return { error: 'Set a location on the map.' };
    const starts_at = new Date(`${values.date}T${values.time}`).toISOString();
    const ends_at = values.endDate && values.endTime ? new Date(`${values.endDate}T${values.endTime}`).toISOString() : null;

    const res = await fetch(`/api/activities/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: values.category, title: values.title.trim(), description: values.description.trim(),
        latitude: values.coords.lat, longitude: values.coords.lng, address: values.address.trim() || null,
        starts_at, ends_at, price_cents: values.isFree ? 0 : Math.round(parseFloat(values.price || '0') * 100), capacity: values.capacity,
        cover_image_url: values.coverImageUrl
      })
    });
    const json = await res.json();
    if (json.error) return { error: json.error };
    router.push(`/?activity=${params.id}`);
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={() => router.push('/')} />;
  if (!userId || !initialValues) return null;

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', paddingBottom: 60 }}>
      <PageHeader title="Edit Activity" backHref={`/?activity=${params.id}`} large={false} />
      <p style={{ fontSize: 13, color: COLORS.textSecondary, padding: '0 20px', marginTop: -8, marginBottom: 22 }}>
        Update the details below. Everyone who's already joined stays joined.
      </p>

      <ActivityForm
        userId={userId}
        initialValues={initialValues}
        showRepeat={false}
        submitLabel="Save Changes"
        submittingLabel="Saving…"
        onSubmit={handleSubmit}
      />
    </div>
  );
}
