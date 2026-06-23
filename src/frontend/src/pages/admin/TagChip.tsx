import { X } from 'lucide-react'
import type { Tag } from '@/services/useTags'

export default function TagChip({ tag, onRemove }: { tag: Tag; onRemove?: () => void }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${tag.color}`}
    >
      {tag.name}
      {onRemove && (
        <button
          onClick={onRemove}
          className="opacity-60 hover:opacity-100 transition-opacity"
          aria-label={`Remove ${tag.name}`}
        >
          <X className="size-2.5" />
        </button>
      )}
    </span>
  )
}
