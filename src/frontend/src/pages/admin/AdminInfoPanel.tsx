type InfoFeature = { name: string; description: string }
type SectionInfo = { title: string; description: string; features: InfoFeature[] }

const INFO: Record<string, SectionInfo> = {
  comms: {
    title: 'Comms',
    description: 'Configuration for outbound notifications and alerts.',
    features: [
      {
        name: 'Discord Webhook URL',
        description:
          'Webhook endpoint for operational alerts. The server posts here when ESPN returns a bad or unexpected response during live polling. Use the Test button to verify the webhook is reachable before saving.',
      },
    ],
  },
  espn: {
    title: 'ESPN',
    description:
      'Configuration and live visibility for the ESPN polling service, which keeps game scores up to date during bowl season.',
    features: [
      {
        name: 'Rate Limit',
        description:
          'Maximum ESPN API requests per minute across the entire server. The poller divides this budget equally across all active games — if there are more games than requests per minute, polling slows proportionally (e.g. 70 active games at 60 req/min = one poll per game every 70 seconds).',
      },
      {
        name: 'Poll Activity Chart',
        description:
          'Shows polls per minute over the last 30 minutes. Hover any bar to see which games were polled that minute and whether any errors occurred. Refreshes every 30 seconds.',
      },
    ],
  },
  users: {
    title: 'Users',
    description:
      'View and manage all registered users. Users are created automatically on first sign-in via Clerk authentication.',
    features: [
      {
        name: 'User List',
        description:
          'Paginated table of all accounts showing email, display name, role, and registration date. Click any row to open the full user detail view.',
      },
      {
        name: 'Ban / Unban',
        description:
          'Banning a user blocks them from signing in and participating in pools. Their historical picks and data are preserved. The action can be reversed at any time.',
      },
      {
        name: 'Admin Promotion',
        description:
          'Grants or revokes the admin role for a user. Admins have full access to this panel and all admin API endpoints.',
      },
    ],
  },
  pools: {
    title: 'Pools',
    description:
      'Create and manage bowl pools. A pool is a single competition instance tied to a set of bowl games — users submit picks against that game list.',
    features: [
      {
        name: 'Pool List',
        description:
          'All pools with their status (open, locked, or closed), year, and featured flag. Click a pool to view its games, submissions, and controls.',
      },
      {
        name: 'Create Pool',
        description:
          'Four-step wizard: name and year → select bowl games from the ESPN/CFBD dataset → configure bracket (if applicable) → set point multipliers per game tier. Once created, the pool can be opened for picks.',
      },
      {
        name: 'Pool Detail — Games',
        description:
          'Lists all games in the pool with live scores (when available) and lock status. Games are locked automatically at kickoff via the ESPN poller.',
      },
      {
        name: 'Pool Detail — Submissions',
        description:
          "All user pick submissions for the pool. Shows each participant's picks, score, and tiebreaker value.",
      },
      {
        name: 'Delete Pool',
        description:
          'Permanently removes the pool and all associated submissions. Requires confirmation. Irreversible.',
      },
    ],
  },
  teams: {
    title: 'Teams',
    description:
      'Read-only view of the college football team dataset synced from the CFBD (College Football Data) API. Teams are used to populate game matchups.',
    features: [
      {
        name: 'Team List',
        description:
          'Virtualized table of all synced teams showing school name, mascot, abbreviation, conference, division, classification, and team colors.',
      },
      {
        name: 'Sync Teams',
        description:
          'Triggers a full re-fetch from the CFBD API and upserts the results into the database. Run this at the start of each season or after conference realignment.',
      },
    ],
  },
  'ai structs': {
    title: 'AI Structs',
    description:
      'LLM-generated, typed outputs produced for each entity in a source table (e.g. a per-team program profile). Definitions run on a schedule via Temporal and store their results in a dedicated table.',
    features: [
      {
        name: 'Definitions',
        description:
          'Each definition declares a source table, the fields the LLM should produce, and a prompt. This list shows every definition across both tiers along with its schedule and model.',
      },
      {
        name: 'Static vs Dynamic tiers',
        description:
          'Static definitions are tracked in code (a type-safe Pydantic schema and an Alembic-migrated table, e.g. program_profile). Dynamic definitions are configured at runtime as registry rows and derive their schema and table on the fly.',
      },
      {
        name: 'Results table',
        description:
          'Click a definition to inspect its generated rows. The table shows the source identity (e.g. school and conference) first, followed by every output field. Click any row to open a side panel with its full detail.',
      },
    ],
  },
}

export default function AdminInfoPanel({ section }: { section: string }) {
  const info = INFO[section]

  if (!info) {
    return (
      <p className="text-sm text-muted-foreground">No information available for this section.</p>
    )
  }

  return (
    <div className="flex flex-col gap-6 max-w-lg">
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-1">{info.title}</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">{info.description}</p>
      </div>
      <div className="flex flex-col gap-3">
        {info.features.map((f) => (
          <div
            key={f.name}
            className="rounded-lg px-4 py-3 bg-white/[0.03] border border-border/20"
          >
            <p className="text-sm font-medium text-foreground mb-0.5">{f.name}</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{f.description}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
