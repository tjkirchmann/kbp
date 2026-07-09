# Skill: Squash Trivial Merge Blockers

You are clearing pre-merge check failures from a merge or rebase in the KBP monorepo.
Your job is to fix the mechanical, auto-fixable blockers fast — then report what's left
that needs human judgment.

---

## What's trivial vs. what's not

| Trivial (fix automatically) | Not trivial (report, don't guess) |
|---|---|
| Unresolved conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) — simple cases | Complex conflict hunks where both sides changed the same logic |
| Trailing whitespace | Type errors (`mypy`, `tsc --noEmit`) |
| Missing EOF newlines | Test failures |
| Mixed line endings (`\r\n` in a Unix repo) | Migration chain integrity issues (broken `down_revision`) |
| Ruff lint autofixes (unused imports, import order, etc.) | Actual logic bugs |
| Ruff format drift | |
| ESLint autofixes | |
| Prettier format drift | |
| Large files accidentally staged (`check-added-large-files`) | |

**Rule**: if a fix requires understanding code intent beyond "which side of the conflict
was merged to main vs. the branch," it's not trivial. Surface it clearly.

---

## Pre-merge checks in this repo

### Local pre-commit hooks (`.pre-commit-config.yaml`)
```
trailing-whitespace     → auto-fix
end-of-file-fixer       → auto-fix
check-yaml              → manual (syntax errors)
check-toml              → manual (syntax errors)
check-merge-conflict    → manual (resolve markers)
check-added-large-files → manual (remove or git-lfs)
mixed-line-ending       → auto-fix to LF
ruff (backend lint)     → auto-fix via --fix
ruff-format (backend)   → auto-fix
mypy (backend)          → NOT trivial
ESLint (frontend)       → auto-fix via --fix
Prettier (frontend)     → auto-fix via --write
```

### CI workflows (`.github/workflows/`)
1. **lint.yml** — ruff check, ruff format --check, mypy, eslint, prettier --check, tsc --noEmit
2. **migrations.yml** — single head, chain integrity, one-migration-per-PR

---

## Workflow

### 1. Assess the situation

```bash
# Is there an in-progress merge/rebase?
git status
# What files have conflicts?
git diff --name-only --diff-filter=U
# What's the merge context?
git log --oneline -5
```

### 2. Run the pre-commit suite to see what's failing

```bash
make lint
```

Don't run `make lint` if there are unresolved conflict markers — fix those first (step 3).

### 3. Fix unresolved conflict markers (check-merge-conflict)

For each conflicted file:
- Read the file, identify `<<<<<<<`, `=======`, `>>>>>>>` markers
- For **simple** conflicts (different imports, additions in non-overlapping regions, one side deleting what the other didn't touch):
  - Resolve and `git add`
- For **complex** conflicts (same function/logic changed on both sides):
  - Stop and report to the user with a summary of what each side did

### 4. Run auto-fixers (one per layer)

**Backend** — fix formatting and lint issues:

```bash
cd src/backend && uv run ruff check --fix . && uv run ruff format .
```

**Frontend** — fix formatting and lint issues:

```bash
cd src/frontend && npm run lint -- --fix && npm run format
```

### 5. Run pre-commit again to see what remains

```bash
make lint
```

### 6. Report what's left

Categorize remaining failures:
- **Auto-fixable but didn't fix**: trailing whitespace, EOF newlines, line endings — apply manually
- **Large files**: `git rm --cached <file>` or explain to user
- **Type errors, test failures, complex conflicts**: report to user with file paths and error summaries. Do NOT attempt to fix.

### 7. If the migration check might run

If the PR touches `src/backend/alembic/versions/`:

```bash
make migrate-check
```

If there are >1 new migration files, remind the user about the squash-to-one rule
(see the migration skill), but don't squash without explicit instruction — migration
squashing is not trivial.

### 8. Stage and continue

Once all trivial blockers are cleared:
```bash
git add -A
```

If there are no remaining non-trivial failures, tell the user the merge/rebase
is ready to complete.

---

## Key rules

- **Never `git merge --abort` or `git rebase --abort`** unless the user explicitly asks.
- **Don't touch type errors.** They require understanding the code. Report them.
- **Run `make lint` at least twice** — once to see what's broken, once after fixes.
- **Frontend tooling needs `npm install`** completed first (from `src/frontend/`).
- **Backend uses uv**, not pip. Commands run from `src/backend/`.
- **When in doubt, report, don't fix.**
