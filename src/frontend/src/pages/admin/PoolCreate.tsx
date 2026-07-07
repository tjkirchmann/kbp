import { useState, useMemo, useEffect, forwardRef, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Minus, Plus, Trash2, ListChecks, CircleSlash, Lock } from 'lucide-react'
import { localModel } from '@virtuoso.dev/data-table'
import ClearableSelect from '@/components/admin/filters/ClearableSelect'
import SearchableSelect from '@/components/admin/filters/SearchableSelect'
import AdminTableToolbar from '@/components/admin/AdminTableToolbar'
import { DataTable, DataTableColumn, DataTableColumnHeader, DataTableCell } from '@/components/ui/data-table'
import SelectionColumn from '@/components/admin/SelectionColumn'

import {
  useCreatePool,
  useCfbdGames,
  useAddPoolGames,
  useUpdateBracket,
  useUpdateMultipliers,
  useRemovePoolGame,
  useDeletePool,
  type CfbdGame,
  type PoolGameDetail,
} from '@/services/admin/useAdminPools'
import { useAdminTeams } from '@/services/admin/useAdminTeams'
import Modal from '@/components/ui/Modal'

type Step = 'step1' | 'step2' | 'step3' | 'step4'

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

// Which FR slot is required before each QF slot
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

// ─── Validation ───────────────────────────────────────────────────────────────

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

// ─── Root Component ───────────────────────────────────────────────────────────

export default function PoolCreate() {
  const navigate = useNavigate()
  const createPool = useCreatePool()
  const addGames = useAddPoolGames()
  const updateBracket = useUpdateBracket()
  const updateMultipliers = useUpdateMultipliers()
  const removePoolGame = useRemovePoolGame()
  const deletePool = useDeletePool()
  const { data: teams = [] } = useAdminTeams()

  const [step, setStep] = useState<Step>('step1')
  const [name, setName] = useState('')
  const [seasonYear, setSeasonYear] = useState(new Date().getFullYear())
  const [newPoolId, setNewPoolId] = useState<number | null>(null)
  const [newPoolYear, setNewPoolYear] = useState<number | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())

  // Virtuoso localModel bridge for the game table
  const [gameModel] = useState(() => localModel<CfbdGame>({ data: [] }))
  const [step2Tab, setStep2Tab] = useState<'finder' | 'selected'>('finder')
  const [finderSeasonType, setFinderSeasonType] = useState('all')
  const [finderClass, setFinderClass] = useState('FBS')
  const [finderWeek, setFinderWeek] = useState('all')
  const [selectedSeasonType, setSelectedSeasonType] = useState('all')
  const [selectedClass, setSelectedClass] = useState('all')
  const [selectedWeek, setSelectedWeek] = useState('all')
  const [finderConference, setFinderConference] = useState('all')
  const [selectedConference, setSelectedConference] = useState('all')
  const [search, setSearch] = useState('')
  const [bracketMode, setBracketMode] = useState<'assign' | 'skip'>('skip')

  // State populated after step 2 — used by steps 3 & 4
  const [poolGames, setPoolGames] = useState<PoolGameDetail[]>([])
  // slot key → pool_game_id
  const [slotToGame, setSlotToGame] = useState<Record<string, number>>({})
  const [bracketError, setBracketError] = useState<string | null>(null)

  // pool_game_id → multiplier
  const [multipliers, setMultipliers] = useState<Record<number, number>>({})

  const { data: cfbdGames = [], isLoading: gamesLoading } = useCfbdGames(newPoolYear)

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

  // Weeks present in the currently scoped subset (season type + class + conference).
  // Derive separately per tab so the dropdown tracks the active filters.
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

  const selectedWeekOptions = useMemo(() => {
    const vals = [
      ...new Set(
        cfbdGames
          .filter((g) => {
            if (!selected.has(g.id)) return false
            if (selectedSeasonType !== 'all' && g.season_type !== selectedSeasonType) return false
            if (
              selectedClass !== 'all' &&
              g.home_classification?.toLowerCase() !== selectedClass.toLowerCase() &&
              g.away_classification?.toLowerCase() !== selectedClass.toLowerCase()
            )
              return false
            if (
              selectedConference !== 'all' &&
              g.home_conference !== selectedConference &&
              g.away_conference !== selectedConference
            )
              return false
            return true
          })
          .map((g) => g.week)
          .filter((w): w is number => w != null),
      ),
    ]
    return vals.sort((a, b) => a - b)
  }, [cfbdGames, selected, selectedSeasonType, selectedClass, selectedConference])

  const conferenceOptions = useMemo(() => {
    const vals = new Set<string>()
    cfbdGames.forEach((g) => {
      if (g.home_conference) vals.add(g.home_conference)
      if (g.away_conference) vals.add(g.away_conference)
    })
    return [...vals].sort()
  }, [cfbdGames])

  // school → team flavor (logos/colors) for the step-4 review table
  const teamMeta = useMemo(() => {
    const m = new Map<string, { logo: string | null; color: string | null }>()
    teams.forEach((t) => m.set(t.school, { logo: t.logos?.[0] ?? null, color: t.color }))
    return m
  }, [teams])

  const finderGames = useMemo(
    () =>
      cfbdGames.filter((g) => {
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
    [cfbdGames, finderSeasonType, finderClass, finderWeek, finderConference, search],
  )

  const selectedGames = useMemo(
    () =>
      cfbdGames.filter((g) => {
        if (!selected.has(g.id)) return false
        if (selectedSeasonType !== 'all' && g.season_type !== selectedSeasonType) return false
        if (
          selectedClass !== 'all' &&
          g.home_classification?.toLowerCase() !== selectedClass.toLowerCase() &&
          g.away_classification?.toLowerCase() !== selectedClass.toLowerCase()
        )
          return false
        if (selectedWeek !== 'all' && String(g.week) !== selectedWeek) return false
        if (
          selectedConference !== 'all' &&
          g.home_conference !== selectedConference &&
          g.away_conference !== selectedConference
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
    [
      cfbdGames,
      selected,
      selectedSeasonType,
      selectedClass,
      selectedWeek,
      selectedConference,
      search,
    ],
  )

  async function handleCreatePool() {
    const pool = await createPool.mutateAsync({ name: name.trim(), season_year: seasonYear })
    setNewPoolId(pool.id)
    setNewPoolYear(pool.season_year)
    setStep('step2')
  }

  async function handleAddGames() {
    if (!newPoolId || selected.size === 0) return
    const games = await addGames.mutateAsync({ poolId: newPoolId, cfbdGameIds: [...selected] })
    setPoolGames(games)
    // Preserve any multipliers already set; default new games to 1x
    setMultipliers((prev) => {
      const next: Record<number, number> = {}
      games.forEach((pg) => {
        next[pg.id] = prev[pg.id] ?? 1
      })
      return next
    })
    // Default the bracket step to "skip" unless there are postseason games
    setBracketMode(games.some((pg) => pg.season_type === 'postseason') ? 'assign' : 'skip')
    setStep('step3')
  }

  // Persist the current bracket assignments. Returns false (and sets an error)
  // when the bracket is invalid so callers can block the transition.
  async function persistBracket(): Promise<boolean> {
    const err = validateBracket(slotToGame)
    if (err) {
      setBracketError(err)
      return false
    }
    setBracketError(null)
    if (newPoolId) {
      const assignments = Object.entries(slotToGame).map(([slot, pgId]) => ({
        pool_game_id: pgId,
        playoff_slot: slot,
      }))
      await updateBracket.mutateAsync({ poolId: newPoolId, assignments })
    }
    return true
  }

  async function handleBracketNext() {
    if (await persistBracket()) setStep('step4')
  }

  // Step 3 "Back" — persist before leaving so assignments aren't lost going back.
  async function handleBracketBack() {
    if (bracketMode === 'skip' || (await persistBracket())) setStep('step2')
  }

  function handleSkipBracket() {
    setBracketError(null)
    setSlotToGame({})
    setStep('step4')
  }

  async function handleRemovePoolGame(pgId: number) {
    if (!newPoolId) return
    await removePoolGame.mutateAsync({ poolId: newPoolId, poolGameId: pgId })
    const game = poolGames.find((pg) => pg.id === pgId)
    setPoolGames((prev) => prev.filter((pg) => pg.id !== pgId))
    setMultipliers((prev) => {
      const n = { ...prev }
      delete n[pgId]
      return n
    })
    setSlotToGame((prev) => {
      const n = { ...prev }
      for (const [slot, id] of Object.entries(n)) if (id === pgId) delete n[slot]
      return n
    })
    if (game) {
      setSelected((prev) => {
        const n = new Set(prev)
        n.delete(game.cfbd_game_id)
        return n
      })
    }
  }

  async function persistMultipliers() {
    if (!newPoolId) return
    const nonDefault = Object.entries(multipliers)
      .filter(([, v]) => v > 1)
      .map(([k, v]) => ({ pool_game_id: Number(k), multiplier: v }))
    if (nonDefault.length > 0) {
      await updateMultipliers.mutateAsync({ poolId: newPoolId, multipliers: nonDefault })
    }
  }

  // Step 4 -> step 2 ("Add games" / Back), persisting multipliers first.
  async function handleBackToStep2FromReview() {
    await persistMultipliers()
    setStep('step2')
  }

  async function handleFinish() {
    await persistMultipliers()
    navigate('/admin/pools')
  }

  // Cancel rolls back the pool created at step 1 (no-op if not yet created).
  async function handleCancel() {
    if (newPoolId) {
      try {
        await deletePool.mutateAsync(newPoolId)
      } catch {
        /* best-effort rollback */
      }
    }
    navigate('/admin/pools')
  }

  // ── Compute step title and footer ──────────────────────────────────────────

  const stepTitle = {
    step1: 'Step 1 of 4 — Pool details',
    step2: 'Step 2 of 4 — Select games',
    step3: 'Step 3 of 4 — Playoff bracket',
    step4: 'Step 4 of 4 — Review & multipliers',
  }[step]

  let footerContent: ReactNode = null

  if (step === 'step1') {
    footerContent = (
      <>
        <button
          onClick={handleCancel}
          disabled={deletePool.isPending}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={handleCreatePool}
          disabled={!name.trim() || createPool.isPending}
          className="btn-primary px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ml-auto"
        >
          {createPool.isPending && <Loader2 className="size-4 animate-spin" />}
          Next: Select Games
        </button>
      </>
    )
  } else if (step === 'step2') {
    footerContent = (
      <>
        <button
          onClick={handleCancel}
          disabled={deletePool.isPending}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={handleAddGames}
          disabled={selected.size === 0 || addGames.isPending}
          className="btn-primary px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ml-auto"
        >
          {addGames.isPending && <Loader2 className="size-4 animate-spin" />}
          Next: Configure Bracket
        </button>
      </>
    )
  } else if (step === 'step3') {
    footerContent = (
      <>
        <button
          onClick={handleBracketBack}
          disabled={updateBracket.isPending}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          Back
        </button>
        <button
          onClick={bracketMode === 'assign' ? handleBracketNext : handleSkipBracket}
          disabled={updateBracket.isPending}
          className="btn-primary px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ml-auto"
        >
          {updateBracket.isPending && <Loader2 className="size-4 animate-spin" />}
          Next: Review &amp; Multipliers
        </button>
      </>
    )
  } else if (step === 'step4') {
    footerContent = (
      <>
        <button
          onClick={handleCancel}
          disabled={deletePool.isPending}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={handleFinish}
          disabled={updateMultipliers.isPending || poolGames.length === 0}
          className="btn-primary px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ml-auto"
        >
          {updateMultipliers.isPending && <Loader2 className="size-4 animate-spin" />}
          Create Pool
        </button>
      </>
    )
  }

  // Build reverse map for step 4: pool_game_id → playoff round label
  const gameIdToSlotKey: Record<number, string> = {}
  for (const [slot, pgId] of Object.entries(slotToGame)) {
    gameIdToSlotKey[pgId] = slot
  }

    // Compute activeGames at component level for model bridge
  const activeGames = useMemo(() => {
    if (step !== 'step2') return [] as CfbdGame[]
    return step2Tab === 'finder' ? finderGames : selectedGames
  }, [step, step2Tab, finderGames, selectedGames])

  // Bridge activeGames to localModel
  useEffect(() => {
    gameModel.setData?.(activeGames)
  }, [gameModel, activeGames])

  // ── Step 2 setup ────────────────────────────────────────────────────────────

  let step2Content: ReactNode = null
  if (step === 'step2') {
    const isFinder = step2Tab === 'finder'
    const activeSeasonType = isFinder ? finderSeasonType : selectedSeasonType
    const setActiveSeasonType = isFinder ? setFinderSeasonType : setSelectedSeasonType
    const activeClass = isFinder ? finderClass : selectedClass
    const setActiveClass = isFinder ? setFinderClass : setSelectedClass
    const activeWeek = isFinder ? finderWeek : selectedWeek
    const setActiveWeek = isFinder ? setFinderWeek : setSelectedWeek
    const activeConference = isFinder ? finderConference : selectedConference
    const setActiveConference = isFinder ? setFinderConference : setSelectedConference
    const activeWeekOptions = isFinder ? finderWeekOptions : selectedWeekOptions
    const totalGames = isFinder ? cfbdGames.length : selected.size


    const isFiltered =
      search !== '' ||
      activeSeasonType !== 'all' ||
      activeClass !== 'all' ||
      activeWeek !== 'all' ||
      activeConference !== 'all'
    const clsColors: Record<string, string> = {
      FBS: 'tag-green',
      FCS: 'tag-amber',
      DII: 'tag-teal',
      DIII: 'tag-purple',
    }

    step2Content = (
      <div className="h-full flex flex-col gap-4 min-h-0 overflow-hidden">
        {/* Tab bar */}
        <div className="shrink-0 flex items-center gap-1 border-b border-border">
          <button
            onClick={() => {
              setStep2Tab('finder')
              setSearch('')
            }}
            className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${isFinder ? 'text-foreground border-primary' : 'text-muted-foreground border-transparent hover:text-foreground'}`}
          >
            Game Finder
          </button>
          <button
            onClick={() => {
              setStep2Tab('selected')
              setSearch('')
            }}
            className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${!isFinder ? 'text-foreground border-primary' : 'text-muted-foreground border-transparent hover:text-foreground'}`}
          >
            Currently Selected ({selected.size})
          </button>
        </div>

        {/* Filters */}
        <div className="shrink-0 flex items-center gap-2 flex-wrap">
          <ClearableSelect
            label="Season"
            options={[
              { value: '', label: 'All' },
              ...seasonTypeOptions.map((v) => ({
                value: v,
                label: v.charAt(0).toUpperCase() + v.slice(1),
              })),
            ]}
            value={activeSeasonType === 'all' ? '' : activeSeasonType}
            onChange={(v) => setActiveSeasonType(v || 'all')}
            placeholder="All"
          />
          <SearchableSelect
            label="Week"
            options={activeWeekOptions.map((v) => ({ value: String(v), label: `Week ${v}` }))}
            value={activeWeek === 'all' ? '' : activeWeek}
            onChange={(v) => setActiveWeek(v || 'all')}
            placeholder="All"
          />
          <ClearableSelect
            label="Class"
            options={[
              { value: '', label: 'All' },
              ...classOptions.map((v) => ({ value: v, label: v.toUpperCase() })),
            ]}
            value={activeClass === 'all' ? '' : activeClass}
            onChange={(v) => setActiveClass(v || 'all')}
            placeholder="All"
          />
          <ClearableSelect
            label="Conference"
            options={[
              { value: '', label: 'All' },
              ...conferenceOptions.map((v) => ({ value: v, label: v })),
            ]}
            value={activeConference === 'all' ? '' : activeConference}
            onChange={(v) => setActiveConference(v || 'all')}
            placeholder="All"
          />
          {isFinder && (
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search teams, bowls…"
              className="w-40 rounded-lg bg-white/[0.03] border border-border/20 px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
          )}
        </div>

        <AdminTableToolbar
          count={activeGames.length}
          total={totalGames}
          noun="game"
          countSuffix={isFiltered ? '· filtered' : undefined}
        />
        {/* Virtual table */}
        {/* Data table */}
        {activeGames.length === 0 && !gamesLoading ? (
          <div className="flex-1 flex items-center justify-center">
            {isFinder ? (
              <p className="text-sm text-muted-foreground py-4">No games available for this season.</p>
            ) : (
              <p className="text-sm text-muted-foreground py-4">No games selected yet. Use the Game Finder tab to pick games.</p>
            )}
          </div>
        ) : gamesLoading && activeGames.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : (
          <DataTable
            className="bg-white/[0.03] border border-border/20 rounded-2xl overflow-hidden flex-1 min-h-0"
            model={gameModel}
            computeRowKey={({ data }) => data.id}
            components={{
              Row: forwardRef<any, any>(({ style, ...props }: any, ref) => (
                <div ref={ref}
                  {...props}
                  className="flex items-center border-t border-border/20 transition-colors hover:bg-[rgba(26,30,42,0.4)]"
                  style={{ ...style, height: 56 }}
                />
              )) as any,
            }}
          >
            <SelectionColumn<CfbdGame>
              data={activeGames}
              rowKey={(g) => g.id}
              selectedIds={selected as Set<string | number>}
              onSelectionChange={(ids) => setSelected(ids as Set<number>)}
            />
            <DataTableColumn id="status">
              <DataTableColumnHeader className="w-8 justify-center" />
              <DataTableCell className="justify-center">
                {({ row }) => {
                  const g = row.data as CfbdGame
                  const s = g.completed ? 'final' : Date.now() >= new Date(g.start_date).getTime() ? 'live' : 'upcoming'
                  return <div className={s === 'final' ? 'size-2 rounded-full bg-emerald-500 shrink-0' : s === 'live' ? 'size-2 rounded-full bg-amber-400 shrink-0 animate-pulse' : 'size-2 rounded-full bg-border shrink-0'} title={s === 'final' ? 'Final' : s === 'live' ? 'In Progress' : 'Upcoming'} />
                }}
              </DataTableCell>
            </DataTableColumn>
            <DataTableColumn field="away_team" grow={3}>
              <DataTableColumnHeader className="px-5">Matchup</DataTableColumnHeader>
              <DataTableCell className="px-5">
                {({ row }) => {
                  const g = row.data as CfbdGame
                  const matchup = g.neutral_site ? g.away_team + ' vs ' + g.home_team : g.away_team + ' at ' + g.home_team
                  return <p className="text-sm font-medium text-foreground truncate">{g.bowl_name ? g.bowl_name + ', ' + matchup : matchup}</p>
                }}
              </DataTableCell>
            </DataTableColumn>
            <DataTableColumn field="week">
              <DataTableColumnHeader className="px-5">Week</DataTableColumnHeader>
              <DataTableCell className="px-5">
                {({ row }) => { const g = row.data as CfbdGame; return <span className="text-xs text-muted-foreground">{g.week != null ? 'Wk ' + g.week : '—'}</span> }}
              </DataTableCell>
            </DataTableColumn>
            <DataTableColumn id="date">
              <DataTableColumnHeader className="px-5">Date</DataTableColumnHeader>
              <DataTableCell className="px-5">
                {({ row }) => { const g = row.data as CfbdGame; return <span className="text-xs text-muted-foreground">{formatGameTime(g.start_date, g.start_time_tbd) || '—'}</span> }}
              </DataTableCell>
            </DataTableColumn>
            <DataTableColumn id="class">
              <DataTableColumnHeader className="px-5">Class</DataTableColumnHeader>
              <DataTableCell className="px-5">
                {({ row }) => {
                  const g = row.data as CfbdGame
                  const hc = g.home_classification?.toUpperCase() ?? null
                  const ac = g.away_classification?.toUpperCase() ?? null
                  const tags: string[] = hc === ac ? (hc ? [hc] : []) : ([ac, hc].filter(Boolean) as string[])
                  return <div className="flex items-center gap-1">{tags.map((t: string) => <span key={t} className={'text-[10px] px-1.5 py-0.5 rounded-full font-semibold ' + (clsColors[t] ?? 'tag-blue')}>{t}</span>)}</div>
                }}
              </DataTableCell>
            </DataTableColumn>
            <DataTableColumn id="conf">
              <DataTableColumnHeader className="px-5">Conference</DataTableColumnHeader>
              <DataTableCell className="px-5">
                {({ row }) => {
                  const g = row.data as CfbdGame
                  const sc = g.home_conference && g.away_conference && g.home_conference === g.away_conference
                  return <span className={'text-[10px] px-1.5 py-px rounded-full font-medium ' + (sc ? 'tag-blue' : 'bg-white/[0.04] text-muted-foreground/60')}>{sc ? g.home_conference : 'Out of Conference'}</span>
                }}
              </DataTableCell>
            </DataTableColumn>
          </DataTable>
        )}
      </div>
    )
  }

  // ── Step 3 setup ────────────────────────────────────────────────────────────

  let step3Content: ReactNode = null
  if (step === 'step3') {
    // pool_game_id → slot key (reverse map)
    const gameToSlot: Record<number, string> = {}
    for (const [slot, pgId] of Object.entries(slotToGame)) {
      gameToSlot[pgId] = slot
    }

    function assignSlot(slotKey: string, pgIdStr: string) {
      setBracketError(null)
      const pgId = pgIdStr === '' ? null : Number(pgIdStr)
      setSlotToGame((prev) => {
        const next = { ...prev }
        // Remove any existing assignment for this slot
        delete next[slotKey]
        // Remove the game from any other slot it was in
        if (pgId !== null) {
          for (const [k, v] of Object.entries(next)) {
            if (v === pgId) delete next[k]
          }
          next[slotKey] = pgId
        }
        return next
      })
    }

    const roundGroups: { round: PlayoffRound; slots: BracketSlot[] }[] = [
      { round: 'first_round', slots: BRACKET_SLOTS.filter((s) => s.round === 'first_round') },
      { round: 'quarterfinal', slots: BRACKET_SLOTS.filter((s) => s.round === 'quarterfinal') },
      { round: 'semifinal', slots: BRACKET_SLOTS.filter((s) => s.round === 'semifinal') },
      { round: 'championship', slots: BRACKET_SLOTS.filter((s) => s.round === 'championship') },
    ]

    const hasPostseason = poolGames.some((pg) => pg.season_type === 'postseason')

    step3Content = (
      <div className="h-full flex flex-col gap-6 min-h-0">
        <div className="shrink-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => {
              if (!hasPostseason) return
              setBracketError(null)
              setBracketMode('assign')
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
            onClick={() => {
              setBracketError(null)
              setSlotToGame({})
              setBracketMode('skip')
            }}
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

        <div className="flex-1 overflow-y-auto min-h-0 relative">
          <div className={bracketMode === 'skip' ? 'opacity-30 pointer-events-none select-none' : ''}>
            <div className="space-y-6">
              {roundGroups.map(({ round, slots }) => (
                <div key={round} className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {ROUND_LABELS[round]}
                  </p>
                  <div className="space-y-1">
                    {slots.map((slot) => {
                      const assignedPgId = slotToGame[slot.key]
                      // Options: unassigned games + currently assigned game for this slot
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
                            onChange={(v) => assignSlot(slot.key, v)}
                            placeholder="Not assigned"
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {bracketMode === 'skip' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Lock className="size-5" />
                <p className="text-sm font-medium">Playoff bracket skipped</p>
              </div>
            </div>
          )}
        </div>

        {bracketError && <p className="text-sm text-destructive shrink-0">{bracketError}</p>}
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Modal open={true} onClose={handleCancel} title={stepTitle} footer={footerContent} size="xl">
      {step === 'step1' && (
        <div className="flex justify-center">
          <div className="max-w-md w-full space-y-4">
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
        </div>
      )}

      {step === 'step2' && step2Content}

      {step === 'step3' && step3Content}

      {step === 'step4' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-muted-foreground">{poolGames.length} games</span>
            <button
              onClick={handleBackToStep2FromReview}
              disabled={updateMultipliers.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/15 text-primary text-sm font-medium hover:bg-primary/25 transition-colors disabled:opacity-50"
            >
              <Plus className="size-4" />
              Add games
            </button>
          </div>

          {poolGames.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8">
              No games in this pool. Use “Add games” to pick some.
            </p>
          ) : (
            <div className="bg-white/[0.03] border border-border/20 rounded-2xl overflow-hidden">
              <div className="flex items-center border-b border-border/40 text-xs font-medium text-muted-foreground">
                <div className="px-5 py-2.5 flex-[3]">Matchup</div>
                <div className="px-5 py-2.5 flex-[2]">Date</div>
                <div className="px-5 py-2.5 flex-[1.5]">Playoff</div>
                <div className="px-5 py-2.5 flex-[1.5] text-center">Multiplier</div>
                <div className="px-5 py-2.5 flex-[0.5]" />
              </div>
              {poolGames.map((pg) => {
                const slotKey = gameIdToSlotKey[pg.id]
                const slot = slotKey ? SLOT_BY_KEY[slotKey] : null
                const mult = multipliers[pg.id] ?? 1
                const dateTime = formatGameTime(pg.start_date, pg.start_time_tbd)
                const sep = pg.neutral_site ? 'vs' : 'at'

                return (
                  <div
                    key={pg.id}
                    className="flex items-center border-t border-border/20 hover:bg-[rgba(26,30,42,0.4)] transition-colors"
                  >
                    <div className="px-5 py-2.5 flex-[3] min-w-0">
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
                      {slot ? (
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${ROUND_COLORS[slot.round]}`}
                        >
                          {ROUND_LABELS[slot.round]}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                    <div className="px-5 py-2.5 flex-[1.5]">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() =>
                            setMultipliers((prev) => ({
                              ...prev,
                              [pg.id]: Math.max(1, (prev[pg.id] ?? 1) - 1),
                            }))
                          }
                          disabled={mult <= 1}
                          className="size-7 flex items-center justify-center rounded-md border border-border bg-muted text-foreground hover:bg-muted/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          <Minus className="size-4" />
                        </button>
                        <span className="text-sm font-semibold text-foreground w-8 text-center">
                          {mult}x
                        </span>
                        <button
                          onClick={() =>
                            setMultipliers((prev) => ({ ...prev, [pg.id]: (prev[pg.id] ?? 1) + 1 }))
                          }
                          className="size-7 flex items-center justify-center rounded-md border border-border bg-muted text-foreground hover:bg-muted/60 transition-colors"
                        >
                          <Plus className="size-4" />
                        </button>
                      </div>
                    </div>
                    <div className="px-5 py-2.5 flex-[0.5] flex justify-end">
                      <button
                        onClick={() => handleRemovePoolGame(pg.id)}
                        disabled={removePoolGame.isPending}
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
        </div>
      )}
    </Modal>
  )
}

// ─── Team badge (Step 4 table) ──────────────────────────────────────────────────

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

// ─── Helper functions ──────────────────────────────────────────────────────────────────

function formatGameTime(startDate: string, timeTbd: boolean): string {
  if (!startDate) return ''
  const date = new Date(startDate)
  const datePart = date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
  if (timeTbd) return `${datePart} · Time TBD`
  return `${datePart} at ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
}
