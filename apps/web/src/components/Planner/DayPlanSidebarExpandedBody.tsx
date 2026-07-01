// ponytail: extracted from DayPlanSidebar.tsx
import React from 'react'
import { RouteConnector, HotelRouteConnector } from './DayPlanSidebarRouteConnector'
import { MobileAddPlaceButton } from './DayPlanSidebarMobileAddPlaceButton'
import { DayPlanSidebarPlaceRow } from './DayPlanSidebarPlaceRow'
import { DayPlanSidebarTransportRow } from './DayPlanSidebarTransportRow'
import { DayPlanSidebarNoteRow } from './DayPlanSidebarNoteRow'
import { DayPlanSidebarRouteTools } from './DayPlanSidebarRouteTools'
import { getSpanPhase, parseTimeToMinutes } from '../../utils/dayMerge'
import type { Day, Place, Category, Reservation, RouteSegment, Assignment, DayNote, MergedItem } from '../../types'

interface DayPlanSidebarExpandedBodyProps {
  day: Day
  isSelected: boolean
  isExpanded: boolean
  merged: MergedItem[]
  showRouteToolsWhenExpanded: boolean
  routeLegs: Record<number, RouteSegment>
  hotelLegs: { top?: { seg: RouteSegment; name: string }; bottom?: { seg: RouteSegment; name: string } }
  routeProfile: 'driving' | 'walking'
  routeShown: boolean
  routeInfo: { distance: string; duration: string } | null
  dayAssignments: Assignment[]
  getDayAssignments: (dayId: number) => Assignment[]
  draggingId: any
  dropTargetKey: string | null
  dropTargetRef: React.MutableRefObject<string | null>
  setDraggingId: (v: any) => void
  setDragOverDayId: (v: number | null) => void
  setDropTargetKey: (v: string | null) => void
  dragOverDayId: number | null
  canEditDays: boolean
  handleDropOnDay: (e: React.DragEvent, dayId: number) => void
  getDragData: (e: React.DragEvent) => { placeId: string; assignmentId: string; noteId: string; reservationId: string; fromDayId: number; phase: 'single' | 'start' | 'middle' | 'end' }
  dayNoteUi: any
  t: (key: string, params?: Record<string, any>) => string
  dragDataRef: React.MutableRefObject<{ placeId?: string; assignmentId?: string; noteId?: string; reservationId?: string; fromDayId?: string; phase?: 'single' | 'start' | 'middle' | 'end' } | null>
  categories: Category[]
  reservations: Reservation[]
  places: Place[]
  tripId: number
  onAssignToDay?: ((placeId: number, dayId: number, position?: number) => void) | undefined
  onPlaceClick: (placeId: number | null, assignmentId?: number | null) => void
  onSelectDay: (dayId: number, skipFit?: boolean) => void
  onEditPlace?: ((place: any, assignmentId?: number) => void) | undefined
  onDeletePlace?: ((placeId: number) => void) | undefined
  onRemoveAssignment?: ((dayId: number, assignmentId: number) => void) | undefined
  onEditTransport?: ((res: Reservation) => void) | undefined
  onEditReservation?: ((res: Reservation) => void) | undefined
  onAddBookingToAssignment?: ((dayId: number, assignmentId: number) => void) | undefined
  onAddPlace?: () => void
  onToggleRoute?: () => void
  onSetRouteProfile?: (profile: 'driving' | 'walking') => void
  onToggleConnection?: ((reservationId: number) => void) | undefined
  visibleConnectionIds?: number[]
  selectedAssignmentId: number | null
  selectedPlaceId: number | null
  lockedIds: Set<number>
  lockHoverId: number | null
  hoveredAssignmentId: number | null
  computeMultiDayMove: (r: Reservation, targetDayId: number, phase: 'single' | 'start' | 'middle' | 'end') => any
  handleMergedDrop: (dayId: number, fromType: string, fromId: number, toType: string, toId: number, insertAfter?: boolean, toLegIndex?: number | null) => Promise<void>
  applyMergedOrder: (dayId: number, newOrder: { type: string; data: any }[]) => Promise<void>
  setTimeConfirm: (v: any) => void
  toggleLock: (assignmentId: number) => void
  handleOptimize: (dayId: number) => void
  setHoveredAssignmentId: (v: number | null) => void
  setLockHoverId: (v: number | null) => void
  getMergedItems: (dayId: number) => any[]
  setArrowTimeConfirm: (v: { dayId: number; fromId: number; time: string; reorderIds: number[] } | null) => void
  moveNote: (dayId: number, noteId: number, direction: 'up' | 'down') => void
  openEditNote: (dayId: number, note: DayNote, e?: React.MouseEvent) => void
  setPendingDeleteNote: (v: { dayId: number; noteId: number } | null) => void
  tripActions: any
  toast: { error: (msg: string) => void }
  locale: string
  timeFormat: '12h' | '24h' | string
  ctxMenu: any
  registerAutoScrollRef: (assignmentId: number, el: HTMLDivElement | null, isSelected: boolean) => void
}

export function DayPlanSidebarExpandedBody({
  day, isSelected, isExpanded, merged, showRouteToolsWhenExpanded,
  routeLegs, hotelLegs, routeProfile, routeShown, routeInfo, dayAssignments, getDayAssignments,
  draggingId, dropTargetKey, dropTargetRef,
  setDraggingId, setDragOverDayId, setDropTargetKey, dragOverDayId, canEditDays,
  handleDropOnDay, getDragData, dayNoteUi, t, dragDataRef, categories, reservations, places, tripId,
  onAssignToDay, onPlaceClick, onSelectDay, onEditPlace, onDeletePlace, onRemoveAssignment,
  onEditTransport, onEditReservation, onAddBookingToAssignment, onAddPlace,
  onToggleRoute, onSetRouteProfile, onToggleConnection, visibleConnectionIds,
  selectedAssignmentId, selectedPlaceId, lockedIds, lockHoverId, hoveredAssignmentId,
  computeMultiDayMove, handleMergedDrop, applyMergedOrder, setTimeConfirm, toggleLock,
  handleOptimize, setHoveredAssignmentId, setLockHoverId, getMergedItems,
  setArrowTimeConfirm, moveNote, openEditNote, setPendingDeleteNote,
  tripActions, toast, locale, timeFormat, ctxMenu, registerAutoScrollRef,
}: DayPlanSidebarExpandedBodyProps) {
  if (!isExpanded) return null
  const placeItems = merged.filter(i => i.type === 'place')

  const arrowMove = (assignment: Assignment, direction: 'up' | 'down') => {
    const m = getMergedItems(day.id)
    const myIdx = m.findIndex(i => i.type === 'place' && i.data.id === assignment.id)
    if (myIdx === -1) return
    const targetIdx = direction === 'up' ? myIdx - 1 : myIdx + 1
    if (targetIdx < 0 || targetIdx >= m.length) return

    const newOrder = [...m]
    ;[newOrder[myIdx], newOrder[targetIdx]] = [newOrder[targetIdx], newOrder[myIdx]]

    const placeTime = assignment.place?.place_time
    if (placeTime && parseTimeToMinutes(placeTime) !== null) {
      const timedInNewOrder = newOrder
        .map(i => {
          if (i.type === 'transport') return parseTimeToMinutes((i.data as any)?.reservation_time)
          if (i.type === 'place') return parseTimeToMinutes((i.data as any)?.place?.place_time)
          return null
        })
        .filter((tt: number | null) => tt !== null) as number[]
      const isChronological = timedInNewOrder.every((tt, i) => i === 0 || tt >= timedInNewOrder[i - 1])
      if (!isChronological) {
        const timeStr = placeTime.includes(':') ? placeTime.substring(0, 5) : placeTime
        setArrowTimeConfirm({ dayId: day.id, fromId: assignment.id, time: timeStr, reorderIds: newOrder.filter(i => i.type === 'place').map(i => i.data.id) })
        return
      }
    }
    applyMergedOrder(day.id, newOrder)
  }
  const moveUp = (a: Assignment) => (e: React.MouseEvent) => { e.stopPropagation(); arrowMove(a, 'up') }
  const moveDown = (a: Assignment) => (e: React.MouseEvent) => { e.stopPropagation(); arrowMove(a, 'down') }

  return (
    <div
      style={{ background: 'var(--bg-hover)', paddingTop: 6 }}
      onDragOver={e => { e.preventDefault(); const cur = dropTargetRef.current; if (draggingId && (!cur || cur.startsWith('end-'))) setDropTargetKey(`end-${day.id}`) }}
      onDrop={e => {
        e.preventDefault()
        e.stopPropagation()
        const { placeId, assignmentId, noteId, reservationId: fromReservationId, fromDayId, phase } = getDragData(e)
        // Drop on transport card (detected via dropTargetRef for sync accuracy)
        if (dropTargetRef.current?.startsWith('transport-')) {
          const isAfter = dropTargetRef.current.startsWith('transport-after-')
          const parts = dropTargetRef.current.replace('transport-after-', '').replace('transport-', '').split('-')
          const transportId = Number(parts[0])
          const legPart = parts.find(p => /^leg\d+$/.test(p))
          const toLegIndex = legPart ? Number(legPart.slice(3)) : null

          if (placeId) {
            onAssignToDay?.(parseInt(placeId), day.id)
          } else if (fromReservationId && fromDayId !== day.id) {
            const r = reservations.find(x => x.id === Number(fromReservationId))
            if (r) { const update = computeMultiDayMove(r, day.id, phase); tripActions.updateReservation(tripId, r.id, update).catch((err: unknown) => toast.error(err instanceof Error ? err.message : t('common.unknownError'))) }
          } else if (fromReservationId) {
            handleMergedDrop(day.id, 'transport', Number(fromReservationId), 'transport', transportId, isAfter, toLegIndex)
          } else if (assignmentId && fromDayId !== day.id) {
            tripActions.moveAssignment(tripId, Number(assignmentId), fromDayId, day.id).catch((err: unknown) => toast.error(err instanceof Error ? err.message : t('common.unknownError')))
          } else if (assignmentId) {
            handleMergedDrop(day.id, 'place', Number(assignmentId), 'transport', transportId, isAfter, toLegIndex)
          } else if (noteId && fromDayId !== day.id) {
            tripActions.moveDayNote(tripId, fromDayId, day.id, Number(noteId)).catch((err: unknown) => toast.error(err instanceof Error ? err.message : t('common.unknownError')))
          } else if (noteId) {
            handleMergedDrop(day.id, 'note', Number(noteId), 'transport', transportId, isAfter, toLegIndex)
          }
          setDraggingId(null); setDropTargetKey(null); dragDataRef.current = null; window.__dragData = null
          return
        }

        if (fromReservationId && fromDayId !== day.id) {
          const r = reservations.find(x => x.id === Number(fromReservationId))
          if (r) { const update = computeMultiDayMove(r, day.id, phase); tripActions.updateReservation(tripId, r.id, update).catch((err: unknown) => toast.error(err instanceof Error ? err.message : t('common.unknownError'))) }
          setDraggingId(null); setDropTargetKey(null); dragDataRef.current = null; return
        }
        if (!assignmentId && !noteId && !placeId) { dragDataRef.current = null; window.__dragData = null; return }
        if (placeId) {
          onAssignToDay?.(parseInt(placeId), day.id)
          setDropTargetKey(null); window.__dragData = null; return
        }
        if (assignmentId && fromDayId !== day.id) {
          tripActions.moveAssignment(tripId, Number(assignmentId), fromDayId, day.id).catch((err: unknown) => toast.error(err instanceof Error ? err.message : t('common.unknownError')))
          setDraggingId(null); setDropTargetKey(null); dragDataRef.current = null; return
        }
        if (noteId && fromDayId !== day.id) {
          tripActions.moveDayNote(tripId, fromDayId, day.id, Number(noteId)).catch((err: unknown) => toast.error(err instanceof Error ? err.message : t('common.unknownError')))
          setDraggingId(null); setDropTargetKey(null); dragDataRef.current = null; return
        }
        const m = getMergedItems(day.id)
        if (m.length === 0) return
        const lastItem = m[m.length - 1]
        if (assignmentId && String(lastItem?.data?.id) !== assignmentId)
          handleMergedDrop(day.id, 'place', Number(assignmentId), lastItem.type, lastItem.data.id, true)
        else if (noteId && String(lastItem?.data?.id) !== noteId)
          handleMergedDrop(day.id, 'note', Number(noteId), lastItem.type, lastItem.data.id, true)
      }}
    >
      {isSelected && hotelLegs.top && (
        <HotelRouteConnector seg={hotelLegs.top.seg} name={hotelLegs.top.name} profile={routeProfile} placement="top" />
      )}
      {merged.length === 0 && !dayNoteUi ? (
        <div
          onDragOver={e => { e.preventDefault(); if (dragOverDayId !== day.id) setDragOverDayId(day.id) }}
          onDrop={e => handleDropOnDay(e, day.id)}
          className={dragOverDayId === day.id ? 'bg-[rgba(17,24,39,0.05)]' : 'bg-transparent'}
          style={{ padding: '16px', textAlign: 'center', borderRadius: 8,
            border: dragOverDayId === day.id ? '2px dashed rgba(17,24,39,0.2)' : '2px dashed transparent',
          }}
        >
          <span className="text-content-faint" style={{ fontSize: 12 }}>{t('dayplan.emptyDay')}</span>
        </div>
      ) : (
        merged.map((item, idx) => {
          const legSuffix = (item.data as any)?.__leg ? `-leg${(item.data as any).__leg.index}` : ''
          const itemKey = item.type === 'transport' ? `transport-${(item.data as any).id}${legSuffix}-${day.id}` : (item.type === 'place' ? `place-${(item.data as any).id}` : `note-${(item.data as any).id}`)
          const showDropLine = (!!draggingId || !!dropTargetKey) && dropTargetKey === itemKey
          const showDropLineAfter = item.type === 'transport' && (!!draggingId || !!dropTargetKey) && dropTargetKey === `transport-after-${(item.data as any).id}${legSuffix}-${day.id}`

          if (item.type === 'place') {
            const assignment = item.data as Assignment
            const place = assignment.place
            if (!place) return null
            const isPlaceSelected = selectedAssignmentId ? assignment.id === selectedAssignmentId : place.id === selectedPlaceId
            const isDraggingThis = draggingId === assignment.id
            return (
              <DayPlanSidebarPlaceRow
                key={`place-${assignment.id}`}
                assignment={assignment}
                dayId={day.id}
                idx={idx}
                mergedLength={merged.length}
                categories={categories}
                reservations={reservations}
                tripId={tripId}
                routeProfile={routeProfile}
                selectedAssignmentId={selectedAssignmentId}
                selectedPlaceId={selectedPlaceId}
                draggingId={draggingId}
                lockedIds={lockedIds}
                lockHoverId={lockHoverId}
                hoveredAssignmentId={hoveredAssignmentId}
                dropTargetKey={dropTargetKey}
                showDropLine={showDropLine}
                routeLeg={routeLegs[assignment.id]}
                canEditDays={canEditDays}
                isDraggingThis={isDraggingThis}
                placeItems={placeItems}
                dragDataRef={dragDataRef}
                registerAutoScrollRef={registerAutoScrollRef}
                getDayAssignments={getDayAssignments}
                getMergedItems={getMergedItems}
                onPlaceClick={onPlaceClick}
                onSelectDay={onSelectDay}
                onAssignToDay={onAssignToDay}
                onRemoveAssignment={onRemoveAssignment}
                onEditPlace={onEditPlace}
                onDeletePlace={onDeletePlace}
                onEditTransport={onEditTransport}
                onEditReservation={onEditReservation}
                onAddBookingToAssignment={onAddBookingToAssignment}
                onToggleConnection={onToggleConnection}
                visibleConnectionIds={visibleConnectionIds}
                setDraggingId={setDraggingId}
                setDragOverDayId={setDragOverDayId}
                setDropTargetKey={setDropTargetKey}
                setHoveredAssignmentId={setHoveredAssignmentId}
                setLockHoverId={setLockHoverId}
                computeMultiDayMove={computeMultiDayMove}
                handleMergedDrop={handleMergedDrop}
                applyMergedOrder={applyMergedOrder}
                setTimeConfirm={setTimeConfirm}
                toggleLock={toggleLock}
                moveUp={moveUp(assignment)}
                moveDown={moveDown(assignment)}
                tripActions={tripActions}
                toast={toast}
                t={t}
                locale={locale}
                timeFormat={timeFormat}
                ctxMenu={ctxMenu}
              />
            )
          }

          if (item.type === 'transport') {
            const res = item.data as Reservation
            const spanPhase = getSpanPhase(res, day.id)
            // ponytail: getSpanLabel is a closure in the parent (uses t()); the parent passes the precomputed
            // spanLabel to TransportRow, so we replicate it here for the same-day computation.
            const spanLabel = (res as any).__leg ? null : computeSpanLabel(res, spanPhase, t)
            return (
              <DayPlanSidebarTransportRow
                key={`transport-${res.id}-${(res as any).__leg ? `leg${(res as any).__leg.index}` : 'x'}-${day.id}`}
                res={res}
                dayId={day.id}
                draggingId={draggingId}
                dropTargetRef={dropTargetRef}
                showDropLine={showDropLine}
                showDropLineAfter={showDropLineAfter}
                routeLeg={routeLegs[res.id]}
                routeProfile={routeProfile}
                canEditDays={canEditDays}
                spanLabel={spanLabel}
                dragDataRef={dragDataRef}
                reservations={reservations}
                tripId={tripId}
                onAssignToDay={onAssignToDay}
                onEditTransport={onEditTransport}
                onEditReservation={onEditReservation}
                onToggleConnection={onToggleConnection}
                visibleConnectionIds={visibleConnectionIds}
                computeMultiDayMove={computeMultiDayMove}
                handleMergedDrop={handleMergedDrop}
                setDraggingId={setDraggingId}
                setDragOverDayId={setDragOverDayId}
                setDropTargetKey={setDropTargetKey}
                tripActions={tripActions}
                toast={toast}
                t={t}
                locale={locale}
                timeFormat={timeFormat}
              />
            )
          }

          const note = item.data as DayNote
          return (
            <DayPlanSidebarNoteRow
              key={`note-${note.id}`}
              note={note}
              dayId={day.id}
              idx={idx}
              mergedLength={merged.length}
              draggingId={draggingId}
              showDropLine={showDropLine}
              canEditDays={canEditDays}
              dragDataRef={dragDataRef}
              reservations={reservations}
              tripId={tripId}
              onAssignToDay={onAssignToDay}
              openEditNote={openEditNote}
              setPendingDeleteNote={setPendingDeleteNote}
              handleMergedDrop={handleMergedDrop}
              getMergedItems={getMergedItems}
              setDraggingId={setDraggingId}
              setDropTargetKey={setDropTargetKey}
              dropTargetKey={dropTargetKey}
              computeMultiDayMove={computeMultiDayMove}
              moveNote={moveNote}
              tripActions={tripActions}
              toast={toast}
              t={t}
              ctxMenu={ctxMenu}
            />
          )
        })
      )}
      {isSelected && hotelLegs.bottom && (
        <HotelRouteConnector seg={hotelLegs.bottom.seg} name={hotelLegs.bottom.name} profile={routeProfile} placement="bottom" />
      )}
      {/* Drop-Zone am Listenende */}
      <div
        style={{ minHeight: 12, padding: '2px 8px' }}
        onDragOver={e => { e.preventDefault(); e.stopPropagation(); if (dropTargetKey !== `end-${day.id}`) setDropTargetKey(`end-${day.id}`) }}
        onDrop={e => {
          e.preventDefault(); e.stopPropagation()
          const { placeId, assignmentId, noteId, reservationId: fromReservationId, fromDayId, phase } = getDragData(e)
          if (placeId) {
            onAssignToDay?.(parseInt(placeId), day.id)
            setDropTargetKey(null); window.__dragData = null; return
          }
          if (fromReservationId && fromDayId !== day.id) {
            const r = reservations.find(x => x.id === Number(fromReservationId))
            if (r) { const update = computeMultiDayMove(r, day.id, phase); tripActions.updateReservation(tripId, r.id, update).catch((err: unknown) => toast.error(err instanceof Error ? err.message : t('common.unknownError'))) }
            setDraggingId(null); setDropTargetKey(null); dragDataRef.current = null; window.__dragData = null; return
          }
          if (!assignmentId && !noteId && !fromReservationId) { dragDataRef.current = null; window.__dragData = null; return }
          if (assignmentId && fromDayId !== day.id) {
            tripActions.moveAssignment(tripId, Number(assignmentId), fromDayId, day.id).catch((err: unknown) => toast.error(err instanceof Error ? err.message : t('common.unknownError')))
            setDraggingId(null); setDropTargetKey(null); dragDataRef.current = null; return
          }
          if (noteId && fromDayId !== day.id) {
            tripActions.moveDayNote(tripId, fromDayId, day.id, Number(noteId)).catch((err: unknown) => toast.error(err instanceof Error ? err.message : t('common.unknownError')))
            setDraggingId(null); setDropTargetKey(null); dragDataRef.current = null; return
          }
          const m = getMergedItems(day.id)
          if (m.length === 0) return
          const lastItem = m[m.length - 1]
          if (assignmentId && String(lastItem?.data?.id) !== assignmentId)
            handleMergedDrop(day.id, 'place', Number(assignmentId), lastItem.type, lastItem.data.id, true)
          else if (noteId && String(lastItem?.data?.id) !== noteId)
            handleMergedDrop(day.id, 'note', Number(noteId), lastItem.type, lastItem.data.id, true)
          else if (fromReservationId && String(lastItem?.data?.id) !== fromReservationId)
            handleMergedDrop(day.id, 'transport', Number(fromReservationId), lastItem.type, lastItem.data.id, true)
          setDropTargetKey(null); dragDataRef.current = null; window.__dragData = null
        }}
      >
        {dropTargetKey === `end-${day.id}` && (
          <div style={{ height: 2, background: 'var(--text-primary)', borderRadius: 1 }} />
        )}
      </div>

      <DayPlanSidebarRouteTools
        isSelected={isSelected}
        isExpanded={isExpanded}
        showRouteToolsWhenExpanded={showRouteToolsWhenExpanded}
        dayId={day.id}
        dayAssignments={dayAssignments}
        routeShown={routeShown}
        routeInfo={routeInfo}
        routeProfile={routeProfile}
        onToggleRoute={onToggleRoute}
        onSetRouteProfile={onSetRouteProfile}
        handleOptimize={handleOptimize}
        t={t}
      />

      <MobileAddPlaceButton
        dayId={day.id}
        places={places}
        assignments={{ [String(day.id)]: dayAssignments }}
        onAssign={onAssignToDay}
        onAddNew={onAddPlace}
      />
    </div>
  )
}

// ponytail: duplicated from useDayPlanSidebar — needs `t()`, so it's UI-layer and stays out of utils.
function computeSpanLabel(r: { type: string }, phase: string, t: (k: string, p?: Record<string, any>) => string): string | null {
  if (phase === 'single') return null
  if (r.type === 'flight') return t(`reservations.span.${phase === 'start' ? 'departure' : phase === 'end' ? 'arrival' : 'inTransit'}`)
  if (r.type === 'car') return t(`reservations.span.${phase === 'start' ? 'pickup' : phase === 'end' ? 'return' : 'active'}`)
  return t(`reservations.span.${phase === 'start' ? 'start' : phase === 'end' ? 'end' : 'ongoing'}`)
}