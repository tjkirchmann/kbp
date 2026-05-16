# Skill: Frontend Component Design

You are designing a React UI component for the Kirchmann Bowl Pool (KBP). Stack: React 18 + TypeScript + Tailwind CSS 4 + shadcn/ui + Radix UI + Lucide React.

**Always read `DESIGN.md` at the repo root before writing any component.** It is the source of truth for colors, spacing, typography, and component patterns.

---

## Rules

- All components go in `src/frontend/src/components/`
- Use shadcn/ui primitives first (Button, Card, Dialog, Input, etc.) — don't reinvent
- Install shadcn components with: `npx shadcn@latest add <component>`
- Use Tailwind utility classes only — no inline styles, no CSS modules
- All props must be typed with TypeScript interfaces
- Prefer composition over big monolithic components
- Keep components under ~150 lines; extract sub-components if larger
- Use `cn()` from `@/lib/utils` for conditional class merging
- No `any` types — use `unknown` + type guard if type is truly unknown
- Icons come from `lucide-react` only — no other icon libraries

---

## Design System Summary

### Colors
- Background: dark gray (`#111318`) — `bg-background`
- Cards / panels: `bg-card` (`#1A1D24`) — slightly lifted surface
- Primary accent: NCAA blue (`#009CDE`) — `text-primary` / `bg-primary`
- Success: `#3FB950`, Warning: `#F0A429`, Destructive: `#E5534B`
- Borders: `border-border` (`#2A2E38`) — used on outer panels only

### Container Hierarchy

**Outer panels** (page sections, header pill): use `glass-panel` class — gradient only, no blur
```tsx
<div className="glass-panel rounded-2xl p-6">
  {/* section */}
</div>
```

**Inner cards** (items within panels): no border, subtle hover
```tsx
<div className="rounded-lg px-4 py-3 hover:bg-white/5 transition-colors">
  {/* item */}
</div>
```

The `glass-panel` class is defined in `index.css`:
- `background`: linear-gradient top `rgba(42,47,62,0.82)` → bottom `rgba(26,30,42,0.72)`
- No `backdrop-filter` — removed for scroll performance
- `border: 1px solid rgba(255,255,255,0.09)` subtle highlight edge

### Typography
- Font: Geist Sans
- Page title: `text-2xl font-bold tracking-tight`
- Section heading: `text-lg font-semibold`
- Body: `text-sm`
- Caption: `text-xs text-muted-foreground`
- Code: `font-mono text-sm`

### Icons (Lucide)
- Inline with text: `size-4` (16px)
- Standalone / button: `size-5` (20px)
- Every nav item gets an icon
- Section headings get a small contextual icon left of the text
- Never icon-only without a `<Tooltip>`

### Key icon assignments
| Use | Icon |
|---|---|
| Standings | `Trophy` |
| Schedule / games | `Calendar` |
| User picks | `ClipboardList` |
| Admin | `Shield` |
| Score / points | `Zap` |
| Record book | `BookOpen` |
| Settings | `Settings` |
| Form locked | `Lock` |
| Form open | `Unlock` |

### Logo
```tsx
// src/frontend/src/components/Logo.tsx
export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
        <span className="text-white font-bold text-xs tracking-wider">KBP</span>
      </div>
      <span className="font-semibold text-foreground tracking-tight text-sm">
        Kirchmann Bowl Pool
      </span>
    </div>
  )
}
```

### Header
- Height: `h-16`
- `bg-card border-b border-border` — no drop shadow
- Logo left, nav right
- `max-w-7xl mx-auto`

### Buttons
- Primary CTA: `variant="default"` — amber fill
- Secondary: `variant="outline"`
- Nav / icon: `variant="ghost"`
- All use `rounded-lg`

### Code / data blocks
```tsx
<pre className="bg-muted rounded-lg px-4 py-3 font-mono text-sm leading-relaxed overflow-x-auto">
  {content}
</pre>
```

---

## Component template

```tsx
import { cn } from '@/lib/utils'

interface MyComponentProps {
  title: string
  className?: string
}

export function MyComponent({ title, className }: MyComponentProps) {
  return (
    <div className={cn('rounded-xl bg-card border border-border shadow-sm p-6', className)}>
      {title}
    </div>
  )
}
```

---

## Spacing

Use Tailwind scale: `4, 6, 8, 12, 16` → `1rem, 1.5rem, 2rem, 3rem, 4rem`

Max content width: `max-w-7xl mx-auto`
