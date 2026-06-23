import { Check, Flag } from 'lucide-react'

export interface Step {
  id: string
  label: string
  locked?: boolean
}

interface GameItem {
  id: number
  label: string
  picked: boolean
  pickedLogo?: string | null
}

interface Props {
  steps: Step[]
  currentStep: string
  completedSteps: Set<string>
  onStepClick: (id: string) => void
  games?: GameItem[]
  activeGameId?: number | null
  onGameClick?: (id: number) => void
  showReview?: boolean
  onReviewClick?: () => void
}

export default function StepRail({
  steps,
  currentStep,
  completedSteps,
  onStepClick,
  games,
  activeGameId,
  onGameClick,
  showReview,
  onReviewClick,
}: Props) {
  const showGames =
    (currentStep === 'games' || currentStep === 'review') && games && games.length > 0

  const entryStep = steps.find((s) => s.id === 'entry')

  return (
    <nav
      className="flex flex-col gap-1 w-44 shrink-0 pt-1 overflow-y-auto"
      style={{ maxHeight: 'calc(100vh - 16rem)' }}
    >
      {!showGames &&
        steps.map((step, i) => {
          const isCompleted = completedSteps.has(step.id)
          const isCurrent = step.id === currentStep
          const isClickable = isCompleted && !isCurrent

          return (
            <button
              key={step.id}
              disabled={!isClickable && !isCurrent}
              onClick={() => isClickable && onStepClick(step.id)}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left transition-colors w-full ${
                isCurrent
                  ? 'bg-primary/10 text-primary font-medium'
                  : isCompleted
                    ? 'text-muted-foreground hover:text-foreground hover:bg-[rgba(26,30,42,0.6)] cursor-pointer'
                    : 'text-muted-foreground/40 cursor-default'
              }`}
            >
              <span
                className={`size-5 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold border ${
                  isCompleted
                    ? 'bg-primary border-primary text-white'
                    : isCurrent
                      ? 'border-primary/60 text-primary bg-primary/10'
                      : 'border-border/40 text-muted-foreground/40'
                }`}
              >
                {isCompleted ? <Check className="size-3" strokeWidth={3} /> : i + 1}
              </span>
              <span className="truncate">{step.label}</span>
            </button>
          )
        })}

      {showGames && (
        <>
          {/* Item #1: Your Entry — always visible, clickable, shown as completed */}
          <button
            onClick={() => onStepClick('entry')}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left transition-colors w-full text-muted-foreground hover:text-foreground hover:bg-[rgba(26,30,42,0.6)] cursor-pointer"
          >
            <span className="size-5 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold border bg-primary border-primary text-white">
              <Check className="size-3" strokeWidth={3} />
            </span>
            <span className="truncate">{entryStep?.label ?? 'Your Entry'}</span>
          </button>

          {/* Games starting at #2 */}
          {games!.map((game, i) => {
            const isActive = currentStep === 'games' && game.id === activeGameId

            return (
              <button
                key={game.id}
                onClick={() => onGameClick?.(game.id)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left transition-colors w-full ${
                  isActive
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-[rgba(26,30,42,0.6)]'
                }`}
              >
                <span
                  className={`size-5 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold border overflow-hidden ${
                    game.picked
                      ? 'bg-white/5 border-primary'
                      : isActive
                        ? 'border-primary/60 text-primary bg-primary/10'
                        : 'border-border/40 text-muted-foreground/40'
                  }`}
                >
                  {game.picked ? (
                    game.pickedLogo ? (
                      <img
                        src={game.pickedLogo}
                        alt=""
                        className="size-4 object-contain"
                        draggable={false}
                      />
                    ) : (
                      <Check className="size-3" strokeWidth={3} />
                    )
                  ) : (
                    i + 2
                  )}
                </span>
                <span className="truncate">{game.label}</span>
              </button>
            )
          })}

          {/* Final item: Review & Submit */}
          {showReview && (
            <button
              onClick={onReviewClick}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left transition-colors w-full ${
                currentStep === 'review'
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-[rgba(26,30,42,0.6)]'
              }`}
            >
              <span
                className={`size-5 rounded-full flex items-center justify-center shrink-0 border ${
                  currentStep === 'review'
                    ? 'border-primary/60 text-primary bg-primary/10'
                    : 'border-border/40 text-muted-foreground/40'
                }`}
              >
                <Flag className="size-3" strokeWidth={2.5} />
              </span>
              <span className="truncate">Review &amp; Submit</span>
            </button>
          )}
        </>
      )}
    </nav>
  )
}
