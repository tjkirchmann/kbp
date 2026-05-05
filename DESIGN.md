# KBP Design System

Kirchmann Bowl Pool — visual and component design reference.

---

## Aesthetic

**Mood:** Professional + clean tech, with a slightly whimsical edge. Think a well-designed sports analytics tool that doesn't take itself too seriously. Warm, inviting, not sterile.

**Mode:** Light only (for now). All whites are intentionally off-white — never pure `#ffffff` on backgrounds.

---

## Color Palette

### Base (Tailwind CSS variables — set in `index.css`)

| Token | Value | Use |
|---|---|---|
| `--background` | `hsl(40, 20%, 97%)` | Page background (warm off-white) |
| `--foreground` | `hsl(30, 15%, 12%)` | Body text |
| `--card` | `hsl(40, 15%, 99%)` | Card / content panel surface |
| `--card-foreground` | `hsl(30, 15%, 12%)` | Card text |
| `--border` | `hsl(35, 15%, 85%)` | Borders (light gray, warm tint) |
| `--muted` | `hsl(35, 15%, 92%)` | Muted backgrounds (inputs, chips) |
| `--muted-foreground` | `hsl(30, 10%, 45%)` | Secondary / placeholder text |
| `--primary` | `hsl(30, 90%, 48%)` | Warm amber-orange — primary accent |
| `--primary-foreground` | `hsl(0, 0%, 100%)` | Text on primary |
| `--secondary` | `hsl(25, 70%, 62%)` | Lighter warm orange — secondary accent |
| `--accent` | `hsl(35, 85%, 55%)` | Gold — used for highlights, icons, badges |
| `--destructive` | `hsl(0, 72%, 51%)` | Error / destructive actions |
| `--ring` | `hsl(30, 90%, 48%)` | Focus ring |
| `--radius` | `0.5rem` | Base border radius |

### Extended palette (for custom use)

```css
--amber-50:  hsl(40, 95%, 97%)
--amber-100: hsl(38, 92%, 93%)
--amber-200: hsl(36, 88%, 85%)
--amber-300: hsl(34, 84%, 74%)
--amber-400: hsl(32, 85%, 62%)
--amber-500: hsl(30, 90%, 48%)   /* = --primary */
--amber-600: hsl(28, 82%, 40%)
--amber-700: hsl(26, 75%, 32%)
--amber-800: hsl(24, 65%, 24%)
--amber-900: hsl(22, 55%, 16%)
```

---

## Background Texture

Every page uses a textured background — a low-contrast dot/grid pattern over the off-white base. This gives depth and separates the background from solid content containers.

**Implementation (CSS):**

```css
/* Applied to html or body */
background-color: hsl(40, 20%, 97%);
background-image: radial-gradient(hsl(35, 15%, 82%) 1px, transparent 1px);
background-size: 20px 20px;
```

This produces a subtle gray dot grid. Containers sit on top as solid white-ish panels.

---

## Layout Containers

Two levels of containers — outer panels and inner cards. They behave differently.

### Outer Panels (page sections, main content regions)

- Background: `bg-card` (off-white)
- Border: `border border-border` (visible, light warm-gray)
- Border radius: `rounded-xl` (0.75rem)
- Shadow: `shadow-sm` (very subtle)
- Padding: `p-6` or `p-8`

```tsx
<div className="bg-card border border-border rounded-xl shadow-sm p-6">
  {/* section content */}
</div>
```

### Inner Cards (items within panels — leaderboard rows, pick cards, blog entries)

- Background: transparent or `bg-muted/40`
- Border: **none**
- Border radius: `rounded-lg`
- Use padding and subtle hover states for separation

```tsx
<div className="rounded-lg px-4 py-3 hover:bg-muted/60 transition-colors">
  {/* card content */}
</div>
```

---

## Typography

**Font stack:** [Geist Sans](https://vercel.com/font) for UI, `ui-monospace` for code.

```css
font-family: 'Geist', system-ui, -apple-system, sans-serif;
```

Geist is clean, modern, slightly technical without being sterile. Has good weight range. Import via `@fontsource/geist` or Google Fonts equivalent.

| Role | Class | Size |
|---|---|---|
| Page title | `text-2xl font-bold tracking-tight` | 1.5rem |
| Section heading | `text-lg font-semibold` | 1.125rem |
| Body | `text-sm` | 0.875rem |
| Caption / label | `text-xs text-muted-foreground` | 0.75rem |
| Code / monospace | `font-mono text-sm` | 0.875rem |

---

## Icons

**Library:** [Lucide React](https://lucide.dev/) — consistent stroke style, works natively with shadcn/ui.

```bash
# Already installed with shadcn; if not:
npm install lucide-react
```

**Usage rules:**
- Every nav item gets an icon
- Every section heading gets a small contextual icon (inline, left of text)
- Status indicators (win/loss, up/down) always use icons, never just color alone
- Icon size: `size-4` (16px) inline, `size-5` (20px) standalone/button
- Pair icons with text — don't use icon-only unless in a `<Tooltip>`

**Key icons to reserve for KBP:**

| Use | Icon |
|---|---|
| Pool / standings | `Trophy` |
| Bowl games / schedule | `Calendar` |
| User picks | `ClipboardList` |
| Admin | `Shield` |
| Points / score | `Star` or `Zap` |
| Record book / history | `BookOpen` |
| Settings | `Settings` |
| Lock (form closed) | `Lock` |
| Open (form open) | `Unlock` |

---

## Temporary Logo Mark

Until the real logo is ready, use a composed SVG mark in the header: the letters **KBP** in a rounded square badge using the primary amber color.

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

---

## Code / Data Blocks

Styled after Railway's codeblock approach — rounded, soft background, monospace:

```tsx
<pre className="bg-muted rounded-lg px-4 py-3 font-mono text-sm leading-relaxed overflow-x-auto">
  {content}
</pre>
```

---

## Header

- Height: `h-16`
- Background: `bg-card` with `border-b border-border`
- Logo mark left-aligned
- Nav icons + labels center or right
- Max width: `max-w-7xl mx-auto`

No drop shadow on header — the border-b is sufficient separation from the textured background.

---

## Buttons

Use shadcn `Button` with these variant conventions:

| Variant | Use |
|---|---|
| `default` | Primary CTA ("Enter the Pool") — amber fill |
| `outline` | Secondary actions |
| `ghost` | Nav items, icon buttons |
| `destructive` | Delete / remove |

All buttons use `rounded-lg` (matches `--radius`).

---

## Open Questions

- Final logo asset from owner
- Transactional email provider (for non-Google auth / notifications)
- Scoring algorithm details (needed at data model time, not design time)
- Admin-specific UI — separate admin panel or inline role-gated controls?
- Whether standings update live (WebSocket) or on page load/refresh
- Historical data import strategy for record books
