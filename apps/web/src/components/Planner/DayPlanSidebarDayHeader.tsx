// ponytail: extracted from DayPlanSidebar.tsx
import React from 'react'
import { ChevronDown, ChevronRight, Pencil, Plus, FileText, Hotel, Car } from 'lucide-react'
import WeatherWidget from '../Weather/WeatherWidget'
import { isDayInAccommodationRange } from '../../utils/dayOrder'
import type { Day, Accommodation, Reservation, Place } from '../../types'

interface DayPlanSidebarDayHeaderProps {
  day: Day
  index: number
  isSelected: boolean
  isExpanded: boolean
  isDragTarget: boolean
  formattedDate: string | null
  loc: { place?: { lat?: number | null; lng?: number | null } | null } | undefined
  anyGeoPlace: any
  cost: string | null
  editingDayId: number | null
  editTitle: string
  setEditTitle: (v: string) => void
  setEditingDayId: (id: number | null) => void
  saveTitle: (dayId: number) => void
  inputRef: React.RefObject<HTMLInputElement | null>
  accommodations: Accommodation[]
  days: Day[]
  onSelectDay: (dayId: number) => void
  onDayDetail?: ((day: Day) => void) | undefined
  onPlaceClick: (placeId: number | null, assignmentId?: number | null) => void
  setTransportDetail: (r: Reservation) => void
  canEditDays: boolean
  startEditTitle: (day: Day, e: React.MouseEvent) => void
  openAddNote: (dayId: number, e?: React.MouseEvent) => void
  toggleDay: (dayId: number, e: React.MouseEvent) => void
  onAddTransport?: ((dayId: number) => void) | undefined
  handleDropOnDay: (e: React.DragEvent, dayId: number) => void
  dragOverDayId: number | null
  setDragOverDayId: (id: number | null) => void
  getActiveRentalsForDay: (dayId: number) => Reservation[]
  t: (key: string, params?: Record<string, any>) => string
}

export function DayPlanSidebarDayHeader({
  day, index, isSelected, isExpanded, isDragTarget, formattedDate, loc, anyGeoPlace, cost,
  editingDayId, editTitle, setEditTitle, setEditingDayId, saveTitle, inputRef,
  accommodations, days, onSelectDay, onDayDetail, onPlaceClick, setTransportDetail,
  canEditDays, startEditTitle, openAddNote, toggleDay, onAddTransport,
  handleDropOnDay, dragOverDayId, setDragOverDayId, getActiveRentalsForDay, t,
}: DayPlanSidebarDayHeaderProps) {
  return (
    <div
      className="dp-day-header"
      data-selected={isSelected}
      onClick={() => { onSelectDay(day.id); if (onDayDetail) onDayDetail(day) }}
      onDragOver={e => { e.preventDefault(); if (dragOverDayId !== day.id) setDragOverDayId(day.id) }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOverDayId(null) }}
      onDrop={e => handleDropOnDay(e, day.id)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '11px 14px 11px 16px',
        cursor: 'pointer',
        background: isDragTarget ? 'rgba(17,24,39,0.07)' : (isSelected ? 'var(--bg-selected)' : 'transparent'),
        transition: 'background 0.12s',
        userSelect: 'none',
        outline: isDragTarget ? '2px dashed rgba(17,24,39,0.25)' : 'none',
        outlineOffset: -2,
        borderRadius: isDragTarget ? 8 : 0,
        touchAction: 'manipulation',
      }}
      onMouseEnter={e => { if (!isSelected && !isDragTarget) e.currentTarget.style.background = 'var(--bg-tertiary)' }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = isDragTarget ? 'rgba(17,24,39,0.07)' : 'transparent' }}
    >
      {/* Tages-Badge: Nummer oben, darunter (falls vorhanden) das Wetter des Tages */}
      {(() => {
        // anyGeoPlace is an assignment (has .place) or a bare place — read coords from either.
        const geoLat = anyGeoPlace ? ('place' in anyGeoPlace ? anyGeoPlace.place?.lat : anyGeoPlace.lat) : undefined
        const geoLng = anyGeoPlace ? ('place' in anyGeoPlace ? anyGeoPlace.place?.lng : anyGeoPlace.lng) : undefined
        const wLat = loc?.place?.lat ?? geoLat
        const wLng = loc?.place?.lng ?? geoLng
        const hasWeather = !!(day.date && anyGeoPlace && wLat != null && wLng != null)
        return (
          <div style={{
            flexShrink: 0, alignSelf: 'flex-start',
            width: hasWeather ? 34 : 26,
            borderRadius: hasWeather ? 11 : '50%',
            background: isSelected ? 'var(--accent)' : 'var(--bg-hover)',
            color: isSelected ? 'var(--accent-text)' : 'var(--text-muted)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', overflow: 'hidden',
          }}>
            <div style={{ width: '100%', height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
              {index + 1}
            </div>
            {hasWeather && (
              <>
                <div style={{ width: '64%', height: 1, background: 'currentColor', opacity: 0.25 }} />
                <div style={{ padding: '3px 0 4px' }}>
                  <WeatherWidget lat={wLat} lng={wLng} date={day.date ?? ''} stacked />
                </div>
              </>
            )}
          </div>
        )
      })()}

      <div style={{ flex: 1, minWidth: 0 }}>
        {editingDayId === day.id ? (
          <input
            ref={inputRef}
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            onBlur={() => saveTitle(day.id)}
            onKeyDown={e => { if (e.key === 'Enter') saveTitle(day.id); if (e.key === 'Escape') setEditingDayId(null) }}
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', border: 'none', outline: 'none',
              fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
              background: 'transparent', padding: 0, fontFamily: 'inherit',
              borderBottom: '1.5px solid var(--text-primary)',
            }}
          />
        ) : (<>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1, minWidth: 0 }}>
              {day.title || t('dayplan.dayN', { n: index + 1 })}
            </span>
            {formattedDate && (
              <>
                <span style={{ flexShrink: 0, width: 1, height: 11, background: 'var(--border-primary)' }} />
                <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 400, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>
                  {formattedDate}
                </span>
              </>
            )}
          </div>
          {(() => {
            const hasAccs = accommodations.some(a => isDayInAccommodationRange(day, a.start_day_id, a.end_day_id, days))
            const hasRentals = getActiveRentalsForDay(day.id).length > 0
            if (!hasAccs && !hasRentals) return null
            return <div style={{ height: 1, background: 'var(--border-faint)', margin: '5px 0 5px' }} />
          })()}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'nowrap', minWidth: 0 }}>
            {(() => {
              const dayAccs = accommodations.filter(a => isDayInAccommodationRange(day, a.start_day_id, a.end_day_id, days))
                // Sort: check-out first, then ongoing stays, then check-in last
                .sort((a, b) => {
                  const aIsOut = a.end_day_id === day.id && a.start_day_id !== day.id
                  const bIsOut = b.end_day_id === day.id && b.start_day_id !== day.id
                  const aIsIn = a.start_day_id === day.id
                  const bIsIn = b.start_day_id === day.id
                  if (aIsOut && !bIsOut) return -1
                  if (!aIsOut && bIsOut) return 1
                  if (aIsIn && !bIsIn) return 1
                  if (!aIsIn && bIsIn) return -1
                  return 0
                })
              if (dayAccs.length === 0) return null
              return dayAccs.map(acc => {
                const isCheckIn = acc.start_day_id === day.id
                const isCheckOut = acc.end_day_id === day.id
                const iconColor = isCheckOut && !isCheckIn ? '#ef4444' : isCheckIn ? '#22c55e' : 'var(--text-faint)'
                return (
                  <span key={acc.id} onClick={e => { e.stopPropagation(); if ((acc as any).place_id) onPlaceClick((acc as any).place_id) }} className="bg-surface-hover" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 1, minWidth: 0, cursor: (acc as any).place_id ? 'pointer' : 'default', borderRadius: 7, padding: '2px 7px 2px 6px' }}>
                    <Hotel size={11} strokeWidth={1.8} style={{ color: iconColor, flexShrink: 0 }} />
                    <span className="text-content-muted" style={{ fontSize: 10.5, fontWeight: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(acc as any).place_name || (acc as any).reservation_title}</span>
                  </span>
                )
              })
            })()}
            {/* Active rental car badges */}
            {(() => {
              const activeRentals = getActiveRentalsForDay(day.id)
              if (activeRentals.length === 0) return null
              return activeRentals.map(r => (
                <span key={`rental-${r.id}`} onClick={e => { e.stopPropagation(); setTransportDetail(r) }} className="bg-surface-hover" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 1, minWidth: 0, cursor: 'pointer', borderRadius: 7, padding: '2px 7px 2px 6px' }}>
                  <Car size={11} strokeWidth={1.8} className="text-content-faint" style={{ flexShrink: 0 }} />
                  <span className="text-content-muted" style={{ fontSize: 10.5, fontWeight: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                </span>
              ))
            })()}
          </div>
        </>
        )}
        {cost && (
          <div style={{ marginTop: 2 }}>
            <span className="text-[#059669]" style={{ fontSize: 11 }}>{cost}</span>
          </div>
        )}
      </div>

      {canEditDays ? (
        (() => {
          const cell = { padding: 7, cursor: 'pointer', display: 'grid', placeItems: 'center' } as const
          const div = '1px solid var(--border-faint)'
          return (
            <div className="dp-day-actions" style={{ alignSelf: 'flex-start', flexShrink: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', border: div, borderRadius: 9, overflow: 'hidden' }}>
              <button onClick={e => startEditTitle(day, e)} aria-label={t('common.edit')} style={{ ...cell, border: 'none', borderRight: div, borderBottom: div }}>
                <Pencil size={14} strokeWidth={1.8} />
              </button>
              {onAddTransport ? (
                <button onClick={e => { e.stopPropagation(); onAddTransport(day.id) }} title={t('transport.addTransport')} style={{ ...cell, border: 'none', borderBottom: div }}>
                  <Plus size={14} strokeWidth={1.8} />
                </button>
              ) : <div style={{ borderBottom: div }} />}
              <button onClick={e => openAddNote(day.id, e)} aria-label={t('dayplan.addNote')} style={{ ...cell, border: 'none', borderRight: div }}>
                <FileText size={14} strokeWidth={1.8} />
              </button>
              <button onClick={e => toggleDay(day.id, e)} title={isExpanded ? t('common.collapse') : t('common.expand')} style={{ ...cell, border: 'none' }}>
                {isExpanded ? <ChevronDown size={15} strokeWidth={1.8} /> : <ChevronRight size={15} strokeWidth={1.8} />}
              </button>
            </div>
          )
        })()
      ) : (
        <button onClick={e => toggleDay(day.id, e)} className="text-content-faint" style={{ alignSelf: 'flex-start', flexShrink: 0, background: 'none', border: 'none', padding: 6, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
          {isExpanded ? <ChevronDown size={16} strokeWidth={1.8} /> : <ChevronRight size={16} strokeWidth={1.8} />}
        </button>
      )}
    </div>
  )
}