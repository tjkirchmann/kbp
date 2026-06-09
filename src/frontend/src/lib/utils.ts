import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const UNITS: [limit: number, secs: number, label: string][] = [
  [60, 1, 's'],
  [3600, 60, 'm'],
  [86400, 3600, 'h'],
  [Infinity, 86400, 'd'],
]

/** Compact magnitude like "5s", "12m", "3h", "2d" for an absolute number of seconds. */
function compact(seconds: number): string {
  const abs = Math.abs(seconds)
  for (const [limit, div, label] of UNITS) {
    if (abs < limit) return `${Math.max(1, Math.round(abs / div))}${label}`
  }
  return `${Math.round(abs / 86400)}d`
}

/** "5s ago" / "in 12m" for a past/future ISO timestamp, or "—" when null. */
export function relativeTime(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return '—'
  const diffSec = (new Date(iso).getTime() - now) / 1000
  if (Math.abs(diffSec) < 2) return 'now'
  return diffSec < 0 ? `${compact(diffSec)} ago` : `in ${compact(diffSec)}`
}

/** "1.7s" duration for a number of seconds, or "—" when null. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return '—'
  if (seconds < 1) return `${Math.round(seconds * 1000)}ms`
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  return compact(seconds)
}

/** Absolute local time like "Jun 7, 23:43". */
export function absoluteTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString([], {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  })
}
