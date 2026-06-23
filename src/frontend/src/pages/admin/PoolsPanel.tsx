import { useState, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Plus, Trophy, Loader2, Trash2 } from 'lucide-react'
import {
  useAdminPools,
  useCreatePool,
  useCfbdGames,
  useAddPoolGames,
  useDeletePool,
  usePoolDetail,
  usePatchPool,
  type AdminPool,
  type CfbdGame,
} from '@/services/useAdminPools'

type View = 'list' | 'create-step1' | 'create-step2'

interface PoolsPanelProps {
  onViewChange?: (isCreating: boolean) => void
  selectedPool?: AdminPool | null
  onSelectPool?: (pool: AdminPool | null) => void
}

export default function PoolsPanel({
  onViewChange,
  selectedPool = null,
  onSelectPool,
}: PoolsPanelProps) {
  const [view, setView] = useState<View>('list')
  const [name, setName] = useState('')
  const [seasonYear, setSeasonYear] = useState(new Date().getFullYear())
  const [newPoolId, setNewPoolId] = useState<number | null>(null)
  const [newPoolYear, setNewPoolYear] = useState<number | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [step2Tab, setStep2Tab] = useState<'finder' | 'selected'>('finder')
  const [finderSeasonType, setFinderSeasonType] = useState('postseason')
  const [finderClass, setFinderClass] = useState('all')
  const [selectedSeasonType, setSelectedSeasonType] = useState('all')
  const [selectedClass, setSelectedClass] = useState('all')

  const [confirmDelete, setConfirmDelete] = useState<AdminPool | null>(null)

  const { data: pools = [], isLoading: poolsLoading } = useAdminPools()
  const createPool = useCreatePool()
  const { data: cfbdGames = [], isLoading: gamesLoading } = useCfbdGames(newPoolYear)
  const addGames = useAddPoolGames()
  const deletePool = useDeletePool()

  const seasonTypeOptions = useMemo(() => {
    const vals = [...new Set(cfbdGames.map((g) => g.season_type).filter(Boolean))]
    return vals.sort()
  }, [cfbdGames])

  const classOptions = useMemo(() => {
    const vals = new Set<string>()
    cfbdGames.forEach((g) => {
      if (g.home_classification) vals.add(g.home_classification)
      if (g.away_classification) vals.add(g.away_classification)
    })
    return [...vals].sort()
  }, [cfbdGames])

  const finderGames = useMemo(() => {
    return cfbdGames.filter((g) => {
      if (finderSeasonType !== 'all' && g.season_type !== finderSeasonType) return false
      if (
        finderClass !== 'all' &&
        g.home_classification !== finderClass &&
        g.away_classification !== finderClass
      )
        return false
      return true
    })
  }, [cfbdGames, finderSeasonType, finderClass])

  const selectedGames = useMemo(() => {
    return cfbdGames.filter((g) => {
      if (!selected.has(g.id)) return false
      if (selectedSeasonType !== 'all' && g.season_type !== selectedSeasonType) return false
      if (
        selectedClass !== 'all' &&
        g.home_classification !== selectedClass &&
        g.away_classification !== selectedClass
      )
        return false
      return true
    })
  }, [cfbdGames, selected, selectedSeasonType, selectedClass])

  function goToList() {
    setView('list')
    setName('')
    setSeasonYear(new Date().getFullYear())
    setNewPoolId(null)
    setNewPoolYear(null)
    setSelected(new Set())
    setStep2Tab('finder')
    setFinderSeasonType('postseason')
    setFinderClass('all')
    setSelectedSeasonType('all')
    setSelectedClass('all')
    onViewChange?.(false)
  }

  async function handleCreatePool() {
    const pool = await createPool.mutateAsync({ name: name.trim(), season_year: seasonYear })
    setNewPoolId(pool.id)
    setNewPoolYear(pool.season_year)
    setView('create-step2')
  }

  async function handleAddGames() {
    if (!newPoolId || selected.size === 0) return
    await addGames.mutateAsync({ poolId: newPoolId, cfbdGameIds: [...selected] })
    goToList()
  }

  function toggleGame(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (view === 'create-step1') {
    return (
      <div className="max-w-md space-y-6">
        <p className="text-sm text-muted-foreground">Step 1 of 2 — Pool details</p>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Pool name <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. 2025 Kirchmann Bowl Pool"
              className="w-full rounded-lg bg-white/[0.03] border border-border/20 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Season year</label>
            <input
              type="number"
              value={seasonYear}
              onChange={(e) => setSeasonYear(Number(e.target.value))}
              className="w-full rounded-lg bg-white/[0.03] border border-border/20 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleCreatePool}
            disabled={!name.trim() || createPool.isPending}
            className="btn-primary px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {createPool.isPending && <Loader2 className="size-4 animate-spin" />}
            Next: Select Games
          </button>
          <button
            onClick={goToList}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  if (view === 'create-step2') {
    const isFinder = step2Tab === 'finder'
    const activeSeasonType = isFinder ? finderSeasonType : selectedSeasonType
    const setActiveSeasonType = isFinder ? setFinderSeasonType : setSelectedSeasonType
    const activeClass = isFinder ? finderClass : selectedClass
    const setActiveClass = isFinder ? setFinderClass : setSelectedClass
    const activeGames = isFinder ? finderGames : selectedGames

    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Step 2 of 2 — Select games from {newPoolYear}
        </p>

        {/* Tab bar */}
        <div className="flex items-center gap-1 border-b border-border">
          <button
            onClick={() => setStep2Tab('finder')}
            className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${isFinder ? 'text-foreground border-primary' : 'text-muted-foreground border-transparent hover:text-foreground'}`}
          >
            Game Finder
          </button>
          <button
            onClick={() => setStep2Tab('selected')}
            className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${!isFinder ? 'text-foreground border-primary' : 'text-muted-foreground border-transparent hover:text-foreground'}`}
          >
            Currently Selected ({selected.size})
          </button>
        </div>

        {/* Filters */}
        {!gamesLoading && cfbdGames.length > 0 && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Season</label>
              <select
                value={activeSeasonType}
                onChange={(e) => setActiveSeasonType(e.target.value)}
                className="rounded-lg bg-white/[0.03] border border-border/20 px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="all">All</option>
                {seasonTypeOptions.map((v) => (
                  <option key={v} value={v}>
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Classification</label>
              <select
                value={activeClass}
                onChange={(e) => setActiveClass(e.target.value)}
                className="rounded-lg bg-white/[0.03] border border-border/20 px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="all">All</option>
                {classOptions.map((v) => (
                  <option key={v} value={v}>
                    {v.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3 ml-auto">
              <span className="text-xs text-muted-foreground">{activeGames.length} shown</span>
              {isFinder ? (
                <button
                  onClick={() => {
                    const allSelected = finderGames.every((g) => selected.has(g.id))
                    setSelected((prev) => {
                      const next = new Set(prev)
                      finderGames.forEach((g) => (allSelected ? next.delete(g.id) : next.add(g.id)))
                      return next
                    })
                  }}
                  className="text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  {finderGames.every((g) => selected.has(g.id)) && finderGames.length > 0
                    ? 'Deselect all'
                    : 'Select all'}
                </button>
              ) : (
                <button
                  onClick={() => {
                    setSelected((prev) => {
                      const next = new Set(prev)
                      selectedGames.forEach((g) => next.delete(g.id))
                      return next
                    })
                  }}
                  className="text-xs text-primary hover:text-primary/80 transition-colors"
                  disabled={selectedGames.length === 0}
                >
                  Deselect all
                </button>
              )}
            </div>
          </div>
        )}

        {gamesLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
            <Loader2 className="size-4 animate-spin" />
            Fetching games from CFBD…
          </div>
        ) : activeGames.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8">
            {isFinder
              ? 'No games match the current filters.'
              : 'No selected games match the current filters.'}
          </p>
        ) : (
          <VirtualGameList games={activeGames} selected={selected} onToggle={toggleGame} />
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleAddGames}
            disabled={selected.size === 0 || addGames.isPending}
            className="btn-primary px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {addGames.isPending && <Loader2 className="size-4 animate-spin" />}
            Add {selected.size > 0 ? `${selected.size} ` : ''}Game{selected.size !== 1 ? 's' : ''}
          </button>
          <button
            onClick={goToList}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  // Detail view
  if (selectedPool) {
    return (
      <PoolDetail
        pool={selectedPool}
        onBack={() => onSelectPool?.(null)}
        onDeleted={() => {
          onSelectPool?.(null)
        }}
      />
    )
  }

  // List view
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {pools.length} pool{pools.length !== 1 ? 's' : ''}
        </p>
        <button
          onClick={() => {
            setView('create-step1')
            onViewChange?.(true)
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/15 text-primary text-sm font-medium hover:bg-primary/25 transition-colors"
        >
          <Plus className="size-4" />
          New Pool
        </button>
      </div>

      {poolsLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
          <Loader2 className="size-4 animate-spin" />
          Loading…
        </div>
      ) : pools.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <Trophy className="size-8 opacity-30" />
          <p className="text-sm">No pools yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {pools.map((pool) => (
            <div
              key={pool.id}
              onClick={() => onSelectPool?.(pool)}
              className="rounded-lg px-4 py-3 hover:bg-white/5 transition-colors flex items-center gap-4 cursor-pointer"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground truncate">{pool.name}</span>
                  {pool.is_featured && (
                    <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-medium bg-primary/15 text-primary">
                      Featured
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{pool.season_year} season</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm text-foreground">
                  {pool.game_count} game{pool.game_count !== 1 ? 's' : ''}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(pool.created_at).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setConfirmDelete(pool)
                }}
                className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {confirmDelete &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
            <div className="bg-white/[0.03] border border-border/20 rounded-2xl p-7 max-w-sm w-full mx-4 space-y-5">
              <div className="space-y-1.5">
                <h2 className="text-base font-semibold text-foreground">Delete this pool?</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  <span className="text-foreground font-medium">{confirmDelete.name}</span> and all
                  its games will be permanently deleted. This cannot be undone.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="flex-1 px-4 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    await deletePool.mutateAsync(confirmDelete.id)
                    setConfirmDelete(null)
                  }}
                  disabled={deletePool.isPending}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-destructive/15 text-destructive text-sm font-medium hover:bg-destructive/25 transition-colors disabled:opacity-40"
                >
                  {deletePool.isPending ? <Loader2 className="size-4 animate-spin" /> : 'Delete'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}

const ROW_HEIGHT = 60

interface VirtualGameListProps {
  games: CfbdGame[]
  selected: Set<number>
  onToggle: (id: number) => void
}

function VirtualGameList({ games, selected, onToggle }: VirtualGameListProps) {
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
      className="overflow-y-auto rounded-lg -mr-6"
      style={{ height: 'calc(100vh - 27rem)', scrollbarGutter: 'stable' }}
    >
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((vRow) => {
          const game = games[vRow.index]
          return (
            <div
              key={game.id}
              style={{
                position: 'absolute',
                transform: `translateY(${vRow.start}px)`,
                left: 0,
                right: 0,
                height: ROW_HEIGHT,
              }}
            >
              <GameRow
                game={game}
                checked={selected.has(game.id)}
                onToggle={() => onToggle(game.id)}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface GameRowProps {
  game: CfbdGame
  checked?: boolean
  onToggle?: () => void
  readOnly?: boolean
}

const CLASSIFICATION_COLORS: Record<string, string> = {
  FBS: 'tag-green',
  FCS: 'tag-amber',
  DII: 'tag-teal',
  DIII: 'tag-purple',
}

function tagColor(value: string): string {
  return CLASSIFICATION_COLORS[value] ?? 'tag-blue'
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
  const timePart = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${datePart} at ${timePart}`
}

function GameRow({ game, checked = false, onToggle, readOnly = false }: GameRowProps) {
  const matchup = game.neutral_site
    ? `${game.away_team} vs ${game.home_team}`
    : `${game.away_team} at ${game.home_team}`
  const title = game.bowl_name ? `${game.bowl_name}, ${matchup}` : matchup
  const dateTime = formatGameTime(game.start_date, game.start_time_tbd)

  // Classification tags — one per team if they differ, one if same
  const homeCls = game.home_classification?.toUpperCase() ?? null
  const awayCls = game.away_classification?.toUpperCase() ?? null
  const clsTags: string[] =
    homeCls === awayCls
      ? homeCls
        ? [homeCls]
        : []
      : ([awayCls, homeCls].filter(Boolean) as string[])

  // Conference pill
  const sameConference =
    game.home_conference && game.away_conference && game.home_conference === game.away_conference
  const conferencePillLabel = sameConference ? game.home_conference! : 'Out of Conference'

  const rowContent = (
    <>
      {!readOnly && (
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="rounded border-border accent-primary size-4 shrink-0"
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-foreground truncate">{title}</p>
          <div className="flex items-center gap-1 shrink-0">
            {clsTags.map((tag) => (
              <span
                key={tag}
                className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${tagColor(tag)}`}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {dateTime && <span className="text-xs text-muted-foreground">{dateTime}</span>}
          <span
            className={`text-xs px-1.5 py-0.5 rounded-full ${sameConference ? 'tag-blue' : 'bg-muted text-muted-foreground'}`}
          >
            {conferencePillLabel}
          </span>
        </div>
      </div>
    </>
  )

  if (readOnly) {
    return <div className="flex items-center gap-3 rounded-lg px-4 py-3">{rowContent}</div>
  }
  return (
    <label className="flex items-center gap-3 rounded-lg px-4 py-3 hover:bg-white/5 transition-colors cursor-pointer">
      {rowContent}
    </label>
  )
}

interface PoolDetailProps {
  pool: AdminPool
  onBack: () => void
  onDeleted: () => void
}

function PoolDetail({ pool, onDeleted }: PoolDetailProps) {
  const { data: detail, isLoading } = usePoolDetail(pool.id)
  const patchPool = usePatchPool()
  const deletePool = useDeletePool()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const live = detail ?? pool

  async function handleDelete() {
    await deletePool.mutateAsync(pool.id)
    onDeleted()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-foreground">{pool.name}</h2>
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
              {pool.season_year}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Created {new Date(pool.created_at).toLocaleDateString()} · {pool.game_count} game
            {pool.game_count !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Toggle pills */}
      <div className="flex items-center gap-2">
        <button
          onClick={() =>
            patchPool.mutate({ poolId: pool.id, patch: { is_featured: !live.is_featured } })
          }
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
          onClick={() =>
            patchPool.mutate({
              poolId: pool.id,
              patch: { submissions_open: !live.submissions_open },
            })
          }
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

      <div className="border-b border-border/40" />

      {/* Games list */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">
          Games <span className="text-muted-foreground font-normal">({pool.game_count})</span>
        </h3>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="size-4 animate-spin" />
            Loading games…
          </div>
        ) : detail?.games.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No games added to this pool yet.</p>
        ) : (
          <div className="rounded-xl overflow-hidden bg-white/[0.03] border border-border/20">
            {detail?.games.map((g) => {
              const asCfbdGame: CfbdGame = {
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
              return <GameRow key={g.id} game={asCfbdGame} readOnly />
            })}
          </div>
        )}
      </div>

      <div className="border-b border-border/40" />

      {/* Danger zone */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Danger Zone</h3>
        <button
          onClick={() => setConfirmDelete(true)}
          className="px-3 py-1.5 rounded-full text-xs font-medium text-destructive border border-destructive/40 hover:bg-destructive/10 transition-colors"
        >
          Delete Pool
        </button>
      </div>

      {confirmDelete &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
            <div className="bg-white/[0.03] border border-border/20 rounded-2xl p-7 max-w-sm w-full mx-4 space-y-5">
              <div className="space-y-1.5">
                <h2 className="text-base font-semibold text-foreground">Delete this pool?</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  <span className="text-foreground font-medium">{pool.name}</span> and all its games
                  will be permanently deleted. This cannot be undone.
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
          document.body,
        )}
    </div>
  )
}
