import { useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Loader2 } from 'lucide-react'
import { useAdminPools, usePoolDetail, usePatchPool, useDeletePool, type CfbdGame, type PoolGameDetail } from '@/services/useAdminPools'

const ROW_HEIGHT = 60

function gameDetailToCfbd(g: PoolGameDetail): CfbdGame {
  return {
    id: g.cfbd_game_id,
    home_team: g.home_team,
    away_team: g.away_team,
    start_date: g.start_date,
    start_time_tbd: g.start_time_tbd,
    bowl_name: g.bowl_name,
    season_type: g.season_type,
    home_classification: g.home_classification,
    away_classification: g.away_classification,
    home_conference: g.home_conference,
    away_conference: g.away_conference,
    conference_game: g.conference_game,
    neutral_site: g.neutral_site,
    completed: g.completed,
    home_score: g.home_score,
    away_score: g.away_score,
  }
}

export default function PoolDetail() {
  const { poolId } = useParams()
  const navigate = useNavigate()
  const { data: pools = [] } = useAdminPools()
  const { data: detail, isLoading } = usePoolDetail(poolId ? Number(poolId) : null)
  const patchPool = usePatchPool()
  const deletePool = useDeletePool()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [tab, setTab] = useState<'games' | 'submissions'>('games')

  const pool = pools.find(p => String(p.id) === poolId)
  const live = detail ?? pool

  if (!live) {
    return <p className="text-sm text-muted-foreground py-8">Pool not found.</p>
  }

  async function handleDelete() {
    navigate('/admin/pools')
    deletePool.mutate(live!.id)
  }

  const games = detail?.games.map(gameDetailToCfbd) ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-foreground">{live.name}</h2>
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
              {live.season_year}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Created {new Date(live.created_at).toLocaleDateString()} · {live.game_count} game{live.game_count !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => patchPool.mutate({ poolId: live.id, patch: { is_featured: !live.is_featured } })}
            disabled={patchPool.isPending}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors disabled:opacity-50 ${
              live.is_featured
                ? 'bg-primary/15 text-primary border-primary/30 hover:bg-primary/25'
                : 'bg-muted/40 text-muted-foreground border-border/40 hover:text-foreground hover:border-border'
            }`}
          >
            {live.is_featured ? 'Featured' : 'Not Featured'}
          </button>
          <button
            onClick={() => patchPool.mutate({ poolId: live.id, patch: { submissions_open: !live.submissions_open } })}
            disabled={patchPool.isPending}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors disabled:opacity-50 ${
              live.submissions_open
                ? 'bg-success/15 text-success border-success/30 hover:bg-success/25'
                : 'bg-muted/40 text-muted-foreground border-border/40 hover:text-foreground hover:border-border'
            }`}
          >
            {live.submissions_open ? 'Submissions Open' : 'Submissions Closed'}
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-border">
        <button
          onClick={() => setTab('games')}
          className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${tab === 'games' ? 'text-foreground border-primary' : 'text-muted-foreground border-transparent hover:text-foreground'}`}
        >
          Games ({live.game_count})
        </button>
        <button
          onClick={() => setTab('submissions')}
          className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${tab === 'submissions' ? 'text-foreground border-primary' : 'text-muted-foreground border-transparent hover:text-foreground'}`}
        >
          Submissions
        </button>
      </div>

      {tab === 'games' && (
        isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="size-4 animate-spin" />
            Loading games…
          </div>
        ) : games.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No games added to this pool yet.</p>
        ) : (
          <VirtualGameList games={games} />
        )
      )}

      {tab === 'submissions' && (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
          <p className="text-sm">Submissions not yet implemented.</p>
          <p className="text-xs opacity-60">Come back soon.</p>
        </div>
      )}

      <div className="border-b border-border/40" />

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Danger Zone</h3>
        <button
          onClick={() => setConfirmDelete(true)}
          className="px-3 py-1.5 rounded-full text-xs font-medium text-destructive border border-destructive/40 hover:bg-destructive/10 transition-colors"
        >
          Delete Pool
        </button>
      </div>

      {confirmDelete && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
          <div className="bg-white/[0.03] border border-border/20 rounded-2xl p-7 max-w-sm w-full mx-4 space-y-5">
            <div className="space-y-1.5">
              <h2 className="text-base font-semibold text-foreground">Delete this pool?</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                <span className="text-foreground font-medium">{live.name}</span> and all its games will be permanently deleted. This cannot be undone.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 px-4 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deletePool.isPending}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-destructive/15 text-destructive text-sm font-medium hover:bg-destructive/25 transition-colors disabled:opacity-40"
              >
                {deletePool.isPending ? <Loader2 className="size-4 animate-spin" /> : 'Delete'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

function VirtualGameList({ games }: { games: CfbdGame[] }) {
  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: games.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  })
  return (
    <div
      ref={parentRef}
      className="overflow-y-auto rounded-xl bg-white/[0.03] border border-border/20"
      style={{ height: `${Math.min(games.length, 8) * ROW_HEIGHT}px`, scrollbarGutter: 'stable' }}
    >
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map(vRow => {
          const game = games[vRow.index]
          return (
            <div
              key={game.id}
              style={{ position: 'absolute', top: vRow.start, left: 0, right: 0, height: ROW_HEIGHT }}
            >
              <GameRow game={game} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

const CLASSIFICATION_COLORS: Record<string, string> = {
  FBS: 'tag-green', FCS: 'tag-amber', DII: 'tag-teal', DIII: 'tag-purple',
}

function formatGameTime(startDate: string, timeTbd: boolean): string {
  if (!startDate) return ''
  const date = new Date(startDate)
  const datePart = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  if (timeTbd) return `${datePart} · Time TBD`
  return `${datePart} at ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
}

function gameStatus(game: CfbdGame): 'final' | 'live' | 'upcoming' {
  if (game.completed) return 'final'
  const now = Date.now()
  const start = new Date(game.start_date).getTime()
  return start <= now ? 'live' : 'upcoming'
}

const STATUS_DOT: Record<string, string> = {
  final: 'size-2 rounded-full bg-emerald-500 shrink-0',
  live: 'size-2 rounded-full bg-amber-400 shrink-0 animate-pulse',
  upcoming: 'size-2 rounded-full bg-border shrink-0',
}

function GameRow({ game }: { game: CfbdGame }) {
  const matchup = game.neutral_site
    ? `${game.away_team} vs ${game.home_team}`
    : `${game.away_team} at ${game.home_team}`
  const title = game.bowl_name ? `${game.bowl_name}, ${matchup}` : matchup
  const dateTime = formatGameTime(game.start_date, game.start_time_tbd)
  const homeCls = game.home_classification?.toUpperCase() ?? null
  const awayCls = game.away_classification?.toUpperCase() ?? null
  const clsTags: string[] = homeCls === awayCls
    ? (homeCls ? [homeCls] : [])
    : [awayCls, homeCls].filter(Boolean) as string[]
  const sameConference = game.home_conference && game.away_conference && game.home_conference === game.away_conference
  const conferencePillLabel = sameConference ? game.home_conference! : 'Out of Conference'
  const status = gameStatus(game)

  return (
    <div className="flex items-center gap-3 px-4 py-3 h-full">
      <div className={STATUS_DOT[status]} title={status === 'final' ? 'Final' : status === 'live' ? 'In Progress' : 'Upcoming'} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-foreground truncate">{title}</p>
          <div className="flex items-center gap-1 shrink-0">
            {clsTags.map(tag => (
              <span key={tag} className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${CLASSIFICATION_COLORS[tag] ?? 'tag-blue'}`}>
                {tag}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {dateTime && <span className="text-xs text-muted-foreground">{dateTime}</span>}
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${sameConference ? 'tag-blue' : 'bg-muted text-muted-foreground'}`}>
            {conferencePillLabel}
          </span>
        </div>
      </div>
    </div>
  )
}
