import { ViewCard, ViewActions } from './_shared'

interface AddressChangeItem {
  entity: string
  action: string
  deadlineDays: number
  automated: boolean
}
interface AddressChangeSection {
  category: string
  priority: string
  items: AddressChangeItem[]
}
interface AddressChangeChecklistData {
  overview: {
    recommendedFirstStep: string
    uspsUrl: string
    uspsFee: number
    forwardingDurationMonths: number
  }
  checklist: AddressChangeSection[]
}

// ponytail: grouped-by-domain checklist with priority tone + "automated" hint.
// priority drives the badge color; deadlineDays surfaces as "Do on day 0" or
// "within 14 days" depending on the handler's value. No recomputation.
const PRIORITY_TONE: Record<string, string> = {
  high: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30',
  medium: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  low: 'bg-content-muted/10 text-content-muted border-edge',
}

function deadlineLabel(days: number): string {
  if (days === 0) return 'Move day'
  if (days <= 7) return `Within ${days} days`
  if (days <= 30) return `Within ${days} days`
  return `Day ${days}`
}

export function AddressChangeView({ data }: { data: unknown }) {
  const d = data as AddressChangeChecklistData
  if (!d?.checklist?.length) return null
  const { overview, checklist } = d
  return (
    <ViewCard title="Address change checklist" className="space-y-4">
      <ViewActions />
      <div className="rounded-xl border border-primary bg-primary-50/50 dark:bg-primary-950/20 p-3">
        <div className="text-[10px] uppercase tracking-wider text-content-muted">First step</div>
        <div className="text-sm font-medium text-content mt-1">{overview.recommendedFirstStep}</div>
        <div className="text-xs text-content-muted mt-1">
          USPS forwards mail for {overview.forwardingDurationMonths} months · fee ${overview.uspsFee}
        </div>
      </div>

      <div className="space-y-3">
        {checklist.map(group => (
          <section key={group.category} className="rounded-xl border border-edge bg-surface p-3 gap-2">
            <header className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-content">{group.category}</h4>
              <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${PRIORITY_TONE[group.priority] ?? PRIORITY_TONE.low}`}>
                {group.priority}
              </span>
            </header>
            <ul className="space-y-1.5">
              {group.items.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-content">{item.entity}</span>
                      <span className="text-[10px] text-content-muted tabular-nums shrink-0">
                        {deadlineLabel(item.deadlineDays)}
                      </span>
                    </div>
                    <div className="text-xs text-content-muted">{item.action}</div>
                  </div>
                  {item.automated && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-700 dark:text-green-300 border border-green-500/30 shrink-0 mt-0.5">
                      Auto
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </ViewCard>
  )
}