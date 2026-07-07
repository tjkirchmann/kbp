import { useEffect, useMemo, useRef, useState, useCallback, forwardRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '@clerk/react'
import { remoteModel, defaultOffsetViewportHandler } from '@virtuoso.dev/data-table'
import AdminTableToolbar from '@/components/admin/AdminTableToolbar'
import { apiFetch } from '@/lib/api'
import { DataTable, DataTableColumn, DataTableColumnHeader, DataTableCell, HeaderStart, HeaderOverlay, HeaderEdge } from '@/components/ui/data-table'
import { ResizeHandle } from '@/components/ui/data-table/column-resize'
import { ReorderGrip, ReorderDropZone } from '@/components/ui/data-table/column-reorder'
import { SortableHeaderLabel } from '@/components/ui/data-table/column-sort'
import { CfbdRenderProvider, type CfbdRenderContextValue } from '@/components/admin/CfbdRenderContext'
import CfbdTableSelector from './CfbdTableSelector'
import FilterBar from './FilterBar'
import { CFBD_TABLES, getCfbdTableConfig, type CfbdFilterKey } from './tableRegistry'

import type { Row } from '@virtuoso.dev/data-table'
import type { CfbdTableFilters } from '@/services/useCfbdAdmin'

type CfbdRow = Row<Record<string, unknown>>

const PAGE_SIZE = 250

/** Build default filters from table config (dropdown defaults). */
function buildDefaultFilters(table: ReturnType<typeof getCfbdTableConfig>) {
  const defaults: Record<string, unknown> = {}
  for (const dd of table?.filterDropdowns ?? []) {
    if (dd.default !== undefined) defaults[dd.key] = dd.default
  }
  return defaults
}

/** Build the query string from params for the API call. */
function buildQueryString(params: Record<string, unknown>, offset: number, limit: number): string {
  const p = new URLSearchParams()
  p.set('offset', String(offset))
  p.set('limit', String(limit))
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '' || key === 'slug') continue
    p.set(key, String(value))
  }
  return p.toString()
}

/** Stable row key for CFBD tables. */
function computeRowKey(row: CfbdRow | Row<unknown>) {
  const data = row.data as Record<string, unknown> | undefined
  if (!data) return `placeholder-${row.index}`
  if (data.id != null) return String(data.id)
  if (data.game_id != null) {
    const parts = [data.game_id, data.provider, data.category, data.stat_type, data.player_id, data.drive_number, data.media_type, data.outlet].filter((v) => v != null)
    return parts.join('-')
  }
  if (data.coach_id != null) {
    const parts = [data.coach_id, data.school, data.year].filter((v) => v != null)
    return parts.join('-')
  }
  return `${data.id ?? 'row'}-${row.index}`
}

function toCellValue(value: unknown): string {
  if (value === null || value === undefined) return '\u2014'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

export default function CfbdWorkspace() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { tableSlug } = useParams<{ tableSlug: string }>()
  const activeSlug = tableSlug ?? 'rankings'
  const table = getCfbdTableConfig(activeSlug) ?? CFBD_TABLES[0]
  const { getToken } = useAuth()

  // ── Filter state (source of truth for FilterBar UI) ───────────
  const [filters, setFilters] = useState<CfbdTableFilters>(() => {
    const initial: CfbdTableFilters = {}
    const seasonParam = searchParams.get('season')
    if (seasonParam) {
      const parsed = Number(seasonParam)
      if (!Number.isNaN(parsed)) initial.season = parsed
    }
    Object.assign(initial, buildDefaultFilters(table))
    return initial
  })

  // Reset filters when table changes
  useEffect(() => {
    setFilters(buildDefaultFilters(table))
  }, [table.slug])

  // ── Team logos & season auto-select ───────────────────────────
  const [teamLogos, setTeamLogos] = useState<Record<string, string | null>>({})
  const seasonMaxRef = useRef<number | null>(null)
  const seasonAssignedRef = useRef(false)

  // ── remoteModel ───────────────────────────────────────────────
  const filtersRef = useRef(filters)
  filtersRef.current = filters

  const modelRef = useRef<ReturnType<typeof remoteModel<Record<string, unknown>>>>(null!)

  const [model] = useState(() => {
    const m = remoteModel<Record<string, unknown>>({
      fetch: async ({ offset, limit, params, signal }) => {
        const token = await getToken()
        const slug = params.slug as string
        const qs = buildQueryString(params, offset, limit)
        const data = await apiFetch(token, `/admin/cfbd/${slug}?${qs}`, { signal })

        // Accumulate team logos across fetches
        if (data.team_logos) {
          setTeamLogos((prev) => ({ ...prev, ...data.team_logos }))
        }

        // Capture seasonMax for auto-select
        if (data.season_max != null) {
          seasonMaxRef.current = data.season_max
        }

        return { rows: data.rows as Record<string, unknown>[], totalCount: data.total as number }
      },
      initialParams: {
        slug: table.slug,
        ...buildDefaultFilters(table),
      },
      onViewportChange: defaultOffsetViewportHandler,
      pageSize: PAGE_SIZE,
      actions: {
        setFilters: {
          strategy: 'supersede' as const,
          handler: ({ params, payload }) => ({ slug: params.slug, ...payload as Record<string, unknown> }),
        },
        sort: {
          strategy: 'supersede' as const,
          handler: ({ params, payload }) => {
            if (!payload || !(payload as Record<string, unknown>).field) {
              const { sort: _s, order: _o, ...rest } = params as Record<string, unknown>
              return rest
            }
            const p = payload as Record<string, unknown>
            return { ...params, sort: p.field, order: p.direction }
          },
        },
      },
    })
    modelRef.current = m
    return m
  })

  // Sync filter changes to the model (skip initial mount)
  const filtersInitializedRef = useRef(false)
  useEffect(() => {
    if (!filtersInitializedRef.current) {
      filtersInitializedRef.current = true
      return
    }
    modelRef.current?.send({ action: 'setFilters', payload: filters })
  }, [filters])

  const missingGameId = Boolean(table.requiresGameId && !filters.game_id)

  // ── Table height tracking ────────────────────────────────────
  const tableRef = useRef<HTMLDivElement>(null)
  const [tableH, setTableH] = useState(0)

  useEffect(() => {
    const el = tableRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const h = e?.contentRect?.height ?? 0
      if (h > 0) setTableH(h)
    })
    ro.observe(el)
    setTableH(el.clientHeight || 0)
    return () => ro.disconnect()
  }, [])

  // ── Rendered data callbacks (heat ranges + toolbar) ──────────
  const [columnRanges, setColumnRanges] = useState<Record<string, { min: number; max: number }>>({})
  const [renderedCount, setRenderedCount] = useState(0)
  const latestSyncedRef = useRef<string | undefined>()

  const handleRenderedDataChange = useCallback(
    (rows: CfbdRow[]) => {
      const validRows = rows.filter(Boolean)
      setRenderedCount(validRows.length)

      // Heat column ranges
      const heatCols = table.heatColumns
      if (heatCols?.length) {
        const ranges: Record<string, { min: number; max: number }> = {}
        for (const col of heatCols) {
          let min = Infinity
          let max = -Infinity
          for (const row of validRows) {
            if (!row.data) continue
            const v = Number(row.data[col])
            if (!Number.isNaN(v)) {
              if (v < min) min = v
              if (v > max) max = v
            }
          }
          if (min !== Infinity) ranges[col] = { min, max }
        }
        setColumnRanges(ranges)
      }

      // Latest synced timestamp
      const synced = validRows
        .map((r) => r.data?.last_synced_at)
        .filter((v): v is string => typeof v === 'string')
        .sort()
      latestSyncedRef.current = synced.length > 0 ? synced[synced.length - 1] : undefined
    },
    [table.heatColumns],
  )

  // Auto-assign season on first data load
  useEffect(() => {
    if (
      seasonAssignedRef.current ||
      !seasonMaxRef.current ||
      filters.season != null ||
      !table.filters.includes('season') ||
      table.defaultFilters?.season !== 0
    ) {
      return
    }
    seasonAssignedRef.current = true
    setFilters((prev) => ({ ...prev, season: seasonMaxRef.current! }))
  }, [filters.season, table])

  // ── Render context (provided via React Context to cell renderers) ──
  const renderContext: CfbdRenderContextValue = useMemo(
    () => ({ teamLogos, columnRanges }),
    [teamLogos, columnRanges],
  )

  // ── Render ────────────────────────────────────────────────────
  const columns = table.columns

  return (
    <div className="h-full flex flex-col gap-1.5">
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
            const next = { ...prev } as Record<string, unknown>
            if (rawValue === '') {
              delete next[key]
              return next as CfbdTableFilters
            }
            if (key === 'season' || key === 'week' || key === 'game_id' || key === 'stars') {
              const parsed = Number(rawValue.trim())
              if (Number.isNaN(parsed)) {
                delete next[key]
              } else {
                next[key] = parsed
              }
              return next as CfbdTableFilters
            }
            next[key] = rawValue
            return next as CfbdTableFilters
          })
        }}
        onReset={() => {
          const defaults = buildDefaultFilters(table)
          setFilters(defaults as CfbdTableFilters)
        }}
      />

      {missingGameId && (
        <div className="shrink-0 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          This table is game-scoped. Enter a Game ID filter to load rows.
        </div>
      )}

      {!missingGameId && (
        <CfbdRenderProvider value={renderContext}>
          <div ref={tableRef} className="flex-1 min-h-0 overflow-hidden rounded-2xl">
          <DataTable
            key={table.slug}
            className="bg-white/[0.03] border border-border/20 rounded-2xl"
            style={{ height: tableH || 400 }}
            model={model}
            computeRowKey={computeRowKey}
            onRenderedDataChange={handleRenderedDataChange}
            components={{
              Row: forwardRef<any, any>(({ style, ...props }, ref) => (
                <div
                  ref={ref}
                  {...props}
                  className="flex items-center border-t border-border/20 transition-colors hover:bg-[rgba(26,30,42,0.4)]"
                  style={{ ...style, height: 44 }}
                />
              )) as any,
            }}
          >
            {columns.map((col) => (
              <DataTableColumn key={col.key} field={col.key}>
                <DataTableColumnHeader className="px-5">
                  <HeaderStart component={ReorderGrip} />
                  <HeaderOverlay component={ReorderDropZone} />
                  {() => (
                    <SortableHeaderLabel field={col.key}>
                      {String(col.header)}
                    </SortableHeaderLabel>
                  )}
                  <HeaderEdge>
                    {(params) => <ResizeHandle {...(params as any)} />}
                  </HeaderEdge>
                </DataTableColumnHeader>
                <DataTableCell className="px-5 py-0">
                  {({ cellValue, row }) => {
                    if (col.render) {
                      return col.render(cellValue, row.data as Record<string, unknown>, renderContext)
                    }
                    if (col.rawCell) return toCellValue(cellValue)
                    return <span className="text-xs text-muted-foreground truncate block">{toCellValue(cellValue)}</span>
                  }}
                </DataTableCell>
              </DataTableColumn>
            ))}
          </DataTable>
          </div>
        </CfbdRenderProvider>
      )}

      <AdminTableToolbar
        count={renderedCount}
        total={0}
        noun="row"
        countSuffix={
          latestSyncedRef.current ? `· synced ${new Date(latestSyncedRef.current).toLocaleString()}` : undefined
        }
      />
    </div>
  )
}
