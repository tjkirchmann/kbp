import { useEffect, useRef } from 'react'
import { animate, motion, useInView, useMotionValue, useTransform } from 'motion/react'
import { useRevealVariants, viewportOnce } from './homeMotion'

interface Stat {
  label: string
  /** Static display when the value isn't a countable number */
  display?: string
  /** Count-up target; rendered with optional prefix */
  target?: number
  prefix?: string
}

const stats: Stat[] = [
  { label: 'Years Running', target: 30, prefix: '~' },
  { label: 'Continents Entered', target: 3 },
  { label: 'On the Line', display: '$0' },
  { label: 'Trash Talk', display: '∞' },
]

function CountUp({ target, prefix = '' }: { target: number; prefix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })
  const { reduceMotion } = useRevealVariants()
  const value = useMotionValue(0)
  const text = useTransform(value, (v) => `${prefix}${Math.round(v)}`)

  useEffect(() => {
    if (!inView) return
    if (reduceMotion) {
      value.set(target)
      return
    }
    const controls = animate(value, target, { duration: 1.4, ease: 'easeOut' })
    return () => controls.stop()
  }, [inView, reduceMotion, target, value])

  return (
    <motion.span ref={ref} className="tabular-nums">
      {text}
    </motion.span>
  )
}

export function StatBand() {
  const { container, item } = useRevealVariants()

  return (
    <section className="border-y border-white/8">
      <motion.div
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={viewportOnce}
        className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-x-6 gap-y-10 px-6 py-12 sm:py-14 md:grid-cols-4"
      >
        {stats.map((stat) => (
          <motion.div
            key={stat.label}
            variants={item}
            className="flex flex-col items-center gap-1.5 text-center"
          >
            <span className="text-4xl font-bold tracking-tight text-primary sm:text-5xl">
              {stat.target !== undefined ? (
                <CountUp target={stat.target} prefix={stat.prefix} />
              ) : (
                stat.display
              )}
            </span>
            <span className="text-[11px] uppercase tracking-widest text-muted-foreground">
              {stat.label}
            </span>
          </motion.div>
        ))}
      </motion.div>
    </section>
  )
}
