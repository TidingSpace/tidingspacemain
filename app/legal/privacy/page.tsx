import { COLORS, FONT } from '@/lib/designTokens';

export default function PrivacyPage() {
  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 24px 80px 24px', color: COLORS.ink, lineHeight: 1.6 }}>
      <div style={{ background: COLORS.warningBg, border: `1px solid ${COLORS.warningBorder}`, borderRadius: 12, padding: 16, marginBottom: 32, fontSize: 13.5 }}>
        <b>This is a starting draft, not a finished legal document.</b> Have it reviewed by a lawyer before real users sign up — data protection requirements (GDPR, CCPA, etc.) depend on where your users are located, and this draft doesn't attempt to cover every jurisdiction.
      </div>

      <h1 style={{ ...FONT.pageTitle, marginBottom: 4 }}>Privacy Policy</h1>
      <p style={{ color: COLORS.textSecondary, fontSize: 13, marginBottom: 32 }}>Last updated: [DATE] — Tiding Space ("we," "us")</p>

      <Section title="1. What We Collect">
        Account info (name, email, profile photo/color), activity data (activities you create, join, or save), location data you provide when creating or browsing activities, messages you send through the platform, and payment information (handled by our payment processor — we don't store full card numbers).
      </Section>

      <Section title="2. How We Use It">
        To operate the core features of Tiding Space: showing you nearby activities, managing your spot in activities and payments, enabling messaging between users, and sending notifications about activities you're involved in. We do not sell your personal data to third parties.
      </Section>

      <Section title="3. What Other Users Can See">
        Your name, profile photo, and posts are visible to other users. Organizers can see who has joined their activities, including your name, so they can manage attendance. Your exact address/location is only shown to people after joining an activity.
      </Section>

      <Section title="4. Location Data">
        We use approximate or precise location (depending on your device permissions) to show nearby activities on the map. You can decline location access, though this limits map functionality.
      </Section>

      <Section title="5. Data Retention">
        We retain your data for as long as your account is active. You can request deletion of your account and associated data by contacting us — see Section 8.
      </Section>

      <Section title="6. Third-Party Services">
        We use Supabase (database/authentication), Mapbox (maps), and a payment processor to operate the platform. These providers process data on our behalf under their own privacy and security terms.
      </Section>

      <Section title="7. Your Rights">
        Depending on where you live, you may have rights to access, correct, export, or delete your personal data. [This section needs to be made specific to your actual user base's jurisdictions — GDPR (EU/UK), CCPA (California), and other regional laws impose different specific requirements.]
      </Section>

      <Section title="8. Contact">
        Questions about this policy or requests regarding your data: [YOUR CONTACT EMAIL]
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h2 style={{ ...FONT.cardTitle, marginBottom: 8, color: COLORS.inkSoft }}>{title}</h2>
      <p style={{ fontSize: 14, color: '#333' }}>{children}</p>
    </div>
  );
}
