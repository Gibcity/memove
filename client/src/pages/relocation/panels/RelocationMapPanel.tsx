import { useTranslation } from '../../../i18n'
import type { CSSProperties, ReactElement } from 'react'
import type { CandidateView } from '../relocationModel'
import { scoreToColor } from '../relocationModel'

/**
 * Center panel — US map of candidate cities as score-colored pins.
 *
 * ponytail: deliberately not Mapbox/Leaflet. The trip planner's MapViewGL is
 * trip-scoped (photos, routes, reservations) and needs a mapbox token in
 * settings. For a static set of N metros we just project lat/lng onto a
 * fixed continental-US frame and absolutely-position colored dots. The
 * click-to-select contract still holds; everything else is decoration.
 * Upgrade path: swap the dot layer for react-leaflet + OSM tiles once a
 * real "explore the map" UX is requested.
 */

// Continental US bounding box (covers 48 contiguous states + DC).
const US_BBOX = { south: 24.5, north: 49.5, west: -125, east: -66.5 }

function projectToPercent(lat: number, lng: number): { x: number; y: number } {
  const x = ((lng - US_BBOX.west) / (US_BBOX.east - US_BBOX.west)) * 100
  // Latitude grows northward, screen y grows downward — flip.
  const y = ((US_BBOX.north - lat) / (US_BBOX.north - US_BBOX.south)) * 100
  return { x, y }
}

// Lazy color bar for the legend. Same breakpoints as scoreToColor so the
// swatches line up visually with the pins.
const LEGEND_STOPS: Array<{ score: number; color: string; label: string }> = [
  { score: 10, color: scoreToColor(10), label: '0–20' },
  { score: 30, color: scoreToColor(30), label: '20–40' },
  { score: 50, color: scoreToColor(50), label: '40–60' },
  { score: 70, color: scoreToColor(70), label: '60–80' },
  { score: 90, color: scoreToColor(90), label: '80–100' },
]

interface Props {
  candidates: CandidateView[]
  selectedId: string | null
  onMarkerClick: (id: string) => void
}

export default function RelocationMapPanel({
  candidates,
  selectedId,
  onMarkerClick,
}: Props): ReactElement {
  const { t } = useTranslation()
  return (
    <div className="relative w-full h-full bg-slate-50 dark:bg-zinc-900 overflow-hidden">
      {/* Map surface — fixed aspect frame with state outline silhouette */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(to bottom right, rgb(248 250 252), rgb(241 245 249))',
        }}
        aria-label="US map"
        role="img"
      >
        {/* Faint graticule so the empty space isn't a void */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.08] dark:opacity-[0.05]"
          style={{
            backgroundImage:
              'linear-gradient(to right, currentColor 1px, transparent 1px),' +
              'linear-gradient(to bottom, currentColor 1px, transparent 1px)',
            backgroundSize: '10% 10%',
            color: '#64748b',
          }}
        />

        {/* US silhouette — bundled inline so we don't add a network asset.
            Rough outline of the lower 48; accurate enough as a backdrop for
            pin positioning. */}
        <svg
          viewBox="0 0 959 593"
          className="absolute inset-0 w-full h-full p-6"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden
        >
          <path
            d="M158.1 145.3l-1.6-7.6-2.7-12.1-2.2-9.2-1.6-7.4 1.6-4.1 1.3-3.2 2.6-3.1 4.2-2.4 9.1-1 17.7-1.5 13.4-1.2 16.3-.9 14.3-.7 13.5-.4 14.1.2 13.2.4 9.7.6 4.8 1.1 3.8.9 1.5-.3 1.1-.4 1.4-.2.7.2.6.4.6.6.4.7.3 1.3.1 2-.1 2.4-.3 1.8-.4 1.4-.5 1.6-.3 2.7.2 3.7.5 4.4.7 4.4.9 4.1 1.5 4.5 2.1 5.1 3 6.7 4.1 7.6 5.6 8.7 7.4 9.2 9.8 9.9 11.4 9.7 12.5 8.8 14.3 6.5 15.4 4.1 16.6 1.7 17.2-.6 16.3-2.8 14.5-4.7 13.8-6.3 13.3-7.5 13.2-8.5 13.4-9.1 13.8-9.4 14.7-9 15.6-8.1 16.4-6.6 17.2-4.6 17.9-2.3 18.6.2 19.2 2.7 19.7 5.1 20.1 7.5 20.4 9.7 20.6 11.7 20.7 13.5 20.7 15 20.6 16.3 20.4 17.3 20.1 18.1 19.7 18.6 19.3 18.9 18.8 19 18.3 18.8 17.7 18.4 17.1 17.8 16.4 17.1 15.7 16.2 14.9 15.2 14 13.9 13.1 12.7 11.9 11.2 11 10.4 9.7 9.5 9 8.2 8.1 6.9 6.8 5.5 5.4 4 3.9 2.4 2.3.7.6-.8-.8L808 449.4l-7-3.2-6.6-2.2-6.2-1.2-5.8-.4-5.4.5-5 1.5-4.6 2.6-4.2 3.7-3.8 4.7-3.4 5.7-3 6.5-2.5 7.1-1.9 7.5-1.3 7.6-1 7.1-.7 6.5-.5 5.7-.5 4.7-.7 3.7-.9 2.5-1.1 1.6-1.3.7-1.5.1-1.6-.6-1.7-1.3-1.7-2-1.8-2.6-1.9-3.2-2-3.7-2.1-4.1-2.2-4.4-2.3-4.5-2.4-4.5-2.5-4.3-2.6-4-2.7-3.6-2.8-3-3-2.4-3.2-1.6-3.4-.8-3.6-.1-3.6.6-3.6 1.2-3.5 1.7-3.3 2.1-3 2.4-2.6 2.5-2.1 2.4-1.5 2.1-.8 1.7-.1 1.2.4 1 .8.9 1.1 1 1.2 1.2 1.4 1.5 1.4 1.7 1.4 1.9 1.3 2 .8 2.2.4 2.2-.1 2.2-.6 2.1-1 1.9-1.4 1.6-1.7 1.3-1.8.9-1.9.4-1.8-.1-1.7-.7-1.4-1.3-1.1-1.7-.7-2.1-.2-2.3.3-2.4.8-2.5 1.2-2.4 1.6-2.3 1.9-2.2 2-1.9 2.1-1.6 2.1-1.3 2-.9 1.8-.5 1.5v1.2l.3 1 .6.8.7.5.7.2.6-.1.5-.3.4-.5.2-.6.1-.6-.1-.6-.3-.5-.4-.4-.5-.2-.5-.1h-.5z"
            className="fill-slate-200 dark:fill-zinc-800 stroke-slate-300 dark:stroke-zinc-700"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </svg>

        {/* Pins */}
        {candidates.map(c => {
          const { x, y } = projectToPercent(c.location.lat, c.location.lng)
          const isSelected = c.location.id === selectedId
          const size = isSelected ? 18 : 12
          const style: CSSProperties = {
            left: `${x}%`,
            top: `${y}%`,
            width: size,
            height: size,
            background: scoreToColor(c.score),
            transform: 'translate(-50%, -50%)',
          }
          return (
            <button
              key={c.location.id}
              type="button"
              onClick={() => onMarkerClick(c.location.id)}
              title={`${c.location.name} — score ${c.score}`}
              aria-label={`${c.location.name}, score ${c.score}`}
              aria-pressed={isSelected}
              className={`absolute rounded-full border-2 border-white dark:border-zinc-900 shadow-md cursor-pointer
                          hover:scale-125 transition-transform focus:outline-none focus:ring-2 focus:ring-blue-400
                          ${isSelected ? 'ring-4 ring-blue-400/60 z-10' : ''}`}
              style={style}
            />
          )
        })}
      </div>

      {/* Legend overlay — top center */}
      <div
        className="absolute top-3 left-1/2 -translate-x-1/2 bg-white/90 dark:bg-zinc-800/90
                   backdrop-blur rounded-full px-3 py-1.5 shadow border border-slate-200 dark:border-zinc-700
                   flex items-center gap-2 text-xs text-slate-700 dark:text-zinc-200"
      >
        <span className="font-medium">{t('relocation.scoreLegend')}</span>
        <div className="flex items-center gap-1">
          {LEGEND_STOPS.map(s => (
            <span
              key={s.score}
              className="w-4 h-2.5 rounded-sm"
              style={{ background: s.color }}
              aria-hidden
            />
          ))}
        </div>
        <span className="text-slate-500 dark:text-zinc-400">0–100</span>
      </div>

      {/* Counter overlay — top right */}
      <div
        className="absolute top-3 right-3 bg-white/90 dark:bg-zinc-800/90
                   backdrop-blur rounded-full px-3 py-1.5 shadow border border-slate-200 dark:border-zinc-700
                   text-xs font-medium text-slate-700 dark:text-zinc-200"
      >
        {candidates.length === 1
          ? t('relocation.showingMetro', { count: 1 })
          : t('relocation.showingMetros', { count: candidates.length })}
      </div>
    </div>
  )
}