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

  const active = tabs.find((t) => t.id === activeTabId) ?? tabs[0]

  return (
    <div className="h-full min-h-0 flex flex-col pt-4">
      {active && <CfbdWorkspace key={active.id} tabId={active.id} />}
    </div>
  )
}
