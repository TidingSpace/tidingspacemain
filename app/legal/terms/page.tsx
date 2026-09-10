import { COLORS, FONT } from '@/lib/designTokens';

export default function TermsPage() {
  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 24px 80px 24px', color: COLORS.ink, lineHeight: 1.6 }}>
      <div style={{ background: COLORS.warningBg, border: `1px solid ${COLORS.warningBorder}`, borderRadius: 12, padding: 16, marginBottom: 32, fontSize: 13.5 }}>
        <b>This is a starting draft, not a finished legal document.</b> It was written to give you real structure and cover the obvious gaps for an activity marketplace, but it has not been reviewed by a lawyer. Have this reviewed by one before real users rely on it — especially the liability and dispute sections, which vary a lot by state/country.
      </div>

      <h1 style={{ ...FONT.pageTitle, marginBottom: 4 }}>Terms of Service</h1>
      <p style={{ color: COLORS.textSecondary, fontSize: 13, marginBottom: 32 }}>Last updated: [DATE] — Tiding Space ("we," "us")</p>

      <Section title="1. What Tiding Space Is">
        Tiding Space is a platform that lets people discover, create, and join real-world activities, and communicate with other users. We are not the organizer of any activity listed on the platform unless explicitly stated. Organizers — whether individuals or businesses — are independently responsible for the activities they create.
      </Section>

      <Section title="2. Assumption of Risk">
        Activities found through Tiding Space happen in the real world and may involve physical activity, travel, group gatherings, or interaction with strangers. By joining any activity, you acknowledge and accept the inherent risks involved, including but not limited to physical injury, property damage, or personal disputes. You participate at your own risk.
      </Section>

      <Section title="3. Organizer Responsibilities">
        Organizers are responsible for the accuracy of their listings, the safety of the activities they host, and compliance with any applicable local laws, permits, or licensing requirements. Tiding Space does not vet, inspect, or certify any activity, venue, or organizer beyond the verification tier shown on their profile.
      </Section>

      <Section title="4. User Conduct">
        You agree not to use Tiding Space to harass, threaten, defraud, or endanger other users; to post false or misleading activity listings; to circumvent safety or verification features; or to use the platform for any unlawful purpose. We may suspend or terminate accounts that violate this section.
      </Section>

      <Section title="5. Payments">
        Paid activities are processed through our payment provider. Refund and cancellation terms are set per-activity by the organizer and displayed before checkout, except where consumer protection law requires otherwise. Tiding Space's platform fee is non-refundable except where required by law.
      </Section>

      <Section title="6. Content You Post">
        You retain ownership of content you post (activity listings, photos, messages, posts) but grant Tiding Space a license to display it as part of operating the platform. You're responsible for having the rights to anything you post.
      </Section>

      <Section title="7. Reporting & Enforcement">
        Users can report activities, posts, or other users for review. We may remove content, suspend accounts, or take other action at our discretion to protect the safety of the community. We do not guarantee a specific response time or outcome for any report.
      </Section>

      <Section title="8. Disclaimer of Warranties & Limitation of Liability">
        Tiding Space is provided "as is." To the maximum extent permitted by law, we disclaim all warranties and are not liable for any injury, loss, or damage arising from an activity, an interaction with another user, or use of the platform. [This section in particular needs jurisdiction-specific legal review — enforceability of liability waivers for physical activities varies significantly by location.]
      </Section>

      <Section title="9. Changes to These Terms">
        We may update these terms from time to time. Continued use of Tiding Space after a change constitutes acceptance of the new terms.
      </Section>

      <Section title="10. Contact">
        Questions about these terms: [YOUR CONTACT EMAIL]
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
