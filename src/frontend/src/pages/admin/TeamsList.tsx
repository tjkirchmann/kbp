import { useState, useMemo } from 'react'
import { RefreshCw, Users, Loader2 } from 'lucide-react'
import { useAdminTeams, useSyncTeams, type CfbdTeam } from '@/services/useAdminTeams'
import AdminTableToolbar from '@/components/admin/AdminTableToolbar'
import AdminVirtualTable, { type AdminTableColumn } from '@/components/admin/AdminVirtualTable'

const ROW_HEIGHT = 44

const COLUMNS: AdminTableColumn[] = [
  { key: 'school', header: 'School', className: 'flex-[3]' },
  { key: 'abbr', header: 'Abbr', className: 'flex-[1]' },
  { key: 'conf', header: 'Conference', className: 'flex-[2]' },
  { key: 'class', header: 'Class', className: 'flex-[1]' },
  { key: 'colors', header: 'Colors', className: 'flex-[1]' },
]

function ColorSwatch({ hex }: { hex: string | null }) {
  if (!hex)
    return <div className="size-3.5 rounded-full bg-muted border border-border/40 shrink-0" />
  const color = hex.startsWith('#') ? hex : `#${hex}`
  return (
    <div
      className="size-3.5 rounded-full border border-border/30 shrink-0"
      style={{ background: color }}
    />
  )
}

function TeamRow({ team }: { team: CfbdTeam }) {
  const logo = team.logos?.[0] ?? null
  return (
    <div className="flex items-center h-full border-t border-border/20 hover:bg-[rgba(26,30,42,0.4)] transition-colors">
      <div className="flex items-center gap-3 px-5 flex-[3] min-w-0">
        <div className="size-6 shrink-0 flex items-center justify-center">
          {logo ? (
            <img src={logo} alt={team.school} className="size-6 object-contain" />
          ) : (
            <div className="size-6 rounded bg-muted/40" />
          )}
        </div>
        <div className="min-w-0">
          <span className="text-sm font-medium text-foreground truncate block">{team.school}</span>
          {team.mascot && (
            <span className="text-xs text-muted-foreground truncate block">{team.mascot}</span>
          )}
        </div>
      </div>
      <div className="px-5 flex-[1] text-xs text-muted-foreground font-mono">
        {team.abbreviation ?? '—'}
      </div>
      <div className="px-5 flex-[2] text-xs text-muted-foreground truncate">
        {[team.conference, team.division].filter(Boolean).join(' · ') || '—'}
      </div>
      <div className="px-5 flex-[1]">
        {team.classification ? (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted/60 text-muted-foreground">
            {team.classification.toUpperCase()}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>
      <div className="px-5 flex-[1]">
        <div className="flex items-center gap-1">
          <ColorSwatch hex={team.color} />
          <ColorSwatch hex={team.alt_color} />
        </div>
      </div>
    </div>
  )
}

export default function TeamsList() {
  const { data: teams = [], isLoading } = useAdminTeams()
  const syncTeams = useSyncTeams()
  const [search, setSearch] = useState('')
  const [confFilter, setConfFilter] = useState('all')
  const [classFilter, setClassFilter] = useState('fbs')
  const [logLine, setLogLine] = useState<{ text: string; ok: boolean } | null>(null)

  const conferences = useMemo(() => {
    return [...new Set(teams.map((t) => t.conference).filter(Boolean) as string[])].sort()
  }, [teams])

  const classifications = useMemo(() => {
    return [...new Set(teams.map((t) => t.classification).filter(Boolean) as string[])].sort()
  }, [teams])

  const filtered = useMemo(() => {
    return teams
      .filter((t) => {
        if (search && !t.school.toLowerCase().includes(search.toLowerCase())) return false
        if (confFilter !== 'all' && t.conference !== confFilter) return false
        if (classFilter !== 'all' && t.classification !== classFilter) return false
        return true
      })
      .sort(
        (a, b) =>
          (a.conference ?? '').localeCompare(b.conference ?? '') ||
          a.school.localeCompare(b.school),
      )
  }, [teams, search, confFilter, classFilter])

  const lastSynced = teams[0]?.last_synced_at
    ? new Date(teams[0].last_synced_at).toLocaleString()
    : null

  const isFiltered = search !== '' || confFilter !== 'all' || classFilter !== 'all'

  async function handleSync() {
    try {
      const result = await syncTeams.mutateAsync()
      setLogLine({
        text: `Synced ${result.synced} teams at ${new Date(result.last_synced_at).toLocaleString()}`,
        ok: true,
      })
    } catch {
      setLogLine({ text: 'Sync failed — check backend logs', ok: false })
    }
    setTimeout(() => setLogLine(null), 10_000)
  }

  return (
    <div className="h-full flex flex-col gap-3">
      <AdminTableToolbar
        count={filtered.length}
        total={teams.length}
        noun="team"
        countSuffix={lastSynced ? `· synced ${lastSynced}` : undefined}
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search teams…"
      >
        <select
          value={confFilter}
          onChange={(e) => setConfFilter(e.target.value)}
          className="rounded-lg bg-white/[0.03] border border-border/20 px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
        >
          <option value="all">All conferences</option>
          {conferences.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          className="rounded-lg bg-white/[0.03] border border-border/20 px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
        >
          <option value="all">All classes</option>
          {classifications.map((c) => (
            <option key={c} value={c}>
              {c.toUpperCase()}
            </option>
          ))}
        </select>
        <button
          onClick={handleSync}
          disabled={syncTeams.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/15 text-primary text-sm font-medium hover:bg-primary/25 transition-colors disabled:opacity-40"
        >
          {syncTeams.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Sync Now
        </button>
      </AdminTableToolbar>

      {logLine && (
        <div
          className={`shrink-0 text-xs px-3 py-2 rounded-lg font-mono ${logLine.ok ? 'bg-green-500/10 text-green-400' : 'bg-destructive/10 text-destructive'}`}
        >
          {logLine.text}
        </div>
      )}

      <AdminVirtualTable
        columns={COLUMNS}
        rows={filtered}
        rowKey={(t) => t.id}
        rowHeight={ROW_HEIGHT}
        isLoading={isLoading}
        isFiltered={isFiltered}
        renderRow={(team) => <TeamRow team={team} />}
        emptyState={
          <div className="flex flex-col items-center justify-center flex-1 gap-3 text-muted-foreground">
            <Users className="size-8 opacity-30" />
            <p className="text-sm">No teams synced. Click Sync Now to pull from CFBD.</p>
          </div>
        }
        noMatchState={
          <p className="text-sm text-muted-foreground py-4">No teams match the current filters.</p>
        }
      />
    </div>
  )
}
