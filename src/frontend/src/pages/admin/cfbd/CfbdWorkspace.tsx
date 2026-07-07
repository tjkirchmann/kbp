import { useEffect, useMemo, useRef } from 'react'
import AdminTableToolbar from '@/components/admin/AdminTableToolbar'
import AdminVirtualTable, { type AdminTableColumn } from '@/components/admin/AdminVirtualTable'
import { useCfbdTable, type CfbdTableFilters, type CfbdTableResponse } from '@/services/useCfbdAdmin'
import {
  useCfbdExplorerStore,
  defaultTabFilters,
  PAGE_SIZE,
  MAX_RESTORE_LIMIT,
  type CfbdTabState,
} from '@/store/useCfbdExplorerStore'
import CfbdTableSelector from './CfbdTableSelector'
import FilterBar from './FilterBar'
import CfbdDataRow from './CfbdDataRow'
import { CFBD_TABLES, getCfbdTableConfig, type CfbdFilterKey, type CfbdRenderContext } from './tableRegistry'

const ROW_HEIGHT = 44

export default function CfbdWorkspace({ tabId }: { tabId: string }) {
  const tab = useCfbdExplorerStore((s) => s.tabs.find((t) => t.id === tabId))
  if (!tab) return null
  return <CfbdWorkspaceInner tab={tab} />
}

function CfbdWorkspaceInner({ tab }: { tab: CfbdTabState }) {
  const tabId = tab.id
  const table = getCfbdTableConfig(tab.slug) ?? CFBD_TABLES[0]

  const session = useCfbdExplorerStore((s) => s.sessions[tabId])
  const setSession = useCfbdExplorerStore((s) => s.setSession)
  const setTabFilters = useCfbdExplorerStore((s) => s.setTabFilters)
  const patchTabFilters = useCfbdExplorerStore((s) => s.patchTabFilters)
  const setTabSort = useCfbdExplorerStore((s) => s.setTabSort)
  const setTabSelection = useCfbdExplorerStore((s) => s.setTabSelection)
  const setTabScrollTop = useCfbdExplorerStore((s) => s.setTabScrollTop)
  const setTabOffsetLoaded = useCfbdExplorerStore((s) => s.setTabOffsetLoaded)
  const changeTabTable = useCfbdExplorerStore((s) => s.changeTabTable)

  // Lazy session init: a persisted offset > 0 with no session means we just
  // reloaded — restore all rows up to that offset in one larger request.
  useEffect(() => {
    if (session) return
    setSession(tabId, {
      rows: [],
      loadedThrough: 0,
      mode: tab.offset > 0 ? 'restore' : 'paged',
    })
  }, [session, setSession, tabId, tab.offset])

  const mode = session?.mode ?? (tab.offset > 0 ? 'restore' : 'paged')

  const missingGameId = Boolean(table.requiresGameId && !tab.filters.game_id)
  const queryEnabled = !missingGameId

  const queryFilters = useMemo(() => {
    const base = { ...tab.filters, sort: tab.sort?.key, order: tab.sort?.dir }
    if (mode === 'restore') {
      return { ...base, offset: 0, limit: Math.min(tab.offset + PAGE_SIZE, MAX_RESTORE_LIMIT) }
    }
    return { ...base, offset: tab.offset, limit: PAGE_SIZE }
  }, [tab.filters, tab.sort, tab.offset, mode])

  const { data, isLoading } = useCfbdTable(table.slug, queryFilters, queryEnabled)

  // Merge fetched pages into the session. The lastMerged ref makes this run
  // once per data object so background refetches of already-merged pages are
  // ignored instead of re-appended.
  const lastMergedDataRef = useRef<CfbdTableResponse | null>(null)
  useEffect(() => {
    if (!data || !session) return
    if (lastMergedDataRef.current === data) return
    lastMergedDataRef.current = data
    if (session.mode === 'restore' || tab.offset === 0) {
      const loadedThrough =
        session.mode === 'restore'
          ? Math.min(tab.offset, Math.max(0, Math.ceil(data.rows.length / PAGE_SIZE) - 1) * PAGE_SIZE)
          : 0
      setSession(tabId, { rows: data.rows, loadedThrough, mode: session.mode })
    } else if (tab.offset > session.loadedThrough) {
      setSession(tabId, {
        rows: [...session.rows, ...data.rows],
        loadedThrough: tab.offset,
        mode: 'paged',
      })
    }
  }, [data, session, tab.offset, tabId, setSession])

  useEffect(() => {
    if (!data?.seasonMax) return
    if (!table.filters.includes('season')) return
    if (tab.filters.season) return
    if (table.defaultFilters?.season !== 0) return
    patchTabFilters(tabId, { season: data.seasonMax ?? undefined })
  }, [data?.seasonMax, table, tab.filters.season, tabId, patchTabFilters])

  const rows = session?.rows ?? []
  const hasMore = data ? rows.length < data.total : false
  const isLoadingMore = isLoading && mode === 'paged' && tab.offset > 0

  const renderContext: CfbdRenderContext = useMemo(() => {
    const ctx: CfbdRenderContext = { teamLogos: data?.teamLogos ?? {} }
    const heatCols = table.heatColumns
    if (heatCols && rows.length > 0) {
      const ranges: Record<string, { min: number; max: number }> = {}
      for (const col of heatCols) {
        let min = Infinity
        let max = -Infinity
        for (const row of rows) {
          const v = typeof row[col] === 'number' ? (row[col] as number) : Number(row[col])
          if (!Number.isNaN(v)) {
            if (v < min) min = v
            if (v > max) max = v
          }
        }
        if (min !== Infinity) ranges[col] = { min, max }
      }
      ctx.columnRanges = ranges
    }
    return ctx
  }, [data?.teamLogos, table.heatColumns, rows])

  const loadMore = () => {
    if (!hasMore || isLoadingMore || !session) return
    if (session.mode !== 'paged') setSession(tabId, { ...session, mode: 'paged' })
    setTabOffsetLoaded(tabId, session.loadedThrough + PAGE_SIZE)
  }

  const handleSortClick = (key: string) => {
    const prev = tab.sort
    if (!prev || prev.key !== key) setTabSort(tabId, { key, dir: 'asc' })
    else if (prev.dir === 'asc') setTabSort(tabId, { key, dir: 'desc' })
    else setTabSort(tabId, null)
  }

  const selectedIdsSet = useMemo(() => new Set<string | number>(tab.selectedIds), [tab.selectedIds])

  const isFiltered = Object.keys(tab.filters).length > 0
  const syncedValues = rows
    .map((row) => row.last_synced_at)
    .filter((v): v is string => typeof v === 'string')
    .sort()
  const latestSynced = syncedValues.length > 0 ? syncedValues[syncedValues.length - 1] : undefined

  const columns: AdminTableColumn[] = useMemo(
    () =>
      table.columns.map((col) => ({ key: col.key, header: col.header, className: col.className, minWidth: col.minWidth })),
    [table],
  )

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      <CfbdTableSelector activeSlug={table.slug} onSelect={(slug) => changeTabTable(tabId, slug)} />

      <FilterBar
        table={table}
        filters={tab.filters}
        onChange={(key: CfbdFilterKey, rawValue: string) => {
          const next: CfbdTableFilters = { ...tab.filters }
          if (rawValue === '') {
            delete next[key]
          } else if (key === 'season' || key === 'week' || key === 'game_id' || key === 'stars') {
            const parsed = Number(rawValue.trim())
            if (Number.isNaN(parsed)) {
              delete next[key]
            } else {
              next[key] = parsed
            }
          } else {
            next[key] = rawValue
          }
          setTabFilters(tabId, next)
        }}
        onReset={() => setTabFilters(tabId, defaultTabFilters(table.slug))}
      />

      {missingGameId && (
        <div className="shrink-0 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          This table is game-scoped. Enter a Game ID filter to load rows.
        </div>
      )}

      <AdminVirtualTable
        columns={columns}
        rows={rows}
        rowHeight={ROW_HEIGHT}
        isLoading={isLoading && rows.length === 0}
        isFiltered={isFiltered}
        rowKey={(row) => {
          if (row.id != null) return String(row.id)
          if (row.game_id != null) {
            const parts = [row.game_id, row.provider, row.category, row.stat_type, row.player_id, row.drive_number, row.media_type, row.outlet]
              .filter((v) => v != null)
            return parts.join('-')
          }
          if (row.coach_id != null) {
            const parts = [row.coach_id, row.school, row.year].filter((v) => v != null)
            return parts.join('-')
          }
          return `${table.slug}-${rows.indexOf(row)}`
        }}
        renderRow={(row, meta) => (
          <CfbdDataRow
            columns={table.columns}
            row={row}
            context={renderContext}
            columnWidths={meta?.columnWidths}
          />
        )}
        emptyState={
          <p className="text-sm text-muted-foreground py-4">No rows for this table yet.</p>
        }
        noMatchState={
          <p className="text-sm text-muted-foreground py-4">No rows match the current filters.</p>
        }
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        onLoadMore={loadMore}
        resizable
        sortKey={tab.sort?.key}
        sortDir={tab.sort?.dir}
        onSortClick={handleSortClick}
        selectable
        selectedIds={selectedIdsSet}
        onSelectionChange={(ids) => setTabSelection(tabId, Array.from(ids))}
        initialScrollTop={tab.scrollTop}
        onScrollTopChange={(scrollTop) => setTabScrollTop(tabId, scrollTop)}
      />

      <AdminTableToolbar
        count={rows.length}
        total={data?.total ?? 0}
        noun="row"
        countSuffix={
          latestSynced ? `· synced ${new Date(latestSynced).toLocaleString()}` : undefined
        }
      >
        {selectedIdsSet.size > 0 && (
          <>
            <span className="text-sm text-muted-foreground">
              {selectedIdsSet.size} selected
            </span>
            <button
              type="button"
              onClick={() => setTabSelection(tabId, [])}
              className="rounded-lg border border-border/40 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-border transition-colors"
            >
              Clear
            </button>
          </>
        )}
      </AdminTableToolbar>
    </div>
  )
}
