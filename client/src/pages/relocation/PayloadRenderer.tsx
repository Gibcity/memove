import { ScoreResultsView } from './views/ScoreResultsView'
import { CompareResultsView } from './views/CompareResultsView'
import { ScoreExplanationView } from './views/ScoreExplanationView'
import { FiscalProfileView } from './views/FiscalProfileView'
import { LocationSearchView } from './views/LocationSearchView'
import { GenericDataView } from './views/GenericDataView'

// ponytail: discriminated switch on `tool`. Stable schema → stable render.
// key={tool} on the wrapper re-mounts the inner view when the tool changes,
// replaying the agent-view-in animation per the design spec.
export function PayloadRenderer({ tool, data }: { tool?: string; data?: unknown }) {
  if (!tool || !data) return null

  let inner: React.ReactNode
  switch (tool) {
    case 'score_locations':
      inner = <ScoreResultsView data={data} />
      break
    case 'compare_locations':
      inner = <CompareResultsView data={data} />
      break
    case 'explain_score':
      inner = <ScoreExplanationView data={data} />
      break
    case 'fiscal_health':
      inner = <FiscalProfileView data={data} />
      break
    case 'search_locations':
      inner = <LocationSearchView data={data} />
      break
    default:
      inner = <GenericDataView data={data} />
  }

  return (
    <div key={tool} className="agent-view-in">
      {inner}
    </div>
  )
}
