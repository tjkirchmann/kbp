import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import Header from '@/components/Header'
import UsersPanel from './admin/UsersPanel'
import type { AdminUser } from '@/services/useAdminUsers'

type Section = 'users'

const sections: { id: Section; label: string }[] = [
  { id: 'users', label: 'Users' },
]

type Breadcrumb = { label: string; onClick?: () => void }

export default function Admin() {
  const [section, setSection] = useState<Section>('users')
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)

  const activeLabel = sections.find(s => s.id === section)?.label ?? ''

  const breadcrumbs: Breadcrumb[] = [{ label: activeLabel, onClick: selectedUser ? () => setSelectedUser(null) : undefined }]
  if (selectedUser) breadcrumbs.push({ label: selectedUser.name ?? selectedUser.email })

  return (
    <div className="min-h-screen">
      <Header />
      <main className="pt-24 pb-12 px-4 max-w-4xl mx-auto w-full">
        <div className="glass-panel rounded-2xl w-full flex min-h-[calc(100vh-9rem)]">
          <nav className="flex flex-col gap-1 p-3 pt-4 w-40 shrink-0 border-r border-border/40 overflow-y-auto">
            {sections.map(s => (
              <button
                key={s.id}
                onClick={() => { setSection(s.id); setSelectedUser(null) }}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors text-center w-full ${
                  section === s.id
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-[rgba(26,30,42,0.6)]'
                }`}
              >
                {s.label}
              </button>
            ))}
          </nav>
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Panel header */}
            <div className="flex items-center gap-6 px-6 py-4 border-b border-border/40 shrink-0">
              <div className="flex items-center gap-1.5 shrink-0">
                {breadcrumbs.map((crumb, i) => (
                  <span key={i} className="flex items-center gap-1.5">
                    {i > 0 && <ChevronRight className="size-4 text-muted-foreground/40" />}
                    {crumb.onClick ? (
                      <button
                        onClick={crumb.onClick}
                        className="text-2xl font-semibold tracking-tight text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {crumb.label}
                      </button>
                    ) : (
                      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{crumb.label}</h1>
                    )}
                  </span>
                ))}
              </div>
              <div className="hatch flex-1 h-8 rounded" />
            </div>
            {/* Panel content */}
            <div className="flex-1 p-6 overflow-y-auto">
              {section === 'users' && (
                <UsersPanel
                  selected={selectedUser}
                  onSelect={setSelectedUser}
                  onBack={() => setSelectedUser(null)}
                />
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
