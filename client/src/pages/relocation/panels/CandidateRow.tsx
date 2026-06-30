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
  onSelect,
  onDismiss,
  onSave,
  onToggleCompare,
}: {
  candidate: CandidateView
  isSelected: boolean
  isInCompare: boolean
  onSelect: (c: CandidateView) => void
  onDismiss: (id: string) => void
  onSave: (id: string) => void
  onToggleCompare: (id: string) => void
}): React.ReactElement {
  const { t } = useTranslation()
  const { location, score } = candidate
  const rent = location.cost?.medianRent

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
        aria-label={`Score: ${score}`}
        title={`Score ${score}`}
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
        {candidate.decisionTrace && (
          <p className="text-[11px] text-slate-400 dark:text-zinc-500 truncate leading-tight">
            {candidate.decisionTrace.split('.')[0]}.
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
          aria-label="Compare"
          aria-pressed={isInCompare}
          title={isInCompare ? 'Remove from compare' : 'Add to compare'}
        >
          <GitCompareArrows size={14} />
        </button>
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onSave(location.id) }}
          onKeyDown={e => e.stopPropagation()}
          className="p-1 text-slate-400 hover:text-red-500 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label={t('relocation.save')}
        >
          <Heart size={14} />
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
