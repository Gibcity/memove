import { useEffect, useRef, useState, type ReactElement } from 'react'
import { AlertTriangle, ChevronRight, ExternalLink, X } from 'lucide-react'
import { useTranslation } from '../../../i18n'
import { formatCurrency, scoreToColor } from '../relocationModel'
import type { CandidateView } from '../relocationModel'
import type { AffordabilityData } from '../useRelocationScore'
import { relocationApi, type ScoreExplanation } from '../../../api/relocation'
import type { Location } from '@memove/shared'
import { RadarChart, type RadarDatum } from '../charts'

type Translator = (key: string, params?: Record<string, string | number>) => string

// ponytail: 0 reads as a real value for ratios/percents but for these fields
// the API returns 0 to mean "we have no number" (cities with no school
// dataset, no big-box store footprint, etc.). Reuse the existing '—' fallback
// glyph so the empty style matches every other MetricItem.
const fmtMetric = (
  value: number | null | undefined,
  formatter: (n: number) => string,
  notAvailable: string,
): string => (value == null || value === 0 ? notAvailable : formatter(value))

// ponytail: FOCUSABLE_SELECTOR covers everything Tab can land on inside the
// dialog. We trap focus by intercepting Tab/Shift+Tab on the last/first
// focusable element. Standard list — buttons, links, inputs, selects,
// textareas, and anything with tabindex >= 0.
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

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
  explanation: ScoreExplanation | null
  affordability: AffordabilityData | null
  deepData: Location | null
  loading: boolean
  onClose: () => void
  compareWith?: CandidateView | null
  compareResult?: { winner: string } | { error: string } | null
}): ReactElement {
  const { t } = useTranslation()
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  // ponytail: focus management for dialog a11y — save opener, focus close,
  // Escape closes, Tab cycles within dialog (focus trap), restore focus on
  // unmount. No deps; effect runs on mount.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    closeBtnRef.current?.focus()

    const getFocusable = (): HTMLElement[] => {
      const root = dialogRef.current
      if (!root) return []
      return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      // ponytail: focus trap — only when focus is inside our dialog.
      // Without this check, Tab from outside (e.g. an iframe) would still
      // get stolen; with it, we only enforce the trap for the dialog.
      if (e.key !== 'Tab') return
      const root = dialogRef.current
      if (!root || !root.contains(document.activeElement)) return
      const focusables = getFocusable()
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
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
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('relocation.compareAriaLabel', {
          a: candidate.location.name,
          b: compareWith.location.name,
        })}
        className="absolute right-0 top-0 h-full w-full max-w-[960px] z-30 flex slide-in-right"
      >
        <div className="relative w-full bg-white dark:bg-zinc-900 shadow-2xl h-full overflow-y-auto">
          <div className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-700 px-5 py-4 flex items-center justify-between z-10">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                {t('relocation.compareTitle')}
              </h2>
              {compareResult && 'winner' in compareResult && (
                <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                  {t('relocation.winnerLabel', { name: compareResult.winner })}
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
              explanation={null}
              affordability={null}
              deepData={null}
              loading={false}
              t={t}
            />
          </div>
          {/* ponytail: per-metric delta strip below the 2-col grid. No new
              fetches — derive wins from the two CandidateView.score / cost /
              climate data already loaded. "Best for X" surfaces which city
              wins each axis; roast #9 said the winner string alone was too
              thin. */}
          <CompareDeltaRow a={candidate} b={compareWith} />
        </div>
      </div>
    )
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={t('relocation.detailAriaLabel', { name: candidate.location.name })}
      className="absolute right-0 top-0 h-full w-full max-w-[480px] z-30 flex slide-in-right"
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
  explanation: ScoreExplanation | null
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
          <MetricItem
            label={t('relocation.schoolRating')}
            value={fmtMetric(
              location.education?.publicSchoolRatingAvg,
              n => `${n.toFixed(1)} / 10`,
              '—',
            )}
          />
          <MetricItem
            label={t('relocation.studentTeacherRatio')}
            value={fmtMetric(
              location.education?.studentTeacherRatio,
              n => `${n.toFixed(1)} : 1`,
              '—',
            )}
          />
          <MetricItem
            label={t('relocation.natureAreas')}
            value={fmtMetric(
              location.amenities?.natureAreaCount,
              n => n.toFixed(0),
              '—',
            )}
          />
          <MetricItem
            label={t('relocation.bigBoxStores')}
            value={fmtMetric(
              location.amenities?.bigBoxStoreCount,
              n => n.toFixed(0),
              '—',
            )}
          />
          <MetricItem
            label={t('relocation.groceryStores')}
            value={fmtMetric(
              location.amenities?.groceryStoreDensityPerCapita,
              // ponytail: per-capita is tiny (~0.00003 for a typical metro);
              // show per-100k so the number is readable.
              n => `${(n * 100_000).toFixed(1)}`,
              '—',
            )}
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
          <div className="space-y-3">
            {explanation && explanation.dataGaps.count > 0 && (
              <div className="flex gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>
                  {t('relocation.dataGapWarning', { count: explanation.dataGaps.count })}
                </span>
              </div>
            )}
            {explanation ? (
              <>
                {(explanation.explanation ?? []).slice(0, 4).map((line, i) => (
                  <p key={i} className="text-sm text-slate-600 dark:text-zinc-400 leading-relaxed">
                    {line}
                  </p>
                ))}
                <ScoreBreakdown explanation={explanation} t={t} locationName={location.name} />
              </>
            ) : (
              <p className="text-sm text-slate-600 dark:text-zinc-400 leading-relaxed">
                {candidate.decisionTrace || t('relocation.explanationUnavailable')}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Healthcare & Fiscal Deep Data */}
      {deepData && (
        <div className="space-y-4">
          {deepData.healthOutcomes && (
            <div>
              <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-300 mb-2">
                {t('relocation.healthcareOutcomes')}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <MetricItem
                  label={t('relocation.lifeExpectancy')}
                  value={deepData.healthOutcomes.lifeExpectancy
                    ? `${deepData.healthOutcomes.lifeExpectancy.toFixed(1)} yrs`
                    : '—'}
                />
                <MetricItem
                  label={t('relocation.pcpsPer100k')}
                  value={deepData.healthOutcomes.primaryCarePhysiciansPer100k
                    ? deepData.healthOutcomes.primaryCarePhysiciansPer100k.toFixed(0)
                    : '—'}
                />
                <MetricItem
                  label={t('relocation.adultObesity')}
                  value={deepData.healthOutcomes.adultObesityPct
                    ? `${(deepData.healthOutcomes.adultObesityPct * 100).toFixed(0)}%`
                    : '—'}
                />
                <MetricItem
                  label={t('relocation.mentalHealthDays')}
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
                {t('relocation.fiscalHealth')}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <MetricItem
                  label={t('relocation.pensionFunded')}
                  value={deepData.fiscal.statePensionFundedRatio != null
                    ? `${(deepData.fiscal.statePensionFundedRatio * 100).toFixed(0)}%`
                    : '—'}
                />
                <MetricItem
                  label={t('relocation.taxCompetitiveness')}
                  value={deepData.fiscal.taxCompetitivenessScore?.toFixed(0) ?? '—'}
                />
                <MetricItem
                  label={t('relocation.propertyTaxRate')}
                  value={deepData.cost?.propertyTaxRate != null
                    ? `${(deepData.cost.propertyTaxRate * 100).toFixed(2)}%`
                    : '—'}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Career & Housing Market — lazy on expand (native <details>) */}
      <CareerSection locationName={location.name} stateCode={location.state} t={t} />
      <HousingMarketSection locationId={location.id} t={t} />

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
  const { t } = useTranslation()
  const { ratio } = data
  let label: string
  let cls: string
  if (ratio <= 0.3) {
    label = t('relocation.affordable')
    cls = 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
  } else if (ratio <= 0.4) {
    label = t('relocation.tight')
    cls = 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
  } else {
    label = t('relocation.stretching')
    cls = 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
  }
  return (
    <span
      className={`mt-1.5 inline-flex items-center text-[11px] px-2 py-0.5 rounded-full font-medium ${cls}`}
      title={t('relocation.rentToIncomeRatio', { pct: (ratio * 100).toFixed(0) })}
    >
      {label} · {(ratio * 100).toFixed(0)}%
    </span>
  )
}

/**
 * Score breakdown — expandable list of subscores × weights. Native <details>
 * so no state/accordion lib; ponytail default open=true (parents almost always
 * want to see WHY a city got its score, that's the whole point of the drawer).
 * ponytail: radar chart on top so the shape of the score profile lands first;
 * numeric breakdown below for the precise numbers.
 */
export function ScoreBreakdown({
  explanation,
  t,
  locationName,
}: {
  explanation: ScoreExplanation
  t: Translator
  locationName: string
}): ReactElement {
  const rows = (Object.entries(explanation.subscores ?? {}) as [string, number][])
    .sort((a, b) => b[1] - a[1])
  const radarData: RadarDatum[] = rows.map(([metric, sub]) => ({
    label: metric,
    value: sub,
    max: 100,
  }))
  return (
    <details open className="group rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50/50 dark:bg-zinc-800/30">
      <summary className="flex items-center gap-1.5 cursor-pointer px-3 py-2 text-xs font-semibold text-slate-700 dark:text-zinc-300 list-none">
        <ChevronRight size={14} className="transition-transform group-open:rotate-90" />
        {t('relocation.scoreBreakdownLabel', { score: explanation.matchScore })}
      </summary>
      <div className="px-3 pb-3 space-y-3">
        {radarData.length > 0 && (
          <div
            className="max-w-[320px] mx-auto text-blue-600 dark:text-blue-400"
            aria-label={t('relocation.subscoreRadarAria', { name: locationName })}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400 text-center mb-1">
              {t('relocation.subscoreRadarLabel')}
            </p>
            <RadarChart data={radarData} color="currentColor" />
          </div>
        )}
        <div className="space-y-2">
        {rows.map(([metric, sub]) => {
          const weight = Number(explanation.weightsUsed?.[metric] ?? 0)
          return (
            <div key={metric} className="space-y-0.5">
              <div className="flex items-baseline justify-between text-[11px]">
                <span className="font-medium text-slate-700 dark:text-zinc-300 capitalize">
                  {metric}
                </span>
                <span className="text-slate-400 dark:text-zinc-500 tabular-nums">
                  {t('relocation.metricWeight', {
                    sub: sub.toFixed(0),
                    weight: (weight * 100).toFixed(0),
                  })}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-200 dark:bg-zinc-700 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(0, Math.min(100, sub))}%`,
                    background: scoreToColor(sub),
                  }}
                />
              </div>
            </div>
          )
        })}
        </div>
      </div>
    </details>
  )
}

/**
 * ponytail: per-metric "Best for…" strip below the 2-col compare grid.
 * Lower-is-better for cost-of-living, rent, crime, hot days; higher-is-better
 * for score, broadband, healthcare. Tied or missing values skip. No new
 * fetches — derives from each CandidateView's already-loaded cost/climate/etc.
 */
function CompareDeltaRow({
  a,
  b,
}: {
  a: CandidateView
  b: CandidateView
}): ReactElement {
  const { t } = useTranslation()
  // ponytail: lower-is-better for cost-of-living, rent, crime, hot days;
  // higher-is-better for score, broadband, healthcare. Tied or missing values
  // skip. No new fetches — derives from each CandidateView's already-loaded
  // cost/climate/etc.
  const rows: Array<{ axis: string; aVal: number | null; bVal: number | null; lowerBetter: boolean }> = [
    {
      axis: 'Match Score',
      aVal: a.score,
      bVal: b.score,
      lowerBetter: false,
    },
    {
      axis: 'Cost of Living',
      aVal: a.location.cost?.costOfLivingIndex ?? null,
      bVal: b.location.cost?.costOfLivingIndex ?? null,
      lowerBetter: true,
    },
    {
      axis: 'Median Rent',
      aVal: a.location.cost?.medianRent ?? null,
      bVal: b.location.cost?.medianRent ?? null,
      lowerBetter: true,
    },
    {
      axis: 'Broadband %',
      aVal: a.location.broadband?.pctHouseholdsWith100MbpsPlus ?? null,
      bVal: b.location.broadband?.pctHouseholdsWith100MbpsPlus ?? null,
      lowerBetter: false,
    },
    {
      axis: 'Violent Crime',
      aVal: a.location.crime?.violentCrimeRatePer100k ?? null,
      bVal: b.location.crime?.violentCrimeRatePer100k ?? null,
      lowerBetter: true,
    },
    {
      axis: 'Hot Days/yr',
      aVal: a.location.climate?.daysMaxGt90FAnnual ?? null,
      bVal: b.location.climate?.daysMaxGt90FAnnual ?? null,
      lowerBetter: true,
    },
  ]
  // ponytail: filter axes where both have data; ties render as neither "best".
  const winners = rows
    .filter(r => r.aVal != null && r.bVal != null)
    .map(r => {
      const winner: 'a' | 'b' | 'tie' =
        r.aVal === r.bVal
          ? 'tie'
          : r.lowerBetter
            ? (r.aVal as number) < (r.bVal as number) ? 'a' : 'b'
            : (r.aVal as number) > (r.bVal as number) ? 'a' : 'b'
      return { ...r, winner }
    })
    .filter(r => r.winner !== 'tie')

  if (winners.length === 0) return <></>

  return (
    <div
      className="border-t border-slate-200 dark:border-zinc-700 bg-slate-50/60 dark:bg-zinc-800/40 px-5 py-3"
      aria-label={t('relocation.compareDeltaLabel')}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-2">
        {t('relocation.bestForLabel')}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 text-[11px]">
        {winners.map(r => {
          const winnerName = r.winner === 'a' ? a.location.name : b.location.name
          const winnerColor = r.winner === 'a' ? 'text-blue-700 dark:text-blue-300' : 'text-purple-700 dark:text-purple-300'
          return (
            <div key={r.axis} className="flex items-baseline gap-1.5">
              <span className="text-slate-500 dark:text-zinc-400">{r.axis}:</span>
              <span className={`font-semibold truncate ${winnerColor}`}>{winnerName}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * ponytail: collapsible Career section. Native <details> gives free lazy-load
 * on first expand via onToggle. We fetch economicIndicators + licensing for
 * the candidate's state in parallel (same pattern as useRelocationScore:60-71
 * for affordability). Occupation outlook is opened on demand from a tiny
 * inline input — one extra fetch, no auto-load.
 */
function CareerSection({
  locationName,
  stateCode,
  t,
}: {
  locationName: string
  stateCode: string
  t: Translator
}): ReactElement {
  const [econ, setEcon] = useState<Record<string, unknown> | null>(null)
  const [boards, setBoards] = useState<Record<string, { name: string; url: string }> | null>(null)
  const [loading, setLoading] = useState(false)
  const seqRef = useRef(0)
  // ponytail: ref tracks the latest request so a stale candidate click
  // doesn't overwrite the active drawer's data (mirrors deepSeqRef pattern).
  const loadedFor = useRef<string | null>(null)

  const load = () => {
    if (loadedFor.current === locationName || loading) return
    loadedFor.current = locationName
    const seq = ++seqRef.current
    setLoading(true)
    Promise.allSettled([
      relocationApi.economicIndicators(locationName),
      relocationApi.licensing(stateCode),
    ]).then(([e, l]) => {
      if (seq !== seqRef.current) return
      setEcon(e.status === 'fulfilled' ? (e.value as Record<string, unknown>) : null)
      setBoards(l.status === 'fulfilled' ? (l.value as Record<string, { name: string; url: string }>) : null)
      setLoading(false)
    })
  }
  // ponytail: occupation outlook is its own tiny input + go button. Keeps the
  // section cheap by not requiring user context we don't have server-side.
  const [occ, setOcc] = useState('')
  const [occData, setOccData] = useState<{ blsOohUrl: string } | null>(null)
  const lookupOcc = () => {
    const q = occ.trim()
    if (!q) return
    relocationApi.outlook(q).then((d: { blsOohUrl: string }) => setOccData(d)).catch(() => setOccData(null))
  }

  return (
    <details
      className="group rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50/50 dark:bg-zinc-800/30"
      onToggle={e => { if ((e.currentTarget as HTMLDetailsElement).open) load() }}
    >
      <summary className="flex items-center gap-1.5 cursor-pointer px-3 py-2 text-xs font-semibold text-slate-700 dark:text-zinc-300 list-none">
        <ChevronRight size={14} className="transition-transform group-open:rotate-90" />
        {t('relocation.careerSectionLabel')}
      </summary>
      <div className="px-3 pb-3 space-y-3 text-xs">
        {loading && (
          <div className="flex items-center gap-2 text-slate-400">
            <div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
            {t('relocation.loading')}
          </div>
        )}
        {!loading && econ && (
          <div className="grid grid-cols-2 gap-2">
            <MetricItem label={t('relocation.colIndex')} value={String(econ.costOfLivingIndex ?? '—')} />
            <MetricItem label={t('relocation.taxScore')} value={String(econ.taxCompetitivenessScore ?? '—')} />
            <MetricItem
              label={t('relocation.medianHome')}
              value={typeof econ.medianHomeValue === 'number' ? formatCurrency(econ.medianHomeValue as number) : '—'}
            />
            <MetricItem
              label={t('relocation.medianRent')}
              value={typeof econ.medianRent === 'number' ? `${formatCurrency(econ.medianRent as number)}/mo` : '—'}
            />
          </div>
        )}
        {!loading && boards && (
          <div>
            <p className="font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
              {t('relocation.licensingLabel', { state: stateCode })}
            </p>
            <ul className="space-y-1">
              {Object.entries(boards).map(([prof, b]) => (
                <li key={prof} className="flex items-baseline justify-between gap-2">
                  <span className="text-slate-500 dark:text-zinc-400 capitalize">{prof.replace(/_/g, ' ')}</span>
                  <a
                    href={b.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline truncate inline-flex items-center gap-1"
                  >
                    {b.name} <ExternalLink size={10} />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <p className="font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">{t('relocation.outlookLabel')}</p>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={occ}
              onChange={e => setOcc(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') lookupOcc() }}
              placeholder={t('relocation.outlookPlaceholder')}
              className="flex-1 min-w-0 px-2 py-1 rounded border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-200"
            />
            <button
              onClick={lookupOcc}
              disabled={!occ.trim()}
              className="px-2 py-1 rounded bg-blue-600 text-white disabled:opacity-50"
            >
              {t('relocation.outlookGo')}
            </button>
          </div>
          {occData && (
            <a
              href={occData.blsOohUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
            >
              {t('relocation.viewOnBls')} <ExternalLink size={10} />
            </a>
          )}
        </div>
      </div>
    </details>
  )
}

/**
 * ponytail: collapsible Housing Market section. Native <details>, lazy fetch
 * market + listings on first open. Listings are external search URLs, not
 * scraped MLS data — render as a small link list.
 */
function HousingMarketSection({
  locationId,
  t,
}: {
  locationId: string
  t: Translator
}): ReactElement {
  // ponytail: keep return shape untyped — server endpoints return stub data;
  // tighten when contract settles. captured flag avoids duplicate fetches when
  // the user opens/closes the section.
  const [market, setMarket] = useState<Record<string, unknown> | null>(null)
  const [listings, setListings] = useState<Array<{ platform: string; url: string; type: string }> | null>(null)
  const [loading, setLoading] = useState(false)
  const fetchedRef = useRef<string | null>(null)

  const load = () => {
    if (fetchedRef.current === locationId || loading) return
    fetchedRef.current = locationId
    setLoading(true)
    Promise.allSettled([
      relocationApi.getMarketData(locationId),
      relocationApi.getListings(locationId),
    ]).then(([m, l]) => {
      setMarket(m.status === 'fulfilled' ? (m.value as Record<string, unknown>) : null)
      setListings(
        l.status === 'fulfilled'
          ? (l.value as Array<{ platform: string; url: string; type: string }>)
          : null,
      )
      setLoading(false)
    })
  }

  // ponytail: priceToRentRatio is the one derived market metric the server
  // ships but the drawer doesn't otherwise show — surface it alongside the
  // three core fields.
  const listingsSorted = listings ? [...listings].sort((a, b) => a.type.localeCompare(b.type)) : null

  return (
    <details
      className="group rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50/50 dark:bg-zinc-800/30"
      onToggle={e => { if ((e.currentTarget as HTMLDetailsElement).open) load() }}
    >
      <summary className="flex items-center gap-1.5 cursor-pointer px-3 py-2 text-xs font-semibold text-slate-700 dark:text-zinc-300 list-none">
        <ChevronRight size={14} className="transition-transform group-open:rotate-90" />
        {t('relocation.housingMarketLabel')}
      </summary>
      <div className="px-3 pb-3 space-y-3 text-xs">
        {loading && (
          <div className="flex items-center gap-2 text-slate-400">
            <div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
            {t('relocation.loading')}
          </div>
        )}
        {!loading && market && (
          <div className="grid grid-cols-2 gap-2">
            <MetricItem
              label={t('relocation.medianHome')}
              value={typeof market.medianHomeValue === 'number' ? formatCurrency(market.medianHomeValue as number) : '—'}
            />
            <MetricItem
              label={t('relocation.medianRent')}
              value={typeof market.medianRent === 'number' ? `${formatCurrency(market.medianRent as number)}/mo` : '—'}
            />
            <MetricItem
              label={t('relocation.priceToRent')}
              value={typeof market.priceToRentRatio === 'number' ? (market.priceToRentRatio as number).toFixed(1) : '—'}
            />
            <MetricItem
              label={t('relocation.propertyTaxRate')}
              value={typeof market.propertyTaxRate === 'number' ? `${((market.propertyTaxRate as number) * 100).toFixed(2)}%` : '—'}
            />
          </div>
        )}
        {!loading && listingsSorted && listingsSorted.length > 0 && (
          <div>
            <p className="font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
              {t('relocation.listingsLabel')}
            </p>
            <ul className="space-y-1">
              {listingsSorted.map((l, i) => (
                <li key={`${l.platform}-${l.type}-${i}`} className="flex items-baseline justify-between gap-2">
                  <span className="text-slate-500 dark:text-zinc-400">
                    {l.platform} · <span className="capitalize">{l.type}</span>
                  </span>
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                  >
                    {t('relocation.openListing')} <ExternalLink size={10} />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        {!loading && listingsSorted && listingsSorted.length === 0 && (
          <p className="text-slate-400 dark:text-zinc-500">{t('relocation.noListings')}</p>
        )}
      </div>
    </details>
  )
}