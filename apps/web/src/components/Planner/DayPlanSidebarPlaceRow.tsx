// ponytail: extracted from DayPlanSidebar.tsx
import React, { useRef } from 'react'
import { ChevronUp, ChevronDown, Navigation, ExternalLink, Clock, Pencil, GripVertical, Ticket, Plus, Trash2, Lock, Route as RouteIcon } from 'lucide-react'
import PlaceAvatar from '../shared/PlaceAvatar'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { getCategoryIcon } from '../shared/categoryIcons'
import { useContextMenu } from '../shared/ContextMenu'
import type { MenuItem } from '../shared/ContextMenu'
import { formatTime, splitReservationDateTime } from '../../utils/formatters'
import { parseTimeToMinutes } from '../../utils/dayMerge'
import { TRANSPORT_TYPES } from '../../utils/dayMerge'
import { RouteConnector } from './DayPlanSidebarRouteConnector'
import { RES_ICONS } from './DayPlanSidebar.constants'
import type { Assignment, Category, MergedItem, Reservation, RouteSegment } from '../../types'

interface DayPlanSidebarPlaceRowProps {
  assignment: Assignment
  dayId: number
  idx: number
  mergedLength: number
  categories: Category[]
  reservations: Reservation[]
  tripId: number
  routeProfile: 'driving' | 'walking'
  selectedAssignmentId: number | null
  selectedPlaceId: number | null
  draggingId: any
  lockedIds: Set<number>
  lockHoverId: number | null
  hoveredAssignmentId: number | null
  dropTargetKey: string | null
  showDropLine: boolean
  routeLeg: RouteSegment | undefined
  canEditDays: boolean
  isDraggingThis: boolean
  placeItems: MergedItem[]
  // Drag data ref is mutated by parent; passed in so multiple children can coordinate.
  dragDataRef: React.MutableRefObject<{ placeId?: string; assignmentId?: string; noteId?: string; reservationId?: string; fromDayId?: string; phase?: 'single' | 'start' | 'middle' | 'end' } | null>
  // Auto-scroll lock: parent tracks last scrolled id; the row exposes its element to the parent for measurement.
  registerAutoScrollRef: (assignmentId: number, el: HTMLDivElement | null, isSelected: boolean) => void
  // Parent callbacks for drag/drop, reorder, edit, delete, click, context menu, lock, optimize, etc.
  getDayAssignments: (dayId: number) => Assignment[]
  getMergedItems: (dayId: number) => any[]
  onPlaceClick: (placeId: number | null, assignmentId?: number | null) => void
  onSelectDay: (dayId: number, skipFit?: boolean) => void
  onAssignToDay?: ((placeId: number, dayId: number, position?: number) => void) | undefined
  onRemoveAssignment?: ((dayId: number, assignmentId: number) => void) | undefined
  onEditPlace?: ((place: any, assignmentId?: number) => void) | undefined
  onDeletePlace?: ((placeId: number) => void) | undefined
  onEditTransport?: ((res: Reservation) => void) | undefined
  onEditReservation?: ((res: Reservation) => void) | undefined
  onAddBookingToAssignment?: ((dayId: number, assignmentId: number) => void) | undefined
  onToggleConnection?: ((reservationId: number) => void) | undefined
  visibleConnectionIds?: number[]
  setDraggingId: (v: any) => void
  setDragOverDayId: (v: number | null) => void
  setDropTargetKey: (v: string | null) => void
  setHoveredAssignmentId: (v: number | null) => void
  setLockHoverId: (v: number | null) => void
  computeMultiDayMove: (r: Reservation, targetDayId: number, phase: 'single' | 'start' | 'middle' | 'end') => any
  handleMergedDrop: (dayId: number, fromType: string, fromId: number, toType: string, toId: number, insertAfter?: boolean, toLegIndex?: number | null) => Promise<void>
  applyMergedOrder: (dayId: number, newOrder: { type: string; data: any }[]) => Promise<void>
  setTimeConfirm: (v: any) => void
  toggleLock: (assignmentId: number) => void
  moveUp: (e: React.MouseEvent) => void
  moveDown: (e: React.MouseEvent) => void
  tripActions: { updateReservation: (tripId: number, id: number, data: any) => Promise<any>; moveAssignment: (...args: any[]) => Promise<any>; moveDayNote: (...args: any[]) => Promise<any> }
  toast: { error: (msg: string) => void }
  t: (key: string, params?: Record<string, any>) => string
  locale: string
  timeFormat: '12h' | '24h' | string
  ctxMenu: ReturnType<typeof useContextMenu>
}

export function DayPlanSidebarPlaceRow({
  assignment, dayId, idx, mergedLength, categories, reservations, tripId, routeProfile,
  selectedAssignmentId, selectedPlaceId, draggingId, lockedIds, lockHoverId, hoveredAssignmentId,
  dropTargetKey, showDropLine, routeLeg, canEditDays, isDraggingThis, placeItems,
  dragDataRef, registerAutoScrollRef, getDayAssignments, getMergedItems,
  onPlaceClick, onSelectDay, onAssignToDay, onRemoveAssignment, onEditPlace, onDeletePlace,
  onEditTransport, onEditReservation, onAddBookingToAssignment,
  onToggleConnection, visibleConnectionIds,
  setDraggingId, setDragOverDayId, setDropTargetKey, setHoveredAssignmentId, setLockHoverId,
  computeMultiDayMove, handleMergedDrop, applyMergedOrder, setTimeConfirm, toggleLock,
  moveUp, moveDown, tripActions, toast, t, locale, timeFormat, ctxMenu,
}: DayPlanSidebarPlaceRowProps) {
  const place = assignment.place
  if (!place) return null
  const cat = categories.find(c => c.id === place.category_id)
  const isPlaceSelected = selectedAssignmentId ? assignment.id === selectedAssignmentId : place.id === selectedPlaceId
  const placeIdx = placeItems.findIndex(i => i.data.id === assignment.id)

  return (
    <React.Fragment key={`place-${assignment.id}`}>
      <div
        draggable={canEditDays}
        onDragStart={e => {
          if (!canEditDays) { e.preventDefault(); return }
          e.dataTransfer.setData('assignmentId', String(assignment.id))
          e.dataTransfer.setData('fromDayId', String(dayId))
          e.dataTransfer.effectAllowed = 'move'
          dragDataRef.current = { assignmentId: String(assignment.id), fromDayId: String(dayId) }
          setDraggingId(assignment.id)
        }}
        onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOverDayId(null); if (dropTargetKey !== `place-${assignment.id}`) setDropTargetKey(`place-${assignment.id}`) }}
        onDrop={e => {
          e.preventDefault(); e.stopPropagation()
          const { placeId, assignmentId: fromAssignmentId, noteId, reservationId: fromReservationId, fromDayId, phase } = getDragDataFor(dragDataRef, e)
          if (placeId) {
            const pos = placeItems.findIndex(i => i.data.id === assignment.id)
            onAssignToDay?.(parseInt(placeId), dayId, pos >= 0 ? pos : undefined)
            setDropTargetKey(null); window.__dragData = null
          } else if (fromReservationId && fromDayId !== dayId) {
            const r = reservations.find(x => x.id === Number(fromReservationId))
            if (r) { const update = computeMultiDayMove(r, dayId, phase); tripActions.updateReservation(tripId, r.id, update).catch((err: unknown) => toast.error(err instanceof Error ? err.message : t('common.unknownError'))) }
            setDraggingId(null); setDropTargetKey(null); dragDataRef.current = null
          } else if (fromReservationId) {
            handleMergedDrop(dayId, 'transport', Number(fromReservationId), 'place', assignment.id)
          } else if (fromAssignmentId && fromDayId !== dayId) {
            const toIdx = getDayAssignments(dayId).findIndex(a => a.id === assignment.id)
            tripActions.moveAssignment(tripId, Number(fromAssignmentId), fromDayId, dayId, toIdx).catch((err: unknown) => toast.error(err instanceof Error ? err.message : t('common.unknownError')))
            setDraggingId(null); setDropTargetKey(null); dragDataRef.current = null
          } else if (fromAssignmentId) {
            handleMergedDrop(dayId, 'place', Number(fromAssignmentId), 'place', assignment.id)
          } else if (noteId && fromDayId !== dayId) {
            const tm = getMergedItems(dayId)
            const toIdx = tm.findIndex(i => i.type === 'place' && i.data.id === assignment.id)
            const so = toIdx <= 0 ? (tm[0]?.sortKey ?? 0) - 1 : (tm[toIdx - 1].sortKey + tm[toIdx].sortKey) / 2
            tripActions.moveDayNote(tripId, fromDayId, dayId, Number(noteId), so).catch((err: unknown) => toast.error(err instanceof Error ? err.message : t('common.unknownError')))
            setDraggingId(null); setDropTargetKey(null); dragDataRef.current = null
          } else if (noteId) {
            handleMergedDrop(dayId, 'note', Number(noteId), 'place', assignment.id)
          }
        }}
        ref={el => registerAutoScrollRef(assignment.id, el, isPlaceSelected)}
        onDragEnd={() => { setDraggingId(null); setDragOverDayId(null); setDropTargetKey(null); dragDataRef.current = null }}
        onClick={() => { onPlaceClick(isPlaceSelected ? null : place.id, isPlaceSelected ? null : assignment.id); if (!isPlaceSelected) onSelectDay(dayId, true) }}
        onContextMenu={e => {
          const items: MenuItem[] = []
          if (canEditDays && onEditPlace) items.push({ label: t('common.edit'), icon: Pencil, onClick: () => onEditPlace(place, assignment.id) })
          if (canEditDays && onRemoveAssignment) items.push({ label: t('planner.removeFromDay'), icon: Trash2, onClick: () => onRemoveAssignment(dayId, assignment.id) })
          if (place.website) items.push({ label: t('inspector.website'), icon: ExternalLink, onClick: () => window.open(place.website ?? '', '_blank') })
          if (place.lat && place.lng) items.push({ label: 'Google Maps', icon: Navigation, onClick: () => window.open(`https://www.google.com/maps/search/?api=1&query=${place.google_place_id ? encodeURIComponent(place.name) + '&query_place_id=' + place.google_place_id : place.lat + ',' + place.lng}`, '_blank') })
          items.push({ divider: true })
          if (canEditDays && onDeletePlace) items.push({ label: t('common.delete'), icon: Trash2, danger: true, onClick: () => onDeletePlace(place.id) })
          ctxMenu.open(e, items)
        }}
        onMouseEnter={e => {
          if (!isPlaceSelected && !lockedIds.has(assignment.id))
            e.currentTarget.style.background = 'var(--bg-hover)'
          const grip = e.currentTarget.querySelector('.dp-grip') as HTMLElement | null
          if (grip) grip.style.opacity = '1'
          setHoveredAssignmentId(assignment.id)
        }}
        onMouseLeave={e => {
          if (!isPlaceSelected && !lockedIds.has(assignment.id))
            e.currentTarget.style.background = 'transparent'
          const grip = e.currentTarget.querySelector('.dp-grip') as HTMLElement | null
          if (grip) grip.style.opacity = '0.3'
          setHoveredAssignmentId(null)
        }}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 8px 7px 10px',
          cursor: 'pointer',
          background: lockedIds.has(assignment.id)
            ? 'rgba(220,38,38,0.08)'
            : isPlaceSelected ? 'var(--bg-selected)' : 'transparent',
          borderLeft: lockedIds.has(assignment.id)
            ? '3px solid #dc2626'
            : '3px solid transparent',
          borderTop: showDropLine ? '2px solid var(--text-primary)' : undefined,
          transition: 'background 0.15s, border-color 0.15s',
          opacity: isDraggingThis ? 0.4 : 1,
        }}
      >
        {canEditDays && <div className="dp-grip" style={{ flexShrink: 0, color: 'var(--text-faint)', display: 'flex', alignItems: 'center', opacity: 0.3, transition: 'opacity 0.15s', cursor: 'grab' }}>
          <GripVertical size={13} strokeWidth={1.8} />
        </div>}
        <div
          onClick={e => { e.stopPropagation(); toggleLock(assignment.id) }}
          onMouseEnter={e => { e.stopPropagation(); setLockHoverId(assignment.id) }}
          onMouseLeave={() => setLockHoverId(null)}
          style={{ position: 'relative', flexShrink: 0, cursor: 'pointer' }}
        >
          <PlaceAvatar place={place} category={cat} size={28} />
          {/* Hover/locked overlay */}
          {(lockHoverId === assignment.id || lockedIds.has(assignment.id)) && (
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: lockedIds.has(assignment.id) ? 'rgba(220,38,38,0.6)' : 'rgba(220,38,38,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.15s',
            }}>
              <Lock size={14} strokeWidth={2.5} style={{ color: 'white', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }} />
            </div>
          )}
          {/* Custom tooltip */}
          {lockHoverId === assignment.id && (
            <div style={{
              position: 'absolute', left: '100%', top: '50%', transform: 'translateY(-50%)',
              marginLeft: 8, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 50,
              background: 'var(--bg-card, white)', color: 'var(--text-primary, #111827)',
              fontSize: 11, fontWeight: 500, padding: '5px 10px', borderRadius: 8,
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)', border: '1px solid var(--border-faint, #e5e7eb)',
            }}>
              {lockedIds.has(assignment.id)
                ? t('planner.clickToUnlock')
                : t('planner.keepPosition')}
            </div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden' }}>
            {cat && (() => {
              const CatIcon = getCategoryIcon(cat.icon)
              return <span title={cat.name} style={{ display: 'inline-flex', flexShrink: 0 }}><CatIcon size={10} strokeWidth={2} color={cat.color || 'var(--text-muted)'} /></span>
            })()}
            <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}>
              {place.name}
            </span>
            {place.place_time && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0, fontSize: 10, color: 'var(--text-faint)', fontWeight: 400, marginLeft: 6 }}>
                <Clock size={9} strokeWidth={2} />
                {formatTime(place.place_time, locale, timeFormat)}{place.end_time ? ` – ${formatTime(place.end_time, locale, timeFormat)}` : ''}
              </span>
            )}
          </div>
          {(place.description || place.address || cat?.name) && (
            <div className="collab-note-md" style={{ marginTop: 2, fontSize: 10, color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2, maxHeight: '1.2em' }}>
              <Markdown remarkPlugins={[remarkGfm]}>{place.description || place.address || cat?.name || ''}</Markdown>
            </div>
          )}
          {(() => {
            const res = reservations.find(r => r.assignment_id === assignment.id)
            if (!res) return null
            const confirmed = res.status === 'confirmed'
            const hasEndpoints = onToggleConnection && (res.endpoints || []).length >= 2
            const active = hasEndpoints ? (visibleConnectionIds || []).includes(res.id) : false
            return (
              <div style={{ marginTop: 3, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <div className={confirmed ? 'bg-[rgba(22,163,74,0.1)] text-[#16a34a]' : 'bg-[rgba(217,119,6,0.1)] text-[#d97706]'} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '1px 6px', borderRadius: 5, fontSize: 9, fontWeight: 600,
                }}>
                  {(() => { const RI = RES_ICONS[res.type] || Ticket; return <RI size={8} /> })()}
                  <span className="hidden sm:inline">{confirmed ? t('planner.resConfirmed') : t('planner.resPending')}</span>
                  {(() => {
                    const { time: st } = splitReservationDateTime(res.reservation_time)
                    const { time: et } = splitReservationDateTime(res.reservation_end_time)
                    if (!st && !et) return null
                    return (
                      <span style={{ fontWeight: 400 }}>
                        {st ? formatTime(st, locale, timeFormat) : ''}
                        {et ? ` – ${formatTime(et, locale, timeFormat)}` : ''}
                      </span>
                    )
                  })()}
                  {(() => {
                    const meta = typeof res.metadata === 'string' ? JSON.parse(res.metadata || '{}') : (res.metadata || {})
                    if (!meta) return null
                    if (meta.airline && meta.flight_number) return <span style={{ fontWeight: 400 }}>{meta.airline} {meta.flight_number}</span>
                    if (meta.flight_number) return <span style={{ fontWeight: 400 }}>{meta.flight_number}</span>
                    if (meta.train_number) return <span style={{ fontWeight: 400 }}>{meta.train_number}</span>
                    return null
                  })()}
                </div>
                {hasEndpoints && (
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); onToggleConnection!(res.id) }}
                    title={t(active ? 'map.hideConnections' : 'map.showConnections')}
                    className={active ? 'bg-[#3b82f6] text-[#fff]' : 'bg-transparent text-content-faint'}
                    style={{
                      flexShrink: 0, appearance: 'none',
                      width: 20, height: 20, borderRadius: 4,
                      display: 'grid', placeItems: 'center', cursor: 'pointer',
                      border: 'none',
                      transition: 'color 120ms cubic-bezier(0.23,1,0.32,1), background 120ms cubic-bezier(0.23,1,0.32,1)',
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--text-primary)' }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--text-faint)' }}
                  >
                    <RouteIcon size={11} />
                  </button>
                )}
                {canEditDays && (() => {
                  const isTransport = TRANSPORT_TYPES.has(res.type)
                  const handler = isTransport ? onEditTransport : onEditReservation
                  if (!handler) return null
                  return (
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); handler(res) }}
                      title={t('common.edit')}
                      className="bg-transparent text-content-faint"
                      style={{
                        flexShrink: 0, appearance: 'none',
                        width: 20, height: 20, borderRadius: 4,
                        display: 'grid', placeItems: 'center', cursor: 'pointer',
                        border: 'none',
                        transition: 'color 120ms cubic-bezier(0.23,1,0.32,1), background 120ms cubic-bezier(0.23,1,0.32,1)',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)' }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-faint)' }}
                    >
                      <Pencil size={11} />
                    </button>
                  )
                })()}
              </div>
            )
          })()}
          {(() => {
            const participants = assignment.participants ?? []
            return participants.length > 0 ? (
              <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: -4 }}>
                {participants.slice(0, 5).map((p, pi) => (
                  <div key={p.user_id} className="bg-surface-tertiary text-content-muted" style={{
                    width: 16, height: 16, borderRadius: '50%', border: '1.5px solid var(--bg-card)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 700,
                    marginLeft: pi > 0 ? -4 : 0, flexShrink: 0,
                    overflow: 'hidden',
                  }}>
                    {p.avatar ? <img src={`/uploads/avatars/${p.avatar}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : p.username?.[0]?.toUpperCase()}
                  </div>
                ))}
                {participants.length > 5 && (
                  <span className="text-content-faint" style={{ fontSize: 8, marginLeft: 2 }}>+{participants.length - 5}</span>
                )}
              </div>
            ) : null
          })()}
        </div>
        {canEditDays && <div className="reorder-buttons" style={{ flexShrink: 0, display: 'flex', gap: 1, transition: 'opacity 0.15s' }}>
          <button onClick={moveUp} disabled={idx === 0} className={idx === 0 ? 'text-[var(--border-primary)]' : 'text-content-faint'} style={{ background: 'none', border: 'none', padding: '1px 2px', cursor: idx === 0 ? 'default' : 'pointer', display: 'flex', lineHeight: 1 }}>
            <ChevronUp size={12} strokeWidth={2} />
          </button>
          <button onClick={moveDown} disabled={idx === mergedLength - 1} className={idx === mergedLength - 1 ? 'text-[var(--border-primary)]' : 'text-content-faint'} style={{ background: 'none', border: 'none', padding: '1px 2px', cursor: idx === mergedLength - 1 ? 'default' : 'pointer', display: 'flex', lineHeight: 1 }}>
            <ChevronDown size={12} strokeWidth={2} />
          </button>
        </div>}
        {canEditDays && onAddBookingToAssignment && hoveredAssignmentId === assignment.id && (
          <button
            onClick={e => {
              e.stopPropagation()
              onAddBookingToAssignment(dayId, assignment.id)
            }}
            title={t('reservations.addBooking')}
            style={{
              flexShrink: 0,
              background: 'none',
              border: '1px solid var(--border-primary)',
              borderRadius: 5,
              padding: '2px 6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              fontSize: 10,
              fontWeight: 500,
              color: 'var(--text-muted)',
              fontFamily: 'inherit',
            }}
          >
            <Plus size={11} strokeWidth={2} />
          </button>
        )}
      </div>
      {routeLeg && <RouteConnector seg={routeLeg} profile={routeProfile} />}
    </React.Fragment>
  )
}

// ponytail: helper that reads drag data from the dataTransfer OR the parent-held ref OR window.__dragData.
// Inlined here so each row stays self-contained; same logic the parent uses.
function getDragDataFor(
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