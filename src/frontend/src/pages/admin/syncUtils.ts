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
