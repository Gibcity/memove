import { ViewCard } from './_shared'

interface CostItem {
  category: string
  description: string
  low: number
  mid: number
  high: number
}
interface EstimateMovingCostsData {
  fromLocation: { id: string; name: string; state: string }
  toLocation: { id: string; name: string; state: string }
  distanceMiles: number
  homeSize: string
  movingType: string
  breakdown: CostItem[]
  total: { low: number; mid: number; high: number }
  notes: string[]
}

// ponytail: cost range as 3-bar inline chart per category + total band.
// low/mid/high are the structured shape from the handler — render, don't recompute.
export function MovingCostView({ data }: { data: unknown }) {
  const d = data as EstimateMovingCostsData
  if (!d?.breakdown?.length) return null
  const max = Math.max(...d.breakdown.map(i => i.high), d.total.high, 1)
  return (
    <ViewCard
      title={`${d.fromLocation.name} → ${d.toLocation.name} · ${d.distanceMiles} mi`}
      className="space-y-4"
    >
      <div className="flex items-center gap-3 text-sm text-content-muted">
        <span className="capitalize">{d.homeSize.replace('_', ' ')}</span>
        <span>·</span>
        <span className="capitalize">{d.movingType.replace('_', ' ')}</span>
      </div>

      <ul className="space-y-2">
        {d.breakdown.map(item => (
          <li key={item.category} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-medium text-content">{item.description}</div>
                <div className="text-[10px] uppercase tracking-wider text-content-muted">{item.category}</div>
              </div>
              <div className="text-xs tabular-nums text-content shrink-0">
                ${item.low.toLocaleString()}–${item.high.toLocaleString()}
              </div>
            </div>
            <div className="relative h-2 rounded-full bg-edge overflow-hidden">
              <div
                className="absolute h-full rounded-full bg-primary-200 dark:bg-primary-900"
                style={{ width: `${(item.low / max) * 100}%` }}
              />
              <div
                className="absolute h-full rounded-full bg-primary-500/60"
                style={{ left: `${(item.low / max) * 100}%`, width: `${((item.mid - item.low) / max) * 100}%` }}
              />
              <div
                className="absolute h-full rounded-full bg-primary"
                style={{ left: `${(item.mid / max) * 100}%`, width: `${((item.high - item.mid) / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>

      <div className="rounded-xl border border-primary bg-primary-50/50 dark:bg-primary-950/20 p-3">
        <div className="text-[10px] uppercase tracking-wider text-content-muted">Estimated total</div>
        <div className="text-2xl font-bold tabular-nums text-content" style={{ fontFamily: 'Poppins, system-ui' }}>
          ${d.total.low.toLocaleString()} – ${d.total.high.toLocaleString()}
        </div>
        <div className="text-xs text-content-muted mt-1">Mid: ${d.total.mid.toLocaleString()}</div>
      </div>

      {d.notes?.length > 0 && (
        <ul className="space-y-1 text-xs text-content-secondary">
          {d.notes.map((n, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-content-faint">·</span>
              <span>{n}</span>
            </li>
          ))}
        </ul>
      )}
    </ViewCard>
  )
}