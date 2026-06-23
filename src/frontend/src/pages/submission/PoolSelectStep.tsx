import { useNavigate } from 'react-router-dom'
import { Loader2, Lock } from 'lucide-react'
import { useOpenPools } from '@/services/useSubmission'

export default function PoolSelectStep() {
  const navigate = useNavigate()
  const { data: pools = [], isLoading } = useOpenPools()

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
        <Loader2 className="size-4 animate-spin" />
        Loading pools…
      </div>
    )
  }

  if (pools.length === 0) {
    return (
      <div className="glass-panel rounded-2xl p-10 flex flex-col items-center gap-2 text-center">
        <p className="text-sm font-medium text-foreground">
          No pools are currently open for submissions.
        </p>
        <p className="text-xs text-muted-foreground">
          Check back soon or contact your pool organizer.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Enter a Pool</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Select the pool you want to submit an entry for.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {pools.map((pool) => (
          <button
            key={pool.id}
            onClick={() => navigate(`/submission/${pool.id}`)}
            className="glass-panel rounded-2xl p-5 text-left hover:border-primary/40 border border-border/30 transition-colors group"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                  {pool.name}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{pool.season_year} season</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                {pool.requires_password && (
                  <span title="Password required">
                    <Lock className="size-3.5 text-muted-foreground" />
                  </span>
                )}
                {pool.is_featured && (
                  <span className="px-1.5 py-0.5 rounded-full text-xs font-medium bg-primary/15 text-primary">
                    Featured
                  </span>
                )}
              </div>
            </div>
            {pool.submissions_due_at && (
              <p className="text-xs text-muted-foreground mt-2">
                Due{' '}
                {new Date(pool.submissions_due_at).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
