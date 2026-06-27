import { useRef, useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { ChevronsUpDown } from 'lucide-react'

export type Crumb = { label: string; to: string }

// Top-level admin sections, in sidebar order. The first breadcrumb crumb is a
// switcher over these — selecting one navigates to that section.
const SECTIONS: { label: string; path: string }[] = [
  { label: 'Comms', path: '/admin/comms' },
  { label: 'Integrations', path: '/admin/integrations' },
  { label: 'Users', path: '/admin/users' },
  { label: 'Pools', path: '/admin/pools' },
  { label: 'Teams', path: '/admin/teams' },
]

const crumbText = (leaf: boolean) =>
  leaf
    ? 'text-base font-semibold tracking-tight text-foreground'
    : 'text-base font-semibold tracking-tight text-muted-foreground hover:text-foreground transition-colors'

// The first crumb: label + chevron that opens a dropdown to jump between sections.
function SectionSwitcher({ crumb, isLeaf }: { crumb: Crumb; isLeaf: boolean }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative flex items-center gap-1.5">
      {/* Text → navigate to the section; chevron → open the switcher dropdown. */}
      <NavLink to={crumb.to} className={crumbText(isLeaf)}>
        {crumb.label}
      </NavLink>
      <button
        type="button"
        aria-label="Switch section"
        onClick={() => setOpen((o) => !o)}
        className="rounded p-0.5 text-muted-foreground/70 transition-colors hover:text-foreground"
      >
        <ChevronsUpDown className="size-4" />
      </button>

      {open && (
        <div
          className="absolute left-0 top-9 z-50 min-w-48 overflow-hidden rounded-xl border border-white/10 py-1.5 shadow-xl"
          style={{
            background: 'rgba(13, 15, 19, 0.92)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
          }}
        >
          {SECTIONS.map((s) => {
            const active = s.label === crumb.label
            return (
              <button
                key={s.path}
                onClick={() => {
                  navigate(s.path)
                  setOpen(false)
                }}
                className={`block w-full px-4 py-2 text-left text-sm transition-colors ${
                  active
                    ? 'text-foreground bg-white/5'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                }`}
              >
                {s.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function AdminBreadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <div className="shrink-0 flex items-center px-6 pt-5 pb-4">
      <div className="flex items-center gap-3">
        {crumbs.map((crumb, i) => {
          const isLeaf = i === crumbs.length - 1
          return (
            <span key={i} className="flex items-center gap-3">
              {i > 0 && <span className="text-lg font-light text-muted-foreground/50">/</span>}
              {i === 0 ? (
                <SectionSwitcher crumb={crumb} isLeaf={isLeaf} />
              ) : crumb.to && !isLeaf ? (
                <NavLink to={crumb.to} className={crumbText(false)}>
                  {crumb.label}
                </NavLink>
              ) : (
                <span className={crumbText(true)}>{crumb.label}</span>
              )}
            </span>
          )
        })}
      </div>
    </div>
  )
}
