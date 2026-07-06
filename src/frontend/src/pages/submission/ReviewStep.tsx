import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, AlertCircle, Check, Clock } from 'lucide-react'
import { useToast } from '@/components/toast/ToastContext'
import { ApiError } from '@/lib/apiError'
import {
  usePoolGames,
  useSubmissionPicks,
  useMySubmissions,
  useSubmitEntry,
  isSubmitted,
  type PoolGame,
  type TeamMeta,
} from '@/services/useSubmission'

interface Props {
  poolId: number
  submissionId: number
  entryName: string
}

function teamLogo(game: PoolGame, winner: string): string | null {
  const meta: TeamMeta | null =
    winner === game.away_team ? game.away_team_meta : game.home_team_meta
  return meta?.logos?.[0] ?? null
}

function gameMatchup(game: PoolGame): string {
  return game.neutral_site
    ? `${game.away_team} vs. ${game.home_team}`
    : `${game.away_team} at ${game.home_team}`
}

function formatDate(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function ReviewStep({ poolId, submissionId, entryName }: Props) {
  const navigate = useNavigate()
  const { data: games = [] } = usePoolGames(poolId)
  const { data: picks = [] } = useSubmissionPicks(submissionId)
  const { data: mySubmissions = [] } = useMySubmissions(poolId)
  const submit = useSubmitEntry(submissionId)
  const { toast } = useToast()
  const [justSubmitted, setJustSubmitted] = useState(false)

  const submission = mySubmissions.find((s) => s.id === submissionId)
  const submitted = isSubmitted(submission) || submit.isSuccess

  const pickByGame = new Map(picks.map((p) => [p.pool_game_id, p]))
  const missingCount = games.filter((g) => !pickByGame.has(g.id)).length
  const allPicked = games.length > 0 && missingCount === 0

  async function handleSubmit() {
    try {
      await submit.mutateAsync()
      const wasUpdate = submitted
      setJustSubmitted(true)
      toast({
        variant: 'success',
        title: wasUpdate ? 'Entry updated' : 'Entry submitted',
        description: wasUpdate ? 'Your picks have been updated.' : 'Your picks are in. Good luck!',
      })
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 403) {
          toast({
            variant: 'error',
            title: 'Submissions are closed',
            description: 'This pool is no longer accepting entries.',
          })
        } else if (err.status === 400) {
          toast({
            variant: 'warning',
            title: 'Past the deadline',
            description: 'The submission deadline has passed.',
          })
        } else {
          toast({
            variant: 'error',
            title: 'Something went wrong',
            description: 'Please try again.',
          })
        }
      } else {
        toast({
          variant: 'error',
          title: 'Something went wrong',
          description: 'Please try again.',
        })
      }
    }
  }

  const buttonLabel = (() => {
    if (submit.isPending) return <Loader2 className="size-4 animate-spin" />
    if (justSubmitted) {
      return (
        <span className="flex items-center gap-1.5">
          <Check className="size-4" />
          Submitted
        </span>
      )
    }
    return submitted ? 'Update Entry' : 'Submit Entry'
  })()

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="space-y-1 shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-foreground">Review &amp; Submit</h2>
          {submitted && (
            <span className="flex items-center gap-1 text-xs text-success font-medium bg-success/10 px-2 py-0.5 rounded-full">
              <Clock className="size-3" />
              Submitted {formatDate(submission?.submitted_at ?? null)}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Confirm your picks{entryName ? ` for ${entryName}` : ''}. You can update your entry as
          long as the pool is open.
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1">
        {games.map((game) => {
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
                      <img
                        src={logo}
                        alt=""
                        className="size-5 object-contain shrink-0"
                        draggable={false}
                      />
                    ) : null}
                    <span className="text-sm font-medium text-foreground truncate">
                      {pick.picked_winner}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      by {pick.picked_margin}
                    </span>
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
            {missingCount} game{missingCount === 1 ? '' : 's'} still need a pick before you can
            submit.
          </p>
        )}
        {submit.isError && !justSubmitted && (
          <p className="text-xs text-destructive text-center">
            Something went wrong. Please try again.
          </p>
        )}
        <button
          onClick={handleSubmit}
          disabled={!allPicked || submit.isPending}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary/15 text-primary text-sm font-medium hover:bg-primary/25 transition-colors disabled:opacity-40"
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  )
}
