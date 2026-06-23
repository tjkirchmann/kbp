import { useState } from 'react'
import { Trophy, TrendingUp, TrendingDown } from 'lucide-react'
import Header from '@/components/Header'
import { cn } from '@/lib/utils'

const ALL_TIME_BEST = [
  { rank: '1', name: "Connie '08", ppg: 5.23 },
  { rank: '2t', name: "Ty K '20", ppg: 4.9 },
  { rank: '2t', name: "Roll Todd '20", ppg: 4.9 },
  { rank: '4', name: "Grapefruit '20", ppg: 4.88 },
  { rank: '5', name: "Caryl '08", ppg: 4.83 },
  { rank: '6', name: "Chris '13", ppg: 4.8 },
  { rank: '7', name: "Cab '08", ppg: 4.77 },
  { rank: '8', name: "Paul P '20", ppg: 4.71 },
  { rank: '9', name: "Joe and Evan S '12", ppg: 4.66 },
  { rank: '10', name: "Renee B '20", ppg: 4.64 },
  { rank: '11', name: "Jim '08", ppg: 4.63 },
  { rank: '12', name: "Reynolds '16", ppg: 4.6 },
  { rank: '13t', name: "Jane C '16", ppg: 4.57 },
  { rank: '13t', name: "Kelsey '08", ppg: 4.57 },
  { rank: '15', name: "John W '20", ppg: 4.55 },
  { rank: '16', name: "Tristan '21", ppg: 4.52 },
  { rank: '17', name: "DanMc '12", ppg: 4.51 },
  { rank: '18t', name: "Fred '08", ppg: 4.5 },
  { rank: '18t', name: "Schmal '03", ppg: 4.5 },
  { rank: '20', name: "Fred '13", ppg: 4.49 },
]

const ALL_TIME_WORST = [
  { rank: '1', name: "Joe Canada '21", ppg: 1.42 },
  { rank: '2', name: "Binky '16", ppg: 1.64 },
  { rank: '3', name: "Fred K '25", ppg: 1.76 },
  { rank: '4', name: "Zinn '25", ppg: 1.79 },
  { rank: '5', name: "Jake '06", ppg: 1.84 },
  { rank: '6', name: "Striker '22", ppg: 1.92 },
  { rank: '7', name: "Dan K '22", ppg: 1.95 },
  { rank: '8t', name: "Allison '14", ppg: 1.97 },
  { rank: '8t', name: "Issac K '25", ppg: 1.97 },
  { rank: '10', name: "Josh '14", ppg: 2.03 },
  { rank: '11t', name: "Spencer '25", ppg: 2.06 },
  { rank: '11t', name: "Gretchen '07", ppg: 2.06 },
  { rank: '13', name: "Binky '18", ppg: 2.07 },
  { rank: '14', name: "Gretchen '15", ppg: 2.08 },
  { rank: '15', name: "Aiden M '25", ppg: 2.09 },
  { rank: '16', name: "Tiny Tim '22", ppg: 2.1 },
  { rank: '17', name: "Rylan P '25", ppg: 2.13 },
  { rank: '18', name: "Mike M '21", ppg: 2.14 },
  { rank: '19t', name: "Binky '15", ppg: 2.15 },
  { rank: '19t', name: "Sandra S '22", ppg: 2.15 },
]

const CHAMPIONS = [
  { year: 2025, champion: 'Thomas N' },
  { year: 2024, champion: 'Tristan' },
  { year: 2023, champion: 'Dan K' },
  { year: 2022, champion: 'Dirk P' },
  { year: 2021, champion: 'Tristan' },
  { year: 2020, champion: 'Ty K' },
  { year: 2019, champion: 'Kelsey P' },
  { year: 2018, champion: 'David P' },
  { year: 2017, champion: 'Jake N' },
  { year: 2016, champion: 'Reynolds S' },
  { year: 2015, champion: 'Ray B' },
  { year: 2014, champion: 'Courtney K' },
  { year: 2013, champion: 'Chris M' },
  { year: 2012, champion: 'Joe and Evan Schak' },
  { year: 2011, champion: 'Roitman' },
  { year: 2010, champion: 'Joe Canada' },
  { year: 2009, champion: 'No Mercy' },
  { year: 2008, champion: 'Connie K' },
  { year: 2007, champion: 'Connie K' },
  { year: 2006, champion: 'John W' },
  { year: 2005, champion: 'John W' },
  { year: 2004, champion: 'Ty' },
  { year: 2003, champion: 'Schmal (vacated)*', vacated: true },
  { year: 2002, champion: 'UNKNOWN' },
  { year: 2001, champion: 'John W' },
  { year: 2000, champion: 'Courtney K' },
]

type Tab = 'best' | 'worst' | 'champions'

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'best', label: 'All Time Best', icon: <TrendingUp className="size-4" /> },
  { id: 'worst', label: 'All Time Worst', icon: <TrendingDown className="size-4" /> },
  { id: 'champions', label: 'KBP Champion List', icon: <Trophy className="size-4" /> },
]

function PPGRow({
  entry,
  index,
  variant,
}: {
  entry: { rank: string; name: string; ppg: number }
  index: number
  variant: 'best' | 'worst'
}) {
  const isFirst = entry.rank === '1'
  return (
    <div
      className={cn(
        'flex items-center gap-4 px-5 py-2.5 text-sm',
        index !== 0 && 'border-t border-border/20',
      )}
    >
      <span
        className={cn(
          'font-mono w-8 shrink-0 text-xs',
          isFirst ? 'text-warning font-semibold' : 'text-muted-foreground',
        )}
      >
        {entry.rank}.
      </span>
      <span
        className={cn('flex-1 font-medium', isFirst ? 'text-foreground' : 'text-foreground/90')}
      >
        {entry.name}
      </span>
      <span
        className={cn(
          'font-mono text-xs font-semibold tabular-nums',
          variant === 'best'
            ? isFirst
              ? 'text-success'
              : 'text-primary/80'
            : isFirst
              ? 'text-destructive'
              : 'text-muted-foreground',
        )}
      >
        {entry.ppg.toFixed(2)}
      </span>
    </div>
  )
}

function ChampionRow({
  entry,
  index,
}: {
  entry: { year: number; champion: string; vacated?: boolean }
  index: number
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-4 px-5 py-2.5 text-sm',
        index !== 0 && 'border-t border-border/20',
      )}
    >
      <span className="font-mono text-xs text-muted-foreground w-10 shrink-0">{entry.year}</span>
      <span
        className={cn(
          'flex-1 font-medium',
          entry.vacated ? 'text-muted-foreground line-through' : 'text-foreground/90',
        )}
      >
        {entry.champion}
      </span>
      {entry.year === 2025 && (
        <span className="px-2 py-0.5 rounded-full text-xs font-medium tag-amber">Current</span>
      )}
    </div>
  )
}

export default function RecordBook() {
  const [tab, setTab] = useState<Tab>('best')

  return (
    <div className="min-h-screen">
      <Header />

      <main className="pt-24 pb-12 px-4 flex flex-col items-center gap-4 max-w-4xl mx-auto">
        {/* Page header */}
        <div className="glass-panel rounded-2xl p-8 w-full flex flex-col gap-4">
          <div className="flex items-center gap-6">
            <div className="shrink-0 flex flex-col gap-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                All Time List
              </p>
              <p className="text-sm text-muted-foreground">
                Points per game, normalized for the championship game
              </p>
            </div>
            <div className="hatch flex-1 h-10 rounded" />
          </div>

          {/* Tabs */}
          <div className="flex gap-1 flex-wrap">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                  tab === t.id
                    ? 'bg-primary/15 text-primary border border-primary/30'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/5 border border-transparent',
                )}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="glass-panel rounded-2xl overflow-hidden w-full">
          {tab === 'best' && (
            <>
              <div className="flex items-center gap-3 px-5 py-3 border-b border-border/40">
                <TrendingUp className="size-4 text-success" />
                <h2 className="text-sm font-semibold text-foreground">All Time Best</h2>
                <span className="text-xs text-muted-foreground ml-auto">PPG</span>
              </div>
              {ALL_TIME_BEST.map((entry, i) => (
                <PPGRow
                  key={`${entry.name}-${entry.rank}`}
                  entry={entry}
                  index={i}
                  variant="best"
                />
              ))}
            </>
          )}

          {tab === 'worst' && (
            <>
              <div className="flex items-center gap-3 px-5 py-3 border-b border-border/40">
                <TrendingDown className="size-4 text-destructive" />
                <h2 className="text-sm font-semibold text-foreground">All Time Worst</h2>
                <span className="text-xs text-muted-foreground ml-auto">PPG</span>
              </div>
              {ALL_TIME_WORST.map((entry, i) => (
                <PPGRow
                  key={`${entry.name}-${entry.rank}`}
                  entry={entry}
                  index={i}
                  variant="worst"
                />
              ))}
            </>
          )}

          {tab === 'champions' && (
            <>
              <div className="flex items-center gap-3 px-5 py-3 border-b border-border/40">
                <Trophy className="size-4 text-warning" />
                <h2 className="text-sm font-semibold text-foreground">KBP Champion List</h2>
              </div>
              {CHAMPIONS.map((entry, i) => (
                <ChampionRow key={entry.year} entry={entry} index={i} />
              ))}
              <p className="px-5 py-3 text-xs text-muted-foreground border-t border-border/20">
                * 2003 vacated. Pre-2000 records lost in the St. Louis fire.
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
