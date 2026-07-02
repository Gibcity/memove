import { ViewCard, ViewActions } from './_shared'

interface TaxImpactData {
  from: { id: string; name: string; state: string }
  to: { id: string; name: string; state: string }
  annualIncome: number
  homeValueUsed: number
  incomeTax: {
    from: { stateRate: number; total: number; federal: number; state: number }
    to: { stateRate: number; total: number; federal: number; state: number }
    delta: number
  }
  propertyTax: {
    from: { rate: number; annual: number }
    to: { rate: number; annual: number }
    delta: number
  }
  totalAnnualTaxBurden: {
    from: number
    to: number
    delta: number
    direction: 'increase' | 'decrease' | 'unchanged'
  }
  methodology: string
}

// ponytail: fiscal impact comparison. Direction drives tone (red = increase).
// Two stacked pairs (income, property) plus a combined burden summary.
// Pct formatter inline — simple two-liner.
function pct(n: number): string {
  return `${(n * 100).toFixed(2)}%`
}
function money(n: number): string {
  return `$${Math.round(n).toLocaleString()}`
}
function signed(n: number): string {
  const s = money(Math.abs(n))
  return n > 0 ? `+${s}` : n < 0 ? `-${s}` : s
}

export function TaxImpactView({ data }: { data: unknown }) {
  const d = data as TaxImpactData
  if (!d?.from || !d?.to) return null
  const dir = d.totalAnnualTaxBurden.direction
  const tone =
    dir === 'increase' ? 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300'
    : dir === 'decrease' ? 'border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-300'
    : 'border-edge bg-surface text-content'
  return (
    <ViewCard
      title={`${d.from.name} → ${d.to.name} · tax impact`}
      className="space-y-4"
    >
      <ViewActions />
      <div className="text-xs text-content-muted">
        Annual income ${d.annualIncome.toLocaleString()} · home value {money(d.homeValueUsed)}
      </div>

      <section className="rounded-xl border border-edge bg-surface p-3 gap-2">
        <h4 className="text-sm font-semibold text-content mb-2">Income tax</h4>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-content-muted">{d.from.state}</div>
            <div className="text-content tabular-nums">{money(d.incomeTax.from.total)}</div>
            <div className="text-xs text-content-muted">state {pct(d.incomeTax.from.stateRate)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-content-muted">{d.to.state}</div>
            <div className="text-content tabular-nums">{money(d.incomeTax.to.total)}</div>
            <div className="text-xs text-content-muted">state {pct(d.incomeTax.to.stateRate)}</div>
          </div>
        </div>
        <div className="mt-2 text-sm">
          <span className="text-content-muted">Delta:</span>{' '}
          <span className="tabular-nums font-medium text-content">{signed(d.incomeTax.delta)}</span>
        </div>
      </section>

      <section className="rounded-xl border border-edge bg-surface p-3 gap-2">
        <h4 className="text-sm font-semibold text-content mb-2">Property tax</h4>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-content-muted">{d.from.state}</div>
            <div className="text-content tabular-nums">{money(d.propertyTax.from.annual)}</div>
            <div className="text-xs text-content-muted">rate {pct(d.propertyTax.from.rate)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-content-muted">{d.to.state}</div>
            <div className="text-content tabular-nums">{money(d.propertyTax.to.annual)}</div>
            <div className="text-xs text-content-muted">rate {pct(d.propertyTax.to.rate)}</div>
          </div>
        </div>
        <div className="mt-2 text-sm">
          <span className="text-content-muted">Delta:</span>{' '}
          <span className="tabular-nums font-medium text-content">{signed(d.propertyTax.delta)}</span>
        </div>
      </section>

      <div className={`rounded-xl border p-3 ${tone}`}>
        <div className="text-[10px] uppercase tracking-wider opacity-80">Combined annual burden</div>
        <div className="text-2xl font-bold tabular-nums" style={{ fontFamily: 'Poppins, system-ui' }}>
          {signed(d.totalAnnualTaxBurden.delta)}
        </div>
        <div className="text-xs opacity-80 mt-1">
          {d.from.state} {money(d.totalAnnualTaxBurden.from)} → {d.to.state} {money(d.totalAnnualTaxBurden.to)}
        </div>
      </div>

      <div className="text-xs text-content-muted italic">{d.methodology}</div>
    </ViewCard>
  )
}