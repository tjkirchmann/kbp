import { useSyncStatus } from '@/services/useAdminSync'
import SyncJobCard from './SyncJobCard'

export default function SyncPanel() {
  const { data: jobs, isLoading, error } = useSyncStatus()

  if (isLoading) return <p className="text-muted-foreground text-sm">Loading...</p>
  if (error) return <p className="text-destructive text-sm">Failed to load sync status.</p>
  if (!jobs?.length) return <p className="text-muted-foreground text-sm">No sync jobs registered.</p>

  return (
    <div className="flex flex-col gap-3 max-w-xl">
      {jobs.map(job => (
        <SyncJobCard key={job.task_name} job={job} />
      ))}
    </div>
  )
}
