import { useState, useMemo, useEffect, forwardRef } from 'react'
import { Loader2, Minus, Plus, Trash2, Lock, ListChecks, CircleSlash } from 'lucide-react'
import { localModel } from '@virtuoso.dev/data-table'
import ClearableSelect from '@/components/admin/filters/ClearableSelect'
import SearchableSelect from '@/components/admin/filters/SearchableSelect'
import AdminTableToolbar from '@/components/admin/AdminTableToolbar'
import {
  DataTable,
  DataTableColumn,
  DataTableColumnHeader,
  DataTableCell,
} from '@/components/ui/data-table'
import SelectionColumn from '@/components/admin/SelectionColumn'
import Modal from '@/components/ui/Modal'

import {
  usePoolDetail,
  useCfbdGames,
  useAddPoolGames,
  useRemovePoolGame,
  useUpdateBracket,
  useUpdateMultipliers,
  type CfbdGame,
  type PoolGameDetail,
} from '@/services/admin/useAdminPools'
import { useAdminTeams } from '@/services/admin/useAdminTeams'

// ─── CFP Bracket Definition ───────────────────────────────────────────────────

type PlayoffRound = 'first_round' | 'quarterfinal' | 'semifinal' | 'championship'

interface BracketSlot {
  key: string
  label: string
  round: PlayoffRound
}

const BRACKET_SLOTS: BracketSlot[] = [
  { key: 'FR1', label: '#5 vs #12', round: 'first_round' },
  { key: 'FR2', label: '#6 vs #11', round: 'first_round' },
  { key: 'FR3', label: '#7 vs #10', round: 'first_round' },
  { key: 'FR4', label: '#8 vs #9', round: 'first_round' },
  { key: 'QF1', label: '#1 vs FR4 winner', round: 'quarterfinal' },
  { key: 'QF2', label: '#2 vs FR3 winner', round: 'quarterfinal' },
  { key: 'QF3', label: '#3 vs FR2 winner', round: 'quarterfinal' },
  { key: 'QF4', label: '#4 vs FR1 winner', round: 'quarterfinal' },
  { key: 'SF1', label: 'QF1 winner vs QF2 winner', round: 'semifinal' },
  { key: 'SF2', label: 'QF3 winner vs QF4 winner', round: 'semifinal' },
  { key: 'CH', label: 'SF1 winner vs SF2 winner', round: 'championship' },
]

const SLOT_BY_KEY: Record<string, BracketSlot> = Object.fromEntries(
  BRACKET_SLOTS.map((s) => [s.key, s]),
)

const QF_REQUIRES_FR: Record<string, string> = {
  QF1: 'FR4',
  QF2: 'FR3',
  QF3: 'FR2',
  QF4: 'FR1',
}

const ROUND_LABELS: Record<PlayoffRound, string> = {
  first_round: 'First Round',
  quarterfinal: 'Quarterfinal',
  semifinal: 'Semifinal',
  championship: 'Championship',
}

const ROUND_COLORS: Record<PlayoffRound, string> = {
  first_round: 'tag-green',
  quarterfinal: 'tag-blue',
  semifinal: 'tag-amber',
  championship: 'tag-purple',
}

function validateBracket(slotToGame: Record<string, number>): string | null {
  for (const [qf, fr] of Object.entries(QF_REQUIRES_FR)) {
    if (slotToGame[qf] !== undefined && slotToGame[fr] === undefined) {
      return `Assign ${fr} before ${qf}`
    }
  }
  const allQF = ['QF1', 'QF2', 'QF3', 'QF4']
  const hasSF = slotToGame['SF1'] !== undefined || slotToGame['SF2'] !== undefined
  if (hasSF && !allQF.every((k) => slotToGame[k] !== undefined)) {
    return 'Assign all Quarterfinal games before assigning Semifinals'
  }
  if (slotToGame['CH'] !== undefined) {
    if (slotToGame['SF1'] === undefined || slotToGame['SF2'] === undefined) {
      return 'Assign both Semifinal games before assigning Championship'
    }
  }
  return null
}

type Tab = 'games' | 'bracket' | 'multipliers'

interface PoolEditModalProps {
  poolId: number
  open: boolean
  onClose: () => void
}

export default function PoolEditModal({ poolId, open, onClose }: PoolEditModalProps) {
  const { data: detail, isLoading } = usePoolDetail(poolId)
  const { data: teams = [] } = useAdminTeams()
  const addGames = useAddPoolGames()
  const removeGame = useRemovePoolGame()
  const updateBracket = useUpdateBracket()
  const updateMultipliers = useUpdateMultipliers()

  const [tab, setTab] = useState<Tab>('games')

  // ── Games tab state ──────────────────────────────────────────────────────
  const [showFinder, setShowFinder] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [finderSeasonType, setFinderSeasonType] = useState('all')
  const [finderClass, setFinderClass] = useState('FBS')
  const [finderWeek, setFinderWeek] = useState('all')
  const [finderConference, setFinderConference] = useState('all')
  const [search, setSearch] = useState('')

  const { data: cfbdGames = [], isLoading: cfbdLoading } = useCfbdGames(
    detail?.season_year ?? null,
  )

  const poolGames = detail?.games ?? []

  // Build existing CFBD game ID set for filtering finder
  const existingCfbdIds = useMemo(
    () => new Set(poolGames.map((pg) => pg.cfbd_game_id)),
    [poolGames],
  )

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

  const finderWeekOptions = useMemo(() => {
    const vals = [
      ...new Set(
        cfbdGames
          .filter((g) => {
            if (finderSeasonType !== 'all' && g.season_type !== finderSeasonType) return false
            if (
              finderClass !== 'all' &&
              g.home_classification?.toLowerCase() !== finderClass.toLowerCase() &&
              g.away_classification?.toLowerCase() !== finderClass.toLowerCase()
            )
              return false
            if (
              finderConference !== 'all' &&
              g.home_conference !== finderConference &&
              g.away_conference !== finderConference
            )
              return false
            return true
          })
          .map((g) => g.week)
          .filter((w): w is number => w != null),
      ),
    ]
    return vals.sort((a, b) => a - b)
  }, [cfbdGames, finderSeasonType, finderClass, finderConference])

  const conferenceOptions = useMemo(() => {
    const vals = new Set<string>()
    cfbdGames.forEach((g) => {
      if (g.home_conference) vals.add(g.home_conference)
      if (g.away_conference) vals.add(g.away_conference)
    })
    return [...vals].sort()
  }, [cfbdGames])

  const finderGames = useMemo(
    () =>
      cfbdGames.filter((g) => {
        if (existingCfbdIds.has(g.id)) return false
        if (finderSeasonType !== 'all' && g.season_type !== finderSeasonType) return false
        if (
          finderClass !== 'all' &&
          g.home_classification?.toLowerCase() !== finderClass.toLowerCase() &&
          g.away_classification?.toLowerCase() !== finderClass.toLowerCase()
        )
          return false
        if (finderWeek !== 'all' && String(g.week) !== finderWeek) return false
        if (
          finderConference !== 'all' &&
          g.home_conference !== finderConference &&
          g.away_conference !== finderConference
        )
          return false
        if (search) {
          const term = search.toLowerCase()
          const haystack = [g.home_team, g.away_team, g.bowl_name]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
          if (!haystack.includes(term)) return false
        }
        return true
      }),
    [cfbdGames, existingCfbdIds, finderSeasonType, finderClass, finderWeek, finderConference, search],
  )

  const [finderModel] = useState(() => localModel<CfbdGame>({ data: [] }))
  useEffect(() => {
    finderModel.setData?.(finderGames)
  }, [finderModel, finderGames])

  async function handleAddSelected() {
    if (selected.size === 0) return
    await addGames.mutateAsync({ poolId, cfbdGameIds: [...selected] })
    setSelected(new Set())
    setShowFinder(false)
  }

  // ── Bracket tab state ────────────────────────────────────────────────────
  const [slotToGame, setSlotToGame] = useState<Record<string, number>>({})
  const [bracketMode, setBracketMode] = useState<'assign' | 'skip'>('skip')
  const [bracketError, setBracketError] = useState<string | null>(null)

  // Initialize bracket state from pool detail
  useEffect(() => {
    if (!detail) return
    const initial: Record<string, number> = {}
    let hasBracket = false
    for (const pg of detail.games) {
      if (pg.playoff_slot) {
        initial[pg.playoff_slot] = pg.id
        hasBracket = true
      }
    }
    setSlotToGame(initial)
    setBracketMode(hasBracket ? 'assign' : 'skip')
  }, [detail])

  const gameToSlot: Record<number, string> = {}
  for (const [slot, pgId] of Object.entries(slotToGame)) {
    gameToSlot[pgId] = slot
  }

  const hasPostseason = poolGames.some((pg) => pg.season_type === 'postseason')

  function assignSlot(slotKey: string, pgIdStr: string) {
    setBracketError(null)
    const pgId = pgIdStr === '' ? null : Number(pgIdStr)
    setSlotToGame((prev) => {
      const next = { ...prev }
      delete next[slotKey]
      if (pgId !== null) {
        for (const [k, v] of Object.entries(next)) {
          if (v === pgId) delete next[k]
        }
        next[slotKey] = pgId
      }
      return next
    })
  }

  async function persistBracket() {
    const err = validateBracket(slotToGame)
    if (err) {
      setBracketError(err)
      return
    }
    setBracketError(null)
    const assignments = Object.entries(slotToGame).map(([slot, pgId]) => ({
      pool_game_id: pgId,
      playoff_slot: slot,
    }))
    await updateBracket.mutateAsync({ poolId, assignments })
  }

  async function handleBracketModeChange(mode: 'assign' | 'skip') {
    setBracketMode(mode)
    setBracketError(null)
    if (mode === 'skip') {
      setSlotToGame({})
      // Clear all bracket assignments on server
      const assignments = poolGames.map((pg) => ({
        pool_game_id: pg.id,
        playoff_slot: null,
      }))
      await updateBracket.mutateAsync({ poolId, assignments })
    }
  }

  // ── Multipliers tab state ────────────────────────────────────────────────
  const [multipliers, setMultipliers] = useState<Record<number, number>>({})

  useEffect(() => {
    if (!detail) return
    const init: Record<number, number> = {}
    for (const pg of detail.games) {
      init[pg.id] = pg.multiplier
    }
    setMultipliers(init)
  }, [detail])

  async function handleMultiplierChange(pgId: number, delta: number) {
    const newVal = Math.max(1, (multipliers[pgId] ?? 1) + delta)
    setMultipliers((prev) => ({ ...prev, [pgId]: newVal }))
    await updateMultipliers.mutateAsync({
      poolId,
      multipliers: [{ pool_game_id: pgId, multiplier: newVal }],
    })
  }

  // team meta for game rows
  const teamMeta = useMemo(() => {
    const m = new Map<string, { logo: string | null; color: string | null }>()
    teams.forEach((t) => m.set(t.school, { logo: t.logos?.[0] ?? null, color: t.color }))
    return m
  }, [teams])

  // ── Render helpers ───────────────────────────────────────────────────────
  const clsColors: Record<string, string> = {
    FBS: 'tag-green',
    FCS: 'tag-amber',
    DII: 'tag-teal',
    DIII: 'tag-purple',
  }

  const title = detail ? `Edit — ${detail.name}` : 'Edit Pool'

  if (isLoading) {
    return (
      <Modal open={open} onClose={onClose} title="Edit Pool" size="xl">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      </Modal>
    )
  }

  if (!detail) {
    return (
      <Modal open={open} onClose={onClose} title="Edit Pool" size="xl">
        <p className="text-sm text-muted-foreground py-8">Pool not found.</p>
      </Modal>
    )
  }

  return (
    <Modal open={open} onClose={onClose} title={title} size="xl">
      <div className="flex flex-col gap-4 min-h-0" style={{ minHeight: '60vh' }}>
        {/* Locked header — name + season */}
        <div className="shrink-0 flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.03] border border-border/20">
          <Lock className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">{detail.name}</span>
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/15 text-primary border border-primary/20">
            {detail.season_year}
          </span>
        </div>

        {/* Tab bar */}
        <div className="shrink-0 flex items-center gap-1 border-b border-border/30">
          {(['games', 'bracket', 'multipliers'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                // Persist bracket before switching away
                if (tab === 'bracket' && t !== 'bracket' && bracketMode === 'assign') {
                  persistBracket()
                }
                setTab(t)
              }}
              className={`px-3 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px capitalize ${
                tab === t
                  ? 'text-foreground border-primary'
                  : 'text-muted-foreground border-transparent hover:text-foreground'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {tab === 'games' && (
            <GamesTab
              poolGames={poolGames}
              poolId={poolId}
              showFinder={showFinder}
              setShowFinder={setShowFinder}
              selected={selected}
              setSelected={setSelected}
              finderGames={finderGames}
              finderModel={finderModel}
              finderSeasonType={finderSeasonType}
              setFinderSeasonType={setFinderSeasonType}
              finderClass={finderClass}
              setFinderClass={setFinderClass}
              finderWeek={finderWeek}
              setFinderWeek={setFinderWeek}
              finderConference={finderConference}
              setFinderConference={setFinderConference}
              search={search}
              setSearch={setSearch}
              seasonTypeOptions={seasonTypeOptions}
              classOptions={classOptions}
              finderWeekOptions={finderWeekOptions}
              conferenceOptions={conferenceOptions}
              clsColors={clsColors}
              teamMeta={teamMeta}
              cfbdLoading={cfbdLoading}
              cfbdCount={cfbdGames.length}
              onAddSelected={handleAddSelected}
              onRemoveGame={async (pgId) => {
                await removeGame.mutateAsync({ poolId, poolGameId: pgId })
              }}
              addingPending={addGames.isPending}
              removingPending={removeGame.isPending}
            />
          )}
          {tab === 'bracket' && (
            <BracketTab
              poolGames={poolGames}
              slotToGame={slotToGame}
              gameToSlot={gameToSlot}
              bracketMode={bracketMode}
              bracketError={bracketError}
              hasPostseason={hasPostseason}
              onBracketModeChange={handleBracketModeChange}
              onAssignSlot={assignSlot}
              onPersist={persistBracket}
              saving={updateBracket.isPending}
            />
          )}
          {tab === 'multipliers' && (
            <MultipliersTab
              poolGames={poolGames}
              multipliers={multipliers}
              teamMeta={teamMeta}
              onMultiplierChange={handleMultiplierChange}
              saving={updateMultipliers.isPending}
            />
          )}
        </div>
      </div>
    </Modal>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Games Tab
// ══════════════════════════════════════════════════════════════════════════════

interface GamesTabProps {
  poolGames: PoolGameDetail[]
  poolId: number
  showFinder: boolean
  setShowFinder: (v: boolean) => void
  selected: Set<number>
  setSelected: (s: Set<number>) => void
  finderGames: CfbdGame[]
  finderModel: ReturnType<typeof localModel<CfbdGame>>
  finderSeasonType: string
  setFinderSeasonType: (v: string) => void
  finderClass: string
  setFinderClass: (v: string) => void
  finderWeek: string
  setFinderWeek: (v: string) => void
  finderConference: string
  setFinderConference: (v: string) => void
  search: string
  setSearch: (v: string) => void
  seasonTypeOptions: string[]
  classOptions: string[]
  finderWeekOptions: number[]
  conferenceOptions: string[]
  clsColors: Record<string, string>
  teamMeta: Map<string, { logo: string | null; color: string | null }>
  cfbdLoading: boolean
  cfbdCount: number
  onAddSelected: () => Promise<void>
  onRemoveGame: (pgId: number) => Promise<void>
  addingPending: boolean
  removingPending: boolean
}

function GamesTab({
  poolGames,
  showFinder,
  setShowFinder,
  selected,
  setSelected,
  finderGames,
  finderModel,
  finderSeasonType,
  setFinderSeasonType,
  finderClass,
  setFinderClass,
  finderWeek,
  setFinderWeek,
  finderConference,
  setFinderConference,
  search,
  setSearch,
  seasonTypeOptions,
  classOptions,
  finderWeekOptions,
  conferenceOptions,
  clsColors,
  teamMeta,
  cfbdLoading,
  cfbdCount,
  onAddSelected,
  onRemoveGame,
  addingPending,
  removingPending,
}: GamesTabProps) {
  return (
    <div className="space-y-4">
      {/* Current games */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{poolGames.length} games in pool</span>
        <button
          type="button"
          onClick={() => setShowFinder(!showFinder)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            showFinder
              ? 'bg-white/[0.04] text-muted-foreground border border-border/30'
              : 'bg-primary/15 text-primary hover:bg-primary/25'
          }`}
        >
          <Plus className="size-4" />
          {showFinder ? 'Close Finder' : 'Add Games'}
        </button>
      </div>

      {/* Current games table */}
      {poolGames.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">No games in this pool.</p>
      ) : (
        <div className="bg-white/[0.03] border border-border/20 rounded-2xl overflow-hidden">
          <div className="flex items-center border-b border-border/40 text-xs font-medium text-muted-foreground">
            <div className="px-5 py-2.5 flex-[4]">Matchup</div>
            <div className="px-5 py-2.5 flex-[2]">Date</div>
            <div className="px-5 py-2.5 flex-[1.5]">Bracket</div>
            <div className="px-5 py-2.5 flex-[1] text-center">Mult</div>
            <div className="px-5 py-2.5 flex-[0.5]" />
          </div>
          {poolGames.map((pg) => {
            const dateTime = formatGameTime(pg.start_date, pg.start_time_tbd)
            const sep = pg.neutral_site ? 'vs' : 'at'
            const slotInfo = pg.playoff_slot ? SLOT_BY_KEY[pg.playoff_slot] : null
            return (
              <div
                key={pg.id}
                className="flex items-center border-t border-border/20 hover:bg-[rgba(26,30,42,0.4)] transition-colors"
              >
                <div className="px-5 py-2.5 flex-[4] min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <TeamBadge name={pg.away_team} meta={teamMeta.get(pg.away_team)} />
                    <span className="text-xs text-muted-foreground shrink-0">{sep}</span>
                    <TeamBadge name={pg.home_team} meta={teamMeta.get(pg.home_team)} />
                  </div>
                  {pg.bowl_name && (
                    <span className="text-xs text-muted-foreground truncate block mt-0.5">
                      {pg.bowl_name}
                    </span>
                  )}
                </div>
                <div className="px-5 py-2.5 flex-[2] text-xs text-muted-foreground">
                  {dateTime || '—'}
                  {pg.week != null ? ` · Wk ${pg.week}` : ''}
                </div>
                <div className="px-5 py-2.5 flex-[1.5]">
                  {slotInfo ? (
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${ROUND_COLORS[slotInfo.round]}`}
                    >
                      {slotInfo.key}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </div>
                <div className="px-5 py-2.5 flex-[1] text-center">
                  <span className="text-sm font-semibold tabular-nums text-foreground">
                    {pg.multiplier}x
                  </span>
                </div>
                <div className="px-5 py-2.5 flex-[0.5] flex justify-end">
                  <button
                    onClick={() => onRemoveGame(pg.id)}
                    disabled={removingPending}
                    title="Remove game"
                    className="size-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-30 transition-colors"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Game finder (expandable) */}
      {showFinder && (
        <div className="bg-white/[0.03] border border-border/20 rounded-2xl overflow-hidden p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <ClearableSelect
              label="Season"
              options={[
                { value: '', label: 'All' },
                ...seasonTypeOptions.map((v) => ({
                  value: v,
                  label: v.charAt(0).toUpperCase() + v.slice(1),
                })),
              ]}
              value={finderSeasonType === 'all' ? '' : finderSeasonType}
              onChange={(v) => setFinderSeasonType(v || 'all')}
              placeholder="All"
            />
            <SearchableSelect
              label="Week"
              options={finderWeekOptions.map((v) => ({ value: String(v), label: `Week ${v}` }))}
              value={finderWeek === 'all' ? '' : finderWeek}
              onChange={(v) => setFinderWeek(v || 'all')}
              placeholder="All"
            />
            <ClearableSelect
              label="Class"
              options={[
                { value: '', label: 'All' },
                ...classOptions.map((v) => ({ value: v, label: v.toUpperCase() })),
              ]}
              value={finderClass === 'all' ? '' : finderClass}
              onChange={(v) => setFinderClass(v || 'all')}
              placeholder="All"
            />
            <ClearableSelect
              label="Conference"
              options={[
                { value: '', label: 'All' },
                ...conferenceOptions.map((v) => ({ value: v, label: v })),
              ]}
              value={finderConference === 'all' ? '' : finderConference}
              onChange={(v) => setFinderConference(v || 'all')}
              placeholder="All"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search teams, bowls…"
              className="w-40 rounded-lg bg-white/[0.03] border border-border/20 px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
          </div>

          <div className="flex items-center justify-between">
            <AdminTableToolbar
              count={finderGames.length}
              total={cfbdCount}
              noun="game"
            />
            <button
              type="button"
              onClick={onAddSelected}
              disabled={selected.size === 0 || addingPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/15 text-primary text-sm font-medium hover:bg-primary/25 transition-colors disabled:opacity-40"
            >
              {addingPending && <Loader2 className="size-3.5 animate-spin" />}
              Add Selected ({selected.size})
            </button>
          </div>

          {finderGames.length === 0 && !cfbdLoading ? (
            <p className="text-sm text-muted-foreground py-4">No games match filters.</p>
          ) : cfbdLoading && finderGames.length === 0 ? (
            <div className="flex items-center justify-center py-4 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
            </div>
          ) : (
            <div style={{ maxHeight: '300px' }}>
              <DataTable
                className="bg-transparent"
                model={finderModel}
                computeRowKey={({ data }) => data.id}
                components={{
                  Row: forwardRef<any, any>(({ style, ...props }: any, ref) => (
                    <div
                      ref={ref}
                      {...props}
                      className="flex items-center border-t border-border/20 transition-colors hover:bg-[rgba(26,30,42,0.4)]"
                      style={{ ...style, height: 48 }}
                    />
                  )) as any,
                }}
              >
                <SelectionColumn<CfbdGame>
                  data={finderGames}
                  rowKey={(g) => g.id}
                  selectedIds={selected as Set<string | number>}
                  onSelectionChange={(ids) => setSelected(ids as Set<number>)}
                />
                <DataTableColumn field="away_team" grow={3}>
                  <DataTableColumnHeader className="px-5">Matchup</DataTableColumnHeader>
                  <DataTableCell className="px-5">
                    {({ row }) => {
                      const g = row.data as CfbdGame
                      const matchup = g.neutral_site
                        ? g.away_team + ' vs ' + g.home_team
                        : g.away_team + ' at ' + g.home_team
                      return (
                        <p className="text-sm font-medium text-foreground truncate">
                          {g.bowl_name ? g.bowl_name + ', ' + matchup : matchup}
                        </p>
                      )
                    }}
                  </DataTableCell>
                </DataTableColumn>
                <DataTableColumn field="week">
                  <DataTableColumnHeader className="px-5">Week</DataTableColumnHeader>
                  <DataTableCell className="px-5">
                    {({ row }) => {
                      const g = row.data as CfbdGame
                      return (
                        <span className="text-xs text-muted-foreground">
                          {g.week != null ? 'Wk ' + g.week : '—'}
                        </span>
                      )
                    }}
                  </DataTableCell>
                </DataTableColumn>
                <DataTableColumn id="date">
                  <DataTableColumnHeader className="px-5">Date</DataTableColumnHeader>
                  <DataTableCell className="px-5">
                    {({ row }) => {
                      const g = row.data as CfbdGame
                      return (
                        <span className="text-xs text-muted-foreground">
                          {formatGameTime(g.start_date, g.start_time_tbd) || '—'}
                        </span>
                      )
                    }}
                  </DataTableCell>
                </DataTableColumn>
                <DataTableColumn id="class">
                  <DataTableColumnHeader className="px-5">Class</DataTableColumnHeader>
                  <DataTableCell className="px-5">
                    {({ row }) => {
                      const g = row.data as CfbdGame
                      const hc = g.home_classification?.toUpperCase() ?? null
                      const ac = g.away_classification?.toUpperCase() ?? null
                      const tags: string[] =
                        hc === ac ? (hc ? [hc] : []) : ([ac, hc].filter(Boolean) as string[])
                      return (
                        <div className="flex items-center gap-1">
                          {tags.map((t) => (
                            <span
                              key={t}
                              className={
                                'text-[10px] px-1.5 py-0.5 rounded-full font-semibold ' +
                                (clsColors[t] ?? 'tag-blue')
                              }
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )
                    }}
                  </DataTableCell>
                </DataTableColumn>
              </DataTable>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Bracket Tab
// ══════════════════════════════════════════════════════════════════════════════

interface BracketTabProps {
  poolGames: PoolGameDetail[]
  slotToGame: Record<string, number>
  gameToSlot: Record<number, string>
  bracketMode: 'assign' | 'skip'
  bracketError: string | null
  hasPostseason: boolean
  onBracketModeChange: (mode: 'assign' | 'skip') => void
  onAssignSlot: (slotKey: string, pgIdStr: string) => void
  onPersist: () => Promise<void>
  saving: boolean
}

function BracketTab({
  poolGames,
  slotToGame,
  gameToSlot,
  bracketMode,
  bracketError,
  hasPostseason,
  onBracketModeChange,
  onAssignSlot,
  onPersist,
  saving,
}: BracketTabProps) {
  const roundGroups: { round: PlayoffRound; slots: BracketSlot[] }[] = [
    { round: 'first_round', slots: BRACKET_SLOTS.filter((s) => s.round === 'first_round') },
    { round: 'quarterfinal', slots: BRACKET_SLOTS.filter((s) => s.round === 'quarterfinal') },
    { round: 'semifinal', slots: BRACKET_SLOTS.filter((s) => s.round === 'semifinal') },
    { round: 'championship', slots: BRACKET_SLOTS.filter((s) => s.round === 'championship') },
  ]

  return (
    <div className="space-y-6">
      {/* Mode selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          onClick={() => {
            if (!hasPostseason) return
            onBracketModeChange('assign')
          }}
          disabled={!hasPostseason}
          className={`text-left rounded-xl border px-4 py-3 transition-colors ${
            !hasPostseason
              ? 'border-border/20 bg-white/[0.03] opacity-50 cursor-not-allowed'
              : bracketMode === 'assign'
                ? 'border-primary bg-primary/10 ring-1 ring-primary'
                : 'border-border/20 bg-white/[0.03] hover:bg-white/[0.05]'
          }`}
        >
          <div className="flex items-center gap-2">
            {hasPostseason ? (
              <ListChecks
                className={`size-4 ${bracketMode === 'assign' ? 'text-primary' : 'text-muted-foreground'}`}
              />
            ) : (
              <Lock className="size-4 text-muted-foreground" />
            )}
            <span className="text-sm font-medium text-foreground">Assign playoff bracket</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {hasPostseason
              ? 'Map selected games onto CFP bracket slots.'
              : 'No postseason games in this pool.'}
          </p>
        </button>
        <button
          onClick={() => onBracketModeChange('skip')}
          className={`text-left rounded-xl border px-4 py-3 transition-colors ${bracketMode === 'skip' ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'border-border/20 bg-white/[0.03] hover:bg-white/[0.05]'}`}
        >
          <div className="flex items-center gap-2">
            <CircleSlash
              className={`size-4 ${bracketMode === 'skip' ? 'text-primary' : 'text-muted-foreground'}`}
            />
            <span className="text-sm font-medium text-foreground">Skip playoff assignments</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {hasPostseason
              ? 'No bracket — score all games the same way.'
              : 'No postseason games in this pool.'}
          </p>
        </button>
      </div>

      {bracketMode === 'assign' && (
        <>
          <div className="space-y-6">
            {roundGroups.map(({ round, slots }) => (
              <div key={round} className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {ROUND_LABELS[round]}
                </p>
                <div className="space-y-1">
                  {slots.map((slot) => {
                    const assignedPgId = slotToGame[slot.key]
                    const options = poolGames.filter(
                      (pg) => gameToSlot[pg.id] === undefined || gameToSlot[pg.id] === slot.key,
                    )
                    return (
                      <div
                        key={slot.key}
                        className="flex items-center gap-3 rounded-lg px-3 py-2 bg-white/[0.03] border border-border/20"
                      >
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 ${ROUND_COLORS[round]}`}
                        >
                          {slot.key}
                        </span>
                        <span className="text-sm text-foreground flex-1">{slot.label}</span>
                        <SearchableSelect
                          options={options.map((pg) => {
                            const matchup = pg.neutral_site
                              ? `${pg.away_team} vs ${pg.home_team}`
                              : `${pg.away_team} at ${pg.home_team}`
                            const label = pg.bowl_name ? `${pg.bowl_name}, ${matchup}` : matchup
                            return { value: String(pg.id), label }
                          })}
                          value={assignedPgId ? String(assignedPgId) : ''}
                          onChange={(v) => onAssignSlot(slot.key, v)}
                          placeholder="Not assigned"
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          {bracketError && <p className="text-sm text-destructive">{bracketError}</p>}
          <button
            type="button"
            onClick={onPersist}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/15 text-primary text-sm font-medium hover:bg-primary/25 transition-colors disabled:opacity-50"
          >
            {saving && <Loader2 className="size-3.5 animate-spin" />}
            Save Bracket
          </button>
        </>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Multipliers Tab
// ══════════════════════════════════════════════════════════════════════════════

interface MultipliersTabProps {
  poolGames: PoolGameDetail[]
  multipliers: Record<number, number>
  teamMeta: Map<string, { logo: string | null; color: string | null }>
  onMultiplierChange: (pgId: number, delta: number) => Promise<void>
  saving: boolean
}

function MultipliersTab({
  poolGames,
  multipliers,
  teamMeta,
  onMultiplierChange,
  saving,
}: MultipliersTabProps) {
  if (poolGames.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">No games in this pool.</p>
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Set multipliers for each game. Default is 1x.
      </p>
      <div className="bg-white/[0.03] border border-border/20 rounded-2xl overflow-hidden">
        <div className="flex items-center border-b border-border/40 text-xs font-medium text-muted-foreground">
          <div className="px-5 py-2.5 flex-[4]">Matchup</div>
          <div className="px-5 py-2.5 flex-[2]">Date</div>
          <div className="px-5 py-2.5 flex-[2] text-center">Multiplier</div>
        </div>
        {poolGames.map((pg) => {
          const mult = multipliers[pg.id] ?? pg.multiplier ?? 1
          const dateTime = formatGameTime(pg.start_date, pg.start_time_tbd)
          const sep = pg.neutral_site ? 'vs' : 'at'
          return (
            <div
              key={pg.id}
              className="flex items-center border-t border-border/20 hover:bg-[rgba(26,30,42,0.4)] transition-colors"
            >
              <div className="px-5 py-2.5 flex-[4] min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <TeamBadge name={pg.away_team} meta={teamMeta.get(pg.away_team)} />
                  <span className="text-xs text-muted-foreground shrink-0">{sep}</span>
                  <TeamBadge name={pg.home_team} meta={teamMeta.get(pg.home_team)} />
                </div>
                {pg.bowl_name && (
                  <span className="text-xs text-muted-foreground truncate block mt-0.5">
                    {pg.bowl_name}
                  </span>
                )}
              </div>
              <div className="px-5 py-2.5 flex-[2] text-xs text-muted-foreground">
                {dateTime || '—'}
              </div>
              <div className="px-5 py-2.5 flex-[2]">
                <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={() => onMultiplierChange(pg.id, -1)}
                    disabled={mult <= 1 || saving}
                    className="size-7 flex items-center justify-center rounded-md border border-border bg-muted text-foreground hover:bg-muted/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <Minus className="size-4" />
                  </button>
                  <span className="text-sm font-semibold text-foreground w-8 text-center tabular-nums">
                    {mult}x
                  </span>
                  <button
                    onClick={() => onMultiplierChange(pg.id, 1)}
                    disabled={saving}
                    className="size-7 flex items-center justify-center rounded-md border border-border bg-muted text-foreground hover:bg-muted/60 transition-colors"
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Shared helpers
// ══════════════════════════════════════════════════════════════════════════════

function TeamBadge({
  name,
  meta,
}: {
  name: string
  meta?: { logo: string | null; color: string | null }
}) {
  const logo = meta?.logo ?? null
  return (
    <span className="flex items-center gap-1.5 min-w-0">
      {logo ? (
        <img src={logo} alt={name} className="size-4 object-contain shrink-0" />
      ) : (
        <span className="size-4 rounded bg-muted/40 shrink-0" />
      )}
      <span className="text-sm font-medium text-foreground truncate">{name}</span>
    </span>
  )
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
