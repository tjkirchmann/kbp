import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { StandingsRow } from '@/services/cfbd/useCfbdAnalytics'

const CONFERENCE_LABELS: Record<string, string> = {
  SEC: 'SEC',
  Big_Ten: 'Big Ten',
  ACC: 'ACC',
  Big_12: 'Big 12',
  Mountain_West: 'Mountain West',
  AAC: 'AAC',
  Sun_Belt: 'Sun Belt',
  MAC: 'MAC',
  Conference_USA: 'Conference USA',
  Pac_12: 'Pac-12',
  Independents: 'Independents',
}

interface Props {
  standings: Record<string, StandingsRow[]>
}

export default function ConferenceStandings({ standings }: Props) {
  const entries = Object.entries(standings).filter(([, rows]) => rows.length > 0)
  const [index, setIndex] = useState(0)

  const prev = useCallback(() => {
    setIndex((i) => (i - 1 + entries.length) % entries.length)
  }, [entries.length])

  const next = useCallback(() => {
    setIndex((i) => (i + 1) % entries.length)
  }, [entries.length])

  // Auto-advance every 6 seconds
  useEffect(() => {
    if (entries.length <= 1) return
    const timer = setInterval(next, 6000)
    return () => clearInterval(timer)
  }, [next, entries.length])

  if (entries.length === 0) return null

  const [confKey, rows] = entries[index]
  const label = CONFERENCE_LABELS[confKey] || confKey

  return (
    <div className="glass-panel rounded-xl p-3 flex flex-col">
      {/* Header with nav arrows */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <button
            onClick={prev}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <h3 className="text-xs font-semibold text-foreground">{label}</h3>
          <button
            onClick={next}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {index + 1}/{entries.length}
        </span>
      </div>

      {/* Table header */}
      <div className="flex items-center gap-2 text-[10px] font-medium text-muted-foreground px-2 pb-1 border-b border-border/20">
        <span className="flex-1">Team</span>
        <span className="w-10 text-right">Conf</span>
        <span className="w-10 text-right">Ovr</span>
      </div>

      {/* Rows */}
      <div className="flex flex-col">
        {rows.slice(0, 10).map((row) => (
          <div
            key={row.team}
            className="flex items-center gap-2 rounded px-2 py-1 hover:bg-white/[0.04] transition-colors"
          >
            {row.logo ? (
              <img src={row.logo} alt={row.team} className="size-4 rounded object-contain" />
            ) : (
              <div className="size-4 rounded bg-white/10" />
            )}
            <span className="flex-1 text-xs text-foreground truncate">{row.team}</span>
            <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
              {row.conf_wins}-{row.conf_losses}
            </span>
            <span className="w-10 text-right text-xs tabular-nums text-foreground font-medium">
              {row.overall_wins}-{row.overall_losses}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
