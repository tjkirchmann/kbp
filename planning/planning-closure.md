# Remote-Plan Session Closure & Remote-Control Fix

## Context

Two problems with the `remote-plan` skill flow:

1. **Lingering sessions.** When a `/remote-plan` run finishes, the tmux session
   created by the `cc` worktree manager stays open. The user wants the session
   torn down automatically once the run is done.
2. **Remote Control never auto-starts.** The repo's `.claude/settings.json` set
   `enableRemoteControlByDefault: true`, but that key is **not a real Claude Code
   setting** (confirmed absent from the installed CLI binary, v2.1.178). It was
   silently ignored, so the user had to run `/remote-control` by hand every
   session.

---

## Goals / Non-goals

- Goal: auto-start Remote Control for this repo using the correct setting.
- Goal: close the `cc-*` tmux session automatically at the end of a run.
- Non-goal: change how planning/building phases themselves work.
- Non-goal: kill non-`cc` tmux sessions (e.g. a manual run in the user's own
  terminal).

---

## Approach

**Remote Control.** Replace the no-op `enableRemoteControlByDefault` with the
real settings.json key `remoteControlAtStartup` (schema description: *"Start
Remote Control bridge automatically each session"*). Verified it lives in the
same settings schema as `agentPushNotifEnabled`, which already works in the
user's settings. Takes effect on the next session start.

**Session closure.** Add a deterministic **Phase E** to the skill that runs
last. It prints the Phase D report first (killing tmux also kills the Claude
process), then kills the session only when inside a `cc-*` tmux session:

```bash
if [ -n "$TMUX" ] && tmux display-message -p '#S' | grep -q '^cc-'; then
  tmux kill-session -t "$(tmux display-message -p '#S')"
fi
```

---

## Affected files

- `.claude/settings.json` — `enableRemoteControlByDefault` → `remoteControlAtStartup: true`
- `.claude/skills/remote-plan/SKILL.md` — correct the Remote access section, add
  Phase E, add a Rules entry for the ordered/guarded teardown

---

## Verification

- `grep` the installed CLI confirms `enableRemoteControlByDefault` is absent and
  `remoteControlAtStartup` is a documented boolean setting.
- The Phase E guard resolves correctly in this worktree
  (`cc-planning-closure`) and skips when not in a `cc-*` session.
- New `cc` worktree sessions auto-connect Remote Control without a manual
  `/remote-control`.

---

## Open questions

- None.
