import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Loader2, ChevronLeft, Lock } from 'lucide-react'
import { useOpenPools, usePoolGames, useSubmissionPicks } from '@/services/useSubmission'
import { usePageTitle } from '@/lib/usePageTitle'
import StepRail, { type Step } from './StepRail'
import PasswordStep from './PasswordStep'
import EntryMetaStep from './EntryMetaStep'
import GamesStep from './GamesStep'
import ReviewStep from './ReviewStep'

type StepId = 'password' | 'entry' | 'games' | 'review'

export default function SubmissionWorkspace() {
  const { poolId: poolIdStr } = useParams()
  const poolId = poolIdStr ? Number(poolIdStr) : null
  const navigate = useNavigate()

  const { data: pools = [], isLoading } = useOpenPools()
  const pool = pools.find((p) => p.id === poolId)
  usePageTitle(pool ? pool.name : 'Enter a Pool')

  const [passwordVerified, setPasswordVerified] = useState(false)
  const [poolPassword, setPoolPassword] = useState<string | null>(null)
  const [currentStep, setCurrentStep] = useState<StepId | null>(null)
  const [completedSteps, setCompletedSteps] = useState<Set<StepId>>(new Set())
  const [submissionId, setSubmissionId] = useState<number | null>(null)
  const [entryName, setEntryName] = useState<string | null>(null)
  const [currentGameIndex, setCurrentGameIndex] = useState(0)

  const { data: poolGames = [] } = usePoolGames(poolId)
  const { data: existingPicks = [] } = useSubmissionPicks(submissionId)

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
        <Loader2 className="size-4 animate-spin" />
        Loading…
      </div>
    )
  }

  if (!pool) {
    return (
      <div className="glass-panel rounded-2xl p-10 flex flex-col items-center gap-2 text-center">
        <p className="text-sm font-medium text-foreground">
          Pool not found or submissions are closed.
        </p>
      </div>
    )
  }

  const needsPassword = pool.requires_password && !passwordVerified
  const activeStep: StepId = currentStep ?? (needsPassword ? 'password' : 'entry')

  const steps: Step[] = [
    ...(pool.requires_password ? [{ id: 'password' as const, label: 'Enter Password' }] : []),
    { id: 'entry' as const, label: entryName ?? 'Your Entry' },
    { id: 'games' as const, label: 'Pick Games' },
  ]

  const pickByGameId = new Map(existingPicks.map((p) => [p.pool_game_id, p]))

  const gameItems = poolGames.map((g, i) => {
    const pick = pickByGameId.get(g.id)
    const pickedLogo = pick
      ? ((pick.picked_winner === g.away_team ? g.away_team_meta : g.home_team_meta)?.logos?.[0] ??
        null)
      : null
    return {
      id: g.id,
      index: i,
      label: g.bowl_name
        ? g.bowl_name
        : g.neutral_site
          ? `${g.away_team} vs ${g.home_team}`
          : `${g.away_team} at ${g.home_team}`,
      picked: pick !== undefined,
      pickedLogo,
    }
  })

  function advance(from: StepId, next: StepId) {
    setCompletedSteps((prev) => new Set([...prev, from]))
    setCurrentStep(next)
  }

  function handlePasswordComplete(password: string) {
    setPoolPassword(password)
    setPasswordVerified(true)
    advance('password', 'entry')
  }

  function handleEntryComplete(sid: number, displayName: string) {
    setSubmissionId(sid)
    setEntryName(displayName)
    advance('entry', 'games')
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-3 text-sm">
          <button
            onClick={() => navigate('/submission')}
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <ChevronLeft className="size-4" />
            All Pools
          </button>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {pool.requires_password && (
              <Lock className="size-5 text-muted-foreground shrink-0 inline mr-1.5" />
            )}
            {pool.name}
          </h1>
          <span className="text-lg text-muted-foreground">{pool.season_year}</span>
          {entryName && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-muted-foreground">
                Entry for <span className="font-medium text-foreground">{entryName}</span>
              </span>
            </>
          )}
        </div>
      </div>
      <div className="flex gap-6">
        <StepRail
          steps={steps}
          currentStep={activeStep}
          completedSteps={completedSteps as Set<string>}
          onStepClick={(id) => setCurrentStep(id as StepId)}
          games={activeStep === 'games' || activeStep === 'review' ? gameItems : undefined}
          activeGameId={activeStep === 'games' ? (poolGames[currentGameIndex]?.id ?? null) : null}
          onGameClick={(id) => {
            const idx = poolGames.findIndex((g) => g.id === id)
            if (idx >= 0) {
              setCurrentGameIndex(idx)
              setCurrentStep('games')
            }
          }}
          showReview={submissionId !== null}
          onReviewClick={() => setCurrentStep('review')}
        />
        <div
          className="flex-1 glass-panel rounded-2xl p-6 overflow-hidden"
          style={{ height: 'calc(100vh - 16rem)' }}
        >
          {activeStep === 'password' && (
            <PasswordStep poolId={pool.id} onComplete={handlePasswordComplete} />
          )}
          {activeStep === 'entry' && (
            <EntryMetaStep
              poolId={pool.id}
              poolPassword={poolPassword}
              onComplete={handleEntryComplete}
            />
          )}
          {activeStep === 'games' && submissionId && (
            <GamesStep
              poolId={pool.id}
              submissionId={submissionId}
              currentIndex={currentGameIndex}
              onIndexChange={setCurrentGameIndex}
              onDone={() => setCurrentStep('review')}
            />
          )}
          {activeStep === 'review' && submissionId && (
            <ReviewStep poolId={pool.id} submissionId={submissionId} entryName={entryName ?? ''} />
          )}
        </div>
      </div>
    </div>
  )
}
