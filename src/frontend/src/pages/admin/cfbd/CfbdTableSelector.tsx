import { ChevronDown } from 'lucide-react'
import { CFBD_TABLES } from './tableRegistry'

interface CfbdTableSelectorProps {
  activeSlug: string
  onSelect: (slug: string) => void
}

const categories = [
  {
    label: 'Teams',
    default: 'teams',
    tables: [
      'teams',
      'team-talent',
      'team-records',
      'team-season-stats',
      'team-adv-stats',
      'returning-production',
      'player-season-stats',
    ],
  },
  {
    label: 'Seasons',
    default: 'calendar',
    tables: ['calendar', 'rankings', 'sp-ratings', 'srs-ratings', 'elo-ratings', 'fpi-ratings'],
  },
  {
    label: 'Games',
    default: 'games',
    tables: [
      'games',
      'drives',
      'betting-lines',
      'game-media',
      'game-weather',
      'game-team-stats',
      'game-player-stats',
    ],
  },
  {
    label: 'Recruiting',
    default: 'recruiting-teams',
    tables: ['recruiting-teams', 'recruiting-players', 'recruiting-groups'],
  },
  {
    label: 'Dimensions',
    default: 'conferences',
    tables: ['conferences', 'venues', 'coaches', 'coach-seasons', 'draft', 'fact-coverage'],
  },
]

function getTableLabel(slug: string): string {
  const config = CFBD_TABLES.find((table) => table.slug === slug)
  return config?.label ?? slug
}

export default function CfbdTableSelector({ activeSlug, onSelect }: CfbdTableSelectorProps) {
  return (
    <div>
      <div className="flex items-center gap-1.5">
        {categories.map((category) => {
          const activeInCategory = category.tables.includes(activeSlug)
          const baseButtonClasses = activeInCategory
            ? 'border-primary/40 bg-primary/15 text-primary'
            : 'border-border/20 bg-white/[0.03] text-muted-foreground hover:text-foreground'

          return (
            <div
              key={category.default}
              className="flex flex-1 overflow-hidden rounded-lg border border-border/20 bg-white/[0.03]"
            >
              <button
                type="button"
                onClick={() => onSelect(category.default)}
                className={`flex-1 px-3 py-1.5 text-sm font-medium transition-colors ${baseButtonClasses}`}
              >
                {category.label}
              </button>

              <div className="relative flex flex-1 items-center border-l border-border/20">
                <select
                  value={activeInCategory ? activeSlug : ''}
                  onChange={(e) => onSelect(e.target.value)}
                  className={`appearance-none bg-transparent px-2 py-1.5 pr-6 text-sm transition-colors focus:outline-none ${
                    activeInCategory
                      ? 'text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {category.tables.map((slug) => (
                    <option key={slug} value={slug}>
                      {getTableLabel(slug)}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className={`pointer-events-none absolute right-1 size-3.5 transition-colors ${
                    activeInCategory ? 'text-primary' : 'text-muted-foreground'
                  }`}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
