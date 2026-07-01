import { forwardRef, useImperativeHandle, useRef } from 'react'
import JourneyMapGL, { type JourneyMapGLHandle } from './JourneyMapGL'

// ponytail: collapsed to JourneyMapGL — JourneyMap (Leaflet) was deleted.
// Re-export the handle type under the old name to avoid touching every consumer.
export type JourneyMapAutoHandle = JourneyMapGLHandle

interface MapEntry {
  id: string
  lat: number
  lng: number
  title?: string | null
  location_name?: string | null
  mood?: string | null
  entry_date: string
  dayColor?: string
  dayLabel?: number
}

interface Props {
  checkins: unknown[]
  entries: MapEntry[]
  trail?: { lat: number; lng: number }[]
  height?: number
  dark?: boolean
  activeMarkerId?: string | null
  onMarkerClick?: (id: string, type?: string) => void
  fullScreen?: boolean
  paddingBottom?: number
}

const JourneyMapAuto = forwardRef<JourneyMapAutoHandle, Props>(function JourneyMapAuto(props, ref) {
  const glRef = useRef<JourneyMapGLHandle>(null)

  useImperativeHandle(ref, () => ({
    highlightMarker: (id) => glRef.current?.highlightMarker(id),
    focusMarker: (id) => glRef.current?.focusMarker(id),
    invalidateSize: () => glRef.current?.invalidateSize(),
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <JourneyMapGL ref={glRef} {...(props as any)} />
})

export default JourneyMapAuto
