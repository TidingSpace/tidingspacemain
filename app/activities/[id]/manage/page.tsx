'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import ErrorState from '@/components/ErrorState';
import PageHeader from '@/components/PageHeader';
import LoadingState from '@/components/LoadingState';
import Avatar from '@/components/Avatar';
import { COLORS, RADIUS } from '@/lib/designTokens';

type Attendee = {
  id: string;
  status: string;
  created_at: string;
  profile: { id: string; name: string; avatar_color: string; avatar_url?: string | null; handle: string } | null;
};

export default function ManageActivityPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const [activityTitle, setActivityTitle] = useState('');
  const [isOrganizer, setIsOrganizer] = useState(true);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  async function load() {
    setLoading(true);
    setError(false);
    try {
      const [actRes, attRes] = await Promise.all([
        fetch(`/api/activities/${params.id}`).then((r) => r.json()),
        fetch(`/api/activities/${params.id}/attendees`).then((r) => r.json())
      ]);
      setActivityTitle(actRes.activity?.title ?? 'Activity');

      const { data: { user } } = await supabase.auth.getUser();
      setIsOrganizer(user?.id === actRes.activity?.profiles?.id);
      setAttendees(attRes.attendees || []);
    } catch {
      setError(true);
    }
    setLoading(false);
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { window.location.href = '/login'; return; }
      load();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function updateStatus(rsvpId: string, status: string) {
    await fetch(`/api/activities/${params.id}/attendees`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rsvp_id: rsvpId, status })
    });
    load();
  }

  if (error) return <ErrorState message="Couldn't load attendees." onRetry={load} />;
  if (loading) return <LoadingState />;

  const confirmed = attendees.filter((a) => a.status === 'confirmed');
  const checkedIn = attendees.filter((a) => a.status === 'checked_in');
  const waitlisted = attendees.filter((a) => a.status === 'waitlisted');
  const totalAttendees = confirmed.length + checkedIn.length + waitlisted.length;

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', paddingBottom: 60, background: '#F7F6FB', minHeight: '100vh' }}>
      <PageHeader
        title={activityTitle || 'Activity'}
        backHref="/"
        large={false}
        right={isOrganizer && (
          <Link href={`/activities/${params.id}/edit`} style={{ color: COLORS.violet, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
            Edit
          </Link>
        )}
      />
      <p style={{ fontSize: 13, color: COLORS.textSecondary, margin: '-8px 20px 18px 20px' }}>Attendee check-in</p>

      {!isOrganizer && (
        <div style={{ background: '#FBEAEA', color: COLORS.danger, padding: 14, borderRadius: RADIUS.sm, fontSize: 13, margin: '0 20px 20px 20px' }}>
          You can only see your own spot here — only the organizer can check people in.
        </div>
      )}

      {totalAttendees === 0 && (
        <div style={{ textAlign: 'center', color: COLORS.textFaint, padding: '40px 24px', fontSize: 13.5 }}>
          No one's joined yet.
        </div>
      )}

      <Section title={`Checked In (${checkedIn.length})`} attendees={checkedIn} onAction={updateStatus} isOrganizer={isOrganizer} />
      <Section title={`Confirmed (${confirmed.length})`} attendees={confirmed} onAction={updateStatus} isOrganizer={isOrganizer} showCheckIn />
      <Section title={`Waitlisted (${waitlisted.length})`} attendees={waitlisted} onAction={updateStatus} isOrganizer={isOrganizer} showPromote />
    </div>
  );
}

function Section({ title, attendees, onAction, isOrganizer, showCheckIn, showPromote }: {
  title: string; attendees: Attendee[]; onAction: (id: string, status: string) => void;
  isOrganizer: boolean; showCheckIn?: boolean; showPromote?: boolean;
}) {
  if (attendees.length === 0) return null;
  return (
    <>
      <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textFaint, textTransform: 'uppercase', letterSpacing: '.05em', padding: '4px 24px 8px 24px' }}>{title}</div>
      <div style={{ background: '#fff', margin: '0 20px 20px 20px', borderRadius: RADIUS.lg, overflow: 'hidden' }}>
        {attendees.map((a) => (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: `1px solid ${COLORS.border}` }}>
            <Avatar name={a.profile?.name || '?'} color={a.profile?.avatar_color} avatarUrl={a.profile?.avatar_url} size="md" />
            <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: COLORS.ink }}>{a.profile?.name}</div>
            {isOrganizer && showCheckIn && (
              <button onClick={() => onAction(a.id, 'checked_in')} style={actionBtn(COLORS.success)}>Check in</button>
            )}
            {isOrganizer && showPromote && (
              <button onClick={() => onAction(a.id, 'confirmed')} style={actionBtn(COLORS.violet)}>Promote</button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function actionBtn(color: string): React.CSSProperties {
  return { padding: '7px 14px', borderRadius: RADIUS.sm, border: 'none', background: color, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' };
}
