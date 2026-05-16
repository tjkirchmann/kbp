# Skill: Frontend Split

You are breaking apart one or more large frontend files into smaller, focused components. **Do not change any rendered output, logic, props, or data fetching.** This is purely structural decomposition.

**You must enter plan mode immediately.** Do not write any code or make any edits until the user has approved the decomposition plan.

---

## Trigger

When invoked, read any context the user provided (target files, goals, constraints) from the skill args or the surrounding message. If no target files are specified, ask the user to name them before proceeding.

---

## Phase 1 — Audit (read-only, Explore agents)

Launch up to 3 Explore agents in parallel to gather:

1. **File inventory** — line counts, file sizes, number of exported vs. internal symbols for each target file
2. **Inline components** — function components defined inside another component or page file
3. **Logical groupings** — distinct UI sections, tabs, panels, or concerns that could become their own files
4. **Reuse candidates** — existing files in `src/frontend/src/components/` that overlap with what's being extracted

Report findings as a bulleted audit before moving to Phase 2.

---

## Phase 2 — Decomposition Plan

Produce a plan with the following format for each proposed extraction:

```
## Extract: <ComponentName>
- Source: <path/to/source/file.tsx> (lines X–Y)
- Destination: src/frontend/src/components/<ComponentName>.tsx
- Reason: <one sentence — why this deserves its own file>
- Import change in source: import { <ComponentName> } from '@/components/<ComponentName>'
```

Then list all import changes needed in the source file as a summary block.

Naming rules:
- Page-specific sub-components → `<PageName><ComponentName>.tsx` or grouped into `<PageName>Parts.tsx`
- Reusable across pages → `<ComponentName>.tsx`
- Target ~100–150 lines per extracted file; split further if still too large

---

## Phase 3 — Await Approval

Present the full decomposition plan and **stop**. Do not implement until the user approves. Use `ExitPlanMode` to hand off.

---

## Constraints (carry over from `frontend-organize`)

- No rendered output changes — same JSX structure, same nesting
- No prop types, TypeScript interfaces, hooks, or event handlers altered
- No logic or data fetching moved — only component function bodies
- All new files go in `src/frontend/src/components/`
- Use `cn()` from `@/lib/utils` for conditional class merging
- Tailwind utility classes only — no inline styles
- shadcn/ui primitives preferred over custom implementations
- Read `DESIGN.md` at the repo root if any style decisions come up

---

## Extracted Component Template

```tsx
// src/frontend/src/components/MyComponent.tsx
import { cn } from '@/lib/utils'

interface MyComponentProps {
  // copy props exactly from inline definition
  className?: string
}

export function MyComponent({ className }: MyComponentProps) {
  return (
    <div className={cn('...', className)}>
      {/* exact JSX from inline definition */}
    </div>
  )
}
```

---

## Verification (after implementation is approved and complete)

- No JSX structure changed in any source file
- No prop types or TypeScript interfaces removed or altered
- `tsc --noEmit` passes
- All imports resolve — no broken references
