import { useState } from 'react'
import Header from '@/components/Header'
import UsersPanel from './admin/UsersPanel'

type Section = 'users'

const sections: { id: Section; label: string }[] = [
  { id: 'users', label: 'Users' },
]

export default function Admin() {
  const [section, setSection] = useState<Section>('users')

  return (
    <div className="min-h-screen">
      <Header />
      <main className="pt-24 pb-12 px-4 max-w-4xl mx-auto w-full">
        <div className="glass-panel rounded-2xl w-full flex min-h-[calc(100vh-9rem)]">
          <nav className="flex flex-col gap-1 p-3 pt-4 w-40 shrink-0 border-r border-border/40 overflow-y-auto">
            {sections.map(s => (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
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
          <div className="flex-1 p-6 overflow-y-auto">
            {section === 'users' && <UsersPanel />}
          </div>
        </div>
      </main>
    </div>
  )
}
