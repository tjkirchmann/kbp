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
| `--foreground` | `hsl(220, 20%, 92%)` | Body text |
| `--card` | `#1A1D24` | Elevated surface |
| `--card-foreground` | `hsl(220, 20%, 92%)` | Card text |
| `--border` | `#2A2E38` | Borders |
| `--muted` | `#1E2130` | Muted backgrounds |
| `--muted-foreground` | `hsl(220, 10%, 55%)` | Secondary / placeholder text |
| `--primary` | `#009CDE` | NCAA blue — primary accent |
| `--primary-foreground` | `#ffffff` | Text on primary |
| `--destructive` | `#E5534B` | Error / destructive actions |
| `--ring` | `#009CDE` | Focus ring |
| `--radius` | `0.5rem` | Base border radius |

### Tag colors (classification/label pills)

```css
.tag-blue   { background: rgba(0,156,222,0.15);   color: #009CDE; }
.tag-teal   { background: rgba(38,166,154,0.15);  color: #26A69A; }
.tag-purple { background: rgba(124,106,247,0.15); color: #9D8DF7; }
.tag-amber  { background: rgba(240,164,41,0.15);  color: #F0A429; }
.tag-green  { background: rgba(63,185,80,0.15);   color: #3FB950; }
.tag-rose   { background: rgba(229,83,75,0.15);   color: #E5534B; }
```

---

## Background

Body uses layered radial gradients for depth — no `background-attachment: fixed` (causes scroll repaint).

```css
body {
  background-color: var(--background);
  background-image:
    radial-gradient(ellipse 80% 60% at 15% 20%, rgba(0, 100, 180, 0.22) 0%, transparent 70%),
    radial-gradient(ellipse 60% 50% at 85% 70%, rgba(0, 60, 120, 0.18) 0%, transparent 70%),
    radial-gradient(ellipse 50% 40% at 50% 100%, rgba(20, 40, 80, 0.24) 0%, transparent 70%);
  background-attachment: scroll;
}
```

---

## Layout Containers

### Outer panels — `glass-panel`

Every page section, the header pill, and the admin shell uses `glass-panel`. It is a gradient-only dark surface — **no `backdrop-filter`** (removed for scroll performance).

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

### Inner cards (items within panels)

No border, no background — rely on hover state for separation.

```tsx
<div className="rounded-lg px-4 py-3 hover:bg-white/5 transition-colors">
  {/* item */}
</div>
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

- Outer `<main>`: `pt-24 pb-12 px-4 max-w-4xl mx-auto`
- Panel: `glass-panel rounded-2xl w-full flex min-h-[calc(100vh-9rem)]`
  - `min-h` fills the viewport on short pages; tall pages scroll the whole page (not the inner panel)
- Left sidebar: `w-40 shrink-0 border-r border-border/40` — NavLink buttons
- Right content: `flex-1 flex flex-col` — breadcrumb header strip + `<Outlet />`

Page content is dropped into the `<Outlet />` slot — each admin page exports a default component and `App.tsx` wires it in.

---

## Header

- Fixed pill: `fixed top-4 left-1/2 -translate-x-1/2 max-w-4xl px-4`
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
| Body | `text-sm` | 0.875rem |
| Caption / label | `text-xs text-muted-foreground` | 0.75rem |
| Code / monospace | `font-mono text-sm` | 0.875rem |

---

## Icons

**Library:** Lucide React only.

- Inline with text: `size-4` (16px)
- Standalone / button: `size-5` (20px)
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
| `btn-primary` | Primary CTA — blue fill |
| `btn-primary-gold` | Gold accent CTA |
| `btn-glass-blue` | Frosted blue — overlays only |
| Tailwind `hover:bg-[rgba(26,30,42,0.6)]` | Ghost / nav items |

Nav buttons use inline Tailwind with `rounded-full`.

---

## Spacing

Tailwind scale: `4, 6, 8, 12, 16` → `1rem, 1.5rem, 2rem, 3rem, 4rem`

Max content width: `max-w-4xl mx-auto`

---

## Performance Notes

- No `backdrop-filter` on `glass-panel` — causes GPU re-composite on scroll
- No `background-attachment: fixed` on body — causes repaint on every scroll tick
- Virtual scrolling (`@tanstack/react-virtual`) used in TeamsList, PoolDetail, PoolCreate for large lists
