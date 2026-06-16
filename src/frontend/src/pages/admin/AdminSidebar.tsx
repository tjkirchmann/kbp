import { NavLink } from 'react-router-dom'
import { MessageSquare, Plug, RefreshCw, Users, Trophy, Shield } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const sections: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'comms', label: 'Comms', icon: MessageSquare },
  { id: 'integrations', label: 'Integrations', icon: Plug },
  { id: 'sync', label: 'Sync', icon: RefreshCw },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'pools', label: 'Pools', icon: Trophy },
  { id: 'teams', label: 'Teams', icon: Shield },
]

export default function AdminSidebar({ collapsed }: { collapsed: boolean }) {
  return (
    <nav
      className={cn(
        'shrink-0 flex flex-col gap-1 p-3 pt-4 border-r border-border/40 overflow-y-auto transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-52',
      )}
    >
      {sections.map(({ id, label, icon: Icon }) => (
        <NavLink
          key={id}
          to={`/admin/${id}`}
          title={collapsed ? label : undefined}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-full text-sm font-medium transition-colors',
              collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2',
              isActive
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-[rgba(26,30,42,0.6)]',
            )
          }
        >
          <Icon className="size-4 shrink-0" />
          {!collapsed && <span className="truncate">{label}</span>}
        </NavLink>
      ))}
    </nav>
  )
}
