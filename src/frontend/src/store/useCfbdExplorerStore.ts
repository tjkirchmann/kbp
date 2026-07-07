import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CfbdTableFilters } from '@/services/useCfbdAdmin'
import { getCfbdTableConfig } from '@/pages/admin/cfbd/tableRegistry'

export const MAX_TABS = 10
export const DEFAULT_TAB_SLUG = 'rankings'

export interface CfbdTabState {
  id: string
  slug: string
  filters: CfbdTableFilters
  sort: { key: string; dir: 'asc' | 'desc' } | null
  selectedIds: (string | number)[]
  /** Topmost visible row index — restored via DataTable's initialLocation. */
  scrollRow: number
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
  setTabFilters: (id: string, filters: CfbdTableFilters) => void
  patchTabFilters: (id: string, patch: Partial<CfbdTableFilters>) => void
  setTabSort: (id: string, sort: CfbdTabState['sort']) => void
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

function newTab(slug: string, seedFilters?: Partial<CfbdTableFilters>): CfbdTabState {
  return {
    id: crypto.randomUUID(),
    slug,
    filters: { ...defaultTabFilters(slug), ...seedFilters },
    sort: null,
    selectedIds: [],
    scrollRow: 0,
  }
}

export const useCfbdExplorerStore = create<CfbdExplorerState>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeTabId: null,

      openTab: (slug = DEFAULT_TAB_SLUG, seedFilters) => {
        if (get().tabs.length >= MAX_TABS) return null
        const tab = newTab(slug, seedFilters)
        set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }))
        return tab.id
      },

      openOrFocusTab: (slug, seedFilters) => {
        const { tabs, activeTabId, openTab, changeTabTable } = get()
        const existing = tabs.find((t) => t.slug === slug)
        if (existing) {
          const season = seedFilters?.season
          if (typeof season === 'number' && season > 0 && existing.filters.season !== season) {
            set((s) => ({
              activeTabId: existing.id,
              tabs: s.tabs.map((t) =>
                t.id === existing.id
                  ? { ...t, filters: { ...t.filters, season }, selectedIds: [], scrollRow: 0 }
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
            const fresh = newTab(DEFAULT_TAB_SLUG)
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
            if (t.id !== id) return t
            const filters = defaultTabFilters(slug)
            // Carry an explicit season across tables (0 = auto-latest sentinel, never carried)
            if (typeof t.filters.season === 'number' && t.filters.season > 0) {
              filters.season = t.filters.season
            }
            return { ...t, slug, filters, sort: null, selectedIds: [], scrollRow: 0 }
          }),
        }))
      },

      // Filter changes clear sort too — the remote model's setFilters action
      // supersedes sort/order params, so the store mirrors that.
      setTabFilters: (id, filters) => {
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === id ? { ...t, filters, sort: null, selectedIds: [], scrollRow: 0 } : t,
          ),
        }))
      },

      patchTabFilters: (id, patch) => {
        set((s) => ({
          tabs: s.tabs.map((t) => (t.id === id ? { ...t, filters: { ...t.filters, ...patch } } : t)),
        }))
      },

      setTabSort: (id, sort) => {
        set((s) => ({
          tabs: s.tabs.map((t) => (t.id === id ? { ...t, sort, scrollRow: 0 } : t)),
        }))
      },

      setTabSelection: (id, ids) => {
        set((s) => ({
          tabs: s.tabs.map((t) => (t.id === id ? { ...t, selectedIds: ids } : t)),
        }))
      },

      setTabScrollRow: (id, scrollRow) => {
        set((s) => ({
          tabs: s.tabs.map((t) => (t.id === id ? { ...t, scrollRow } : t)),
        }))
      },
    }),
    {
      name: 'kbp-cfbd-explorer',
      version: 2,
      partialize: (s) => ({ tabs: s.tabs, activeTabId: s.activeTabId }),
      migrate: (persisted, version) => {
        const raw = persisted as {
          tabs?: (CfbdTabState & { scrollTop?: number; offset?: number })[]
          activeTabId?: string | null
        }
        let tabs = (raw?.tabs ?? []).filter((t) => t?.id && getCfbdTableConfig(t.slug))
        if (version < 2) {
          // v1 stored pixel scrollTop (44px rows) + a pagination offset
          tabs = tabs.map(({ scrollTop, offset: _offset, ...t }) => ({
            ...t,
            scrollRow: Math.max(0, Math.round((scrollTop ?? 0) / 44)),
          }))
        }
        const activeTabId = tabs.some((t) => t.id === raw?.activeTabId)
          ? (raw.activeTabId ?? null)
          : (tabs[0]?.id ?? null)
        return { tabs, activeTabId }
      },
    },
  ),
)
