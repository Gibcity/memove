// ponytail: shared micro-components extracted to one place because every
// view file uses them. <20 lines per piece — short enough to inline, but
// reused 5+ times across the renderer. Keep this file boring.
import { useState } from 'react'
import { Link2, Printer } from 'lucide-react'

// ponytail: native platform features only — navigator.clipboard + window.print.
// Hidden in print output (see apps/web/src/styles/print.css) so users get
// just the view content on paper. Share menu / email / server-side PDF
// deferred — explicit BACKLOG scope.
export function ViewActions() {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* ponytail: clipboard denied (insecure context, perms off) — silent */ }
  }
  return (
    <div className="view-actions flex items-center justify-end gap-2 mb-2 print:hidden">
      <button type="button" onClick={copy}
        className="px-2 py-1 rounded-lg text-[11px] text-content-muted hover:text-content border border-edge hover:bg-surface-secondary transition-colors flex items-center gap-1">
        <Link2 size={12} />{copied ? 'Copied' : 'Copy link'}
      </button>
      <button type="button" onClick={() => window.print()}
        className="px-2 py-1 rounded-lg text-[11px] text-content-muted hover:text-content border border-edge hover:bg-surface-secondary transition-colors flex items-center gap-1">
        <Printer size={12} />Print / PDF
      </button>
    </div>
  )
}

// Small horizontal progress bar — same shape in all five view components.
// ponytail: width transition is via inline style on the inner div because
// Tailwind's arbitrary `[width:N%]` would re-mount the element on prop
// change and skip the animation.
export function ScoreBar({ value, label }: { value: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div className="flex items-center gap-3">
      {label && (
        <span className="text-xs text-content-muted w-28 shrink-0 truncate">{label}</span>
      )}
      <div className="flex-1 h-2 rounded-full bg-edge overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-medium tabular-nums text-content w-10 text-right">{Math.round(pct)}</span>
    </div>
  )
}

// Standard card chrome.
export function ViewCard({
  title,
  children,
  className = '',
}: {
  title?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`rounded-xl border border-edge bg-surface-card p-4 gap-3 ${className}`}>
      {title && (
        <h3 className="text-lg font-semibold text-content mb-3" style={{ fontFamily: 'Poppins, system-ui' }}>
          {title}
        </h3>
      )}
      {children}
    </div>
  )
}

// ponytail: tiny color helper — green/yellow/red thresholds for the spec's
// health-score range. Pure numbers, no theme tokens (semantic, not chrome).
export function scoreToneClasses(score: number): string {
  if (score >= 70) return 'bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/30'
  if (score >= 40) return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
  return 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30'
}

// ponytail: 0-100 score → raw hex ramp. The sister helper above returns
// tailwind class names; this one returns hex so SVG fills, ARGB-style
// alpha blends (e.g. `${color}15`), and inline styles work. Single source
// of truth for the spec's score bands (docs/design/relocation-map-viz.md §1).
const SCORE_HEX_BANDS: ReadonlyArray<{ readonly min: number; readonly hex: string }> = [
  { min: 80, hex: '#22c55e' }, // excellent
  { min: 60, hex: '#84cc16' }, // strong
  { min: 40, hex: '#eab308' }, // mixed
  { min: 20, hex: '#d97706' }, // weak
  { min: 0, hex: '#b91c1c' }, // poor
] as const

export function scoreHex(score: number): string {
  for (const band of SCORE_HEX_BANDS) {
    if (score >= band.min) return band.hex
  }
  return SCORE_HEX_BANDS[SCORE_HEX_BANDS.length - 1].hex
}
