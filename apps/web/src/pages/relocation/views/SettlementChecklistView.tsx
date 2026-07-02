import { ViewCard, ViewActions } from './_shared'

interface ChecklistSection {
  why?: string
  tasks: string[]
}
interface SettlementChecklistData {
  destination: { id: string; name: string; state: string }
  healthcare: ChecklistSection
  community: ChecklistSection
  services: ChecklistSection
  family?: ChecklistSection
  pets?: ChecklistSection
}

// ponytail: grouped checklist. Each section is a card; "why" line is the
// data-driven rationale the handler produced (e.g. hospital count). Render
// exactly what the server sent — no recomputation, no opinions.
export function SettlementChecklistView({ data }: { data: unknown }) {
  const d = data as SettlementChecklistData
  if (!d?.destination) return null
  const sections: Array<{ key: string; title: string; section?: ChecklistSection }> = [
    { key: 'healthcare', title: 'Healthcare', section: d.healthcare },
    { key: 'community', title: 'Community', section: d.community },
    { key: 'services', title: 'Services', section: d.services },
    { key: 'family', title: 'Family', section: d.family },
    { key: 'pets', title: 'Pets', section: d.pets },
  ]
  const visible = sections.filter(s => s.section?.tasks?.length)
  return (
    <ViewCard
      title={`Settle in ${d.destination.name}, ${d.destination.state}`}
      className="space-y-3"
    >
      <ViewActions />
      <div className="text-xs text-content-muted">
        First 30 days post-move. Tasks grouped by domain.
      </div>
      <div className="space-y-3">
        {visible.map(({ key, title, section }) => (
          <section key={key} className="rounded-xl border border-edge bg-surface p-3 gap-2">
            <h4 className="text-sm font-semibold text-content mb-1">{title}</h4>
            {section!.why && (
              <p className="text-xs text-content-muted italic mb-2">{section!.why}</p>
            )}
            <ul className="space-y-1.5">
              {section!.tasks.map((task, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-content">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-content-faint shrink-0" aria-hidden />
                  <span>{task}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </ViewCard>
  )
}