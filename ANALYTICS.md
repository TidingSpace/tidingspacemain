# Tiding Space — Analytics Event Schema

Internal reference for the beta's product analytics. Provider: **PostHog**
(see the main report for why PostHog was chosen over Vercel Analytics).

All events are tracked via `lib/analytics-client.ts` (browser) or
`lib/analytics-server.ts` (API routes). Every call is non-blocking and
fails silently — analytics can never break or slow down a real user action.

---

## Events

### `signup_completed`
- **Fires:** the moment `supabase.auth.signUp()` succeeds — i.e., the
  account was created. **Not** when email confirmation later completes;
  those are different moments, and this app requires email confirmation
  by default. There is no separate `email_confirmed` event.
- **Where:** `app/login/page.tsx`, signup handler.
- **Properties:** none.
- **Measures:** Acquisition — how many people actually create an account.

### `activity_created`
- **Fires:** after the activity insert succeeds in the database.
- **Where:** `app/api/activities/route.ts` (POST).
- **Properties:** `category` (string), `is_recurring` (boolean).
  Never title or description — free text the organizer wrote.
- **Measures:** Activation — how many users create the core content type.

### `activity_joined`
- **Fires:** only when the RSVP is actually confirmed, not waitlisted.
  Joining a waitlist isn't "joined" in any meaningful sense yet.
- **Where:** `app/api/rsvp/route.ts` (POST).
- **Properties:** `category` (string).
- **Measures:** Activation — how many users take the other core action
  (joining, not just creating).

### `activity_left`
- **Fires:** after a successful RSVP cancellation.
- **Where:** `app/api/rsvp/route.ts` (DELETE).
- **Properties:** `activity_id` (string).
- **Measures:** Engagement/churn signal — how often people back out after
  committing.

### `group_created`
- **Fires:** after both the group row and the creator's own admin
  membership row are successfully inserted.
- **Where:** `app/api/groups/route.ts` (POST).
- **Properties:** `is_public` (boolean). Never name or description.
- **Measures:** Activation — a secondary core content type.

### `group_joined`
- **Fires:** on two distinct, real paths — joining a public group
  directly, and accepting a private group invite. Distinguished by the
  `via` property so the two can be told apart later if needed.
- **Where:** `app/api/groups/[id]/join/route.ts` (POST) and
  `app/api/groups/[id]/members/respond/route.ts` (POST, accept only).
- **Properties:** `via`: `'direct'` or `'invite'`.
- **Measures:** Activation.

### `message_sent`
- **Fires:** after a message insert succeeds, across all three chat
  surfaces this app has.
- **Where:** `app/api/messages/[userId]/route.ts` (DMs),
  `app/api/groups/[id]/messages/route.ts` (group chat),
  `app/api/activities/[id]/messages/route.ts` (activity chat).
- **Properties:** `channel`: `'dm'`, `'group'`, or `'activity'`.
  **Never** message text, image URLs, or recipient identity — this is
  the event most likely to be misused for content tracking, so it's
  deliberately reduced to "a message was sent, on this kind of surface,"
  nothing more.
- **Measures:** Engagement — the most frequent, highest-signal action in
  the product.

### `activity_shared`
- **Fires:** when the Share button (copy-link) on an activity's detail
  view is tapped. Fires on the tap itself, not on whether the link is
  ever actually opened by someone else — that's outside what this app
  can observe.
- **Where:** `app/page.tsx`, Activity Details sheet, client-side.
- **Properties:** `category` (string).
- **Measures:** Engagement / organic growth signal.

### `report_submitted`
- **Fires:** after a report insert succeeds.
- **Where:** `app/api/reports/route.ts` (POST).
- **Properties:** `target_type`: `'user'`, `'activity'`, `'post'`,
  `'group'`, `'direct_message'`, or `'group_message'`. **Never** the
  reason or details text — both are free-form (typed via a prompt, not a
  fixed dropdown) and could contain anything, including identifying
  information about either party.
- **Measures:** Trust & safety signal — volume and distribution of
  reports during beta, not what's actually reported (that stays in the
  admin panel, not analytics).

### `app_opened`
- **Fires:** once per browser session (not once per page view —
  navigating between tabs doesn't re-fire this), and only for
  authenticated users. Anonymous visits to the login page are
  deliberately not tracked as `app_opened` — the retention question this
  event exists to answer only makes sense for people who've signed up.
- **Where:** `components/AppOpenedTracker.tsx`, mounted once in the root
  layout.
- **Properties:** none. The user's ID is attached separately via
  `identify()`, not as an event property.
- **Measures:** Retention — with a stable per-user ID (see below), this
  is what lets "did this person come back" actually be computed.

---

## Identity

`identifyUser(userId)` is called once per session, at the same time as
`app_opened`, and additionally right at `signup_completed` for a
brand-new account. Only the Supabase user ID (a UUID) is sent — never
email, name, or any other profile field. A UUID alone isn't personally
identifying outside this system, but is exactly what's needed to compute
retention: the same person's events across different sessions need a
consistent identity to be recognized as the same person at all.

---

## What this schema answers

- **Acquisition:** count of `signup_completed`.
- **Activation:** what fraction of `signup_completed` users go on to
  produce at least one `activity_created`, `activity_joined`,
  `group_created`, or `group_joined` — PostHog can compute this as a
  funnel directly from these events without any additional instrumentation.
- **Engagement:** frequency of `message_sent`, `activity_shared`, and
  repeat `activity_joined`/`group_joined` per user over time.
- **Retention:** `app_opened`, grouped by the identified user ID, viewed
  as a cohort/retention chart in PostHog — do the same people show up in
  session N+1, N+7, N+30.

## What was deliberately left out

No event tracks message content, report reasons, activity titles/descriptions,
group names/descriptions, email addresses, or any other free-text field a
person wrote. No autocapture, no automatic pageview tracking, no session
replay — this schema is exactly the ten events requested, nothing more.
