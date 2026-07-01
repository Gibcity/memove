import { ViewCard } from './_shared'

interface DmvGuideData {
  toState: string
  driverLicense: {
    deadlineDays: number
    description: string
    requiredDocuments: string[]
    feeUSD: number
    appointmentRequired: boolean
    appointmentNote: string
    realId: { available: boolean; feeIncludedInLicenseFee: boolean; note: string }
  }
  vehicleRegistration: {
    deadlineDays: number
    description: string
    feeBaseUSD: number
    feeNote: string
    titleTransfer: { required: string[]; notes: string }
  }
  stateNotes?: string | null
  error?: string
}

// ponytail: info/guide layout. Two parallel columns — license + registration.
// The error path is rare but the handler returns it for unknown states, so
// surface it inline rather than crashing the renderer.
export function DmvGuideView({ data }: { data: unknown }) {
  const d = data as DmvGuideData
  if (!d) return null

  if (d.error) {
    return (
      <ViewCard title={`DMV guide · ${d.toState}`} className="space-y-2">
        <div className="text-sm text-content">{d.error}</div>
      </ViewCard>
    )
  }
  const dl = d.driverLicense
  const vr = d.vehicleRegistration
  return (
    <ViewCard title={`${d.toState} · DMV guide`} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <section className="rounded-xl border border-edge bg-surface p-3 gap-2">
          <h4 className="text-sm font-semibold text-content">Driver's license</h4>
          <div className="text-xs text-content-muted">{dl.description}</div>
          <div className="flex gap-2 mt-2">
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
              {dl.deadlineDays} days
            </span>
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-surface border border-edge text-content">
              ${dl.feeUSD}
            </span>
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-surface border border-edge text-content">
              {dl.appointmentRequired ? 'Appointment required' : 'Walk-in OK'}
            </span>
          </div>
          <div className="text-xs text-content-muted mt-1">{dl.appointmentNote}</div>

          <div className="mt-3">
            <div className="text-[10px] uppercase tracking-wider text-content-muted mb-1">Required documents</div>
            <ul className="space-y-1 text-xs text-content">
              {dl.requiredDocuments.map((doc, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-content-faint">·</span>
                  <span>{doc}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-3 rounded-lg border border-edge bg-surface-card p-2">
            <div className="text-[10px] uppercase tracking-wider text-content-muted">
              REAL ID {dl.realId.available ? 'available' : 'not available'}
            </div>
            <div className="text-xs text-content-muted mt-1">{dl.realId.note}</div>
          </div>
        </section>

        <section className="rounded-xl border border-edge bg-surface p-3 gap-2">
          <h4 className="text-sm font-semibold text-content">Vehicle registration</h4>
          <div className="text-xs text-content-muted">{vr.description}</div>
          <div className="flex gap-2 mt-2">
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
              {vr.deadlineDays} days
            </span>
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-surface border border-edge text-content">
              ${vr.feeBaseUSD} base
            </span>
          </div>
          <div className="text-xs text-content-muted mt-1">{vr.feeNote}</div>

          <div className="mt-3">
            <div className="text-[10px] uppercase tracking-wider text-content-muted mb-1">Title transfer</div>
            <ul className="space-y-1 text-xs text-content">
              {vr.titleTransfer.required.map((doc, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-content-faint">·</span>
                  <span>{doc}</span>
                </li>
              ))}
            </ul>
            <div className="text-xs text-content-muted italic mt-2">{vr.titleTransfer.notes}</div>
          </div>
        </section>
      </div>

      {d.stateNotes && (
        <div className="rounded-lg border border-edge bg-surface-card p-3 text-sm text-content-secondary">
          {d.stateNotes}
        </div>
      )}
    </ViewCard>
  )
}