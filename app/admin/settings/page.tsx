'use client';

import { useEffect, useState } from 'react';
import AdminHeader from '@/components/admin/AdminHeader';
import AdminCard from '@/components/admin/AdminCard';
import LoadingState from '@/components/LoadingState';
import { COLORS, RADIUS } from '@/lib/designTokens';

type Setting = { key: string; value: string; updated_at: string };

const SETTING_META: Record<string, { label: string; hint: string; type: 'boolean' | 'number' }> = {
  maintenance_mode: { label: 'Maintenance Mode', hint: 'Future-ready: not yet checked anywhere in the public app. Wiring this up means gating page loads there on this value.', type: 'boolean' },
  user_registration_enabled: { label: 'User Registration Enabled', hint: 'Future-ready: the signup flow does not check this yet.', type: 'boolean' },
  email_verification_required: { label: 'Email Verification Required', hint: 'Future-ready: no verification-gating exists in the signup flow yet.', type: 'boolean' },
  default_activity_duration_hours: { label: 'Default Activity Duration (hours)', hint: 'Future-ready: DEFAULT_ACTIVITY_DURATION_MS in lib/activityTimeState.ts is currently a hardcoded constant, not read from here. Wiring this up would mean converting that function to read this setting, which is used synchronously in dozens of places throughout the app — a real refactor, not a small change.', type: 'number' },
  default_map_zoom: { label: 'Default Map Zoom', hint: 'Future-ready: Explore and the admin Live Map both currently hardcode their own zoom level rather than reading this.', type: 'number' },
  beta_mode: { label: 'Beta Mode', hint: 'Future-ready: not yet checked anywhere in the public app.', type: 'boolean' }
};

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Setting[] | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  function load() {
    fetch('/api/admin/settings').then((r) => r.json()).then((json) => setSettings(json.settings ?? []));
  }
  useEffect(() => { load(); }, []);

  async function updateSetting(key: string, value: string) {
    setSaving(key);
    const res = await fetch('/api/admin/settings', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value })
    });
    setSaving(null);
    if (!res.ok) { alert("Couldn't save this setting — please try again."); return; }
    setSettings((prev) => prev?.map((s) => (s.key === key ? { ...s, value } : s)) ?? null);
  }

  if (!settings) return <LoadingState />;

  return (
    <>
      <AdminHeader title="Settings" subtitle="Platform configuration — stored centrally, not hardcoded" />
      <div style={{ padding: 28 }}>
        <AdminCard>
          {settings.map((s, i) => {
            const meta = SETTING_META[s.key] ?? { label: s.key, hint: '', type: 'number' as const };
            return (
              <div key={s.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '14px 0', borderBottom: i < settings.length - 1 ? `1px solid ${COLORS.borderLight}` : 'none' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.ink }}>{meta.label}</div>
                  {meta.hint && <div style={{ fontSize: 12, color: COLORS.textFaint, marginTop: 2 }}>{meta.hint}</div>}
                </div>
                {meta.type === 'boolean' ? (
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', flexShrink: 0 }}>
                    <input
                      type="checkbox"
                      checked={s.value === 'true'}
                      disabled={saving === s.key}
                      onChange={(e) => updateSetting(s.key, e.target.checked ? 'true' : 'false')}
                      style={{ width: 18, height: 18, accentColor: COLORS.violet, cursor: 'pointer' }}
                    />
                  </label>
                ) : (
                  <input
                    type="number"
                    defaultValue={s.value}
                    disabled={saving === s.key}
                    onBlur={(e) => { if (e.target.value !== s.value) updateSetting(s.key, e.target.value); }}
                    style={{ width: 80, padding: 8, borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}`, fontSize: 13.5, textAlign: 'right', flexShrink: 0 }}
                  />
                )}
              </div>
            );
          })}
        </AdminCard>
      </div>
    </>
  );
}
