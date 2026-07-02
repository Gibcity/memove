import { ViewCard, ViewActions } from './_shared'

interface UtilitySetupItem {
  utility: string
  responsibility: string
  leadDays: number
  scheduledDate: string | null
  notes?: string
}
interface UtilityCancelItem {
  utility: string
  action: string
  leadDays: number
  scheduledDate: string | null
}
interface UtilitySetupData {
  toLocation: { id: string; name: string; state: string }
  homeType: string
  moveInDate: string
  setup: UtilitySetupItem[]
  cancel: UtilityCancelItem[]
  notes: string[]
}

// ponytail: setup + cancel as two parallel tables. Responsibility drives a
// small badge tone (tenant/landlord/homeowner). scheduledDate is null when
// the handler says "landlord handles it" — render that explicitly rather than
// hiding it, so the user knows the line was checked.
const RESP_TONE: Record<string, string> = {
  tenant: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
  homeowner: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  landlord: 'bg-content-muted/10 text-content-muted border-edge',
  often_tenant: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
}

export function UtilitySetupView({ data }: { data: unknown }) {
  const d = data as UtilitySetupData
  if (!d?.setup?.length) return null
  return (
    <ViewCard
      title={`Utilities · ${d.toLocation.name}, ${d.toLocation.state}`}
      className="space-y-4"
    >
      <ViewActions />
      <div className="flex items-center gap-3 text-sm text-content-muted">
        <span className="capitalize">{d.homeType}</span>
        <span>·</span>
        <span>Move-in {d.moveInDate}</span>
      </div>

      <section>
        <h4 className="text-sm font-semibold text-content mb-2">Set up at new home</h4>
        <ul className="space-y-2">
          {d.setup.map(item => (
            <li key={item.utility} className="rounded-xl border border-edge bg-surface p-3 gap-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-content capitalize">{item.utility.replace('_', ' ')}</span>
                <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${RESP_TONE[item.responsibility] ?? RESP_TONE.tenant}`}>
                  {item.responsibility.replace('_', ' ')}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-content-muted mt-1">
                <span>Lead {item.leadDays}d</span>
                <span className="tabular-nums">{item.scheduledDate ?? 'Landlord handles'}</span>
              </div>
              {item.notes && (
                <div className="text-xs text-content-secondary mt-1">{item.notes}</div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h4 className="text-sm font-semibold text-content mb-2">Cancel / transfer from old home</h4>
        <ul className="space-y-2">
          {d.cancel.map(item => (
            <li key={item.utility} className="rounded-xl border border-edge bg-surface p-3 gap-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-content capitalize">{item.utility.replace('_', ' ')}</span>
                <span className="text-[10px] text-content-muted tabular-nums">
                  {item.scheduledDate ?? '—'}
                </span>
              </div>
              <div className="text-xs text-content-secondary mt-1">{item.action}</div>
            </li>
          ))}
        </ul>
      </section>

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