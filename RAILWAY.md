# Railway Deployment

This project runs 3 services on Railway. The backend API, the Temporal worker, and the Discord bot all run inside the single `backend` service managed by supervisord. Background jobs (CFBD + ESPN sync) run on Temporal as durable workflows + schedules (`app/temporal/`). The Discord bot is a long-lived gateway connection that listens for slash commands / messages and posts; it stays dormant (exits cleanly, no restart loop) until `DISCORD_BOT_TOKEN` is set.

> **Deployment gap (TODO):** the Temporal worker needs a Temporal **server** to connect to. Locally that's the `temporal` compose service; in prod it must be Temporal Cloud (set `TEMPORAL_API_KEY` + `TEMPORAL_ADDRESS`/`TEMPORAL_NAMESPACE`) or a self-hosted Temporal service on Railway. This is not yet provisioned — `app/core/temporal.py` reads the connection from env and supports both, but the prod target must be stood up before the worker will run.

## Services

| Service | Root Directory | Notes |
|---------|---------------|-------|
| `frontend` | `src/frontend` | nginx, serves built React app |
| `backend` | `src/backend` | uvicorn + temporal worker + discord bot via supervisord |
| `postgres` | Railway managed | app data (Temporal state lives in the Temporal server's own store) |

## Setting Up a New Environment

### 1. Add managed services
In the Railway project, add:
- **PostgreSQL** plugin

### 2. Create application services
Create two services pointing at this repo:
- `frontend` → Root Directory: `src/frontend`
- `backend` → Root Directory: `src/backend`

Both have `railway.toml` files that tell Railway which Dockerfile to use and how to health-check them. No start command override needed — `backend` runs `./start.sh` which runs migrations, then starts supervisord (which manages uvicorn and the temporal worker).

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
AWS_ACCESS_KEY_ID=          # file library (S3) — see "S3 File Library" below
AWS_SECRET_ACCESS_KEY=
S3_REGION=us-east-1
S3_BUCKET_NAME=your-bucket
# Leave S3_ENDPOINT_URL / S3_PUBLIC_ENDPOINT_URL UNSET in prod → boto3 uses real AWS.
```

**`frontend` service (build-time):**
```
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
VITE_API_URL=https://your-backend.up.railway.app
```

### 4. Deploy order
Deploy `postgres` first (Railway resolves `${{...}}` references automatically). Then deploy the two application services. `backend` runs Alembic migrations on startup before any processes come up.

## Local Development

Local dev uses `docker compose up --build` from the repo root. The Temporal worker runs as a separate `temporal_worker` container locally (better log isolation, can restart independently), against the local `temporal` server service. supervisord is only used in the production container.

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

## S3 File Library

The admin **Library** tab uploads files directly to S3 via presigned POST and tracks them in the `library_files` table. Local dev uses MinIO (auto-provisioned by `docker compose`, console at http://localhost:9001, login `minioadmin`/`minioadmin`) — no AWS account needed. The steps below are for **production** only.

### 1. Create the bucket
- Create an S3 bucket in your region.
- **Block Public Access = ON** (all four settings). Nothing in the bucket is public; the app serves files via short-lived presigned GET URLs.

### 2. CORS (required — the browser uploads/downloads directly)
Set this CORS config on the bucket, replacing the origin with your frontend URL:
```json
[
  {
    "AllowedOrigins": ["https://your-frontend.up.railway.app"],
    "AllowedMethods": ["GET", "POST", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

### 3. Least-privilege IAM user
Create a dedicated IAM user with programmatic access and this policy (scoped to the library prefix):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::YOUR_BUCKET/library/*"
    }
  ]
}
```
(`HeadObject` is covered by `s3:GetObject`.)

### 4. Wire up env
Put the IAM user's keys, region, and bucket into the `backend` service env (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_REGION`, `S3_BUCKET_NAME`). Leave `S3_ENDPOINT_URL` and `S3_PUBLIC_ENDPOINT_URL` **unset** so boto3 talks to real AWS.
