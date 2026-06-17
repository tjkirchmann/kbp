# Railway Deployment

This project runs 3 services on Railway. The backend API, the Procrastinate worker, and the Discord bot all run inside the single `backend` service managed by supervisord. Background jobs (CFBD + ESPN sync) run on Procrastinate, backed by Postgres — there is no Redis or Celery. The Discord bot is a long-lived gateway connection that listens for slash commands / messages and posts; it stays dormant (exits cleanly, no restart loop) until `DISCORD_BOT_TOKEN` is set.

## Services

| Service | Root Directory | Notes |
|---------|---------------|-------|
| `frontend` | `src/frontend` | nginx, serves built React app |
| `backend` | `src/backend` | uvicorn + procrastinate worker + discord bot via supervisord |
| `postgres` | Railway managed | also backs the Procrastinate job queue |

## Setting Up a New Environment

### 1. Add managed services
In the Railway project, add:
- **PostgreSQL** plugin

### 2. Create application services
Create two services pointing at this repo:
- `frontend` → Root Directory: `src/frontend`
- `backend` → Root Directory: `src/backend`

Both have `railway.toml` files that tell Railway which Dockerfile to use and how to health-check them. No start command override needed — `backend` runs `./start.sh` which runs migrations, applies the Procrastinate schema, then starts supervisord (which manages uvicorn and the procrastinate worker).

### 3. Set environment variables

**`backend` service:**
```
DATABASE_URL=${{Postgres.DATABASE_URL}}
ALLOWED_ORIGINS=https://your-frontend.up.railway.app
CLERK_SECRET_KEY=sk_live_...
OPENAI_API_KEY=sk-...
CFBD_API_KEY=...
DISCORD_BOT_TOKEN=          # optional; leave unset to keep the bot dormant
DISCORD_GUILD_ID=           # optional; set for instant per-guild slash-command sync
```

**`frontend` service (build-time):**
```
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
VITE_API_URL=https://your-backend.up.railway.app
```

### 4. Deploy order
Deploy `postgres` first (Railway resolves `${{...}}` references automatically). Then deploy the two application services. `backend` runs Alembic migrations on startup before any processes come up.

## Local Development

Local dev uses `docker compose up --build` from the repo root. The Procrastinate worker runs as a separate container locally (better log isolation, can restart independently). supervisord is only used in the production container.

Copy `.env.example` to `.env` and fill in your secrets — that's the only setup required.

The Discord bot runs as its own `discord_bot` container in dev (mirrors the worker). Iterate on it with:

```
docker compose restart discord_bot
docker compose logs -f discord_bot
```

## Discord Bot Setup

The bot is optional and stays dormant until `DISCORD_BOT_TOKEN` is set. To enable it:

### 1. Create the application + bot
1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) → **New Application**.
2. Open the **Bot** tab → **Reset Token** → copy it into `DISCORD_BOT_TOKEN` (`.env` locally, the `backend` service env on Railway). Keep this secret — it is never stored in the database.
3. **Privileged Gateway Intents** (Bot tab): if you want the chat/relay listener (`on_message` reading text), enable **Message Content Intent**. Without it the listener still fires but `message.content` is empty. Slash commands do **not** need this.

### 2. Invite the bot to a server
Build an OAuth2 invite URL (OAuth2 → URL Generator):
- Scopes: `bot`, `applications.commands`
- Bot permissions: at minimum **Send Messages** (+ **Read Message History** if relaying)

Open the generated URL and add the bot to your server.

### 3. Dev: instant slash-command sync
Set `DISCORD_GUILD_ID` to your test server's id (enable Developer Mode in Discord → right-click the server → Copy Server ID). The bot syncs commands **per-guild** on startup, which appears within seconds. Leaving it unset does a **global** sync, which can take up to an hour to propagate — only do that for production.

### 4. Enable + configure runtime behavior (admin panel / DB)
The token and guild id come from env; everything else is DB-configured (admin config), so it's editable without a redeploy:
- `discord_bot_enabled` — must be `true` for the bot to act on inbound commands/messages.
- `discord_bot_command_channel` — channel id commands are allowed in and where bot notifications/test posts go.
- `discord_bot_listen_channels` — comma-separated channel ids the relay listener acts on.

Test posting with `POST /admin/config/test-bot` once a command channel is set.

### 5. Route task notifications through the bot (optional)
Create a `notification_channels` row with `strategy="discord_bot"` and `config={"channel_id": "<id>"}`, then point a task's `admin_notify_config.channel_name` at it. Task lifecycle notifications will then post via the bot instead of a webhook.
