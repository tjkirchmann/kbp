import { useEffect, useMemo, useState, forwardRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Loader2, Star, Flag, Calendar, Users, Building2, Trash2 } from 'lucide-react'
import { localModel } from '@virtuoso.dev/data-table'
import {
  useAdminPools,
  usePoolDetail,
  usePatchPool,
  useDeletePool,
  type CfbdGame,
  type PoolGameDetail,
} from '@/services/useAdminPools'
import { DataTable, DataTableColumn, DataTableColumnHeader, DataTableCell } from '@/components/ui/data-table'
import Modal from '@/components/ui/Modal'

const ROW_HEIGHT = 60

function gameDetailToCfbd(g: PoolGameDetail): CfbdGame {
  return {
    id: g.cfbd_game_id,
    home_team: g.home_team,
    away_team: g.away_team,
    start_date: g.start_date,
    start_time_tbd: g.start_time_tbd,
    week: g.week,
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

  const pool = pools.find((p) => String(p.id) === poolId)
  const live = detail ?? pool

  const games = useMemo(() => detail?.games.map(gameDetailToCfbd) ?? [], [detail?.games])

  const [model] = useState(() => localModel<CfbdGame>({ data: [] }))
  useEffect(() => {
    model.setData?.(games)
  }, [model, games])

  if (!live) {
    return <p className="text-sm text-muted-foreground py-8">Pool not found.</p>
  }

  async function handleDelete() {
    navigate('/admin/pools')
    deletePool.mutate(live!.id)
  }

  // ── Stat computation ──────────────────────────────────────────
  const stats = useMemo(() => {
    const teams = new Set<string>()
    const conferences = new Set<string>()
    let completed = 0
    for (const g of games) {
      if (g.completed) completed++
      teams.add(g.home_team)
      teams.add(g.away_team)
      if (g.home_conference) conferences.add(g.home_conference)
      if (g.away_conference) conferences.add(g.away_conference)
    }
    return {
      total: games.length,
      completed,
      upcoming: games.length - completed,
      teams: teams.size,
      conferences: conferences.size,
    }
  }, [games])

  const StatLabel = ({
    icon: Icon,
    value,
    label,
    variant = 'default',
  }: {
    icon: React.ComponentType<{ className?: string }>
    value: number
    label: string
    variant?: 'default' | 'success' | 'amber'
  }) => {
    const variants = {
      default: 'bg-white/[0.04] text-foreground',
      success: 'bg-emerald-500/[0.08] text-emerald-400',
      amber: 'bg-amber-500/[0.08] text-amber-400',
    }
    return (
      <div className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl ${variants[variant]}`}>
        <Icon className="size-4 opacity-60" />
        <span className="text-lg font-semibold tabular-nums leading-none">{value}</span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4 h-full overflow-hidden">
      {/* ── Header + Stats Card ────────────────────────────────── */}
      <div className="glass-panel rounded-2xl p-6 shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold text-foreground truncate">{live.name}</h2>
              <span className="shrink-0 px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/15 text-primary border border-primary/20">
                {live.season_year}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              Created{' '}
              {new Date(live.created_at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
          </div>

          {/* Pool toggles */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() =>
                patchPool.mutate({
                  poolId: live.id,
                  patch: { is_featured: !live.is_featured },
                })
              }
              disabled={patchPool.isPending}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors disabled:opacity-50 ${
                live.is_featured
                  ? 'bg-primary/15 text-primary border-primary/30 hover:bg-primary/25'
                  : 'bg-white/[0.04] text-muted-foreground border-border/40 hover:text-foreground hover:border-border'
              }`}
            >
              <Star className={`size-3.5 ${live.is_featured ? 'fill-primary/40' : ''}`} />
              {live.is_featured ? 'Featured' : 'Feature'}
            </button>
            <button
              type="button"
              onClick={() =>
                patchPool.mutate({
                  poolId: live.id,
                  patch: { submissions_open: !live.submissions_open },
                })
              }
              disabled={patchPool.isPending}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors disabled:opacity-50 ${
                live.submissions_open
                  ? 'bg-emerald-500/[0.12] text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/[0.20]'
                  : 'bg-white/[0.04] text-muted-foreground border-border/40 hover:text-foreground hover:border-border'
              }`}
            >
              {live.submissions_open ? 'Submissions Open' : 'Submissions Closed'}
            </button>
          </div>
        </div>

        {/* Stat row */}
        <div className="flex items-center gap-3 mt-5 pt-4 border-t border-border/30 overflow-x-auto">
          <StatLabel icon={Calendar} value={stats.total} label="Games" variant="default" />
          <StatLabel icon={Flag} value={stats.completed} label="Completed" variant="success" />
          <StatLabel icon={Calendar} value={stats.upcoming} label="Upcoming" variant="amber" />
          <StatLabel icon={Users} value={stats.teams} label="Teams" variant="default" />
          <StatLabel
            icon={Building2}
            value={stats.conferences}
            label="Conferences"
            variant="default"
          />
        </div>
      </div>

      {/* ── Game List Card ──────────────────────────────────────── */}
      <div className="glass-panel rounded-2xl overflow-hidden flex flex-col flex-1 min-h-0">
        {/* Tab bar */}
        <div className="flex items-center gap-1 border-b border-border/30 px-6">
          <button
            type="button"
            onClick={() => setTab('games')}
            className={`px-3 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === 'games'
                ? 'text-foreground border-primary'
                : 'text-muted-foreground border-transparent hover:text-foreground'
            }`}
          >
            Games ({live.game_count})
          </button>
          <button
            type="button"
            onClick={() => setTab('submissions')}
            className={`px-3 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === 'submissions'
                ? 'text-foreground border-primary'
                : 'text-muted-foreground border-transparent hover:text-foreground'
            }`}
          >
            Submissions
          </button>
        </div>

        {tab === 'games' && games.length === 0 && !isLoading && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-muted-foreground py-12 text-center">No games added to this pool yet.</p>
          </div>
        )}
        {tab === 'games' && isLoading && games.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
        )}
        {tab === 'games' && games.length > 0 && (
          <div className="flex-1 min-h-0 relative">
          <DataTable
            className="bg-transparent absolute inset-0"
            model={model}
            computeRowKey={({ data }) => data.id}
            components={{
              Row: forwardRef<any, any>(({ style, ...props }: any, ref) => (
                <div ref={ref}
                  {...props}
                  className="flex items-center border-b border-border/[0.15] last:border-b-0 hover:bg-white/[0.03] transition-colors"
                  style={{ ...style, height: ROW_HEIGHT }}
                />
              )) as any,
            }}
          >
            <DataTableColumn id="status">
              <DataTableColumnHeader className="w-8 justify-center" />
              <DataTableCell className="justify-center">
                {({ row }) => {
                  const game = row.data as CfbdGame
                  const status = gameStatus(game)
                  return <div className={STATUS_DOT[status]} title={STATUS_LABEL[status]} />
                }}
              </DataTableCell>
            </DataTableColumn>

            <DataTableColumn field="home_team" grow={1}>
              <DataTableColumnHeader className="px-5">Matchup</DataTableColumnHeader>
              <DataTableCell className="px-5">
                {({ row }) => <GameRow game={row.data as CfbdGame} />}
              </DataTableCell>
            </DataTableColumn>
          </DataTable>
          </div>
        )}

        {tab === 'submissions' && (
          <div className="flex flex-col items-center justify-center py-20 gap-2 text-muted-foreground">
            <p className="text-sm">Submissions not yet implemented.</p>
            <p className="text-xs opacity-60">Come back soon.</p>
          </div>
        )}
      </div>

      {/* ── Subtle danger zone ──────────────────────────────────── */}
      <div className="flex justify-end shrink-0">
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/50 hover:text-destructive transition-colors"
        >
          <Trash2 className="size-3" />
          Delete pool
        </button>
      </div>

      {/* ── Delete confirmation modal ────────────────────────────── */}
      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this pool?"
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="px-4 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deletePool.isPending}
              className="ml-auto flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive/15 text-destructive text-sm font-medium hover:bg-destructive/25 transition-colors disabled:opacity-40"
            >
              {deletePool.isPending ? <Loader2 className="size-4 animate-spin" /> : 'Delete'}
            </button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground leading-relaxed">
          <span className="text-foreground font-medium">{live.name}</span> and all its games will
          be permanently deleted. This cannot be undone.
        </p>
      </Modal>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════

const CLASSIFICATION_COLORS: Record<string, string> = {
  FBS: 'tag-green',
  FCS: 'tag-amber',
  DII: 'tag-teal',
  DIII: 'tag-purple',
}

function formatGameTime(startDate: string, timeTbd: boolean): string {
  if (!startDate) return ''
  const date = new Date(startDate)
  const datePart = date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
  if (timeTbd) return `${datePart} · Time TBD`
  return `${datePart} at ${date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })}`
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

const STATUS_LABEL: Record<string, string> = {
  final: 'Final',
  live: 'In Progress',
  upcoming: 'Upcoming',
}

// ══════════════════════════════════════════════════════════════════
// Game row — fixture-list style
// ══════════════════════════════════════════════════════════════════

function GameRow({ game }: { game: CfbdGame }) {
  const dateTime = formatGameTime(game.start_date, game.start_time_tbd)

  const homeCls = game.home_classification?.toUpperCase() ?? null
  const awayCls = game.away_classification?.toUpperCase() ?? null
  const clsTags: string[] =
    homeCls === awayCls
      ? homeCls
        ? [homeCls]
        : []
      : ([awayCls, homeCls].filter(Boolean) as string[])

  const sameConference =
    game.home_conference && game.away_conference && game.home_conference === game.away_conference
  const conferencePillLabel = sameConference ? game.home_conference! : 'Out of Conference'

  const hasScore = game.completed && game.home_score != null && game.away_score != null

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-3">
        {/* Home team */}
        <span
          className={`text-sm truncate min-w-0 max-w-[140px] ${
            hasScore
              ? game.home_score! > game.away_score!
                ? 'font-semibold text-foreground'
                : 'text-foreground/70'
              : 'font-medium text-foreground'
          }`}
        >
          {game.home_team}
        </span>

        {/* Score / vs */}
        {hasScore ? (
          <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground tracking-wide">
            {game.home_score} – {game.away_score}
          </span>
        ) : (
          <span className="shrink-0 text-xs text-muted-foreground/60 font-medium tracking-widest uppercase">
            vs
          </span>
        )}

        {/* Away team */}
        <span
          className={`text-sm truncate min-w-0 max-w-[140px] ${
            hasScore
              ? game.away_score! > game.home_score!
                ? 'font-semibold text-foreground'
                : 'text-foreground/70'
              : 'font-medium text-foreground'
          }`}
        >
          {game.away_team}
        </span>

        {/* Classification tags */}
        <div className="flex items-center gap-1 shrink-0 ml-auto">
          {clsTags.map((tag) => (
            <span
              key={tag}
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                CLASSIFICATION_COLORS[tag] ?? 'tag-blue'
              }`}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Metadata row */}
      <div className="flex items-center gap-2 mt-0.5">
        {dateTime && <span className="text-[11px] text-muted-foreground/70">{dateTime}</span>}
        {game.bowl_name && (
          <>
            <span className="text-[11px] text-muted-foreground/40">·</span>
            <span className="text-[11px] text-muted-foreground/70">{game.bowl_name}</span>
          </>
        )}
        <span className="text-[11px] text-muted-foreground/40">·</span>
        <span
          className={`text-[10px] px-1.5 py-px rounded-full font-medium ${
            sameConference ? 'tag-blue' : 'bg-white/[0.04] text-muted-foreground/60'
          }`}
        >
          {conferencePillLabel}
        </span>
      </div>
    </div>
  )
}
