# KBP Design System

Kirchmann Bowl Pool — visual and component design reference.

---

## Aesthetic

**Mood:** Professional dark UI — clean, slightly technical, not sterile. Sports analytics feel without being flashy.

**Mode:** Dark only.

---

## Color Palette

### Base (Tailwind CSS variables — set in `index.css`)

| Token | Value | Use |
|---|---|---|
| `--background` | `#111318` | Page background |
| `--foreground` | `#e8eaf0` | Body text |
| `--card` | `#1a1d24` | Elevated surface |
| `--card-foreground` | `#e8eaf0` | Card text |
| `--border` | `#2a2e38` | Borders |
| `--muted` | `#21252e` | Muted backgrounds |
| `--muted-foreground` | `#7a8099` | Secondary / placeholder text |
| `--primary` | `#009cde` | NCAA blue — primary accent |
| `--primary-foreground` | `#ffffff` | Text on primary |
| `--secondary` | `#2a3147` | Slate-blue surfaces |
| `--destructive` | `#e5534b` | Error / destructive actions |
| `--success` | `#3fb950` | Positive / live states |
| `--warning` | `#f0a429` | Caution / upcoming states |
| `--info` | `#58a6ff` | Informational accent |
| `--ring` | `#009cde` | Focus ring |

### Opacity-based surface tokens (no CSS variables — inline Tailwind)

| Class | Use |
|---|---|
| `bg-white/[0.03]` | Subtle raised surface (toolbar, filter bar, table shell) |
| `bg-white/[0.05]` | Slightly lifted — stat pills, inner cards |
| `bg-white/[0.04]` | Default stat-pill background |
| `bg-primary/[0.06]` | Selected-row highlight |
| `bg-primary/15` | Active pill/badge background |
| `bg-primary/20` | Active toggle button background |
| `border-border/20` | Surface border (tables, toolbars, selectors) |
| `border-border/30` | Slightly stronger border (cell borders, tab bars) |
| `border-border/40` | Header-row bottom border |
| `border-white/10` | Admin panel border, sidebar dividers |
| `border-white/[0.09]` | glass-panel border (CSS) |

### Tag colors (classification/label pills — defined in `index.css`)

```css
.tag-blue   { background: rgba(0,156,222,0.15);   color: #009cde; }
.tag-teal   { background: rgba(38,166,154,0.15);  color: #26a69a; }
.tag-purple { background: rgba(124,106,247,0.15); color: #9d8df7; }
.tag-amber  { background: rgba(240,164,41,0.15);  color: #f0a429; }
.tag-green  { background: rgba(63,185,80,0.15);   color: #3fb950; }
.tag-rose   { background: rgba(229,83,75,0.15);   color: #e5534b; }
```

### Admin backdrop (`admin-bg` — defined in `index.css`)

```css
.admin-bg {
  background-color: #0a0c11;
  background-image:
    radial-gradient(ellipse 70% 55% at 12% 0%, rgba(0,156,222,0.38) 0%, transparent 65%),
    radial-gradient(ellipse 55% 45% at 88% 12%, rgba(38,166,154,0.22) 0%, transparent 65%),
    radial-gradient(ellipse 60% 50% at 70% 100%, rgba(0,90,170,0.3) 0%, transparent 70%),
    radial-gradient(ellipse 45% 40% at 0% 100%, rgba(240,164,41,0.1) 0%, transparent 70%);
}
```

Vivid cyan/teal/amber LEDs — stronger and more colorful than the public body gradient.
Used as the backdrop that the admin content panel floats over.

---

## Background

**Public pages:** layered radial gradients on `html` for depth.

```css
html {
  background-color: var(--background);
  background-image:
    radial-gradient(ellipse 80% 60% at 15% 20%, rgba(0,100,180,0.22) 0%, transparent 70%),
    radial-gradient(ellipse 60% 50% at 85% 70%, rgba(0,60,120,0.18) 0%, transparent 70%),
    radial-gradient(ellipse 65% 65% at 0% 100%, rgba(0,100,180,0.3) 0%, transparent 72%),
    radial-gradient(ellipse 50% 40% at 50% 100%, rgba(20,40,80,0.24) 0%, transparent 70%);
  background-attachment: fixed;
}
```

`body` is `transparent` — the gradient shows through.

**Admin pages:** use `admin-bg` (see Admin Backdrop section) on the full-viewport wrapper.
The content panel (`bg-[#14161d]/95`) floats over it.

---

## Layout Containers

### Outer panels — `glass-panel`

Every page section, the header pill, and some admin panels use `glass-panel`. It is a gradient-only dark surface — **no `backdrop-filter`** (removed for scroll performance).

```css
.glass-panel {
  background: linear-gradient(
    to bottom,
    rgba(42, 47, 62, 0.82) 0%,
    rgba(26, 30, 42, 0.72) 100%
  );
  border: 1px solid rgba(255, 255, 255, 0.09);
}
```

```tsx
<div className="glass-panel rounded-2xl p-6">
  {/* section content */}
</div>
```

### Admin content panel

A darker, opaque container that floats on the admin-bg gradient:

```tsx
<div className="bg-[#14161d]/95 border border-white/10 shadow-2xl shadow-black/40 rounded-2xl overflow-hidden">
  {/* admin page content */}
</div>
```

### Opacity-layered surfaces

For toolbars, filter bars, and table shells inside admin pages, use the opacity-based
surface convention — a subtle white overlay with thin muted border:

```tsx
<div className="bg-white/[0.03] border border-border/20 rounded-lg px-3 py-2">
  {/* toolbar, filter bar, or table shell */}
</div>
```

### Inner cards (items within panels)

No border, subtle hover:

```tsx
<div className="rounded-lg px-4 py-3 hover:bg-white/5 transition-colors">
  {/* item */}
</div>
```

---

## Data Pill & Badge Variants

Several pill/badge patterns are used for data visualization. They share the same
DNA: compact rounded shapes with translucent backgrounds.

### Rank badge (`rankBadge`)

For rank numbers in data tables — fully rounded pill with primary accent:

```
inline-flex min-w-7 justify-center rounded-full border border-primary/30
bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary
```

### Stat pill (`statPill`)

For secondary metrics — slightly rounded, muted:

```
inline-flex rounded border border-border/30 bg-white/5
px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground
```

### Heat chip (`heatChip`)

Gradient-interpolated pill from amber (low) → blue (high) across a column's
value range. Background and border are dynamically computed via linear RGB
interpolation against the visible row set:

- Low: `rgba(240, 164, 41, 0.55)` background, `rgba(240, 164, 41, 0.7)` border
- High: `rgba(0, 156, 222, 0.55)` background, `rgba(0, 156, 222, 0.7)` border
- Text: `#ffffff`, size `text-[10px] font-semibold`

```
inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold text-white
```

### Talent chip (`talentChip` / same as rankBadge)

```
inline-flex rounded-full border border-primary/30 bg-primary/15
px-2 py-0.5 text-[10px] font-semibold text-primary
```

### Rating bar (`ratingBar`)

Thin horizontal progress bar with a numeric value label:

- Container: `flex items-center gap-2`
- Value: `w-10 text-right text-xs tabular-nums`
- Track: `h-1.5 w-16 rounded-full bg-white/10`
- Fill: `bg-primary/70` with dynamic percentage width

### Tag pills (classification)

Use the `.tag-*` classes (blue, teal, purple, amber, green, rose) for
classification or category labels. Always paired with `rounded-full text-xs font-medium`.

### Status pills

For semantic state display (open, featured, complete):

```tsx
// Default
<span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-white/[0.04] text-foreground">
  Open
</span>

// Featured / active
<span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/15 text-primary border-primary/20">
  Featured
</span>

// Success
<span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/[0.08] text-emerald-400">
  Complete
</span>
```

---

## Table Styling

### Table shell

```tsx
<div className="bg-white/[0.03] border border-border/20 rounded-lg overflow-x-auto scrollbar-themed">
```

### Header row

```tsx
<div className="border-b border-border/40 bg-white/[0.02]">
  <span className="text-xs font-medium text-muted-foreground">
    Column Name
  </span>
</div>
```

### Data row

```tsx
// Default row
<div className="hover:bg-[rgba(26,30,42,0.4)] cursor-pointer transition-colors">

// Selected row
<div className="bg-primary/[0.06]">

// Row divider
<div className="border-t border-border/20">
```

### Row with hover lift (list-style tables only)

```tsx
<div className="border-t border-border/20 hover:bg-[rgba(26,30,42,0.4)] cursor-pointer transition-colors">
```

### Column resize handle

Hidden by default, revealed on group hover:

```tsx
<div className="bg-border/30 group-hover/resize:bg-primary/60 transition-colors" />
```

### Sort indicator

- Unsorted: `text-muted-foreground hover:text-foreground transition-colors`
- Active sort column: primary-tinted icon

### Checkbox (three-state: unchecked / checked / indeterminate)

- Unchecked: `bg-white/[0.03] border border-border`
- Checked: `bg-primary border-primary text-primary-foreground`
- Row selection column: `w-10`

---

## Interactive Elements & Transitions

### Hover text brightening

The dominant interactive pattern: muted text brightens to foreground on hover.

```tsx
// Nav / sidebar items
className="text-muted-foreground hover:text-foreground hover:bg-[rgba(10,12,17,0.4)] transition-colors"

// Simple text-only
className="text-muted-foreground hover:text-foreground transition-colors"
```

### Active / selected state

```tsx
// Primary accent
className="bg-primary/15 text-primary border-primary/40"

// Stronger — sidebar nav item
className="bg-[rgba(10,12,17,0.7)] text-foreground"

// Toggle button
className="bg-primary/20 text-primary"
```

### Focus ring

```tsx
className="focus:outline-none focus:ring-1 focus:ring-primary/40"
```

### Smooth transitions

All interactive elements should use `transition-colors` (or `transition-[width]` for
animated sizing like the collapsible sidebar).

```tsx
// Default interactive
className="transition-colors"

// Collapsible sidebar
className="transition-[width] duration-200"

// Interactive card lift (public-facing only)
className="transition transform duration-[250ms] hover:-translate-y-[3px]"
```

---

## Custom Scrollbar

Used on virtual tables and scrollable data areas. Defined as `.scrollbar-themed` in
`index.css` — thin, border-colored thumb on transparent track.

```tsx
className="overflow-auto scrollbar-themed"
```

---

## Diagonal Hatch Texture

Decorative fill — placed next to labels or headings to add texture without visual weight.

```css
.hatch {
  background-image: repeating-linear-gradient(
    -45deg,
    rgba(255, 255, 255, 0.045) 0px,
    rgba(255, 255, 255, 0.045) 1px,
    transparent 1px,
    transparent 18px
  );
}
```

```tsx
<div className="flex items-center gap-6">
  <h2 className="text-2xl font-semibold tracking-tight">Title</h2>
  <div className="hatch flex-1 h-8 rounded" />
</div>
```

---

## Admin Shell Layout

The admin shell (`AdminShell.tsx`) is the layout wrapper for all `/admin/*` routes.
Auth-gated: redirects to `/login` if not signed in; redirects to `/` if signed in but not admin.

### Overall structure

- **Backdrop**: `admin-bg h-screen overflow-hidden flex flex-col` — full viewport, vivid gradient
- **Content panel**: `bg-[#14161d]/95 border border-white/10 shadow-2xl shadow-black/40 rounded-2xl overflow-hidden`
  — floats over the gradient with `mx-4 mb-4` margins
- **Body row**: `flex flex-1 min-h-0` — sidebar + content side by side

### Sidebar (`AdminSidebar.tsx`)

- Collapsible; state persisted to `localStorage` under key `admin-sidebar-collapsed`
- Collapsed on mount on narrow viewports (`< 640px`)
- Width: `w-60` (expanded), `w-[60px]` (collapsed), `transition-[width] duration-200`
- Nav items: active = `bg-[rgba(10,12,17,0.7)] text-foreground`, inactive = `text-muted-foreground hover:text-foreground hover:bg-[rgba(10,12,17,0.4)]`
- Group headers (collapsed): `text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70`
- Footer: "Back to site" link + Account / sign-out button

### Content area

- **Header strip**: `h-16 flex items-center gap-6 px-6` with breadcrumbs and info-panel toggle
- **Breadcrumbs**: rendered via `AdminBreadcrumbs`
- **Info panel**: toggle button, active = `bg-primary/20 text-primary`, inactive = `text-muted-foreground hover:bg-white/5`
- **Page content**: `<Outlet />` with `animate-view-fade-in`, padding `px-6 pb-6`

### Page titles

`AdminShell` sets `document.title` via `usePageTitle` using the active breadcrumb section label,
e.g. `KBP | Admin | Comms`, `KBP | Admin | Users`.

### Auth pattern

All hooks run unconditionally first; guards are placed after the last `useEffect`:

```tsx
if (!isLoaded || meLoading) return null          // wait for Clerk + /me
if (!isSignedIn) return <Navigate to="/login" /> // not authenticated
if (me && !me.is_admin) return <Navigate to="/" /> // authenticated but not admin
```

---

## Header

- Fixed pill: `fixed top-4 left-1/2 -translate-x-1/2 max-w-6xl px-4`
- Uses `glass-panel rounded-full px-6 h-14`
- Logo left, nav right (desktop) / hamburger (mobile)

---

## Typography

**Font:** Geist Sans

```css
font-family: 'Geist', system-ui, -apple-system, sans-serif;
```

| Role | Class | Size |
|---|---|---|
| Page title / breadcrumb | `text-2xl font-semibold tracking-tight` | 1.5rem |
| Section heading | `text-lg font-semibold` | 1.125rem |
| Pool / entity name | `text-xl font-semibold text-foreground truncate` | 1.25rem |
| Body | `text-sm` | 0.875rem |
| Caption / label | `text-xs text-muted-foreground` | 0.75rem |
| Micro label | `text-[11px] font-semibold uppercase tracking-wider` | ~0.69rem |
| Badge / chip | `text-[10px] font-semibold` | ~0.625rem |
| Code / monospace | `font-mono text-sm` | 0.875rem |
| Tabular numbers | `tabular-nums` | (monospace digits) |

---

## Icons

**Library:** Lucide React only.

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

---

## Buttons

Custom classes defined in `index.css` — not shadcn variants.

| Class | Use |
|---|---|
| `btn-primary` | Primary CTA — blue gradient fill |
| `btn-primary-gold` | Gold accent CTA |
| `btn-glass-blue` | Frosted blue — overlays only |
| `btn-gold` | Frosted amber — overlays only |
| `hover:bg-[rgba(26,30,42,0.6)]` | Ghost / nav items (rounded-full) |

Nav buttons use inline Tailwind with `rounded-full`.

---

## Spacing

Tailwind scale: `p-0.5` (2px), `p-1.5` (6px), `p-2` (8px), `p-3` (12px), `p-6` (24px), `p-8` (32px).

Gaps: `gap-1.5`, `gap-2`, `gap-2.5`, `gap-3`, `gap-4`, `gap-6`.

Max content width (public): `max-w-6xl mx-auto`

---

## Performance Notes

- No `backdrop-filter` on `glass-panel` — causes GPU re-composite on scroll
- `background-attachment: fixed` on `html` is acceptable; the `body` is transparent
- Virtual scrolling (`@tanstack/react-virtual`) used in large lists and data tables
- Custom scrollbar (`scrollbar-themed`) avoids native scrollbar repaint in virtualized containers
