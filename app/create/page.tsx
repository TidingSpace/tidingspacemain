'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { COLORS } from '@/lib/designTokens';
import LoadingState from '@/components/LoadingState';
import PageHeader from '@/components/PageHeader';
import ActivityForm, { type ActivityFormValues } from '@/components/ActivityForm';

export default function CreateActivityPage() {
  const router = useRouter();
  const supabase = createClient();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.push('/login');
      else {
        setUserId(data.user.id);
        setCheckingAuth(false);
      }
    });
  }, [supabase, router]);

  async function handleSubmit(values: ActivityFormValues) {
    if (!values.coords) return { error: 'Set a location on the map.' };
    const starts_at = new Date(`${values.date}T${values.time}`).toISOString();
    const ends_at = values.endDate && values.endTime ? new Date(`${values.endDate}T${values.endTime}`).toISOString() : null;

    const res = await fetch('/api/activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: values.category, title: values.title.trim(), description: values.description.trim(),
        latitude: values.coords.lat, longitude: values.coords.lng, address: values.address.trim() || null,
        starts_at, ends_at, price_cents: values.isFree ? 0 : Math.round(parseFloat(values.price || '0') * 100), capacity: values.capacity,
        cover_image_url: values.coverImageUrl, repeat: values.repeat
      })
    });
    const json = await res.json();
    if (json.error) return { error: json.error };
    router.push('/');
  }

  if (checkingAuth || !userId) return <LoadingState />;

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', paddingBottom: 60 }}>
      <PageHeader
        title="Create Activity"
        backHref="/"
        large={false}
        right={
          <button onClick={() => alert('Preview — coming soon.')} style={{ background: 'none', border: 'none', color: COLORS.violet, fontWeight: 700, fontSize: 14.5, cursor: 'pointer' }}>
            Preview
          </button>
        }
      />
      <p style={{ fontSize: 13, color: COLORS.textSecondary, padding: '0 20px', marginTop: -8, marginBottom: 22 }}>
        Fill in the details to invite people to join.
      </p>

      <ActivityForm
        userId={userId}
        showRepeat
        submitLabel="Create Activity"
        submittingLabel="Posting…"
        onSubmit={handleSubmit}
      />
    </div>
  );
}
