import { ScoreBar, ViewCard, scoreHex } from './_shared'

interface ScoreLocationsData {
  totalScored: number
  passedFilters: number
  returned: number
  weights: Record<string, number>
  topMatches: Array<{
    rank: number
    id: string
    name: string
    state: string
    matchScore: number
    subscores: Record<string, number>
    trace: string[]
    dataGaps: string[]
    keyMetrics: Record<string, number>
  }>
}

// ponytail: ranked list of top matches. Score is the headline, subscores are
// the breakdown, dataGaps are honest signals that the score isn't fully informed.
export function ScoreResultsView({ data }: { data: unknown }) {
  const d = data as ScoreLocationsData
  if (!d?.topMatches) return null
  const matches = d.topMatches
  return (
    <ViewCard
      title={`${matches.length} cities matched your criteria`}
      className="space-y-3"
    >
      <div className="text-xs text-content-muted">
        Scored {d.totalScored} · passed filters {d.passedFilters}
      </div>
      <div className="space-y-3">
        {matches.map(m => (
          <div
            key={m.id}
            className="rounded-xl border border-edge bg-surface p-4 gap-3"
          >
            <div className="flex items-center gap-3">
              <span
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold tabular-nums text-white shrink-0"
                style={{ background: scoreHex(m.matchScore) }}
                aria-label={`Rank ${m.rank}`}
              >
                {m.rank}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-base font-semibold text-content truncate">
                  {m.name}, {m.state}
                </div>
                <div className="text-xs text-content-muted truncate">
                  {Object.keys(m.keyMetrics ?? {}).length} key metrics tracked
                </div>
              </div>
              <div className="text-3xl font-bold tabular-nums text-content" style={{ fontFamily: 'Poppins, system-ui' }}>
                {Math.round(m.matchScore)}
              </div>
            </div>

            <div className="space-y-1.5">
              {Object.entries(m.subscores ?? {}).map(([k, v]) => (
                <ScoreBar key={k} label={k} value={v} />
              ))}
            </div>

            {m.dataGaps?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {m.dataGaps.map(g => (
                  <span
                    key={g}
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                    title={`Missing data: ${g}`}
                  >
                    ⚠ {g}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </ViewCard>
  )
}
