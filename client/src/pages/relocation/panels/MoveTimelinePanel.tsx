import React from 'react'
import { useTranslation } from '../../../i18n'
import type { UserProfile, HardFilter } from '@memove/shared'
import type { ElicitationState, HardFilterPrompt } from '../relocationModel'
import { X, ArrowRight, Check, Info, ListChecks } from 'lucide-react'

/**
 * Left panel: My Move header + elicitation + hard-filter banner +
 * "Apply Checklist" CTA + agent activity placeholder.
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
            You\u2019re all set
          </p>
          <p>
            Browse the map and library on the right. Tap the heart to save
            cities you like, the arrows to compare, and the X to dismiss
            anything that doesn\u2019t fit.
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