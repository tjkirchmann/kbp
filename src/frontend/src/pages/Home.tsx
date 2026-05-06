import { useState } from 'react'
import { Trophy, BookOpen, LogIn, Menu, X, Newspaper, ChevronRight } from 'lucide-react'
import logo256w from '@/assets/logo/logo-256w.png'
import logo512w from '@/assets/logo/logo-512w.png'
import heroJpeg896 from '@/assets/images/main-home-picture-896w.jpg'
import heroJpeg1792 from '@/assets/images/main-home-picture-1792w.jpg'
import { useClerk, useAuth } from '@clerk/react'
import { Link, useNavigate } from 'react-router-dom'
import { useMe } from '@/services/useMe'

const navBtn = "flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-[rgba(26,30,42,0.6)] transition-colors whitespace-nowrap"
const mobileNavBtn = "flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-[rgba(26,30,42,0.6)] transition-colors w-full"

function Header() {
  const { signOut } = useClerk()
  const { isSignedIn } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

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
            <button onClick={() => signOut({ redirectUrl: '/' })} className={navBtn}>
              Sign Out
            </button>
          ) : (
            <button
              onClick={() => navigate('/login')}
              className="btn-primary flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium text-white whitespace-nowrap ml-1"
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
            <button onClick={() => { signOut({ redirectUrl: '/' }); setMenuOpen(false) }} className={mobileNavBtn}>
              Sign Out
            </button>
          ) : (
            <button
              onClick={() => { navigate('/login'); setMenuOpen(false) }}
              className="btn-primary flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium text-white w-full"
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

function WelcomeCard() {
  const navigate = useNavigate()
  return (
    <div className="glass-panel rounded-2xl overflow-hidden flex flex-col gap-0">
      <div className="relative">
        <img
          src={heroJpeg896}
          srcSet={`${heroJpeg896} 896w, ${heroJpeg1792} 1792w`}
          sizes="(max-width: 928px) calc(100vw - 32px), 896px"
          alt="Kirchmann Bowl Pool group photo"
          width={896}
          height={595}
          fetchpriority="high"
          decoding="async"
          className="w-full object-cover max-h-64"
        />
        <div className="absolute bottom-4 left-0 right-0 flex gap-3 justify-center sm:justify-start sm:left-6 sm:right-auto px-4 sm:px-0">
          <button
            onClick={() => navigate('/login')}
            className="btn-gold px-5 py-2.5 rounded-full text-sm font-semibold text-white"
          >
            Enter the Pool
          </button>
          <button
            className="btn-glass-blue px-5 py-2.5 rounded-full text-sm font-semibold"
          >
            View Standings
          </button>
        </div>
      </div>
      <div className="p-8 flex flex-col gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1">A Message from Eric Kirchmann...</p>
        <p className="text-sm text-muted-foreground">KBP Founder / Commissioner / President / CEO</p>
      </div>
      <div className="space-y-4 text-sm text-foreground/80 leading-relaxed">
        <p>
          Welcome to the 2024-25, 30th (or 31st), Kinda Annual Kirchmann Bowl Pool, otherwise referred to as the KBP. If you are new to the KBP, it started as a small family pool around 1992 or 1993 (we don't know for sure) and quickly morphed into a national (and international) sensation. Entries sometimes come from faraway countries like Ecuador, Greece, and the Republic of Texas. Participants are an odd, and I do mean odd, and eclectic groups of friends accumulated from all phases of my life. No football knowledge is required. Ignorance is encouraged as you make your picks in the unpredictable world of bowl games. It's a pool even Canadians can win. In the bizarre world of the KBP, wives trounce husbands, grandmas talk trash, school children dominate you and that scintillating Sun Belt/MAC match-up becomes must watch TV.
        </p>
        <p>
          Absolutely no money rides on the KBP. The only prizes are bragging rights, and oh what rights those are! The KBP has taken smack talk to a new level. You might get blasted by the blue haired, 4pm dinner club or toddlers in Indiana (and everyone in between). Good-natured smack talk is encouraged, but keep it clean! Besides that, as Roitman quipped, "Here's a quick lesson on KBP etiquette.. there is no such thing." If someone gives you the business, give it right back to them. Like on the playground, it means they like you.
        </p>
      </div>
      </div>
    </div>
  )
}

function CTACard({ icon, title, description, cta, onClick }: {
  icon: React.ReactNode
  title: string
  description: string
  cta: string
  onClick: () => void
}) {
  return (
    <div className="glass-panel rounded-2xl p-6 flex flex-col gap-4 flex-1">
      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
        {icon}
      </div>
      <div className="flex flex-col gap-1.5 flex-1">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
      </div>
      <button
        onClick={onClick}
        className="flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
      >
        {cta}
        <ChevronRight className="size-4" />
      </button>
    </div>
  )
}

export default function Home() {
  const { isSignedIn } = useAuth()
  const navigate = useNavigate()
  const { data } = useMe()

  return (
    <div className="min-h-screen">
      <Header />

      <main className="pt-24 pb-12 px-4 flex flex-col items-center gap-4 max-w-4xl mx-auto">
        <WelcomeCard />

        <div className="flex flex-col sm:flex-row gap-4 w-full">
          <CTACard
            icon={<BookOpen className="size-5" />}
            title="All Time Lists"
            description="See an archive of the greatest trash talk ever recorded, and the all-time best and worst KBP performances."
            cta="Explore the Record Book"
            onClick={() => {}}
          />
          <CTACard
            icon={<LogIn className="size-5" />}
            title="Join the Action"
            description="Ready to take the next step? No football knowledge or donation required — just sign in and make your picks."
            cta="Enter the Pool"
            onClick={() => navigate('/login')}
          />
          <CTACard
            icon={<Newspaper className="size-5" />}
            title="Updates"
            description="Smack talk will be strictly via email, but check back here for the latest standings and KBP news."
            cta="Get the Skinny"
            onClick={() => {}}
          />
        </div>

        {isSignedIn && data && (
          <p className="text-xs text-muted-foreground font-mono mt-2">{data.user_id}</p>
        )}
      </main>
    </div>
  )
}
