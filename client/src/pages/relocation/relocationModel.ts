/**
 * Relocation dashboard data model — pure types and helpers shared by the
 * data hooks and the presentational components in RelocationDashboardPage.
 * Kept free of React/IO so both sides can import it without cycles.
 *
 * Part of the FE "page = wiring container + data hook" convention
 * (see pages/PATTERN.md).
 */

import type { Location, HardFilter } from '@memove/shared'
import type { ScoreExplanation } from '../../api/relocation'

// ── UI view models (enriched for rendering) ─────────────────────────

/** A relocation candidate as shown in the comparison table / map. */
export interface CandidateView {
  location: Location
  score: number
  rank: number
  decisionTrace: string
}

/** Elicitation flow state */
export interface ElicitationState {
  sessionId: string | null
  currentQuestion: {
    id: string
    prompt: string
    options?: { value: string; label: string }[]
    skippable: boolean
  } | null
  roundsCompleted: number
  status: 'idle' | 'active' | 'complete' | 'abandoned'
}

/** A single filter slider's config (cost, climate, crime, etc.). */
export interface FilterSlider {
  id: string
  label: string
  field: string // dot-path e.g. 'cost.medianHomeValue'
  min: number
  max: number
  step: number
  value: [number, number]
  enabled: boolean
}

/** Candidate detail drawer state */
export interface CandidateDetail {
  candidate: CandidateView | null
  explanation: ScoreExplanation | null
  isOpen: boolean
}

/** Hard-filter promotion prompt */
export interface HardFilterPrompt {
  field: string
  label: string
  dismissCount: number
  threshold: number
  suggestedFilter: HardFilter
}

// ── Pure helpers ────────────────────────────────────────────────────

/** Format a dollar amount compactly. */
export function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
  return `$${value.toFixed(0)}`
}

/** Normalize a value 0-100 to a CSS hue (red→yellow→green). */
export function scoreToColor(score: number): string {
  if (score >= 80) return 'oklch(0.6 0.2 142)' // green
  if (score >= 60) return 'oklch(0.7 0.18 85)' // yellow-green
  if (score >= 40) return 'oklch(0.7 0.15 65)' // yellow
  if (score >= 20) return 'oklch(0.6 0.2 35)' // orange
  return 'oklch(0.5 0.25 15)' // red
}

// ponytail: spec §1 hex ramp (docs/design/relocation-map-viz.md). One source of
// truth for SVG fills + small inline backgrounds. Kept separate from
// scoreToColor above because that one returns oklch() for CSS-var aware UIs
// (sparkline strokes, panel backgrounds); hex is needed wherever SVG or
// ARGB-style alpha blending wants raw RGB. If you change a band, update §1.
export const SCORE_HEX_BANDS: ReadonlyArray<{ readonly min: number; readonly hex: string }> = [
  { min: 80, hex: '#22c55e' }, // excellent
  { min: 60, hex: '#84cc16' }, // strong
  { min: 40, hex: '#eab308' }, // mixed
  { min: 20, hex: '#d97706' }, // weak
  { min: 0, hex: '#b91c1c' }, // poor
] as const

/** Map a 0-100 score to the spec hex band. Clamps to best/worst at the edges. */
export function scoreHex(score: number): string {
  for (const band of SCORE_HEX_BANDS) {
    if (score >= band.min) return band.hex
  }
  return SCORE_HEX_BANDS[SCORE_HEX_BANDS.length - 1].hex
}

/** Build a sort key from the candidates array. */
export function sortCandidatesByRank(
  candidates: CandidateView[],
): CandidateView[] {
  return [...candidates].sort((a, b) => a.rank - b.rank)
}

/** Default filter sliders for the sidebar. */
export const DEFAULT_FILTER_SLIDERS: FilterSlider[] = [
  {
    id: 'cost',
    label: 'Cost of Living',
    field: 'cost.costOfLivingIndex',
    min: 70,
    max: 180,
    step: 1,
    value: [70, 180],
    enabled: true,
  },
  {
    id: 'climate',
    label: 'Hot Days (≥90°F)',
    field: 'climate.daysMaxGt90FAnnual',
    min: 0,
    max: 180,
    step: 5,
    value: [0, 180],
    enabled: true,
  },
  {
    id: 'crime',
    label: 'Violent Crime Rate',
    field: 'crime.violentCrimeRatePer100k',
    min: 0,
    max: 1500,
    step: 10,
    value: [0, 1500],
    enabled: true,
  },
  {
    id: 'broadband',
    label: 'Broadband (≥100Mbps %)',
    field: 'broadband.pctHouseholdsWith100MbpsPlus',
    min: 0,
    max: 100,
    step: 5,
    value: [0, 100],
    enabled: true,
  },
  {
    id: 'healthcare',
    label: 'Healthcare Access',
    field: 'healthcare.healthcareAccessScore',
    min: 0,
    max: 100,
    step: 5,
    value: [0, 100],
    enabled: false,
  },
]
