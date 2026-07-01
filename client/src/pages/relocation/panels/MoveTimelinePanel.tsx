import React from 'react'
import { useTranslation } from '../../../i18n'
import type { UserProfile, HardFilter, RelocationJourney, JourneyPhase } from '@memove/shared'
import { JOURNEY_PHASES } from '@memove/shared'
import type { ElicitationState, HardFilterPrompt } from '../relocationModel'
import {
  X,
  ArrowRight,
  Check,
  Info,
  ListChecks,
  Heart,
  ChevronRight,
} from 'lucide-react'

/**
 * Left panel: My Move header + journey workspace + elicitation + hard-filter
 * banner + "Apply Checklist" CTA + agent activity placeholder.
 *
 * ponytail: extracted verbatim from RelocationDashboardPage — layout
 * extraction only. v1 apply-checklist is button+toast; tripId/result
 * state lands when the move-trip wiring ships.
 */
export interface MoveTimelinePanelProps {
  elicitation: ElicitationState
  showElicitationCard: boolean // ponytail: hook owns visibility; panel just routes it
  onStartElicitation: () => void
  onAnswer: (answer: string) => void
  onSkip: () => void
  onSkipAll: () => void
  onDismissElicitation: () => void
  hardFilterPrompt: HardFilterPrompt | null
  onConfirmHardFilter: (filter: HardFilter) => void
  onDismissHardFilter: () => void
  profile: UserProfile | null
  onApplyChecklist: () => void
  // ── Journey workspace (optional — rendered when the hook provides state) ──
  journey?: RelocationJourney | null
  shortlistedNames?: Record<string, string>
  onToggleTask?: (taskId: string) => void
  onAdvancePhase?: (phase: JourneyPhase) => void
  onEliminateShortlist?: (locationId: string) => void
}

export default function MoveTimelinePanel({
  elicitation,
  showElicitationCard,
  onStartElicitation,
  onAnswer,
  onSkip,
  onSkipAll,
  onDismissElicitation,
  hardFilterPrompt,
  onConfirmHardFilter,
  onDismissHardFilter,
  profile,
  onApplyChecklist,
  journey,
  shortlistedNames,
  onToggleTask,
  onAdvancePhase,
  onEliminateShortlist,
}: MoveTimelinePanelProps): React.ReactElement {
  const { t } = useTranslation()
  const moveDate = profile?.moveContext?.moveDate

  return (
    <aside className="w-full shrink-0 space-y-4 p-4">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header
        className="p-4 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-2xl"
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            {t('relocation.myMove')}
          </h2>
          {moveDate && (
            <span className="text-xs text-slate-500 dark:text-zinc-400">
              {moveDate}
            </span>
          )}
        </div>
        <button
          onClick={onApplyChecklist}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors"
        >
          <ListChecks size={16} />
          {t('relocation.applyChecklist')}
        </button>
      </header>

      {/* ── Journey workspace ───────────────────────────────────────── */}
      {journey && (
        <JourneyWorkspace
          journey={journey}
          shortlistedNames={shortlistedNames}
          onToggleTask={onToggleTask}
          onAdvancePhase={onAdvancePhase}
          onEliminateShortlist={onEliminateShortlist}
        />
      )}

      {/* ── Elicitation card ────────────────────────────────────── */}
      {showElicitationCard && (
        <ElicitationCard
          elicitation={elicitation}
          onStart={onStartElicitation}
          onAnswer={onAnswer}
          onSkip={onSkip}
          onSkipAll={onSkipAll}
          onDismiss={onDismissElicitation}
        />
      )}

      {/* ── Hard-filter banner ─────────────────────────────────── */}
      {hardFilterPrompt && (
        <HardFilterBanner
          prompt={hardFilterPrompt}
          onConfirm={onConfirmHardFilter}
          onDismiss={onDismissHardFilter}
        />
      )}

      {/* ── Agent activity / progressive disclosure ─────────────────── */}
      {/* ponytail: after the elicitation card is dismissed, the left panel was
          empty ("Agent activity coming soon"). Replace with a quick recap so
          first-time movers have a next step (roast #13). */}
      {elicitation.status === 'complete' && profile ? (
        <div className="p-4 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-2xl text-sm space-y-2">
          <p className="font-semibold text-slate-700 dark:text-zinc-200">
            Your profile
          </p>
          <p className="text-xs text-slate-500 dark:text-zinc-400">
            {profile.elicitationRoundsCompleted} question{profile.elicitationRoundsCompleted === 1 ? '' : 's'} answered
          </p>
          {profile.hardFilters && profile.hardFilters.length > 0 && (
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              {profile.hardFilters.length} location{profile.hardFilters.length === 1 ? '' : 's'} hidden
            </p>
          )}
          <button
            onClick={onStartElicitation}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1"
          >
            Update my answers
          </button>
        </div>
      ) : elicitation.status === 'complete' ? (
        <div className="p-4 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-2xl text-xs text-slate-500 dark:text-zinc-400 space-y-2">
          <p className="font-semibold text-slate-700 dark:text-zinc-200">
            You’re all set
          </p>
          <p>
            Browse the map and library on the right. Tap the heart to save
            cities you like, the arrows to compare, and the X to dismiss
            anything that doesn’t fit.
          </p>
        </div>
      ) : (
        <div className="text-xs text-slate-400 dark:text-zinc-500 px-1">
          {t('relocation.agentActivitySoon')}
        </div>
      )}
    </aside>
  )
}

// ── Sub-components (copied from RelocationDashboardPage) ───────────

function ElicitationCard({
  elicitation,
  onStart,
  onAnswer,
  onSkip,
  onSkipAll,
  onDismiss,
}: {
  elicitation: ElicitationState
  onStart: () => void
  onAnswer: (answer: string) => void
  onSkip: () => void
  onSkipAll: () => void
  onDismiss: () => void
}): React.ReactElement {
  const { t } = useTranslation()

  return (
    <div className="p-5 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 border border-blue-200 dark:border-blue-800 rounded-2xl">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            {t('relocation.elicitation.title')}
          </h2>
          <p className="text-sm text-slate-500 dark:text-zinc-400 mt-0.5">
            {t('relocation.elicitation.help')}
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 rounded-lg hover:bg-white/50 dark:hover:bg-zinc-800/50 transition-colors"
          aria-label={t('common.close')}
        >
          <X size={16} />
        </button>
      </div>

      {elicitation.status === 'idle' && (
        <button
          onClick={onStart}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors"
        >
          {t('relocation.elicitation.start')}
          <ArrowRight size={16} />
        </button>
      )}

      {elicitation.status === 'active' && elicitation.currentQuestion && (
        <div>
          <p className="text-slate-800 dark:text-zinc-200 font-medium mb-3">
            {elicitation.currentQuestion.prompt}
          </p>
          {elicitation.currentQuestion.options &&
          elicitation.currentQuestion.options.length > 0 ? (
            <div className="flex flex-wrap gap-2 mb-3">
              {elicitation.currentQuestion.options.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => onAnswer(opt.value)}
                  className="px-4 py-2 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-600 rounded-xl text-sm text-slate-700 dark:text-zinc-300
                             hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="mb-3">
              <input
                type="text"
                className="w-full px-4 py-2 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-600 rounded-xl text-sm text-slate-700 dark:text-zinc-300
                           focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={t('relocation.elicitation.placeholder')}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    onAnswer((e.target as HTMLInputElement).value)
                    ;(e.target as HTMLInputElement).value = ''
                  }
                }}
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            {elicitation.currentQuestion.skippable && (
              <button
                onClick={onSkip}
                className="text-sm text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300"
              >
                {t('relocation.elicitation.skip')}
              </button>
            )}
            <button
              onClick={onSkipAll}
              className="text-sm text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 ml-auto"
            >
              {t('relocation.elicitation.skipAll')}
            </button>
          </div>
        </div>
      )}

      {elicitation.status === 'complete' && (
        <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1.5">
          <Check size={16} />
          {t('relocation.elicitation.complete')}
        </p>
      )}
    </div>
  )
}

function HardFilterBanner({
  prompt,
  onConfirm,
  onDismiss,
}: {
  prompt: HardFilterPrompt
  onConfirm: (filter: HardFilter) => void
  onDismiss: () => void
}): React.ReactElement {
  const { t } = useTranslation()

  return (
    <div
      className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <Info size={18} className="text-amber-500 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
            {t('relocation.hardFilterPrompt.title', {
              name: prompt.label,
            })}
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
            {t('relocation.hardFilterPrompt.hint', {
              count: prompt.dismissCount,
            })}
          </p>
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={() => onConfirm(prompt.suggestedFilter)}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-medium transition-colors"
            >
              {t('relocation.hardFilterPrompt.confirm')}
            </button>
            <button
              onClick={onDismiss}
              className="px-3 py-1.5 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 rounded-lg text-xs font-medium transition-colors"
            >
              {t('relocation.hardFilterPrompt.dismiss')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Journey workspace (phase chips + shortlist + tasks) ────────────────────

interface JourneyWorkspaceProps {
  journey: RelocationJourney
  shortlistedNames?: Record<string, string>
  onToggleTask?: (taskId: string) => void
  onAdvancePhase?: (phase: JourneyPhase) => void
  onEliminateShortlist?: (locationId: string) => void
}

function JourneyWorkspace({
  journey,
  shortlistedNames,
  onToggleTask,
  onAdvancePhase,
  onEliminateShortlist,
}: JourneyWorkspaceProps): React.ReactElement {
  const tasks = journey.moveTimeline?.tasks ?? []
  const completed = journey.completedTasks.length
  const total = tasks.length
  const shortlist = journey.shortlistedLocations

  return (
    <section className="p-4 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-2xl space-y-4">
      {/* Phase chips */}
      <div>
        <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
          Phase
        </p>
        <ol className="flex items-center gap-1 text-xs">
          {JOURNEY_PHASES.map((phase, idx) => {
            const isCurrent = journey.currentPhase === phase
            return (
              <li key={phase} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onAdvancePhase?.(phase)}
                  aria-current={isCurrent ? 'step' : undefined}
                  className={
                    isCurrent
                      ? 'px-2 py-1 rounded-md bg-blue-600 text-white font-medium'
                      : 'px-2 py-1 rounded-md text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-700 transition-colors'
                  }
                >
                  {phase}
                </button>
                {idx < JOURNEY_PHASES.length - 1 && (
                  <ChevronRight
                    size={12}
                    className="text-slate-300 dark:text-zinc-600"
                  />
                )}
              </li>
            )
          })}
        </ol>
      </div>

      {/* Shortlist */}
      <div>
        <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
          <Heart size={12} className="inline mr-1" />
          Shortlist{shortlist.length > 0 ? ` (${shortlist.length})` : ''}
        </p>
        {shortlist.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-zinc-500">
            Tap the heart on any city to start your shortlist.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {shortlist.map(id => (
              <li
                key={id}
                className="inline-flex items-center gap-1 px-2 py-1 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-full text-xs text-rose-700 dark:text-rose-300"
              >
                <Heart size={10} className="fill-current" />
                <span>{shortlistedNames?.[id] ?? id}</span>
                {onEliminateShortlist && (
                  <button
                    type="button"
                    onClick={() => onEliminateShortlist(id)}
                    aria-label={`Remove ${shortlistedNames?.[id] ?? id} from shortlist`}
                    className="ml-1 text-rose-400 hover:text-rose-700 dark:hover:text-rose-200"
                  >
                    <X size={10} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Timeline tasks */}
      {total > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wide">
              Move tasks
            </p>
            <span className="text-xs text-slate-400 dark:text-zinc-500">
              {completed}/{total}
            </span>
          </div>
          {/* ponytail: progress bar = completed/total, no width transition lib
              needed. Native CSS keeps the bundle slim. */}
          <div
            className="h-1 bg-slate-100 dark:bg-zinc-700 rounded-full overflow-hidden mb-2"
            aria-hidden="true"
          >
            <div
              className="h-full bg-blue-500 transition-[width] duration-200"
              style={{ width: `${total ? (completed / total) * 100 : 0}%` }}
            />
          </div>
          <ul className="space-y-1.5 max-h-48 overflow-y-auto">
            {tasks.map(task => (
              <li key={task.id}>
                <label className="flex items-start gap-2 text-xs cursor-pointer hover:bg-slate-50 dark:hover:bg-zinc-700/40 rounded-md p-1.5 -m-1.5 transition-colors">
                  <input
                    type="checkbox"
                    checked={task.completed}
                    disabled={!onToggleTask}
                    onChange={() => onToggleTask?.(task.id)}
                    className="mt-0.5 shrink-0"
                  />
                  <span
                    className={
                      task.completed
                        ? 'line-through text-slate-400 dark:text-zinc-500'
                        : 'text-slate-700 dark:text-zinc-200'
                    }
                  >
                    {task.title}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}