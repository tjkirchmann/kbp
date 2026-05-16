import { useState, useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { ChevronRight, Info } from 'lucide-react'
import Header from '@/components/Header'
import { useAdminUsers } from '@/services/useAdminUsers'
import { useAdminPools } from '@/services/useAdminPools'
import AdminInfoPanel from '@/pages/admin/AdminInfoPanel'

const sections = [
  { id: 'general', label: 'General' },
  { id: 'users', label: 'Users' },
  { id: 'pools', label: 'Pools' },
  { id: 'teams', label: 'Teams' },
]

function useBreadcrumbs() {
  const { pathname } = useLocation()
  const { data: users = [] } = useAdminUsers()
  const { data: pools = [] } = useAdminPools()

  const parts = pathname.replace(/^\/admin\/?/, '').split('/').filter(Boolean)

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

  if (parts[0] === 'teams') {
    return [{ label: 'Teams', to: '/admin/teams' }]
  }

  if (parts[0] === 'general') {
    return [{ label: 'General', to: '/admin/general' }]
  }

  return [{ label: 'Admin', to: '/admin' }]
}

export default function AdminShell() {
  const breadcrumbs = useBreadcrumbs()
  const { pathname } = useLocation()
  const [infoOpen, setInfoOpen] = useState(false)
  const currentSection = breadcrumbs[0].label.toLowerCase()

  useEffect(() => {
    setInfoOpen(false)
  }, [pathname])

  return (
    <div className="min-h-screen">
      <Header />
      <main className="pt-24 pb-12 px-4 max-w-4xl mx-auto w-full">
        <div className="glass-panel rounded-2xl w-full flex min-h-[calc(100vh-9rem)]">
          <nav className="flex flex-col gap-1 p-3 pt-4 w-40 shrink-0 border-r border-border/40 overflow-y-auto">
            {sections.map(s => (
              <NavLink
                key={s.id}
                to={`/admin/${s.id}`}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-full text-sm font-medium transition-colors text-center w-full ${
                    isActive
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-[rgba(26,30,42,0.6)]'
                  }`
                }
              >
                {s.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center gap-6 px-6 py-4 border-b border-border/40 shrink-0">
              <div className="flex items-center gap-1.5 shrink-0">
                {breadcrumbs.map((crumb, i) => (
                  <span key={i} className="flex items-center gap-1.5">
                    {i > 0 && <ChevronRight className="size-4 text-muted-foreground/40" />}
                    {crumb.to ? (
                      <NavLink
                        to={crumb.to}
                        className={({ isActive }) =>
                          `text-2xl font-semibold tracking-tight transition-colors ${
                            isActive && breadcrumbs.length === 1
                              ? 'text-foreground'
                              : breadcrumbs.length > 1 && i < breadcrumbs.length - 1
                              ? 'text-muted-foreground hover:text-foreground'
                              : 'text-foreground'
                          }`
                        }
                      >
                        {crumb.label}
                      </NavLink>
                    ) : (
                      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{crumb.label}</h1>
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
            <div className="p-6">
              {infoOpen ? <AdminInfoPanel section={currentSection} /> : <Outlet />}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
