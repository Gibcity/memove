// ponytail: hand-rolled radar. No deps. Equispaced axes, polygon outline + fill.
import { memo, useMemo } from 'react'

export interface RadarDatum {
  label: string
  value: number
  max?: number
}

interface Props {
  data: RadarDatum[]
  color: string
  size?: number
}

function RadarChartImpl({ data, color, size = 280 }: Props) {
  const ariaLabel = useMemo(
    () => `Radar chart of ${data.length} criteria`,
    [data.length],
  )

  if (data.length === 0) {
    return (
      <svg
        role="img"
        aria-label="Radar chart with no data"
        viewBox={`0 0 ${size} ${size}`}
        width="100%"
        style={{ height: 'auto', color: 'currentColor' }}
      >
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="currentColor"
          opacity={0.5}
          fontSize={13}
        >
          No data available
        </text>
      </svg>
    )
  }

  const cx = size / 2
  const cy = size / 2
  const padding = 56 // room for axis labels
  const radius = Math.min(cx, cy) - padding
  const n = data.length
  const angleStep = (Math.PI * 2) / n
  // Start at top (-PI/2) so first axis points up
  const startAngle = -Math.PI / 2

  const gridLevels = [0.25, 0.5, 0.75, 1]

  const pointFor = (frac: number, axisIndex: number) => {
    const a = startAngle + axisIndex * angleStep
    return {
      x: cx + Math.cos(a) * radius * frac,
      y: cy + Math.sin(a) * radius * frac,
    }
  }

  const labelFor = (axisIndex: number) => {
    const a = startAngle + axisIndex * angleStep
    const lx = cx + Math.cos(a) * (radius + 22)
    const ly = cy + Math.sin(a) * (radius + 22)
    return { x: lx, y: ly }
  }

  const valuePoints = data.map((d, i) => {
    const max = d.max ?? 100
    const frac = Math.max(0, Math.min(1, d.value / max))
    return pointFor(frac, i)
  })

  const polygonPath =
    valuePoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') +
    ' Z'

  const ariaSentence = data
    .map((d) => `${d.label} ${d.value}`)
    .join(', ')

  return (
    <svg
      role="img"
      aria-label={`Radar chart: ${ariaSentence}`}
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      style={{ height: 'auto', color: 'currentColor' }}
    >
      {/* Grid rings */}
      {gridLevels.map((g) => {
        const pts = data
          .map((_, i) => pointFor(g, i))
          .map((p) => `${p.x},${p.y}`)
          .join(' ')
        return (
          <polygon
            key={g}
            points={pts}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.15}
            strokeWidth={1}
          />
        )
      })}

      {/* Axes */}
      {data.map((_, i) => {
        const tip = pointFor(1, i)
        return (
          <line
            key={`ax-${i}`}
            x1={cx}
            y1={cy}
            x2={tip.x}
            y2={tip.y}
            stroke="currentColor"
            strokeOpacity={0.2}
            strokeWidth={1}
          />
        )
      })}

      {/* Value polygon */}
      <path
        d={polygonPath}
        fill={color}
        fillOpacity={0.25}
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />

      {/* Value dots */}
      {valuePoints.map((p, i) => (
        <circle key={`pt-${i}`} cx={p.x} cy={p.y} r={3} fill={color} />
      ))}

      {/* Axis labels */}
      {data.map((d, i) => {
        const { x, y } = labelFor(i)
        return (
          <text
            key={`lbl-${i}`}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="currentColor"
            fontSize={11}
            opacity={0.85}
          >
            {d.label}
          </text>
        )
      })}
    </svg>
  )
}

export const RadarChart = memo(RadarChartImpl)