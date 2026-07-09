---
name: squash-merge-blockers
description: Clear trivial pre-merge check failures after a merge or rebase in the KBP monorepo. Use when merge/rebase CI is red with auto-fixable failures — trailing whitespace, EOF newlines, line endings, unresolved conflict markers in simple files, ruff/eslint/prettier format drift, or large files accidentally staged. Handles the mechanical blockers so only issues needing human judgment remain.
---

# Skill: Squash Trivial Merge Blockers

You are clearing pre-merge check failures from a merge or rebase in the KBP monorepo.
Fix the mechanical, auto-fixable blockers fast — then report what remains that needs
human judgment. Do **not** guess at code intent.

---

## Trivial vs. not trivial

**Trivial — fix automatically:**

- Unresolved conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) in files where the conflict is simple (non-overlapping additions, import-only differences, one side deleting untouched code)
- Trailing whitespace
- Missing EOF newlines
- Mixed line endings (`\r\n`) — standardize to LF
- Ruff lint autofixes (unused imports, import ordering, etc.)
- Ruff format drift
- ESLint autofixes
- Prettier format drift
- Large files accidentally staged (`check-added-large-files`)

**Not trivial — report, do not fix:**

- Complex conflict hunks where both sides changed the same logic
- Type errors (`mypy`, `tsc --noEmit`)
- Test failures
- Migration chain integrity (broken `down_revision`, multiple heads)
- Actual logic bugs or semantic drift

**Rule:** if a fix requires understanding code intent, surface it with file paths and error summaries. Do not guess.

---

## Pre-merge checks in this repo

### Pre-commit hooks (`.pre-commit-config.yaml`)

| Hook | Fix method |
|---|---|
| `trailing-whitespace` | auto-fix |
| `end-of-file-fixer` | auto-fix |
| `check-yaml` | manual (syntax error) |
| `check-toml` | manual (syntax error) |
| `check-merge-conflict` | manual (resolve markers) |
| `check-added-large-files` | manual (`git rm --cached` or git-lfs) |
| `mixed-line-ending` | auto-fix to LF |
| `ruff` (backend lint) | `uv run ruff check --fix .` |
| `ruff-format` (backend) | `uv run ruff format .` |
| `mypy` (backend) | **do not fix** — report |
| `ESLint` (frontend) | `npm run lint -- --fix` |
| `Prettier` (frontend) | `npm run format` |

### CI workflows (`.github/workflows/`)

- **lint.yml** — ruff check, ruff format --check, mypy, eslint, prettier --check, tsc --noEmit
- **migrations.yml** — single head, chain integrity, one-migration-per-PR

---

## Workflow

### 1. Assess the situation

```bash
git status                      # in-progress merge/rebase?
git diff --name-only --diff-filter=U   # files with conflicts
git log --oneline -5            # merge context
```

### 2. Pull the actual CI failures — do not guess

Check what GitHub Actions actually reported before touching any code:

```bash
# Which PR is this branch tied to?
gh pr view --json number,title,state,statusCheckRollup

# List all failing checks on this PR
gh pr checks

# For each failed check, pull the job log to see exact errors
gh pr checks --json name,state,bucket,workflowName,jobName

# If there's a specific failed run you need to inspect deeper:
gh run view <run-id> --log --job <job-id>
```

**Parse the job logs.** Extract the exact failure messages — file paths, line numbers, error codes. Only act on what CI actually reported. If CI is green but the user reports a merge issue, confirm with them before proceeding.

### 3. Resolve conflict markers first

If `git diff --name-only --diff-filter=U` has output, resolve those before anything else.
Running `make lint` on a tree with unresolved markers will produce noise.

For each conflicted file:
- Read it, find `<<<<<<<`, `=======`, `>>>>>>>` markers.
- **Simple conflicts** (different imports, additions in non-overlapping regions, one side deleting what the other didn't touch): resolve and `git add`.
- **Complex conflicts** (same function/logic changed on both sides): stop and report — describe what each side did, let the user decide.

Once all conflict markers are cleared and files staged:

```bash
git diff --check   # quick sanity: any remaining conflict markers?
```

### 4. Match CI failures to local checks

Cross-reference the CI job logs from step 2 against these local commands. Run only the checks that CI flagged — don't waste time on already-green checks:

```bash
# If CI flagged ruff issues:
cd src/backend && uv run ruff check .

# If CI flagged ruff format:
cd src/backend && uv run ruff format --check .

# If CI flagged eslint:
cd src/frontend && npm run lint

# If CI flagged prettier:
cd src/frontend && npm run format:check

# Or run everything at once if CI flagged multiple:
make lint
```

### 5. Apply auto-fixes

Backend:
```bash
cd src/backend && uv run ruff check --fix . && uv run ruff format .
```

Frontend:
```bash
cd src/frontend && npm run lint -- --fix && npm run format
```

Then stage any auto-fixed files:
```bash
git add -A
```

### 6. Re-run the specific checks that failed and report what's left

Re-run **only** the checks that CI originally failed — the same local commands from step 4 — not the whole suite.

Categorize remaining failures:

| Failure type | Action |
|---|---|
| Trailing whitespace / EOF / line endings still failing | Apply manually (rare — pre-commit usually handles these) |
| Large files | `git rm --cached <file>` or explain to user |
| mypy / tsc / test failures | Report with file paths and error summaries |
| Complex conflicts still unresolved | Report with conflict summary per file |

### 7. Check migrations (if applicable)

If the branch touches `src/backend/alembic/versions/`:

```bash
make migrate-check
```

If >1 new migration: remind the user about squash-to-one (migration skill), but do **not**
squash without explicit instruction — migration squashing is not trivial.

### 8. Finish

Once trivial blockers are cleared and only non-trivial issues remain (or none):

```bash
git add -A
```

Report ready state to user. If there are non-trivial failures, list them clearly.
If entirely clean, the merge/rebase is ready to complete.

---

## Key rules

- **Never `git merge --abort` or `git rebase --abort`** unless the user explicitly asks.
- **Always check CI results with `gh` first.** Never theorize about what's broken — pull the actual job logs.
- **Resolve conflict markers before running any linters.**
- **Re-run only the checks CI flagged**, not the full suite.
- **Backend uses uv** (from `src/backend/`), not pip.
- **Frontend needs `npm install`** completed first (from `src/frontend/`).
- **When in doubt, report, don't fix.**
