import React from 'react'
import { useTranslation } from '../../../i18n'
import type { CandidateView } from '../relocationModel'
import { formatCurrency, scoreToColor } from '../relocationModel'
import { Heart, X, GitCompareArrows } from 'lucide-react'

/**
 * Compact 48px row variant of the old CandidateCard.
 * ponytail: actions always visible (no hover overlay) — this lives in a
 * dense scrollable list, hover is unreliable on touch.
 */
function CandidateRow({
  candidate,
  isSelected,
  isInCompare,
  isSaved,
  onSelect,
  onDismiss,
  onSave,
  onToggleCompare,
}: {
  candidate: CandidateView
  isSelected: boolean
  isInCompare: boolean
  isSaved: boolean
  onSelect: (c: CandidateView) => void
  onDismiss: (id: string) => void
  onSave: (id: string) => void
  onToggleCompare: (id: string) => void
}): React.ReactElement {
  const { t } = useTranslation()
  const { location, score } = candidate
  const rent = location.cost?.medianRent
  // ponytail: degraded-mode fallback (#24). When the score endpoint was
  // bypassed, decisionTrace is empty and the row shows a generic "below
  // average" hint. Better than a silent blank line under the city name.
  const traceLine = candidate.decisionTrace
    ? candidate.decisionTrace.split('.')[0] + '.'
    : null

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(candidate)
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(candidate)}
      onKeyDown={handleKeyDown}
      aria-pressed={isSelected}
      aria-label={t('relocation.candidateDetail', { name: location.name })}
      className={`w-full flex items-center gap-3 px-3 h-12 text-left rounded-xl border transition-colors cursor-pointer
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500
                  ${isSelected
                    ? 'ring-2 ring-blue-400 bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
                    : 'border-slate-200 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-800/50'}`}
    >
      {/* Score dot */}
      <span
        className="w-3 h-3 rounded-full shrink-0"
        style={{ background: scoreToColor(score) }}
        aria-label={t('relocation.scoreAriaLabel', { score })}
        title={t('relocation.scoreTitle', { score })}
      />

      {/* Name + why */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
            {location.name}
          </span>
          <span className="text-xs text-slate-500 dark:text-zinc-400 shrink-0">
            {location.state}
          </span>
        </div>
        {traceLine ? (
          <p className="text-[11px] text-slate-400 dark:text-zinc-500 truncate leading-tight">
            {traceLine}
          </p>
        ) : (
          // ponytail: degraded-mode placeholder — keeps the same vertical
          // footprint so the row doesn't reflow when decisionTrace is empty.
          <p className="text-[11px] text-slate-400 dark:text-zinc-500 truncate leading-tight italic">
            {t('relocation.scoreDegraded')}
          </p>
        )}
      </div>

      {/* Rent pill */}
      {rent ? (
        <span className="hidden sm:inline-flex items-center text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-700 text-slate-600 dark:text-zinc-300 font-medium shrink-0">
          {formatCurrency(rent)}/mo
        </span>
      ) : null}

      {/* Actions */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onToggleCompare(location.id) }}
          onKeyDown={e => e.stopPropagation()}
          className={`p-1 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            isInCompare
              ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30'
              : 'text-slate-400 hover:text-blue-500'
          }`}
          aria-label={isInCompare ? t('relocation.compareRemoveTitle') : t('relocation.compareAddTitle')}
          aria-pressed={isInCompare}
          title={isInCompare ? t('relocation.compareRemoveTitle') : t('relocation.compareAddTitle')}
        >
          <GitCompareArrows size={14} />
        </button>
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onSave(location.id) }}
          onKeyDown={e => e.stopPropagation()}
          className={`p-1 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            isSaved
              ? 'text-red-500 bg-red-50 dark:bg-red-900/20'
              : 'text-slate-400 hover:text-red-500'
          }`}
          aria-label={t(isSaved ? 'relocation.unsave' : 'relocation.save')}
          aria-pressed={isSaved}
          title={isSaved ? t('relocation.unsave') : t('relocation.save')}
        >
          <Heart size={14} fill={isSaved ? 'currentColor' : 'none'} />
        </button>
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onDismiss(location.id) }}
          onKeyDown={e => e.stopPropagation()}
          className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label={t('relocation.dismiss')}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}

export default React.memo(CandidateRow)
