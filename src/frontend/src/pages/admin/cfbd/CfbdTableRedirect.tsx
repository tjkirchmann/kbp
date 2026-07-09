import { useEffect, useRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useCfbdExplorerStore } from '@/store/useCfbdExplorerStore'
import { getCfbdTableConfig } from './tableRegistry'

/**
 * Back-compat shim for the old /admin/cfbd/:tableSlug URLs (bookmarks,
 * CoverageDashboard links): opens or focuses a tab for the slug, then
 * lands on the tabbed explorer.
 */
export default function CfbdTableRedirect() {
  const { tableSlug } = useParams<{ tableSlug: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const openOrFocusTab = useCfbdExplorerStore((s) => s.openOrFocusTab)
  const ranRef = useRef(false)

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true
    if (tableSlug && getCfbdTableConfig(tableSlug)) {
      const season = Number(searchParams.get('season'))
      openOrFocusTab(tableSlug, Number.isFinite(season) && season > 0 ? { season } : undefined)
    }
    navigate('/admin/cfbd/explorer', { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
