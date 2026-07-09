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
import { Plus, Table2, X, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCfbdExplorerStore, MAX_TABS, type CfbdTabState } from '@/store/useCfbdExplorerStore'
import { getCfbdTableConfig } from './tableRegistry'

const CATEGORY_LABELS: Record<string, string> = {
  teams: 'Teams',
  seasons: 'Seasons',
  games: 'Games',
  recruiting: 'Recruiting',
  dimensions: 'Dimensions',
}

function tabLabel(tab: CfbdTabState): string {
  if (tab.viewType === 'analysis') {
    return tab.analysis.category
      ? CATEGORY_LABELS[tab.analysis.category] ?? tab.analysis.category
      : 'Analysis'
  }
  const label = getCfbdTableConfig(tab.table.slug)?.label ?? tab.table.slug
  const season = tab.table.filters.season
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
        'group relative flex h-9 max-w-56 shrink-0 cursor-pointer select-none items-center gap-2 rounded-t-lg px-3.5 text-sm font-medium transition-colors',
        isActive
          ? // Surface color matches the content panel below so the active tab
            // reads as one continuous sheet; the pseudo-elements paint the
            // concave fillets where the tab meets the chrome band.
            'z-10 bg-[#14161d] text-foreground before:absolute before:-left-2 before:bottom-0 before:size-2 before:bg-[radial-gradient(circle_at_top_left,transparent_8px,#14161d_8px)] after:absolute after:-right-2 after:bottom-0 after:size-2 after:bg-[radial-gradient(circle_at_top_right,transparent_8px,#14161d_8px)]'
          : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground',
        isDragging && 'z-20 opacity-80',
      )}
    >
      {tab.viewType === 'analysis' ? (
        <Zap className={cn('size-3.5 shrink-0', isActive && 'text-primary')} />
      ) : (
        <Table2 className={cn('size-3.5 shrink-0', isActive && 'text-primary')} />
      )}
      <span className="truncate whitespace-nowrap">{tabLabel(tab)}</span>
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

/**
 * Browser-chrome tab band for the data explorer. Rendered by AdminShell in
 * place of the breadcrumbs; the active tab fuses into the content panel.
 */
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
    <div className="shrink-0 flex items-end gap-1 overflow-x-auto bg-black/25 px-3 pt-2">
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
        className="mb-1.5 ml-1 flex shrink-0 items-center justify-center rounded-md p-1 text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus className="size-4" />
      </button>
    </div>
  )
}
