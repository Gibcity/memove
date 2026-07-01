// ponytail: this file now orchestrates state via useDayPlanSidebar and delegates render to extracted
// components: DayPlanSidebarToolbar, DayPlanSidebarDayHeader, DayPlanSidebarExpandedBody
// (which in turn hosts PlaceRow / TransportRow / NoteRow / RouteTools), DayPlanSidebarNoteModal,
// DayPlanSidebarTimeConfirmModal, DayPlanSidebarTransportDetailModal, DayPlanSidebarFooter.
import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react'
import { assignmentsApi, reservationsApi } from '../../api/client'
import { calculateRoute, calculateRouteWithLegs, optimizeRoute } from '../Map/RouteCalculator'
import ConfirmDialog from '../shared/ConfirmDialog'
import { useContextMenu, ContextMenu } from '../shared/ContextMenu'
import { useToast } from '../shared/Toast'
import { useTripStore } from '../../store/tripStore'
import { useCanDo } from '../../store/permissionsStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useTranslation } from '../../i18n'
import { getAccommodationAnchors, getDayBookendHotels } from '../../utils/dayOrder'
import {
  parseTimeToMinutes, getTransportRouteEndpoints,
  getTransportForDay as _getTransportForDay, getMergedItems as _getMergedItems,
  getDisplayTimeForDay,
  type MergedItem,
} from '../../utils/dayMerge'
import { formatDate, dayTotalCost } from '../../utils/formatters'
import { useDayNotes } from '../../hooks/useDayNotes'
import { DayPlanSidebarToolbar } from './DayPlanSidebarToolbar'
import { DayPlanSidebarDayHeader } from './DayPlanSidebarDayHeader'
import { DayPlanSidebarExpandedBody } from './DayPlanSidebarExpandedBody'
import { DayPlanSidebarNoteModal } from './DayPlanSidebarNoteModal'
import { DayPlanSidebarTimeConfirmModal } from './DayPlanSidebarTimeConfirmModal'
import { DayPlanSidebarTransportDetailModal } from './DayPlanSidebarTransportDetailModal'
import { DayPlanSidebarFooter } from './DayPlanSidebarFooter'
import type { Trip, Day, Place, Category, Assignment, Accommodation, Reservation, AssignmentsMap, RouteResult, RouteSegment } from '../../types'

interface DragDataPayload { placeId?: string; assignmentId?: string; noteId?: string; reservationId?: string; fromDayId?: string; phase?: 'single' | 'start' | 'middle' | 'end' }
declare global { interface Window { __dragData: DragDataPayload | null } }

interface DayPlanSidebarProps {
  tripId: number
  trip: Trip
  days: Day[]
  places: Place[]
  categories: Category[]
  assignments: AssignmentsMap
  selectedDayId: number | null
  selectedPlaceId: number | null
  selectedAssignmentId: number | null
  onSelectDay: (dayId: number | null, skipFit?: boolean) => void
  onPlaceClick: (placeId: number | null, assignmentId?: number | null) => void
  onDayDetail: (day: Day) => void
  accommodations?: Accommodation[]
  onReorder: (dayId: number, orderedIds: number[]) => void
  onReorderDays?: (orderedIds: number[]) => void
  onAddDay?: (position?: number) => void
  onUpdateDayTitle: (dayId: number, title: string) => void
  onRouteCalculated: (route: RouteResult | null) => void
  onAssignToDay: (placeId: number, dayId: number, position?: number) => void
  onRemoveAssignment: (dayId: number, assignmentId: number) => void
  onEditPlace: (place: Place, assignmentId?: number) => void
  onDeletePlace: (placeId: number) => void
  reservations?: Reservation[]
  visibleConnectionIds?: number[]
  onToggleConnection?: (reservationId: number) => void
  externalTransportDetail?: Reservation | null
  onExternalTransportDetailHandled?: () => void
  onAddReservation: (dayId: number) => void
  onNavigateToFiles?: () => void
  routeShown?: boolean
  routeProfile?: 'driving' | 'walking'
  onToggleRoute?: () => void
  onSetRouteProfile?: (profile: 'driving' | 'walking') => void
  onAddPlace?: () => void
  onAddPlaceToDay?: (placeId: number, dayId: number) => void
  onExpandedDaysChange?: (expandedDayIds: Set<number>) => void
  pushUndo?: (label: string, undoFn: () => Promise<void> | void) => void
  canUndo?: boolean
  lastActionLabel?: string | null
  onUndo?: () => void
  onRouteRefresh?: () => void
  onAddTransport?: (dayId: number) => void
  onEditTransport?: (reservation: Reservation) => void
  onEditReservation?: (reservation: Reservation) => void
  onAddBookingToAssignment?: (dayId: number, assignmentId: number) => void
  initialScrollTop?: number
  onScrollTopChange?: (top: number) => void
  /** Mobile: show the route tools footer (Route toggle / Optimize / travel profile) on expanded days, since selecting a day closes the sheet */
  showRouteToolsWhenExpanded?: boolean
}

/**
 * Day-plan state + behaviour: expand/collapse, inline title edit, route legs +
 * optimisation, day notes, and the drag-and-drop reorder/move machinery across
 * days (places, transports, notes). Returns everything the timeline view renders
 * from, keeping DayPlanSidebar a thin shell over one large day list.
 */
function useDayPlanSidebar(props: DayPlanSidebarProps) {
  const {
  tripId,
  trip, days, places, categories, assignments,
  selectedDayId, selectedPlaceId, selectedAssignmentId,
  onSelectDay, onPlaceClick, onDayDetail, accommodations = [],
  onReorder, onReorderDays, onAddDay, onUpdateDayTitle, onRouteCalculated,
  onAssignToDay, onRemoveAssignment, onEditPlace, onDeletePlace,
  reservations = [],
  visibleConnectionIds = [],
  onToggleConnection,
  externalTransportDetail,
  onExternalTransportDetailHandled,
  onAddReservation,
  onAddPlace,
  onAddPlaceToDay,
  onNavigateToFiles,
  routeShown = false,
  routeProfile = 'driving',
  onToggleRoute,
  onSetRouteProfile,
  onExpandedDaysChange,
  pushUndo,
  canUndo = false,
  lastActionLabel = null,
  onUndo,
  onRouteRefresh,
  onAddTransport,
  onEditTransport,
  onEditReservation,
  onAddBookingToAssignment,
  initialScrollTop,
  onScrollTopChange,
  showRouteToolsWhenExpanded = false,
  } = props
  const toast = useToast()
  const { t, language, locale } = useTranslation()
  const ctxMenu = useContextMenu()
  const timeFormat = useSettingsStore(s => s.settings.time_format) || '24h'
  const tripActions = useRef(useTripStore.getState()).current
  const can = useCanDo()
  const canEditDays = can('day_edit', trip)

  const { noteUi, setNoteUi, noteInputRef, dayNotes, openAddNote: _openAddNote, openEditNote: _openEditNote, cancelNote, saveNote, deleteNote: _deleteNote, moveNote: _moveNote } = useDayNotes(tripId)

  const [expandedDays, setExpandedDays] = useState(() => {
    try {
      const saved = sessionStorage.getItem(`day-expanded-${tripId}`)
      if (saved) return new Set<number>(JSON.parse(saved) as number[])
    } catch {}
    return new Set<number>(days.map(d => d.id))
  })
  useEffect(() => { onExpandedDaysChange?.(expandedDays) }, [expandedDays])
  const [editingDayId, setEditingDayId] = useState<number | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [isCalculating, setIsCalculating] = useState(false)
  const [routeInfo, setRouteInfo] = useState<{ distance: string; duration: string } | null>(null)
  const [routeLegs, setRouteLegs] = useState<Record<number, RouteSegment>>({})
  const [hotelLegs, setHotelLegs] = useState<{ top?: { seg: RouteSegment; name: string }; bottom?: { seg: RouteSegment; name: string } }>({})
  const optimizeFromAccommodation = useSettingsStore(s => s.settings.optimize_from_accommodation)
  const legsAbortRef = useRef<AbortController | null>(null)
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [lockedIds, setLockedIds] = useState<Set<number>>(new Set())
  const [lockHoverId, setLockHoverId] = useState<number | null>(null)
  const [undoHover, setUndoHover] = useState(false)
  const [pdfHover, setPdfHover] = useState(false)
  const [icsHover, setIcsHover] = useState(false)
  const [hoveredAssignmentId, setHoveredAssignmentId] = useState<number | null>(null)
  const [dropTargetKey, _setDropTargetKey] = useState<string | null>(null)
  const dropTargetRef = useRef<string | null>(null)
  const setDropTargetKey = (key: string | null) => { dropTargetRef.current = key; _setDropTargetKey(key) }
  const [dragOverDayId, setDragOverDayId] = useState<number | null>(null)
  const [transportDetail, setTransportDetail] = useState<Reservation | null>(null)
  const [transportPosVersion, setTransportPosVersion] = useState(0)

  useEffect(() => {
    if (externalTransportDetail) {
      setTransportDetail(externalTransportDetail)
      onExternalTransportDetailHandled?.()
    }
  }, [externalTransportDetail, onExternalTransportDetailHandled])
  const [timeConfirm, setTimeConfirm] = useState<{
    dayId: number; fromId: number; time: string;
    // For drag & drop reorder
    fromType?: string; toType?: string; toId?: number; insertAfter?: boolean; toLegIndex?: number | null;
    // For arrow reorder
    reorderIds?: number[];
  } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dragDataRef = useRef<{
    assignmentId?: string; noteId?: string; reservationId?: string;
    fromDayId?: string; phase?: 'single' | 'start' | 'middle' | 'end';
  } | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    if (scrollContainerRef.current && initialScrollTop) {
      scrollContainerRef.current.scrollTop = initialScrollTop
    }
  }, [])
  const initedTransportIds = useRef(new Set<number>()) // Speichert Drag-Daten als Backup (dataTransfer geht bei Re-Render verloren)
  // Remember which assignment we last auto-scrolled into view so we don't
  // keep yanking the user back whenever they scroll away while the same
  // place stays selected.
  const lastAutoScrolledIdRef = useRef<number | null>(null)
  useEffect(() => {
    // Reset the scroll-lock whenever selection moves, so the next selected
    // row triggers a fresh scroll-into-view on its ref.
    if (!selectedAssignmentId && !selectedPlaceId) {
      lastAutoScrolledIdRef.current = null
    }
  }, [selectedAssignmentId, selectedPlaceId])

  const currency = trip?.currency || 'EUR'

  // Drag-Daten aus dataTransfer, Ref oder window lesen (dataTransfer geht bei Re-Render verloren)
  const getDragData = (e) => {
    const dt = e?.dataTransfer
    // Interner Drag hat Vorrang (Ref wird nur bei assignmentId/noteId/reservationId gesetzt)
    if (dragDataRef.current) {
      return {
        placeId: '',
        assignmentId: dragDataRef.current.assignmentId || '',
        noteId: dragDataRef.current.noteId || '',
        reservationId: dragDataRef.current.reservationId || '',
        fromDayId: parseInt(dragDataRef.current.fromDayId ?? '0') || 0,
        phase: dragDataRef.current.phase || 'single',
      }
    }
    // Externer Drag (aus PlacesSidebar)
    const ext = window.__dragData || {}
    const placeId = dt?.getData('placeId') || ext.placeId || ''
    return { placeId, assignmentId: '', noteId: '', reservationId: '', fromDayId: 0, phase: 'single' as const }
  }

  // Only auto-expand genuinely new days (not on initial load from storage)
  const prevDayCount = React.useRef(days.length)
  useEffect(() => {
    if (days.length > prevDayCount.current) {
      // New days added — expand only those
      setExpandedDays(prev => {
        const n = new Set(prev)
        days.forEach(d => { if (!prev.has(d.id)) n.add(d.id) })
        try { sessionStorage.setItem(`day-expanded-${tripId}`, JSON.stringify([...n])) } catch {}
        return n
      })
    }
    prevDayCount.current = days.length
  }, [days.length, tripId])

  useEffect(() => {
    if (editingDayId && inputRef.current) inputRef.current.focus()
  }, [editingDayId])

  // Globaler Aufräum-Listener: wenn ein Drag endet ohne Drop, alles zurücksetzen
  useEffect(() => {
    const cleanup = () => {
      setDraggingId(null)
      setDropTargetKey(null)
      setDragOverDayId(null)
      dragDataRef.current = null
      window.__dragData = null
    }
    document.addEventListener('dragend', cleanup)
    return () => document.removeEventListener('dragend', cleanup)
  }, [])

  // Initialize missing transport positions outside of render to avoid setState-during-render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { days.forEach(day => initTransportPositions(day.id)) }, [days, reservations])

  const toggleDay = (dayId, e) => {
    e.stopPropagation()
    setExpandedDays(prev => {
      const n = new Set(prev)
      n.has(dayId) ? n.delete(dayId) : n.add(dayId)
      try { sessionStorage.setItem(`day-expanded-${tripId}`, JSON.stringify([...n])) } catch {}
      return n
    })
  }

  // Get phase label for multi-day badge
  const getSpanLabel = (r: Reservation, phase: string): string | null => {
    if (phase === 'single') return null
    if (r.type === 'flight') return t(`reservations.span.${phase === 'start' ? 'departure' : phase === 'end' ? 'arrival' : 'inTransit'}`)
    if (r.type === 'car') return t(`reservations.span.${phase === 'start' ? 'pickup' : phase === 'end' ? 'return' : 'active'}`)
    return t(`reservations.span.${phase === 'start' ? 'start' : phase === 'end' ? 'end' : 'ongoing'}`)
  }

  const getDayOrder = (day: (typeof days)[number]) => (day as any).day_number ?? days.indexOf(day)

  const computeMultiDayMove = (r: Reservation, targetDayId: number, phase: 'single' | 'start' | 'middle' | 'end') => {
    const startId = r.day_id ?? targetDayId
    const endId = r.end_day_id ?? startId
    const order = (id: number) => { const d = days.find(x => x.id === id); return d ? getDayOrder(d) : 0 }
    if (phase === 'single' || startId === endId) return { day_id: targetDayId, end_day_id: targetDayId }
    if (phase === 'start') {
      if (order(targetDayId) > order(endId)) return { day_id: targetDayId, end_day_id: targetDayId }
      return { day_id: targetDayId, end_day_id: endId }
    }
    // phase === 'end'
    if (order(targetDayId) < order(startId)) return { day_id: targetDayId, end_day_id: targetDayId }
    return { day_id: startId, end_day_id: targetDayId }
  }

  const getTransportForDay = (dayId: number) =>
    _getTransportForDay({ reservations, dayId, dayAssignmentIds: (assignments[String(dayId)] || []).map(a => a.id), days })

  // Get car rentals that are in "active" (middle) phase for a day — shown in day header, not timeline
  const getActiveRentalsForDay = (dayId: number) => {
    return reservations.filter(r => {
      if (r.type !== 'car') return false
      const startDayId = r.day_id
      const endDayId = r.end_day_id
      if (!startDayId || !endDayId || endDayId === startDayId) return false
      const startDay = days.find(d => d.id === startDayId)
      const endDay = days.find(d => d.id === endDayId)
      const thisDay = days.find(d => d.id === dayId)
      if (!startDay || !endDay || !thisDay) return false
      return getDayOrder(thisDay) > getDayOrder(startDay) && getDayOrder(thisDay) < getDayOrder(endDay)
    })
  }

  const getDayAssignments = (dayId) =>
    (assignments[String(dayId)] || []).slice().sort((a, b) => a.order_index - b.order_index)

  // Compute initial day_plan_position for a transport based on time
  const computeTransportPosition = (r, da) => {
    const minutes = parseTimeToMinutes(r.reservation_time) ?? 0
    // Find the last place with time <= transport time
    let afterIdx = -1
    for (const a of da) {
      const pm = parseTimeToMinutes(a.place?.place_time)
      if (pm !== null && pm <= minutes) afterIdx = a.order_index
    }
    // Position: midpoint between afterIdx and afterIdx+1 (leaves room for other items)
    return afterIdx >= 0 ? afterIdx + 0.5 : da.length + 0.5
  }

  // Auto-initialize transport positions on first render if not set
  const initTransportPositions = (dayId) => {
    const da = getDayAssignments(dayId)
    const transport = getTransportForDay(dayId)
    const needsInit = transport.filter(r => r.day_plan_position == null && !initedTransportIds.current.has(r.id))
    if (needsInit.length === 0) return

    const sorted = [...needsInit].sort((a, b) =>
      (parseTimeToMinutes(a.reservation_time) ?? 0) - (parseTimeToMinutes(b.reservation_time) ?? 0)
    )
    const positions = sorted.map((r, idx) => ({
      id: r.id,
      day_plan_position: computeTransportPosition(r, da) + idx * 0.01,
    }))
    // Mark as initialized immediately to prevent re-entry
    for (const p of positions) initedTransportIds.current.add(p.id)
    // Update store so subscribers see the new positions
    useTripStore.setState(state => ({
      reservations: state.reservations.map(r => {
        const p = positions.find(x => x.id === r.id)
        if (!p) return r
        return { ...r, day_plan_position: p.day_plan_position }
      })
    }))
    // Persist to server (fire and forget)
    reservationsApi.updatePositions(tripId, positions).catch(() => {})
  }

  const getMergedItems = (dayId: number): MergedItem[] =>
    _getMergedItems({
      dayAssignments: getDayAssignments(dayId),
      dayNotes: (dayNotes[String(dayId)] || []).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
      dayTransports: getTransportForDay(dayId),
      dayId,
      getDisplayTime: getDisplayTimeForDay,
    })

  // Pre-compute merged items for all days so the render loop doesn't recompute on unrelated state changes (e.g. hover)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mergedItemsMap = useMemo(() => {
    const map: Record<number, ReturnType<typeof getMergedItems>> = {}
    days.forEach(day => { map[day.id] = getMergedItems(day.id) })
    return map
  // getMergedItems is redefined each render but captures assignments/dayNotes/reservations/days via closure
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, assignments, dayNotes, reservations, transportPosVersion])

  // Per-segment driving times for the selected day's connectors. Groups located
  // places into runs (split at transports), one cached OSRM call per run, keyed by
  // the start place's assignment id. Shares RouteCalculator's cache with the map.
  useEffect(() => {
    if (legsAbortRef.current) legsAbortRef.current.abort()
    if (!selectedDayId || !routeShown) { setRouteLegs({}); setHotelLegs({}); return }
    const merged = mergedItemsMap[selectedDayId] || []
    const runs: { id: number; lat: number; lng: number }[][] = []
    let cur: { id: number; lat: number; lng: number }[] = []
    for (const it of merged) {
      if (it.type === 'place' && it.data.place?.lat && it.data.place?.lng) {
        cur.push({ id: it.data.id, lat: it.data.place.lat, lng: it.data.place.lng })
      } else if (it.type === 'transport') {
        const r = it.data
        const { from, to } = getTransportRouteEndpoints(r, selectedDayId)
        if (from || to) {
          // Located transport: route to its departure point, break the run (the
          // flight/train itself isn't driven), and let its arrival start the next.
          if (from) cur.push({ id: r.id, lat: from.lat, lng: from.lng })
          if (cur.length >= 2) runs.push(cur)
          cur = []
          if (to) cur.push({ id: r.id, lat: to.lat, lng: to.lng })
        } else if (cur.length > 0) {
          // No location: ignore for routing, but attribute the through-leg to the
          // booking so its distance/duration shows under it (purely cosmetic).
          cur[cur.length - 1] = { ...cur[cur.length - 1], id: r.id }
        }
      }
    }
    if (cur.length >= 2) runs.push(cur)

    // Hotel bookend legs: the drive from the day's accommodation to the first located
    // waypoint of the day (morning) and from the last one back to it (evening). Only when
    // the "optimize from accommodation" setting is on and the day has a hotel.
    const day = days.find(d => d.id === selectedDayId)
    const { morning: startHotel, evening: endHotel } =
      day && optimizeFromAccommodation !== false ? getDayBookendHotels(day, days, accommodations) : {}
    const hotelName = (a: Accommodation) => (a as any).place_name || (a as any).reservation_title || ''
    // Waypoints include transport endpoints (a car return, a taxi/train arrival), so the hotel
    // legs connect even when the day starts or ends with a booking rather than a place.
    const wayPts: { lat: number; lng: number }[] = []
    for (const it of merged) {
      if (it.type === 'place' && it.data.place?.lat && it.data.place?.lng) {
        wayPts.push({ lat: it.data.place.lat, lng: it.data.place.lng })
      } else if (it.type === 'transport') {
        const { from, to } = getTransportRouteEndpoints(it.data, selectedDayId)
        if (from) wayPts.push({ lat: from.lat, lng: from.lng })
        if (to) wayPts.push({ lat: to.lat, lng: to.lng })
      }
    }
    const firstWay = wayPts[0]
    const lastWay = wayPts[wayPts.length - 1]
    const wantTop = !!(startHotel && firstWay)
    const wantBottom = !!(endHotel && lastWay)

    if (runs.length === 0 && !wantTop && !wantBottom) { setRouteLegs({}); setHotelLegs({}); return }

    const controller = new AbortController()
    legsAbortRef.current = controller
    ;(async () => {
      const map: Record<number, RouteSegment> = {}
      for (const run of runs) {
        try {
          const r = await calculateRouteWithLegs(run.map(p => ({ lat: p.lat, lng: p.lng })), { signal: controller.signal, profile: routeProfile })
          r.legs.forEach((leg, i) => { map[run[i].id] = leg })
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') return
        }
      }

      // One extra cached OSRM call per bookend; shares RouteCalculator's cache.
      const legBetween = async (a: { lat: number; lng: number }, b: { lat: number; lng: number }): Promise<RouteSegment | undefined> => {
        try {
          const r = await calculateRouteWithLegs([a, b], { signal: controller.signal, profile: routeProfile })
          return r.legs[0]
        } catch { return undefined }
      }
      const hotel: { top?: { seg: RouteSegment; name: string }; bottom?: { seg: RouteSegment; name: string } } = {}
      if (wantTop) {
        const seg = await legBetween({ lat: startHotel!.place_lat as number, lng: startHotel!.place_lng as number }, { lat: firstWay.lat, lng: firstWay.lng })
        if (seg) hotel.top = { seg, name: hotelName(startHotel!) }
      }
      if (wantBottom) {
        const seg = await legBetween({ lat: lastWay.lat, lng: lastWay.lng }, { lat: endHotel!.place_lat as number, lng: endHotel!.place_lng as number })
        if (seg) hotel.bottom = { seg, name: hotelName(endHotel!) }
      }

      if (!controller.signal.aborted) { setRouteLegs(map); setHotelLegs(hotel) }
    })()
  }, [selectedDayId, routeShown, routeProfile, mergedItemsMap, accommodations, days, optimizeFromAccommodation])

  const openAddNote = (dayId, e) => {
    e?.stopPropagation()
    _openAddNote(dayId, getMergedItems, (id) => {
      if (!expandedDays.has(id)) setExpandedDays(prev => new Set([...prev, id]))
    })
  }

  // Check if a proposed reorder of place IDs would break chronological order
  // of ALL timed items (places with time + transport bookings)
  const wouldBreakChronology = (dayId: number, newPlaceIds: number[]) => {
    const da = getDayAssignments(dayId)
    const transport = getTransportForDay(dayId)

    // Simulate the merged list with places in new order + transports at their positions
    // Places get sequential integer positions
    const simItems: { pos: number; minutes: number }[] = []
    newPlaceIds.forEach((id, idx) => {
      const a = da.find(x => x.id === id)
      const m = parseTimeToMinutes(a?.place?.place_time)
      if (m !== null) simItems.push({ pos: idx, minutes: m })
    })

    // Transports: compute where they'd go with the new place order
    for (const r of transport) {
      const rMin = parseTimeToMinutes(r.reservation_time)
      if (rMin === null) continue
      // Find the last place (in new order) with time <= transport time
      let afterIdx = -1
      newPlaceIds.forEach((id, idx) => {
        const a = da.find(x => x.id === id)
        const pm = parseTimeToMinutes(a?.place?.place_time)
        if (pm !== null && pm <= rMin) afterIdx = idx
      })
      const pos = afterIdx >= 0 ? afterIdx + 0.5 : newPlaceIds.length + 0.5
      simItems.push({ pos, minutes: rMin })
    }

    // Sort by position and check chronological order
    simItems.sort((a, b) => a.pos - b.pos)
    return !simItems.every((item, i) => i === 0 || item.minutes >= simItems[i - 1].minutes)
  }

  const openEditNote = (dayId: number, note, e?: React.MouseEvent) => {
    e?.stopPropagation()
    _openEditNote(dayId, note)
  }

  // Deleting a note asks for confirmation first — the edit/delete icons sit close together and are
  // easy to mis-tap on touch devices, where an accidental delete was previously unrecoverable.
  const [pendingDeleteNote, setPendingDeleteNote] = useState<{ dayId: number; noteId: number } | null>(null)

  const deleteNote = async (dayId: number, noteId: number, e?: React.MouseEvent) => {
    e?.stopPropagation()
    await _deleteNote(dayId, noteId)
  }

  // Unified reorder: assigns positions to ALL item types based on new visual order
  const applyMergedOrder = async (dayId: number, newOrder: { type: string; data: any }[]) => {
    // Capture previous place order for undo
    const prevAssignmentIds = getDayAssignments(dayId).map(a => a.id)

    // Places get sequential integer positions (0, 1, 2, ...)
    // Non-place items between place N-1 and place N get fractional positions
    const assignmentIds: number[] = []
    const noteUpdates: { id: number; sort_order: number }[] = []
    const transportUpdates: { id: number; day_plan_position: number }[] = []
    // Multi-leg flight legs share a reservation id, so their positions can't live in
    // the single per-booking slot — collect them per leg, keyed reservationId → legIndex → pos.
    const legPosUpdates: Record<number, Record<number, number>> = {}

    let placeCount = 0
    let i = 0
    while (i < newOrder.length) {
      if (newOrder[i].type === 'place') {
        assignmentIds.push(newOrder[i].data.id)
        placeCount++
        i++
      } else {
        // Collect consecutive non-place items
        const group: { type: string; data: any }[] = []
        while (i < newOrder.length && newOrder[i].type !== 'place') {
          group.push(newOrder[i])
          i++
        }
        // Fractional positions between (placeCount-1) and placeCount
        const base = placeCount > 0 ? placeCount - 1 : -1
        group.forEach((g, idx) => {
          const pos = base + (idx + 1) / (group.length + 1)
          if (g.type === 'note') noteUpdates.push({ id: g.data.id, sort_order: pos })
          else if (g.type === 'transport') {
            if (g.data.__leg) ((legPosUpdates[g.data.id] ??= {})[g.data.__leg.index] = pos)
            else transportUpdates.push({ id: g.data.id, day_plan_position: pos })
          }
        })
      }
    }

    try {
      // Update transport positions in store FIRST so the useEffect triggered by
      // onReorder's optimistic assignment update reads the correct positions.
      if (transportUpdates.length) {
        useTripStore.setState(state => ({
          reservations: state.reservations.map(r => {
            const tu = transportUpdates.find(u => u.id === r.id)
            if (!tu) return r
            const day_positions = { ...(r.day_positions || {}), [dayId]: tu.day_plan_position }
            return { ...r, day_plan_position: tu.day_plan_position, day_positions }
          })
        }))
        setTransportPosVersion(v => v + 1)
      }
      // Per-leg positions of multi-leg flights live in metadata.legs[i].day_positions
      // (the single per-booking slot can't hold one position per leg).
      const legResIds = Object.keys(legPosUpdates)
      if (legResIds.length) {
        for (const ridStr of legResIds) {
          const rid = Number(ridStr)
          const r = useTripStore.getState().reservations.find(x => x.id === rid)
          if (!r) continue
          let parsed: any = {}
          try { parsed = typeof r.metadata === 'string' ? JSON.parse(r.metadata || '{}') : (r.metadata || {}) } catch { parsed = {} }
          if (!Array.isArray(parsed.legs)) continue
          const legs = parsed.legs.map((leg: any, i: number) => {
            const pos = legPosUpdates[rid][i]
            return pos == null ? leg : { ...leg, day_positions: { ...(leg.day_positions || {}), [dayId]: pos } }
          })
          // Send metadata as an OBJECT (like the form does) — passing a JSON string
          // here double-encodes it on the server, which wipes metadata.legs on read
          // and collapses the flight back to a single span.
          const newMeta = { ...parsed, legs }
          useTripStore.setState(state => ({ reservations: state.reservations.map(x => (x.id === rid ? { ...x, metadata: newMeta } : x)) }))
          await tripActions.updateReservation(tripId, rid, { metadata: newMeta })
        }
        setTransportPosVersion(v => v + 1)
      }
      if (assignmentIds.length) await onReorder(dayId, assignmentIds)
      if (transportUpdates.length) {
        onRouteRefresh?.()
        await reservationsApi.updatePositions(tripId, transportUpdates, dayId)
      }
      for (const n of noteUpdates) {
        await tripActions.updateDayNote(tripId, dayId, n.id, { sort_order: n.sort_order })
      }
      if (prevAssignmentIds.length) {
        const capturedDayId = dayId
        const capturedPrevIds = prevAssignmentIds
        pushUndo?.(t('undo.reorder'), async () => {
          await tripActions.reorderAssignments(tripId, capturedDayId, capturedPrevIds)
        })
      }
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : t('common.unknownError')) }
  }

  const handleMergedDrop = async (dayId, fromType, fromId, toType, toId, insertAfter = false, toLegIndex = null) => {
    const m = getMergedItems(dayId)
    // Multi-leg flights expose one item per leg sharing the same reservation id;
    // disambiguate the drop target by leg index so you can drop BETWEEN legs.
    const matchTo = (i: any) => i.type === toType && i.data.id === toId && (toLegIndex == null || i.data?.__leg?.index === toLegIndex)

    // Check if a timed place is being moved → would it break chronological order?
    if (fromType === 'place') {
      const fromItem = m.find(i => i.type === 'place' && i.data.id === fromId)
      const fromMinutes = parseTimeToMinutes(fromItem?.data?.place?.place_time)
      if (fromItem && fromMinutes !== null) {
        const fromIdx = m.findIndex(i => i.type === fromType && i.data.id === fromId)
        const toIdx = m.findIndex(matchTo)
        if (fromIdx !== -1 && toIdx !== -1) {
          const simulated = [...m]
          const [moved] = simulated.splice(fromIdx, 1)
          let insertIdx = simulated.findIndex(matchTo)
          if (insertIdx === -1) insertIdx = simulated.length
          if (insertAfter) insertIdx += 1
          simulated.splice(insertIdx, 0, moved)

          const timedInOrder = simulated
            .map(i => {
              if (i.type === 'transport') return parseTimeToMinutes(i.data?.reservation_time)
              if (i.type === 'place') return parseTimeToMinutes(i.data?.place?.place_time)
              return null
            })
            .filter(t => t !== null)
          const isChronological = timedInOrder.every((t, i) => i === 0 || t >= timedInOrder[i - 1])

          if (!isChronological) {
            const placeTime = fromItem.data.place.place_time
            const timeStr = placeTime.includes(':') ? placeTime.substring(0, 5) : placeTime
            setTimeConfirm({ dayId, fromType, fromId, toType, toId, insertAfter, toLegIndex, time: timeStr })
            setDraggingId(null); setDropTargetKey(null); dragDataRef.current = null
            return
          }
        }
      }
    }

    // Build new order: remove the dragged item, insert at target position
    const fromIdx = m.findIndex(i => i.type === fromType && i.data.id === fromId)
    const toIdx = m.findIndex(matchTo)
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) {
      setDraggingId(null); setDropTargetKey(null); dragDataRef.current = null
      return
    }

    const newOrder = [...m]
    const [moved] = newOrder.splice(fromIdx, 1)
    let adjustedTo = newOrder.findIndex(matchTo)
    if (adjustedTo === -1) adjustedTo = newOrder.length
    if (insertAfter) adjustedTo += 1
    newOrder.splice(adjustedTo, 0, moved)

    await applyMergedOrder(dayId, newOrder)
    setDraggingId(null)
    setDropTargetKey(null)
    dragDataRef.current = null
  }

  const confirmTimeRemoval = async () => {
    if (!timeConfirm) return
    const saved = { ...timeConfirm }
    const { dayId, fromId, reorderIds, fromType, toType, toId, insertAfter, toLegIndex } = saved
    setTimeConfirm(null)

    // Remove time from assignment
    try {
      await assignmentsApi.updateTime(tripId, fromId, { place_time: null, end_time: null })
      const key = String(dayId)
      const currentAssignments = { ...assignments }
      if (currentAssignments[key]) {
        currentAssignments[key] = currentAssignments[key].map(a =>
          a.id === fromId ? { ...a, place: { ...a.place, place_time: null, end_time: null } } : a
        )
        tripActions.setAssignments(currentAssignments)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.unknownError'))
      return
    }

    // Build new merged order from either arrow reorderIds or drag & drop params
    const m = getMergedItems(dayId)

    if (reorderIds) {
      // Arrow reorder: rebuild merged list with places in the new order,
      // keeping transports and notes at their relative positions
      const newMerged: typeof m = []
      let rIdx = 0
      for (const item of m) {
        if (item.type === 'place') {
          // Replace with the place from reorderIds at this position
          const nextId = reorderIds[rIdx++]
          const replacement = m.find(i => i.type === 'place' && i.data.id === nextId)
          if (replacement) newMerged.push(replacement)
        } else {
          newMerged.push(item)
        }
      }
      await applyMergedOrder(dayId, newMerged)
      return
    }

    // Drag & drop reorder
    if (fromType && toType) {
      const matchTo = (i: any) => i.type === toType && i.data.id === toId && (toLegIndex == null || i.data?.__leg?.index === toLegIndex)
      const fromIdx = m.findIndex(i => i.type === fromType && i.data.id === fromId)
      const toIdx = m.findIndex(matchTo)
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return

      const newOrder = [...m]
      const [moved] = newOrder.splice(fromIdx, 1)
      let adjustedTo = newOrder.findIndex(matchTo)
      if (adjustedTo === -1) adjustedTo = newOrder.length
      if (insertAfter) adjustedTo += 1
      newOrder.splice(adjustedTo, 0, moved)

      await applyMergedOrder(dayId, newOrder)
    }
  }

  const moveNote = async (dayId, noteId, direction) => {
    await _moveNote(dayId, noteId, direction, getMergedItems)
  }

  const startEditTitle = (day, e) => {
    e.stopPropagation()
    setEditTitle(day.title || '')
    setEditingDayId(day.id)
  }

  const saveTitle = async (dayId) => {
    setEditingDayId(null)
    await onUpdateDayTitle?.(dayId, editTitle.trim())
  }

  const handleCalculateRoute = async () => {
    if (!selectedDayId) return
    const da = getDayAssignments(selectedDayId)
    const waypoints = da.map(a => a.place).filter((p): p is NonNullable<typeof p> => !!(p?.lat && p?.lng)).map(p => ({ lat: p.lat as number, lng: p.lng as number }))
    if (waypoints.length < 2) { toast.error(t('dayplan.toast.needTwoPlaces')); return }
    setIsCalculating(true)
    try {
      const result = await calculateRoute(waypoints, 'walking')
      // Luftlinien zwischen Wegpunkten anzeigen
      const lineCoords = waypoints.map(p => [p.lat, p.lng] as [number, number])
      setRouteInfo({ distance: result.distanceText, duration: result.durationText })
      onRouteCalculated?.({ ...result, coordinates: lineCoords })
    } catch { toast.error(t('dayplan.toast.routeError')) }
    finally { setIsCalculating(false) }
  }

  const toggleLock = (assignmentId) => {
    const prevLocked = new Set(lockedIds)
    setLockedIds(prev => {
      const next = new Set(prev)
      if (next.has(assignmentId)) next.delete(assignmentId)
      else next.add(assignmentId)
      return next
    })
    pushUndo?.(t('undo.lock'), () => { setLockedIds(prevLocked) })
  }

  const handleOptimize = async (dayId: number | null = selectedDayId) => {
    if (!dayId) return
    const da = getDayAssignments(dayId)
    if (da.length < 3) return

    const prevIds = da.map(a => a.id)

    // Separate fixed (stay at their index) and movable assignments. A place is
    // fixed if it's locked OR has a set time — timed places are anchored by their
    // time, so the optimizer must not reshuffle them.
    const locked = new Map<number, Assignment>() // index -> assignment
    const unlocked: Assignment[] = []
    da.forEach((a: Assignment, i: number) => {
      if (lockedIds.has(a.id) || a.place?.place_time) locked.set(i, a)
      else unlocked.push(a)
    })

    // Optimize only unlocked assignments (work on assignments, not places)
    const unlockedWithCoords = unlocked.filter(a => a.place?.lat && a.place?.lng)
    const unlockedNoCoords = unlocked.filter(a => !a.place?.lat || !a.place?.lng)
    // Anchor the route on the day's accommodation (when enabled): a loop out from and back to the
    // hotel, or — on a transfer day — a run from the hotel you leave to the one you arrive at.
    const day = days.find(d => d.id === dayId)
    const anchors = day && useSettingsStore.getState().settings.optimize_from_accommodation !== false
      ? getAccommodationAnchors(day, days, accommodations)
      : {}
    const optimizedAssignments = unlockedWithCoords.length >= 2
      ? optimizeRoute(unlockedWithCoords.map(a => ({ id: a.place!.id, name: a.place!.name, _assignmentId: a.id, lat: a.place!.lat as number, lng: a.place!.lng as number })), anchors).map(p => unlockedWithCoords.find(a => a.id === p._assignmentId)).filter(Boolean)
      : unlockedWithCoords
    const optimizedQueue = [...optimizedAssignments, ...unlockedNoCoords]

    // Merge: locked stay at their index, fill gaps with optimized
    const result = new Array(da.length)
    locked.forEach((a, i) => { result[i] = a })
    let qi = 0
    for (let i = 0; i < result.length; i++) {
      if (!result[i]) result[i] = optimizedQueue[qi++]
    }

    await onReorder(dayId, result.map(a => a.id))
    const usedHotel = !!(anchors.start || anchors.end)
    toast.success(usedHotel ? t('dayplan.toast.routeOptimizedFromHotel') : t('dayplan.toast.routeOptimized'))
    const capturedDayId = dayId
    pushUndo?.(t('undo.optimize'), async () => {
      await tripActions.reorderAssignments(tripId, capturedDayId, prevIds)
    })
  }


  const handleDropOnDay = (e, dayId) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverDayId(null)
    const { placeId, assignmentId, noteId, reservationId: fromReservationId, fromDayId, phase } = getDragData(e)
    if (fromReservationId && fromDayId !== dayId) {
      const r = reservations.find(x => x.id === Number(fromReservationId))
      if (r) { const update = computeMultiDayMove(r, dayId, phase); tripActions.updateReservation(tripId, r.id, update).catch((err: unknown) => toast.error(err instanceof Error ? err.message : t('common.unknownError'))) }
      setDraggingId(null); setDropTargetKey(null); dragDataRef.current = null; window.__dragData = null; return
    }
    if (placeId) {
      onAssignToDay?.(parseInt(placeId), dayId)
    } else if (assignmentId && fromDayId !== dayId) {
      const srcAssignment = (useTripStore.getState().assignments[String(fromDayId)] || []).find(a => a.id === Number(assignmentId))
      const capturedFromDayId = fromDayId
      const capturedOrderIndex = srcAssignment?.order_index ?? 0
      tripActions.moveAssignment(tripId, Number(assignmentId), fromDayId, dayId)
        .then(() => {
          pushUndo?.(t('undo.moveDay'), async () => {
            await tripActions.moveAssignment(tripId, Number(assignmentId), dayId, capturedFromDayId, capturedOrderIndex)
          })
        })
        .catch((err: unknown) => toast.error(err instanceof Error ? err.message : t('common.unknownError')))
    } else if (noteId && fromDayId !== dayId) {
      tripActions.moveDayNote(tripId, fromDayId, dayId, Number(noteId)).catch((err: unknown) => toast.error(err instanceof Error ? err.message : t('common.unknownError')))
    }
    setDraggingId(null)
    setDropTargetKey(null)
    dragDataRef.current = null
    window.__dragData = null
  }

  const handleDropOnRow = (e, dayId, toIdx) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverDayId(null)
    const placeId = e.dataTransfer.getData('placeId')
    const fromAssignmentId = e.dataTransfer.getData('assignmentId')

    if (placeId) {
      onAssignToDay?.(parseInt(placeId), dayId)
    } else if (fromAssignmentId) {
      const da = getDayAssignments(dayId)
      const fromIdx = da.findIndex(a => String(a.id) === fromAssignmentId)
      if (fromIdx === -1 || fromIdx === toIdx) { setDraggingId(null); dragDataRef.current = null; return }
      const ids = da.map(a => a.id)
      const [removed] = ids.splice(fromIdx, 1)
      ids.splice(toIdx, 0, removed)
      onReorder(dayId, ids)
    }
    setDraggingId(null)
  }

  const totalCost = useMemo(() => days.reduce((s, d) => {
    const da = assignments[String(d.id)] || []
    return s + da.reduce((s2, a) => s2 + (Number(a.place?.price) || 0), 0)
  }, 0), [days, assignments])

  // Bester verfügbarer Standort für Wetter: zugewiesene Orte zuerst, dann beliebiger Reiseort
  const anyGeoAssignment = Object.values(assignments).flatMap(da => da).find(a => a.place?.lat && a.place?.lng)
  const anyGeoPlace = anyGeoAssignment || (places || []).find(p => p.lat && p.lng)

  // Register row element for auto-scroll-on-select. Called from PlaceRow via ref callback.
  const registerAutoScrollRef = (assignmentId: number, el: HTMLDivElement | null, isSelected: boolean) => {
    if (el && isSelected && lastAutoScrolledIdRef.current !== assignmentId) {
      const rect = el.getBoundingClientRect()
      const nearTop = rect.top < 80
      const nearBottom = rect.bottom > window.innerHeight - 80
      if (nearTop || nearBottom) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      lastAutoScrolledIdRef.current = assignmentId
    }
  }

  return {
    tripId,
    trip,
    days,
    places,
    categories,
    assignments,
    selectedDayId,
    selectedPlaceId,
    selectedAssignmentId,
    onSelectDay,
    onPlaceClick,
    onDayDetail,
    accommodations,
    onReorder,
    onReorderDays,
    onAddDay,
    onUpdateDayTitle,
    onRouteCalculated,
    onAssignToDay,
    onRemoveAssignment,
    onEditPlace,
    onDeletePlace,
    reservations,
    visibleConnectionIds,
    onToggleConnection,
    externalTransportDetail,
    onExternalTransportDetailHandled,
    onAddReservation,
    onAddPlace,
    onAddPlaceToDay,
    onNavigateToFiles,
    routeShown,
    routeProfile,
    onToggleRoute,
    onSetRouteProfile,
    onExpandedDaysChange,
    pushUndo,
    canUndo,
    lastActionLabel,
    onUndo,
    onRouteRefresh,
    onAddTransport,
    onEditTransport,
    onEditReservation,
    onAddBookingToAssignment,
    initialScrollTop,
    onScrollTopChange,
    showRouteToolsWhenExpanded,
    toast,
    t,
    language,
    locale,
    ctxMenu,
    timeFormat,
    tripActions,
    can,
    canEditDays,
    noteUi,
    setNoteUi,
    noteInputRef,
    dayNotes,
    openAddNote,
    openEditNote,
    cancelNote,
    saveNote,
    deleteNote,
    pendingDeleteNote,
    setPendingDeleteNote,
    moveNote,
    expandedDays,
    setExpandedDays,
    editingDayId,
    setEditingDayId,
    editTitle,
    setEditTitle,
    isCalculating,
    setIsCalculating,
    routeInfo,
    setRouteInfo,
    routeLegs,
    setRouteLegs,
    hotelLegs,
    setHotelLegs,
    legsAbortRef,
    draggingId,
    setDraggingId,
    lockedIds,
    setLockedIds,
    lockHoverId,
    setLockHoverId,
    undoHover,
    setUndoHover,
    pdfHover,
    setPdfHover,
    icsHover,
    setIcsHover,
    hoveredAssignmentId,
    setHoveredAssignmentId,
    dropTargetKey,
    _setDropTargetKey,
    dropTargetRef,
    setDropTargetKey,
    dragOverDayId,
    setDragOverDayId,
    transportDetail,
    setTransportDetail,
    transportPosVersion,
    setTransportPosVersion,
    timeConfirm,
    setTimeConfirm,
    inputRef,
    dragDataRef,
    scrollContainerRef,
    initedTransportIds,
    lastAutoScrolledIdRef,
    currency,
    getDragData,
    prevDayCount,
    toggleDay,
    getSpanLabel,
    getDayOrder,
    computeMultiDayMove,
    getTransportForDay,
    getActiveRentalsForDay,
    getDayAssignments,
    computeTransportPosition,
    initTransportPositions,
    getMergedItems,
    mergedItemsMap,
    wouldBreakChronology,
    applyMergedOrder,
    handleMergedDrop,
    confirmTimeRemoval,
    startEditTitle,
    saveTitle,
    handleCalculateRoute,
    toggleLock,
    handleOptimize,
    handleDropOnDay,
    handleDropOnRow,
    totalCost,
    anyGeoAssignment,
    anyGeoPlace,
    registerAutoScrollRef,
  }
}

const DayPlanSidebar = React.memo(function DayPlanSidebar(props: DayPlanSidebarProps) {
  const S = useDayPlanSidebar(props)
  const {
    tripId,
    trip,
    days,
    places,
    categories,
    assignments,
    selectedDayId,
    selectedPlaceId,
    selectedAssignmentId,
    onSelectDay,
    onPlaceClick,
    onDayDetail,
    accommodations,
    onReorder,
    onReorderDays,
    onAddDay,
    onUpdateDayTitle,
    onRouteCalculated,
    onAssignToDay,
    onRemoveAssignment,
    onEditPlace,
    onDeletePlace,
    reservations,
    visibleConnectionIds,
    onToggleConnection,
    externalTransportDetail,
    onExternalTransportDetailHandled,
    onAddReservation,
    onAddPlace,
    onAddPlaceToDay,
    onNavigateToFiles,
    routeShown,
    routeProfile,
    onToggleRoute,
    onSetRouteProfile,
    onExpandedDaysChange,
    pushUndo,
    canUndo,
    lastActionLabel,
    onUndo,
    onRouteRefresh,
    onAddTransport,
    onEditTransport,
    onEditReservation,
    onAddBookingToAssignment,
    initialScrollTop,
    onScrollTopChange,
    showRouteToolsWhenExpanded,
    toast,
    t,
    language,
    locale,
    ctxMenu,
    timeFormat,
    tripActions,
    can,
    canEditDays,
    noteUi,
    setNoteUi,
    noteInputRef,
    dayNotes,
    openAddNote,
    openEditNote,
    cancelNote,
    saveNote,
    deleteNote,
    pendingDeleteNote,
    setPendingDeleteNote,
    moveNote,
    expandedDays,
    setExpandedDays,
    editingDayId,
    setEditingDayId,
    editTitle,
    setEditTitle,
    isCalculating,
    setIsCalculating,
    routeInfo,
    setRouteInfo,
    routeLegs,
    setRouteLegs,
    hotelLegs,
    setHotelLegs,
    legsAbortRef,
    draggingId,
    setDraggingId,
    lockedIds,
    setLockedIds,
    lockHoverId,
    setLockHoverId,
    undoHover,
    setUndoHover,
    pdfHover,
    setPdfHover,
    icsHover,
    setIcsHover,
    hoveredAssignmentId,
    setHoveredAssignmentId,
    dropTargetKey,
    _setDropTargetKey,
    dropTargetRef,
    setDropTargetKey,
    dragOverDayId,
    setDragOverDayId,
    transportDetail,
    setTransportDetail,
    transportPosVersion,
    setTransportPosVersion,
    timeConfirm,
    setTimeConfirm,
    inputRef,
    dragDataRef,
    scrollContainerRef,
    initedTransportIds,
    lastAutoScrolledIdRef,
    currency,
    getDragData,
    prevDayCount,
    toggleDay,
    getSpanLabel,
    getDayOrder,
    computeMultiDayMove,
    getTransportForDay,
    getActiveRentalsForDay,
    getDayAssignments,
    computeTransportPosition,
    initTransportPositions,
    getMergedItems,
    mergedItemsMap,
    wouldBreakChronology,
    applyMergedOrder,
    handleMergedDrop,
    confirmTimeRemoval,
    startEditTitle,
    saveTitle,
    handleCalculateRoute,
    toggleLock,
    handleOptimize,
    handleDropOnDay,
    handleDropOnRow,
    totalCost,
    anyGeoAssignment,
    anyGeoPlace,
    registerAutoScrollRef,
  } = S
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', fontFamily: "var(--font-system)" }}>
      {/* Toolbar */}
      <DayPlanSidebarToolbar
        tripId={tripId}
        trip={trip}
        days={days}
        places={places}
        categories={categories}
        assignments={assignments}
        reservations={reservations}
        dayNotes={dayNotes}
        t={t}
        locale={locale}
        toast={toast}
        pdfHover={pdfHover}
        setPdfHover={setPdfHover}
        icsHover={icsHover}
        setIcsHover={setIcsHover}
        expandedDays={expandedDays}
        setExpandedDays={setExpandedDays}
        onUndo={onUndo}
        canUndo={canUndo}
        undoHover={undoHover}
        setUndoHover={setUndoHover}
        lastActionLabel={lastActionLabel}
        canEditDays={canEditDays}
        onReorderDays={onReorderDays}
        onAddDay={onAddDay}
      />

      {/* Tagesliste */}
      <div className={`scroll-container${draggingId ? '' : ' memove-stagger'}`} style={{ flex: 1, overflowY: 'auto', minHeight: 0 }} ref={scrollContainerRef} onScroll={(e) => onScrollTopChange?.((e.currentTarget as HTMLElement).scrollTop)}>
        {days.map((day, index) => {
          const isSelected = selectedDayId === day.id
          const isExpanded = expandedDays.has(day.id)
          const da = getDayAssignments(day.id)
          const cost = dayTotalCost(day.id, assignments, currency)
          const formattedDate = formatDate(day.date, locale)
          const loc = da.find(a => a.place?.lat && a.place?.lng)
          const isDragTarget = dragOverDayId === day.id
          const merged = mergedItemsMap[day.id] || []
          const dayNoteUi = noteUi[day.id]

          return (
            <div key={day.id} style={{ borderBottom: '1px solid var(--border-faint)' }}>
              <DayPlanSidebarDayHeader
                day={day}
                index={index}
                isSelected={isSelected}
                isExpanded={isExpanded}
                isDragTarget={isDragTarget}
                formattedDate={formattedDate}
                loc={loc}
                anyGeoPlace={anyGeoPlace}
                cost={cost}
                editingDayId={editingDayId}
                editTitle={editTitle}
                setEditTitle={setEditTitle}
                setEditingDayId={setEditingDayId}
                saveTitle={saveTitle}
                inputRef={inputRef}
                accommodations={accommodations ?? []}
                days={days}
                onSelectDay={onSelectDay}
                onDayDetail={onDayDetail}
                onPlaceClick={onPlaceClick}
                setTransportDetail={setTransportDetail}
                canEditDays={canEditDays}
                startEditTitle={startEditTitle}
                openAddNote={openAddNote}
                toggleDay={toggleDay}
                onAddTransport={onAddTransport}
                handleDropOnDay={handleDropOnDay}
                dragOverDayId={dragOverDayId}
                setDragOverDayId={setDragOverDayId}
                getActiveRentalsForDay={getActiveRentalsForDay}
                t={t}
              />

              <DayPlanSidebarExpandedBody
                day={day}
                isSelected={isSelected}
                isExpanded={isExpanded}
                merged={merged}
                showRouteToolsWhenExpanded={showRouteToolsWhenExpanded}
                routeLegs={routeLegs}
                hotelLegs={hotelLegs}
                routeProfile={routeProfile ?? 'driving'}
                routeShown={routeShown ?? false}
                routeInfo={routeInfo}
                dayAssignments={da}
                getDayAssignments={getDayAssignments}
                draggingId={draggingId}
                dropTargetKey={dropTargetKey}
                dropTargetRef={dropTargetRef}
                setDraggingId={setDraggingId}
                setDragOverDayId={setDragOverDayId}
                setDropTargetKey={setDropTargetKey}
                dragOverDayId={dragOverDayId}
                canEditDays={canEditDays}
                handleDropOnDay={handleDropOnDay}
                getDragData={getDragData}
                dayNoteUi={dayNoteUi}
                t={t}
                dragDataRef={dragDataRef}
                categories={categories}
                reservations={reservations ?? []}
                places={places}
                tripId={tripId}
                onAssignToDay={onAssignToDay}
                onPlaceClick={onPlaceClick}
                onSelectDay={onSelectDay}
                onEditPlace={onEditPlace}
                onDeletePlace={onDeletePlace}
                onRemoveAssignment={onRemoveAssignment}
                onEditTransport={onEditTransport}
                onEditReservation={onEditReservation}
                onAddBookingToAssignment={onAddBookingToAssignment}
                onAddPlace={onAddPlace}
                onToggleRoute={onToggleRoute}
                onSetRouteProfile={onSetRouteProfile}
                onToggleConnection={onToggleConnection}
                visibleConnectionIds={visibleConnectionIds}
                selectedAssignmentId={selectedAssignmentId}
                selectedPlaceId={selectedPlaceId}
                lockedIds={lockedIds}
                lockHoverId={lockHoverId}
                hoveredAssignmentId={hoveredAssignmentId}
                computeMultiDayMove={computeMultiDayMove}
                handleMergedDrop={handleMergedDrop}
                applyMergedOrder={applyMergedOrder}
                setTimeConfirm={setTimeConfirm}
                toggleLock={toggleLock}
                handleOptimize={handleOptimize}
                setHoveredAssignmentId={setHoveredAssignmentId}
                setLockHoverId={setLockHoverId}
                getMergedItems={getMergedItems}
                setArrowTimeConfirm={(v) => setTimeConfirm(v as any)}
                moveNote={moveNote}
                openEditNote={openEditNote}
                setPendingDeleteNote={setPendingDeleteNote}
                tripActions={tripActions}
                toast={toast}
                locale={locale}
                timeFormat={timeFormat}
                ctxMenu={ctxMenu}
                registerAutoScrollRef={registerAutoScrollRef}
              />
            </div>
          )
        })}
      </div>

      {/* Notiz-Popup-Modal — über Portal gerendert, um den backdropFilter-Stapelkontext zu umgehen */}
      <DayPlanSidebarNoteModal
        noteUi={noteUi}
        setNoteUi={setNoteUi}
        noteInputRef={noteInputRef}
        cancelNote={cancelNote}
        saveNote={saveNote}
        t={t}
      />

      {/* Confirm: remove time when reordering a timed place */}
      <DayPlanSidebarTimeConfirmModal
        timeConfirm={timeConfirm}
        setTimeConfirm={setTimeConfirm}
        confirmTimeRemoval={confirmTimeRemoval}
        t={t}
      />

      {/* Confirm: delete a day note — guards against accidental taps on touch devices */}
      <ConfirmDialog
        isOpen={!!pendingDeleteNote}
        onClose={() => setPendingDeleteNote(null)}
        onConfirm={() => { if (pendingDeleteNote) deleteNote(pendingDeleteNote.dayId, pendingDeleteNote.noteId) }}
        title={t('dayplan.confirmDeleteNoteTitle')}
        message={t('dayplan.confirmDeleteNoteBody')}
      />

      {/* Transport-Detail-Modal */}
      <DayPlanSidebarTransportDetailModal
        transportDetail={transportDetail}
        setTransportDetail={setTransportDetail}
        onNavigateToFiles={onNavigateToFiles}
        t={t}
        locale={locale}
        timeFormat={timeFormat}
      />

      {/* Budget-Fußzeile */}
      <DayPlanSidebarFooter totalCost={totalCost} currency={currency} t={t} />
      <ContextMenu menu={ctxMenu.menu} onClose={ctxMenu.close} />
    </div>
  )
})

export default DayPlanSidebar