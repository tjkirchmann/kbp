.PHONY: up build down logs logs-frontend logs-backend logs-worker logs-db logs-temporal logs-temporal-worker temporal-run temporal-cfbd-facts temporal-cfbd-dims deploy migrate frontend-component backend frontend-logic frontend-organize lint install-hooks

# ── Lint ─────────────────────────────────────────────────────────────────────
# One-time setup: install the git pre-commit hook.
install-hooks:
	uvx pre-commit install

# Lint + format the whole repo (backend via Ruff, frontend via ESLint+Prettier).
lint:
	uvx pre-commit run --all-files

# ── Dev ──────────────────────────────────────────────────────────────────────

up:
	docker compose up -d

build:
	docker compose up -d --build

down:
	docker compose down

# ── Logs ─────────────────────────────────────────────────────────────────────

logs:
	docker compose logs -f

logs-frontend:
	docker compose logs -f frontend

logs-backend:
	docker compose logs -f backend

logs-worker:
	docker compose logs -f procrastinate_worker

logs-db:
	docker compose logs -f db

logs-temporal:
	docker compose logs -f temporal

logs-temporal-worker:
	docker compose logs -f temporal_worker

# ── Temporal ─────────────────────────────────────────────────────────────────
# Kick off the sample workflow end-to-end. UI: http://localhost:8080
# Usage: make temporal-run        (greets "KBP")
#        make temporal-run NAME=Ty
temporal-run:
	docker compose run --rm temporal_worker python -m app.temporal.starter $(NAME)

# Kick off a one-off CFBD facts ingest (replaces the admin "Run now" button).
# The daily run is driven by a Temporal Schedule registered on worker boot.
temporal-cfbd-facts:
	docker compose run --rm temporal_worker python -m app.temporal.cfbd_facts.starter

# Trigger an immediate run of the nightly CFBD-dims workflow (the 'Run now').
# Ensures the schedule exists, then fires one off-schedule execution.
temporal-cfbd-dims:
	docker compose run --rm temporal_worker python -m app.temporal.cfbd_dims.schedule

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
