import { useEffect, useState } from 'react'
import { NavLink, Link, useLocation } from 'react-router-dom'
import {
  MessageSquare,
  Plug,
  RefreshCw,
  Users,
  Trophy,
  Shield,
  FolderOpen,
  ChevronDown,
  Activity,
  LogOut,
  PanelLeft,
  ArrowLeft,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useClerk } from '@clerk/react'
import { cn } from '@/lib/utils'
import { useMe } from '@/services/useMe'
import logo256w from '@/assets/logo/logo-256w.png'
import logo512w from '@/assets/logo/logo-512w.png'

type SubItem = { id: string; label: string; icon: LucideIcon }
type Item = { id: string; label: string; icon: LucideIcon; badge?: number; children?: SubItem[] }
type Group = { label: string; items: Item[] }

const groups: Group[] = [
  {
    label: 'Platform',
    items: [
      { id: 'comms', label: 'Comms', icon: MessageSquare },
      {
        id: 'integrations',
        label: 'Integrations',
        icon: Plug,
        children: [{ id: 'espn', label: 'ESPN', icon: Activity }],
      },
      { id: 'sync', label: 'Sync', icon: RefreshCw },
      { id: 'library', label: 'Library', icon: FolderOpen },
    ],
  },
  {
    label: 'Pools',
    items: [
      { id: 'users', label: 'Users', icon: Users },
      { id: 'pools', label: 'Pools', icon: Trophy },
      { id: 'teams', label: 'Teams', icon: Shield },
    ],
  },
]

function avatarLetter(data: { name?: string | null; email?: string } | undefined) {
  const src = data?.name || data?.email || '?'
  return src[0].toUpperCase()
}

const itemClasses = (isActive: boolean, collapsed: boolean, indented = false) =>
  cn(
    'flex items-center gap-3 rounded-full text-sm font-medium transition-colors',
    collapsed ? 'justify-center px-0 py-2.5' : indented ? 'px-3 py-1.5' : 'px-3 py-2',
    isActive
      ? 'bg-primary/15 text-primary'
      : 'text-muted-foreground hover:text-foreground hover:bg-[rgba(26,30,42,0.6)]',
  )

// Floating label shown beside an icon-only row when the sidebar is collapsed.
// Popover-styled label chip; pure CSS hover, no deps.
function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="relative group">
      {children}
      <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md border border-white/10 bg-popover px-2 py-1 text-xs text-foreground opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        {label}
      </span>
    </div>
  )
}

// A trailing count chip (right-aligned). Wired off `item.badge`; no items set it
// today, but the slot exists so live counts can be added later.
function Badge({ count }: { count: number }) {
  return (
    <span className="ml-auto rounded-full bg-destructive px-1.5 text-[11px] font-semibold leading-5 text-destructive-foreground">
      {count}
    </span>
  )
}

export default function AdminSidebar({
  collapsed,
  onToggleSidebar,
}: {
  collapsed: boolean
  onToggleSidebar: () => void
}) {
  const { pathname } = useLocation()
  const { data: me } = useMe()
  const { signOut } = useClerk()
  // Track which collapsible groups are open. Auto-open a group when the active
  // route is inside it (e.g. landing on /admin/integrations/espn directly).
  const [open, setOpen] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setOpen((prev) => {
      const next = { ...prev }
      for (const g of groups) {
        for (const item of g.items) {
          if (item.children && pathname.startsWith(`/admin/${item.id}`)) next[item.id] = true
        }
      }
      return next
    })
  }, [pathname])

  // One nav row. Collapsible groups (Integrations) render a chevron disclosure
  // when expanded; collapsed they degrade to a plain link straight to the section.
  function renderItem({ id, label, icon: Icon, badge, children }: Item) {
    if (children && !collapsed) {
      const isOpen = open[id] ?? false
      return (
        <div key={id} className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setOpen((o) => ({ ...o, [id]: !isOpen }))}
            className={cn(itemClasses(false, false), 'w-full')}
          >
            <Icon className="size-4 shrink-0" />
            <span className="flex-1 truncate text-left">{label}</span>
            <ChevronDown
              className={cn('size-4 shrink-0 transition-transform', isOpen && 'rotate-180')}
            />
          </button>
          {isOpen &&
            children.map((child) => (
              <NavLink
                key={child.id}
                to={`/admin/${id}/${child.id}`}
                className={({ isActive }) => cn(itemClasses(isActive, false, true), 'ml-4')}
              >
                <child.icon className="size-4 shrink-0" />
                <span className="truncate">{child.label}</span>
              </NavLink>
            ))}
        </div>
      )
    }

    const link = (
      <NavLink to={`/admin/${id}`} className={({ isActive }) => itemClasses(isActive, collapsed)}>
        <Icon className="size-4 shrink-0" />
        {!collapsed && <span className="truncate">{label}</span>}
        {!collapsed && badge != null && <Badge count={badge} />}
      </NavLink>
    )

    return collapsed ? (
      <Tooltip key={id} label={label}>
        {link}
      </Tooltip>
    ) : (
      <div key={id}>{link}</div>
    )
  }

  return (
    <aside
      className={cn('shrink-0 transition-[width] duration-200', collapsed ? 'w-[60px]' : 'w-60')}
    >
      <div className="flex h-full flex-col border-r border-border/40 bg-[rgba(16,18,24,0.62)] shadow-xl shadow-black/30 backdrop-blur-xl">
        {/* Brand lockup + collapse toggle. Fixed height + centered so it lines up
            with the page header bar (h-16) in AdminShell. */}
        <div
          className={cn(
            'flex shrink-0 border-b border-border/40 px-3',
            collapsed ? 'flex-col items-center gap-2 py-3' : 'h-16 items-center gap-2',
          )}
        >
          <img
            src={logo256w}
            srcSet={`${logo256w} 1x, ${logo512w} 2x`}
            alt="KBP Logo"
            className="size-9 shrink-0 object-contain"
          />
          {!collapsed && (
            <span className="truncate text-base font-semibold tracking-tight text-foreground">
              KBP Admin
            </span>
          )}
          <button
            onClick={onToggleSidebar}
            aria-label="Toggle sidebar"
            title="Toggle sidebar"
            className={cn(
              'shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-[rgba(26,30,42,0.6)] hover:text-foreground',
              !collapsed && 'ml-auto',
            )}
          >
            <PanelLeft className="size-4" />
          </button>
        </div>

        {/* Grouped nav */}
        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 py-2">
          {groups.map((group, gi) => (
            <div key={group.label} className="flex flex-col gap-1">
              {collapsed ? (
                gi > 0 && <div className="mx-1 my-1.5 border-t border-border/40" />
              ) : (
                <div className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {group.label}
                </div>
              )}
              {group.items.map(renderItem)}
            </div>
          ))}
        </nav>

        {/* Back to site */}
        <div className="shrink-0 border-t border-border/40 px-2 pt-2">
          {collapsed ? (
            <Tooltip label="Back to site">
              <Link to="/" className={itemClasses(false, true)}>
                <ArrowLeft className="size-4 shrink-0" />
              </Link>
            </Tooltip>
          ) : (
            <Link to="/" className={itemClasses(false, false)}>
              <ArrowLeft className="size-4 shrink-0" />
              <span className="truncate">Back to site</span>
            </Link>
          )}
        </div>

        {/* Profile footer */}
        <div className="shrink-0 p-2">
          {collapsed ? (
            <Tooltip label={me?.name || me?.email || 'Account'}>
              <div className="flex justify-center py-1">
                <div className="flex size-8 items-center justify-center rounded-full border border-primary/30 bg-primary/20 text-sm font-semibold text-primary">
                  {avatarLetter(me)}
                </div>
              </div>
            </Tooltip>
          ) : (
            <div className="flex items-center gap-2.5 px-1.5 py-1">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/20 text-sm font-semibold text-primary">
                {avatarLetter(me)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground">
                  {me?.name || me?.email || 'Account'}
                </div>
                {me?.name && me?.email && (
                  <div className="truncate text-xs text-muted-foreground">{me.email}</div>
                )}
              </div>
              <button
                onClick={() => signOut({ redirectUrl: '/' })}
                aria-label="Sign out"
                title="Sign out"
                className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-destructive"
              >
                <LogOut className="size-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
