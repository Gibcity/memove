import { ViewCard } from './_shared'

interface SalaryAdjustmentData {
  from: { id: string; name: string; costOfLivingIndex: number }
  to: { id: string; name: string; costOfLivingIndex: number }
  currentSalary: number
  equivalentSalary: number
  colRatio: number
  purchasingPowerChangePct: number
  direction: string
  categoryBreakdown: Array<{ category: string; from: number; to: number; annualDelta: number }>
  note: string
}

// ponytail: side-by-side comparison. Direction drives the headline tone.
// Categories render as a comparison table — handler computes the deltas, we just draw.
function money(n: number): string {
  return `$${Math.round(n).toLocaleString()}`
}
function signed(n: number): string {
  const s = money(Math.abs(n))
  return n > 0 ? `+${s}` : n < 0 ? `-${s}` : s
}

export function SalaryAdjustmentView({ data }: { data: unknown }) {
  const d = data as SalaryAdjustmentData
  if (!d?.from || !d?.to) return null
  const purchasingPowerTone =
    d.purchasingPowerChangePct > 0
      ? 'text-green-700 dark:text-green-300'
      : d.purchasingPowerChangePct < 0
        ? 'text-red-700 dark:text-red-300'
        : 'text-content'
  return (
    <ViewCard
      title={`${d.from.name} → ${d.to.name} · salary adjustment`}
      className="space-y-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-edge bg-surface p-3">
          <div className="text-[10px] uppercase tracking-wider text-content-muted">{d.from.name}</div>
          <div className="text-2xl font-bold tabular-nums text-content" style={{ fontFamily: 'Poppins, system-ui' }}>
            {money(d.currentSalary)}
          </div>
          <div className="text-xs text-content-muted mt-1">COL index {d.from.costOfLivingIndex}</div>
        </div>
        <div className="rounded-xl border border-primary bg-primary-50/50 dark:bg-primary-950/20 p-3">
          <div className="text-[10px] uppercase tracking-wider text-content-muted">{d.to.name}</div>
          <div className="text-2xl font-bold tabular-nums text-content" style={{ fontFamily: 'Poppins, system-ui' }}>
            {money(d.equivalentSalary)}
          </div>
          <div className="text-xs text-content-muted mt-1">COL index {d.to.costOfLivingIndex}</div>
        </div>
      </div>

      <div className="rounded-xl border border-edge bg-surface p-3 gap-2">
        <div className="text-[10px] uppercase tracking-wider text-content-muted">Purchasing power</div>
        <div className={`text-xl font-bold tabular-nums ${purchasingPowerTone}`} style={{ fontFamily: 'Poppins, system-ui' }}>
          {d.purchasingPowerChangePct > 0 ? '+' : ''}{d.purchasingPowerChangePct.toFixed(1)}%
        </div>
        <div className="text-xs text-content-muted mt-1 capitalize">{d.direction}</div>
      </div>

      <section>
        <h4 className="text-sm font-semibold text-content mb-2">Annual cost breakdown</h4>
        <div className="rounded-xl border border-edge overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface text-[10px] uppercase tracking-wider text-content-muted">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Category</th>
                <th className="text-right px-3 py-2 font-medium">{d.from.name}</th>
                <th className="text-right px-3 py-2 font-medium">{d.to.name}</th>
                <th className="text-right px-3 py-2 font-medium">Δ</th>
              </tr>
            </thead>
            <tbody>
              {d.categoryBreakdown.map(row => (
                <tr key={row.category} className="border-t border-edge">
                  <td className="px-3 py-2 text-content">{row.category}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-content">{money(row.from)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-content">{money(row.to)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${row.annualDelta > 0 ? 'text-red-700 dark:text-red-300' : row.annualDelta < 0 ? 'text-green-700 dark:text-green-300' : 'text-content'}`}>
                    {signed(row.annualDelta)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="text-xs text-content-muted italic">{d.note}</div>
    </ViewCard>
  )
}