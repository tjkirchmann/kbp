import { useEffect } from 'react'
import { useCfbdExplorerStore } from '@/store/useCfbdExplorerStore'
import CfbdWorkspace from './CfbdWorkspace'
import CfbdAnalysisWorkspace from './CfbdAnalysisWorkspace'

// The tab band itself is rendered by AdminShell (it replaces the breadcrumbs);
// this page hosts the active tab's workspace.
export default function CfbdExplorer() {
  const tabs = useCfbdExplorerStore((s) => s.tabs)
  const activeTabId = useCfbdExplorerStore((s) => s.activeTabId)
  const openTab = useCfbdExplorerStore((s) => s.openTab)
  // First run (nothing persisted): the explorer always has at least one tab.
  // Reads fresh store state so StrictMode's double effect run can't open two.
  useEffect(() => {
    if (useCfbdExplorerStore.getState().tabs.length === 0) openTab()
  }, [tabs.length, openTab])

  // ⌥W / Option+W → close active tab (skip when a text input is focused)
  // ⌥L → next tab with wrap  |  ⌥H → previous tab with wrap
  // ⌥. → cycle view type
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Only Option/Alt — no Cmd, Ctrl, or Shift held.
      if (!e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return

      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      const state = useCfbdExplorerStore.getState()

      if (e.code === 'KeyW' && state.activeTabId) {
        e.preventDefault()
        state.closeTab(state.activeTabId)
        return
      }

      // ⌥L → next tab (wrap to first)
      if (e.code === 'KeyL' && state.tabs.length > 1) {
        e.preventDefault()
        const idx = state.tabs.findIndex((t) => t.id === state.activeTabId)
        const next = (idx + 1) % state.tabs.length
        state.setActiveTab(state.tabs[next].id)
        return
      }

      // ⌥H → previous tab (wrap to last)
      if (e.code === 'KeyH' && state.tabs.length > 1) {
        e.preventDefault()
        const idx = state.tabs.findIndex((t) => t.id === state.activeTabId)
        const prev = (idx - 1 + state.tabs.length) % state.tabs.length
        state.setActiveTab(state.tabs[prev].id)
        return
      }

      // ⌥. → cycle view type
      if (e.code === 'Period' && state.activeTabId) {
        e.preventDefault()
        const tab = state.tabs.find((t) => t.id === state.activeTabId)
        if (tab) {
          const next: typeof tab.viewType = tab.viewType === 'table' ? 'analysis' : 'table'
          state.setTabViewType(tab.id, next)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const active = tabs.find((t) => t.id === activeTabId) ?? tabs[0]

  return (
    <div className="h-full min-h-0 flex flex-col pt-4">
      {active && active.viewType === 'analysis' ? (
        <CfbdAnalysisWorkspace key={`${active.id}-analysis`} tabId={active.id} />
      ) : (
        <CfbdWorkspace key={`${active.id}-table-${active.table.slug}`} tabId={active.id} />
      )}
    </div>
  )
}
