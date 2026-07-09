import { FolderOpen, ScanSearch, SlidersHorizontal, Terminal } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export const categoryIcons: Record<string, LucideIcon> = {
  source: FolderOpen,
  transform: SlidersHorizontal,
  analyze: ScanSearch,
  'escape hatch': Terminal,
}

/** Port-kind dot colors (edge/handle affordance for type matching). */
export const kindColors: Record<string, string> = {
  video: 'bg-primary',
  image: 'bg-teal-400',
  audio: 'bg-purple-400',
  json: 'bg-amber-400',
  text: 'bg-muted-foreground',
}

/** Node border per live run status (edit mode uses the default border). */
export const statusBorders: Record<string, string> = {
  queued: 'border-border/40',
  running: 'border-primary/70',
  succeeded: 'border-success/50',
  failed: 'border-destructive/60',
  canceled: 'border-warning/50',
  skipped: 'border-border/30',
}

export const statusTextColors: Record<string, string> = {
  queued: 'text-muted-foreground',
  running: 'text-primary',
  succeeded: 'text-success',
  failed: 'text-destructive',
  canceled: 'text-warning',
  skipped: 'text-muted-foreground',
}

export function formatDuration(startIso: string | null, endIso: string | null): string {
  if (!startIso) return ''
  // API timestamps are naive UTC — force the Z so the math is right locally.
  const start = new Date(startIso + 'Z').getTime()
  const end = endIso ? new Date(endIso + 'Z').getTime() : Date.now()
  const seconds = Math.max(0, (end - start) / 1000)
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`
}
