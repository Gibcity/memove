// ponytail: extracted from DayPlanSidebar.tsx
import React from 'react'
import { Clock, GripVertical, Ticket, Route as RouteIcon } from 'lucide-react'
import { formatTime, splitReservationDateTime } from '../../utils/formatters'
import { TRANSPORT_TYPES, getDisplayTimeForDay, getSpanPhase } from '../../utils/dayMerge'
import { RouteConnector } from './DayPlanSidebarRouteConnector'
import { RES_ICONS } from './DayPlanSidebar.constants'
import type { Reservation, RouteSegment } from '../../types'

interface DayPlanSidebarTransportRowProps {
  res: Reservation
  dayId: number
  draggingId: any
  dropTargetRef: React.MutableRefObject<string | null>
  showDropLine: boolean
  showDropLineAfter: boolean
  routeLeg: RouteSegment | undefined
  routeProfile: 'driving' | 'walking'
  canEditDays: boolean
  spanLabel: string | null
  dragDataRef: React.MutableRefObject<{ placeId?: string; assignmentId?: string; noteId?: string; reservationId?: string; fromDayId?: string; phase?: 'single' | 'start' | 'middle' | 'end' } | null>
  reservations: Reservation[]
  tripId: number
  onAssignToDay?: ((placeId: number, dayId: number) => void) | undefined
  onEditTransport?: ((res: Reservation) => void) | undefined
  onEditReservation?: ((res: Reservation) => void) | undefined
  onToggleConnection?: ((reservationId: number) => void) | undefined
  visibleConnectionIds?: number[]
  computeMultiDayMove: (r: Reservation, targetDayId: number, phase: 'single' | 'start' | 'middle' | 'end') => any
  handleMergedDrop: (dayId: number, fromType: string, fromId: number, toType: string, toId: number, insertAfter?: boolean, toLegIndex?: number | null) => Promise<void>
  setDraggingId: (v: any) => void
  setDragOverDayId: (v: number | null) => void
  setDropTargetKey: (v: string | null) => void
  tripActions: { updateReservation: (tripId: number, id: number, data: any) => Promise<any>; moveAssignment: (...args: any[]) => Promise<any>; moveDayNote: (...args: any[]) => Promise<any> }
  toast: { error: (msg: string) => void }
  t: (key: string, params?: Record<string, any>) => string
  locale: string
  timeFormat: '12h' | '24h' | string
}

export function DayPlanSidebarTransportRow({
  res, dayId, draggingId, dropTargetRef, showDropLine, showDropLineAfter, routeLeg, routeProfile,
  canEditDays, spanLabel, dragDataRef, reservations, tripId,
  onAssignToDay, onEditTransport, onEditReservation, onToggleConnection, visibleConnectionIds,
  computeMultiDayMove, handleMergedDrop,
  setDraggingId, setDragOverDayId, setDropTargetKey, tripActions, toast, t, locale, timeFormat,
}: DayPlanSidebarTransportRowProps) {
  const spanPhase = getSpanPhase(res, dayId)
  // Car "active" (middle) days are shown in the day header, skip here
  if (res.type === 'car' && spanPhase === 'middle') return null

  const TransportIcon = RES_ICONS[res.type] || Ticket
  const color = '#3b82f6'
  const meta = typeof res.metadata === 'string' ? JSON.parse(res.metadata || '{}') : (res.metadata || {})

  // Subtitle aus Metadaten zusammensetzen
  let subtitle = ''
  if ((res as any).__leg) {
    // One leg of a multi-leg flight — show this segment's own route.
    const parts = [(res as any).__leg.airline, (res as any).__leg.flight_number].filter(Boolean)
    if ((res as any).__leg.from || (res as any).__leg.to)
      parts.push([(res as any).__leg.from, (res as any).__leg.to].filter(Boolean).join(' → '))
    subtitle = parts.join(' · ')
  } else if (res.type === 'flight') {
    const parts = [meta.airline, meta.flight_number].filter(Boolean)
    if (meta.departure_airport || meta.arrival_airport)
      parts.push([meta.departure_airport, meta.arrival_airport].filter(Boolean).join(' → '))
    subtitle = parts.join(' · ')
  } else if (res.type === 'train') {
    subtitle = [meta.train_number, meta.platform ? `Gl. ${meta.platform}` : '', meta.seat ? `Sitz ${meta.seat}` : ''].filter(Boolean).join(' · ')
  }

  // Multi-day span phase (single-leg / non-flight only — a multi-leg flight is shown as one row per leg).
  const displaySpanLabel = (res as any).__leg ? null : spanLabel
  const displayTime = getDisplayTimeForDay(res, dayId)
  const legKey = (res as any).__leg ? `leg${(res as any).__leg.index}` : 'x'
  const legSuffix = (res as any).__leg ? `-leg${(res as any).__leg.index}` : ''

  return (
    <React.Fragment key={`transport-${res.id}-${legKey}-${dayId}`}>
      <div
        onClick={() => {
          if (!canEditDays) return
          const target = reservations.find(x => x.id === res.id) ?? res
          if (TRANSPORT_TYPES.has(res.type)) onEditTransport?.(target)
          else onEditReservation?.(target)
        }}
        onDragOver={e => {
          e.preventDefault(); e.stopPropagation()
          const rect = e.currentTarget.getBoundingClientRect()
          const inBottom = e.clientY > rect.top + rect.height / 2
          const ls = legSuffix
          const key = inBottom ? `transport-after-${res.id}${ls}-${dayId}` : `transport-${res.id}${ls}-${dayId}`
          if (dropTargetRef.current !== key) setDropTargetKey(key)
        }}
        draggable={canEditDays && spanPhase !== 'middle' && !(res as any).__leg}
        onDragStart={e => {
          if (!canEditDays || spanPhase === 'middle' || (res as any).__leg) { e.preventDefault(); return }
          e.dataTransfer.setData('reservationId', String(res.id))
          e.dataTransfer.setData('fromDayId', String(dayId))
          e.dataTransfer.effectAllowed = 'move'
          dragDataRef.current = { reservationId: String(res.id), fromDayId: String(dayId), phase: spanPhase }
          setDraggingId(res.id)
        }}
        onDragEnd={() => { setDraggingId(null); setDragOverDayId(null); setDropTargetKey(null); dragDataRef.current = null }}
        onDrop={e => {
          e.preventDefault(); e.stopPropagation()
          const rect = e.currentTarget.getBoundingClientRect()
          const insertAfter = e.clientY > rect.top + rect.height / 2
          const dragInfo = readDragData(dragDataRef, e)
          const { placeId, assignmentId: fromAssignmentId, noteId, reservationId: fromReservationId, fromDayId, phase } = dragInfo
          if (placeId) {
            onAssignToDay?.(parseInt(placeId), dayId)
          } else if (fromReservationId && fromDayId !== dayId) {
            const r2 = reservations.find(x => x.id === Number(fromReservationId))
            if (r2) { const update = computeMultiDayMove(r2, dayId, phase); tripActions.updateReservation(tripId, r2.id, update).catch((err: unknown) => toast.error(err instanceof Error ? err.message : t('common.unknownError'))) }
          } else if (fromReservationId) {
            handleMergedDrop(dayId, 'transport', Number(fromReservationId), 'transport', res.id, insertAfter, (res as any).__leg?.index ?? null)
          } else if (fromAssignmentId && fromDayId !== dayId) {
            tripActions.moveAssignment(tripId, Number(fromAssignmentId), fromDayId, dayId).catch((err: unknown) => toast.error(err instanceof Error ? err.message : t('common.unknownError')))
          } else if (fromAssignmentId) {
            handleMergedDrop(dayId, 'place', Number(fromAssignmentId), 'transport', res.id, insertAfter, (res as any).__leg?.index ?? null)
          } else if (noteId && fromDayId !== dayId) {
            tripActions.moveDayNote(tripId, fromDayId, dayId, Number(noteId)).catch((err: unknown) => toast.error(err instanceof Error ? err.message : t('common.unknownError')))
          } else if (noteId) {
            handleMergedDrop(dayId, 'note', Number(noteId), 'transport', res.id, insertAfter, (res as any).__leg?.index ?? null)
          }
          setDraggingId(null); setDropTargetKey(null); dragDataRef.current = null; window.__dragData = null
        }}
        onMouseEnter={e => { e.currentTarget.style.background = `${color}12` }}
        onMouseLeave={e => { e.currentTarget.style.background = `${color}08` }}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 8px 7px 10px',
          margin: '1px 8px',
          borderRadius: 6,
          border: `1px solid ${color}33`,
          borderTop: showDropLine ? '2px solid var(--text-primary)' : undefined,
          borderBottom: showDropLineAfter ? '2px solid var(--text-primary)' : undefined,
          background: `${color}08`,
          cursor: canEditDays && onEditTransport ? 'pointer' : 'default', userSelect: 'none',
          transition: 'background 0.1s',
          opacity: draggingId === res.id ? 0.4 : spanPhase === 'middle' ? 0.65 : 1,
        }}
      >
        {canEditDays && spanPhase !== 'middle' && !(res as any).__leg && (
          <div className="dp-grip" style={{ flexShrink: 0, color: 'var(--text-faint)', display: 'flex', alignItems: 'center', opacity: 0.3, transition: 'opacity 0.15s', cursor: 'grab' }}>
            <GripVertical size={13} strokeWidth={1.8} />
          </div>
        )}
        <div style={{
          width: 28, height: 28, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: '50%', background: `${color}18`,
        }}>
          <TransportIcon size={14} strokeWidth={1.8} color={color} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {displaySpanLabel && (
              <span style={{
                fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, flexShrink: 0,
                background: `${color}20`, color: color, textTransform: 'uppercase', letterSpacing: '0.03em',
              }}>
                {displaySpanLabel}
              </span>
            )}
            <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {res.title}
            </span>
            {(() => {
              const { time: dispTime } = splitReservationDateTime(displayTime)
              const { time: endTime } = splitReservationDateTime(res.reservation_end_time)
              if (!dispTime && !endTime) return null
              return (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0, fontSize: 10, color: 'var(--text-faint)', fontWeight: 400, marginLeft: 6 }}>
                  <Clock size={9} strokeWidth={2} />
                  {dispTime ? formatTime(dispTime, locale, timeFormat) : ''}
                  {spanPhase === 'single' && endTime ? ` – ${formatTime(endTime, locale, timeFormat)}` : ''}
                  {meta.departure_timezone && spanPhase === 'start' && ` ${meta.departure_timezone}`}
                  {meta.arrival_timezone && spanPhase === 'end' && ` ${meta.arrival_timezone}`}
                </span>
              )
            })()}
          </div>
          {subtitle && (
            <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {subtitle}
            </div>
          )}
        </div>
        {onToggleConnection && (!(res as any).__leg || (res as any).__leg.index === 0) && (res.endpoints || []).length >= 2 && (() => {
          const active = (visibleConnectionIds || []).includes(res.id)
          return (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onToggleConnection(res.id) }}
              title={t(active ? 'map.hideConnections' : 'map.showConnections')}
              style={{
                flexShrink: 0, appearance: 'none',
                width: 26, height: 26, borderRadius: 6,
                display: 'grid', placeItems: 'center', cursor: 'pointer',
                border: 'none',
                background: active ? color : 'transparent',
                color: active ? '#fff' : 'var(--text-faint)',
                transition: 'color 120ms cubic-bezier(0.23,1,0.32,1), background 120ms cubic-bezier(0.23,1,0.32,1)',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--text-primary)' }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--text-faint)' }}
            >
              <RouteIcon size={13} />
            </button>
          )
        })()}
      </div>
      {routeLeg && <RouteConnector seg={routeLeg} profile={routeProfile} />}
    </React.Fragment>
  )
}

// ponytail: same drag-data reader as the PlaceRow helper; duplicated locally so each row stays self-contained.
function readDragData(
  dragDataRef: React.MutableRefObject<{ placeId?: string; assignmentId?: string; noteId?: string; reservationId?: string; fromDayId?: string; phase?: 'single' | 'start' | 'middle' | 'end' } | null>,
  e: React.DragEvent,
) {
  const dt = e?.dataTransfer
  if (dragDataRef.current) {
    return {
      placeId: '',
      assignmentId: dragDataRef.current.assignmentId || '',
      noteId: dragDataRef.current.noteId || '',
      reservationId: dragDataRef.current.reservationId || '',
      fromDayId: parseInt(dragDataRef.current.fromDayId || '') || 0,
      phase: (dragDataRef.current.phase || 'single') as 'single' | 'start' | 'middle' | 'end',
    }
  }
  const ext = (typeof window !== 'undefined' ? (window as any).__dragData : null) || {}
  const placeId = dt?.getData('placeId') || ext.placeId || ''
  return { placeId, assignmentId: '', noteId: '', reservationId: '', fromDayId: 0, phase: 'single' as const }
}