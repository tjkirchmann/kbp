.PHONY: up down deploy migrate frontend-component backend frontend-logic

# ── Dev ──────────────────────────────────────────────────────────────────────

up:
	docker compose up --build

down:
	docker compose down

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
