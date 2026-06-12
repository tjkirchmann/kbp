import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { useSyncStatus } from '@/services/useAdminSync'
import { useEntityTagsBatch } from '@/services/useTags'
import { prettyTaskName } from './syncUtils'
import SyncJobCard from './SyncJobCard'
import SyncSidePanel from './SyncSidePanel'

export default function SyncPanel() {
  const { data: jobs, isLoading, error } = useSyncStatus()
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState('all')

  const taskNames = useMemo(() => (jobs ?? []).map(j => j.task_name), [jobs])
  const tagsByTask = useEntityTagsBatch('sync_task', taskNames)

  // Union of every tag applied across all tasks, for the filter dropdown.
  const allTags = useMemo(() => {
    const set = new Set<string>()
    Object.values(tagsByTask).forEach(tags => tags.forEach(t => set.add(t.name)))
    return [...set].sort()
  }, [tagsByTask])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (jobs ?? []).filter(job => {
      if (q && !prettyTaskName(job.task_name).toLowerCase().includes(q)
          && !job.task_name.toLowerCase().includes(q)) return false
      if (tagFilter !== 'all' && !(tagsByTask[job.task_name] ?? []).some(t => t.name === tagFilter)) return false
      return true
    })
  }, [jobs, search, tagFilter, tagsByTask])

  let cards: React.ReactNode
  if (isLoading) cards = <p className="text-muted-foreground text-sm">Loading...</p>
  else if (error) cards = <p className="text-destructive text-sm">Failed to load sync status.</p>
  else if (!jobs?.length) cards = <p className="text-muted-foreground text-sm">No sync jobs registered.</p>
  else if (!filtered.length) cards = <p className="text-muted-foreground text-sm py-2">No tasks match the current filters.</p>
  else cards = filtered.map(job => <SyncJobCard key={job.task_name} job={job} />)

  return (
    <div className="flex gap-5 h-full min-h-0 items-stretch">
      <div className="flex flex-col gap-3 min-w-0 flex-1 min-h-0">
        {/* Filter toolbar — mirrors the Teams list controls */}
        {!!jobs?.length && (
          <div className="shrink-0 flex items-center gap-2">
            <input
              type="text"
              placeholder="Search tasks…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-border/20 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
            <select
              value={tagFilter}
              onChange={e => setTagFilter(e.target.value)}
              className="rounded-lg bg-white/[0.03] border border-border/20 px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
            >
              <option value="all">All tags</option>
              {allTags.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <button
              onClick={() => { setSearch(''); setTagFilter('all') }}
              disabled={!search && tagFilter === 'all'}
              className="flex items-center gap-1 rounded-lg bg-white/[0.03] border border-border/20 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors disabled:opacity-40 disabled:hover:text-muted-foreground disabled:hover:bg-white/[0.03]"
            >
              <X className="size-3.5" />
              Reset
            </button>
          </div>
        )}

        <div className="flex flex-col gap-3 min-w-0 overflow-y-auto no-scrollbar">{cards}</div>
      </div>
      <SyncSidePanel />
    </div>
  )
}
