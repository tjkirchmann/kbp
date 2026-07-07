import { useEffect } from 'react'
import { useCfbdExplorerStore, DEFAULT_TAB_SLUG } from '@/store/useCfbdExplorerStore'
import CfbdTabStrip from './CfbdTabStrip'
import CfbdWorkspace from './CfbdWorkspace'

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
    <div className="h-full flex flex-col gap-3 min-h-0">
      <CfbdTabStrip />
      {active && <CfbdWorkspace key={active.id} tabId={active.id} />}
    </div>
  )
}
