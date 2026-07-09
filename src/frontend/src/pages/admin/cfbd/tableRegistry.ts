import React from 'react'

export type CfbdTableGroup = 'Ratings' | 'Season' | 'Recruiting' | 'Games' | 'Dimensions'

export type CfbdFilterKey =
  | 'season'
  | 'season_type'
  | 'week'
  | 'team'
  | 'school'
  | 'conference'
  | 'classification'
  | 'game_id'
  | 'provider'
  | 'poll'
  | 'position'
  | 'category'
  | 'stat_name'
  | 'stars'
  | 'search'

export interface CfbdFilterDropdown {
  key: CfbdFilterKey
  default?: string
}

export interface CfbdRenderContext {
  teamLogos?: Record<string, string | null>
  /** Min/max for heat-map columns, computed from displayed rows. */
  columnRanges?: Record<string, { min: number; max: number }>
}

export interface CfbdColumnConfig {
  key: string
  header: React.ReactNode
  className?: string
  render?: (
    value: unknown,
    row: Record<string, unknown>,
    ctx?: CfbdRenderContext,
  ) => React.ReactNode
  /** When true, the cell is rendered without the default truncate/text wrapper. Use for images, badges, etc. */
  rawCell?: boolean
  /** Minimum column width in px (used when resizable is enabled). */
  minWidth?: number
}

export interface CfbdTableConfig {
  slug: string
  label: string
  group: CfbdTableGroup
  columns: CfbdColumnConfig[]
  filters: CfbdFilterKey[]
  /** Filters that should render as data-driven dropdowns (distinct values from the DB). */
  filterDropdowns?: CfbdFilterDropdown[]
  defaultFilters?: Partial<Record<CfbdFilterKey, string | number>>
  requiresGameId?: boolean
  /** Columns whose displayed values drive a min→max color scale via heatChip. */
  heatColumns?: string[]
  /** Enable column resize handles + horizontal scrolling. */
  resizable?: boolean
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

function rankBadge(value: unknown): React.ReactNode {
  const text = value == null ? '—' : String(value)
  return React.createElement(
    'span',
    {
      className:
        'inline-flex min-w-7 justify-center rounded-full border border-primary/30 bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary',
    },
    text,
  )
}

function ratingBar(value: unknown, max = 100): React.ReactNode {
  const numeric = asNumber(value)
  if (numeric == null) return '—'
  const width = Math.max(0, Math.min(100, (numeric / max) * 100))
  return React.createElement(
    'div',
    { className: 'flex items-center gap-2' },
    React.createElement(
      'span',
      { className: 'w-10 text-right text-xs tabular-nums' },
      numeric.toFixed(1),
    ),
    React.createElement(
      'span',
      { className: 'relative h-1.5 w-16 overflow-hidden rounded-full bg-white/10' },
      React.createElement('span', {
        className: 'absolute left-0 top-0 h-full rounded-full bg-primary/70',
        style: { width: `${width}%` },
      }),
    ),
  )
}

/** Diverging bar with a 0-line in the centre — negative values extend left,
 *  positive values extend right.  Max controls the full-scale width on each side.
 *
 *  Usage: `render: (value) => divergingBar(value, 35)`
 */
function divergingBar(value: unknown, max = 35): React.ReactNode {
  const numeric = asNumber(value)
  if (numeric == null) return '—'
  const pct = Math.min(100, (Math.abs(numeric) / max) * 100)
  const isNeg = numeric < 0
  return React.createElement(
    'div',
    { className: 'flex items-center gap-2' },
    React.createElement(
      'span',
      { className: 'w-10 text-right text-xs tabular-nums' },
      numeric.toFixed(1),
    ),
    React.createElement(
      'span',
      {
        className: 'relative h-1.5 w-16 overflow-hidden rounded-full bg-white/10 flex items-center',
      },
      // 0-line
      React.createElement('span', {
        className: 'absolute left-1/2 top-0 w-px h-full bg-border/60 -translate-x-px',
      }),
      React.createElement('span', {
        className: `absolute top-0 h-full rounded-full ${isNeg ? 'bg-warning/70 right-1/2' : 'bg-primary/70 left-1/2'}`,
        style: { width: `${pct}%` },
      }),
    ),
  )
}

function percent(value: unknown): React.ReactNode {
  const numeric = asNumber(value)
  if (numeric == null) return '—'
  return `${(numeric * 100).toFixed(1)}%`
}

function recordTriplet(wins: unknown, losses: unknown, ties: unknown): React.ReactNode {
  const w = wins == null ? '0' : String(wins)
  const l = losses == null ? '0' : String(losses)
  const t = ties == null ? '0' : String(ties)
  return `${w}-${l}-${t}`
}

function dateRange(start: unknown, end: unknown): React.ReactNode {
  const _fmt = (raw: unknown) => {
    if (raw == null || raw === '') return null
    const d = new Date(raw as string)
    if (isNaN(d.getTime())) return String(raw)
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ]
    return `${months[d.getMonth()]} ${d.getDate()}`
  }
  const left = _fmt(start)
  const right = _fmt(end)
  if (!left && !right) return '—'
  return React.createElement(
    'span',
    { className: 'text-[11px] text-muted-foreground' },
    `${left || '—'}  →  ${right || '—'}`,
  )
}

function statPill(value: unknown): React.ReactNode {
  return React.createElement(
    'span',
    {
      className:
        'inline-flex rounded border border-border/30 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground',
    },
    value == null ? '—' : String(value),
  )
}

function stars(value: unknown): React.ReactNode {
  const numeric = asNumber(value)
  if (numeric == null) return '—'
  const count = Math.max(0, Math.min(5, Math.round(numeric)))
  return `${'★'.repeat(count)}${'☆'.repeat(5 - count)}`
}

function _talentChip(value: unknown): React.ReactNode {
  const numeric = asNumber(value)
  if (numeric == null) return '—'
  return React.createElement(
    'span',
    {
      className:
        'inline-flex rounded-full border border-primary/30 bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary',
    },
    numeric.toFixed(1),
  )
}

/** Return a render function that colours a rounded-pill chip on a
 *  warm (amber) → cool (blue) gradient scaled to the column's min/max
 *  across the currently displayed/filtered rows.
 *
 *  Usage: `render: heatChip('talent')`
 */
function heatChip(columnKey: string): CfbdColumnConfig['render'] {
  return (value: unknown, _row: Record<string, unknown>, ctx?: CfbdRenderContext) => {
    const numeric = asNumber(value)
    if (numeric == null) return '—'

    const range = ctx?.columnRanges?.[columnKey]
    const min = range?.min ?? 0
    const max = range?.max ?? 1
    const span = max - min || 1
    const t = Math.max(0, Math.min(1, (numeric - min) / span))

    // Interpolate from warning amber (low) to primary blue (high)
    // --color-warning  #f0a429  →  --color-primary  #009cde
    const r = Math.round(0xf0 + (0x00 - 0xf0) * t)
    const g = Math.round(0xa4 + (0x9c - 0xa4) * t)
    const b = Math.round(0x29 + (0xde - 0x29) * t)

    return React.createElement(
      'span',
      {
        className: 'inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold',
        style: {
          backgroundColor: `rgba(${r},${g},${b},0.55)`,
          borderColor: `rgba(${r},${g},${b},0.7)`,
          color: '#fff',
        },
      },
      numeric.toFixed(1),
    )
  }
}

function _boldText(value: unknown): React.ReactNode {
  if (value == null || value === '') return '—'
  return React.createElement('span', { className: 'font-semibold text-foreground' }, String(value))
}

function colorCircle(value: unknown): React.ReactNode {
  if (value == null || value === '') return '—'
  return React.createElement('span', {
    className: 'inline-block size-4 rounded-full border border-border/40',
    style: { backgroundColor: String(value) },
  })
}

function _logoImage(value: unknown): React.ReactNode {
  if (!Array.isArray(value) || value.length === 0) return '—'
  const url = String(value[0])
  if (!url) return '—'
  return React.createElement('img', {
    src: url,
    alt: '',
    className: 'size-5 object-contain',
    loading: 'lazy',
  })
}

function twitterLink(value: unknown): React.ReactNode {
  if (value == null || value === '') return '—'
  const handle = String(value)
  const stripped = handle.startsWith('@') ? handle.slice(1) : handle
  return React.createElement(
    'a',
    {
      href: `https://twitter.com/${stripped}`,
      target: '_blank',
      rel: 'noopener noreferrer',
      className: 'text-primary hover:underline',
    },
    handle,
  )
}

// ── Datetime render helpers ──────────────────────────────────────────────

function _parseDate(raw: unknown): Date | null {
  if (raw == null || raw === '') return null
  const d = new Date(raw as string)
  return isNaN(d.getTime()) ? null : d
}

const _MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function _formatAbsolute(d: Date): string {
  const h = d.getHours()
  const m = d.getMinutes().toString().padStart(2, '0')
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}, ${h12}:${m} ${ampm}`
}

function syncedAtCell(value: unknown): React.ReactNode {
  const d = _parseDate(value)
  if (!d) return '—'
  const abs = _formatAbsolute(d)
  const now = Date.now()
  const diff = now - d.getTime()
  const sec = Math.floor(diff / 1000)
  const min = Math.floor(sec / 60)
  const hr = Math.floor(min / 60)
  const day = Math.floor(hr / 24)

  let label: string
  if (sec < 60) label = 'just now'
  else if (min < 60) label = `${min}m ago`
  else if (hr < 24) label = `${hr}h ago`
  else if (day < 7) label = `${day}d ago`
  else if (day < 365) label = `${_MONTHS[d.getMonth()]} ${d.getDate()}`
  else label = `${_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`

  return React.createElement(
    'span',
    {
      className: 'text-[11px] text-muted-foreground',
      title: abs,
    },
    label,
  )
}

function dateCell(value: unknown): React.ReactNode {
  const d = _parseDate(value)
  if (!d) return '—'
  return React.createElement(
    'span',
    { className: 'text-[11px] text-muted-foreground' },
    `${_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`,
  )
}

function timeCell(value: unknown): React.ReactNode {
  const d = _parseDate(value)
  if (!d) return '—'
  const h = d.getHours()
  const m = d.getMinutes().toString().padStart(2, '0')
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return React.createElement(
    'span',
    { className: 'text-[11px] text-muted-foreground' },
    `${h12}:${m} ${ampm}`,
  )
}

function teamNameWithLogo(
  value: unknown,
  _row: Record<string, unknown>,
  ctx?: { teamLogos?: Record<string, string | null> },
): React.ReactNode {
  if (value == null || value === '') return '—'
  const name = String(value)
  const logo = ctx?.teamLogos?.[name]
  return React.createElement(
    'span',
    { className: 'flex items-center gap-1.5' },
    logo
      ? React.createElement('img', {
          key: 'logo',
          src: logo,
          alt: '',
          className: 'size-4 object-contain shrink-0',
          loading: 'lazy',
        })
      : null,
    React.createElement('span', { key: 'name' }, name),
  )
}

export const CFBD_TABLES: CfbdTableConfig[] = [
  {
    slug: 'rankings',
    label: 'Poll Rankings',
    group: 'Ratings',
    columns: [
      { key: 'season', header: 'Season', className: 'flex-[1]' },
      { key: 'week', header: 'Week', className: 'flex-[1]' },
      { key: 'poll', header: 'Poll', className: 'flex-[2]' },
      { key: 'rank', header: 'Rank', className: 'flex-[1]', render: (value) => rankBadge(value) },
      { key: 'school', header: 'School', className: 'flex-[2]', render: teamNameWithLogo },
      { key: 'conference', header: 'Conference', className: 'flex-[2]' },
      { key: 'points', header: 'Points', className: 'flex-[1]' },
    ],
    filters: ['season', 'poll'],
    filterDropdowns: [{ key: 'week' }],
    defaultFilters: { season: 0 },
  },
  {
    slug: 'sp-ratings',
    label: 'SP+ Ratings',
    group: 'Ratings',
    columns: [
      { key: 'year', header: 'Season', className: 'flex-[1]' },
      {
        key: 'ranking',
        header: 'Rank',
        className: 'flex-[1]',
        render: (value) => rankBadge(value),
      },
      { key: 'team', header: 'Team', className: 'flex-[2]', render: teamNameWithLogo },
      { key: 'conference', header: 'Conference', className: 'flex-[2]' },
      {
        key: 'rating',
        header: 'Rating',
        className: 'flex-[1]',
        render: (value) => ratingBar(value, 45),
      },
      {
        key: 'offense_rating',
        header: 'Off',
        className: 'flex-[1]',
        render: (value) => ratingBar(value, 50),
      },
      {
        key: 'defense_rating',
        header: 'Def',
        className: 'flex-[1]',
        render: (value) => ratingBar(value, 50),
      },
    ],
    filters: ['season', 'search'],
    filterDropdowns: [{ key: 'conference' }],
    defaultFilters: { season: 0 },
  },
  {
    slug: 'srs-ratings',
    label: 'SRS Ratings',
    group: 'Ratings',
    columns: [
      { key: 'year', header: 'Season', className: 'flex-[1]' },
      {
        key: 'ranking',
        header: 'Rank',
        className: 'flex-[1]',
        render: (value) => rankBadge(value),
      },
      { key: 'team', header: 'Team', className: 'flex-[2]', render: teamNameWithLogo },
      { key: 'conference', header: 'Conference', className: 'flex-[2]' },
      { key: 'division', header: 'Division', className: 'flex-[1]' },
      {
        key: 'rating',
        header: 'Rating',
        className: 'flex-[1]',
        render: (value) => ratingBar(value, 45),
      },
    ],
    filters: ['season', 'search'],
    filterDropdowns: [{ key: 'conference' }],
    defaultFilters: { season: 0 },
  },
  {
    slug: 'elo-ratings',
    label: 'Elo Ratings',
    group: 'Ratings',
    columns: [
      { key: 'year', header: 'Season', className: 'flex-[1]' },
      { key: 'team', header: 'Team', className: 'flex-[2]', render: teamNameWithLogo },
      { key: 'conference', header: 'Conference', className: 'flex-[2]' },
      {
        key: 'elo',
        header: 'Elo',
        className: 'flex-[1]',
        render: (value) => ratingBar(value, 2200),
      },
      { key: 'last_synced_at', header: 'Last Synced', className: 'flex-[2]', render: syncedAtCell },
    ],
    filters: ['season', 'search'],
    filterDropdowns: [{ key: 'conference' }],
    defaultFilters: { season: 0 },
  },
  {
    slug: 'fpi-ratings',
    label: 'FPI Ratings',
    group: 'Ratings',
    columns: [
      { key: 'year', header: 'Season', className: 'flex-[1]' },
      { key: 'team', header: 'Team', className: 'flex-[2]', render: teamNameWithLogo },
      { key: 'conference', header: 'Conference', className: 'flex-[2]' },
      {
        key: 'fpi',
        header: 'FPI',
        className: 'flex-[1]',
        render: (value) => divergingBar(value, 35),
      },
      {
        key: 'efficiency_overall',
        header: 'Eff (All)',
        className: 'flex-[1]',
        render: (value) => ratingBar(value, 2),
      },
      {
        key: 'efficiency_offense',
        header: 'Eff (Off)',
        className: 'flex-[1]',
        render: (value) => ratingBar(value, 2),
      },
      {
        key: 'efficiency_defense',
        header: 'Eff (Def)',
        className: 'flex-[1]',
        render: (value) => ratingBar(value, 2),
      },
    ],
    filters: ['season', 'search'],
    filterDropdowns: [{ key: 'conference' }],
    defaultFilters: { season: 0 },
  },
  {
    slug: 'calendar',
    label: 'Calendar',
    group: 'Season',
    columns: [
      { key: 'season', header: 'Season', className: 'flex-[1]' },
      { key: 'season_type', header: 'Type', className: 'flex-[1]' },
      { key: 'week', header: 'Week', className: 'flex-[1]' },
      {
        key: 'date_window',
        header: 'Date Window',
        className: 'flex-[3]',
        render: (_value, row) => dateRange(row.start_date, row.end_date),
      },
      {
        key: 'game_window',
        header: 'Game Window',
        className: 'flex-[3]',
        render: (_value, row) => dateRange(row.first_game_start, row.last_game_start),
      },
    ],
    filters: ['season', 'season_type'],
    defaultFilters: { season: 0 },
    filterDropdowns: [{ key: 'week' }],
  },
  {
    slug: 'team-records',
    label: 'Team Records',
    group: 'Season',
    columns: [
      { key: 'year', header: 'Season', className: 'flex-[1]' },
      { key: 'team', header: 'Team', className: 'flex-[2]', render: teamNameWithLogo },
      { key: 'conference', header: 'Conference', className: 'flex-[2]' },
      {
        key: 'record',
        header: 'Record',
        className: 'flex-[1]',
        render: (_value, row) => recordTriplet(row.total_wins, row.total_losses, row.total_ties),
      },
      {
        key: 'conference_record',
        header: 'Conf',
        className: 'flex-[1]',
        render: (_value, row) =>
          recordTriplet(row.conference_wins, row.conference_losses, row.conference_ties),
      },
      {
        key: 'home_record',
        header: 'Home',
        className: 'flex-[1]',
        render: (_value, row) => recordTriplet(row.home_wins, row.home_losses, row.home_ties),
      },
      {
        key: 'expected_wins',
        header: 'Exp W',
        className: 'flex-[1]',
        render: (value) => ratingBar(value, 15),
      },
    ],
    filters: ['season'],
    filterDropdowns: [{ key: 'team' }, { key: 'conference' }],
    defaultFilters: { season: 0 },
  },
  {
    slug: 'team-season-stats',
    label: 'Team Season Stats',
    group: 'Season',
    columns: [
      { key: 'season', header: 'Season', className: 'flex-[1]' },
      { key: 'team', header: 'Team', className: 'flex-[2]', render: teamNameWithLogo },
      { key: 'conference', header: 'Conference', className: 'flex-[2]' },
      {
        key: 'stat_name',
        header: 'Stat',
        className: 'flex-[2]',
        render: (value) => statPill(value),
      },
      { key: 'stat_value', header: 'Value', className: 'flex-[1]' },
    ],
    filters: ['season'],
    filterDropdowns: [{ key: 'team' }, { key: 'conference' }, { key: 'stat_name' }],
    defaultFilters: { season: 0 },
  },
  {
    slug: 'team-adv-stats',
    label: 'Advanced Team Stats',
    group: 'Season',
    columns: [
      { key: 'season', header: 'Season', className: 'flex-[1]' },
      { key: 'team', header: 'Team', className: 'flex-[2]', render: teamNameWithLogo },
      { key: 'conference', header: 'Conference', className: 'flex-[2]' },
      { key: 'stat', header: 'Stat', className: 'flex-[2]', render: (value) => statPill(value) },
      { key: 'value', header: 'Value', className: 'flex-[1]' },
    ],
    filters: ['season'],
    filterDropdowns: [{ key: 'team' }, { key: 'conference' }, { key: 'stat_name' }],
    defaultFilters: { season: 0 },
  },
  {
    slug: 'team-talent',
    label: 'Team Talent',
    group: 'Season',
    columns: [
      { key: 'year', header: 'Season', className: 'flex-[1]' },
      { key: 'school', header: 'School', className: 'flex-[2]', render: teamNameWithLogo },
      {
        key: 'talent',
        header: 'Talent',
        className: 'flex-[1]',
        render: heatChip('talent'),
      },
      { key: 'last_synced_at', header: 'Last Synced', className: 'flex-[2]', render: syncedAtCell },
    ],
    filters: ['season', 'search'],
    filterDropdowns: [{ key: 'school' }],
    defaultFilters: { season: 0 },
    heatColumns: ['talent'],
  },
  {
    slug: 'returning-production',
    label: 'Returning Production',
    group: 'Season',
    columns: [
      { key: 'season', header: 'Season', className: 'flex-[1]' },
      { key: 'team', header: 'Team', className: 'flex-[2]', render: teamNameWithLogo },
      { key: 'conference', header: 'Conference', className: 'flex-[2]' },
      {
        key: 'percent_ppa',
        header: '% PPA',
        className: 'flex-[1]',
        render: (value) => percent(value),
      },
      { key: 'usage', header: 'Usage', className: 'flex-[1]', render: (value) => percent(value) },
      {
        key: 'total_ppa',
        header: 'Total PPA',
        className: 'flex-[1]',
        render: (value) => ratingBar(value, 250),
      },
    ],
    filters: ['season'],
    filterDropdowns: [{ key: 'team' }, { key: 'conference' }],
    defaultFilters: { season: 0 },
  },
  {
    slug: 'recruiting-teams',
    label: 'Recruiting Teams',
    group: 'Recruiting',
    columns: [
      { key: 'year', header: 'Season', className: 'flex-[1]' },
      { key: 'team', header: 'Team', className: 'flex-[2]', render: teamNameWithLogo },
      { key: 'rank', header: 'Rank', className: 'flex-[1]', render: (value) => rankBadge(value) },
      {
        key: 'points',
        header: 'Points',
        className: 'flex-[1]',
        render: (value) => ratingBar(value, 350),
      },
      { key: 'last_synced_at', header: 'Last Synced', className: 'flex-[2]', render: syncedAtCell },
    ],
    filters: ['search', 'season'],
    filterDropdowns: [{ key: 'team' }],
    defaultFilters: { season: 0 },
  },
  {
    slug: 'recruiting-players',
    label: 'Recruiting Players',
    group: 'Recruiting',
    columns: [
      { key: 'year', header: 'Season', className: 'flex-[1]' },
      { key: 'name', header: 'Player', className: 'flex-[2]' },
      { key: 'position', header: 'Pos', className: 'flex-[1]' },
      { key: 'school', header: 'School', className: 'flex-[2]', render: teamNameWithLogo },
      { key: 'committed_to', header: 'Committed', className: 'flex-[2]', render: teamNameWithLogo },
      { key: 'stars', header: 'Stars', className: 'flex-[1]', render: (value) => stars(value) },
      {
        key: 'rating',
        header: 'Rating',
        className: 'flex-[1]',
        render: (value) =>
          ratingBar((typeof value === 'number' ? value : Number(value)) * 100, 100),
      },
    ],
    filters: ['search', 'season'],
    filterDropdowns: [{ key: 'school' }, { key: 'position' }, { key: 'stars' }],
    defaultFilters: { season: 0 },
  },
  {
    slug: 'recruiting-groups',
    label: 'Recruiting Groups',
    group: 'Recruiting',
    columns: [
      { key: 'year', header: 'Season', className: 'flex-[1]' },
      { key: 'team', header: 'Team', className: 'flex-[2]', render: teamNameWithLogo },
      { key: 'position_group', header: 'Group', className: 'flex-[1]' },
      { key: 'conference', header: 'Conference', className: 'flex-[2]' },
      {
        key: 'average_rating',
        header: 'Avg Rating',
        className: 'flex-[1]',
        render: (value) =>
          ratingBar((typeof value === 'number' ? value : Number(value)) * 100, 100),
      },
      {
        key: 'commits',
        header: 'Commits',
        className: 'flex-[1]',
        render: (value) => rankBadge(value),
      },
    ],
    filters: ['season'],
    filterDropdowns: [{ key: 'team' }, { key: 'conference' }, { key: 'position' }],
    defaultFilters: { season: 0 },
  },
  {
    slug: 'games',
    label: 'Games',
    group: 'Games',
    columns: [
      { key: 'id', header: 'Game ID', className: 'flex-[3.5]', minWidth: 110 },
      { key: 'season_year', header: 'Season', className: 'flex-[1.5]', minWidth: 75 },
      { key: 'week', header: 'Week', className: 'flex-[1]', minWidth: 60 },
      { key: 'season_type', header: 'Type', className: 'flex-[2]', minWidth: 90 },
      {
        key: 'away_team',
        header: 'Away',
        className: 'flex-[4]',
        minWidth: 220,
        render: teamNameWithLogo,
      },
      {
        key: 'home_team',
        header: 'Home',
        className: 'flex-[4]',
        minWidth: 220,
        render: teamNameWithLogo,
      },
      {
        key: 'away_score',
        header: 'Away',
        className: 'flex-[1.5]',
        minWidth: 60,
        render: (value) => value ?? '—',
      },
      {
        key: 'home_score',
        header: 'Home',
        className: 'flex-[1.5]',
        minWidth: 60,
        render: (value) => value ?? '—',
      },
      { key: 'start_date', header: 'Date', className: 'flex-[2]', minWidth: 110, render: dateCell },
      {
        key: 'completed',
        header: 'Done',
        className: 'flex-[1.5]',
        minWidth: 65,
        render: (value) => rankBadge(value ? 'Yes' : 'No'),
      },
      {
        key: 'neutral_site',
        header: 'Neutral',
        className: 'flex-[1.5]',
        minWidth: 80,
        render: (value) => rankBadge(value ? 'Yes' : 'No'),
      },
      {
        key: 'conference_game',
        header: 'Conf Gm',
        className: 'flex-[1.5]',
        minWidth: 85,
        render: (value) => rankBadge(value ? 'Yes' : 'No'),
      },
      { key: 'away_conference', header: 'Away Conf', className: 'flex-[4]', minWidth: 170 },
      { key: 'home_conference', header: 'Home Conf', className: 'flex-[4]', minWidth: 170 },
      { key: 'bowl_name', header: 'Notes', className: 'flex-[4]', minWidth: 220 },
    ],
    filters: ['season', 'season_type'],
    filterDropdowns: [{ key: 'team' }, { key: 'conference' }, { key: 'week' }],
    resizable: true,
    defaultFilters: { season: 0 },
  },
  {
    slug: 'drives',
    label: 'Drives',
    group: 'Games',
    columns: [
      { key: 'game_id', header: 'Game', className: 'flex-[1]' },
      { key: 'drive_number', header: '#', className: 'flex-[1]' },
      { key: 'offense', header: 'Offense', className: 'flex-[2]', render: teamNameWithLogo },
      { key: 'defense', header: 'Defense', className: 'flex-[2]', render: teamNameWithLogo },
      { key: 'plays', header: 'Plays', className: 'flex-[1]' },
      { key: 'yards', header: 'Yards', className: 'flex-[1]' },
      {
        key: 'drive_result',
        header: 'Result',
        className: 'flex-[2]',
        render: (value) =>
          React.createElement(
            'span',
            {
              className:
                'inline-flex rounded-full border border-border/30 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-foreground',
            },
            value == null ? '—' : String(value),
          ),
      },
    ],
    filters: ['game_id'],
    filterDropdowns: [{ key: 'team' }],
    requiresGameId: true,
  },
  {
    slug: 'betting-lines',
    label: 'Betting Lines',
    group: 'Games',
    columns: [
      { key: 'season', header: 'Season', className: 'flex-[1]' },
      { key: 'week', header: 'Week', className: 'flex-[1]' },
      { key: 'provider', header: 'Provider', className: 'flex-[2]' },
      { key: 'away_team', header: 'Away', className: 'flex-[2]', render: teamNameWithLogo },
      { key: 'home_team', header: 'Home', className: 'flex-[2]', render: teamNameWithLogo },
      {
        key: 'spread',
        header: 'Spread',
        className: 'flex-[1]',
        render: (value, row) => String(row.formatted_spread ?? value ?? '—'),
      },
      {
        key: 'over_under',
        header: 'O/U',
        className: 'flex-[1]',
        render: (value) => ratingBar(value, 90),
      },
    ],
    filters: ['season'],
    filterDropdowns: [{ key: 'team' }, { key: 'week' }, { key: 'provider' }],
    defaultFilters: { season: 0 },
  },
  {
    slug: 'game-media',
    label: 'Game Media',
    group: 'Games',
    columns: [
      { key: 'season', header: 'Season', className: 'flex-[1]' },
      { key: 'week', header: 'Week', className: 'flex-[1]' },
      { key: 'media_type', header: 'Type', className: 'flex-[1]' },
      { key: 'outlet', header: 'Outlet', className: 'flex-[2]' },
      { key: 'away_team', header: 'Away', className: 'flex-[2]', render: teamNameWithLogo },
      { key: 'home_team', header: 'Home', className: 'flex-[2]', render: teamNameWithLogo },
      { key: 'start_time', header: 'Start', className: 'flex-[2]', render: timeCell },
    ],
    filters: ['season', 'search'],
    defaultFilters: { season: 0 },
    filterDropdowns: [{ key: 'week' }],
  },
  {
    slug: 'game-weather',
    label: 'Game Weather',
    group: 'Games',
    columns: [
      { key: 'season', header: 'Season', className: 'flex-[1]' },
      { key: 'week', header: 'Week', className: 'flex-[1]' },
      { key: 'away_team', header: 'Away', className: 'flex-[2]', render: teamNameWithLogo },
      { key: 'home_team', header: 'Home', className: 'flex-[2]', render: teamNameWithLogo },
      {
        key: 'temperature',
        header: 'Temp',
        className: 'flex-[1]',
        render: (value) => (value == null ? '—' : `${value}°`),
      },
      {
        key: 'wind_speed',
        header: 'Wind',
        className: 'flex-[1]',
        render: (value) => (value == null ? '—' : `${value} mph`),
      },
      { key: 'weather_condition', header: 'Condition', className: 'flex-[2]' },
    ],
    filters: ['season', 'search'],
    defaultFilters: { season: 0 },
    filterDropdowns: [{ key: 'week' }],
  },
  {
    slug: 'game-team-stats',
    label: 'Game Team Stats',
    group: 'Games',
    columns: [
      { key: 'game_id', header: 'Game', className: 'flex-[1]' },
      { key: 'team', header: 'Team', className: 'flex-[2]', render: teamNameWithLogo },
      { key: 'conference', header: 'Conference', className: 'flex-[2]' },
      { key: 'home_away', header: 'H/A', className: 'flex-[1]' },
      {
        key: 'category',
        header: 'Category',
        className: 'flex-[2]',
        render: (value) => statPill(value),
      },
      { key: 'stat', header: 'Stat', className: 'flex-[1]' },
    ],
    filters: ['game_id'],
    filterDropdowns: [{ key: 'team' }, { key: 'category' }],
    requiresGameId: true,
  },
  {
    slug: 'game-player-stats',
    label: 'Game Player Stats',
    group: 'Games',
    columns: [
      { key: 'game_id', header: 'Game', className: 'flex-[1]' },
      { key: 'player', header: 'Player', className: 'flex-[2]' },
      { key: 'team', header: 'Team', className: 'flex-[2]', render: teamNameWithLogo },
      {
        key: 'category',
        header: 'Category',
        className: 'flex-[2]',
        render: (value) => statPill(value),
      },
      {
        key: 'stat_type',
        header: 'Type',
        className: 'flex-[1]',
        render: (value) => statPill(value),
      },
      { key: 'stat', header: 'Stat', className: 'flex-[1]' },
    ],
    filters: ['game_id'],
    filterDropdowns: [{ key: 'team' }, { key: 'stat_name' }, { key: 'category' }],
    requiresGameId: true,
  },
  {
    slug: 'player-season-stats',
    label: 'Player Season Stats',
    group: 'Season',
    columns: [
      { key: 'season', header: 'Season', className: 'flex-[1]' },
      { key: 'player', header: 'Player', className: 'flex-[2]' },
      { key: 'team', header: 'Team', className: 'flex-[2]', render: teamNameWithLogo },
      { key: 'conference', header: 'Conference', className: 'flex-[2]' },
      {
        key: 'category',
        header: 'Category',
        className: 'flex-[2]',
        render: (value) => statPill(value),
      },
      {
        key: 'stat_type',
        header: 'Type',
        className: 'flex-[1]',
        render: (value) => statPill(value),
      },
      { key: 'stat', header: 'Stat', className: 'flex-[1]' },
    ],
    filters: ['season'],
    filterDropdowns: [
      { key: 'team' },
      { key: 'conference' },
      { key: 'stat_name' },
      { key: 'category' },
      { key: 'position' },
    ],
    defaultFilters: { season: 0 },
  },
  {
    slug: 'conferences',
    label: 'Conferences',
    group: 'Dimensions',
    columns: [
      { key: 'id', header: 'ID', className: 'flex-[1]' },
      { key: 'name', header: 'Name', className: 'flex-[2]' },
      { key: 'short_name', header: 'Short', className: 'flex-[1]' },
      { key: 'abbreviation', header: 'Abbr', className: 'flex-[1]' },
      {
        key: 'classification',
        header: 'Class',
        className: 'flex-[1]',
        render: (value) =>
          React.createElement(
            'span',
            {
              className:
                'inline-flex rounded-full border border-border/30 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-muted-foreground',
            },
            value == null ? '—' : String(value).toUpperCase(),
          ),
      },
      { key: 'last_synced_at', header: 'Last Synced', className: 'flex-[2]', render: syncedAtCell },
    ],
    filters: ['search'],
  },
  {
    slug: 'venues',
    label: 'Venues',
    group: 'Dimensions',
    columns: [
      { key: 'id', header: 'ID', className: 'flex-[1]' },
      { key: 'name', header: 'Venue', className: 'flex-[2]' },
      { key: 'city', header: 'City', className: 'flex-[1]' },
      { key: 'state', header: 'State', className: 'flex-[1]' },
      {
        key: 'capacity',
        header: 'Capacity',
        className: 'flex-[1]',
        render: (value) => (value == null ? '—' : Number(value).toLocaleString()),
      },
      {
        key: 'grass',
        header: 'Grass',
        className: 'flex-[1]',
        render: (value) => rankBadge(value ? 'Yes' : 'No'),
      },
      {
        key: 'dome',
        header: 'Dome',
        className: 'flex-[1]',
        render: (value) => rankBadge(value ? 'Yes' : 'No'),
      },
    ],
    filters: ['search'],
  },
  {
    slug: 'teams',
    label: 'Teams',
    group: 'Dimensions',
    columns: [
      { key: 'id', header: 'ID', className: 'flex-[1]' },
      { key: 'school', header: 'School', className: 'flex-[2]', render: teamNameWithLogo },
      { key: 'mascot', header: 'Mascot', className: 'flex-[2]' },
      { key: 'abbreviation', header: 'Abbr', className: 'flex-[1]' },
      { key: 'conference', header: 'Conference', className: 'flex-[2]' },
      { key: 'division', header: 'Division', className: 'flex-[1]' },
      {
        key: 'color',
        header: 'Color',
        className: 'flex-[0.5]',
        render: colorCircle,
        rawCell: true,
      },
      {
        key: 'classification',
        header: 'Class',
        className: 'flex-[1]',
        render: (value) =>
          React.createElement(
            'span',
            {
              className:
                'inline-flex rounded-full border border-border/30 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-muted-foreground',
            },
            value == null ? '—' : String(value).toUpperCase(),
          ),
      },
      { key: 'twitter', header: 'Twitter', className: 'flex-[1.5]', render: twitterLink },
    ],
    filters: ['search'],
    filterDropdowns: [{ key: 'conference' }, { key: 'classification', default: 'fbs' }],
  },
  {
    slug: 'coaches',
    label: 'Coaches',
    group: 'Dimensions',
    columns: [
      {
        key: 'coach_id',
        header: 'Coach ID',
        className: 'flex-[2]',
        render: (value) =>
          React.createElement(
            'span',
            {
              className:
                'inline-flex rounded-lg border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary',
            },
            value == null ? '—' : String(value),
          ),
      },
      { key: 'first_name', header: 'First', className: 'flex-[1]' },
      { key: 'last_name', header: 'Last', className: 'flex-[1]' },
      { key: 'hire_date', header: 'Hire Date', className: 'flex-[1]', render: dateCell },
      { key: 'last_synced_at', header: 'Last Synced', className: 'flex-[2]', render: syncedAtCell },
    ],
    filters: ['search'],
  },
  {
    slug: 'coach-seasons',
    label: 'Coach Seasons',
    group: 'Dimensions',
    columns: [
      { key: 'coach_name', header: 'Coach', className: 'flex-[2]' },
      { key: 'school', header: 'School', className: 'flex-[2]', render: teamNameWithLogo },
      { key: 'year', header: 'Season', className: 'flex-[1]' },
      {
        key: 'record',
        header: 'Record',
        className: 'flex-[1]',
        render: (_value, row) => recordTriplet(row.wins, row.losses, row.ties),
      },
      { key: 'games', header: 'G', className: 'flex-[1]' },
      {
        key: 'preseason_rank',
        header: 'Pre',
        className: 'flex-[1]',
        render: (value) => rankBadge(value),
      },
      {
        key: 'postseason_rank',
        header: 'Post',
        className: 'flex-[1]',
        render: (value) => rankBadge(value),
      },
      { key: 'srs', header: 'SRS', className: 'flex-[1]', render: (value) => ratingBar(value, 30) },
      {
        key: 'sp_overall',
        header: 'SP+',
        className: 'flex-[1]',
        render: (value) => ratingBar(value, 45),
      },
      {
        key: 'sp_offense',
        header: 'SP+ Off',
        className: 'flex-[1]',
        render: (value) => ratingBar(value, 50),
      },
      {
        key: 'sp_defense',
        header: 'SP+ Def',
        className: 'flex-[1]',
        render: (value) => ratingBar(value, 50),
      },
    ],
    filters: ['season', 'search'],
    defaultFilters: { season: 0 },
  },
  {
    slug: 'draft',
    label: 'Draft',
    group: 'Dimensions',
    columns: [
      { key: 'name', header: 'Position', className: 'flex-[2]' },
      { key: 'abbreviation', header: 'Pos Abbr', className: 'flex-[1]' },
      { key: 'display_name', header: 'Draft Team', className: 'flex-[2]' },
      { key: 'location', header: 'Location', className: 'flex-[2]' },
      { key: 'nickname', header: 'Nickname', className: 'flex-[1]' },
    ],
    filters: ['search'],
  },
  {
    slug: 'fact-coverage',
    label: 'Fact Coverage',
    group: 'Dimensions',
    columns: [
      { key: 'endpoint', header: 'Endpoint', className: 'flex-[2]' },
      { key: 'season_year', header: 'Season', className: 'flex-[1]' },
      {
        key: 'complete',
        header: 'Complete',
        className: 'flex-[1]',
        render: (value) =>
          React.createElement(
            'span',
            {
              className: `inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                value ? 'bg-green-500/15 text-green-400' : 'bg-amber-500/15 text-amber-400'
              }`,
            },
            value ? 'Done' : 'Pending',
          ),
      },
      { key: 'row_count', header: 'Rows', className: 'flex-[1]' },
      { key: 'last_synced_at', header: 'Last Synced', className: 'flex-[2]', render: syncedAtCell },
    ],
    filters: ['season', 'search'],
    defaultFilters: { season: 0 },
  },
]

export const CFBD_TABLE_BY_SLUG = new Map(CFBD_TABLES.map((table) => [table.slug, table]))

export const CFBD_TABLE_GROUPS: CfbdTableGroup[] = [
  'Ratings',
  'Season',
  'Recruiting',
  'Games',
  'Dimensions',
]

export function getCfbdTableConfig(slug: string): CfbdTableConfig | undefined {
  return CFBD_TABLE_BY_SLUG.get(slug)
}
