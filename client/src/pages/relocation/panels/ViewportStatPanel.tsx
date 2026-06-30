import React from 'react'
import type { Location } from '@memove/shared'
import { scoreToColor } from '../relocationModel'

// ── Types ──────────────────────────────────────────────────────────

export interface ViewportStats {
  /** Number of candidates inside the current viewport. */
  n: number
  /** Median blended total score across visible metros (0–100). */
  medianScore: number
  /** Median monthly rent ($) across visible metros — right-skewed, median is correct. */
  medianRent: number
  /** Subscore with the highest mean across visible metros (label + value). */
  topSubscore: { key: string; label: string; value: number }
  /** Cheapest metro (lowest median rent) within the viewport. */
  cheapest: { id: string; name: string; score: number } | null
  /** Highest-scoring metro (max blended.totalScore0to100) within the viewport. */
  highest: { id: string; name: string; score: number } | null
  /** 5-number summary (min/p25/median/p75/max) of the top subscore, for the sparkline. */
  spark: { min: number; p25: number; median: number; p75: number; max: number }
}

export interface MapBounds {
  south: number
  west: number
  north: number
  east: number
}

export interface ViewportStatPanelProps {
  candidates: Location[]
  /** Plain `{south,west,north,east}` bounds for the current viewport; null while the map is initialising. */
  mapBounds: MapBounds | null
  /** Click handler for the cheapest/highest metro rows. */
  onSelect?: (locationId: string) => void
}

// Subscore fields on Location, with the human label used in the panel.
// Kept local — only the panel consumes it; centralising elsewhere would be YAGNI.
const SUBSCORES: Array<{ key: keyof Location; label: string; extract: (l: Location) => number | undefined }> = [
  { key: 'cost', label: 'Cost', extract: l => l.cost.costOfLivingIndex },
  { key: 'climate', label: 'Climate', extract: l => l.climate.tornadoRiskScore },
  { key: 'crime', label: 'Crime', extract: l => 100 - (l.crime.violentCrimeRatePer100k / 15) },
  { key: 'healthcare', label: 'Healthcare', extract: l => l.healthcare.healthcareAccessScore },
  { key: 'broadband', label: 'Broadband', extract: l => l.broadband.pctHouseholdsWith100MbpsPlus },
  { key: 'education', label: 'Education', extract: l => l.education?.publicSchoolRatingAvg != null ? l.education.publicSchoolRatingAvg * 10 : undefined },
  { key: 'fiscal', label: 'Fiscal', extract: l => l.fiscal.taxCompetitivenessScore },
  { key: 'amenities', label: 'Amenities', extract: l => l.amenities.recreationAreaCount > 0 ? Math.min(100, l.amenities.recreationAreaCount * 4) : undefined },
]

// ── Helpers (pure, exported for debounced parent use) ──────────────

function median(xs: number[]): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m]
}

function quantile(xs: number[], q: number): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const pos = (s.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return s[lo]
  return s[lo] + (s[hi] - s[lo]) * (pos - lo)
}

/** Rank-percentile median of the blended score (per spec §1: composites need ranks, not raw mean). */
function rankPercentileMedian(values: number[]): number {
  if (values.length === 0) return 0
  // ponytail: index-based percentile is fine for n < 200; spec's n>=5 floor means
  // we'll never see <5 here. If n grows past ~10k swap to numpy-style (k-0.5)/n.
  const s = [...values].sort((a, b) => a - b)
  const ranks = s.map((_, i) => ((i + 1) - 0.5) / s.length) // [0,1]
  // median is at rank 0.5 → interpolate onto the sorted values
  const target = 0.5
  for (let i = 0; i < ranks.length - 1; i++) {
    if (ranks[i] <= target && ranks[i + 1] >= target) {
      const span = ranks[i + 1] - ranks[i] || 1
      const t = (target - ranks[i]) / span
      return s[i] + (s[i + 1] - s[i]) * t
    }
  }
  return s[Math.floor(s.length / 2)]
}

function inBounds(loc: Location, b: MapBounds): boolean {
  return loc.lat >= b.south && loc.lat <= b.north && loc.lng >= b.west && loc.lng <= b.east
}

/**
 * Pure aggregator — exported so the parent can debounce computation
 * independently of re-render. Returns null stats when n < 5 so the
 * caller can render the muted zoom-out prompt.
 */
export function computeViewportStats(
  candidates: Location[],
  bounds: MapBounds | null,
): ViewportStats | null {
  if (!bounds) return null
  // ponytail: server returns Partial<Location>[] — incomplete records have no
  // .blended/.cost/etc and TypeError the whole tree. Guard once here so all
  // downstream reads (104, 108, 145-148) skip missing-data rows.
  const visible = candidates.filter(c => c?.blended && c?.cost && inBounds(c, bounds))
  const n = visible.length
  if (n < 5) {
    return { n, medianScore: 0, medianRent: 0, topSubscore: { key: '', label: '', value: 0 }, cheapest: null, highest: null, spark: { min: 0, p25: 0, median: 0, p75: 0, max: 0 } }
  }

  // Blended: rank-percentile median (composite → ranks survive pooling)
  const scores = visible.map(v => v.blended.totalScore0to100)
  const medianScore = rankPercentileMedian(scores)

  // Rent: raw median (right-skewed USD)
  const rents = visible.map(v => v.cost.medianRent)
  const medianRent = median(rents)

  // Top subscore: highest mean across visible metros
  let topKey = ''
  let topLabel = ''
  let topVal = -Infinity
  for (const s of SUBSCORES) {
    const vals: number[] = []
    for (const v of visible) {
      const x = s.extract(v)
      if (typeof x === 'number' && Number.isFinite(x)) vals.push(x)
    }
    if (vals.length === 0) continue
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length
    if (mean > topVal) {
      topVal = mean
      topKey = String(s.key)
      topLabel = s.label
    }
  }
  // Sparkline data on the winning subscore
  const topExtractor = SUBSCORES.find(s => s.key === topKey)?.extract
  const sparkVals = topExtractor
    ? visible.map(v => topExtractor(v)).filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
    : []
  const spark = {
    min: sparkVals.length ? Math.min(...sparkVals) : 0,
    p25: quantile(sparkVals, 0.25),
    median: median(sparkVals),
    p75: quantile(sparkVals, 0.75),
    max: sparkVals.length ? Math.max(...sparkVals) : 0,
  }

  // Cheapest (lowest medianRent) + highest score
  let cheapest: ViewportStats['cheapest'] = null
  let highest: ViewportStats['highest'] = null
  for (const v of visible) {
    const rent = v.cost.medianRent
    const score = v.blended.totalScore0to100
    if (!cheapest || rent < visible.find(x => x.id === cheapest!.id)!.cost.medianRent) {
      cheapest = { id: v.id, name: v.name, score }
    }
    if (!highest || score > highest.score) {
      highest = { id: v.id, name: v.name, score }
    }
  }

  return {
    n,
    medianScore,
    medianRent,
    topSubscore: { key: topKey, label: topLabel, value: topVal === -Infinity ? 0 : topVal },
    cheapest,
    highest,
    spark,
  }
}

// ── Sub-views ──────────────────────────────────────────────────────

function Sparkline({ spark }: { spark: ViewportStats['spark'] }) {
  // Hand-rolled SVG; 60x14 viewbox, 5-point path (min/p25/median/p75/max).
  // ponytail: no chart lib — ~20 lines of path math, fixed baseline.
  const W = 60
  const H = 14
  const allMin = spark.min
  const allMax = spark.max || spark.min + 1
  const y = (v: number) => H - ((v - allMin) / (allMax - allMin || 1)) * H
  const points: Array<[number, number]> = [
    [0, y(spark.min)],
    [W * 0.25, y(spark.p25)],
    [W * 0.5, y(spark.median)],
    [W * 0.75, y(spark.p75)],
    [W, y(spark.max)],
  ]
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const stroke = scoreToColor(spark.median)
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block" aria-hidden="true">
      <path d={d} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={W * 0.5} cy={y(spark.median)} r={1.5} fill={stroke} />
    </svg>
  )
}

// ── Component ──────────────────────────────────────────────────────

function ViewportStatPanelImpl({
  candidates,
  mapBounds,
  onSelect,
}: ViewportStatPanelProps): React.ReactElement {
  // ponytail: memo at the export; this fn runs only when props change.
  const stats = computeViewportStats(candidates, mapBounds)

  const muted = 'text-slate-500 dark:text-zinc-400'
  const valueCls = 'text-slate-900 dark:text-zinc-100'

  if (!stats || stats.n < 5) {
    return (
      <div
        className="absolute top-3 right-3 z-[400] bg-white/90 dark:bg-zinc-800/90 backdrop-blur rounded-xl shadow-lg p-3 w-[240px]"
        role="status"
        aria-live="polite"
      >
        <p className={`text-xs ${muted}`}>Zoom out for regional stats</p>
        {stats && <p className={`text-[10px] mt-1 ${muted}`}>{stats.n} of {candidates.length} metros visible</p>}
      </div>
    )
  }

  const barColor = scoreToColor(stats.medianScore)
  const scorePct = Math.max(0, Math.min(100, stats.medianScore))

  return (
    <div
      className="absolute top-3 right-3 z-[400] bg-white/90 dark:bg-zinc-800/90 backdrop-blur rounded-xl shadow-lg p-3 w-[240px] text-xs space-y-2"
      role="status"
      aria-live="polite"
    >
      {/* N metros */}
      <div className="flex items-baseline justify-between">
        <span className={`text-[11px] uppercase tracking-wide ${muted}`}>Visible</span>
        <span className={`text-lg font-bold tabular-nums ${valueCls}`}>{stats.n}</span>
      </div>

      {/* Median score + 60x6 bar */}
      <div>
        <div className="flex items-baseline justify-between">
          <span className={muted}>Median score</span>
          <span className={`tabular-nums font-medium ${valueCls}`}>{stats.medianScore.toFixed(1)}</span>
        </div>
        <div className="mt-1 h-[6px] w-[60px] rounded-sm bg-slate-200 dark:bg-zinc-700 overflow-hidden">
          <div className="h-full" style={{ width: `${scorePct}%`, background: barColor }} />
        </div>
      </div>

      {/* Median cost */}
      <div className="flex items-baseline justify-between">
        <span className={muted}>Median rent</span>
        <span className={`tabular-nums ${valueCls}`}>${stats.medianRent.toFixed(0)}</span>
      </div>

      {/* Top subscore + sparkline */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className={muted}>Top: {stats.topSubscore.label}</div>
          <div className={`tabular-nums ${valueCls}`}>{stats.topSubscore.value.toFixed(0)}/100</div>
        </div>
        <Sparkline spark={stats.spark} />
      </div>

      {/* Cheapest / highest — clickable */}
      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200 dark:border-zinc-700">
        <button
          type="button"
          disabled={!onSelect || !stats.cheapest}
          onClick={() => stats.cheapest && onSelect?.(stats.cheapest.id)}
          className="text-left min-w-0 disabled:cursor-default hover:bg-slate-100 dark:hover:bg-zinc-700/60 rounded px-1 py-0.5 transition-colors"
        >
          <div className={`text-[10px] uppercase ${muted}`}>Cheapest</div>
          <div className={`truncate ${valueCls}`}>{stats.cheapest?.name ?? '—'}</div>
          <div className={`tabular-nums text-[10px] ${muted}`}>${stats.cheapest ? visibleRentOf(candidates, stats.cheapest.id) : '—'}</div>
        </button>
        <button
          type="button"
          disabled={!onSelect || !stats.highest}
          onClick={() => stats.highest && onSelect?.(stats.highest.id)}
          className="text-left min-w-0 disabled:cursor-default hover:bg-slate-100 dark:hover:bg-zinc-700/60 rounded px-1 py-0.5 transition-colors"
        >
          <div className={`text-[10px] uppercase ${muted}`}>Top score</div>
          <div className={`truncate ${valueCls}`}>{stats.highest?.name ?? '—'}</div>
          <div className={`tabular-nums text-[10px] ${muted}`}>{stats.highest?.score.toFixed(0) ?? '—'}</div>
        </button>
      </div>
    </div>
  )
}

function visibleRentOf(candidates: Location[], id: string): string {
  const loc = candidates.find(c => c.id === id)
  return loc ? loc.cost.medianRent.toFixed(0) : '—'
}

const ViewportStatPanel = React.memo(ViewportStatPanelImpl)
export default ViewportStatPanel