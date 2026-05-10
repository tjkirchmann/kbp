import { useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Loader2 } from 'lucide-react'
import { useCreatePool, useCfbdGames, useAddPoolGames, type CfbdGame } from '@/services/useAdminPools'

type Step = 'step1' | 'step2'

const ROW_HEIGHT = 60

export default function PoolCreate() {
  const navigate = useNavigate()
  const createPool = useCreatePool()
  const addGames = useAddPoolGames()

  const [step, setStep] = useState<Step>('step1')
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

  const finderGames = useMemo(() => cfbdGames.filter(g => {
    if (finderSeasonType !== 'all' && g.season_type !== finderSeasonType) return false
    if (finderClass !== 'all' && g.home_classification !== finderClass && g.away_classification !== finderClass) return false
    return true
  }), [cfbdGames, finderSeasonType, finderClass])

  const selectedGames = useMemo(() => cfbdGames.filter(g => {
    if (!selected.has(g.id)) return false
    if (selectedSeasonType !== 'all' && g.season_type !== selectedSeasonType) return false
    if (selectedClass !== 'all' && g.home_classification !== selectedClass && g.away_classification !== selectedClass) return false
    return true
  }), [cfbdGames, selected, selectedSeasonType, selectedClass])

  async function handleCreatePool() {
    const pool = await createPool.mutateAsync({ name: name.trim(), season_year: seasonYear })
    setNewPoolId(pool.id)
    setNewPoolYear(pool.season_year)
    setStep('step2')
  }

  async function handleAddGames() {
    if (!newPoolId || selected.size === 0) return
    await addGames.mutateAsync({ poolId: newPoolId, cfbdGameIds: [...selected] })
    navigate('/admin/pools')
  }

  function toggleGame(id: number) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  if (step === 'step1') {
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
              onChange={e => setName(e.target.value)}
              placeholder="e.g. 2025 Kirchmann Bowl Pool"
              className="w-full rounded-lg bg-muted border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Season year</label>
            <input
              type="number"
              value={seasonYear}
              onChange={e => setSeasonYear(Number(e.target.value))}
              className="w-full rounded-lg bg-muted border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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

  const isFinder = step2Tab === 'finder'
  const activeSeasonType = isFinder ? finderSeasonType : selectedSeasonType
  const setActiveSeasonType = isFinder ? setFinderSeasonType : setSelectedSeasonType
  const activeClass = isFinder ? finderClass : selectedClass
  const setActiveClass = isFinder ? setFinderClass : setSelectedClass
  const activeGames = isFinder ? finderGames : selectedGames

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Step 2 of 2 — Select games from {newPoolYear}</p>

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
            <label className="text-xs text-muted-foreground">Season</label>
            <select
              value={activeSeasonType}
              onChange={e => setActiveSeasonType(e.target.value)}
              className="rounded-lg bg-muted border border-border px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="all">All</option>
              {seasonTypeOptions.map(v => (
                <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Classification</label>
            <select
              value={activeClass}
              onChange={e => setActiveClass(e.target.value)}
              className="rounded-lg bg-muted border border-border px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
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
          Add {selected.size > 0 ? `${selected.size} ` : ''}Game{selected.size !== 1 ? 's' : ''}
        </button>
        <button onClick={() => navigate('/admin/pools')} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}

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
      <input type="checkbox" checked={checked} onChange={onToggle} className="rounded border-border accent-primary size-4 shrink-0" />
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
