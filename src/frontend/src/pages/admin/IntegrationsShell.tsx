import { NavLink, Outlet } from 'react-router-dom'
import { Activity } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// Sub-tabs under the Integrations section. Each entry is one external service we
// integrate with; add an entry here plus a nested <Route> in App.tsx to grow it.
const subTabs: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'espn', label: 'ESPN', icon: Activity },
]

export default function IntegrationsShell() {
  return (
    <div className="flex flex-col gap-5 min-h-0">
      <nav className="flex items-center gap-1.5 shrink-0">
        {subTabs.map(({ id, label, icon: Icon }) => (
          <NavLink
            key={id}
            to={id}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-[rgba(26,30,42,0.6)]',
              )
            }
          >
            <Icon className="size-4 shrink-0" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="min-h-0">
        <Outlet />
      </div>
    </div>
  )
}
