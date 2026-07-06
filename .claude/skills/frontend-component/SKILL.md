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

The site is **dark-only**. Background is a layered radial gradient (`html`) and `#111318` base.

| Token | Value | Tailwind |
|---|---|---|
| Background | `#111318` | `bg-background` |
| Foreground | `#e8eaf0` | `text-foreground` |
| Card surface | `#1a1d24` | `bg-card` |
| Primary accent | `#009cde` (NCAA blue) | `text-primary` / `bg-primary` |
| Muted text | `#7a8099` | `text-muted-foreground` |
| Borders | `#2a2e38` | `border-border` |
| Success | `#3fb950` | `text-success` |
| Warning | `#f0a429` | `text-warning` |
| Destructive | `#e5534b` | `text-destructive` |

**Opacity-based tokens** (no CSS variables — use Tailwind arbitrary values):

| Class | Use |
|---|---|
| `bg-white/[0.03]` | Subtle raised surface (toolbar, filter bar, table shell) |
| `bg-white/[0.05]` | Slightly lifted — stat pills, inner cards |
| `bg-primary/15` | Active pill, badge, or tab background |
| `bg-primary/20` | Active toggle button |
| `border-border/20` | Surface border default |
| `border-border/30` | Cell / tab border |
| `border-border/40` | Header-row bottom border |
| `border-white/10` | Admin panel borders, sidebar dividers |

### Container Hierarchy

**Glass panels** (public pages, header pill):

```tsx
<div className="glass-panel rounded-2xl p-6">
  {/* section */}
</div>
```

The `glass-panel` class (defined in `index.css`) is a gradient-only surface — no
backdrop-filter (removed for scroll performance).

**Admin content panels** (floats on `admin-bg` gradient):

```tsx
<div className="bg-[#14161d]/95 border border-white/10 shadow-2xl shadow-black/40 rounded-2xl overflow-hidden">
  {/* admin page */}
</div>
```

**Opacity surfaces** (toolbars, filter bars, table shells):

```tsx
<div className="bg-white/[0.03] border border-border/20 rounded-lg px-3 py-2">
  {/* toolbar or filter bar */}
</div>
```

**Inner cards** (items within panels):

```tsx
<div className="rounded-lg px-4 py-3 hover:bg-white/5 transition-colors">
  {/* item */}
</div>
```

### Data Pill & Badge Variants

#### Rank badge (rankBadge)

```tsx
<span className="inline-flex min-w-7 justify-center rounded-full border border-primary/30 bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
  {rank}
</span>
```

#### Stat pill (statPill)

```tsx
<span className="inline-flex rounded border border-border/30 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
  {value}
</span>
```

#### Heat chip (heatChip)

Amber (low) → blue (high) gradient across visible column range. Background and
border are dynamically interpolated via linear RGB blending:

```tsx
<span
  className="inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold text-white"
  style={{
    backgroundColor: `rgba(${r},${g},${b},0.55)`,
    borderColor: `rgba(${r},${g},${b},0.7)`,
  }}
>
  {value}
</span>
```

#### Rating bar (ratingBar)

```tsx
<div className="flex items-center gap-2">
  <span className="w-10 text-right text-xs tabular-nums">{value}</span>
  <div className="h-1.5 w-16 rounded-full bg-white/10">
    <div className="h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
  </div>
</div>
```

#### Status pills

```tsx
// Default
<span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-white/[0.04] text-foreground">

// Featured / active (primary)
<span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/15 text-primary border-primary/20">

// Success (green)
<span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/[0.08] text-emerald-400">

// Warning (amber)
<span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/[0.08] text-amber-400">
```

#### Tag pills (classification)

```tsx
<span className="tag-blue rounded-full text-xs font-medium">FBS</span>
```

Available: `tag-blue`, `tag-teal`, `tag-purple`, `tag-amber`, `tag-green`, `tag-rose`.

### Table Styling

**Table shell:**

```tsx
<div className="bg-white/[0.03] border border-border/20 rounded-lg overflow-x-auto scrollbar-themed">
```

**Header row:**

```tsx
<div className="border-b border-border/40 bg-white/[0.02]">
  <span className="text-xs font-medium text-muted-foreground">Column</span>
</div>
```

**Data row:**

```tsx
// Default — subtle hover lift
<div className="hover:bg-[rgba(26,30,42,0.4)] cursor-pointer transition-colors">

// Selected
<div className="bg-primary/[0.06]">

// Row divider
<div className="border-t border-border/20">
```

**Column resize handle** (hidden, revealed on column hover):

```tsx
<div className="bg-border/30 group-hover/resize:bg-primary/60 transition-colors" />
```

**Checkbox states:**

```tsx
// Unchecked
<div className="bg-white/[0.03] border border-border" />

// Checked
<div className="bg-primary border-primary text-primary-foreground" />

// Selection column width
<div className="w-10" />
```

**Sort indicator:**

```tsx
// Button
<button className="text-muted-foreground hover:text-foreground transition-colors">
  {/* icon */}
</button>
```

### Interactive Elements

**Hover text brightening** (the dominant pattern):

```tsx
className="text-muted-foreground hover:text-foreground transition-colors"
```

**Active / selected:**

```tsx
// Pill-style (data explorer tabs, selectors)
className="bg-primary/15 text-primary border-primary/40"

// Sidebar nav item (deeper)
className="bg-[rgba(10,12,17,0.7)] text-foreground"
```

**Focus ring:**

```tsx
className="focus:outline-none focus:ring-1 focus:ring-primary/40"
```

### Typography

- Font: Geist Sans
- Page title: `text-2xl font-semibold tracking-tight`
- Section heading: `text-lg font-semibold`
- Body: `text-sm`
- Caption: `text-xs text-muted-foreground`
- Micro label: `text-[11px] font-semibold uppercase tracking-wider`
- Badge/chip: `text-[10px] font-semibold`
- Code: `font-mono text-sm`

### Icons (Lucide)

- Inline with text: `size-4` (16px)
- Standalone / button: `size-5` (20px)
- Compact / filter-bar: `size-3.5`
- Never icon-only without a `<Tooltip>`

| Use | Icon |
|---|---|
| Standings | `Trophy` |
| Schedule / games | `Calendar` |
| User picks | `ClipboardList` |
| Admin | `ShieldCheck` |
| Score / points | `Zap` |
| Record book | `BookOpen` |
| Settings | `Settings` |
| Form locked | `Lock` |
| Form open | `Unlock` |

### Buttons

- Primary CTA: `btn-primary` — blue gradient fill
- Gold CTA: `btn-primary-gold` / `btn-gold`
- Glass overlay: `btn-glass-blue` (frosted blue, overlays only)
- Nav / ghost: `hover:bg-[rgba(26,30,42,0.6)] rounded-full transition-colors`

---

## Spacing

Tailwind scale: `p-0.5` (2px), `p-1.5` (6px), `p-2` (8px), `p-3` (12px), `p-6` (24px), `p-8` (32px).

Gaps (use these consistently): `gap-1.5`, `gap-2`, `gap-2.5`, `gap-3`, `gap-4`, `gap-6`.

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
    <div className={cn('glass-panel rounded-2xl p-6', className)}>
      {title}
    </div>
  )
}
```
