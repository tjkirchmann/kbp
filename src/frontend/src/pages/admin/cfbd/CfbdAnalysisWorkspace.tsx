import { useCfbdExplorerStore } from '@/store/useCfbdExplorerStore'
import type { CfbdViewType, CfbdAnalysisCategory } from '@/store/useCfbdExplorerStore'
import ViewTypeSelector from '@/components/admin/ViewTypeSelector'
import CfbdCategoryBar from './CfbdCategoryBar'
import SeasonDashboard from './SeasonDashboard'

export default function CfbdAnalysisWorkspace({ tabId }: { tabId: string }) {
  const setTabViewType = useCfbdExplorerStore((s) => s.setTabViewType)
  const setAnalysisCategory = useCfbdExplorerStore((s) => s.setAnalysisCategory)
  const tab = useCfbdExplorerStore((s) => s.tabs.find((t) => t.id === tabId))

  if (!tab) return null

  const handleViewTypeChange = (viewType: CfbdViewType) => {
    setTabViewType(tabId, viewType)
  }

  const handleCategorySelect = (category: CfbdAnalysisCategory) => {
    setAnalysisCategory(tabId, category)
  }

  const renderContent = () => {
    switch (tab.analysis.category) {
      case 'seasons':
        return <SeasonDashboard key={`${tabId}-seasons`} />
      default:
        return (
          <div className="flex-1 min-h-0 flex items-center justify-center">
            <span className="text-sm text-muted-foreground">
              Select a category above to explore analytics.
            </span>
          </div>
        )
    }
  }

  return (
    <div className="cfbd-workspace h-full flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <ViewTypeSelector viewType={tab.viewType} onChange={handleViewTypeChange} />
        <div className="flex-1">
          <CfbdCategoryBar
            activeKey={tab.analysis.category}
            onSelect={handleCategorySelect}
          />
        </div>
      </div>

      {renderContent()}
    </div>
  )
}
