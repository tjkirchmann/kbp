import { motion } from 'motion/react'
import { useRevealVariants, viewportOnce } from './homeMotion'

export function CommissionerLetter() {
  const { container, item } = useRevealVariants()

  return (
    <section className="mx-auto w-full max-w-4xl px-6 py-20 sm:py-28">
      <motion.div
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={viewportOnce}
        className="flex flex-col gap-10"
      >
        <motion.div variants={item} className="flex items-center gap-6">
          <div className="flex shrink-0 flex-col gap-1">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">
              A message from the Commissioner
            </p>
            <p className="text-sm text-muted-foreground">
              Eric Kirchmann — Founder / Commissioner / President / CEO
            </p>
          </div>
          <div className="hatch h-10 flex-1 rounded" />
        </motion.div>

        <motion.blockquote
          variants={item}
          className="text-2xl font-medium italic leading-snug tracking-tight text-foreground/90 sm:text-4xl"
        >
          <span aria-hidden="true" className="text-primary">
            “
          </span>
          In the bizarre world of the KBP, wives trounce husbands, grandmas talk trash, and school
          children dominate you.
          <span aria-hidden="true" className="text-primary">
            ”
          </span>
        </motion.blockquote>

        <div className="flex max-w-prose flex-col gap-5 text-base leading-relaxed text-muted-foreground">
          <motion.p variants={item}>
            Welcome to the 2024-25, 30th (or 31st), Kinda Annual Kirchmann Bowl Pool, otherwise
            referred to as the KBP. If you are new to the KBP, it started as a small family pool
            around 1992 or 1993 (we don't know for sure) and quickly morphed into a national (and
            international) sensation. Entries sometimes come from faraway countries like Ecuador,
            Greece, and the Republic of Texas. Participants are an odd, and I do mean odd, and
            eclectic groups of friends accumulated from all phases of my life. No football knowledge
            is required. Ignorance is encouraged as you make your picks in the unpredictable world
            of bowl games. It's a pool even Canadians can win. In the bizarre world of the KBP,
            wives trounce husbands, grandmas talk trash, school children dominate you and that
            scintillating Sun Belt/MAC match-up becomes must watch TV.
          </motion.p>
          <motion.p variants={item}>
            Absolutely no money rides on the KBP. The only prizes are bragging rights, and oh what
            rights those are! The KBP has taken smack talk to a new level. You might get blasted by
            the blue haired, 4pm dinner club or toddlers in Indiana (and everyone in between).
            Good-natured smack talk is encouraged, but keep it clean! Besides that, as Roitman
            quipped, "Here's a quick lesson on KBP etiquette.. there is no such thing." If someone
            gives you the business, give it right back to them. Like on the playground, it means
            they like you.
          </motion.p>
        </div>

        <motion.p variants={item} className="text-sm font-medium text-foreground/80">
          — Eric Kirchmann
        </motion.p>
      </motion.div>
    </section>
  )
}
