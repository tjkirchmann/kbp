import { useCallback, useEffect, useRef, useState } from 'react'
import { History, Bell } from 'lucide-react'
import SyncActivityRail from './SyncActivityRail'
import ChannelManager from './ChannelManager'

type Tab = 'history' | 'notifications'

const WIDTH_KEY = 'sync-panel-width'
const DEFAULT_WIDTH = 320
const MIN_WIDTH = 260
const maxWidth = () => Math.round(window.innerWidth * 0.45) // sensible % cap

function initialWidth(): number {
  if (typeof window === 'undefined') return DEFAULT_WIDTH
  const stored = Number(localStorage.getItem(WIDTH_KEY))
  return stored ? Math.min(Math.max(stored, MIN_WIDTH), maxWidth()) : DEFAULT_WIDTH
}

const TABS: { key: Tab; label: string; Icon: typeof History }[] = [
  { key: 'history', label: 'History', Icon: History },
  { key: 'notifications', label: 'Notifications', Icon: Bell },
]

export default function SyncSidePanel() {
  const [tab, setTab] = useState<Tab>('history')
  const [width, setWidth] = useState(initialWidth)
  const drag = useRef<{ startX: number; startWidth: number } | null>(null)

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      drag.current = { startX: e.clientX, startWidth: width }
    },
    [width],
  )

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!drag.current) return
      // Dragging left (clientX decreases) widens the panel.
      const next = drag.current.startWidth + (drag.current.startX - e.clientX)
      setWidth(Math.min(Math.max(next, MIN_WIDTH), maxWidth()))
    }
    const onUp = () => {
      if (!drag.current) return
      drag.current = null
      setWidth((w) => {
        localStorage.setItem(WIDTH_KEY, String(w))
        return w
      })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  return (
    <aside
      style={{ width }}
      className="relative shrink-0 h-full min-h-0 border-l border-border/40 pl-5 flex flex-col"
    >
      {/* Resize handle on the left edge */}
      <div
        onPointerDown={onPointerDown}
        className="absolute left-0 inset-y-0 w-1.5 -translate-x-1/2 cursor-col-resize hover:bg-primary/30 transition-colors"
      />

      {/* Icon tabs */}
      <div className="flex items-center gap-1 shrink-0 mb-2.5">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            title={label}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
              tab === key
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            }`}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 flex flex-col">
        {tab === 'history' ? <SyncActivityRail /> : <ChannelManager />}
      </div>
    </aside>
  )
}
