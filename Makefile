.PHONY: up build down logs logs-frontend logs-backend logs-worker logs-db logs-temporal logs-temporal-worker temporal-cfbd-facts temporal-cfbd-dims temporal-cfbd-games temporal-cfbd-plays temporal-espn-seed struct-output-run deploy migrate migrate-new migrate-down migrate-check frontend-component backend frontend-logic frontend-organize struct-output lint test install-hooks

# ── Lint ─────────────────────────────────────────────────────────────────────
# One-time setup: install the git pre-commit hook.
install-hooks:
	uvx pre-commit install

# Lint + format the whole repo (backend via Ruff, frontend via ESLint+Prettier).
lint:
	uvx pre-commit run --all-files

# Backend tests: Temporal workflow behavior via the time-skipping test server
# (mocked activities, no DB/HTTP). Runs from src/backend.
test:
	cd src/backend && uv run pytest

# ── Dev ──────────────────────────────────────────────────────────────────────

up:
	docker compose up -d

build:
	docker compose up -d --build

down:
	docker compose down

restart:
	docker compose down && docker compose up -d

# ── Logs ─────────────────────────────────────────────────────────────────────

logs:
	docker compose logs -f

logs-frontend:
	docker compose logs -f frontend

logs-backend:
	docker compose logs -f backend

logs-worker:
	docker compose logs -f temporal_worker

logs-db:
	docker compose logs -f db

logs-temporal:
	docker compose logs -f temporal

logs-temporal-worker:
	docker compose logs -f temporal_worker

# ── Temporal ─────────────────────────────────────────────────────────────────
# Kick off a one-off CFBD facts ingest (replaces the admin "Run now" button).
# The daily run is driven by a Temporal Schedule registered on worker boot.
temporal-cfbd-facts:
	docker compose run --rm temporal_worker python -m app.temporal.cfbd_facts.starter

# Trigger an immediate run of the nightly CFBD-dims workflow (the 'Run now').
# Ensures the schedule exists, then fires one off-schedule execution.
temporal-cfbd-dims:
	docker compose run --rm temporal_worker python -m app.temporal.cfbd_dims.schedule

# Trigger a structured-output batch. Populate-only by default (skips entities that
# already have a row); pass OVERWRITE=1 to regenerate everyone.
# Usage: make struct-output-run NAME=program_profile [OVERWRITE=1]
struct-output-run:
	docker compose run --rm temporal_worker python -m app.temporal.struct_output.schedule $(NAME) $(if $(OVERWRITE),--overwrite,)

# Trigger an immediate one-off CFBD-games run (the 'Run now' for the games fact
# table). The frequent run is driven by a Temporal Schedule registered on boot.
temporal-cfbd-games:
	docker compose run --rm temporal_worker python -m app.temporal.cfbd_games.starter

# Trigger an immediate CFBD play-by-play backfill/refresh. Run-only (no schedule)
# — this is the sole trigger for the high-volume /plays + /plays/stats endpoints.
temporal-cfbd-plays:
	docker compose run --rm temporal_worker python -m app.temporal.cfbd_plays.starter

# Trigger an immediate ESPN seeder tick: seeds stub rows and spawns per-game
# pollers. The seeder otherwise runs every minute via a Temporal Schedule.
temporal-espn-seed:
	docker compose run --rm temporal_worker python -m app.temporal.espn.starter

# ── Deploy ───────────────────────────────────────────────────────────────────

deploy:
	@echo "Pushing to Railway..."
	railway up

# ── Database ─────────────────────────────────────────────────────────────────

migrate:
	cd src/backend && ./migrate.sh

migrate-new:
	@read -p "Migration name: " name; \
	docker compose exec backend alembic revision --autogenerate -m "$$name"

migrate-down:
	docker compose exec backend alembic downgrade -1

migrate-check:
	python3 src/backend/scripts/check_migrations.py

# ── Agent skills ─────────────────────────────────────────────────────────────

frontend-component:
	@echo "Loading frontend component skill..."
	@cat .claude/skills/frontend-component.md

backend:
	@echo "Loading backend skill..."
	@cat .claude/skills/backend.md

frontend-logic:
	@echo "Loading frontend logic skill..."
	@cat .claude/skills/frontend-logic.md

migration:
	@echo "Loading migration skill..."
	@cat .claude/skills/migration.md

frontend-organize:
	@echo "Loading frontend organize skill..."
	@cat .claude/skills/frontend-organize.md

struct-output:
	@echo "Loading structured-output skill..."
	@cat .claude/skills/struct-output/SKILL.md
