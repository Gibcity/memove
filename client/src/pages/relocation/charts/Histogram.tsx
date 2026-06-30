// ponytail: hand-rolled histogram. No deps. Bins as <rect>, optional median tick.
import { memo, useMemo } from 'react'

interface Props {
  values: number[]
  bins?: number
  color?: string
  medianTick?: boolean
  width?: number
}

function HistogramImpl({
  values,
  bins = 10,
  color = 'currentColor',
  medianTick = false,
  width = 320,
}: Props) {
  const height = 140
  const padX = 24
  const padTop = 10
  const padBottom = 24

  // ponytail: zero-inflation guard — if all values are 0, show empty state
  const hasData = values.some((v) => v > 0)

  const { counts, min, max, median } = useMemo(() => {
    const min = values.length ? Math.min(...values) : 0
    const max = values.length ? Math.max(...values) : 0
    const counts = new Array(bins).fill(0)
    if (values.length && max > min) {
      const step = (max - min) / bins
      for (const v of values) {
        let idx = Math.floor((v - min) / step)
        if (idx >= bins) idx = bins - 1
        if (idx < 0) idx = 0
        counts[idx]++
      }
    }
    const sorted = [...values].sort((a, b) => a - b)
    const median = sorted.length
      ? sorted[Math.floor(sorted.length / 2)]
      : 0
    return { counts, min, max, median }
  }, [values, bins])

  const ariaSentence = values.length
    ? `${values.length} values from ${min} to ${max}`
    : 'no values'

  const innerW = width - padX * 2
  const innerH = height - padTop - padBottom
  const maxCount = Math.max(1, ...counts)
  const binW = innerW / bins

  if (!hasData) {
    return (
      <svg
        role="img"
        aria-label="Histogram: no data available"
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        style={{ height: 'auto', color: 'currentColor' }}
      >
        <text
          x={width / 2}
          y={height / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="currentColor"
          opacity={0.5}
          fontSize={12}
        >
          No data available
        </text>
      </svg>
    )
  }

  const medianX =
    max > min ? padX + ((median - min) / (max - min)) * innerW : padX

  return (
    <svg
      role="img"
      aria-label={`Histogram: ${ariaSentence}`}
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      style={{ height: 'auto', color: 'currentColor' }}
    >
      {/* Axis baseline */}
      <line
        x1={padX}
        x2={width - padX}
        y1={padTop + innerH}
        y2={padTop + innerH}
        stroke="currentColor"
        strokeOpacity={0.25}
        strokeWidth={1}
      />

      {/* Bars */}
      {counts.map((c, i) => {
        const h = (c / maxCount) * innerH
        return (
          <rect
            key={i}
            x={padX + i * binW + 1}
            y={padTop + innerH - h}
            width={Math.max(0, binW - 2)}
            height={h}
            fill={color}
            opacity={0.75}
          />
        )
      })}

      {/* Median tick */}
      {medianTick && (
        <line
          x1={medianX}
          x2={medianX}
          y1={padTop}
          y2={padTop + innerH}
          stroke="currentColor"
          strokeWidth={1.5}
          strokeDasharray="3 2"
        />
      )}

      {/* Min / max labels */}
      <text
        x={padX}
        y={height - 6}
        textAnchor="start"
        fill="currentColor"
        fontSize={11}
        opacity={0.7}
      >
        {min}
      </text>
      <text
        x={width - padX}
        y={height - 6}
        textAnchor="end"
        fill="currentColor"
        fontSize={11}
        opacity={0.7}
      >
        {max}
      </text>
    </svg>
  )
}

export const Histogram = memo(HistogramImpl)