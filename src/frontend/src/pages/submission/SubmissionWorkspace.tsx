import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Loader2, ChevronLeft, Lock } from 'lucide-react'
import { useOpenPools, usePoolGames, useSubmissionPicks } from '@/services/useSubmission'
import StepRail, { type Step } from './StepRail'
import PasswordStep from './PasswordStep'
import EntryMetaStep from './EntryMetaStep'
import GamesStep from './GamesStep'

type StepId = 'password' | 'entry' | 'games'

export default function SubmissionWorkspace() {
  const { poolId: poolIdStr } = useParams()
  const poolId = poolIdStr ? Number(poolIdStr) : null
  const navigate = useNavigate()

  const { data: pools = [], isLoading } = useOpenPools()
  const pool = pools.find(p => p.id === poolId)

  const [passwordVerified, setPasswordVerified] = useState(false)
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
        <p className="text-sm font-medium text-foreground">Pool not found or submissions are closed.</p>
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

  const pickedGameIds = new Set(existingPicks.map(p => p.pool_game_id))

  const gameItems = poolGames.map((g, i) => ({
    id: g.id,
    index: i,
    label: g.bowl_name
      ? g.bowl_name
      : g.neutral_site
      ? `${g.away_team} vs ${g.home_team}`
      : `${g.away_team} at ${g.home_team}`,
    picked: pickedGameIds.has(g.id),
  }))

  function advance(from: StepId, next: StepId) {
    setCompletedSteps(prev => new Set([...prev, from]))
    setCurrentStep(next)
  }

  function handlePasswordComplete() {
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
        <button
          onClick={() => navigate('/submission')}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
        >
          <ChevronLeft className="size-4" />
          All Pools
        </button>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
          {pool.requires_password && <Lock className="size-5 text-muted-foreground shrink-0" />}
          {pool.name}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">{pool.season_year} season</p>
      </div>
      <div className="flex gap-6">
        <StepRail
          steps={steps}
          currentStep={activeStep}
          completedSteps={completedSteps as Set<string>}
          onStepClick={id => setCurrentStep(id as StepId)}
          games={activeStep === 'games' ? gameItems : undefined}
          activeGameId={activeStep === 'games' ? (poolGames[currentGameIndex]?.id ?? null) : null}
          onGameClick={id => {
            const idx = poolGames.findIndex(g => g.id === id)
            if (idx >= 0) setCurrentGameIndex(idx)
          }}
        />
        <div
          className="flex-1 glass-panel rounded-2xl p-6 overflow-hidden"
          style={{ height: 'calc(100vh - 16rem)' }}
        >
          {activeStep === 'password' && (
            <PasswordStep poolId={pool.id} onComplete={handlePasswordComplete} />
          )}
          {activeStep === 'entry' && (
            <EntryMetaStep poolId={pool.id} onComplete={handleEntryComplete} />
          )}
          {activeStep === 'games' && submissionId && (
            <GamesStep
              poolId={pool.id}
              submissionId={submissionId}
              currentIndex={currentGameIndex}
              onIndexChange={setCurrentGameIndex}
            />
          )}
        </div>
      </div>
    </div>
  )
}
