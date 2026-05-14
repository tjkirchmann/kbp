# Skill: Frontend Organize

You are refactoring KBP frontend files for organization. **Do not change any rendered output, logic, props, or data fetching.** This is purely structural cleanup.

---

## Rules

1. **No inline components** — any function component defined inside a page or another component must be extracted to its own file in `src/frontend/src/components/`. Update all imports.
2. **No inline styles** — remove all `style={{...}}` attributes. Replace with Tailwind utility classes. If no direct Tailwind class exists, add a named class to `src/frontend/src/index.css`.
3. **No raw colors** — replace hardcoded hex/rgba values in `className` strings with semantic Tailwind tokens from the design system (see table below).
4. **Preserve everything else** — JSX structure, prop types, TypeScript interfaces, hooks, event handlers, conditional rendering, and comments must remain identical.
5. Read `DESIGN.md` at the repo root before starting — it is the source of truth for semantic tokens.

---

## Workflow

**Step 1 — Audit**

Read the target file(s). Produce a list of every violation:
- Inline components (function defined inside another function/component)
- `style={{...}}` attributes
- Hardcoded hex/rgba values in `className` strings

**Step 2 — Plan extraction**

For each inline component, decide its destination:
- Small, page-specific sub-components → `src/components/<PageName><ComponentName>.tsx` or grouped into a single `src/components/<PageName>Parts.tsx`
- Reusable across pages → `src/components/<ComponentName>.tsx`

**Step 3 — Refactor**

Apply all three fix categories. In the source file, add the new imports and remove the extracted function bodies.

**Step 4 — Verify**

Confirm:
- No JSX structure changed in the source file (same elements, same nesting)
- No prop types or TypeScript interfaces removed or altered
- No logic or data fetching moved
- `tsc --noEmit` passes

---

## Inline Style → Tailwind Reference

| Inline style | Tailwind class |
|---|---|
| `whiteSpace: 'nowrap'` | `whitespace-nowrap` |
| `width: '1%'` | `w-[1%]` |
| `display: 'none'` | `hidden` |
| `display: 'flex'` | `flex` |
| `cursor: 'pointer'` | `cursor-pointer` |
| `overflow: 'hidden'` | `overflow-hidden` |
| `fontWeight: 'bold'` | `font-bold` |
| `textAlign: 'center'` | `text-center` |
| `marginTop: 'auto'` | `mt-auto` |

For anything not in this list, use a Tailwind arbitrary value `[value]` or add a named CSS class to `index.css`.

---

## Raw Color → Semantic Token Reference

| Raw value | Semantic token |
|---|---|
| `#1A1D24` | `bg-card` |
| `rgba(26,30,42,...)` | `bg-card` with opacity modifier e.g. `bg-card/40` |
| `#111318` | `bg-background` |
| `rgba(13,15,19,...)` | `bg-background/60` |
| `#009CDE` | `text-primary` or `bg-primary` |
| `rgba(0,156,222,...)` | `text-primary/...` or `bg-primary/...` |
| `#3FB950` | `text-success` or `bg-success` |
| `#F0A429` | `text-warning` or `bg-warning` |
| `#E5534B` | `text-destructive` or `bg-destructive` |
| `rgba(255,255,255,...)` | `bg-white/...` or `text-white/...` |

If a raw rgba is used only for a hover state and has no exact semantic equivalent, use `hover:bg-card/60` or the closest opacity variant. Check `index.css` for exact variable definitions before guessing.

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

## Example — Before / After

**Before (inline style + raw color in page file):**
```tsx
<th style={{ width: '1%' }} className="text-[#1A1D24]">Actions</th>
<td style={{ width: '1%', whiteSpace: 'nowrap' }}>...</td>
```

**After:**
```tsx
<th className="w-[1%] text-card">Actions</th>
<td className="w-[1%] whitespace-nowrap">...</td>
```

**Before (inline component in page file):**
```tsx
// inside UsersPanel.tsx
function UserRow({ user }: { user: User }) {
  return <tr>...</tr>
}
export default function UsersPanel() { ... }
```

**After:**
```tsx
// src/components/UserRow.tsx
export function UserRow({ user }: { user: User }) {
  return <tr>...</tr>
}

// UsersPanel.tsx
import { UserRow } from '@/components/UserRow'
export default function UsersPanel() { ... }
```
