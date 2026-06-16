# Notification Channels Everywhere + Integrations Sub-tabs

## Context

The "comms" code has two parallel notification paths. Task lifecycle
notifications (start/success/failure) already flow through the reusable
`NotificationChannel` model (`notification_channels` table → strategy + config),
resolved per task. But **ESPN game alerts** (game start, halftime, final, poll
errors, seed errors) bypass that entirely — they call
`send_discord_alert(global_webhook, msg)` directly in `tasks/espn_poller.py`.

This makes the channel abstraction a half-measure. The goals:

1. Funnel ESPN alerts through `NotificationChannel` too, so the channel notion is
   used **beyond just task updates**.
2. Add a **`none`** (black-hole) strategy so a channel can accept a payload and do
   nothing — a clean way to silence any consumer.
3. Surface the ESPN-alerts channel picker on the **ESPN tab**, and restructure the
   admin nav: ESPN becomes a **sub-tab** under a new **Integrations** top-level
   section (a new sub-nav paradigm, reusable for future integrations).

---

## Goals / Non-goals

- Goal: ESPN game alerts resolve and deliver through a configurable
  `NotificationChannel`, with the global Discord webhook as the fallback.
- Goal: A reusable no-op `none` strategy/channel.
- Goal: New `Integrations` sidebar section with ESPN as its first sub-tab; the
  ESPN-alerts channel selector lives on that sub-tab.
- Non-goal: Migrating task-lifecycle notifications (already channel-based).
- Non-goal: New delivery backends (Slack/email) — only the `none` strategy.
- Non-goal: DB schema changes (none needed).

---

## Approach

### Backend — make `NotificationChannel` the single funnel

| Step | File | Change |
|------|------|--------|
| 1 | `app/services/notifications/none.py` (new) | `NoneStrategy(name="none")` whose `send()` is a no-op. |
| 2 | `app/services/notifications/service.py` | Register `NoneStrategy` in `NotificationService` default strategies. |
| 3 | `app/services/notifications/discord.py` | In `_format_message`, return `str(payload["text"])` verbatim when a `text` key is present, so raw alert strings deliver through the same strategies. `discord_bot` reuses `_format_message`, so it inherits this. |
| 4 | `app/services/notify_config.py` | Factor `resolve_channel(db, channel_name) -> (strategy, config)`: look up the named channel; fall back to `("discord", {"webhook_url": get_discord_webhook_url(db)})` when blank/missing. Refactor existing `resolve_delivery` to call it (after the legacy per-task `webhook_url` precedence). |
| 5 | `app/services/admin_config.py` | Add `_ESPN_ALERT_CHANNEL_KEY = "espn_alert_channel"` and `get_espn_alert_channel(db)` (default `""`). |
| 6 | `app/tasks/espn_poller.py` | Add `_send_alert(text)` that opens a session, reads `get_espn_alert_channel`, `resolve_channel`, then `notification_service.notify(event="message", payload={"text": text})`. Replace the 3 direct `send_discord_alert(...)` sites (poll error, game `notify_msg`, `_alert_seed_error`). Simplify `_get_cached_config` to return just `rate_limit` (drop webhook fetch). |
| 7 | `app/routers/admin.py` | Add `espn_alert_channel` to `AdminConfigSchema`, `AdminConfigUpdate`, `_admin_config_payload`, and `update_admin_config` — validating the channel exists (or is `""`) like the task-channel path at lines ~654–661. |

No migration: `admin_config` is key/value; `none` is just a `strategy` string in
the existing `notification_channels` table.

### Frontend — Integrations section with ESPN sub-tab

| Step | File | Change |
|------|------|--------|
| 8 | `src/App.tsx` | Nest ESPN under `integrations`: `<Route path="integrations" element={<IntegrationsShell/>}>` with `index → Navigate to "espn"` and `path="espn" → <EspnPanel/>`. Keep `path="espn" → Navigate to "/admin/integrations/espn"` for back-compat. |
| 9 | `pages/admin/AdminSidebar.tsx` | Replace the standalone `{ id: 'espn', ... }` entry with `{ id: 'integrations', label: 'Integrations', icon: Plug }` → `/admin/integrations`. Comms stays its own top-level tab. |
| 10 | `pages/admin/IntegrationsShell.tsx` (new) | The sub-tab paradigm: a horizontal NavLink-pill sub-nav (ESPN as first item) above an `<Outlet/>`. Structured so future integrations are one array entry + one nested route. |
| 11 | `pages/AdminShell.tsx` | Breadcrumbs `Integrations › ESPN` for `integrations[/espn]`; resolve `currentSection` (for `AdminInfoPanel`) from the leaf crumb so ESPN info still shows on the sub-tab. |
| 12 | `pages/admin/EspnPanel.tsx` | Add an **ESPN game alerts channel** `<select>` populated by `useChannels()` (`useAdminSync`): `(global webhook)` = `""`, then each channel name (incl. any `none` channel). Bound to `config.espn_alert_channel`; include it in the existing `handleSave` `update.mutateAsync`. |
| 13 | `pages/admin/CommsPanel.tsx` | Soften the webhook helper copy to describe it as the default/fallback destination (the per-consumer selector now lives on the ESPN tab). |
| 14 | `pages/admin/ChannelManager.tsx` | Add `{ value: 'none', label: 'None (silence)' }` to `STRATEGIES`; make the webhook input optional when strategy is `none` (allow creating a config-less black-hole channel; gate the existing `webhook.trim()` requirement on `strategy !== 'none'`). |
| 15 | `services/useAdminConfig.ts` | Add `espn_alert_channel: string` to the `AdminConfig` interface. |

---

## Affected files

- Backend: `services/notifications/none.py` (new), `services/notifications/service.py`,
  `services/notifications/discord.py`, `services/notify_config.py`,
  `services/admin_config.py`, `tasks/espn_poller.py`, `routers/admin.py`
- Frontend: `App.tsx`, `pages/admin/IntegrationsShell.tsx` (new), `pages/admin/AdminSidebar.tsx`,
  `pages/AdminShell.tsx`, `pages/admin/EspnPanel.tsx`, `pages/admin/CommsPanel.tsx`,
  `pages/admin/ChannelManager.tsx`, `services/useAdminConfig.ts`

---

## Verification

- **Backend**: import-check the changed modules (`python -c "import app.tasks.espn_poller, app.services.notify_config, app.services.notifications.service"`); confirm `resolve_channel("")` falls back to the global webhook and a `none` channel resolves to a no-op send. (No pytest suite in repo.)
- **Frontend**: `cd src/frontend && npm run build` (tsc -b + vite) and `npm run lint`.
- **End-to-end**: run the app; navigate `Integrations › ESPN`; set the alerts
  channel to a Discord channel and confirm a test/game alert delivers; point it at
  a `none` channel and confirm alerts are silently dropped; clear it and confirm
  the global-webhook fallback still fires.

---

## Open questions

- None — ESPN-alerts selector placement (ESPN sub-tab) and the `none` naming were
  confirmed with the user.
