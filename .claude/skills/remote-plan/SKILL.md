# Skill: Remote Plan and Build

Take a one-line feature description and run it end to end: get onto a clean
feature branch, plan the feature with the user, write the approved plan to
`planning/`, then build and verify the feature — all in a single session the
user can remote into from the Claude app and steer from their phone.

Invocation: `/remote-plan <feature description>`.

Derive a kebab-case `<feature-slug>` from the description (lowercase, words
joined by `-`, no punctuation). Derive a short Title Case `<feature-title>` for
commit messages and headings. Example: `add a healthcheck endpoint` →
slug `add-a-healthcheck-endpoint`, title `Add a Healthcheck Endpoint`.

## Remote access (load-bearing)

Remote Control is enabled by default for this repo via `.claude/settings.json`
(`enableRemoteControlByDefault: true`), so the session is remotable from the
moment it starts — no in-session action is required. As Phase A step 1, print
this reminder so the user knows they can walk away:

> Remote Control is on by default for this repo — this session is already
> accessible from claude.ai/code and the mobile Code tab. If it's not connected,
> type `/remote-control` (`/rc`) and pick it up there.

Do not try to invoke `/remote-control` yourself — it is a built-in command, not
callable from inside a skill. The settings default does the work.

## Phase A — Branch setup (deterministic, do this first)

1. Print the remote-access reminder above.
2. Check where you are: `git branch --show-current`.

   **Case 1 — already on a `remote/*` branch (the normal case when launched via
   the `cc` worktree manager).** You're in a dedicated worktree and ready to go.
   Set `<feature-slug>` = the current branch with the `remote/` prefix removed.
   **Skip the rest of Phase A** — do not checkout main or create a branch (main
   is checked out in the base repo and a worktree can't switch to it).

   **Case 2 — on `main` or any other branch (invoked directly, no worktree).**
   Do the branch setup yourself:
   - `git status --porcelain`; if dirty, `git stash push -u -m "remote-plan auto-stash"`
     and record that a stash was made + the original branch name (for the restore
     note at the end).
   - `git checkout main && git pull --ff-only`
   - `git checkout -b remote/<feature-slug>`

## Phase B — Plan (interactive, gated)

5. Plan the feature. Research it against the codebase (use Explore/Plan
   subagents and load any relevant repo skills), then present a concise plan and
   call `ExitPlanMode` for approval. **This approval is the single gate for the
   whole run** — once approved, proceed through Phase C and D without further
   prompting.

## Phase C — On approval: write + commit the plan (commit 1)

6. Create `planning/` if it doesn't exist. Write `planning/<feature-slug>.md`
   using the template below.
7. Commit just the plan:
   ```bash
   git add planning/<feature-slug>.md
   git commit -m "plan: <feature-title>"
   ```
8. Push and open a **draft PR** with the plan file as the body:
   ```bash
   git push -u origin remote/<feature-slug>
   gh pr create --draft --title "<feature-title>" --body-file planning/<feature-slug>.md
   ```

## Phase D — Auto-build the feature (commit 2)

9. Implement the feature per the approved plan, loading relevant repo skills
   (`backend`, `frontend-component`, `frontend-logic`, `migration`,
   `add-sync-workflow`, etc.).
10. **Verify** before committing: run the plan's Verification steps, reusing the
    repo's `verify` / `run` skills and existing tests. Fix any failures before
    proceeding — do not push a broken build.
11. Commit the implementation:
    ```bash
    git add -A
    git commit -m "feat: <feature-title>"
    git push
    ```
    The draft PR updates automatically.
12. Report: the PR URL, both commit SHAs, and — if a stash was made in Phase A —
    the restore command (see Note).

## Plan file template (`planning/<feature-slug>.md`)

```markdown
# <Feature Title>

## Context
Why this feature; the problem/need and intended outcome.

## Goals / Non-goals
- Goal: ...
- Non-goal: ...

## Approach
The recommended implementation. Reference existing functions/utilities + file paths to reuse.

## Affected files
- `path` — what changes

## Verification
How to confirm it works end-to-end (tests, app run, MCP checks).

## Open questions
- ...
```

Match the markdown style of `AGENTS.md` / `DESIGN.md`: descriptive headers,
tables for structured info, fenced code blocks with language hints, `---`
between major sections.

## Note on auto-stash & restore

Feature work happens on `remote/<feature-slug>` and the session stays there so
the user can review/continue from the app. **Do not** `git stash pop` onto the
feature branch — that would mix unrelated WIP into the feature commits. Instead,
preserve the stash and report the exact restore command at the end:

```
git checkout <original-branch> && git stash pop
```

## Rules

- Phase A is deterministic — run it before any planning.
- The `ExitPlanMode` approval is the only gate. After it, build to completion
  without asking for further go-aheads.
- Never push an unverified build (Phase D step 10).
- End commit messages with the Co-Authored-By trailer:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- Keep the plan branch named `remote/<feature-slug>` exactly — it's the
  convention the user relies on.
```
