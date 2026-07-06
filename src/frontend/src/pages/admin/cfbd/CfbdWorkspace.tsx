import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import AdminTableToolbar from '@/components/admin/AdminTableToolbar'
import AdminVirtualTable, { type AdminTableColumn } from '@/components/admin/AdminVirtualTable'
import { useCfbdTable, type CfbdTableFilters } from '@/services/useCfbdAdmin'
import CfbdTableSelector from './CfbdTableSelector'
import FilterBar from './FilterBar'
import CfbdDataRow from './CfbdDataRow'
import { CFBD_TABLES, getCfbdTableConfig, type CfbdFilterKey, type CfbdRenderContext } from './tableRegistry'

const ROW_HEIGHT = 44
const PAGE_SIZE = 250

export default function CfbdWorkspace() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { tableSlug } = useParams<{ tableSlug: string }>()
  const activeSlug = tableSlug ?? 'rankings'
  const table = getCfbdTableConfig(activeSlug) ?? CFBD_TABLES[0]

  const [filters, setFilters] = useState<CfbdTableFilters>(() => {
    const initial: CfbdTableFilters = {}
    const seasonParam = searchParams.get('season')
    if (seasonParam) {
      const parsed = Number(seasonParam)
      if (!Number.isNaN(parsed)) initial.season = parsed
    }
    for (const dd of table.filterDropdowns ?? []) {
      if (dd.default !== undefined && !initial[dd.key]) {
        ;(initial as Record<string, unknown>)[dd.key] = dd.default
      }
    }
    return initial
  })
  const [offset, setOffset] = useState(0)
  const [accumulatedRows, setAccumulatedRows] = useState<Record<string, unknown>[]>([])
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null)

  useEffect(() => {
    const defaults: CfbdTableFilters = {}
    for (const dd of table.filterDropdowns ?? []) {
      if (dd.default !== undefined) {
        ;(defaults as Record<string, unknown>)[dd.key] = dd.default
      }
    }
    setFilters(defaults)
  }, [table.slug, table.filterDropdowns])

  const filterKey = useMemo(
    () => JSON.stringify({ slug: table.slug, ...filters, sort }),
    [table.slug, filters, sort],
  )
  const previousFilterKeyRef = useRef(filterKey)

  useEffect(() => {
    if (previousFilterKeyRef.current === filterKey) return
    previousFilterKeyRef.current = filterKey
    setOffset(0)
  }, [filterKey])

  const missingGameId = Boolean(table.requiresGameId && !filters.game_id)
  const queryEnabled = !missingGameId

  const queryFilters = useMemo(
    () => ({ ...filters, offset, limit: PAGE_SIZE, sort: sort?.key, order: sort?.dir }),
    [filters, offset, sort],
  )

  const { data, isLoading } = useCfbdTable(table.slug, queryFilters, queryEnabled)

  useEffect(() => {
    if (!data) return

    setAccumulatedRows((prev) => (offset === 0 ? data.rows : [...prev, ...data.rows]))
  }, [data, offset])

  useEffect(() => {
    if (!data?.seasonMax) return
    if (!table.filters.includes('season')) return
    if (filters.season) return
    if (table.defaultFilters?.season !== 0) return
    setFilters((prev) => ({ ...prev, season: data.seasonMax ?? undefined }))
  }, [data?.seasonMax, table, filters.season])

  const rows = accumulatedRows
  const hasMore = data ? rows.length < data.total : false
  const isLoadingMore = isLoading && offset > 0

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
    if (!hasMore || isLoadingMore) return
    setOffset((prev) => prev + PAGE_SIZE)
  }

  const handleSortClick = (key: string) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' }
      if (prev.dir === 'asc') return { key, dir: 'desc' }
      return null
    })
  }

  const isFiltered = Object.keys(filters).length > 0
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
    <div className="h-full flex flex-col gap-3">
      <CfbdTableSelector
        activeSlug={table.slug}
        onSelect={(slug) => {
          const params = new URLSearchParams()
          if (filters.season) params.set('season', String(filters.season))
          const qs = params.toString()
          navigate(`/admin/cfbd/${slug}${qs ? `?${qs}` : ''}`)
        }}
      />

      <FilterBar
        table={table}
        filters={filters}
        onChange={(key: CfbdFilterKey, rawValue: string) => {
          setFilters((prev) => {
            const next: CfbdTableFilters = { ...prev }
            if (rawValue === '') {
              delete next[key]
              return next
            }

            if (key === 'season' || key === 'week' || key === 'game_id' || key === 'stars') {
              const parsed = Number(rawValue.trim())
              if (Number.isNaN(parsed)) {
                delete next[key]
              } else {
                next[key] = parsed
              }
              return next
            }

            next[key] = rawValue
            return next
          })
        }}
        onReset={() => {
          const defaults: CfbdTableFilters = {}
          for (const dd of table.filterDropdowns ?? []) {
            if (dd.default !== undefined) {
              ;(defaults as Record<string, unknown>)[dd.key] = dd.default
            }
          }
          setFilters(defaults)
        }}
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
        isLoading={isLoading && offset === 0 && accumulatedRows.length === 0}
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
        sortKey={sort?.key}
        sortDir={sort?.dir}
        onSortClick={handleSortClick}
      />

      <AdminTableToolbar
        count={rows.length}
        total={data?.total ?? 0}
        noun="row"
        countSuffix={
          latestSynced ? `· synced ${new Date(latestSynced).toLocaleString()}` : undefined
        }
      />
    </div>
  )
}
