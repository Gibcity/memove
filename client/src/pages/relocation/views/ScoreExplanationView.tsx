import { ScoreBar, ViewCard } from './_shared'

interface ExplainScoreData {
  location: { id: string; name: string; state: string }
  matchScore: number
  subscores: Record<string, number>
  explanation: string[]
  dataGaps: { count: number; fields: string[]; note: string }
  weightsUsed: Record<string, number>
}

// ponytail: weighted contribution = weight × subscore (clamped). The bar
// shows the relative contribution per dimension; data gaps surface as a
// warning callout so the user knows the score is constrained.
export function ScoreExplanationView({ data }: { data: unknown }) {
  const d = data as ExplainScoreData
  if (!d?.location) return null
  return (
    <ViewCard className="space-y-4">
      <div className="flex items-baseline gap-3">
        <div>
          <div className="text-lg font-semibold text-content" style={{ fontFamily: 'Poppins, system-ui' }}>
            {d.location.name}, {d.location.state}
          </div>
          <div className="text-xs text-content-muted">Why this score?</div>
        </div>
        <div className="ml-auto text-3xl font-bold tabular-nums text-content" style={{ fontFamily: 'Poppins, system-ui' }}>
          {Math.round(d.matchScore)}
        </div>
      </div>

      {d.dataGaps?.count > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
          <div className="font-semibold mb-1">{d.dataGaps.count} data gaps</div>
          <div className="text-xs">{d.dataGaps.note}</div>
          {d.dataGaps.fields?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {d.dataGaps.fields.map(f => (
                <span key={f} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20">
                  {f}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <section>
        <h4 className="text-sm font-semibold text-content mb-2">How this score was calculated</h4>
        <div className="space-y-2">
          {Object.entries(d.weightsUsed ?? {}).map(([key, weight]) => {
            const sub = d.subscores?.[key] ?? 0
            return (
              <div key={key} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-content">{key}</span>
                  <span className="text-[10px] text-content-muted tabular-nums">
                    weight {(weight * 100).toFixed(0)}% · score {Math.round(sub)}
                  </span>
                </div>
                <ScoreBar value={weight * 100} />
              </div>
            )
          })}
        </div>
      </section>

      {d.explanation?.length > 0 && (
        <section>
          <h4 className="text-sm font-semibold text-content mb-2">Trace</h4>
          <ul className="space-y-1 text-sm text-content-secondary">
            {d.explanation.map((line, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-content-faint">·</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </ViewCard>
  )
}
