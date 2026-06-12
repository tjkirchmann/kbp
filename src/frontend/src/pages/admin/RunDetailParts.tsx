import { useCancelRun, useAbortRun, useRetryRun } from '@/services/useAdminSync'
import type { RunDetail as RunDetailData } from '@/services/useAdminSync'

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 px-4 py-2.5 text-sm border-t border-border/20 first:border-t-0">
      <span className="text-muted-foreground font-medium shrink-0 w-1/3">{label}</span>
      <span className="text-foreground break-all min-w-0">{children}</span>
    </div>
  )
}

export function RunActions({ run, cancel, abort, retry }: {
  run: RunDetailData
  cancel: ReturnType<typeof useCancelRun>
  abort: ReturnType<typeof useAbortRun>
  retry: ReturnType<typeof useRetryRun>
}) {
  const canRetry = ['failed', 'aborted'].includes(run.status)
  const canCancel = run.status === 'todo'
  const canAbort = run.status === 'doing' && !run.abort_requested
  if (!canRetry && !canCancel && !canAbort) return null

  const pillBase = 'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors disabled:opacity-50'
  return (
    <div className="flex flex-col gap-2">
      <div className="border-b border-border/40" />
      <div className="flex items-center gap-2 flex-wrap">
        {canRetry && (
          <button onClick={() => retry.mutate()} disabled={retry.isPending}
            className={`${pillBase} text-primary border-primary/40 hover:bg-primary/10`}>Retry</button>
        )}
        {canCancel && (
          <button onClick={() => cancel.mutate()} disabled={cancel.isPending}
            className={`${pillBase} text-destructive border-destructive/40 hover:bg-destructive/10`}>Cancel</button>
        )}
        {canAbort && (
          <button onClick={() => abort.mutate()} disabled={abort.isPending}
            className={`${pillBase} text-destructive border-destructive/40 hover:bg-destructive/10`}>Abort</button>
        )}
        {cancel.data?.ok === false && (
          <span className="text-[11px] text-muted-foreground">Job was not in a cancellable state.</span>
        )}
      </div>
    </div>
  )
}
