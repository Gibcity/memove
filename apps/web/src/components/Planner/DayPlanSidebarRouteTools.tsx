// ponytail: extracted from DayPlanSidebar.tsx
import { Route as RouteIcon, RotateCcw, Car, Footprints } from 'lucide-react'
import { generateGoogleMapsUrl } from '../Map/RouteCalculator'
import type { Assignment } from '../../types'

interface DayPlanSidebarRouteToolsProps {
  isSelected: boolean
  isExpanded: boolean
  showRouteToolsWhenExpanded: boolean
  dayId: number
  dayAssignments: Assignment[]
  routeShown: boolean
  routeInfo: { distance: string; duration: string } | null
  routeProfile: 'driving' | 'walking'
  onToggleRoute?: () => void
  onSetRouteProfile?: (profile: 'driving' | 'walking') => void
  handleOptimize: (dayId: number) => void
  t: (key: string, params?: Record<string, any>) => string
}

export function DayPlanSidebarRouteTools({
  isSelected, isExpanded, showRouteToolsWhenExpanded, dayId, dayAssignments,
  routeShown, routeInfo, routeProfile, onToggleRoute, onSetRouteProfile, handleOptimize, t,
}: DayPlanSidebarRouteToolsProps) {
  if (dayAssignments.length < 2) return null
  if (!isSelected && !(showRouteToolsWhenExpanded && isExpanded)) return null

  return (
    <div style={{ padding: '10px 16px 12px', borderTop: '1px solid var(--border-faint)', display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
        <button
          onClick={() => onToggleRoute?.()}
          className={routeShown ? 'bg-accent text-accent-text' : 'bg-transparent text-content-secondary'}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            padding: '6px 0', fontSize: 11, fontWeight: 600, borderRadius: 8,
            border: routeShown ? 'none' : '1px solid var(--border-faint)',
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <RouteIcon size={12} strokeWidth={2} />
          {t('dayplan.route')}
        </button>
        {/* Open the day's stops as a route in Google Maps (planned order). #1255 */}
        <button
          onClick={() => {
            const url = generateGoogleMapsUrl(dayAssignments.map(a => a.place).filter(p => p?.lat != null && p?.lng != null) as { lat: number; lng: number }[])
            if (url) window.open(url, '_blank', 'noopener,noreferrer')
          }}
          aria-label={t('planner.openGoogleMaps')}
          title={t('planner.openGoogleMaps')}
          className="bg-transparent text-content-secondary"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-faint)',
            cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 48 48" fill="currentColor" aria-hidden="true">
            <path d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
            <path d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
            <path d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
            <path d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
          </svg>
        </button>
        <button onClick={() => handleOptimize(dayId)} className="bg-surface-hover text-content-secondary" style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          padding: '6px 0', fontSize: 11, fontWeight: 500, borderRadius: 8, border: 'none',
          cursor: 'pointer', fontFamily: 'inherit',
        }}>
          <RotateCcw size={12} strokeWidth={2} />
          {t('dayplan.optimize')}
        </button>
        <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-faint)', flexShrink: 0 }}>
          {(['driving', 'walking'] as const).map(p => {
            const ModeIcon = p === 'driving' ? Car : Footprints
            const active = routeProfile === p
            return (
              <button
                key={p}
                onClick={() => onSetRouteProfile?.(p)}
                aria-label={p === 'driving' ? 'Driving' : 'Walking'}
                className={active ? 'bg-accent text-accent-text' : 'bg-transparent text-content-secondary'}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '6px 10px', border: 'none', cursor: 'pointer',
                }}
              >
                <ModeIcon size={13} strokeWidth={2} />
              </button>
            )
          })}
        </div>
      </div>
      {isSelected && routeInfo && (
        <div className="text-content-secondary bg-surface-hover" style={{ display: 'flex', justifyContent: 'center', gap: 12, fontSize: 12, borderRadius: 8, padding: '5px 10px' }}>
          <span>{routeInfo.distance}</span>
          <span className="text-content-faint">·</span>
          <span>{routeInfo.duration}</span>
        </div>
      )}
    </div>
  )
}