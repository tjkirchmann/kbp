import { useState, useRef, useEffect } from 'react'
import { Trophy, BookOpen, LogIn, Menu, X, Newspaper, ShieldCheck, LogOut } from 'lucide-react'
import logo256w from '@/assets/logo/logo-256w.png'
import logo512w from '@/assets/logo/logo-512w.png'
import { useClerk, useAuth } from '@clerk/react'
import { Link, useNavigate } from 'react-router-dom'
import { useMe } from '@/services/useMe'

const navBtn = "flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-[rgba(26,30,42,0.6)] transition-colors whitespace-nowrap"
const mobileNavBtn = "flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-[rgba(26,30,42,0.6)] transition-colors w-full"

function avatarLetter(data: { name?: string | null; email?: string } | undefined) {
  const src = data?.name || data?.email || '?'
  return src[0].toUpperCase()
}

function AvatarMenu({ data, isAdmin }: { data: { name?: string | null; email?: string } | undefined; isAdmin: boolean }) {
  const { signOut } = useClerk()
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
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-sm font-semibold hover:bg-primary/30 transition-colors"
      >
        {avatarLetter(data)}
      </button>

      {open && (
        <div className="absolute -right-6 top-12 rounded-xl overflow-hidden min-w-40 z-50 shadow-lg border border-white/10" style={{ background: 'rgba(13, 15, 19, 0.92)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
          {isAdmin && (
            <button
              onClick={() => { navigate('/admin'); setOpen(false) }}
              className="flex items-center gap-2.5 w-full px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-[rgba(26,30,42,0.6)] transition-colors"
            >
              <ShieldCheck className="size-4" />
              Admin
            </button>
          )}
          {isAdmin && <div className="border-t border-border/40" />}
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

export default function Header() {
  const { signOut } = useClerk()
  const { isSignedIn } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const { data } = useMe()
  const isAdmin = data?.is_admin ?? false

  return (
    <header className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-4xl px-4">
      <div className="glass-panel rounded-full px-6 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5 shrink-0">
          <img
            src={logo256w}
            srcSet={`${logo256w} 1x, ${logo512w} 2x`}
            alt="KBP Logo"
            className="h-[40px] w-auto object-contain"
          />
        </Link>

        {/* Nav — desktop */}
        <nav className="hidden sm:flex items-center gap-1">
          <button className={navBtn}>
            <BookOpen className="size-4" />
            Record Book
          </button>
          <button className={navBtn}>
            <Newspaper className="size-4" />
            Updates
          </button>
          <button className={navBtn}>
            <Trophy className="size-4" />
            Standings
          </button>
          {isSignedIn ? (
            <AvatarMenu data={data} isAdmin={isAdmin} />
          ) : (
            <button
              onClick={() => navigate('/login')}
              className="btn-primary flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium text-white whitespace-nowrap ml-1"
            >
              <LogIn className="size-4" />
              Sign In
            </button>
          )}
        </nav>

        {/* Hamburger — mobile */}
        <button
          className="sm:hidden p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-[rgba(26,30,42,0.6)] transition-colors"
          onClick={() => setMenuOpen(o => !o)}
          aria-label="Toggle menu"
        >
          {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="sm:hidden mt-2 glass-panel rounded-2xl px-3 py-3 flex flex-col gap-1">
          <button className={mobileNavBtn} onClick={() => setMenuOpen(false)}>
            <BookOpen className="size-4" />
            Record Book
          </button>
          <button className={mobileNavBtn} onClick={() => setMenuOpen(false)}>
            <Newspaper className="size-4" />
            Updates
          </button>
          <button className={mobileNavBtn} onClick={() => setMenuOpen(false)}>
            <Trophy className="size-4" />
            Standings
          </button>
          <div className="border-t border-border/40 my-1" />
          {isSignedIn ? (
            <>
              {isAdmin && (
                <button
                  onClick={() => { navigate('/admin'); setMenuOpen(false) }}
                  className={mobileNavBtn}
                >
                  <ShieldCheck className="size-4" />
                  Admin
                </button>
              )}
              <button
                onClick={() => { signOut({ redirectUrl: '/' }); setMenuOpen(false) }}
                className={mobileNavBtn}
              >
                <LogOut className="size-4" />
                Sign Out
              </button>
            </>
          ) : (
            <button
              onClick={() => { navigate('/login'); setMenuOpen(false) }}
              className="btn-primary flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white w-full"
            >
              <LogIn className="size-4" />
              Sign In
            </button>
          )}
        </div>
      )}
    </header>
  )
}
