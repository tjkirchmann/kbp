import { useEffect } from 'react'
import { useCfbdExplorerStore, DEFAULT_TAB_SLUG } from '@/store/useCfbdExplorerStore'
import CfbdWorkspace from './CfbdWorkspace'

// The tab band itself is rendered by AdminShell (it replaces the breadcrumbs);
// this page hosts the active tab's workspace.
export default function CfbdExplorer() {
  const tabs = useCfbdExplorerStore((s) => s.tabs)
  const activeTabId = useCfbdExplorerStore((s) => s.activeTabId)
  const openTab = useCfbdExplorerStore((s) => s.openTab)
  // First run (nothing persisted): the explorer always has at least one tab.
  // Reads fresh store state so StrictMode's double effect run can't open two.
  useEffect(() => {
    if (useCfbdExplorerStore.getState().tabs.length === 0) openTab(DEFAULT_TAB_SLUG)
  }, [tabs.length, openTab])

  // ⌥W / Option+W → close active tab (skip when a text input is focused)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Use code (not key) — Option+W produces ∑ on macOS, so key === 'w' fails.
      // Only Option/Alt — no Cmd, Ctrl, or Shift held.
      if (
        e.altKey &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.shiftKey &&
        e.code === 'KeyW'
      ) {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        const state = useCfbdExplorerStore.getState()
        if (state.activeTabId) {
          e.preventDefault()
          state.closeTab(state.activeTabId)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const active = tabs.find((t) => t.id === activeTabId) ?? tabs[0]

  return (
    <div className="h-full min-h-0 flex flex-col pt-4">
      {active && <CfbdWorkspace key={`${active.id}-${active.slug}`} tabId={active.id} />}
    </div>
  )
}
