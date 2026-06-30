import React, { memo, useCallback, useMemo, useState } from 'react'
import { useTranslation } from '../../../i18n'
import type { CandidateView, FilterSlider } from '../relocationModel'
import CandidateRow from './CandidateRow'
import { Search, ArrowDownAZ, Heart, X, Eye, EyeOff } from 'lucide-react'

type SortKey = 'score' | 'rent' | 'name'

// ponytail: #26 alias map — substring matches the user clearly meant
// (e.g. "NYC" → New York, "TX" → Texas). Cheap O(n) pass; expand when
// product asks for more.
const SEARCH_ALIASES: Record<string, string[]> = {
  nyc: ['new york'],
  sf: ['san francisco'],
  la: ['los angeles'],
  dc: ['washington'],
}

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
  onCompareTop,
  savedIds,
  stateFilter,
  setStateFilter,
  availableStates,
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
  onCompareTop: () => void
  savedIds: Set<string>
  stateFilter: string
  setStateFilter: (s: string) => void
  availableStates: string[]
}): React.ReactElement {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('score')
  // ponytail: local view tab — session-local like search/sort. Two-segment
  // toggle; revisit when a third view (e.g. Dismissed) is requested.
  const [view, setView] = useState<'all' | 'saved'>('all')

  // stable handlers so CandidateRow (when memoized upstream) can skip re-render
  const handleSelect = useCallback((c: CandidateView) => onSelect(c), [onSelect])
  const handleDismiss = useCallback((id: string) => onDismiss(id), [onDismiss])
  const handleSave = useCallback((id: string) => onSave(id), [onSave])

  // ponytail: derived view, no need to lift. candidates is already filtered
  // upstream; we only handle the text search + sort + saved-tab filter here.
  // Saved-tab filter runs first so search/sort operate on the narrowed set.
  const visible = useMemo(() => {
    const base = view === 'saved'
      ? candidates.filter(c => savedIds.has(c.location.id))
      : candidates
    const q = search.trim().toLowerCase()
    const aliases = q ? (SEARCH_ALIASES[q] ?? []) : []
    const searched = q
      ? base.filter(c => {
          const name = c.location.name.toLowerCase()
          const state = c.location.state.toLowerCase()
          // ponytail: #26 — alias expansion ("NYC" → "new york").
          // Plain substring still works for partial typing ("aus" → Austin).
          return (
            name.includes(q) ||
            state.includes(q) ||
            aliases.some(a => name.includes(a) || state.includes(a))
          )
        })
      : base
    const sorted = [...searched]
    if (sortKey === 'score') sorted.sort((a, b) => b.score - a.score)
    else if (sortKey === 'rent') {
      sorted.sort((a, b) => {
        const ar = a.location.cost?.medianRent ?? Infinity
        const br = b.location.cost?.medianRent ?? Infinity
        return ar - br
      })
    } else sorted.sort((a, b) => a.location.name.localeCompare(b.location.name))
    return sorted
  }, [candidates, search, sortKey, view, savedIds])

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

      {/* View tabs — ponytail: segmented toggle, two buttons sharing a rounded
          container. Reuses the same slate/blue palette as the rest of the
          panel. Saved tab shows a count badge in the same style as the
          header count. */}
      <div
        role="tablist"
        aria-label="Candidate library view"
        className="flex items-center gap-1 px-3 pt-2 border-b border-slate-200 dark:border-zinc-700"
      >
        {([
          { key: 'all', label: t('relocation.topCandidates') },
          { key: 'saved', label: t('relocation.saved') },
        ] as const).map(({ key, label }) => {
          const isActive = view === key
          const count = key === 'saved' ? savedIds.size : allCandidates.length
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-pressed={isActive}
              onClick={() => setView(key)}
              className={
                isActive
                  ? 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white'
                  : 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-700 transition-colors'
              }
            >
              {key === 'saved' && <Heart size={11} className={isActive ? 'fill-current' : ''} />}
              <span>{label}</span>
              <span
                className={
                  isActive
                    ? 'text-[10px] px-1.5 py-0.5 rounded-full bg-white/20 text-white font-medium'
                    : 'text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-700 text-slate-600 dark:text-zinc-300 font-medium'
                }
              >
                {count}
              </span>
            </button>
          )
        })}
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
        {/* ponytail: state filter — native <select> avoids a custom dropdown lib.
            "All states" = empty value. Search box + state filter compose
            (filter narrows upstream, search narrows locally). */}
        {availableStates.length > 0 && (
          <select
            value={stateFilter}
            onChange={e => setStateFilter(e.target.value)}
            aria-label={t('relocation.stateFilter')}
            className="mt-2 w-full px-2 py-1.5 text-xs bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg text-slate-600 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">{t('relocation.allStates')}</option>
            {availableStates.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}
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
                  {/* ponytail: explicit text label + icon — Eye/EyeOff alone was
                      opaque (roast #15). aria-label still set for screen readers. */}
                  <button
                    type="button"
                    onClick={() => onToggleSlider(slider.id)}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200 rounded transition-colors"
                    aria-label={
                      slider.enabled
                        ? t('relocation.filterDisable')
                        : t('relocation.filterEnable')
                    }
                    aria-pressed={slider.enabled}
                  >
                    {slider.enabled ? <Eye size={11} /> : <EyeOff size={11} />}
                    <span>{slider.enabled ? 'On' : 'Off'}</span>
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
            {t('relocation.compareSelected', { count: compareIds.length })}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onCompareTop}
              disabled={allCandidates.length < 2}
              className="text-[11px] px-2 py-1 text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
              title="Compare top 3 by score"
            >
              Top 3
            </button>
            <button
              type="button"
              onClick={onClearCompare}
              className="text-[11px] px-2 py-1 text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white"
            >
              {t('relocation.compareClear')}
            </button>
            <button
              type="button"
              onClick={onOpenCompare}
              disabled={compareIds.length < 2}
              className="text-[11px] px-2.5 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-md font-medium"
              title={compareIds.length < 2 ? t('relocation.compareMinHint') : t('relocation.compareShortlist')}
            >
              {t('relocation.compareButton', { count: compareIds.length })}
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
            isSaved={savedIds.has(c.location.id)}
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
          {savedIds.size > 0 && (
            <span className="ml-2 text-red-500">
              · {t('relocation.savedCount', { count: savedIds.size })}
            </span>
          )}
        </span>
        {selectedId && (
          <span className="inline-flex items-center gap-1 text-blue-500">
            <Heart
              size={10}
              fill={savedIds.has(selectedId) ? 'currentColor' : 'none'}
              aria-label={t('relocation.saved')}
            />
          </span>
        )}
      </div>
    </div>
  )
}
