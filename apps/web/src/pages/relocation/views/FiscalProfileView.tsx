import { ViewCard, ViewActions, scoreToneClasses } from './_shared'

interface FiscalHealthData {
  location: { id: string; name: string; state: string }
  fiscalProfile: {
    fiscalTier: string
    healthScore: number
    riskLevel: string
    outlook: string
    estimated10yrTaxIncrease: number
    statePensionFundedRatio: number
    taxCompetitivenessScore: number
    stateIncomeTaxRate: number
    propertyTaxRate: number
  }
}

// ponytail: 9-stat grid. Health/risk tones are semantic, not chrome — green
// for "healthy outlook" because the spec says so, regardless of dark mode.
export function FiscalProfileView({ data }: { data: unknown }) {
  const d = data as FiscalHealthData
  if (!d?.location || !d?.fiscalProfile) return null
  const f = d.fiscalProfile
  return (
    <ViewCard
      title={`${d.location.name}, ${d.location.state} · fiscal outlook`}
      className="space-y-4"
    >
      <ViewActions />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Stat label="Health score" value={Math.round(f.healthScore)} tone={scoreToneClasses(f.healthScore)} big />
        <Stat label="Risk level" value={f.riskLevel} tone={riskTone(f.riskLevel)} />
        <Stat label="Fiscal tier" value={f.fiscalTier} />
        <Stat label="Outlook" value={f.outlook} tone={outlookTone(f.outlook)} />
        <Stat label="State income tax" value={`${(f.stateIncomeTaxRate * 100).toFixed(2)}%`} />
        <Stat label="Property tax" value={`${(f.propertyTaxRate * 100).toFixed(2)}%`} />
        <div className="rounded-xl border border-edge bg-surface p-3 gap-1">
          <div className="text-[10px] uppercase tracking-wider text-content-muted">Pension funded</div>
          <div className="text-xl font-bold tabular-nums text-content">{Math.round(f.statePensionFundedRatio)}%</div>
          <div className="h-1.5 rounded-full bg-edge overflow-hidden mt-1">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{
                width: `${Math.min(100, Math.max(0, f.statePensionFundedRatio))}%`,
                background: scoreTone(f.statePensionFundedRatio),
              }}
            />
          </div>
        </div>
        <Stat label="Tax competitiveness" value={`${Math.round(f.taxCompetitivenessScore)}`} />
        <Stat label="Est. 10yr tax Δ" value={`+${(f.estimated10yrTaxIncrease * 100).toFixed(1)}%`} tone="warn" />
      </div>
    </ViewCard>
  )
}

function Stat({
  label,
  value,
  tone,
  big = false,
}: {
  label: string
  value: string | number
  tone?: string
  big?: boolean
}) {
  const baseTone = tone ?? ''
  return (
    <div className={`rounded-xl border border-edge bg-surface p-3 gap-1 ${baseTone}`}>
      <div className="text-[10px] uppercase tracking-wider opacity-80">{label}</div>
      <div className={`${big ? 'text-3xl' : 'text-xl'} font-bold tabular-nums`} style={{ fontFamily: 'Poppins, system-ui' }}>
        {value}
      </div>
    </div>
  )
}

// ponytail: tiny tone helpers. Inline strings, not a config object — five
// lines of branching, lowest ladder rung.
function riskTone(risk: string): string {
  const r = (risk ?? '').toLowerCase()
  if (r.includes('low')) return scoreToneClasses(80)
  if (r.includes('med')) return scoreToneClasses(55)
  return scoreToneClasses(20)
}

function outlookTone(outlook: string): string {
  const o = (outlook ?? '').toLowerCase()
  if (o.includes('pos') || o.includes('stable')) return scoreToneClasses(70)
  if (o.includes('caut')) return scoreToneClasses(50)
  return scoreToneClasses(25)
}

function scoreTone(score: number): string {
  if (score >= 70) return '#22c55e'
  if (score >= 40) return '#eab308'
  return '#b91c1c'
}
