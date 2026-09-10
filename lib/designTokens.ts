// Shared design tokens, extracted from the Explore screen so every screen
// after it references the same values instead of re-declaring hex literals.
// If the mockups' palette needs adjusting, it should only need changing here.

export const COLORS = {
  violet: '#7A5AF8',
  violetLight: '#9B7CFF',
  violetDeep: '#4B2E9E',
  violetTint: '#EDE7FC',
  ink: '#1C1830',
  inkSoft: '#3D2470',
  textSecondary: '#716C87',
  textMuted: '#8E8E93',
  textFaint: '#A39EBD',
  border: '#EAE6F6',
  borderLight: '#F0EDF7',
  surfaceAlt: '#F1ECFB',
  // Reconciled during the design-system audit: the app had two different reds
  // in use for the same "destructive/error" meaning (#D14343 and #E0473F).
  // #D14343 was already the dominant one (16 uses vs. 1), so it's now the
  // single canonical value — the other was the outlier, not the other way round.
  danger: '#D14343',
  success: '#1FA971',
  // New token, not a reconciliation — this exact amber pair didn't exist
  // before, it was hardcoded identically in both legal pages' warning banners.
  warningBg: '#FFF4E8',
  warningBorder: '#F0D9BE',
  // Status-banner pairs (e.g. Activity Details' "you're going" / "waitlisted"
  // banners) — same tint+accent pattern as violet/violetTint, for the other
  // two states that recur across the app.
  successTint: '#E8F6EF',
  warningAmber: '#B3591F',
  disabledBg: '#D9D3F5',
  // New — subtle background tint for chat message areas, differentiating the
  // scrollable message list from the header/composer. Reused across all three
  // chat surfaces (DMs, custom groups, activity communities).
  chatBg: '#FBFAFF',
  // Reconciled the same way: #D4537E and #E0568C were both "liked heart" pink,
  // used inconsistently across Feed's action row vs. the post detail page.
  // #D4537E was the one already in the shared PostActionsRow component.
  like: '#D4537E',
  white: '#FFFFFF'
};

export const RADIUS = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 24,
  pill: 100
};

export const SHADOW = {
  card: '0 2px 8px rgba(20,10,40,0.08)',
  raised: '0 4px 14px rgba(20,10,40,0.15)',
  sheet: '0 -12px 32px rgba(61,36,112,0.14)'
};

// Spacing scale — most of the app was already using values that fall on this
// scale by convention; naming them makes that convention explicit instead of
// implicit, and gives new code a scale to reach for instead of picking a
// number that "looks about right."
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24
};

// Typography scale. Pairs each size with the weight and line-height it's
// meant to always appear with, rather than leaving those to be reinvented
// ad hoc at each call site — that inconsistency (the same "page title"
// concept rendered at 28px in one place, 22px in another, sometimes 700,
// sometimes 800) is exactly what this scale replaces.
export const FONT = {
  pageTitle: { fontSize: 32, fontWeight: 700, lineHeight: 1.2 },      // top-level screen headers: "Feed", "Notifications", "Settings"
  sectionTitle: { fontSize: 24, fontWeight: 600, lineHeight: 1.25 },  // major sections within a screen, e.g. a sheet's own title
  cardTitle: { fontSize: 18, fontWeight: 600, lineHeight: 1.3 },      // individual card/row titles: an activity name, a person's name
  body: { fontSize: 16, fontWeight: 400, lineHeight: 1.5 },           // primary readable text: descriptions, post text, messages
  caption: { fontSize: 13.5, fontWeight: 500, lineHeight: 1.4 }       // metadata: timestamps, counts, helper text
};

// Avatar sizes — the app had accumulated several close-but-different avatar
// dimensions (38/40/42/44/56/100px) with no clear reasoning behind which
// screen used which, and a mix of circular vs. rounded-square treatments for
// the same concept. Standardized on circular (matching the original mockups)
// across the board, with this 4-size scale covering every real use case found
// in the audit: inline/attendee-stack (sm), the default list-row size (md),
// Inbox's larger conversation-row size (lg), and Profile's header avatar (xl).
export const AVATAR = {
  sm: 28,
  md: 42,
  lg: 56,
  xl: 100
};
