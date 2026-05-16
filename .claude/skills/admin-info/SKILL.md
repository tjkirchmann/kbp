# Skill: Admin Info Panel Content

You are updating the informational descriptions shown when a user clicks the "i" button in the admin shell. Each admin section has a `title`, `description`, and `features[]` entry in `AdminInfoPanel.tsx`.

## Goal

Read each admin panel component, understand what it actually renders and what API calls it makes, then write accurate prose descriptions for `AdminInfoPanel.tsx`.

## Steps

1. **Read the info panel** — `src/frontend/src/pages/admin/AdminInfoPanel.tsx` — understand the current content and data shape.

2. **Read each panel component** listed below. For each one, note:
   - What data it fetches (which `useAdmin*` hooks)
   - What actions/mutations are available
   - Any multi-step flows, modals, or sub-views
   - Edge cases (locked states, empty states, etc.)

   | Section key | Component file(s) |
   |---|---|
   | `general` | `src/frontend/src/pages/admin/GeneralPanel.tsx` |
   | `users` | `src/frontend/src/pages/admin/UsersList.tsx`, `src/frontend/src/pages/admin/UserDetail.tsx` |
   | `pools` | `src/frontend/src/pages/admin/PoolsList.tsx`, `src/frontend/src/pages/admin/PoolDetail.tsx`, `src/frontend/src/pages/admin/PoolCreate.tsx` |
   | `teams` | `src/frontend/src/pages/admin/TeamsList.tsx` |

3. **Update `AdminInfoPanel.tsx`** — for each section, write:
   - `title`: short, plain noun phrase (e.g. "General Settings")
   - `description`: 1–2 sentence summary of what the section manages. No implementation details.
   - `features[]`: one entry per distinct piece of functionality. Each feature gets:
     - `name`: the label as it appears in the UI (or a clear noun phrase if unlabeled)
     - `description`: 1–3 sentences explaining what it does, when to use it, and any caveats (destructive actions, irreversibility, dependencies)

## Rules

- Write for an admin user, not a developer. No code, no API paths, no component names.
- Be accurate — only describe what the panel actually does today.
- Keep feature descriptions tight. If something is obvious from the name, say the non-obvious part.
- If a new admin section has been added that isn't in the `INFO` map, add it.
- If a section's functionality has changed significantly, rewrite its entry.
- Do not touch the layout/rendering code — only the `INFO` data object.
