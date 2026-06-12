export default function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg px-4 py-3 bg-white/[0.03] border border-border/20">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold text-foreground tabular-nums">{value}</p>
    </div>
  )
}
