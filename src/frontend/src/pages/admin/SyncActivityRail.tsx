import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  useRecentRuns,
  useUpcomingRuns,
  useRecentLiveness,
  useUpcomingLiveness,
  RECENT_KEY,
  UPCOMING_KEY,
  UPCOMING_WINDOW_MS,
} from '@/services/useAdminSync'
import type { GlobalRun, UpcomingRun } from '@/services/useAdminSync'
import { RecentRow, UpcomingRow } from './SyncActivityRows'

type InfiniteData<T> = { pages: T[][]; pageParams: unknown[] }

export default function SyncActivityRail() {
  const recent = useRecentRuns()
  const upcoming = useUpcomingRuns()
  const qc = useQueryClient()

  // Targeted liveness: merge only new recent rows (5s); refresh upcoming's first page
  // slowly (60s). Neither refetches loaded history/future, so traffic stays flat.
  useRecentLiveness(5000)
  useUpcomingLiveness(60000)

  // Flattened sources. Dedupe past by id (refetch can reorder the page-0/1 boundary).
  const seen = new Set<number>()
  const pastRuns: GlobalRun[] = []
  for (const r of recent.data?.pages.flat() ?? []) {
    if (!seen.has(r.id)) {
      seen.add(r.id)
      pastRuns.push(r)
    }
  }
  // Dedupe future by composite key: the 60s upcoming refresh rewrites page 0, so a
  // fire can briefly exist on both page 0 and a later page — duplicate React keys
  // there leave rows rendering with a stale/blank index.
  // Only show fires within the window ahead of now; drop the rest of the last
  // (partial) page so nothing beyond +4h leaks in.
  const futureCutoff = Date.now() + UPCOMING_WINDOW_MS
  const seenFuture = new Set<string>()
  const futureRuns: UpcomingRun[] = []
  for (const r of upcoming.data?.pages.flat() ?? []) {
    if (new Date(r.next_run_at).getTime() > futureCutoff) continue
    const k = `${r.task_name}:${r.next_run_at}`
    if (!seenFuture.has(k)) {
      seenFuture.add(k)
      futureRuns.push(r)
    }
  }

  const scrollRef = useRef<HTMLElement>(null)
  const nowRef = useRef<HTMLDivElement>(null)
  const topSentinelRef = useRef<HTMLDivElement>(null)
  const bottomSentinelRef = useRef<HTMLDivElement>(null)

  // 1s tick — pure text update for relative times. Never a layout/effect dependency.
  const [tickNow, setTickNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setTickNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // Scroll up (toward future) -> load more upcoming. 300px margin so scrollTop is never
  // 0 at insert time, keeping native scroll anchoring active for the prepend.
  useEffect(() => {
    const root = scrollRef.current,
      el = topSentinelRef.current
    if (!root || !el) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && upcoming.hasNextPage && !upcoming.isFetchingNextPage) {
          upcoming.fetchNextPage()
        }
      },
      { root, rootMargin: '300px 0px 0px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [upcoming.hasNextPage, upcoming.isFetchingNextPage, upcoming.fetchNextPage])

  // Scroll down (toward past) -> load more recent. Appends below the fold; no anchoring needed.
  useEffect(() => {
    const root = scrollRef.current,
      el = bottomSentinelRef.current
    if (!root || !el) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && recent.hasNextPage && !recent.isFetchingNextPage) {
          recent.fetchNextPage()
        }
      },
      { root, rootMargin: '0px 0px 200px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [recent.hasNextPage, recent.isFetchingNextPage, recent.fetchNextPage])

  // Center on "now" once, after both first pages resolve. Keyed on a boolean that flips
  // once — not on pages.length, so polls never re-trigger the scroll.
  const ready = recent.isSuccess && upcoming.isSuccess
  const didCenter = useRef(false)
  const center = useCallback(() => {
    const root = scrollRef.current,
      marker = nowRef.current
    if (root && marker) root.scrollTop = Math.max(0, marker.offsetTop - 56)
  }, [])
  useLayoutEffect(() => {
    if (didCenter.current || !ready) return
    center()
    didCenter.current = true
  }, [ready, center])

  // Double-click -> drop extra pages and re-center on now.
  const handleReset = useCallback(() => {
    qc.setQueryData<InfiniteData<GlobalRun>>(RECENT_KEY, (d) =>
      d ? { pages: d.pages.slice(0, 1), pageParams: d.pageParams.slice(0, 1) } : d,
    )
    qc.setQueryData<InfiniteData<UpcomingRun>>(UPCOMING_KEY, (d) =>
      d ? { pages: d.pages.slice(0, 1), pageParams: d.pageParams.slice(0, 1) } : d,
    )
    requestAnimationFrame(center)
  }, [qc, center])

  return (
    <aside
      ref={scrollRef}
      onDoubleClick={handleReset}
      className="w-full h-full min-h-0 overflow-y-auto flex flex-col"
    >
      <div ref={topSentinelRef} aria-hidden className="h-2 shrink-0" />

      {/* Furthest-future at top, soonest just above the now divider. */}
      {futureRuns.length === 0 ? null : (
        <div className="divide-y divide-border/30">
          {[...futureRuns].reverse().map((run, i, arr) => (
            <UpcomingRow
              key={`u:${run.task_name}:${run.next_run_at}`}
              run={run}
              now={tickNow}
              index={arr.length - i}
            />
          ))}
        </div>
      )}

      {/* The now divider — also the scroll-anchor pivot. Never unmounts. */}
      <div ref={nowRef} aria-hidden className="flex items-center gap-2 my-2.5 shrink-0">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          now
        </span>
        <span className="flex-1 h-px bg-border/40" />
      </div>

      {/* Newest past just below the divider, oldest at the bottom. */}
      {pastRuns.length === 0 ? (
        <p className="text-xs text-muted-foreground/60 py-1.5">No runs yet.</p>
      ) : (
        <div className="divide-y divide-border/30">
          {pastRuns.map((run, i) => (
            <RecentRow key={`r:${run.id}`} run={run} now={tickNow} index={i + 1} />
          ))}
        </div>
      )}

      <div ref={bottomSentinelRef} aria-hidden className="h-2 shrink-0" />
    </aside>
  )
}
