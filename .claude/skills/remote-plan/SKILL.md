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

## Workflow contract (non-negotiable — read first)

Every `/remote-plan` invocation runs **all phases A → E, in order, to
completion** — no matter how small, meta, or "obviously just a quick edit" the
request looks. **Editing files is not the deliverable.** The deliverable is a
pushed `remote/<feature-slug>` branch with a draft PR and a closed session.
Tasks like "edit this skill", "tweak a config", or "fix a typo" still run the
full flow — they are not exceptions.

A run is complete **only when every box below is checked**:

- [ ] On a `remote/<feature-slug>` branch (Phase A)
- [ ] Plan presented and approved via `ExitPlanMode` (Phase B)
- [ ] `planning/<feature-slug>.md` committed as `plan: <feature-title>` (Phase C)
- [ ] Draft PR opened with the plan file as its body (Phase C)
- [ ] Verification run and green (Phase D)
- [ ] Implementation committed as `feat: <feature-title>` and pushed (Phase D)
- [ ] Final report printed, then the `cc-*` tmux session closed (Phase E)

**Self-check before ending any turn:** if you have edited files but not opened a
PR, you have skipped Phases C–E — **stop and resume at the first unchecked box**;
do not end the turn. The *only* place you pause for the user is `ExitPlanMode`
(Phase B). Between that approval and the PR there is **no** stopping point — never
report "done" after merely editing files.

## Remote access (load-bearing)

Remote Control auto-starts for this repo via `.claude/settings.json`
(`remoteControlAtStartup: true` — the real setting; the older
`enableRemoteControlByDefault` is a no-op and does nothing), so the bridge comes
up automatically each session — no in-session action is required. As Phase A
step 1, print this reminder so the user knows they can walk away:

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
    the restore command (see Note). This report is the **last thing the user
    sees** — Phase E tears the session down right after it.

## Phase E — Close the session (deterministic, do this last)

The `cc` worktree manager runs each session in its own tmux session named
`cc-<worktree>`. Once the Phase D report is printed and everything is pushed,
close that tmux session so the worktree shuts down cleanly instead of lingering.

13. Print the Phase D report **first** — killing the tmux session also kills this
    Claude process, so nothing after the kill will run or be seen.
14. Then close the session. Only kill when actually inside a `cc-*` tmux session
    (so a manual run from the user's own terminal/tmux is left untouched):
    ```bash
    if [ -n "$TMUX" ] && tmux display-message -p '#S' | grep -q '^cc-'; then
      tmux kill-session -t "$(tmux display-message -p '#S')"
    fi
    ```
    If not in a `cc-*` tmux session, skip the kill and just note that the run is
    complete — there's no session to close.

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

- The Workflow contract is binding: run **all** phases A → E every time, with no
  fast-path for small/meta/config/typo changes. Editing files is never "done".
- Phase A is deterministic — run it before any planning.
- The `ExitPlanMode` approval is the only gate, and it is **required** even for
  trivial changes — always present a (brief) plan and call `ExitPlanMode` rather
  than editing directly. After approval, build to completion through the PR and
  Phase E without asking for further go-aheads.
- Never push an unverified build (Phase D step 10).
- End commit messages with the Co-Authored-By trailer:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- Keep the plan branch named `remote/<feature-slug>` exactly — it's the
  convention the user relies on.
- Phase E runs last and only after the final report is printed — never kill the
  tmux session before the user has the PR URL and SHAs, and only kill a `cc-*`
  session.
```
