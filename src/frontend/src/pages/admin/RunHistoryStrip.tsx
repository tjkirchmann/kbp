import type { SyncRun } from '@/services/useAdminSync'
import Capsule from './RunHistoryCapsule'

const SLOTS = 50

export default function RunHistoryStrip({ runs, taskName }: { runs: SyncRun[]; taskName?: string }) {
  // API gives newest-first; show oldest -> newest (most recent on the right),
  // left-padded with empty slots when there are fewer than 50 runs.
  const ordered = [...runs].reverse()
  const padding = Math.max(0, SLOTS - ordered.length)

  return (
    <div className="flex items-end gap-[2px]">
      {Array.from({ length: padding }).map((_, i) => (
        <div key={`pad-${i}`} className="flex-1 min-w-0">
          <div className="h-6 w-full rounded-full bg-white/[0.04]" />
        </div>
      ))}
      {ordered.map(run => (
        <Capsule key={run.id} run={run} taskName={taskName} />
      ))}
    </div>
  )
}
