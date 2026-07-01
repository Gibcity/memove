import { ScoreBar, ViewCard, scoreHex } from './_shared'

interface CompareLocationsData {
  locations: Array<{
    id: string
    name: string
    state: string
    matchScore: number
    subscores: Record<string, number>
  }>
  winner: string
}

// ponytail: side-by-side. Winner gets a primary-tinted border + small
// "Top match" badge. Subscore rows union on all keys so a location missing
// a subscore degrades to 0 rather than dropping out.
export function CompareResultsView({ data }: { data: unknown }) {
  const d = data as CompareLocationsData
  if (!d?.locations?.length) return null
  const locs = d.locations
  const winner = d.winner
  const subKeys = Array.from(
    new Set(locs.flatMap(l => Object.keys(l.subscores ?? {}))),
  )
  return (
    <ViewCard title="Compare" className="space-y-4">
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(${locs.length}, minmax(0, 1fr))` }}
      >
        {locs.map(loc => {
          const isWinner = loc.id === winner
          return (
            <div
              key={loc.id}
              className={`rounded-xl border p-3 gap-2 ${
                isWinner
                  ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-950/20'
                  : 'border-edge bg-surface-card'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-content truncate">{loc.name}</div>
                {isWinner && (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-primary text-primary-50">
                    Top
                  </span>
                )}
              </div>
              <div className="text-[10px] text-content-muted uppercase tracking-wider">{loc.state}</div>
              <div className="text-2xl font-bold tabular-nums text-content" style={{ fontFamily: 'Poppins, system-ui' }}>
                {Math.round(loc.matchScore)}
              </div>
            </div>
          )
        })}
      </div>

      <div className="space-y-2">
        {subKeys.map(key => (
          <div key={key} className="space-y-1">
            <div className="text-xs text-content-muted">{key}</div>
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${locs.length}, minmax(0, 1fr))` }}
            >
              {locs.map(loc => (
                <ScoreBar key={loc.id} value={loc.subscores?.[key] ?? 0} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="pt-3 border-t border-edge">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-content">Total match score</span>
          <div className="flex gap-3">
            {locs.map(loc => {
              const isWinner = loc.id === winner
              return (
                <span
                  key={loc.id}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full border"
                  style={{
                    borderColor: isWinner ? scoreHex(loc.matchScore) : 'var(--border-primary)',
                    background: isWinner ? `${scoreHex(loc.matchScore)}15` : 'transparent',
                  }}
                >
                  <span className="text-xs text-content-muted">{loc.name}</span>
                  <span className="font-bold tabular-nums text-content">{Math.round(loc.matchScore)}</span>
                </span>
              )
            })}
          </div>
        </div>
      </div>
    </ViewCard>
  )
}
