import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Upload, Download, Trash2, RotateCcw, X, Loader2 } from 'lucide-react'
import {
  useLibraryFiles,
  useUploadFile,
  useDownloadFile,
  useDeleteFile,
  useRestoreFile,
  usePurgeFile,
  type LibraryFile,
} from '@/services/useAdminLibrary'
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

function PurgeConfirm({ file, onClose }: { file: LibraryFile; onClose: () => void }) {
  const purge = usePurgeFile()
  const { toast } = useToast()

  async function confirm() {
    try {
      await purge.mutateAsync(file.id)
      toast({ variant: 'success', title: 'Purged', description: file.original_name })
      onClose()
    } catch {
      toast({ variant: 'error', title: 'Purge failed', description: file.original_name })
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-border/40 bg-popover p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h3 className="text-base font-semibold text-foreground">Purge file permanently?</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          <span className="text-foreground font-medium break-all">{file.original_name}</span> will be
          removed from storage and the database. This cannot be undone.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-full text-sm font-medium text-muted-foreground border border-border/50 hover:text-foreground hover:border-border transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={purge.isPending}
            className="px-4 py-1.5 rounded-full text-sm font-medium text-destructive border border-destructive/40 hover:bg-destructive/10 transition-colors disabled:opacity-50"
          >
            {purge.isPending ? 'Purging…' : 'Purge'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default function LibraryPanel() {
  const [includeDeleted, setIncludeDeleted] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [purgeTarget, setPurgeTarget] = useState<LibraryFile | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  const { data: files = [], isLoading, error } = useLibraryFiles(includeDeleted)
  const upload = useUploadFile()
  const download = useDownloadFile()
  const del = useDeleteFile()
  const restore = useRestoreFile()

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    for (const file of Array.from(fileList)) {
      try {
        await upload.mutateAsync(file)
        toast({ variant: 'success', title: 'Uploaded', description: file.name })
      } catch {
        toast({ variant: 'error', title: 'Upload failed', description: file.name })
      }
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Dropzone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
        onClick={() => inputRef.current?.click()}
        className={`flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed py-10 cursor-pointer transition-colors ${
          dragOver ? 'border-primary/60 bg-primary/5' : 'border-border/40 hover:border-border bg-white/[0.02]'
        }`}
      >
        {upload.isPending ? (
          <Loader2 className="size-6 text-primary animate-spin" />
        ) : (
          <Upload className="size-6 text-muted-foreground" />
        )}
        <p className="text-sm text-muted-foreground">
          {upload.isPending ? 'Uploading…' : 'Drag files here or click to upload'}
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={e => { handleFiles(e.currentTarget.files); e.currentTarget.value = '' }}
        />
      </div>

      {/* Toggle */}
      <label className="flex items-center gap-2 text-sm text-muted-foreground self-start cursor-pointer">
        <input
          type="checkbox"
          checked={includeDeleted}
          onChange={e => setIncludeDeleted(e.currentTarget.checked)}
          className="accent-primary"
        />
        Show deleted
      </label>

      {/* Table */}
      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : error ? (
        <p className="text-destructive text-sm">Failed to load files.</p>
      ) : files.length === 0 ? (
        <p className="text-muted-foreground text-sm">No files.</p>
      ) : (
        <div className="bg-white/[0.03] border border-border/20 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40">
                <th className="px-5 py-2.5 text-left text-muted-foreground font-medium">Name</th>
                <th className="px-5 py-2.5 text-left text-muted-foreground font-medium">Type</th>
                <th className="px-5 py-2.5 text-left text-muted-foreground font-medium">Size</th>
                <th className="px-5 py-2.5 text-left text-muted-foreground font-medium">Created</th>
                <th className="px-5 py-2.5 text-muted-foreground font-medium" style={{ width: '1%' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {files.map((f, i) => {
                const deleted = f.deleted_at != null
                return (
                  <tr
                    key={f.id}
                    className={`${i !== 0 ? 'border-t border-border/20' : ''} ${deleted ? 'opacity-50' : ''} hover:bg-[rgba(26,30,42,0.4)] transition-colors`}
                  >
                    <td className="px-5 py-2 font-medium text-foreground break-all">{f.original_name}</td>
                    <td className="px-5 py-2 text-muted-foreground">{f.content_type ?? '—'}</td>
                    <td className="px-5 py-2 text-muted-foreground">{formatSize(f.size_bytes)}</td>
                    <td className="px-5 py-2 text-muted-foreground">{new Date(f.created_at).toLocaleString()}</td>
                    <td className="px-5 py-2" style={{ width: '1%', whiteSpace: 'nowrap' }}>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => download.mutate(f.id)}
                          title="Download"
                          className="p-1.5 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                        >
                          <Download className="size-4" />
                        </button>
                        {deleted ? (
                          <>
                            <button
                              onClick={() => restore.mutate(f.id)}
                              disabled={restore.isPending}
                              title="Restore"
                              className="p-1.5 rounded-full text-muted-foreground hover:text-success hover:bg-success/10 transition-colors disabled:opacity-50"
                            >
                              <RotateCcw className="size-4" />
                            </button>
                            <button
                              onClick={() => setPurgeTarget(f)}
                              title="Purge permanently"
                              className="p-1.5 rounded-full text-destructive hover:bg-destructive/10 transition-colors"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => del.mutate(f.id)}
                            disabled={del.isPending}
                            title="Delete"
                            className="p-1.5 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {purgeTarget && <PurgeConfirm file={purgeTarget} onClose={() => setPurgeTarget(null)} />}
    </div>
  )
}
