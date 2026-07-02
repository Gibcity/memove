// ponytail: bare /relocation/score — score the user's saved profile.
// Profile comes from GET /relocation/profile; we feed its softWeights into /score
// so the user gets their elicited preferences without doing anything.
import React from 'react'
import PageShell from '../../../components/Layout/PageShell'
import { ScoreResultsView } from '../views/ScoreResultsView'
import {
  RelocationHeader, RelocationSpinner, RelocationError,
  useApiFetch, RELOCATION_BASE,
} from './_chrome'

interface Profile { softWeights?: Record<string, number> }

export default function RelocationScorePage(): React.ReactElement {
  const profile = useApiFetch<Profile>('get', `${RELOCATION_BASE}/profile`)
  const body = profile.data ? { softWeights: profile.data.softWeights ?? {} } : undefined
  const score = useApiFetch<unknown>(
    'post',
    `${RELOCATION_BASE}/score`,
    body,
    [profile.data],
  )
  return (
    <PageShell className="bg-slate-50 dark:bg-zinc-950">
      <RelocationHeader title="Location scores" subtitle="Ranked by your saved preferences." />
      {score.loading ? <RelocationSpinner /> : null}
      {score.error ? <RelocationError message={score.error} /> : null}
      {score.data ? <ScoreResultsView data={score.data} /> : null}
    </PageShell>
  )
}
