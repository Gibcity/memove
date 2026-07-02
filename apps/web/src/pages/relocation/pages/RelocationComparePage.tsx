// ponytail: bare /relocation/compare — shortlist comes from the saved journey.
// Reads ?ids=a,b,c from the URL; defaults to the user's shortlist if missing.
import React from 'react'
import { useSearchParams } from 'react-router-dom'
import PageShell from '../../../components/Layout/PageShell'
import { CompareResultsView } from '../views/CompareResultsView'
import {
  RelocationHeader, RelocationSpinner, RelocationError,
  useApiFetch, RELOCATION_BASE,
} from './_chrome'

export default function RelocationComparePage(): React.ReactElement {
  const [params] = useSearchParams()
  const idsParam = params.get('ids') ?? params.get('locationIds') ?? ''
  const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean)
  const ready = ids.length >= 2
  // ponytail: pull weights from profile so the comparison matches the user's bias.
  const profile = useApiFetch<{ softWeights?: Record<string, number> }>(
    'get',
    `${RELOCATION_BASE}/profile`,
  )
  const body = ready
    ? { locationIds: ids, weights: profile.data?.softWeights ?? {} }
    : { locationIds: [] as string[] }
  const cmp = useApiFetch<unknown>(
    'post',
    `${RELOCATION_BASE}/compare`,
    body,
    [idsParam, profile.data],
  )
  const subtitle = ready
    ? `Comparing ${ids.length} locations.`
    : 'Add ?ids=a,b,c to choose locations, e.g. ?ids=denver-co,portland-or.'
  return (
    <PageShell className="bg-slate-50 dark:bg-zinc-950">
      <RelocationHeader title="Compare locations" subtitle={subtitle} />
      {!ready ? <RelocationError message="Need at least 2 location IDs. Pass them as ?ids=…" /> : null}
      {ready && cmp.loading ? <RelocationSpinner /> : null}
      {ready && cmp.error ? <RelocationError message={cmp.error} /> : null}
      {ready && cmp.data ? <CompareResultsView data={cmp.data} /> : null}
    </PageShell>
  )
}
