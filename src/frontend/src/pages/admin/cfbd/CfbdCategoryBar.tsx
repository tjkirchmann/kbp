import { cn } from '@/lib/utils'

export const CATEGORIES = [
  { key: 'teams', label: 'Teams' },
  { key: 'seasons', label: 'Seasons' },
  { key: 'games', label: 'Games' },
  { key: 'recruiting', label: 'Recruiting' },
  { key: 'dimensions', label: 'Dimensions' },
] as const

export type CategoryKey = (typeof CATEGORIES)[number]['key']

interface CfbdCategoryBarProps {
  activeKey: CategoryKey | undefined
  onSelect: (key: CategoryKey) => void
}

export default function CfbdCategoryBar({ activeKey, onSelect }: CfbdCategoryBarProps) {
  return (
    <div className="flex items-center gap-1.5">
      {CATEGORIES.map((cat) => {
        const isActive = activeKey === cat.key
        return (
          <button
            key={cat.key}
            type="button"
            onClick={() => onSelect(cat.key)}
            className={cn(
              'flex-1 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
              isActive
                ? 'border-primary/40 bg-primary/15 text-primary'
                : 'border-border/20 bg-white/[0.03] text-muted-foreground hover:text-foreground',
            )}
          >
            {cat.label}
          </button>
        )
      })}
    </div>
  )
}
