import { useState, useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { ChevronRight, Info } from 'lucide-react'
import { useAdminUsers } from '@/services/useAdminUsers'
import { useAdminPools } from '@/services/useAdminPools'
import AdminInfoPanel from '@/pages/admin/AdminInfoPanel'
import AdminSidebar from '@/pages/admin/AdminSidebar'
import AdminTopBar from '@/pages/admin/AdminTopBar'
import { prettyTaskName } from '@/pages/admin/syncUtils'
import { useRunDetail } from '@/services/useAdminSync'

const COLLAPSE_KEY = 'admin-sidebar-collapsed'

function useBreadcrumbs() {
  const { pathname, state } = useLocation()
  const { data: users = [] } = useAdminUsers()
  const { data: pools = [] } = useAdminPools()

  const parts = pathname.replace(/^\/admin\/?/, '').split('/').filter(Boolean)

  // On a run page, derive the parent task crumb. Prefer the task name passed via
  // link state (available on first render, no flash); fall back to the cached run.
  const runJobId = parts[0] === 'sync' && parts[1] === 'runs' ? parts[2] : undefined
  const { data: run } = useRunDetail(runJobId)
  const runTaskName = (state as { taskName?: string } | null)?.taskName ?? run?.task_name

  if (parts[0] === 'users') {
    const crumbs = [{ label: 'Users', to: '/admin/users' }]
    if (parts[1]) {
      const user = users.find(u => String(u.id) === parts[1])
      crumbs.push({ label: user?.email ?? `User ${parts[1]}`, to: '' })
    }
    return crumbs
  }

  if (parts[0] === 'pools') {
    const crumbs = [{ label: 'Pools', to: '/admin/pools' }]
    if (parts[1] === 'new') {
      crumbs.push({ label: 'New Pool', to: '' })
    } else if (parts[1]) {
      const pool = pools.find(p => String(p.id) === parts[1])
      crumbs.push({ label: pool?.name ?? `Pool ${parts[1]}`, to: '' })
    }
    return crumbs
  }

  if (parts[0] === 'teams') return [{ label: 'Teams', to: '/admin/teams' }]
  if (parts[0] === 'comms') return [{ label: 'Comms', to: '/admin/comms' }]
  if (parts[0] === 'espn') return [{ label: 'ESPN', to: '/admin/espn' }]
  if (parts[0] === 'sync') {
    const crumbs = [{ label: 'Sync', to: '/admin/sync' }]
    if (parts[1] === 'runs' && parts[2]) {
      if (runTaskName) {
        crumbs.push({ label: prettyTaskName(runTaskName), to: `/admin/sync/tasks/${runTaskName}` })
      }
      crumbs.push({ label: `Run ${parts[2]}`, to: '' })
    } else if (parts[1] === 'tasks' && parts[2]) {
      crumbs.push({ label: prettyTaskName(parts[2]), to: '' })
    }
    return crumbs
  }

  return [{ label: 'Admin', to: '/admin' }]
}

export default function AdminShell() {
  const breadcrumbs = useBreadcrumbs()
  const { pathname } = useLocation()
  const [infoOpen, setInfoOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    if (localStorage.getItem(COLLAPSE_KEY) === '1') return true
    return window.innerWidth < 640
  })
  const currentSection = breadcrumbs[0].label.toLowerCase()

  useEffect(() => {
    setInfoOpen(false)
  }, [pathname])

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0')
  }, [collapsed])

  return (
    <div className="h-screen overflow-hidden flex flex-col">
      <AdminTopBar onToggleSidebar={() => setCollapsed(c => !c)} />
      <div className="flex flex-1 min-h-0 pt-14">
        <AdminSidebar collapsed={collapsed} />
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <div className="flex items-center gap-6 px-6 py-4 border-b border-border/40 shrink-0">
            <div className="flex items-center gap-1.5 shrink-0">
              {breadcrumbs.map((crumb, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  {i > 0 && <ChevronRight className="size-4 text-muted-foreground/40" />}
                  {crumb.to ? (
                    // Highlight the terminal crumb by position, not isActive — a parent's
                    // route can still match during navigation, flashing the gradient.
                    i === breadcrumbs.length - 1 ? (
                      <NavLink to={crumb.to} className="text-2xl font-semibold tracking-tight text-gradient">
                        {crumb.label}
                      </NavLink>
                    ) : (
                      <NavLink
                        to={crumb.to}
                        className="text-2xl font-semibold tracking-tight text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {crumb.label}
                      </NavLink>
                    )
                  ) : (
                    <h1 className="text-2xl font-semibold tracking-tight text-gradient">{crumb.label}</h1>
                  )}
                </span>
              ))}
            </div>
            <div className="hatch flex-1 h-8 rounded" />
            <button
              onClick={() => setInfoOpen(v => !v)}
              className={`p-1.5 rounded-full transition-colors shrink-0 ${
                infoOpen
                  ? 'bg-primary/20 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
              }`}
            >
              <Info className="size-4" />
            </button>
          </div>
          <div key={pathname} className="p-6 flex-1 min-h-0 overflow-y-auto animate-view-fade-in">
            {infoOpen ? <AdminInfoPanel section={currentSection} /> : <Outlet />}
          </div>
        </div>
      </div>
    </div>
  )
}
