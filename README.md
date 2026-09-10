# Tiding Space — Working Prototype

Real login, real map, real database. Here's how to run it.

**Preparing to launch? Read `LAUNCH_CHECKLIST.md` first** — it's the honest, current breakdown of what's real, what's a stub, and what's still on you before real users touch this.


## ⚠️ Already have this running? Run these migrations first
**Fresh install (new Supabase project)?** Just run `supabase/schema.sql` — it's the single source of truth and is kept fully current (verified in a full audit, 2026-09). Every `migration-*.sql` file in the repo root is already folded into it. You can ignore this whole section.

**Existing database, unsure what's applied?** The numbered list below is a historical snapshot — it's stale, and there are now ~30 more `migration-*.sql` files in the repo root than it lists, with no reliable record of the exact order they were meant to run in. Don't try to guess from filenames alone. The safe approach:
1. Run this reminder list first if you haven't already (it's known-correct, in order):
   1. `migration-follows-and-cover-image.sql`
   2. `migration-profile-interests.sql`
   3. `migration-activity-details.sql`
   4. `migration-notifications.sql`
   5. `migration-settings.sql`
   6. `migration-post-images.sql`
   7. `migration-storage.sql`
   8. `migration-chat-images.sql`
   9. `migration-storage-security.sql`
   10. `migration-rate-limiting.sql`
   11. `migration-refresh-activities-view.sql`
2. For everything after that, compare your live database's schema (tables, columns, policies) against `supabase/schema.sql` and apply whatever's genuinely missing — or hand both to an AI coding assistant with access to your database and this repo and ask it to diff them for you.

## Real image upload (Supabase Storage)
Profile photos, activity cover images, and post photos all upload for real now — client-side compressed (max dimension + JPEG quality, so a phone photo doesn't ship at full multi-MB resolution), with a real progress percentage during upload (not a fake spinner — it's wired to actual XHR upload progress events, since the Supabase JS SDK's own upload method doesn't expose these).

**Security is enforced at the Storage level, not just the UI.** Each of the 3 buckets (`avatars`, `activity-covers`, `post-images`) has real RLS-style policies on `storage.objects` — you can only write to your own `{your_user_id}/...` folder, full stop, regardless of what the frontend does or doesn't check.

**Replacing an image deletes the old file** — uploading a new avatar/cover doesn't leave the previous one sitting in Storage forever.

## Notifications
Real, backed by a generic `notifications` table (type/actor/recipient/optional activity/post reference — designed so new notification types can be added later without a schema change). Created directly inside the existing action routes when the action happens (joining an activity, commenting, saving, following, someone you follow joining something, an organizer you follow publishing something) — no database triggers, no cron, no queues.

**"Your activity starts soon"** is computed live every time you open the Notifications page (checking your own upcoming RSVPs) rather than stored — there's no scheduled-job infrastructure to generate it ahead of time.

**Not built, on purpose:** nearby-activity recommendations (no location data on profiles), item reminders like "bring a mat" (depends on the "Additional Settings" field in Create Activity, which is itself still a stub), and the "Messages" filter chip has no data behind it yet — DM notifications weren't in this pass's approved scope, so that filter will always show empty.

## 1. Create your Supabase project
1. Go to supabase.com → New Project (free tier is fine)
2. Once it's ready: Project Settings → API → copy the **Project URL** and **anon public key**
3. Go to the **SQL Editor** → New Query → paste the entire contents of `supabase/schema.sql` → Run

## 2. Get a Mapbox token
1. Go to mapbox.com → sign up free (no credit card needed)
2. Account → Tokens → copy your **default public token**

## 3. Set up environment variables
```
cp .env.example .env.local
```
Then paste your real Supabase URL/key and Mapbox token into `.env.local`.

## 4. Install and run
```
npm install
npm run dev
```
Open http://localhost:3000

## Auth: Email/Password + Google
Login now supports email + password (with sign-up/sign-in toggle) as well as "Continue with Google." Email/password works immediately with no extra setup — Supabase handles it out of the box. Google sign-in needs one-time setup in two dashboards before it'll work:

1. **Google Cloud Console** → create an OAuth 2.0 Client ID (APIs & Services → Credentials → Create Credentials → OAuth client ID → Web application)
2. Add this as an **Authorized redirect URI**: `https://<your-project-ref>.supabase.co/auth/v1/callback` (find your project ref in the Supabase URL)
3. Copy the **Client ID** and **Client Secret** Google gives you
4. In **Supabase** → Authentication → Providers → Google → paste both in, toggle it on

Until you do that, the Google button will show an error when clicked — email/password works regardless.

**Email confirmation:** by default, Supabase requires confirming your email before signing in after sign-up (you'll see "check your email" after signing up). For faster local testing, you can turn this off in Supabase → Authentication → Providers → Email → uncheck "Confirm email" — just remember to turn it back on before real users sign up.

## 5. Try it
- Click "Log in" → toggle to "Sign up" → enter name, email, password → check your inbox to confirm (or skip if you disabled confirmation above) → sign back in
- You're now logged in (a `profiles` row was auto-created for you by the database trigger)
- The map is empty at first — there's no seed data. Create an activity by calling the API directly for now:

```bash
curl -X POST http://localhost:3000/api/activities \
  -H "Content-Type: application/json" \
  --cookie "your-session-cookie" \
  -d '{
    "category": "yoga",
    "title": "Sunrise Rooftop Yoga",
    "description": "All-levels flow to start the day.",
    "latitude": 37.7749,
    "longitude": -122.4194,
    "starts_at": "2026-07-05T14:00:00Z",
    "price_cents": 1200,
    "capacity": 15
  }'
```
(A proper "Create Activity" form UI is the natural next thing to build — this prototype focuses on login → map → join, per your ask. The API is fully ready for a form to call.)

- Refresh the map — your activity's pin appears
- Click the pin → activity detail panel slides up → click Join → a real `rsvps` row is created
- Refresh the page — everything persists, because it's a real database

## What's real vs. what's still a stub
✅ Real: auth, database, RLS security, map rendering, activity creation, RSVP/capacity/waitlist logic, Feed posts, likes, comments, reposts
🚧 Stub / not built yet: image upload for posts (image_url field exists but no upload UI), organizer profiles, Saved page, payments (Stripe), push notifications

## Inbox: Messages + Groups
Click "Inbox" in the top bar for two tabs:

**Messages** — real 1:1 DMs with *anyone* on the platform, not just people you've done an activity with. Tap "+ New Message" to search by name and start a conversation cold — there's no requirement to have any shared history first.

**Groups** — combines two different things people asked for, in one place:
- **Activity Chats** — auto-created for every activity you organize or RSVP'd to, no setup needed (same as before)
- **My Groups** — user-created group chats. Tap "+ New Group" to start one (public or invite-only), or "Discover" to browse and join public groups other people made. Public groups are joinable by anyone; private ones require the creator to add you (RLS enforces this at the database level — there's no invite-UI yet, so for now adding someone to a private group means inserting a `group_members` row directly, e.g. via the Supabase table editor, until an invite flow gets built).

All three (DMs, Activity Chats, custom Groups) update live via Supabase Realtime.

## The map style
The map uses Mapbox's **Standard** style (3D buildings, tilted camera) with a live time-of-day switcher — Morning / Day / Evening / Night — top-left. This is heavier than a flat 2D map; it looks great but renders more geometry, so test on an actual phone before assuming it's fast enough. To go back to the flat, lighter style used earlier in this project, change the `style:` line in `components/ActivityMap.tsx` from `mapbox://styles/mapbox/standard` to `mapbox://styles/mapbox/light-v11` and remove the `pitch`/`bearing` lines.

## Try the Feed
Once logged in, click "Feed" in the top bar of the map page (or go to `/feed`):
- Write a text post and hit Post — it's a real row in the `posts` table
- ♥ to like, 💬 to open/leave a comment — both persist for real
- Reposting isn't wired into the UI yet, but the API (`POST /api/posts` with `type: "repost"` and `repost_of: <post id>`) is ready for it

## Deploying
Easiest path: push this to a GitHub repo, then import it on vercel.com (free tier). Add the same three env vars in Vercel's project settings. Vercel auto-detects Next.js — no config needed.
