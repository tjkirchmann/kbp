import { useState, useEffect, type ReactNode } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Info } from 'lucide-react'
import { useAdminUsers } from '@/services/useAdminUsers'
import { useAdminPools } from '@/services/useAdminPools'
import AdminInfoPanel from '@/pages/admin/AdminInfoPanel'
import AdminSidebar from '@/pages/admin/AdminSidebar'
import AdminBreadcrumbs from '@/pages/admin/AdminBreadcrumbs'
import { usePageTitle } from '@/lib/usePageTitle'
import { useAuth } from '@clerk/react'
import { useMe } from '@/services/useMe'
import { Navigate } from 'react-router-dom'

const COLLAPSE_KEY = 'admin-sidebar-collapsed'

function useBreadcrumbs() {
  const { pathname } = useLocation()
  const { data: users = [] } = useAdminUsers()
  const { data: pools = [] } = useAdminPools()

  const parts = pathname
    .replace(/^\/admin\/?/, '')
    .split('/')
    .filter(Boolean)

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

  if (parts[0] === 'library') return [{ label: 'Library', to: '/admin/library' }]
  if (parts[0] === 'cfbd') {
    const crumbs = [{ label: 'CFBD', to: '/admin/cfbd' }]
    if (parts[1]) {
      const labels: Record<string, string> = {
        coverage: 'Coverage',
        explorer: 'Data Explorer',
        rankings: 'Poll Rankings',
        'sp-ratings': 'SP+ Ratings',
        'srs-ratings': 'SRS Ratings',
        'elo-ratings': 'Elo Ratings',
        'fpi-ratings': 'FPI Ratings',
        calendar: 'Calendar',
        'team-records': 'Team Records',
        'team-season-stats': 'Team Season Stats',
        'team-adv-stats': 'Advanced Team Stats',
        'team-talent': 'Team Talent',
        'returning-production': 'Returning Production',
        'recruiting-teams': 'Recruiting Teams',
        'recruiting-players': 'Recruiting Players',
        'recruiting-groups': 'Recruiting Groups',
        'betting-lines': 'Betting Lines',
        'game-media': 'Game Media',
        'game-weather': 'Game Weather',
        'game-team-stats': 'Game Team Stats',
        'game-player-stats': 'Game Player Stats',
        games: 'Games',
        drives: 'Drives',
        'player-season-stats': 'Player Season Stats',
        'coach-seasons': 'Coach Seasons',
        conferences: 'Conferences',
        teams: 'Teams',
        venues: 'Venues',
        coaches: 'Coaches',
        draft: 'Draft',
        'fact-coverage': 'Fact Coverage',
      }
      crumbs.push({ label: labels[parts[1]] ?? parts[1], to: '' })
    }
    return crumbs
  }
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
  return [{ label: 'Admin', to: '/admin' }]
}

export default function AdminShell() {
  const { isSignedIn, isLoaded } = useAuth()
  const { data: me, isLoading: meLoading } = useMe()
  const breadcrumbs = useBreadcrumbs()
  const { pathname } = useLocation()
  const [infoOpen, setInfoOpen] = useState(false)
  const [headerExtra, setHeaderExtra] = useState<ReactNode>(null)
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
          {/* Header: sits directly on the gradient — step indicator (left) + info toggle (right). */}
          <div className="shrink-0 flex h-16 items-center gap-6 px-6">
            <div className="flex-1 text-sm text-muted-foreground">{headerExtra}</div>
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
              className="px-6 pb-6 flex-1 min-h-0 overflow-y-auto overflow-x-hidden animate-view-fade-in"
            >
              {infoOpen ? (
                <AdminInfoPanel section={currentSection} />
              ) : (
                <Outlet context={{ setHeaderExtra }} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
