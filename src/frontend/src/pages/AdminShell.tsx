import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Info } from 'lucide-react'
import { useAdminUsers } from '@/services/useAdminUsers'
import { useAdminPools } from '@/services/useAdminPools'
import AdminInfoPanel from '@/pages/admin/AdminInfoPanel'
import AdminSidebar from '@/pages/admin/AdminSidebar'
import AdminBreadcrumbs from '@/pages/admin/AdminBreadcrumbs'
import { prettyTaskName } from '@/pages/admin/syncUtils'
import { useRunDetail } from '@/services/useAdminSync'
import { usePageTitle } from '@/lib/usePageTitle'
import { useAuth } from '@clerk/react'
import { useMe } from '@/services/useMe'
import { Navigate } from 'react-router-dom'

const COLLAPSE_KEY = 'admin-sidebar-collapsed'

function useBreadcrumbs() {
  const { pathname, state } = useLocation()
  const { data: users = [] } = useAdminUsers()
  const { data: pools = [] } = useAdminPools()

  const parts = pathname
    .replace(/^\/admin\/?/, '')
    .split('/')
    .filter(Boolean)

  // On a run page, derive the parent task crumb. Prefer the task name passed via
  // link state (available on first render, no flash); fall back to the cached run.
  const runJobId = parts[0] === 'sync' && parts[1] === 'runs' ? parts[2] : undefined
  const { data: run } = useRunDetail(runJobId)
  const runTaskName = (state as { taskName?: string } | null)?.taskName ?? run?.task_name

  if (parts[0] === 'users') {
    const crumbs = [{ label: 'Users', to: '/admin/users' }]
    if (parts[1]) {
      const user = users.find((u) => String(u.id) === parts[1])
      crumbs.push({ label: user?.email ?? `User ${parts[1]}`, to: '' })
    }
    return crumbs
  }

  if (parts[0] === 'pools') {
    const crumbs = [{ label: 'Pools', to: '/admin/pools' }]
    if (parts[1] === 'new') {
      crumbs.push({ label: 'New Pool', to: '' })
    } else if (parts[1]) {
      const pool = pools.find((p) => String(p.id) === parts[1])
      crumbs.push({ label: pool?.name ?? `Pool ${parts[1]}`, to: '' })
    }
    return crumbs
  }

  if (parts[0] === 'teams') return [{ label: 'Teams', to: '/admin/teams' }]
  if (parts[0] === 'library') return [{ label: 'Library', to: '/admin/library' }]
  if (parts[0] === 'ai-structs') {
    const crumbs = [{ label: 'AI Structs', to: '/admin/ai-structs' }]
    if (parts[1]) crumbs.push({ label: parts[1], to: '' })
    return crumbs
  }
  if (parts[0] === 'comms') return [{ label: 'Comms', to: '/admin/comms' }]
  if (parts[0] === 'integrations') {
    const crumbs = [{ label: 'Integrations', to: '/admin/integrations' }]
    if (parts[1] === 'espn') crumbs.push({ label: 'ESPN', to: '/admin/integrations/espn' })
    return crumbs
  }
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
  const { isSignedIn, isLoaded } = useAuth()
  const { data: me, isLoading: meLoading } = useMe()
  const breadcrumbs = useBreadcrumbs()
  const { pathname } = useLocation()
  const [infoOpen, setInfoOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    if (localStorage.getItem(COLLAPSE_KEY) === '1') return true
    return window.innerWidth < 640
  })
  // Info panel keys off the active section. Under Integrations the section is the
  // active sub-tab (e.g. ESPN), so use the leaf crumb there; elsewhere the first
  // crumb is the section (its leaf can be an entity name, not an info key).
  const sectionCrumb =
    breadcrumbs[0].label === 'Integrations' ? breadcrumbs[breadcrumbs.length - 1] : breadcrumbs[0]
  const currentSection = sectionCrumb.label.toLowerCase()
  usePageTitle(`Admin | ${sectionCrumb.label}`)

  useEffect(() => {
    setInfoOpen(false)
  }, [pathname])

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0')
  }, [collapsed])

  // Auth guards — after all hooks, before render
  if (!isLoaded || meLoading) return null
  if (!isSignedIn) return <Navigate to="/login" replace />
  if (me && !me.is_admin) return <Navigate to="/" replace />

  return (
    <div className="admin-bg h-screen overflow-hidden flex flex-col">
      <div className="flex flex-1 min-h-0">
        <AdminSidebar collapsed={collapsed} onToggleSidebar={() => setCollapsed((c) => !c)} />
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* Header: sits directly on the gradient — just the info toggle, right-aligned. */}
          <div className="shrink-0 flex h-16 items-center gap-6 px-6">
            <div className="flex-1" />
            <button
              onClick={() => setInfoOpen((v) => !v)}
              className={`p-1.5 rounded-full transition-colors shrink-0 ${
                infoOpen
                  ? 'bg-primary/20 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
              }`}
            >
              <Info className="size-4" />
            </button>
          </div>
          {/* Dark content panel floating on the gradient; breadcrumbs live inside it. */}
          <div className="mx-4 mb-4 flex-1 min-h-0 flex flex-col rounded-2xl border border-white/10 bg-[#14161d]/95 shadow-2xl shadow-black/40 overflow-hidden">
            <AdminBreadcrumbs crumbs={breadcrumbs} />
            <div
              key={pathname}
              className="px-6 pb-6 flex-1 min-h-0 overflow-y-auto animate-view-fade-in"
            >
              {infoOpen ? <AdminInfoPanel section={currentSection} /> : <Outlet />}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
