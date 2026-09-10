# Tiding Space — Launch Readiness Checklist

Updated after a full security/schema/code-quality audit (2026-09) and the fixes that followed it. Every route in this checklist has passed a real `next build`.

**Note on this file's history:** an earlier version of this checklist claimed "no admin dashboard" as an open gap. That was wrong even at the time — a full admin panel already existed under `app/admin/**` (users, activities, reports, trust & safety, analytics, categories, audit log, system, organizers, notifications, map). If you're relying on this file for launch decisions, verify claims against the actual code rather than trusting it blindly — it drifts.

---

## ✅ What's real and validated

**Core loop:** auth (email/password + Google), real Mapbox 3D map, Create Activity (categories now sourced from the real database, not hardcoded), Join/RSVP with waitlist + liability consent gate.

**Social:** Feed (posts, likes, comments), 1:1 DMs to anyone, group chats (auto per-activity + user-created public/private), user search.

**Profiles (new this pass):** `/profile/[userId]` — works for both your own profile (with Edit) and anyone else's (with Follow). Shows their posts, what they're organizing, follower count. `/profile` redirects to your own.

**Follow (new):** real follow/unfollow, `/api/follows/[organizerId]`.

**Save/bookmark (new):** real save/unsave for both activities and posts, with a dedicated `/saved` page (two tabs). Wired into the activity detail panel's Save button.

**Organizer tools (new):** `/activities/[id]/manage` — attendee list split into Checked In / Confirmed / Waitlisted, with real check-in and waitlist-promotion actions. RLS enforces that only the actual organizer can take these actions — a non-organizer hitting this URL sees only their own RSVP, correctly, not an error.

**Safety:** report + block, enforced at the database level.

**Legal:** Terms of Service + Privacy Policy drafts, linked from signup.

---

## ✅ Also real (this checklist previously claimed otherwise)

- **Admin/moderation dashboard** — full panel at `/admin` (users, activities, reports, trust & safety, analytics, categories, audit log, system, organizers, notifications, map). Every admin mutation is server-verified via `requireAdmin()` (not just a client-side check) and logged to `admin_audit_log`.
- **Real file upload** — profile photos, activity covers, and post photos all upload to Supabase Storage for real (client-compressed, per-user RLS-scoped, old file deleted on replace). See README's "Real image upload" section.
- **Settings screen** — `/settings` and `/settings/blocked` both exist.
- **Invite UI for private groups** — a real Add/Invited flow exists in `/groups/[id]`, not just RLS support with no button.
- **Category-icon duplication** — fixed 2026-09: `lib/categoryGroups.ts` is now the single source of truth for category icons, re-exported by `components/CategoryIcon.tsx`; the admin category list also now renders each category's actual stored `icon` path instead of falling back to the hardcoded map.

## 🚧 Real gaps — still open

| Gap | Why it matters | Effort |
|---|---|---|
| **No payments (Stripe)** | By product decision, all activities are free for now — price is shown as an FYI ("pay $X in person"), not processed. Revisit if/when paid activities become a real feature. | Medium-high, when needed |
| **Admin actions have near-zero automated test coverage** | Suspend/ban, broadcasts, and category creation now have basic tests (added 2026-09); most of the other ~20 admin routes still don't. RLS is a backstop, but this is the highest-blast-radius surface with the thinnest safety net. | Medium |
| **Lat/lng is a plain B-tree index, not spatial** | Fine at beta scale; will need a real geo index (PostGIS or similar) once activity density grows in any one area. | Medium, not urgent |
| **No partial index on unread notifications/DMs** | `read_at IS NULL` queries will slow down as these tables grow — cheap fix, just not done yet. | Small |

---

## ⚠️ Still on you, not code

- **You still haven't run this against real Supabase/Mapbox credentials, as far as I know.** Every validation is "compiles against placeholders." This remains the single highest-priority item.
- Legal pages need real lawyer review before public use.
- Business entity + insurance conversation before real money moves (if/when Stripe gets added).
- A full security/schema/code-quality audit was completed 2026-09 — no critical blockers found, safe for a small beta. See git history / conversation log for the full findings if you need the detail later.

---

## Suggested order for what's left

1. Run it yourself, end to end, for real
2. Deploy to Vercel/Netlify
3. Seed 10-15 real activities in one city
4. Private beta, free-only, your own network
5. Then: admin-route test coverage → Stripe (if paid activities become a real feature) → spatial/partial indexes as usage grows

