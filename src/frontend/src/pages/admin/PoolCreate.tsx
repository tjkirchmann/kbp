import { useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Loader2, Minus, Plus, Check, Trash2, ListChecks, CircleSlash } from 'lucide-react'
import {
  useCreatePool,
  useCfbdGames,
  useAddPoolGames,
  useUpdateBracket,
  useUpdateMultipliers,
  useRemovePoolGame,
  type CfbdGame,
  type PoolGameDetail,
} from '@/services/useAdminPools'
import { useAdminTeams } from '@/services/useAdminTeams'

type Step = 'step1' | 'step2' | 'step3' | 'step4'

const ROW_HEIGHT = 60

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
  { key: 'FR4', label: '#8 vs #9',  round: 'first_round' },
  { key: 'QF1', label: '#1 vs FR4 winner', round: 'quarterfinal' },
  { key: 'QF2', label: '#2 vs FR3 winner', round: 'quarterfinal' },
  { key: 'QF3', label: '#3 vs FR2 winner', round: 'quarterfinal' },
  { key: 'QF4', label: '#4 vs FR1 winner', round: 'quarterfinal' },
  { key: 'SF1', label: 'QF1 winner vs QF2 winner', round: 'semifinal' },
  { key: 'SF2', label: 'QF3 winner vs QF4 winner', round: 'semifinal' },
  { key: 'CH',  label: 'SF1 winner vs SF2 winner', round: 'championship' },
]

const SLOT_BY_KEY: Record<string, BracketSlot> = Object.fromEntries(BRACKET_SLOTS.map(s => [s.key, s]))

// Which FR slot is required before each QF slot
const QF_REQUIRES_FR: Record<string, string> = {
  QF1: 'FR4', QF2: 'FR3', QF3: 'FR2', QF4: 'FR1',
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
  if (hasSF && !allQF.every(k => slotToGame[k] !== undefined)) {
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
  const { data: teams = [] } = useAdminTeams()

  const [step, setStep] = useState<Step>('step1')
  const [name, setName] = useState('')
  const [seasonYear, setSeasonYear] = useState(new Date().getFullYear())
  const [newPoolId, setNewPoolId] = useState<number | null>(null)
  const [newPoolYear, setNewPoolYear] = useState<number | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [step2Tab, setStep2Tab] = useState<'finder' | 'selected'>('finder')
  const [finderSeasonType, setFinderSeasonType] = useState('postseason')
  const [finderClass, setFinderClass] = useState('fbs')
  const [finderWeek, setFinderWeek] = useState('all')
  const [selectedSeasonType, setSelectedSeasonType] = useState('all')
  const [selectedClass, setSelectedClass] = useState('all')
  const [selectedWeek, setSelectedWeek] = useState('all')
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
    const vals = [...new Set(cfbdGames.map(g => g.season_type).filter(Boolean))]
    return vals.sort()
  }, [cfbdGames])

  const classOptions = useMemo(() => {
    const vals = new Set<string>()
    cfbdGames.forEach(g => {
      if (g.home_classification) vals.add(g.home_classification)
      if (g.away_classification) vals.add(g.away_classification)
    })
    return [...vals].sort()
  }, [cfbdGames])

  const weekOptions = useMemo(() => {
    const vals = [...new Set(cfbdGames.map(g => g.week).filter((w): w is number => w != null))]
    return vals.sort((a, b) => a - b)
  }, [cfbdGames])

  // school → team flavor (logos/colors) for the step-4 review table
  const teamMeta = useMemo(() => {
    const m = new Map<string, { logo: string | null; color: string | null }>()
    teams.forEach(t => m.set(t.school, { logo: t.logos?.[0] ?? null, color: t.color }))
    return m
  }, [teams])

  const finderGames = useMemo(() => cfbdGames.filter(g => {
    if (finderSeasonType !== 'all' && g.season_type !== finderSeasonType) return false
    if (finderClass !== 'all' && g.home_classification !== finderClass && g.away_classification !== finderClass) return false
    if (finderWeek !== 'all' && String(g.week) !== finderWeek) return false
    return true
  }), [cfbdGames, finderSeasonType, finderClass, finderWeek])

  const selectedGames = useMemo(() => cfbdGames.filter(g => {
    if (!selected.has(g.id)) return false
    if (selectedSeasonType !== 'all' && g.season_type !== selectedSeasonType) return false
    if (selectedClass !== 'all' && g.home_classification !== selectedClass && g.away_classification !== selectedClass) return false
    if (selectedWeek !== 'all' && String(g.week) !== selectedWeek) return false
    return true
  }), [cfbdGames, selected, selectedSeasonType, selectedClass, selectedWeek])

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
    setMultipliers(prev => {
      const next: Record<number, number> = {}
      games.forEach(pg => { next[pg.id] = prev[pg.id] ?? 1 })
      return next
    })
    // Default the bracket step to "skip" unless there are postseason games
    setBracketMode(games.some(pg => pg.season_type === 'postseason') ? 'assign' : 'skip')
    setStep('step3')
  }

  async function handleBracketNext() {
    const err = validateBracket(slotToGame)
    if (err) { setBracketError(err); return }
    setBracketError(null)

    if (newPoolId && Object.keys(slotToGame).length > 0) {
      const assignments = Object.entries(slotToGame).map(([slot, pgId]) => ({
        pool_game_id: pgId,
        playoff_slot: slot,
      }))
      await updateBracket.mutateAsync({ poolId: newPoolId, assignments })
    }
    setStep('step4')
  }

  function handleSkipBracket() {
    setBracketError(null)
    setSlotToGame({})
    setStep('step4')
  }

  async function handleRemovePoolGame(pgId: number) {
    if (!newPoolId) return
    await removePoolGame.mutateAsync({ poolId: newPoolId, poolGameId: pgId })
    const game = poolGames.find(pg => pg.id === pgId)
    setPoolGames(prev => prev.filter(pg => pg.id !== pgId))
    setMultipliers(prev => { const n = { ...prev }; delete n[pgId]; return n })
    setSlotToGame(prev => {
      const n = { ...prev }
      for (const [slot, id] of Object.entries(n)) if (id === pgId) delete n[slot]
      return n
    })
    if (game) {
      setSelected(prev => { const n = new Set(prev); n.delete(game.cfbd_game_id); return n })
    }
  }

  async function handleFinish() {
    if (!newPoolId) return
    const nonDefault = Object.entries(multipliers)
      .filter(([, v]) => v > 1)
      .map(([k, v]) => ({ pool_game_id: Number(k), multiplier: v }))
    if (nonDefault.length > 0) {
      await updateMultipliers.mutateAsync({ poolId: newPoolId, multipliers: nonDefault })
    }
    navigate('/admin/pools')
  }

  function toggleGame(id: number) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ── Step 1 ──────────────────────────────────────────────────────────────────

  if (step === 'step1') {
    return (
      <div className="max-w-md space-y-6">
        <p className="text-sm text-muted-foreground">Step 1 of 4 — Pool details</p>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Pool name <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. 2025 Kirchmann Bowl Pool"
              className="w-full rounded-lg bg-white/[0.03] border border-border/20 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Season year</label>
            <input
              type="number"
              value={seasonYear}
              onChange={e => setSeasonYear(Number(e.target.value))}
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
          <button onClick={() => navigate('/admin/pools')} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Cancel
          </button>
        </div>
      </div>
    )
  }

  // ── Step 2 ──────────────────────────────────────────────────────────────────

  if (step === 'step2') {
    const isFinder = step2Tab === 'finder'
    const activeSeasonType = isFinder ? finderSeasonType : selectedSeasonType
    const setActiveSeasonType = isFinder ? setFinderSeasonType : setSelectedSeasonType
    const activeClass = isFinder ? finderClass : selectedClass
    const setActiveClass = isFinder ? setFinderClass : setSelectedClass
    const activeWeek = isFinder ? finderWeek : selectedWeek
    const setActiveWeek = isFinder ? setFinderWeek : setSelectedWeek
    const activeGames = isFinder ? finderGames : selectedGames

    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Step 2 of 4 — Select games from {newPoolYear}</p>

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

        {!gamesLoading && cfbdGames.length > 0 && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Season Stage</label>
              <select
                value={activeSeasonType}
                onChange={e => setActiveSeasonType(e.target.value)}
                className="rounded-lg bg-white/[0.03] border border-border/20 px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="all">All</option>
                {seasonTypeOptions.map(v => (
                  <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Week</label>
              <select
                value={activeWeek}
                onChange={e => setActiveWeek(e.target.value)}
                className="rounded-lg bg-white/[0.03] border border-border/20 px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="all">All</option>
                {weekOptions.map(v => (
                  <option key={v} value={String(v)}>Week {v}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Classification</label>
              <select
                value={activeClass}
                onChange={e => setActiveClass(e.target.value)}
                className="rounded-lg bg-white/[0.03] border border-border/20 px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="all">All</option>
                {classOptions.map(v => (
                  <option key={v} value={v}>{v.toUpperCase()}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3 ml-auto">
              <span className="text-xs text-muted-foreground">{activeGames.length} shown</span>
              {isFinder ? (
                <button
                  onClick={() => {
                    const allSelected = finderGames.every(g => selected.has(g.id))
                    setSelected(prev => {
                      const next = new Set(prev)
                      finderGames.forEach(g => allSelected ? next.delete(g.id) : next.add(g.id))
                      return next
                    })
                  }}
                  className="text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  {finderGames.every(g => selected.has(g.id)) && finderGames.length > 0 ? 'Deselect all' : 'Select all'}
                </button>
              ) : (
                <button
                  onClick={() => setSelected(prev => {
                    const next = new Set(prev)
                    selectedGames.forEach(g => next.delete(g.id))
                    return next
                  })}
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
            {isFinder ? 'No games match the current filters.' : 'No selected games match the current filters.'}
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
            Next: Configure Bracket
          </button>
          <button onClick={() => navigate('/admin/pools')} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Cancel
          </button>
        </div>
      </div>
    )
  }

  // ── Step 3 ──────────────────────────────────────────────────────────────────

  if (step === 'step3') {
    // pool_game_id → slot key (reverse map)
    const gameToSlot: Record<number, string> = {}
    for (const [slot, pgId] of Object.entries(slotToGame)) {
      gameToSlot[pgId] = slot
    }

    function assignSlot(slotKey: string, pgIdStr: string) {
      setBracketError(null)
      const pgId = pgIdStr === '' ? null : Number(pgIdStr)
      setSlotToGame(prev => {
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
      { round: 'first_round', slots: BRACKET_SLOTS.filter(s => s.round === 'first_round') },
      { round: 'quarterfinal', slots: BRACKET_SLOTS.filter(s => s.round === 'quarterfinal') },
      { round: 'semifinal', slots: BRACKET_SLOTS.filter(s => s.round === 'semifinal') },
      { round: 'championship', slots: BRACKET_SLOTS.filter(s => s.round === 'championship') },
    ]

    const hasPostseason = poolGames.some(pg => pg.season_type === 'postseason')

    return (
      <div className="space-y-6 max-w-2xl">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Step 3 of 4 — Playoff bracket <span className="text-xs">(optional)</span></p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => { setBracketError(null); setBracketMode('assign') }}
            className={`text-left rounded-xl border px-4 py-3 transition-colors ${bracketMode === 'assign' ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'border-border/20 bg-white/[0.03] hover:bg-white/[0.05]'}`}
          >
            <div className="flex items-center gap-2">
              <ListChecks className={`size-4 ${bracketMode === 'assign' ? 'text-primary' : 'text-muted-foreground'}`} />
              <span className="text-sm font-medium text-foreground">Assign playoff bracket</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Map selected games onto CFP bracket slots.</p>
          </button>
          <button
            onClick={() => { setBracketError(null); setSlotToGame({}); setBracketMode('skip') }}
            className={`text-left rounded-xl border px-4 py-3 transition-colors ${bracketMode === 'skip' ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'border-border/20 bg-white/[0.03] hover:bg-white/[0.05]'}`}
          >
            <div className="flex items-center gap-2">
              <CircleSlash className={`size-4 ${bracketMode === 'skip' ? 'text-primary' : 'text-muted-foreground'}`} />
              <span className="text-sm font-medium text-foreground">Skip playoff assignments</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {hasPostseason ? 'No bracket — score all games the same way.' : 'No postseason games in this pool.'}
            </p>
          </button>
        </div>

        {bracketMode === 'assign' && (
        <div className="space-y-6">
          {roundGroups.map(({ round, slots }) => (
            <div key={round} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{ROUND_LABELS[round]}</p>
              <div className="space-y-1">
                {slots.map(slot => {
                  const assignedPgId = slotToGame[slot.key]
                  // Options: unassigned games + currently assigned game for this slot
                  const options = poolGames.filter(pg =>
                    gameToSlot[pg.id] === undefined || gameToSlot[pg.id] === slot.key
                  )
                  return (
                    <div key={slot.key} className="flex items-center gap-3 rounded-lg px-3 py-2 bg-white/[0.03] border border-border/20">
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 ${ROUND_COLORS[round]}`}>
                        {slot.key}
                      </span>
                      <span className="text-sm text-foreground flex-1">{slot.label}</span>
                      <select
                        value={assignedPgId ?? ''}
                        onChange={e => assignSlot(slot.key, e.target.value)}
                        className="rounded-lg bg-white/[0.03] border border-border/20 px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary max-w-[220px] truncate"
                      >
                        <option value="">— Not assigned —</option>
                        {options.map(pg => {
                          const matchup = pg.neutral_site
                            ? `${pg.away_team} vs ${pg.home_team}`
                            : `${pg.away_team} at ${pg.home_team}`
                          const label = pg.bowl_name ? `${pg.bowl_name}, ${matchup}` : matchup
                          return <option key={pg.id} value={pg.id}>{label}</option>
                        })}
                      </select>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        )}

        {bracketError && (
          <p className="text-sm text-destructive">{bracketError}</p>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={bracketMode === 'assign' ? handleBracketNext : handleSkipBracket}
            disabled={updateBracket.isPending}
            className="btn-primary px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {updateBracket.isPending && <Loader2 className="size-4 animate-spin" />}
            Next: Review &amp; Multipliers
          </button>
          <button
            onClick={() => setStep('step2')}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Back
          </button>
        </div>
      </div>
    )
  }

  // ── Step 4 ──────────────────────────────────────────────────────────────────

  // Build reverse map: pool_game_id → playoff round label
  const gameIdToSlotKey: Record<number, string> = {}
  for (const [slot, pgId] of Object.entries(slotToGame)) {
    gameIdToSlotKey[pgId] = slot
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">Step 4 of 4 — Review &amp; assign multipliers · {poolGames.length} games</p>
        <button
          onClick={() => setStep('step2')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/15 text-primary text-sm font-medium hover:bg-primary/25 transition-colors"
        >
          <Plus className="size-4" />
          Add games
        </button>
      </div>

      {poolGames.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8">No games in this pool. Use “Add games” to pick some.</p>
      ) : (
        <div className="bg-white/[0.03] border border-border/20 rounded-2xl overflow-hidden">
          <div className="flex items-center border-b border-border/40 text-xs font-medium text-muted-foreground">
            <div className="px-5 py-2.5 flex-[3]">Matchup</div>
            <div className="px-5 py-2.5 flex-[2]">Date</div>
            <div className="px-5 py-2.5 flex-[1.5]">Playoff</div>
            <div className="px-5 py-2.5 flex-[1.5] text-center">Multiplier</div>
            <div className="px-5 py-2.5 flex-[0.5]" />
          </div>
          {poolGames.map(pg => {
            const slotKey = gameIdToSlotKey[pg.id]
            const slot = slotKey ? SLOT_BY_KEY[slotKey] : null
            const mult = multipliers[pg.id] ?? 1
            const dateTime = formatGameTime(pg.start_date, pg.start_time_tbd)
            const sep = pg.neutral_site ? 'vs' : 'at'

            return (
              <div key={pg.id} className="flex items-center border-t border-border/20 hover:bg-[rgba(26,30,42,0.4)] transition-colors">
                <div className="px-5 py-2.5 flex-[3] min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <TeamBadge name={pg.away_team} meta={teamMeta.get(pg.away_team)} />
                    <span className="text-xs text-muted-foreground shrink-0">{sep}</span>
                    <TeamBadge name={pg.home_team} meta={teamMeta.get(pg.home_team)} />
                  </div>
                  {pg.bowl_name && <span className="text-xs text-muted-foreground truncate block mt-0.5">{pg.bowl_name}</span>}
                </div>
                <div className="px-5 py-2.5 flex-[2] text-xs text-muted-foreground">
                  {dateTime || '—'}{pg.week != null ? ` · Wk ${pg.week}` : ''}
                </div>
                <div className="px-5 py-2.5 flex-[1.5]">
                  {slot
                    ? <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${ROUND_COLORS[slot.round]}`}>{ROUND_LABELS[slot.round]}</span>
                    : <span className="text-xs text-muted-foreground">—</span>}
                </div>
                <div className="px-5 py-2.5 flex-[1.5]">
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => setMultipliers(prev => ({ ...prev, [pg.id]: Math.max(1, (prev[pg.id] ?? 1) - 1) }))}
                      disabled={mult <= 1}
                      className="size-7 flex items-center justify-center rounded-md border border-border bg-muted hover:bg-muted/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <Minus className="size-3" />
                    </button>
                    <span className="text-sm font-semibold text-foreground w-8 text-center">{mult}x</span>
                    <button
                      onClick={() => setMultipliers(prev => ({ ...prev, [pg.id]: (prev[pg.id] ?? 1) + 1 }))}
                      className="size-7 flex items-center justify-center rounded-md border border-border bg-muted hover:bg-muted/60 transition-colors"
                    >
                      <Plus className="size-3" />
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

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleFinish}
          disabled={updateMultipliers.isPending || poolGames.length === 0}
          className="btn-primary px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {updateMultipliers.isPending && <Loader2 className="size-4 animate-spin" />}
          Create Pool
        </button>
        <button onClick={() => navigate('/admin/pools')} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ─── Team badge (Step 4 table) ──────────────────────────────────────────────────

function TeamBadge({ name, meta }: { name: string; meta?: { logo: string | null; color: string | null } }) {
  const logo = meta?.logo ?? null
  return (
    <span className="flex items-center gap-1.5 min-w-0">
      {logo
        ? <img src={logo} alt={name} className="size-4 object-contain shrink-0" />
        : <span className="size-4 rounded bg-muted/40 shrink-0" />}
      <span className="text-sm font-medium text-foreground truncate">{name}</span>
    </span>
  )
}

// ─── Game List (Step 2) ────────────────────────────────────────────────────────

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
      style={{ height: 'calc(100vh - 26rem)', scrollbarGutter: 'stable' }}
    >
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map(vRow => {
          const game = games[vRow.index]
          return (
            <div
              key={game.id}
              style={{ position: 'absolute', top: vRow.start, left: 0, right: 0, height: ROW_HEIGHT }}
            >
              <GameRow game={game} checked={selected.has(game.id)} onToggle={() => onToggle(game.id)} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

const CLASSIFICATION_COLORS: Record<string, string> = {
  FBS: 'tag-green',
  FCS: 'tag-amber',
  DII: 'tag-teal',
  DIII: 'tag-purple',
}

function tagColor(v: string) { return CLASSIFICATION_COLORS[v] ?? 'tag-blue' }

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

function GameRow({ game, checked, onToggle }: { game: CfbdGame; checked: boolean; onToggle: () => void }) {
  const matchup = game.neutral_site ? `${game.away_team} vs ${game.home_team}` : `${game.away_team} at ${game.home_team}`
  const title = game.bowl_name ? `${game.bowl_name}, ${matchup}` : matchup
  const dateTime = formatGameTime(game.start_date, game.start_time_tbd)
  const homeCls = game.home_classification?.toUpperCase() ?? null
  const awayCls = game.away_classification?.toUpperCase() ?? null
  const clsTags: string[] = homeCls === awayCls ? (homeCls ? [homeCls] : []) : [awayCls, homeCls].filter(Boolean) as string[]
  const sameConference = game.home_conference && game.away_conference && game.home_conference === game.away_conference
  const conferencePillLabel = sameConference ? game.home_conference! : 'Out of Conference'
  const status = gameStatus(game)

  return (
    <label className="flex items-center gap-3 rounded-lg px-4 py-3 hover:bg-white/5 transition-colors cursor-pointer h-full">
      <input type="checkbox" checked={checked} onChange={onToggle} className="sr-only peer" />
      <span
        aria-hidden
        className={`size-4 shrink-0 rounded-[5px] border flex items-center justify-center transition-colors ${checked ? 'bg-primary border-primary' : 'bg-white/[0.03] border-border'}`}
      >
        {checked && <Check className="size-3 text-primary-foreground" strokeWidth={3} />}
      </span>
      <div className={STATUS_DOT[status]} title={status === 'final' ? 'Final' : status === 'live' ? 'In Progress' : 'Upcoming'} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-foreground truncate">{title}</p>
          <div className="flex items-center gap-1 shrink-0">
            {clsTags.map(tag => (
              <span key={tag} className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${tagColor(tag)}`}>{tag}</span>
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
    </label>
  )
}
