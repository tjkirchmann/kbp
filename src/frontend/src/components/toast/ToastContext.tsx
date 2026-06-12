/**
 * App-wide toast system. Mount <ToastProvider> once at the app root, then call
 * useToast() from anywhere:
 *
 *   const { toast } = useToast()
 *   toast({ variant: 'success', title: 'Saved', description: 'All good' })
 *
 * This is the single source of truth for transient feedback — prefer it over
 * any per-page success/error UI.
 */
import { createContext, useCallback, useContext, useRef, useState } from 'react'
import ToastCard, { type ToastVariant } from './Toast'

export interface Toast {
  id: string
  variant: ToastVariant
  title: string
  description?: string
}

interface ToastOptions {
  variant?: ToastVariant
  title: string
  description?: string
  duration?: number // ms before auto-dismiss; default 4000
}

interface ToastContextValue {
  toast: (opts: ToastOptions) => string
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const DEFAULT_DURATION = 4000

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const toast = useCallback((opts: ToastOptions) => {
    const id = crypto.randomUUID()
    setToasts(prev => [
      ...prev,
      { id, variant: opts.variant ?? 'info', title: opts.title, description: opts.description },
    ])
    const timer = setTimeout(() => dismiss(id), opts.duration ?? DEFAULT_DURATION)
    timers.current.set(id, timer)
    return id
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 w-[min(22rem,calc(100vw-2rem))] pointer-events-none">
        {toasts.map(t => (
          <ToastCard key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}
