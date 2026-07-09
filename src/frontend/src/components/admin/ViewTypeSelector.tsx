import { Table2, Zap, ChevronDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { CfbdViewType } from '@/store/useCfbdExplorerStore'

interface ViewTypeSelectorProps {
  viewType: CfbdViewType
  onChange: (viewType: CfbdViewType) => void
}

const VIEW_TYPES: { type: CfbdViewType; label: string; icon: typeof Table2 }[] = [
  { type: 'table', label: 'Table View', icon: Table2 },
  { type: 'analysis', label: 'Analysis View', icon: Zap },
]

export default function ViewTypeSelector({ viewType, onChange }: ViewTypeSelectorProps) {
  const current = VIEW_TYPES.find((v) => v.type === viewType) ?? VIEW_TYPES[0]
  const CurrentIcon = current.icon

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Change view type"
          className="flex items-center gap-1 rounded-lg border border-border/20 bg-white/[0.03] px-2 py-1.5 text-muted-foreground transition-colors hover:text-foreground hover:bg-white/[0.06]"
        >
          <CurrentIcon className="size-4 shrink-0" />
          <ChevronDown className="size-3 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {VIEW_TYPES.map((v) => {
          const Icon = v.icon
          const isActive = v.type === viewType
          return (
            <DropdownMenuItem
              key={v.type}
              onClick={() => onChange(v.type)}
              className={isActive ? 'bg-primary/15 text-primary' : ''}
            >
              <Icon className="size-4 shrink-0" />
              <span>{v.label}</span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
