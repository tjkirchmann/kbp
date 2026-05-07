import { useState } from 'react'
import { Trophy, BookOpen, LogIn, Menu, X, Newspaper, ShieldCheck } from 'lucide-react'
import logo256w from '@/assets/logo/logo-256w.png'
import logo512w from '@/assets/logo/logo-512w.png'
import { useClerk, useAuth } from '@clerk/react'
import { Link, useNavigate } from 'react-router-dom'
import { useMe } from '@/services/useMe'

const navBtn = "flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-[rgba(26,30,42,0.6)] transition-colors whitespace-nowrap"
const mobileNavBtn = "flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-[rgba(26,30,42,0.6)] transition-colors w-full"

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
          {isAdmin && (
            <button
              onClick={() => navigate('/admin')}
              className="btn-primary-gold flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium text-white whitespace-nowrap ml-1"
            >
              <ShieldCheck className="size-4" />
              Admin
            </button>
          )}
          {isSignedIn ? (
            <button onClick={() => signOut({ redirectUrl: '/' })} className={navBtn}>
              Sign Out
            </button>
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
          {isAdmin && (
            <button
              onClick={() => { navigate('/admin'); setMenuOpen(false) }}
              className="btn-primary-gold flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white w-full"
            >
              <ShieldCheck className="size-4" />
              Admin
            </button>
          )}
          <div className="border-t border-border/40 my-1" />
          {isSignedIn ? (
            <button onClick={() => { signOut({ redirectUrl: '/' }); setMenuOpen(false) }} className={mobileNavBtn}>
              Sign Out
            </button>
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
