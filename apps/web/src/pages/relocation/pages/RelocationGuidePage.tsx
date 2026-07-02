// ponytail: bare /relocation/guide/:guide — one route covers all 11 checklist/guide views.
// Slug → component map lives here. Static guides render with `data={undefined}`;
// data-backed guides (MovingCostView, TaxImpactView, ScoreExplanationView) call /profile first.
import React from 'react'
import { useParams } from 'react-router-dom'
import PageShell from '../../../components/Layout/PageShell'
import { ScoreExplanationView } from '../views/ScoreExplanationView'
import { MoveTimelineView } from '../views/MoveTimelineView'
import { MovingCostView } from '../views/MovingCostView'
import { SettlementChecklistView } from '../views/SettlementChecklistView'
import { AddressChangeView } from '../views/AddressChangeView'
import { DmvGuideView } from '../views/DmvGuideView'
import { TaxImpactView } from '../views/TaxImpactView'
import { SalaryAdjustmentView } from '../views/SalaryAdjustmentView'
import { UtilitySetupView } from '../views/UtilitySetupView'
import { HardFilterBannerView } from '../views/HardFilterBannerView'
import { GenericDataView } from '../views/GenericDataView'
import {
  RelocationHeader, RelocationSpinner, RelocationError,
  useApiFetch, RELOCATION_BASE,
} from './_chrome'

// ponytail: title + view lookup. URL slug is the user's handle to the view.
// `data` is undefined for static guides — the view handles missing data.
const GUIDE_MAP: Record<string, { title: string; subtitle: string; view: (data: unknown) => React.ReactNode }> = {
  'explained-score': { title: 'Why this score?', subtitle: 'Breakdown of the weighted match.', view: (d) => <ScoreExplanationView data={d} /> },
  'move-timeline': { title: 'Move timeline', subtitle: 'Phased plan from offer letter to day 30.', view: (d) => <MoveTimelineView data={d} /> },
  'moving-cost': { title: 'Moving cost estimate', subtitle: 'Based on distance, home size and timing.', view: (d) => <MovingCostView data={d} /> },
  'settlement-checklist': { title: 'Settlement checklist', subtitle: 'First 30 days after arrival.', view: (d) => <SettlementChecklistView data={d} /> },
  'address-change': { title: 'Address change checklist', subtitle: 'Who to notify, in priority order.', view: (d) => <AddressChangeView data={d} /> },
  'dmv-guide': { title: "DMV / driver's license guide", subtitle: 'State-by-state new-resident rules.', view: (d) => <DmvGuideView data={d} /> },
  'tax-impact': { title: 'Tax impact', subtitle: 'State taxes vs. your current state.', view: (d) => <TaxImpactView data={d} /> },
  'salary-adjustment': { title: 'Salary adjustment', subtitle: 'Cost-of-living plus tax-adjusted offer.', view: (d) => <SalaryAdjustmentView data={d} /> },
  'utility-setup': { title: 'Utility setup', subtitle: 'Power, water, internet — what to set up when.', view: (d) => <UtilitySetupView data={d} /> },
  'hard-filter-banner': { title: 'Hard-filter notice', subtitle: 'A constraint that changed your shortlist.', view: (d) => <HardFilterBannerView data={d} /> },
  'generic': { title: 'Relocation data', subtitle: 'Raw tool payload.', view: (d) => <GenericDataView data={d} /> },
} as const

export default function RelocationGuidePage(): React.ReactElement {
  const { guide } = useParams<{ guide: string }>()
  const slug = (guide ?? 'generic').toLowerCase()
  const entry = GUIDE_MAP[slug]
  // ponytail: data-backed views get the user's profile; the rest get `undefined`
  // because their default state is the empty state already.
  const needsProfile = slug === 'moving-cost' || slug === 'tax-impact'
  const profile = useApiFetch<unknown>(
    'get',
    `${RELOCATION_BASE}/profile`,
    undefined,
    needsProfile ? [] : ['no-fetch'],
  )

  if (!entry) {
    return (
      <PageShell className="bg-slate-50 dark:bg-zinc-950">
        <RelocationHeader title="Guide not found" subtitle={`No guide called "${slug}".`} />
        <RelocationError message={`Unknown guide: ${slug}. Try /relocation/guide/move-timeline.`} />
      </PageShell>
    )
  }

  if (needsProfile && profile.loading) {
    return (
      <PageShell className="bg-slate-50 dark:bg-zinc-950">
        <RelocationHeader title={entry.title} subtitle={entry.subtitle} />
        <RelocationSpinner />
      </PageShell>
    )
  }
  if (needsProfile && profile.error) {
    return (
      <PageShell className="bg-slate-50 dark:bg-zinc-950">
        <RelocationHeader title={entry.title} subtitle={entry.subtitle} />
        <RelocationError message={profile.error} />
      </PageShell>
    )
  }

  return (
    <PageShell className="bg-slate-50 dark:bg-zinc-950">
      <RelocationHeader title={entry.title} subtitle={entry.subtitle} />
      {entry.view(needsProfile ? profile.data : undefined)}
    </PageShell>
  )
}
