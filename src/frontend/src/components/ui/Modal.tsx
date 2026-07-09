import { ReactNode, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

export interface ModalProps {
  open: boolean
  onClose?: () => void
  title?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  closeOnBackdrop?: boolean
  closeOnEscape?: boolean
}

export default function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
  closeOnEscape = true,
}: ModalProps) {
  // Body scroll lock
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = ''
      }
    }
  }, [open])

  // Escape key handler
  useEffect(() => {
    if (!open || !closeOnEscape || !onClose) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose?.()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, closeOnEscape, onClose])

  if (!open) return null

  const sizeClasses = {
    sm: 'max-w-sm h-auto',
    md: 'max-w-lg h-[85vh]',
    lg: 'max-w-2xl h-[85vh]',
    xl: 'max-w-6xl h-[85vh]',
  }

  const showHeader = title || onClose

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget && closeOnBackdrop && onClose) {
      onClose()
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px] flex items-center justify-center p-4 sm:p-6 animate-modal-overlay-in"
      onClick={handleBackdropClick}
    >
      <div
        className={`glass-panel rounded-2xl w-full overflow-hidden flex flex-col shadow-2xl animate-modal-panel-in ${sizeClasses[size]}`}
        style={{
          background: 'linear-gradient(to bottom, rgba(42, 47, 62, 0.94), rgba(26, 30, 42, 0.90))',
          border: '1px solid rgba(255, 255, 255, 0.12)',
        }}
      >
        {/* Header */}
        {showHeader && (
          <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-border/40">
            {title && <h2 className="text-lg font-semibold text-foreground">{title}</h2>}
            {onClose && (
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors ml-auto"
                aria-label="Close modal"
              >
                <X className="size-5" />
              </button>
            )}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="shrink-0 flex items-center gap-3 px-6 py-4 border-t border-border/40">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
