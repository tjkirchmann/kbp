import { useRef } from 'react'
import { motion, useScroll, useTransform, type MotionValue } from 'motion/react'
import galleryGrandpa from '@/assets/images/gallery-grandpa.webp'
import galleryBoxing from '@/assets/images/gallery-boxing-gloves.webp'
import galleryFbCorn from '@/assets/images/gallery-fb-corn.webp'
import { useRevealVariants, viewportOnce } from './homeMotion'

interface ArchivePhotoProps {
  src: string
  alt: string
  rotate: number
  parallaxY?: MotionValue<number>
  className?: string
}

function ArchivePhoto({ src, alt, rotate, parallaxY, className }: ArchivePhotoProps) {
  return (
    <motion.figure style={parallaxY ? { y: parallaxY } : undefined} className={className}>
      <motion.div
        initial="rest"
        animate="rest"
        whileHover="hover"
        variants={{
          rest: { rotate, y: 0 },
          hover: { rotate: 0, y: -6 },
        }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="h-full overflow-hidden rounded-xl border border-white/8 shadow-xl shadow-black/40"
      >
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      </motion.div>
    </motion.figure>
  )
}

export function Archives() {
  const { container, item, reduceMotion } = useRevealVariants()
  const sectionRef = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'end start'],
  })
  const slowY = useTransform(scrollYProgress, [0, 1], [30, -30])
  const midY = useTransform(scrollYProgress, [0, 1], [60, -60])
  const fastY = useTransform(scrollYProgress, [0, 1], [90, -90])

  return (
    <section ref={sectionRef} className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-28">
      <motion.div
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={viewportOnce}
        className="flex flex-col gap-12"
      >
        <motion.div variants={item} className="flex items-center gap-6">
          <div className="flex min-w-0 flex-col gap-1 sm:shrink-0">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">
              From the Archives
            </p>
            <p className="text-sm text-muted-foreground">
              Three decades of questionable decisions, immortalized.
            </p>
          </div>
          <div className="hatch hidden h-10 flex-1 rounded sm:block" />
        </motion.div>

        <motion.div
          variants={item}
          className="grid grid-cols-2 items-start gap-5 md:grid-cols-12 md:gap-8"
        >
          <ArchivePhoto
            src={galleryGrandpa}
            alt="Vintage KBP football portrait"
            rotate={-1.5}
            parallaxY={reduceMotion ? undefined : slowY}
            className="aspect-[4/5] md:col-span-5 md:mt-12"
          />
          <ArchivePhoto
            src={galleryBoxing}
            alt="Worn leather boxing gloves"
            rotate={1}
            parallaxY={reduceMotion ? undefined : midY}
            className="aspect-square md:col-span-4"
          />
          <ArchivePhoto
            src={galleryFbCorn}
            alt="Weathered football in a field"
            rotate={-0.75}
            parallaxY={reduceMotion ? undefined : fastY}
            className="col-span-2 aspect-[16/9] md:col-span-3 md:aspect-[3/4] md:mt-20"
          />
        </motion.div>
      </motion.div>
    </section>
  )
}
