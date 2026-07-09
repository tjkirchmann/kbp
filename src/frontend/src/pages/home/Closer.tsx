import { motion } from 'motion/react'
import { useAuth } from '@clerk/react'
import { useNavigate } from 'react-router-dom'
import { useRevealVariants, viewportOnce } from './homeMotion'

export function Closer() {
  const { isSignedIn } = useAuth()
  const navigate = useNavigate()
  const { container, item } = useRevealVariants()

  return (
    <section className="px-6 py-24 sm:py-32">
      <motion.div
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={viewportOnce}
        className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center"
      >
        <motion.p
          variants={item}
          className="text-[11px] font-semibold uppercase tracking-[0.28em] text-primary sm:text-xs"
        >
          Bragging rights await
        </motion.p>
        <motion.h2
          variants={item}
          className="text-4xl font-bold leading-[1.02] tracking-tight text-foreground sm:text-6xl"
        >
          Think you can outpick <span className="text-gradient">Grandma?</span>
        </motion.h2>
        <motion.p variants={item} className="max-w-md text-base text-muted-foreground">
          No football knowledge required. Ignorance encouraged. A pool even Canadians can win.
        </motion.p>
        <motion.div variants={item} className="flex flex-col items-center gap-3">
          <button
            onClick={() => navigate(isSignedIn ? '/submission' : '/login')}
            className="btn-gold rounded-full px-7 py-3 text-sm font-semibold text-white"
          >
            Enter the Pool
          </button>
          <p className="text-xs text-muted-foreground/80">$0 entry · bragging rights only</p>
        </motion.div>
      </motion.div>
    </section>
  )
}
