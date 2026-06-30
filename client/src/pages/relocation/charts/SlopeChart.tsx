// ponytail: hand-rolled slope chart. No deps. Two columns, one line per criterion.
import { memo, useMemo } from 'react'

export interface SlopeMetro {
  name: string
  scores: Record<string, number>
}

interface Props {
  metros: SlopeMetro[]
  criteria: string[]
  width?: number
}

// Reuses the scoreToColor hex ramp from relocationModel. Inlined here to keep
// the charts folder zero-import from siblings and trivially portable.
function scoreHex(s: number): string {
  if (s >= 80) return '#22c55e'
  if (s >= 60) return '#84cc16'
  if (s >= 40) return '#eab308'
  if (s >= 20) return '#d97706'
  return '#b91c1c'
}

function SlopeChartImpl({ metros, criteria, width = 360 }: Props) {
  const height = 40 + criteria.length * 28
  const padX = 70
  const colXs = metros.map((_, i) => {
    if (metros.length === 1) return padX
    const usable = width - padX * 2
    return padX + (i * usable) / (metros.length - 1)
  })

  const rows = useMemo(() => {
    return criteria.map((c) => {
      const scores = metros.map((m) => m.scores[c] ?? 0)
      const max = Math.max(...scores, 1)
      const winnerIdx = scores.indexOf(max)
      return { criterion: c, scores, winnerIdx }
    })
  }, [criteria, metros])

  if (metros.length < 2) {
    return (
      <svg
        role="img"
        aria-label="Slope chart: need at least two metros"
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
          Select two metros to compare
        </text>
      </svg>
    )
  }

  const ariaSentence = rows
    .map((r) => {
      const winner = metros[r.winnerIdx]?.name ?? '?'
      return `${r.criterion} won by ${winner}`
    })
    .join('; ')

  return (
    <svg
      role="img"
      aria-label={`Slope chart: ${ariaSentence}`}
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      style={{ height: 'auto', color: 'currentColor' }}
    >
      {/* Column headers */}
      {metros.map((m, i) => (
        <text
          key={`h-${i}`}
          x={colXs[i]}
          y={20}
          textAnchor="middle"
          fill="currentColor"
          fontSize={12}
          fontWeight={600}
        >
          {m.name}
        </text>
      ))}

      {/* Slope lines */}
      {rows.map((row, i) => {
        const y = 36 + i * 28
        const left = { x: colXs[0], y, score: row.scores[0] }
        const right = { x: colXs[colXs.length - 1], y, score: row.scores[row.scores.length - 1] }
        const color = scoreHex(Math.max(left.score, right.score))
        return (
          <g key={`r-${i}`}>
            <line
              x1={left.x}
              y1={left.y}
              x2={right.x}
              y2={right.y}
              stroke={color}
              strokeWidth={1.75}
              strokeOpacity={0.85}
            />
            {/* Criterion label */}
            <text
              x={(left.x + right.x) / 2}
              y={y - 6}
              textAnchor="middle"
              fill="currentColor"
              fontSize={11}
              opacity={0.8}
            >
              {row.criterion}
            </text>
            {/* Endpoints */}
            <circle cx={left.x} cy={left.y} r={3.5} fill={color} />
            <circle cx={right.x} cy={right.y} r={3.5} fill={color} />
            {/* Score values */}
            <text
              x={left.x - 8}
              y={y + 4}
              textAnchor="end"
              fill="currentColor"
              fontSize={11}
              opacity={0.75}
            >
              {left.score}
            </text>
            <text
              x={right.x + 8}
              y={y + 4}
              textAnchor="start"
              fill="currentColor"
              fontSize={11}
              opacity={0.75}
            >
              {right.score}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export const SlopeChart = memo(SlopeChartImpl)