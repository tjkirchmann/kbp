import { ChevronDown } from 'lucide-react'
import { motion, useScroll, useTransform } from 'motion/react'
import { useAuth } from '@clerk/react'
import { useNavigate } from 'react-router-dom'
import heroJpeg896 from '@/assets/images/main-home-picture-896w.jpg'
import heroJpeg1792 from '@/assets/images/main-home-picture-1792w.jpg'
import { useRevealVariants } from './homeMotion'

export function Hero() {
  const { isSignedIn } = useAuth()
  const navigate = useNavigate()
  const { container, item, reduceMotion } = useRevealVariants()
  const { scrollY } = useScroll()
  const imageY = useTransform(scrollY, [0, 900], [0, 200])
  const cueOpacity = useTransform(scrollY, [0, 160], [1, 0])

  return (
    <section className="relative flex min-h-[100svh] flex-col justify-end overflow-hidden">
      {/* Photo layer — slow Ken Burns settle + scroll parallax */}
      <motion.div className="absolute inset-0" style={reduceMotion ? undefined : { y: imageY }}>
        <motion.img
          src={heroJpeg1792}
          srcSet={`${heroJpeg896} 896w, ${heroJpeg1792} 1792w`}
          sizes="100vw"
          alt="Kirchmann Bowl Pool group photo"
          fetchpriority="high"
          decoding="async"
          className="h-full w-full object-cover"
          initial={reduceMotion ? false : { scale: 1.12 }}
          animate={reduceMotion ? undefined : { scale: 1 }}
          transition={{ duration: 14, ease: 'easeOut' }}
        />
      </motion.div>

      {/* Scrims — melt the photo into the page gradient, no card edge */}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/55 to-transparent" />
      <div className="hero-scrim absolute inset-0" />
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-background/60 to-transparent" />

      {/* Copy block */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        transition={{ delayChildren: 0.25, staggerChildren: 0.14 }}
        className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-6 pb-24 text-center sm:items-start sm:pb-28 sm:text-left"
      >
        <div className="flex flex-col gap-3">
          <motion.p
            variants={item}
            className="text-[11px] font-semibold uppercase tracking-[0.28em] text-primary drop-shadow-[0_1px_6px_rgba(0,0,0,0.8)] sm:text-xs"
          >
            30-ish years · kinda annual
          </motion.p>
          <motion.h1
            variants={item}
            className="text-5xl font-bold leading-[0.95] tracking-tight text-foreground drop-shadow-[0_2px_16px_rgba(0,0,0,0.7)] sm:text-6xl lg:text-7xl"
          >
            The Kirchmann
            <br />
            <span className="text-gradient">Bowl Pool</span>
          </motion.h1>
          <motion.p
            variants={item}
            className="max-w-lg text-base text-foreground/90 drop-shadow-[0_1px_8px_rgba(0,0,0,0.8)] sm:text-lg"
          >
            No football knowledge required. Ignorance encouraged. A pool even Canadians can win.
          </motion.p>
        </div>
        <motion.div
          variants={item}
          className="flex flex-wrap justify-center gap-3 sm:justify-start"
        >
          <button
            onClick={() => navigate(isSignedIn ? '/submission' : '/login')}
            className="btn-gold rounded-full px-6 py-3 text-sm font-semibold text-white"
          >
            Enter the Pool
          </button>
          <button
            onClick={() => navigate('/record-book')}
            className="btn-glass-blue rounded-full px-6 py-3 text-sm font-semibold"
          >
            Browse the Record Book
          </button>
        </motion.div>
      </motion.div>

      {/* Scroll cue */}
      <motion.div
        aria-hidden="true"
        className="absolute bottom-5 left-1/2 z-10 -translate-x-1/2"
        style={{ opacity: cueOpacity }}
      >
        <motion.div
          animate={reduceMotion ? undefined : { y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <ChevronDown className="size-5 text-foreground/60" />
        </motion.div>
      </motion.div>
    </section>
  )
}
