import { useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Download, FileVideo, Loader2, Trash2, Upload } from 'lucide-react'
import { useProjectFiles, projectKeys } from '@/services/useProjects'
import { useUploadFile, useDownloadFile, useDeleteFile } from '@/services/useAdminLibrary'
import { useToast } from '@/components/toast/ToastContext'

function formatSize(bytes: number | null): string {
  if (bytes == null) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let n = bytes
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

interface ProjectFilesPanelProps {
  projectId: number
}

export function ProjectFilesPanel({ projectId }: ProjectFilesPanelProps) {
  const { data: files = [], isLoading } = useProjectFiles(projectId)
  const upload = useUploadFile()
  const download = useDownloadFile()
  const del = useDeleteFile()
  const qc = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    for (const file of Array.from(fileList)) {
      try {
        await upload.mutateAsync({ file, projectId })
        toast({ variant: 'success', title: 'Uploaded', description: file.name })
      } catch {
        toast({ variant: 'error', title: 'Upload failed', description: file.name })
      }
    }
  }

  function onDelete(fileId: number) {
    del.mutate(fileId, {
      onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.files(projectId) }),
    })
  }

  return (
    <div className="bg-white/[0.03] border border-border/20 rounded-lg">
      <div className="flex items-center gap-3 border-b border-border/40 px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Files</h2>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={upload.isPending}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-primary/15 border border-primary/40 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
        >
          {upload.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Upload className="size-4" />
          )}
          Upload
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>
      <div className="divide-y divide-border/20">
        {isLoading ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">Loading…</div>
        ) : files.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            No files yet — uploads here belong to this project.
          </div>
        ) : (
          files.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors"
            >
              <FileVideo className="size-4 text-muted-foreground shrink-0" />
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                {f.original_name}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {formatSize(f.size_bytes)}
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(f.created_at + 'Z').toLocaleDateString()}
              </span>
              <button
                onClick={() => download.mutate(f.id)}
                className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                title="Download"
              >
                <Download className="size-4" />
              </button>
              <button
                onClick={() => onDelete(f.id)}
                className="rounded-lg p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Delete file"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
