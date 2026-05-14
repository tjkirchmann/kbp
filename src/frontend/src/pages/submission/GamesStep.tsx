import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { usePoolGames, useSubmissionPicks, useSavePick, type PoolGame, type TeamMeta } from '@/services/useSubmission'

interface Props {
  poolId: number
  submissionId: number
  currentIndex: number
  onIndexChange: (i: number) => void
}

interface Pick { winner: string; margin: number }

function teamBg(meta: TeamMeta | null): string {
  return meta?.color
    ? `linear-gradient(160deg, ${meta.color}cc 0%, #0d0f13 100%)`
    : 'linear-gradient(160deg, #1a1d24 0%, #0d0f13 100%)'
}

function gameTitle(game: PoolGame): string {
  const matchup = game.neutral_site
    ? `${game.away_team} vs. ${game.home_team}`
    : `${game.away_team} at ${game.home_team}`
  return game.bowl_name ? `${game.bowl_name}, ${matchup}` : matchup
}

function PlaceholderSections() {
  return (
    <div className="p-3 space-y-3 bg-black/30 flex-1 overflow-hidden">
      <div>
        <p className="text-[10px] uppercase tracking-wide text-white/40 mb-1">Season Summary</p>
        <div className="h-2 bg-white/10 rounded animate-pulse" />
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <p className="text-[10px] uppercase tracking-wide text-white/40 mb-1">Offense</p>
          <div className="h-2 bg-white/10 rounded animate-pulse" />
        </div>
        <div className="flex-1">
          <p className="text-[10px] uppercase tracking-wide text-white/40 mb-1">Defense</p>
          <div className="h-2 bg-white/10 rounded animate-pulse" />
        </div>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wide text-white/40 mb-1.5">Impact Players</p>
        <div className="space-y-1.5">
          {[0, 1, 2].map(i => (
            <div key={i} className="flex items-center gap-2">
              <div className="size-4 rounded-full bg-white/10 animate-pulse shrink-0" />
              <div className="h-2 bg-white/10 rounded animate-pulse flex-1" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

interface TeamCardProps {
  team: string
  meta: TeamMeta | null
  isSelected: boolean
  pick: Pick | null
  onSelect: () => void
  onMarginChange: (margin: number) => void
}

function TeamCard({ team, meta, isSelected, pick, onSelect, onMarginChange }: TeamCardProps) {
  const logo = meta?.logos?.[0] ?? null

  function handleMarginInput(e: React.ChangeEvent<HTMLInputElement>) {
    const val = parseInt(e.target.value, 10)
    if (!isNaN(val) && val >= 0) onMarginChange(val)
  }

  return (
    <div
      className="flex-1 relative overflow-hidden rounded-xl flex flex-col cursor-pointer select-none"
      style={{ background: teamBg(meta) }}
      onClick={onSelect}
    >
      {/* Top ~33%: logo ring pinned to top-center, name below, margin controls when selected */}
      <div className="h-[33%] shrink-0 flex flex-col items-center gap-1 pt-3">
        {/* Logo ring — always at top, no layout shift on select */}
        <div
          className={`rounded-full p-1.5 border-2 transition-all ${
            isSelected ? 'border-white/80 brightness-125' : 'border-white/30'
          }`}
          style={isSelected ? { filter: 'brightness(1.4)' } : undefined}
        >
          {logo ? (
            <img src={logo} alt={team} className="h-10 w-10 object-contain drop-shadow-lg" draggable={false} />
          ) : (
            <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center text-white/40 text-xs font-bold">
              {team.slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>

        {/* Team name */}
        <p className="text-sm font-bold text-white text-center px-2 leading-tight">{team}</p>

        {/* Inline margin controls — only when selected */}
        {isSelected && (
          <div className="flex flex-col items-center gap-1" onClick={e => e.stopPropagation()}>
            <input
              type="number"
              min={0}
              value={pick?.margin ?? 0}
              onChange={handleMarginInput}
              className="w-12 text-center bg-white/10 border border-white/20 rounded text-white text-sm py-0.5 focus:outline-none focus:border-white/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              onClick={e => e.stopPropagation()}
            />
            <div className="flex gap-1.5">
              {[1, 3, 7].map(n => (
                <button
                  key={n}
                  onClick={e => { e.stopPropagation(); onMarginChange((pick?.margin ?? 0) + n) }}
                  className="px-2 py-0.5 rounded-full bg-white/15 text-white text-xs font-medium hover:bg-white/30 transition-colors"
                >
                  +{n}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom ~67%: placeholder sections */}
      <PlaceholderSections />

      {/* Non-selected but has pick: margin badge */}
      {!isSelected && pick && (
        <div className="absolute top-2 right-2 bg-black/60 text-white text-xs font-bold px-2 py-0.5 rounded-full">
          Win by {pick.margin}
        </div>
      )}
    </div>
  )
}

export default function GamesStep({ poolId, submissionId, currentIndex, onIndexChange }: Props) {
  const { data: games = [] } = usePoolGames(poolId)
  const { data: existingPicks = [] } = useSubmissionPicks(submissionId)
  const savePick = useSavePick(submissionId)

  const [picks, setPicks] = useState<Record<number, Pick>>({})
  const [savedFlash, setSavedFlash] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const picksHydrated = useRef(false)

  useEffect(() => {
    if (existingPicks.length > 0 && !picksHydrated.current) {
      picksHydrated.current = true
      const init: Record<number, Pick> = {}
      for (const p of existingPicks) {
        init[p.pool_game_id] = { winner: p.picked_winner, margin: p.picked_margin }
      }
      setPicks(init)
    }
  }, [existingPicks])

  const game = games[currentIndex]
  if (!game) return null

  const currentPick = picks[game.id] ?? null

  function setPick(winner: string, margin: number) {
    setPicks(prev => ({ ...prev, [game.id]: { winner, margin } }))
    scheduleAutosave(game.id, winner, margin)
  }

  function scheduleAutosave(poolGameId: number, winner: string, margin: number) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      await savePick.mutateAsync({ poolGameId, pickedWinner: winner, pickedMargin: margin })
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2000)
    }, 1500)
  }

  function handleSelect(team: string) {
    if (currentPick?.winner === team) {
      setPicks(prev => {
        const next = { ...prev }
        delete next[game.id]
        return next
      })
    } else {
      const margin = currentPick?.margin ?? 0
      setPick(team, margin)
    }
  }

  function handleMarginChange(margin: number) {
    if (!currentPick) return
    setPick(currentPick.winner, margin)
  }

  const isFirst = currentIndex === 0
  const isLast = currentIndex === games.length - 1

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Title */}
      <p className="text-sm text-white/80 font-medium text-right leading-tight shrink-0">
        {gameTitle(game)}
      </p>

      {/* Cards */}
      <div className="flex gap-3 flex-1 min-h-0">
        <TeamCard
          team={game.away_team}
          meta={game.away_team_meta}
          isSelected={currentPick?.winner === game.away_team}
          pick={currentPick?.winner === game.away_team ? currentPick : null}
          onSelect={() => handleSelect(game.away_team)}
          onMarginChange={handleMarginChange}
        />
        <TeamCard
          team={game.home_team}
          meta={game.home_team_meta}
          isSelected={currentPick?.winner === game.home_team}
          pick={currentPick?.winner === game.home_team ? currentPick : null}
          onSelect={() => handleSelect(game.home_team)}
          onMarginChange={handleMarginChange}
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between shrink-0 h-10">
        <button
          onClick={() => onIndexChange(currentIndex - 1)}
          disabled={isFirst}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-default"
        >
          <ChevronLeft className="size-4" />
          Prev
        </button>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Game {currentIndex + 1} of {games.length}</span>
          {savedFlash && (
            <span className="text-success animate-pulse">· Saved ✓</span>
          )}
        </div>

        <button
          onClick={() => onIndexChange(currentIndex + 1)}
          disabled={isLast}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-default"
        >
          {isLast ? 'Done' : 'Next'}
          {!isLast && <ChevronRight className="size-4" />}
        </button>
      </div>
    </div>
  )
}
