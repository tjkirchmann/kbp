import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { EventBucket } from '@/services/useEventLog'

function formatMinute(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const bucket: EventBucket = payload[0]?.payload
  const games = bucket.events
    .filter(e => e.event === 'poll_ok' || e.event === 'poll_error')
    .map(e => {
      const label = (e.payload.game_label as string) ?? e.payload.espn_event_id ?? '?'
      return e.event === 'poll_error' ? `${label} (error)` : label
    })
  return (
    <div className="glass-panel rounded-lg px-3 py-2.5 text-xs max-w-[220px]">
      <p className="font-medium text-foreground mb-1.5">{formatMinute(label)}</p>
      <p className="text-muted-foreground mb-1">{bucket.count} poll{bucket.count !== 1 ? 's' : ''}</p>
      {games.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {games.map((g, i) => (
            <li key={i} className={g.includes('(error)') ? 'text-destructive' : 'text-foreground/80'}>
              {g}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

interface Props {
  data: EventBucket[]
}

export default function EspnPollChart({ data }: Props) {
  const chartData = data.map(b => ({ ...b, minute: b.minute }))

  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
        <defs>
          <linearGradient id="pollGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#009CDE" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#009CDE" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
        <XAxis
          dataKey="minute"
          tickFormatter={formatMinute}
          tick={{ fill: 'hsl(220,10%,55%)', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          allowDecimals={false}
          tick={{ fill: 'hsl(220,10%,55%)', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)' }} />
        <Area
          type="monotone"
          dataKey="count"
          stroke="#009CDE"
          strokeWidth={1.5}
          fill="url(#pollGradient)"
          dot={false}
          activeDot={{ r: 3, fill: '#009CDE' }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
