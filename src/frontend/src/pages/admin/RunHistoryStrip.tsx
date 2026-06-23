import type { SyncRun } from '@/services/useAdminSync'
import Capsule from './RunHistoryCapsule'

const SLOTS = 50

export default function RunHistoryStrip({
  runs,
  taskName,
}: {
  runs: SyncRun[]
  taskName?: string
}) {
  // API gives newest-first; show oldest -> newest (most recent on the right),
  // left-padded with empty slots when there are fewer than 50 runs.
  const ordered = [...runs].reverse()
  const padding = Math.max(0, SLOTS - ordered.length)

  return (
    // A single capsule, internally segmented one slice per run. The container
    // owns the pill shape + rounded ends; segments are plain fills clipped to it,
    // hairline-divided so each run stays distinguishable.
    <div className="flex h-4 items-stretch overflow-hidden rounded-full bg-white/[0.04] ring-1 ring-white/10 divide-x-2 divide-background/70">
      {Array.from({ length: padding }).map((_, i) => (
        <div key={`pad-${i}`} className="flex-1 min-w-0 bg-white/[0.04]" />
      ))}
      {ordered.map((run) => (
        <Capsule key={run.id} run={run} taskName={taskName} />
      ))}
    </div>
  )
}
