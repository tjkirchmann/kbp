import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CfbdTableFilters } from '@/services/cfbd/useCfbdAdmin'
import { getCfbdTableConfig } from '@/pages/admin/cfbd/tableRegistry'

export const MAX_TABS = 10
export const DEFAULT_TABLE_SLUG = 'rankings'

export type CfbdViewType = 'table' | 'analysis'
export type CfbdAnalysisCategory = 'teams' | 'seasons' | 'games' | 'recruiting' | 'dimensions'

export interface CfbdTableState {
  slug: string
  filters: CfbdTableFilters
  sort: { key: string; dir: 'asc' | 'desc' } | null
  selectedIds: (string | number)[]
  /** Topmost visible row index — restored via DataTable's initialLocation. */
  scrollRow: number
}

export interface CfbdAnalysisState {
  category?: CfbdAnalysisCategory
}

export interface CfbdTabState {
  id: string
  viewType: CfbdViewType
  table: CfbdTableState
  analysis: CfbdAnalysisState
}

interface CfbdExplorerState {
  tabs: CfbdTabState[]
  activeTabId: string | null

  openTab: (slug?: string, seedFilters?: Partial<CfbdTableFilters>) => string | null
  openOrFocusTab: (slug: string, seedFilters?: Partial<CfbdTableFilters>) => void
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  reorderTabs: (activeId: string, overId: string) => void
  changeTabTable: (id: string, slug: string) => void
  setTabViewType: (id: string, viewType: CfbdViewType) => void
  setAnalysisCategory: (id: string, category: CfbdAnalysisCategory) => void
  setTabFilters: (id: string, filters: CfbdTableFilters) => void
  patchTabFilters: (id: string, patch: Partial<CfbdTableFilters>) => void
  setTabSort: (id: string, sort: CfbdTabState['table']['sort']) => void
  setTabSelection: (id: string, ids: (string | number)[]) => void
  setTabScrollRow: (id: string, row: number) => void
}

export function defaultTabFilters(slug: string): CfbdTableFilters {
  const table = getCfbdTableConfig(slug)
  const filters: CfbdTableFilters = {}
  for (const dd of table?.filterDropdowns ?? []) {
    if (dd.default !== undefined) {
      ;(filters as Record<string, unknown>)[dd.key] = dd.default
    }
  }
  return filters
}

function newTab(
  viewType: CfbdViewType = 'analysis',
  slug?: string,
  seedFilters?: Partial<CfbdTableFilters>,
): CfbdTabState {
  return {
    id: crypto.randomUUID(),
    viewType,
    table: {
      slug: slug ?? DEFAULT_TABLE_SLUG,
      filters: viewType === 'table' && slug
        ? { ...defaultTabFilters(slug), ...seedFilters }
        : {},
      sort: null,
      selectedIds: [],
      scrollRow: 0,
    },
    analysis: {
      category: viewType === 'analysis' ? 'teams' : undefined,
    },
  }
}

export const useCfbdExplorerStore = create<CfbdExplorerState>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeTabId: null,

      openTab: (slug, seedFilters) => {
        if (get().tabs.length >= MAX_TABS) return null
        const tab = slug
          ? newTab('table', slug, seedFilters)
          : newTab('analysis')
        set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }))
        return tab.id
      },

      openOrFocusTab: (slug, seedFilters) => {
        const { tabs, activeTabId, openTab, changeTabTable } = get()
        const existing = tabs.find(
          (t) => t.viewType === 'table' && t.table.slug === slug,
        )
        if (existing) {
          const season = seedFilters?.season
          if (
            typeof season === 'number' &&
            season > 0 &&
            existing.table.filters.season !== season
          ) {
            set((s) => ({
              activeTabId: existing.id,
              tabs: s.tabs.map((t) =>
                t.id === existing.id
                  ? {
                      ...t,
                      table: {
                        ...t.table,
                        filters: { ...t.table.filters, season },
                        selectedIds: [],
                        scrollRow: 0,
                      },
                    }
                  : t,
              ),
            }))
          } else {
            set({ activeTabId: existing.id })
          }
          return
        }
        const opened = openTab(slug, seedFilters)
        if (opened === null && activeTabId) {
          changeTabTable(activeTabId, slug)
        }
      },

      closeTab: (id) => {
        set((s) => {
          const idx = s.tabs.findIndex((t) => t.id === id)
          if (idx === -1) return s
          let tabs = s.tabs.filter((t) => t.id !== id)
          let activeTabId = s.activeTabId
          if (tabs.length === 0) {
            const fresh = newTab()
            tabs = [fresh]
            activeTabId = fresh.id
          } else if (activeTabId === id) {
            activeTabId = (tabs[idx] ?? tabs[idx - 1]).id
          }
          return { tabs, activeTabId }
        })
      },

      setActiveTab: (id) => {
        if (get().tabs.some((t) => t.id === id)) set({ activeTabId: id })
      },

      reorderTabs: (activeId, overId) => {
        set((s) => {
          const from = s.tabs.findIndex((t) => t.id === activeId)
          const to = s.tabs.findIndex((t) => t.id === overId)
          if (from === -1 || to === -1 || from === to) return s
          const tabs = [...s.tabs]
          const [moved] = tabs.splice(from, 1)
          tabs.splice(to, 0, moved)
          return { tabs }
        })
      },

      changeTabTable: (id, slug) => {
        set((s) => ({
          tabs: s.tabs.map((t) => {
            if (t.id !== id || t.viewType !== 'table') return t
            const filters = defaultTabFilters(slug)
            // Carry an explicit season across tables (0 = auto-latest sentinel, never carried)
            if (typeof t.table.filters.season === 'number' && t.table.filters.season > 0) {
              filters.season = t.table.filters.season
            }
            return {
              ...t,
              table: { slug, filters, sort: null, selectedIds: [], scrollRow: 0 },
            }
          }),
        }))
      },

      setTabViewType: (id, viewType) => {
        set((s) => ({
          tabs: s.tabs.map((t) => {
            if (t.id !== id) return t
            // When switching to analysis for the first time, set default category
            const analysis: CfbdAnalysisState =
              viewType === 'analysis'
                ? { category: t.analysis.category ?? 'teams' }
                : {}
            return { ...t, viewType, analysis }
          }),
        }))
      },

      setAnalysisCategory: (id, category) => {
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === id
              ? { ...t, analysis: { ...t.analysis, category } }
              : t,
          ),
        }))
      },

      // Filter changes clear sort too — the remote model's setFilters action
      // supersedes sort/order params, so the store mirrors that.
      setTabFilters: (id, filters) => {
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === id
              ? {
                  ...t,
                  table: {
                    ...t.table,
                    filters,
                    sort: null,
                    selectedIds: [],
                    scrollRow: 0,
                  },
                }
              : t,
          ),
        }))
      },

      patchTabFilters: (id, patch) => {
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === id
              ? {
                  ...t,
                  table: { ...t.table, filters: { ...t.table.filters, ...patch } },
                }
              : t,
          ),
        }))
      },

      setTabSort: (id, sort) => {
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === id
              ? { ...t, table: { ...t.table, sort, scrollRow: 0 } }
              : t,
          ),
        }))
      },

      setTabSelection: (id, ids) => {
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === id ? { ...t, table: { ...t.table, selectedIds: ids } } : t,
          ),
        }))
      },

      setTabScrollRow: (id, scrollRow) => {
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === id ? { ...t, table: { ...t.table, scrollRow } } : t,
          ),
        }))
      },
    }),
    {
      name: 'kbp-cfbd-explorer',
      version: 3,
      partialize: (s) => ({ tabs: s.tabs, activeTabId: s.activeTabId }),
      migrate: (persisted, version) => {
        const raw = persisted as {
          tabs?: Record<string, unknown>[]
          activeTabId?: string | null
        }
        let tabs: Record<string, unknown>[] = raw?.tabs ?? []

        // v1 → v2: pixel scrollTop + offset → scrollRow
        if (version < 2) {
          tabs = tabs.map(({ scrollTop, offset: _offset, ...t }: Record<string, unknown>) => ({
            ...t,
            scrollRow: Math.max(0, Math.round(((scrollTop as number) ?? 0) / 44)),
          }))
        }

        // v2 → v3: flat → nested with viewType
        if (version < 3) {
          tabs = tabs.map((t) => ({
            id: t.id,
            viewType: 'table',
            table: {
              slug: (t.slug as string) ?? 'rankings',
              filters: (t.filters as CfbdTableFilters) ?? {},
              sort: (t.sort as CfbdTabState['table']['sort']) ?? null,
              selectedIds: (t.selectedIds as (string | number)[]) ?? [],
              scrollRow: (t.scrollRow as number) ?? 0,
            },
            analysis: {},
          }))
        }

        // Filter out tabs whose table slug doesn't resolve to a valid config
        tabs = tabs.filter((t) => {
          if (t.viewType === 'table') {
            return Boolean(getCfbdTableConfig((t.table as CfbdTableState).slug))
          }
          return true
        })

        const activeTabId = tabs.some((t) => t.id === raw?.activeTabId)
          ? (raw?.activeTabId ?? null)
          : ((tabs[0]?.id as string) ?? null)

        return { tabs, activeTabId }
      },
    },
  ),
)
