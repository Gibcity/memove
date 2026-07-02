import { ViewCard, ViewActions } from './_shared'

interface TimelineTask {
  id: string
  title: string
  description: string
  phase: string
  category: string
  dueDate: string
  completed: boolean
}
interface TimelinePhase {
  name: string
  label: string
  description: string
  tasks: TimelineTask[]
}
interface PlanMoveTimelineData {
  summary: {
    moveDate: string
    totalTasks: number
    completedTasks: number
    phases: Array<{ name: string; label: string; taskCount: number }>
  }
  phases: TimelinePhase[]
}

// ponytail: phased checklist. Summary header shows totals + progress band,
// each phase is a stacked card of tasks with due dates. Categories map to
// subtle dot color so the user can scan "what's financial vs admin" at a glance.
const CAT_DOT: Record<string, string> = {
  research: 'bg-blue-400',
  logistics: 'bg-amber-400',
  admin: 'bg-purple-400',
  housing: 'bg-emerald-400',
  financial: 'bg-rose-400',
}

export function MoveTimelineView({ data }: { data: unknown }) {
  const d = data as PlanMoveTimelineData
  if (!d?.phases?.length) return null
  const { summary, phases } = d
  const pct = summary.totalTasks > 0
    ? Math.round((summary.completedTasks / summary.totalTasks) * 100)
    : 0
  return (
    <ViewCard
      title={`Move timeline · ${summary.moveDate}`}
      className="space-y-4"
    >
      <ViewActions />
      <div className="flex items-center gap-3">
        <div className="text-sm text-content-muted">
          {summary.completedTasks} of {summary.totalTasks} tasks
        </div>
        <div className="flex-1 h-1.5 rounded-full bg-edge overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="text-xs tabular-nums text-content-muted w-10 text-right">{pct}%</div>
      </div>

      <div className="space-y-3">
        {phases.map(phase => (
          <section key={phase.name} className="rounded-xl border border-edge bg-surface p-3 gap-2">
            <header className="flex items-baseline justify-between mb-2">
              <h4 className="text-sm font-semibold text-content">{phase.label}</h4>
              <span className="text-[10px] uppercase tracking-wider text-content-muted">
                {phase.tasks.length} task{phase.tasks.length === 1 ? '' : 's'}
              </span>
            </header>
            {phase.description && (
              <p className="text-xs text-content-muted mb-2">{phase.description}</p>
            )}
            <ul className="space-y-1.5">
              {phase.tasks.map(task => (
                <li key={task.id} className="flex items-start gap-2 text-sm">
                  <span
                    className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${CAT_DOT[task.category] ?? 'bg-content-faint'}`}
                    aria-hidden
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-content">{task.title}</span>
                      <span className="text-[10px] text-content-muted tabular-nums shrink-0">{task.dueDate}</span>
                    </div>
                    {task.description && (
                      <div className="text-xs text-content-muted">{task.description}</div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </ViewCard>
  )
}