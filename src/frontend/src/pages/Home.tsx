import { useEffect, useRef } from 'react'
import { BookOpen, LogIn, Newspaper, ChevronRight } from 'lucide-react'
import heroJpeg896 from '@/assets/images/main-home-picture-896w.jpg'
import heroJpeg1792 from '@/assets/images/main-home-picture-1792w.jpg'
import galleryGrandpa from '@/assets/images/gallery-grandpa.webp'
import galleryBoxing from '@/assets/images/gallery-boxing-gloves.webp'
import galleryFbCorn from '@/assets/images/gallery-fb-corn.webp'
import { useAuth } from '@clerk/react'
import { useNavigate } from 'react-router-dom'
import { useMe } from '@/services/useMe'
import Header from '@/components/Header'

function WelcomeCard() {
  const { isSignedIn } = useAuth()
  const navigate = useNavigate()
  return (
    <div className="glass-panel rounded-2xl overflow-hidden flex flex-col gap-0">
      <div className="relative">
        <img
          src={heroJpeg896}
          srcSet={`${heroJpeg896} 896w, ${heroJpeg1792} 1792w`}
          sizes="(max-width: 1152px) calc(100vw - 32px), 1152px"
          alt="Kirchmann Bowl Pool group photo"
          width={896}
          height={595}
          fetchPriority="high"
          decoding="async"
          className="w-full object-cover max-h-80 sm:max-h-96"
        />
        {/* Legibility scrim */}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/55 to-transparent" />
        {/* Headline + CTA overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8 flex flex-col gap-4 items-center text-center sm:items-start sm:text-left">
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">30-ish years · kinda annual</p>
            <h1 className="text-gradient text-3xl sm:text-5xl font-bold tracking-tight leading-[1.05]">
              The Kirchmann<br className="hidden sm:block" /> Bowl Pool
            </h1>
            <p className="text-sm text-foreground/70 max-w-md">No football knowledge required. Ignorance encouraged. A pool even Canadians can win.</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => navigate(isSignedIn ? '/submission' : '/login')}
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
      </div>
      <div className="p-8 flex flex-col gap-5">
        {/* Title row: label left, hatch fills right */}
        <div className="flex items-center gap-6">
          <div className="shrink-0 flex flex-col gap-1">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">A Message from Eric Kirchmann...</p>
            <p className="text-sm text-muted-foreground">KBP Founder / Commissioner / President / CEO</p>
          </div>
          <div className="hatch flex-1 h-10 rounded" />
        </div>
        {/* Pull-quote */}
        <blockquote className="border-l-2 border-primary/60 pl-4 text-lg sm:text-xl font-medium italic text-foreground/90 leading-snug">
          "In the bizarre world of the KBP, wives trounce husbands, grandmas talk trash, and school children dominate you."
        </blockquote>
        <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
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
    <button
      onClick={onClick}
      className="reveal glass-panel glass-panel-hover rounded-2xl p-6 flex flex-col gap-4 flex-1 text-left"
    >
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
          {icon}
        </div>
        <div className="hatch flex-1 h-10 rounded" />
      </div>
      <div className="flex flex-col gap-1.5 flex-1">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
      </div>
      <span className="flex items-center gap-1 text-sm font-medium text-primary">
        {cta}
        <ChevronRight className="size-4" />
      </span>
    </button>
  )
}

const stats = [
  { value: '~30', label: 'Years Running' },
  { value: '3', label: 'Continents Entered' },
  { value: '$0', label: 'On the Line' },
  { value: '∞', label: 'Trash Talk' },
]

function StatStrip() {
  return (
    <div className="reveal glass-panel rounded-2xl grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-white/8">
      {stats.map((s) => (
        <div key={s.label} className="flex flex-col items-center gap-0.5 py-5 px-4">
          <span className="text-2xl sm:text-3xl font-bold text-primary">{s.value}</span>
          <span className="text-[11px] uppercase tracking-widest text-muted-foreground">{s.label}</span>
        </div>
      ))}
    </div>
  )
}

const galleryImages = [
  { src: galleryGrandpa, alt: 'Vintage KBP football portrait' },
  { src: galleryBoxing, alt: 'Worn leather boxing gloves' },
  { src: galleryFbCorn, alt: 'Weathered football in a field' },
]

function PhotoGallery() {
  return (
    <div className="reveal glass-panel rounded-2xl p-6 flex flex-col gap-4 w-full overflow-hidden">
      {/* Title row: label left, hatch fills right */}
      <div className="flex items-center gap-6">
        <div className="shrink-0 flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">From the Archives</p>
          <p className="text-sm text-muted-foreground">Three decades of questionable decisions, immortalized.</p>
        </div>
        <div className="hatch flex-1 h-10 rounded" />
      </div>
      <div className="overflow-hidden marquee-mask">
        <div className="flex gap-4 w-max animate-marquee hover:[animation-play-state:paused]">
          {[...galleryImages, ...galleryImages].map((img, i) => (
            <div
              key={i}
              className="h-48 sm:h-56 rounded-xl overflow-hidden border border-white/8 shadow-lg shrink-0 transition-transform duration-300 hover:-translate-y-1 hover:scale-[1.02]"
            >
              <img
                src={img.src}
                alt={img.alt}
                loading="lazy"
                decoding="async"
                className="h-full w-auto object-cover"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function useReveal() {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const els = root.querySelectorAll<HTMLElement>('.reveal')
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('in')
            io.unobserve(entry.target)
          }
        }
      },
      { threshold: 0.15 },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])
  return ref
}

export default function Home() {
  const { isSignedIn } = useAuth()
  const navigate = useNavigate()
  useMe()
  const mainRef = useReveal()

  return (
    <div className="min-h-screen">
      <Header />

      <main ref={mainRef} className="pt-24 pb-16 px-4 flex flex-col gap-6 w-full max-w-6xl mx-auto">
        <WelcomeCard />

        <StatStrip />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
            onClick={() => navigate(isSignedIn ? '/submission' : '/login')}
          />
          <CTACard
            icon={<Newspaper className="size-5" />}
            title="Updates"
            description="Smack talk will be strictly via email, but check back here for the latest standings and KBP news."
            cta="Get the Skinny"
            onClick={() => {}}
          />
        </div>

        <PhotoGallery />
      </main>
    </div>
  )
}
