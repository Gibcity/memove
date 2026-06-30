import { useState, useCallback } from 'react'
import { relocationApi } from '../../api/relocation'
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
      const explanation =
        explainResp.status === 'fulfilled'
          ? explainResp.value.explanation
          : candidate.decisionTrace || 'Explanation not available'
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

  const fetchDeepData = useCallback(async (locationId: string) => {
    try {
      const loc = await relocationApi.getLocation(locationId)
      setDeepData(loc)
    } catch {
      setDeepData(null)
    }
  }, [])

  const closeDetail = useCallback(() => {
    setDetail({ candidate: null, explanation: null, isOpen: false, affordability: null })
    setDeepData(null)
  }, [])

  return {
    detail,
    explainLoading,
    deepData,
    fetchDeepData,
    openDetail,
    closeDetail,
  }
}
