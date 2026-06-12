import { useState, useRef, useEffect } from 'react'
import { PanelLeft, ArrowLeft, LogOut } from 'lucide-react'
import { useClerk } from '@clerk/react'
import { Link } from 'react-router-dom'
import { useMe } from '@/services/useMe'

function avatarLetter(data: { name?: string | null; email?: string } | undefined) {
  const src = data?.name || data?.email || '?'
  return src[0].toUpperCase()
}

function AvatarMenu({ data }: { data: { name?: string | null; email?: string } | undefined }) {
  const { signOut } = useClerk()
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
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-sm font-semibold hover:bg-primary/30 transition-colors"
      >
        {avatarLetter(data)}
      </button>

      {open && (
        <div
          className="absolute right-0 top-12 rounded-xl overflow-hidden min-w-40 z-50 shadow-lg border border-white/10"
          style={{ background: 'rgba(13, 15, 19, 0.92)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}
        >
          <button
            onClick={() => { signOut({ redirectUrl: '/' }); setOpen(false) }}
            className="flex items-center gap-2.5 w-full px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-[rgba(26,30,42,0.6)] transition-colors"
          >
            <LogOut className="size-4 text-destructive" />
            Sign Out
          </button>
        </div>
      )}
    </div>
  )
}

export default function AdminTopBar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const { data } = useMe()

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 px-4 flex items-center justify-between border-b border-border/40 bg-[rgba(13,15,19,0.85)] backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
          className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-[rgba(26,30,42,0.6)] transition-colors"
        >
          <PanelLeft className="size-5" />
        </button>
        <span className="text-base font-semibold tracking-tight text-foreground">KBP Admin</span>
      </div>

      <div className="flex items-center gap-2">
        <Link
          to="/"
          className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-[rgba(26,30,42,0.6)] transition-colors"
        >
          <ArrowLeft className="size-4" />
          Back to site
        </Link>
        <AvatarMenu data={data} />
      </div>
    </header>
  )
}
