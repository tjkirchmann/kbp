import { useReducedMotion, type Variants } from 'motion/react'

/** Shared scroll-reveal variants; collapses to opacity-only under reduced motion. */
export function useRevealVariants() {
  const reduceMotion = useReducedMotion()

  const container: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: 0.12 } },
  }

  const item: Variants = reduceMotion
    ? {
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { duration: 0.5 } },
      }
    : {
        hidden: { opacity: 0, y: 26 },
        show: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
        },
      }

  return { container, item, reduceMotion }
}

export const viewportOnce = { once: true, margin: '-80px' } as const
