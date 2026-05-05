# Skill: Frontend Component Design

You are designing a React UI component for this app. The stack is React 18 + TypeScript + Tailwind CSS 4 + shadcn/ui + Radix UI.

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

## Component template
```tsx
import { cn } from '@/lib/utils'

interface MyComponentProps {
  title: string
  className?: string
}

export function MyComponent({ title, className }: MyComponentProps) {
  return (
    <div className={cn('...base classes...', className)}>
      {title}
    </div>
  )
}
```

## Design defaults
- Dark mode aware: use semantic colors (`bg-background`, `text-foreground`, `border-border`)
- Spacing: use Tailwind scale (4, 6, 8, 12, 16 → 1rem, 1.5rem, 2rem, 3rem, 4rem)
- Header height: h-16
- Max content width: max-w-7xl mx-auto
