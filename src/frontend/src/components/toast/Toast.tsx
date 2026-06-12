import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react'
import type { Toast } from './ToastContext'

export type ToastVariant = 'success' | 'error' | 'info' | 'warning'

const VARIANT: Record<ToastVariant, { icon: typeof Info; color: string }> = {
  success: { icon: CheckCircle2, color: 'var(--color-success)' },
  error: { icon: XCircle, color: 'var(--color-destructive)' },
  warning: { icon: AlertTriangle, color: 'var(--color-warning)' },
  info: { icon: Info, color: 'var(--color-info)' },
}

export default function ToastCard({
  toast,
  onDismiss,
}: {
  toast: Toast
  onDismiss: (id: string) => void
}) {
  const { icon: Icon, color } = VARIANT[toast.variant]
  return (
    <div
      role="status"
      className="glass-panel pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-lg py-2.5 pl-3.5 pr-2.5 shadow-lg animate-toast-in"
    >
      {/* Variant accent bar */}
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: color }} />
      <Icon className="mt-0.5 size-4 shrink-0" style={{ color }} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold leading-tight text-foreground">{toast.title}</p>
        {toast.description && (
          <p className="mt-0.5 break-words text-[11px] leading-snug text-muted-foreground">
            {toast.description}
          </p>
        )}
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss"
        className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
