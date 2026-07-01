// ponytail: extracted from DayPlanSidebar.tsx
import React from 'react'
import { ChevronUp, ChevronDown, GripVertical, Pencil, Trash2 } from 'lucide-react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useContextMenu } from '../shared/ContextMenu'
import { getNoteIcon } from './DayPlanSidebar.constants'
import type { DayNote, Reservation } from '../../types'

interface DayPlanSidebarNoteRowProps {
  note: DayNote
  dayId: number
  idx: number
  mergedLength: number
  draggingId: any
  showDropLine: boolean
  canEditDays: boolean
  dragDataRef: React.MutableRefObject<{ placeId?: string; assignmentId?: string; noteId?: string; reservationId?: string; fromDayId?: string; phase?: 'single' | 'start' | 'middle' | 'end' } | null>
  reservations: Reservation[]
  tripId: number
  onAssignToDay?: ((placeId: number, dayId: number, position?: number) => void) | undefined
  openEditNote: (dayId: number, note: DayNote, e?: React.MouseEvent) => void
  setPendingDeleteNote: (v: { dayId: number; noteId: number } | null) => void
  handleMergedDrop: (dayId: number, fromType: string, fromId: number, toType: string, toId: number, insertAfter?: boolean, toLegIndex?: number | null) => Promise<void>
  getMergedItems: (dayId: number) => any[]
  setDraggingId: (v: any) => void
  setDropTargetKey: (v: string | null) => void
  dropTargetKey: string | null
  computeMultiDayMove: (r: Reservation, targetDayId: number, phase: 'single' | 'start' | 'middle' | 'end') => any
  moveNote: (dayId: number, noteId: number, direction: 'up' | 'down') => void
  tripActions: { updateReservation: (tripId: number, id: number, data: any) => Promise<any>; moveAssignment: (...args: any[]) => Promise<any>; moveDayNote: (...args: any[]) => Promise<any> }
  toast: { error: (msg: string) => void }
  t: (key: string, params?: Record<string, any>) => string
  ctxMenu: ReturnType<typeof useContextMenu>
}

export function DayPlanSidebarNoteRow({
  note, dayId, idx, mergedLength, draggingId, showDropLine, canEditDays,
  dragDataRef, reservations, tripId, onAssignToDay,
  openEditNote, setPendingDeleteNote, handleMergedDrop, getMergedItems,
  setDraggingId, setDropTargetKey, dropTargetKey, computeMultiDayMove, moveNote,
  tripActions, toast, t, ctxMenu,
}: DayPlanSidebarNoteRowProps) {
  const NoteIcon = getNoteIcon(note.icon)

  return (
    <React.Fragment key={`note-${note.id}`}>
      <div
        draggable={canEditDays}
        onDragStart={e => { if (!canEditDays) { e.preventDefault(); return } e.dataTransfer.setData('noteId', String(note.id)); e.dataTransfer.setData('fromDayId', String(dayId)); e.dataTransfer.effectAllowed = 'move'; dragDataRef.current = { noteId: String(note.id), fromDayId: String(dayId) }; setDraggingId(`note-${note.id}`) }}
        onDragEnd={() => { setDraggingId(null); setDropTargetKey(null); dragDataRef.current = null }}
        onDragOver={e => { e.preventDefault(); e.stopPropagation(); if (dropTargetKey !== `note-${note.id}`) setDropTargetKey(`note-${note.id}`) }}
        onDrop={e => {
          e.preventDefault(); e.stopPropagation()
          const { placeId, noteId: fromNoteId, assignmentId: fromAssignmentId, reservationId: fromReservationId, fromDayId, phase } = readDragData(dragDataRef, e)
          if (placeId) {
            // New place dropped onto a note: insert it among the assignments at the note's position.
            const tm = getMergedItems(dayId)
            const noteIdx = tm.findIndex(i => i.type === 'note' && i.data.id === note.id)
            const pos = tm.slice(0, noteIdx).filter(i => i.type === 'place').length
            onAssignToDay?.(parseInt(placeId), dayId, pos)
            setDropTargetKey(null); window.__dragData = null
          } else if (fromReservationId && fromDayId !== dayId) {
            const r = reservations.find(x => x.id === Number(fromReservationId))
            if (r) { const update = computeMultiDayMove(r, dayId, phase); tripActions.updateReservation(tripId, r.id, update).catch((err: unknown) => toast.error(err instanceof Error ? err.message : t('common.unknownError'))) }
            setDraggingId(null); setDropTargetKey(null); dragDataRef.current = null
          } else if (fromReservationId) {
            handleMergedDrop(dayId, 'transport', Number(fromReservationId), 'note', note.id)
          } else if (fromNoteId && fromDayId !== dayId) {
            const tm = getMergedItems(dayId)
            const toIdx = tm.findIndex(i => i.type === 'note' && i.data.id === note.id)
            const so = toIdx <= 0 ? (tm[0]?.sortKey ?? 0) - 1 : (tm[toIdx - 1].sortKey + tm[toIdx].sortKey) / 2
            tripActions.moveDayNote(tripId, fromDayId, dayId, Number(fromNoteId), so).catch((err: unknown) => toast.error(err instanceof Error ? err.message : t('common.unknownError')))
            setDraggingId(null); setDropTargetKey(null)
          } else if (fromNoteId && fromNoteId !== String(note.id)) {
            handleMergedDrop(dayId, 'note', Number(fromNoteId), 'note', note.id)
          } else if (fromAssignmentId && fromDayId !== dayId) {
            const tm = getMergedItems(dayId)
            const noteIdx = tm.findIndex(i => i.type === 'note' && i.data.id === note.id)
            const toIdx = tm.slice(0, noteIdx).filter(i => i.type === 'place').length
            tripActions.moveAssignment(tripId, Number(fromAssignmentId), fromDayId, dayId, toIdx).catch((err: unknown) => toast.error(err instanceof Error ? err.message : t('common.unknownError')))
            setDraggingId(null); setDropTargetKey(null)
          } else if (fromAssignmentId) {
            handleMergedDrop(dayId, 'place', Number(fromAssignmentId), 'note', note.id)
          }
        }}
        onContextMenu={canEditDays ? e => ctxMenu.open(e, [
          { label: t('common.edit'), icon: Pencil, onClick: () => openEditNote(dayId, note) },
          { divider: true },
          { label: t('common.delete'), icon: Trash2, danger: true, onClick: () => setPendingDeleteNote({ dayId, noteId: note.id }) },
        ]) : undefined}
        onMouseEnter={e => {
          const grip = e.currentTarget.querySelector('.dp-grip') as HTMLElement | null
          if (grip) grip.style.opacity = '1'
          const editBtns = e.currentTarget.querySelector('.note-edit-buttons') as HTMLElement | null
          if (editBtns) editBtns.style.opacity = '1'
        }}
        onMouseLeave={e => {
          const grip = e.currentTarget.querySelector('.dp-grip') as HTMLElement | null
          if (grip) grip.style.opacity = '0.3'
          const editBtns = e.currentTarget.querySelector('.note-edit-buttons') as HTMLElement | null
          if (editBtns) editBtns.style.opacity = '0'
        }}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 8px 7px 2px',
          margin: '1px 8px',
          borderRadius: 6,
          border: '1px solid var(--border-faint)',
          borderTop: showDropLine ? '2px solid var(--text-primary)' : undefined,
          background: 'var(--bg-hover)',
          opacity: draggingId === `note-${note.id}` ? 0.4 : 1,
          transition: 'background 0.1s', cursor: 'grab', userSelect: 'none',
        }}
      >
        {canEditDays && <div className="dp-grip" style={{ flexShrink: 0, color: 'var(--text-faint)', display: 'flex', alignItems: 'center', opacity: 0.3, transition: 'opacity 0.15s', cursor: 'grab' }}>
          <GripVertical size={13} strokeWidth={1.8} />
        </div>}
        <div style={{ width: 28, height: 28, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: 'var(--bg-hover)', overflow: 'hidden' }}>
          <NoteIcon size={13} strokeWidth={1.8} color="var(--text-muted)" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-primary)', wordBreak: 'break-word' }}>
            {note.text}
          </span>
          {note.time && (
            <div className="collab-note-md" style={{ fontSize: 10.5, fontWeight: 400, color: 'var(--text-faint)', lineHeight: '1.3', marginTop: 2, wordBreak: 'break-word' }}><Markdown remarkPlugins={[remarkGfm]}>{note.time}</Markdown></div>
          )}
        </div>
        {canEditDays && <div className="note-edit-buttons" style={{ display: 'flex', gap: 1, flexShrink: 0, opacity: 0, transition: 'opacity 0.15s' }}>
          <button onClick={e => openEditNote(dayId, note, e)} className="text-content-faint" style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', display: 'flex' }}><Pencil size={10} /></button>
          <button onClick={e => { e.stopPropagation(); setPendingDeleteNote({ dayId, noteId: note.id }) }} className="text-content-faint" style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', display: 'flex' }}><Trash2 size={10} /></button>
        </div>}
        {canEditDays && <div className="reorder-buttons" style={{ flexShrink: 0, display: 'flex', gap: 1, transition: 'opacity 0.15s' }}>
          <button onClick={e => { e.stopPropagation(); moveNote(dayId, note.id, 'up') }} disabled={idx === 0} className={idx === 0 ? 'text-[var(--border-primary)]' : 'text-content-faint'} style={{ background: 'none', border: 'none', padding: '1px 2px', cursor: idx === 0 ? 'default' : 'pointer', display: 'flex', lineHeight: 1 }}><ChevronUp size={12} strokeWidth={2} /></button>
          <button onClick={e => { e.stopPropagation(); moveNote(dayId, note.id, 'down') }} disabled={idx === mergedLength - 1} className={idx === mergedLength - 1 ? 'text-[var(--border-primary)]' : 'text-content-faint'} style={{ background: 'none', border: 'none', padding: '1px 2px', cursor: idx === mergedLength - 1 ? 'default' : 'pointer', display: 'flex', lineHeight: 1 }}><ChevronDown size={12} strokeWidth={2} /></button>
        </div>}
      </div>
    </React.Fragment>
  )
}

// ponytail: same drag-data reader as PlaceRow/TransportRow; duplicated locally to keep each row self-contained.
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