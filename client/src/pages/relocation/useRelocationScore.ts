import { useState, useCallback, useRef } from 'react'
import { relocationApi, type ScoreExplanation } from '../../api/relocation'
import type { Location } from '@memove/shared'
import type { CandidateDetail } from './relocationModel'

/** Response shape from GET /housing/affordability/:locationId */
export interface AffordabilityData {
  rent: number
  ratio: number
  isAffordable: boolean
  monthlyIncomeNeeded: number
}

/**
 * Detail drawer state. Extends CandidateDetail with an optional affordability
 * payload fetched once when the drawer opens.
 */
export interface CandidateDetailState extends CandidateDetail {
  affordability: AffordabilityData | null
}

/**
 * ponytail: top-level convenience shape that exposes the structured pieces
 * of the explain response without forcing callers to dig through
 * `detail.explanation.{subscores,weightsUsed,dataGaps}` every time. Mirrors
 * `ScoreExplanation` but the per-axis records are non-null so TS narrows.
 */
export interface ScoreBreakdownPayload {
  subscores: Record<string, number>
  weightsUsed: Record<string, number>
  dataGaps: ScoreExplanation['dataGaps']
}

/**
 * Data hook for relocation scoring — owns candidate detail drawer state,
 * score explanation, and affordability fetching.
 */
export function useRelocationScore() {
  const [detail, setDetail] = useState<CandidateDetailState>({
    candidate: null,
    explanation: null,
    isOpen: false,
    affordability: null,
  })
  const [explainLoading, setExplainLoading] = useState(false)
  const [deepData, setDeepData] = useState<Location | null>(null)

  const openDetail = useCallback(
    async (candidate: CandidateDetail['candidate']) => {
      if (!candidate) return
      // ponytail: race guard — capture the id at call time and only commit
      // results if it's still the active candidate. Without this, clicking
      // candidate A then B before A resolves lets A's explanation overwrite
      // B's drawer.
      const myId = candidate.location.id
      setDetail({ candidate, explanation: null, isOpen: true, affordability: null })
      setExplainLoading(true)
      // ponytail: parallel fetches — explain + affordability are independent.
      // Budget param intentionally omitted; add when moveContext exposes one.
      const [explainResp, affordabilityResp] = await Promise.allSettled([
        relocationApi.explainScore(candidate.location.id),
        relocationApi.getAffordability(candidate.location.id),
      ])
      const explanation: ScoreExplanation | null =
        explainResp.status === 'fulfilled' ? explainResp.value : null
      const affordability =
        affordabilityResp.status === 'fulfilled'
          ? (affordabilityResp.value as AffordabilityData)
          : null
      setDetail(prev =>
        prev.candidate?.location.id === myId
          ? { ...prev, explanation, affordability }
          : prev,
      )
      setExplainLoading(false)
    },
    [],
  )

  // ponytail: per-request token discards stale responses — rapid clicks on A
  // then B before A resolves would otherwise overwrite B's deepData with A's.
  const deepSeqRef = useRef(0)
  const fetchDeepData = useCallback(async (locationId: string) => {
    const seq = ++deepSeqRef.current
    try {
      const loc = await relocationApi.getLocation(locationId)
      if (seq !== deepSeqRef.current) return // ponytail: a newer fetch has taken over
      setDeepData(loc)
    } catch {
      if (seq !== deepSeqRef.current) return
      setDeepData(null)
    }
  }, [])

  const closeDetail = useCallback(() => {
    setDetail({ candidate: null, explanation: null, isOpen: false, affordability: null })
    setDeepData(null)
  }, [])

  // ponytail: derive the structured breakdown from the explain response once
  // at the return boundary so callers can `const { subscores, dataGaps } =
  // useRelocationScore()` without poking through `detail.explanation` or
  // stringifying the NL array. Keep the full object on `detail.explanation`
  // for the existing renderer.
  const breakdown: ScoreBreakdownPayload | null = detail.explanation
    ? {
        subscores: detail.explanation.subscores ?? {},
        weightsUsed: detail.explanation.weightsUsed ?? {},
        dataGaps: detail.explanation.dataGaps ?? { count: 0, fields: [], note: '' },
      }
    : null

  return {
    detail,
    explainLoading,
    deepData,
    fetchDeepData,
    openDetail,
    closeDetail,
    subscores: breakdown?.subscores ?? null,
    weightsUsed: breakdown?.weightsUsed ?? null,
    dataGaps: breakdown?.dataGaps ?? null,
  }
}
