import { Filter } from 'lucide-react'
import { useEffect } from 'react'
import type { CfbdTableFilters } from '@/services/cfbd/useCfbdAdmin'
import { useCfbdDistinctValues } from '@/services/cfbd/useCfbdAdmin'
import FilterInput from '@/components/admin/filters/FilterInput'
import ClearableSelect from '@/components/admin/filters/ClearableSelect'
import SearchableSelect from '@/components/admin/filters/SearchableSelect'
import SeasonStepper from '@/components/admin/filters/SeasonStepper'
import type { CfbdFilterKey, CfbdTableConfig } from './tableRegistry'

type CfbdTableFiltersShape = CfbdTableFilters

interface FilterBarProps {
  table: CfbdTableConfig
  filters: CfbdTableFiltersShape
  onChange: (key: CfbdFilterKey, value: string) => void
  onReset: () => void
}

const SEASON_TYPE_OPTIONS = [
  { value: 'regular', label: 'Regular' },
  { value: 'postseason', label: 'Postseason' },
  { value: 'bowl', label: 'Bowl' },
]

const STAR_OPTIONS = [
  { value: '5', label: '★★★★★' },
  { value: '4', label: '★★★★☆' },
  { value: '3', label: '★★★☆☆' },
  { value: '2', label: '★★☆☆☆' },
  { value: '1', label: '★☆☆☆☆' },
]

const POLL_OPTIONS = [
  { value: 'AP Top 25', label: 'AP Top 25' },
  { value: 'Coaches Poll', label: 'Coaches Poll' },
  { value: 'Playoff Committee Rankings', label: 'CFP Rankings' },
]

export default function FilterBar({ table, filters, onChange, onReset }: FilterBarProps) {
  const num = (raw: string | undefined) => (raw !== undefined ? String(raw) : '')

  const distinctWeeks = useCfbdDistinctValues(
    table.slug,
    'week',
    table.filterDropdowns?.some((d) => d.key === 'week') ?? false,
  )
  const distinctProviders = useCfbdDistinctValues(
    table.slug,
    'provider',
    table.filterDropdowns?.some((d) => d.key === 'provider') ?? false,
  )
  const distinctCategories = useCfbdDistinctValues(
    table.slug,
    'category',
    table.filterDropdowns?.some((d) => d.key === 'category') ?? false,
  )
  const distinctPositions = useCfbdDistinctValues(
    table.slug,
    'position',
    table.filterDropdowns?.some((d) => d.key === 'position') ?? false,
  )

  // Auto-select default poll when table has poll filter and none is selected
  useEffect(() => {
    if (table.filters.includes('poll') && !filters.poll) {
      onChange('poll', POLL_OPTIONS[0].value)
    }
  }, [table.filters, filters.poll, onChange])

  // Tables that auto-select the first week on load.
  const WEEK_AUTO_SELECT = new Set(['rankings', 'games', 'betting-lines'])

  // Auto-select first week when week dropdown loads and none is selected.
  useEffect(() => {
    if (
      WEEK_AUTO_SELECT.has(table.slug) &&
      table.filterDropdowns?.some((d) => d.key === 'week') &&
      !filters.week &&
      distinctWeeks.data &&
      distinctWeeks.data.length > 0
    ) {
      onChange('week', distinctWeeks.data[0])
    }
  }, [table.slug, table.filterDropdowns, filters.week, distinctWeeks.data, onChange]) // eslint-disable-line react-hooks/exhaustive-deps

  const distinctConferences = useCfbdDistinctValues(
    table.slug,
    'conference',
    table.filterDropdowns?.some((d) => d.key === 'conference') ?? false,
  )
  const distinctClassifications = useCfbdDistinctValues(
    table.slug,
    'classification',
    table.filterDropdowns?.some((d) => d.key === 'classification') ?? false,
  )
  const distinctSchools = useCfbdDistinctValues(
    table.slug,
    'school',
    table.filterDropdowns?.some((d) => d.key === 'school') ?? false,
  )
  const distinctTeams = useCfbdDistinctValues(
    table.slug,
    'team',
    table.filterDropdowns?.some((d) => d.key === 'team') ?? false,
  )
  const distinctStatNames = useCfbdDistinctValues(
    table.slug,
    'stat_name',
    table.filterDropdowns?.some((d) => d.key === 'stat_name') ?? false,
  )

  return (
    <div className="shrink-0 rounded-lg border border-border/20 bg-white/[0.03] px-3 py-2">
      <div className="flex flex-wrap items-center gap-2.5">
        <Filter className="size-3.5 text-muted-foreground shrink-0" />
        {table.filters.includes('season') && (
          <SeasonStepper
            label="Season"
            value={filters.season}
            onChange={(v) => onChange('season', v)}
          />
        )}
        {table.filterDropdowns?.some((d) => d.key === 'week') && distinctWeeks.data && (
          <SearchableSelect
            label="Week"
            options={distinctWeeks.data.map((v: string) => ({ value: v, label: v }))}
            value={filters.week ? String(filters.week) : ''}
            onChange={(v) => onChange('week', v)}
            placeholder="Any week"
            required={WEEK_AUTO_SELECT.has(table.slug)}
          />
        )}
        {table.filters.includes('game_id') && (
          <FilterInput
            label="Game ID"
            type="number"
            placeholder="Required"
            value={num(filters.game_id ? String(filters.game_id) : undefined)}
            onChange={(v) => onChange('game_id', v)}
            width="w-28"
            min={1}
          />
        )}
        {table.filters.includes('season_type') && (
          <ClearableSelect
            label="Season Type"
            options={SEASON_TYPE_OPTIONS}
            value={filters.season_type ?? ''}
            onChange={(v) => onChange('season_type', v)}
            placeholder="Any"
          />
        )}
        {table.filterDropdowns?.some((d) => d.key === 'team') && distinctTeams.data && (
          <SearchableSelect
            label="Team"
            options={distinctTeams.data.map((v: string) => ({ value: v, label: v }))}
            value={filters.team ?? ''}
            onChange={(v) => onChange('team', v)}
            placeholder="Any team"
          />
        )}
        {table.filterDropdowns?.some((d) => d.key === 'stat_name') && distinctStatNames.data && (
          <SearchableSelect
            label="Stat"
            options={distinctStatNames.data.map((v: string) => ({ value: v, label: v }))}
            value={filters.stat_name ?? ''}
            onChange={(v) => onChange('stat_name', v)}
            placeholder="Any stat"
          />
        )}
        {table.filterDropdowns?.some((d) => d.key === 'school') && distinctSchools.data && (
          <SearchableSelect
            label="School"
            options={distinctSchools.data.map((v: string) => ({ value: v, label: v }))}
            value={filters.school ?? ''}
            onChange={(v) => onChange('school', v)}
            placeholder="Any school"
          />
        )}
        {table.filterDropdowns?.some((d) => d.key === 'category') && distinctCategories.data && (
          <SearchableSelect
            label="Category"
            options={distinctCategories.data.map((v: string) => ({ value: v, label: v }))}
            value={filters.category ?? ''}
            onChange={(v) => onChange('category', v)}
            placeholder="Any category"
          />
        )}
        {table.filterDropdowns?.some((d) => d.key === 'provider') && distinctProviders.data && (
          <SearchableSelect
            label="Provider"
            options={distinctProviders.data.map((v: string) => ({ value: v, label: v }))}
            value={filters.provider ?? ''}
            onChange={(v) => onChange('provider', v)}
            placeholder="Any provider"
          />
        )}
        {table.filters.includes('poll') && (
          <ClearableSelect
            label="Poll"
            options={POLL_OPTIONS}
            value={filters.poll ?? POLL_OPTIONS[0].value}
            onChange={(v) => onChange('poll', v)}
            placeholder="Select poll"
            required
          />
        )}
        {table.filterDropdowns?.some((d) => d.key === 'stars') && (
          <ClearableSelect
            label="Stars"
            options={STAR_OPTIONS}
            value={filters.stars ? String(filters.stars) : ''}
            onChange={(v) => onChange('stars', v)}
            placeholder="Any"
          />
        )}
        {table.filterDropdowns?.some((d) => d.key === 'position') && distinctPositions.data && (
          <SearchableSelect
            label="Position"
            options={distinctPositions.data.map((v: string) => ({ value: v, label: v }))}
            value={filters.position ?? ''}
            onChange={(v) => onChange('position', v)}
            placeholder="Any position"
          />
        )}
        {table.filters.includes('search') && (
          <FilterInput
            label="Search"
            placeholder="Search…"
            value={filters.search ?? ''}
            onChange={(v) => onChange('search', v)}
          />
        )}

        {table.filterDropdowns?.some((d) => d.key === 'conference') && distinctConferences.data && (
          <SearchableSelect
            label="Conference"
            options={distinctConferences.data.map((v: string) => ({ value: v, label: v }))}
            value={filters.conference ?? ''}
            onChange={(v) => onChange('conference', v)}
            placeholder="Any conference"
          />
        )}

        {table.filterDropdowns?.some((d) => d.key === 'classification') &&
          distinctClassifications.data && (
            <ClearableSelect
              label="Class"
              options={distinctClassifications.data.map((v: string) => ({
                value: v,
                label: v.toUpperCase(),
              }))}
              value={filters.classification ?? ''}
              onChange={(v) => onChange('classification', v)}
              placeholder="Any"
            />
          )}

        <button
          type="button"
          onClick={onReset}
          className="ml-auto rounded-lg border border-border/20 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
        >
          Reset
        </button>
      </div>
    </div>
  )
}
