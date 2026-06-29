import React, { useState } from 'react'
import { useTranslation } from '../../i18n'
import Navbar from '../../components/Layout/Navbar'
import MobileTopBar from '../../components/Layout/MobileTopBar'
import { useRelocationCandidates } from './useRelocationCandidates'
import { useRelocationElicitation } from './useRelocationElicitation'
import { useRelocationScore } from './useRelocationScore'
import type { FilterSlider } from './relocationModel'
import { formatCurrency, scoreToColor } from './relocationModel'
import {
  MapPin,
  SlidersHorizontal,
  Heart,
  X,
  ChevronRight,
  Info,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
} from 'lucide-react'

// ══════════════════════════════════════════════════════════════════════
// RelocationDashboardPage — wiring container
// All state, data loading, and event handlers live in the co-located
// useRelocation* hooks. This component only renders what they return.
// ══════════════════════════════════════════════════════════════════════

export default function RelocationDashboardPage(): React.ReactElement {
  const { t } = useTranslation()

  const {
    candidates,
    allCandidates,
    isLoading,
    loadError,
    retryLoad,
    sliders,
    updateSlider,
    toggleSlider,
    sendFilterApplySignal,
    dismissCandidate,
    saveCandidate,
    dismissCounts,
  } = useRelocationCandidates()

  const {
    elicitation,
    profile,
    showElicitationCard,
    hardFilterPrompt,
    startElicitation,
    answerQuestion,
    skipQuestion,
    skipAll,
    confirmHardFilter,
    dismissHardFilterPrompt,
    setShowElicitationCard,
  } = useRelocationElicitation(dismissCounts)

  const { detail, explainLoading, openDetail, closeDetail } =
    useRelocationScore()

  const [sidebarOpen, setSidebarOpen] = useState(false)

  if (isLoading) {
    return (
      <>
        <Navbar />
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-zinc-950">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
            <p className="text-slate-500 text-sm">{t('common.loading')}</p>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-slate-50 dark:bg-zinc-950">
        <MobileTopBar />

        <main className="max-w-7xl mx-auto px-4 py-6">
          {/* ── Header ─────────────────────────────────────────── */}
          <header className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                {t('relocation.title')}
              </h1>
              <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
                {t('relocation.subtitle')}
              </p>
            </div>
            <button
              className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl
                         text-sm font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700 transition-colors"
              onClick={() => setSidebarOpen(o => !o)}
              aria-label={t('relocation.filterToggle')}
            >
              <SlidersHorizontal size={16} />
              {t('relocation.filters')}
            </button>
          </header>

          {/* ── Elicitation card ────────────────────────────────── */}
          {showElicitationCard && (
            <ElicitationCard
              elicitation={elicitation}
              onStart={startElicitation}
              onAnswer={answerQuestion}
              onSkip={skipQuestion}
              onSkipAll={skipAll}
              onDismiss={() => setShowElicitationCard(false)}
            />
          )}

          {/* ── Hard-filter prompt ──────────────────────────────── */}
          {hardFilterPrompt && (
            <HardFilterBanner
              prompt={hardFilterPrompt}
              onConfirm={confirmHardFilter}
              onDismiss={dismissHardFilterPrompt}
            />
          )}

          {/* ── Load error ──────────────────────────────────────── */}
          {loadError && (
            <div
              className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-center justify-between"
              role="alert"
            >
              <span className="text-red-700 dark:text-red-300 text-sm">
                {t('relocation.loadError')}
              </span>
              <button
                onClick={retryLoad}
                className="px-3 py-1 bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-200 rounded-lg text-sm font-medium"
              >
                {t('relocation.retry')}
              </button>
            </div>
          )}

          {/* ── Main content area ───────────────────────────────── */}
          <div className="flex gap-6">
            {/* Sidebar with filter sliders */}
            {sidebarOpen && (
              <aside className="w-72 shrink-0">
                <FilterSidebar
                  sliders={sliders}
                  onUpdate={updateSlider}
                  onToggle={toggleSlider}
                  onApply={sendFilterApplySignal}
                  onClose={() => setSidebarOpen(false)}
                />
              </aside>
            )}

            {/* Content */}
            <div className="flex-1 min-w-0 space-y-6">
              {/* Top candidates summary + map */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-semibold text-slate-800 dark:text-zinc-200">
                    {t('relocation.topCandidates')}
                    <span className="ml-2 text-sm font-normal text-slate-400">
                      ({candidates.length} {t('relocation.ofTotal')}{' '}
                      {allCandidates.length})
                    </span>
                  </h2>
                </div>

                {/* Candidate grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {candidates.slice(0, 9).map(c => (
                    <CandidateCard
                      key={c.location.id}
                      candidate={c}
                      onDetail={() => openDetail(c)}
                      onDismiss={() =>
                        dismissCandidate(c.location.id, 'dismissed_from_grid')
                      }
                      onSave={() => saveCandidate(c.location.id)}
                    />
                  ))}
                </div>

                {candidates.length === 0 && !loadError && (
                  <div className="text-center py-12 text-slate-400 dark:text-zinc-500">
                    <MapPin size={48} className="mx-auto mb-3 opacity-30" />
                    <p>{t('relocation.noCandidates')}</p>
                    <p className="text-sm mt-1">
                      {t('relocation.noCandidatesHint')}
                    </p>
                  </div>
                )}
              </section>

              {/* Profile summary (when available) */}
              {profile && profile.nonNegotiablesDiscovered.length > 0 && (
                <section className="p-4 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-300 mb-2">
                    {t('relocation.yourPreferences')}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {profile.nonNegotiablesDiscovered.map((n, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs"
                      >
                        <Check size={12} />
                        {n}
                      </span>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>
        </main>

        {/* ── Candidate detail drawer ───────────────────────────── */}
        {detail.isOpen && detail.candidate && (
          <CandidateDetailDrawer
            candidate={detail.candidate}
            explanation={detail.explanation}
            loading={explainLoading}
            onClose={closeDetail}
          />
        )}
      </div>
    </>
  )
}

// ══════════════════════════════════════════════════════════════════════
// Sub-components (presentation-only)
// ══════════════════════════════════════════════════════════════════════

function ElicitationCard({
  elicitation,
  onStart,
  onAnswer,
  onSkip,
  onSkipAll,
  onDismiss,
}: {
  elicitation: import('./relocationModel').ElicitationState
  onStart: () => void
  onAnswer: (answer: string) => void
  onSkip: () => void
  onSkipAll: () => void
  onDismiss: () => void
}): React.ReactElement {
  const { t } = useTranslation()

  return (
    <div className="mb-6 p-5 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 border border-blue-200 dark:border-blue-800 rounded-2xl">
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
  prompt: import('./relocationModel').HardFilterPrompt
  onConfirm: (filter: import('@trek/shared').HardFilter) => void
  onDismiss: () => void
}): React.ReactElement {
  const { t } = useTranslation()

  return (
    <div
      className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl"
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

function FilterSidebar({
  sliders,
  onUpdate,
  onToggle,
  onApply,
  onClose,
}: {
  sliders: FilterSlider[]
  onUpdate: (id: string, value: [number, number]) => void
  onToggle: (id: string) => void
  onApply: () => void
  onClose: () => void
}): React.ReactElement {
  const { t } = useTranslation()

  return (
    <div className="bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-2xl p-4 sticky top-20">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-300">
          {t('relocation.filters')}
        </h3>
        <button
          onClick={onClose}
          className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-700"
          aria-label={t('common.close')}
        >
          <X size={16} />
        </button>
      </div>

      <div className="space-y-5">
        {sliders.map(slider => (
          <div key={slider.id}>
            <div className="flex items-center justify-between mb-2">
              <label
                className="text-xs font-medium text-slate-600 dark:text-zinc-400 cursor-pointer"
                htmlFor={`filter-${slider.id}`}
              >
                {slider.label}
              </label>
              <button
                onClick={() => onToggle(slider.id)}
                className="p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300"
                aria-label={
                  slider.enabled
                    ? t('relocation.filterDisable')
                    : t('relocation.filterEnable')
                }
              >
                {slider.enabled ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                id={`filter-${slider.id}`}
                type="range"
                min={slider.min}
                max={slider.max}
                step={slider.step}
                value={slider.value[0]}
                onChange={e =>
                  onUpdate(slider.id, [
                    Number(e.target.value),
                    slider.value[1],
                  ])
                }
                disabled={!slider.enabled}
                className="w-full h-1.5 bg-slate-200 dark:bg-zinc-600 rounded-lg appearance-none cursor-pointer
                           accent-blue-600 disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label={t('relocation.filterMin', { name: slider.label })}
              />
              <input
                type="range"
                min={slider.min}
                max={slider.max}
                step={slider.step}
                value={slider.value[1]}
                onChange={e =>
                  onUpdate(slider.id, [
                    slider.value[0],
                    Number(e.target.value),
                  ])
                }
                disabled={!slider.enabled}
                className="w-full h-1.5 bg-slate-200 dark:bg-zinc-600 rounded-lg appearance-none cursor-pointer
                           accent-blue-600 disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label={t('relocation.filterMax', { name: slider.label })}
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-400 dark:text-zinc-500 mt-1">
              <span>{slider.value[0]}</span>
              <span>{slider.value[1]}</span>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={onApply}
        className="mt-5 w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors"
      >
        {t('relocation.applyFilters')}
      </button>
    </div>
  )
}

function CandidateCard({
  candidate,
  onDetail,
  onDismiss,
  onSave,
}: {
  candidate: import('./relocationModel').CandidateView
  onDetail: () => void
  onDismiss: () => void
  onSave: () => void
}): React.ReactElement {
  const { t } = useTranslation()
  const { location, score } = candidate

  return (
    <article
      className="group relative bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-2xl p-4
                        hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700 transition-all cursor-pointer"
      onClick={onDetail}
      role="button"
      tabIndex={0}
      aria-label={t('relocation.candidateDetail', {
        name: location.name,
      })}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onDetail()
        }
      }}
    >
      {/* Score badge */}
      <div className="absolute top-3 right-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-sm"
          style={{ background: scoreToColor(score) }}
          aria-label={`Score: ${score}`}
        >
          {score}
        </div>
      </div>

      {/* Location info */}
      <div className="pr-12">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
          {location.name}
        </h3>
        <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
          {location.state}
        </p>
      </div>

      {/* Quick stats */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="text-xs">
          <span className="text-slate-400 dark:text-zinc-500">
            {t('relocation.cost')}
          </span>
          <p className="font-medium text-slate-700 dark:text-zinc-300">
            {location.cost?.costOfLivingIndex?.toFixed(0) ?? '—'}
          </p>
        </div>
        <div className="text-xs">
          <span className="text-slate-400 dark:text-zinc-500">
            {t('relocation.home')}
          </span>
          <p className="font-medium text-slate-700 dark:text-zinc-300">
            {location.cost?.medianHomeValue
              ? formatCurrency(location.cost.medianHomeValue)
              : '—'}
          </p>
        </div>
        <div className="text-xs">
          <span className="text-slate-400 dark:text-zinc-500">
            {t('relocation.crime')}
          </span>
          <p className="font-medium text-slate-700 dark:text-zinc-300">
            {location.crime?.violentCrimeRatePer100k?.toFixed(0) ?? '—'}
          </p>
        </div>
        <div className="text-xs">
          <span className="text-slate-400 dark:text-zinc-500">
            {t('relocation.hotDays')}
          </span>
          <p className="font-medium text-slate-700 dark:text-zinc-300">
            {location.climate?.daysMaxGt90FAnnual ?? '—'}
          </p>
        </div>
      </div>

      {/* Action buttons — visible on hover/focus */}
      <div
        className="absolute bottom-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onSave}
          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
          aria-label={t('relocation.save')}
        >
          <Heart size={15} />
        </button>
        <button
          onClick={onDismiss}
          className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-zinc-700 rounded-lg transition-colors"
          aria-label={t('relocation.dismiss')}
        >
          <EyeOff size={15} />
        </button>
        <button
          onClick={onDetail}
          className="p-1.5 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
          aria-label={t('relocation.details')}
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </article>
  )
}

function CandidateDetailDrawer({
  candidate,
  explanation,
  loading,
  onClose,
}: {
  candidate: import('./relocationModel').CandidateView
  explanation: string | null
  loading: boolean
  onClose: () => void
}): React.ReactElement {
  const { t } = useTranslation()
  const { location, score, rank } = candidate

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer panel */}
      <div className="relative w-full max-w-lg bg-white dark:bg-zinc-900 shadow-2xl h-full overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-700 px-5 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              {location.name}
            </h2>
            <p className="text-sm text-slate-500 dark:text-zinc-400">
              {location.state} · {t('relocation.rank')} #{rank}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            aria-label={t('common.close')}
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Score ring */}
          <div className="flex items-center gap-4">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold text-white shadow-lg"
              style={{ background: scoreToColor(score) }}
            >
              {score}
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-zinc-300">
                {t('relocation.matchScore')}
              </p>
              <p className="text-xs text-slate-400 dark:text-zinc-500">
                {score >= 80
                  ? t('relocation.matchExcellent')
                  : score >= 60
                    ? t('relocation.matchGood')
                    : score >= 40
                      ? t('relocation.matchFair')
                      : t('relocation.matchLow')}
              </p>
            </div>
          </div>

          {/* Metrics grid */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-300 mb-3">
              {t('relocation.keyMetrics')}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <MetricItem
                label={t('relocation.costOfLiving')}
                value={
                  location.cost?.costOfLivingIndex?.toFixed(0) ?? '—'
                }
              />
              <MetricItem
                label={t('relocation.medianHome')}
                value={
                  location.cost?.medianHomeValue
                    ? formatCurrency(location.cost.medianHomeValue)
                    : '—'
                }
              />
              <MetricItem
                label={t('relocation.medianRent')}
                value={
                  location.cost?.medianRent
                    ? formatCurrency(location.cost.medianRent) + '/mo'
                    : '—'
                }
              />
              <MetricItem
                label={t('relocation.hotDays')}
                value={
                  location.climate?.daysMaxGt90FAnnual?.toFixed(0) ?? '—'
                }
              />
              <MetricItem
                label={t('relocation.violentCrime')}
                value={
                  location.crime?.violentCrimeRatePer100k?.toFixed(0) ??
                  '—'
                }
              />
              <MetricItem
                label={t('relocation.broadband')}
                value={
                  location.broadband?.pctHouseholdsWith100MbpsPlus?.toFixed(
                    0,
                  ) ?? '—'
                }
              />
              <MetricItem
                label={t('relocation.healthcare')}
                value={
                  location.healthcare?.healthcareAccessScore?.toFixed(0) ??
                  '—'
                }
              />
              <MetricItem
                label={t('relocation.incomeTax')}
                value={
                  location.cost?.stateIncomeTaxRate
                    ? `${(location.cost.stateIncomeTaxRate * 100).toFixed(0)}%`
                    : '—'
                }
              />
            </div>
          </div>

          {/* Explanation */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-300 mb-2">
              {t('relocation.whyThisCandidate')}
            </h3>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                {t('relocation.analyzing')}
              </div>
            ) : (
              <p className="text-sm text-slate-600 dark:text-zinc-400 leading-relaxed">
                {explanation || candidate.decisionTrace || '—'}
              </p>
            )}
          </div>

          {/* Provenance */}
          {location.metricsProvenance &&
            Object.keys(location.metricsProvenance).length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-300 mb-2">
                  {t('relocation.dataSources')}
                </h3>
                <div className="space-y-1">
                  {Object.entries(location.metricsProvenance).map(
                    ([key, prov]) => (
                      <a
                        key={key}
                        href={prov.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-xs text-blue-600 dark:text-blue-400 hover:underline truncate"
                      >
                        {prov.source} · {prov.license}
                      </a>
                    ),
                  )}
                </div>
              </div>
            )}
        </div>
      </div>
    </div>
  )
}

function MetricItem({
  label,
  value,
}: {
  label: string
  value: string
}): React.ReactElement {
  return (
    <div className="p-3 bg-slate-50 dark:bg-zinc-800/50 rounded-xl">
      <p className="text-[11px] text-slate-400 dark:text-zinc-500">{label}</p>
      <p className="text-sm font-semibold text-slate-800 dark:text-zinc-200 mt-0.5">
        {value}
      </p>
    </div>
  )
}
