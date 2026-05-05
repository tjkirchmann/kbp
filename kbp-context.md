# KBP Product Context

Kirchmann Bowl Pool — running product notes, decisions, and deferred detail. Not a design doc (see DESIGN.md). Not a technical spec (see PROJECT_CHARTER.md). This is the "everything else" file.

---

## What is KBP?

A private web application for the Kirchmann family's annual college football bowl pool. Participants pick the winner and margin of victory for post-season (bowl game) matchups, scored by a stepped algorithm with per-game multipliers for later rounds. The app replaces whatever manual process existed before.

---

## Users

- **~50–60 participants** — family members, invited guests
- **2 admins** — Ty Kirchmann + one other; elevated permissions for managing the pool
- **Auth:** Clerk with Google SSO as the primary path; email (magic link / OTP) as fallback
- Everyone has an account; no anonymous access to pool features

---

## Application Phases / Modes

The app has three distinct operating modes depending on the time of year:

### 1. Pre-season (form closed)
- Front page is a content hub: record books, all-time points leaders, past season recaps
- Blog-style layout — informational, no picks functionality
- CTA: nothing / "Stay tuned" style messaging

### 2. Entry window (form open)
- Primary CTA on front page: **"Enter the Pool"**
- User submits picks for all bowl games in a single form
- Form locks at a defined cutoff (admin-set)

### 3. Post-season (games in progress / complete)
- Primary view: **Standings**
- Live or near-live scoring as game results are entered
- Individual pick breakdowns visible to each user

---

## Scoring (deferred — capture when building the scoring service)

- Pick winner + margin of victory
- Points awarded by a stepped algorithm based on margin accuracy
- Multipliers applied per-game for post-season round (e.g., CFP semis/finals worth more)
- Detail to be designed when building the scoring model — don't prematurely model

---

## Admin Capabilities (deferred — capture when building admin features)

At minimum admins need to:
- Lock / unlock the entry form
- Enter actual game results (triggers scoring)
- Manage users (add/remove, adjust roles)
- Set per-game multipliers

Exact UI TBD — could be inline role-gated controls or a separate `/admin` section.

---

## Record Books / Historical Data

- All-time points leaders
- Past season results / recaps
- Content is manually curated (at least initially) — not auto-generated from app history
- Import strategy TBD when building the data model

---

## Email / Notifications (deferred)

Needed eventually for:
- Magic link / OTP auth for non-Google users (Clerk handles this natively once configured)
- Transactional notifications: entry confirmation, standings updates, winner announcement

Provider TBD — Resend or SendGrid are likely candidates. Not needed for MVP.

---

## Open Decisions

| Topic | Status | Notes |
|---|---|---|
| Scoring algorithm details | Deferred | Needed at service layer, not design time |
| Admin UI approach | Deferred | Inline role-gating vs. `/admin` panel |
| Standings: live vs. refresh | Deferred | WebSocket vs. simple query-on-load |
| Historical data import | Deferred | Manual CSV? Admin form? |
| Transactional email provider | Deferred | Resend or SendGrid; not MVP |
| Real logo asset | Pending | Owner will supply; temp mark in place |
| Second admin identity | Deferred | Who is the second admin? |
