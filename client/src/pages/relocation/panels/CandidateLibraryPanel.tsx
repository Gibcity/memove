import React, { memo, useCallback, useMemo, useState } from 'react'
import { useTranslation } from '../../../i18n'
import type { CandidateView, FilterSlider } from '../relocationModel'
import CandidateRow from './CandidateRow'
import { Search, ArrowDownAZ, Heart, X, Eye, EyeOff } from 'lucide-react'

type SortKey = 'score' | 'rent' | 'name'

/**
 * Right-panel library: search + filter sliders + scrollable candidate rows.
 * ponytail: local search/sort state is fine — caller doesn't need to know
 * about panel-level view state. Filters are passed-through props (lifted
 * to the page so it owns the slider config and apply-signal).
 */
export default function CandidateLibraryPanel({
  candidates,
  allCandidates,
  selectedId,
  onSelect,
  onDismiss,
  onSave,
  sliders,
  onUpdateSlider,
  onToggleSlider,
  onApplyFilters,
  compareIds,
  onToggleCompare,
  onClearCompare,
  onOpenCompare,
}: {
  candidates: CandidateView[]
  allCandidates: CandidateView[]
  selectedId: string | null
  onSelect: (c: CandidateView) => void
  onDismiss: (id: string) => void
  onSave: (id: string) => void
  sliders: FilterSlider[]
  onUpdateSlider: (id: string, value: [number, number]) => void
  onToggleSlider: (id: string) => void
  onApplyFilters: () => void
  compareIds: string[]
  onToggleCompare: (id: string) => void
  onClearCompare: () => void
  onOpenCompare: () => void
}): React.ReactElement {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('score')

  // stable handlers so CandidateRow (when memoized upstream) can skip re-render
  const handleSelect = useCallback((c: CandidateView) => onSelect(c), [onSelect])
  const handleDismiss = useCallback((id: string) => onDismiss(id), [onDismiss])
  const handleSave = useCallback((id: string) => onSave(id), [onSave])

  // ponytail: derived view, no need to lift. candidates is already filtered
  // upstream; we only handle the text search + sort here.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const base = q
      ? candidates.filter(c =>
          c.location.name.toLowerCase().includes(q) ||
          c.location.state.toLowerCase().includes(q),
        )
      : candidates
    const sorted = [...base]
    if (sortKey === 'score') sorted.sort((a, b) => b.score - a.score)
    else if (sortKey === 'rent') {
      sorted.sort((a, b) => {
        const ar = a.location.cost?.medianRent ?? Infinity
        const br = b.location.cost?.medianRent ?? Infinity
        return ar - br
      })
    } else sorted.sort((a, b) => a.location.name.localeCompare(b.location.name))
    return sorted
  }, [candidates, search, sortKey])

  return (
    <div className="w-full lg:w-96 shrink-0 flex flex-col bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 dark:border-zinc-700">
        <span className="text-sm font-semibold text-slate-900 dark:text-white">
          {t('relocation.topCandidates')}
        </span>
        <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-700 text-slate-600 dark:text-zinc-300 font-medium">
          {allCandidates.length}
        </span>
        <select
          value={sortKey}
          onChange={e => setSortKey(e.target.value as SortKey)}
          aria-label={t('relocation.sort')}
          className="ml-auto text-xs bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg px-2 py-1 text-slate-600 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="score">{t('relocation.sortScore')}</option>
          <option value="rent">{t('relocation.sortRent')}</option>
          <option value="name">{t('relocation.sortName')}</option>
        </select>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-slate-200 dark:border-zinc-700">
        <label className="relative block">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('relocation.searchCities')}
            aria-label={t('relocation.searchCities')}
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg text-slate-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
      </div>

      {/* Filter sliders (mirrors FilterSidebar pattern, compact) */}
      {sliders.length > 0 && (
        <details className="border-b border-slate-200 dark:border-zinc-700 group">
          <summary className="flex items-center justify-between px-4 py-2 cursor-pointer text-xs font-semibold text-slate-600 dark:text-zinc-400 list-none">
            <span>{t('relocation.filters')}</span>
            <span className="text-slate-400 group-open:rotate-90 transition-transform">›</span>
          </summary>
          <div className="px-4 pb-3 space-y-3">
            {sliders.map(slider => (
              <div key={slider.id}>
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor={`lib-filter-${slider.id}`}
                    className="text-[11px] font-medium text-slate-600 dark:text-zinc-400 cursor-pointer"
                  >
                    {slider.label}
                  </label>
                  <button
                    type="button"
                    onClick={() => onToggleSlider(slider.id)}
                    className="p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300"
                    aria-label={
                      slider.enabled
                        ? t('relocation.filterDisable')
                        : t('relocation.filterEnable')
                    }
                  >
                    {slider.enabled ? <Eye size={12} /> : <EyeOff size={12} />}
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    id={`lib-filter-${slider.id}-min`}
                    type="range"
                    min={slider.min}
                    max={slider.max}
                    step={slider.step}
                    value={slider.value[0]}
                    onChange={e =>
                      onUpdateSlider(slider.id, [
                        Number(e.target.value),
                        slider.value[1],
                      ])
                    }
                    disabled={!slider.enabled}
                    aria-label={t('relocation.filterMin', { name: slider.label })}
                    className="w-full h-1 bg-slate-200 dark:bg-zinc-600 rounded-lg appearance-none cursor-pointer accent-blue-600 disabled:opacity-30 disabled:cursor-not-allowed"
                  />
                  <input
                    id={`lib-filter-${slider.id}-max`}
                    type="range"
                    min={slider.min}
                    max={slider.max}
                    step={slider.step}
                    value={slider.value[1]}
                    onChange={e =>
                      onUpdateSlider(slider.id, [
                        slider.value[0],
                        Number(e.target.value),
                      ])
                    }
                    disabled={!slider.enabled}
                    aria-label={t('relocation.filterMax', { name: slider.label })}
                    className="w-full h-1 bg-slate-200 dark:bg-zinc-600 rounded-lg appearance-none cursor-pointer accent-blue-600 disabled:opacity-30 disabled:cursor-not-allowed"
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5">
                  <span>{slider.value[0]}</span>
                  <span>{slider.value[1]}</span>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={onApplyFilters}
              className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors"
            >
              {t('relocation.applyFilters')}
            </button>
          </div>
        </details>
      )}

      {/* Compare bar — ponytail: lazy 2-col toggle, hide until user picks at least 2 */}
      {compareIds.length > 0 && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-200 dark:border-zinc-700 bg-blue-50/60 dark:bg-blue-900/20">
          <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
            {compareIds.length} selected for compare
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onClearCompare}
              className="text-[11px] px-2 py-1 text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={onOpenCompare}
              disabled={compareIds.length < 2}
              className="text-[11px] px-2.5 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-md font-medium"
              title={compareIds.length < 2 ? 'Pick at least 2' : 'Compare side-by-side'}
            >
              Compare ({compareIds.length})
            </button>
          </div>
        </div>
      )}

      {/* Scrollable list */}
      <div
        className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1"
        role="list"
        aria-label={t('relocation.topCandidates')}
      >
        {visible.length === 0 && (
          <div className="text-center py-10 text-slate-400 dark:text-zinc-500 text-sm">
            {t('relocation.noCandidates')}
          </div>
        )}
        {visible.map(c => (
          <CandidateRow
            key={c.location.id}
            candidate={c}
            isSelected={selectedId === c.location.id}
            isInCompare={compareIds.includes(c.location.id)}
            onSelect={handleSelect}
            onDismiss={handleDismiss}
            onSave={handleSave}
            onToggleCompare={onToggleCompare}
          />
        ))}
      </div>

      {/* Footer count */}
      <div className="px-4 py-2 border-t border-slate-200 dark:border-zinc-700 text-[11px] text-slate-400 dark:text-zinc-500 flex items-center justify-between">
        <span>
          {visible.length} {t('relocation.ofTotal')} {allCandidates.length}
        </span>
        {selectedId && (
          <span className="inline-flex items-center gap-1 text-blue-500">
            <Heart size={10} aria-label={t('relocation.saved')} />
          </span>
        )}
      </div>
    </div>
  )
}
