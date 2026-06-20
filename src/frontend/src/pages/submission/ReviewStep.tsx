import { useNavigate } from 'react-router-dom'
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import {
  usePoolGames,
  useSubmissionPicks,
  useMySubmissions,
  useSubmitEntry,
  type PoolGame,
  type TeamMeta,
} from '@/services/useSubmission'

interface Props {
  poolId: number
  submissionId: number
  entryName: string
}

function teamLogo(game: PoolGame, winner: string): string | null {
  const meta: TeamMeta | null = winner === game.away_team ? game.away_team_meta : game.home_team_meta
  return meta?.logos?.[0] ?? null
}

function gameMatchup(game: PoolGame): string {
  return game.neutral_site
    ? `${game.away_team} vs. ${game.home_team}`
    : `${game.away_team} at ${game.home_team}`
}

export default function ReviewStep({ poolId, submissionId, entryName }: Props) {
  const navigate = useNavigate()
  const { data: games = [] } = usePoolGames(poolId)
  const { data: picks = [] } = useSubmissionPicks(submissionId)
  const { data: mySubmissions = [] } = useMySubmissions(poolId)
  const submit = useSubmitEntry(submissionId)

  const submission = mySubmissions.find(s => s.id === submissionId)
  const isSubmitted = submission?.is_locked || submit.isSuccess

  const pickByGame = new Map(picks.map(p => [p.pool_game_id, p]))
  const missingCount = games.filter(g => !pickByGame.has(g.id)).length
  const allPicked = games.length > 0 && missingCount === 0

  if (isSubmitted) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center max-w-sm mx-auto">
        <CheckCircle2 className="size-12 text-success" />
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">Entry submitted</h2>
          <p className="text-sm text-muted-foreground">
            {entryName ? `${entryName}'s picks are locked in.` : 'Your picks are locked in.'} Good luck!
          </p>
        </div>
        <button
          onClick={() => navigate('/submission')}
          className="px-4 py-2.5 rounded-xl bg-primary/15 text-primary text-sm font-medium hover:bg-primary/25 transition-colors"
        >
          Back to Pools
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="space-y-1 shrink-0">
        <h2 className="text-base font-semibold text-foreground">Review &amp; Submit</h2>
        <p className="text-sm text-muted-foreground">
          Confirm your picks{entryName ? ` for ${entryName}` : ''}. Submitting locks the entry.
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1">
        {games.map(game => {
          const pick = pickByGame.get(game.id)
          const logo = pick ? teamLogo(game, pick.picked_winner) : null
          return (
            <div
              key={game.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border/40 bg-[rgba(13,15,19,0.4)]"
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground truncate">{gameMatchup(game)}</p>
                {pick ? (
                  <div className="flex items-center gap-2 mt-0.5">
                    {logo ? (
                      <img src={logo} alt="" className="size-5 object-contain shrink-0" draggable={false} />
                    ) : null}
                    <span className="text-sm font-medium text-foreground truncate">{pick.picked_winner}</span>
                    <span className="text-xs text-muted-foreground shrink-0">by {pick.picked_margin}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 mt-0.5 text-amber-400">
                    <AlertCircle className="size-3.5 shrink-0" />
                    <span className="text-sm font-medium">No pick yet</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="shrink-0 space-y-2">
        {!allPicked && (
          <p className="text-xs text-amber-400 text-center">
            {missingCount} game{missingCount === 1 ? '' : 's'} still need a pick before you can submit.
          </p>
        )}
        {submit.isError && (
          <p className="text-xs text-destructive text-center">Something went wrong. Please try again.</p>
        )}
        <button
          onClick={() => submit.mutate()}
          disabled={!allPicked || submit.isPending}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary/15 text-primary text-sm font-medium hover:bg-primary/25 transition-colors disabled:opacity-40"
        >
          {submit.isPending ? <Loader2 className="size-4 animate-spin" /> : 'Submit Entry'}
        </button>
      </div>
    </div>
  )
}
