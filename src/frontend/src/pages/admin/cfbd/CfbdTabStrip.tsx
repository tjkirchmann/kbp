import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCfbdExplorerStore, MAX_TABS, type CfbdTabState } from '@/store/useCfbdExplorerStore'
import { getCfbdTableConfig } from './tableRegistry'

function tabLabel(tab: CfbdTabState): string {
  const label = getCfbdTableConfig(tab.slug)?.label ?? tab.slug
  const season = tab.filters.season
  return typeof season === 'number' && season > 0 ? `${label} · ${season}` : label
}

function SortableTab({ tab, isActive }: { tab: CfbdTabState; isActive: boolean }) {
  const setActiveTab = useCfbdExplorerStore((s) => s.setActiveTab)
  const closeTab = useCfbdExplorerStore((s) => s.closeTab)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tab.id,
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={() => setActiveTab(tab.id)}
      onMouseDown={(e) => {
        if (e.button === 1) e.preventDefault()
      }}
      onAuxClick={(e) => {
        if (e.button === 1) closeTab(tab.id)
      }}
      className={cn(
        'group flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors select-none',
        isActive
          ? 'border-primary/40 bg-primary/15 text-primary'
          : 'border-border/20 bg-white/[0.03] text-muted-foreground hover:text-foreground',
        isDragging && 'z-10 opacity-80',
      )}
    >
      <span className="whitespace-nowrap">{tabLabel(tab)}</span>
      <button
        type="button"
        aria-label="Close tab"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          closeTab(tab.id)
        }}
        className={cn(
          'rounded p-0.5 transition-colors hover:bg-white/10 hover:text-foreground',
          isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
        )}
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}

export default function CfbdTabStrip() {
  const tabs = useCfbdExplorerStore((s) => s.tabs)
  const activeTabId = useCfbdExplorerStore((s) => s.activeTabId)
  const openTab = useCfbdExplorerStore((s) => s.openTab)
  const reorderTabs = useCfbdExplorerStore((s) => s.reorderTabs)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) {
      reorderTabs(String(active.id), String(over.id))
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={tabs.map((t) => t.id)} strategy={horizontalListSortingStrategy}>
          {tabs.map((tab) => (
            <SortableTab key={tab.id} tab={tab} isActive={tab.id === activeTabId} />
          ))}
        </SortableContext>
      </DndContext>
      <button
        type="button"
        aria-label="New tab"
        disabled={tabs.length >= MAX_TABS}
        onClick={() => openTab()}
        className="flex shrink-0 items-center justify-center rounded-lg border border-border/20 bg-white/[0.03] p-1.5 text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus className="size-4" />
      </button>
    </div>
  )
}
