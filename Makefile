.PHONY: up build down logs logs-frontend logs-backend logs-worker logs-db deploy migrate frontend-component backend frontend-logic frontend-organize

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
