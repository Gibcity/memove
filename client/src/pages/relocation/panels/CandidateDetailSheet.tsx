import { useEffect, useRef, type ReactElement } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from '../../../i18n'
import { formatCurrency, scoreToColor } from '../relocationModel'
import type { CandidateView } from '../relocationModel'
import type { AffordabilityData } from '../useRelocationScore'
import type { Location } from '@memove/shared'

type Translator = (key: string, params?: Record<string, string | number>) => string

export function CandidateDetailSheet({
  candidate,
  explanation,
  affordability,
  deepData,
  loading,
  onClose,
  // ponytail: lazy 2-col mode — when `compareWith` is provided, render both
  // side-by-side instead of one. Same panel, no new file.
  compareWith,
  compareResult,
}: {
  candidate: CandidateView
  explanation: string | null
  affordability: AffordabilityData | null
  deepData: Location | null
  loading: boolean
  onClose: () => void
  compareWith?: CandidateView | null
  compareResult?: { winner: string } | { error: string } | null
}): ReactElement {
  const { t } = useTranslation()
  const closeBtnRef = useRef<HTMLButtonElement>(null)

  // ponytail: focus management for dialog a11y — save opener, focus close,
  // Escape closes, restore focus on unmount. No deps; effect runs on mount.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    closeBtnRef.current?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previouslyFocused?.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ponytail: lazy compare — when `compareWith` is set, swap the single-panel
  // layout for two CandidateBody instances in a CSS grid. The second panel
  // reuses the candidate's own decisionTrace (already shipped on every
  // CandidateView from /score) — no second explain call, add when product
  // wants live NL explanation for both.
  if (compareWith) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Compare ${candidate.location.name} vs ${compareWith.location.name}`}
        className="absolute right-0 top-0 h-full w-full max-w-[960px] z-30 flex"
      >
        <div className="relative w-full bg-white dark:bg-zinc-900 shadow-2xl h-full overflow-y-auto">
          <div className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-700 px-5 py-4 flex items-center justify-between z-10">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Compare
              </h2>
              {compareResult && 'winner' in compareResult && (
                <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                  Winner: {compareResult.winner}
                </p>
              )}
              {compareResult && 'error' in compareResult && (
                <p className="text-xs text-red-600 dark:text-red-400">
                  {compareResult.error}
                </p>
              )}
            </div>
            <button
              ref={closeBtnRef}
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              aria-label={t('common.close')}
            >
              <X size={20} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-px bg-slate-200 dark:bg-zinc-700">
            <CandidateBody
              candidate={candidate}
              explanation={explanation}
              affordability={affordability}
              deepData={deepData}
              loading={loading}
              t={t}
            />
            <CandidateBody
              candidate={compareWith}
              explanation={compareWith.decisionTrace || null}
              affordability={null}
              deepData={null}
              loading={false}
              t={t}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${candidate.location.name} details`}
      className="absolute right-0 top-0 h-full w-full max-w-[480px] z-30 flex"
    >
      {/* Drawer panel */}
      <div className="relative w-full bg-white dark:bg-zinc-900 shadow-2xl h-full overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-700 px-5 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              {candidate.location.name}
            </h2>
            <p className="text-sm text-slate-500 dark:text-zinc-400">
              {candidate.location.state} · {t('relocation.rank')} #{candidate.rank}
            </p>
          </div>
          <button
            ref={closeBtnRef}
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label={t('common.close')}
          >
            <X size={20} />
          </button>
        </div>
        <CandidateBody
          candidate={candidate}
          explanation={explanation}
          affordability={affordability}
          deepData={deepData}
          loading={loading}
          t={t}
        />
      </div>
    </div>
  )
}

/**
 * ponytail: extracted body so the 2-col compare path can render two panels.
 * Inner content is identical to the original single-panel layout — kept as a
 * single source of truth, no duplication.
 */
function CandidateBody({
  candidate,
  explanation,
  affordability,
  deepData,
  loading,
  t,
}: {
  candidate: CandidateView
  explanation: string | null
  affordability: AffordabilityData | null
  deepData: Location | null
  loading: boolean
  t: Translator
}): ReactElement {
  const { location, score, rank } = candidate
  return (
    <div className="p-5 space-y-5 bg-white dark:bg-zinc-900">
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
          <AffordabilityBadge data={affordability} />
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
            value={location.cost?.costOfLivingIndex?.toFixed(0) ?? '—'}
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
            value={location.climate?.daysMaxGt90FAnnual?.toFixed(0) ?? '—'}
          />
          <MetricItem
            label={t('relocation.violentCrime')}
            value={location.crime?.violentCrimeRatePer100k?.toFixed(0) ?? '—'}
          />
          <MetricItem
            label={t('relocation.broadband')}
            value={
              location.broadband?.pctHouseholdsWith100MbpsPlus?.toFixed(0) ?? '—'
            }
          />
          <MetricItem
            label={t('relocation.healthcare')}
            value={location.healthcare?.healthcareAccessScore?.toFixed(0) ?? '—'}
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

      {/* Healthcare & Fiscal Deep Data */}
      {deepData && (
        <div className="space-y-4">
          {deepData.healthOutcomes && (
            <div>
              <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-300 mb-2">
                Healthcare Outcomes
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <MetricItem
                  label="Life Expectancy"
                  value={deepData.healthOutcomes.lifeExpectancy
                    ? `${deepData.healthOutcomes.lifeExpectancy.toFixed(1)} yrs`
                    : '—'}
                />
                <MetricItem
                  label="PCPs /100k"
                  value={deepData.healthOutcomes.primaryCarePhysiciansPer100k
                    ? deepData.healthOutcomes.primaryCarePhysiciansPer100k.toFixed(0)
                    : '—'}
                />
                <MetricItem
                  label="Adult Obesity %"
                  value={deepData.healthOutcomes.adultObesityPct
                    ? `${(deepData.healthOutcomes.adultObesityPct * 100).toFixed(0)}%`
                    : '—'}
                />
                <MetricItem
                  label="Poor Mental Health Days/mo"
                  value={deepData.healthOutcomes.poorMentalHealthDays
                    ? deepData.healthOutcomes.poorMentalHealthDays.toFixed(1)
                    : '—'}
                />
              </div>
            </div>
          )}

          {deepData.fiscal && (
            <div>
              <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-300 mb-2">
                Fiscal Health
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <MetricItem
                  label="State Pension Funded Ratio"
                  value={deepData.fiscal.statePensionFundedRatio != null
                    ? `${(deepData.fiscal.statePensionFundedRatio * 100).toFixed(0)}%`
                    : '—'}
                />
                <MetricItem
                  label="Tax Competitiveness"
                  value={deepData.fiscal.taxCompetitivenessScore?.toFixed(0) ?? '—'}
                />
                <MetricItem
                  label="Property Tax Rate"
                  value={deepData.cost?.propertyTaxRate != null
                    ? `${(deepData.cost.propertyTaxRate * 100).toFixed(2)}%`
                    : '—'}
                />
              </div>
            </div>
          )}
        </div>
      )}

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
  )
}

export function MetricItem({
  label,
  value,
}: {
  label: string
  value: string
}): ReactElement {
  return (
    <div className="p-3 bg-slate-50 dark:bg-zinc-800/50 rounded-xl">
      <p className="text-[11px] text-slate-400 dark:text-zinc-500">{label}</p>
      <p className="text-sm font-semibold text-slate-800 dark:text-zinc-200 mt-0.5">
        {value}
      </p>
    </div>
  )
}

/**
 * Affordability badge — color-coded pill summarizing rent-to-income ratio.
 * ponytail: 3-tier ratio cutoffs (0.30 / 0.40) match the common
 * "housing-cost-burden" definition; tweak thresholds when product decides
 * its own bands.
 */
export function AffordabilityBadge({
  data,
}: {
  data: AffordabilityData | null
}): ReactElement | null {
  if (!data) return null
  const { ratio } = data
  let label: string
  let cls: string
  if (ratio <= 0.3) {
    label = 'Affordable'
    cls = 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
  } else if (ratio <= 0.4) {
    label = 'Tight'
    cls = 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
  } else {
    label = 'Stretching'
    cls = 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
  }
  return (
    <span
      className={`mt-1.5 inline-flex items-center text-[11px] px-2 py-0.5 rounded-full font-medium ${cls}`}
      title={`Rent-to-income ratio: ${(ratio * 100).toFixed(0)}%`}
    >
      {label} · {(ratio * 100).toFixed(0)}%
    </span>
  )
}