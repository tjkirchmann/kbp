import { useState } from 'react'
import { Download, FileJson, FileText, Film, Image, Music } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import type { Artifact } from '@/services/usePipelineRun'
import { useArtifactDownload, useArtifactPreview } from '@/services/usePipelineRun'

const kindIcons: Record<string, LucideIcon> = {
  video: Film,
  image: Image,
  audio: Music,
  json: FileJson,
  text: FileText,
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Clickable artifact pill → preview dialog. The presigned URL is fetched on
 * every open and never cached (it expires). */
export function ArtifactChip({ artifact }: { artifact: Artifact }) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [text, setText] = useState<string | null>(null)
  const preview = useArtifactPreview()
  const download = useArtifactDownload()
  const Icon = kindIcons[artifact.kind] ?? FileText

  async function openPreview() {
    setOpen(true)
    setUrl(null)
    setText(null)
    const { url: fresh } = await preview.mutateAsync(artifact.id)
    setUrl(fresh)
    if (artifact.kind === 'json' || artifact.kind === 'text') {
      const res = await fetch(fresh)
      setText(await res.text())
    }
  }

  return (
    <>
      <button
        onClick={openPreview}
        className="inline-flex items-center gap-1.5 rounded border border-border/30 bg-white/5 px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
      >
        <Icon className="size-3.5" />
        <span className="truncate max-w-36">{artifact.name}</span>
        <span className="text-[10px]">{formatBytes(artifact.size_bytes)}</span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={artifact.name} size="lg">
        <div className="flex flex-col gap-4">
          {!url ? (
            <p className="text-sm text-muted-foreground">Loading preview…</p>
          ) : artifact.kind === 'video' ? (
            <video src={url} controls autoPlay className="w-full rounded-lg" />
          ) : artifact.kind === 'image' ? (
            <img src={url} alt={artifact.name} className="max-w-full rounded-lg" />
          ) : artifact.kind === 'audio' ? (
            <audio src={url} controls className="w-full" />
          ) : (
            <pre className="max-h-96 overflow-auto rounded-lg bg-white/[0.03] border border-border/20 p-3 font-mono text-xs text-foreground">
              {text ?? 'Loading…'}
            </pre>
          )}
          <button
            onClick={() => download.mutate(artifact.id)}
            className="self-start inline-flex items-center gap-2 rounded-lg border border-border/30 bg-white/[0.03] px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Download className="size-4" />
            Download
          </button>
        </div>
      </Modal>
    </>
  )
}
