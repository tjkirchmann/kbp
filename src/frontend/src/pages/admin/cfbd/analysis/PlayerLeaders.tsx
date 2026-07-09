import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { usePlayerLeaders } from '@/services/cfbd/useCfbdAnalytics'

const CATEGORIES = [
  { key: 'passing', label: 'Passing' },
  { key: 'rushing', label: 'Rushing' },
  { key: 'receiving', label: 'Receiving' },
  { key: 'tackles', label: 'Tackles' },
  { key: 'interceptions', label: 'INT' },
]

interface Props {
  season: number
}

export default function PlayerLeaders({ season }: Props) {
  const [catIdx, setCatIdx] = useState(0)
  const category = CATEGORIES[catIdx]?.key ?? 'passing'
  const { data } = usePlayerLeaders(season, category)

  const prev = useCallback(() => {
    setCatIdx((i) => (i - 1 + CATEGORIES.length) % CATEGORIES.length)
  }, [])

  const next = useCallback(() => {
    setCatIdx((i) => (i + 1) % CATEGORIES.length)
  }, [])

  // Auto-advance every 5 seconds
  useEffect(() => {
    const timer = setInterval(next, 5000)
    return () => clearInterval(timer)
  }, [next])

  return (
    <div className="glass-panel rounded-xl p-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <button
            onClick={prev}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <h3 className="text-xs font-semibold text-foreground">
            {CATEGORIES[catIdx]?.label} Leaders
          </h3>
          <button
            onClick={next}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {catIdx + 1}/{CATEGORIES.length}
        </span>
      </div>

      {/* Category tabs */}
      <div className="flex gap-1 mb-2">
        {CATEGORIES.map((cat, i) => (
          <button
            key={cat.key}
            onClick={() => setCatIdx(i)}
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
              i === catIdx
                ? 'bg-primary/15 text-primary border border-primary/20'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Leaders list */}
      <div className="flex gap-3">
        {data?.leaders.slice(0, 5).map((p, i) => (
          <div
            key={`${p.player}-${i}`}
            className="flex-1 flex items-center gap-2 rounded-lg bg-white/[0.03] px-2 py-2"
          >
            <span className="text-[10px] font-semibold text-muted-foreground tabular-nums w-4">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-foreground truncate">
                {p.player}
              </p>
              <p className="text-[10px] text-muted-foreground truncate">
                {p.team}
              </p>
            </div>
            <span className="text-xs font-semibold text-primary tabular-nums shrink-0">
              {p.stat_value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
