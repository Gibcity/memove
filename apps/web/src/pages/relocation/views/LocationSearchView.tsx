import { ViewCard, ViewActions } from './_shared'

interface SearchLocationsData {
  total: number
  locations: Array<{
    id: string
    name: string
    state: string
    population?: number
    medianHomeValue?: number
  }>
}

// ponytail: location grid. Subtle chrome — search results are informational,
// not the headline. Population + median home value only when present.
export function LocationSearchView({ data }: { data: unknown }) {
  const d = data as SearchLocationsData
  if (!d?.locations) return null
  const locs = d.locations
  return (
    <ViewCard title={`${locs.length} of ${d.total} locations`} className="space-y-3">
      <ViewActions />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {locs.map(loc => (
          <div key={loc.id} className="rounded-xl border border-edge bg-surface p-3 gap-1">
            <div className="text-sm font-semibold text-content truncate">
              {loc.name}, {loc.state}
            </div>
            <div className="flex justify-between text-xs text-content-muted mt-1 tabular-nums">
              <span>{loc.population != null ? formatPop(loc.population) : '—'}</span>
              <span>{loc.medianHomeValue != null ? `$${Math.round(loc.medianHomeValue / 1000)}K` : '—'}</span>
            </div>
          </div>
        ))}
      </div>
    </ViewCard>
  )
}

function formatPop(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return `${n}`
}
