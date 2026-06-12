import type { NotifyEvent } from '@/services/useAdminSync'

export const NOTIFY_EVENTS: { key: NotifyEvent; label: string }[] = [
  { key: 'start', label: 'Start' },
  { key: 'success', label: 'Success' },
  { key: 'failure', label: 'Failure' },
]

// Shared pill states. The off state keeps a visible rest fill (so each toggle
// reads as a button against the gray group capsule) that lifts on hover.
export const PILL_ON = 'bg-primary/15 text-primary border-primary/40 hover:bg-primary/25'
export const PILL_OFF =
  'text-muted-foreground border-border/50 hover:bg-white/10 hover:text-foreground'

// Staleness presets for "run on startup": skip the boot run if the task
// succeeded within this window. -1 is the "Always" sentinel (clears to null).
export const STALE_PRESETS: { label: string; seconds: number }[] = [
  { label: 'Always', seconds: -1 },
  { label: '1h', seconds: 3600 },
  { label: '6h', seconds: 21600 },
  { label: '12h', seconds: 43200 },
  { label: '24h', seconds: 86400 },
  { label: '7d', seconds: 604800 },
]

export function prettyTaskName(taskName: string): string {
  return taskName
    .split('_')
    .map(w => (w.toLowerCase() === 'cfbd' ? 'CFBD' : w.toLowerCase() === 'espn' ? 'ESPN'
      : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

export function statusDotColor(status: string): string {
  switch (status) {
    case 'succeeded':
      return 'bg-success'
    case 'failed':
    case 'aborted':
    case 'cancelled':
      return 'bg-destructive'
    case 'doing':
      return 'bg-primary animate-pulse'
    case 'todo':
      return 'bg-primary/40 animate-pulse'
    default:
      return 'bg-white/20'
  }
}

export function statusLabel(status: string): string {
  switch (status) {
    case 'succeeded': return 'Success'
    case 'failed': return 'Failed'
    case 'aborted': return 'Aborted'
    case 'cancelled': return 'Cancelled'
    case 'doing': return 'Running'
    case 'todo': return 'Queued'
    default: return status
  }
}
