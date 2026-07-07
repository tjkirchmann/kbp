import { useNavigate } from 'react-router-dom'
import { Command } from 'cmdk'
import {
  MessageSquare,
  Activity,
  FolderOpen,
  BrainCircuit,
  BarChart3,
  Database,
  Users,
  Trophy,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// ── Flattened navigation items (mirrors sidebar, no nesting) ──────────────

type PaletteItem = {
  label: string
  path: string
  icon: LucideIcon
  group: string
}

const ITEMS: PaletteItem[] = [
  { label: 'Comms', path: '/admin/comms', icon: MessageSquare, group: 'Platform' },
  { label: 'ESPN', path: '/admin/integrations/espn', icon: Activity, group: 'Platform' },
  { label: 'Library', path: '/admin/library', icon: FolderOpen, group: 'Platform' },
  { label: 'AI Structs', path: '/admin/ai-structs', icon: BrainCircuit, group: 'Platform' },
  { label: 'Coverage', path: '/admin/cfbd/coverage', icon: BarChart3, group: 'CFBD' },
  { label: 'Data Explorer', path: '/admin/cfbd/teams', icon: Database, group: 'CFBD' },
  { label: 'Users', path: '/admin/users', icon: Users, group: 'Admin' },
  { label: 'Pools', path: '/admin/pools', icon: Trophy, group: 'Admin' },
]

const GROUPS = ['Platform', 'CFBD', 'Admin']

// ── Styles ────────────────────────────────────────────────────────────────

const overlayClass = 'fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]'

const dialogClass =
  'fixed left-1/2 top-[20%] z-50 w-full max-w-lg -translate-x-1/2 overflow-hidden rounded-xl border border-white/10 bg-[#14161d] shadow-2xl shadow-black/40'

const inputClass =
  'w-full border-0 border-b border-white/10 bg-transparent px-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground outline-none'

const listClass = 'max-h-80 overflow-y-auto p-1.5 scrollbar-themed'

const groupHeadingClass =
  'px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70'

const itemClass =
  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground cursor-pointer transition-colors data-[selected=true]:bg-primary/15 data-[selected=true]:text-foreground'

const emptyClass = 'px-3 py-6 text-center text-sm text-muted-foreground'

// ── Component ─────────────────────────────────────────────────────────────

interface AdminCommandPaletteProps {
  open: boolean
  onClose: () => void
}

export default function AdminCommandPalette({ open, onClose }: AdminCommandPaletteProps) {
  const navigate = useNavigate()

  function onSelect(path: string) {
    navigate(path)
    onClose()
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={(v) => { if (!v) onClose() }}
      overlayClassName={overlayClass}
      contentClassName={dialogClass}
      label="Admin section search"
    >
      <Command.Input placeholder="Search sections..." className={inputClass} />

      <Command.List className={listClass}>
        <Command.Empty className={emptyClass}>No results found.</Command.Empty>

        {GROUPS.map((group) => {
          const groupItems = ITEMS.filter((i) => i.group === group)
          if (groupItems.length === 0) return null

          return (
            <Command.Group key={group} heading={group} className="[&_[cmdk-group-heading]]:!hidden">
              {/* Render our own heading to match design system */}
              <div className={groupHeadingClass}>{group}</div>
              {groupItems.map((item) => (
                <Command.Item
                  key={item.path}
                  value={item.label}
                  onSelect={() => onSelect(item.path)}
                  className={itemClass}
                >
                  <item.icon className="size-4 shrink-0" />
                  <span>{item.label}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )
        })}
      </Command.List>
    </Command.Dialog>
  )
}
