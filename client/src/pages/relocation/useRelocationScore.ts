import { useState, useCallback } from 'react'
import { relocationApi } from '../../api/relocation'
import type { CandidateDetail } from './relocationModel'

/**
 * Data hook for relocation scoring — owns candidate detail drawer state
 * and score explanation fetching.
 */
export function useRelocationScore() {
  const [detail, setDetail] = useState<CandidateDetail>({
    candidate: null,
    explanation: null,
    isOpen: false,
  })
  const [explainLoading, setExplainLoading] = useState(false)

  const openDetail = useCallback(
    async (candidate: CandidateDetail['candidate']) => {
      if (!candidate) return
      setDetail({ candidate, explanation: null, isOpen: true })
      setExplainLoading(true)
      try {
        const resp = await relocationApi.explainScore(candidate.location.id)
        setDetail(prev => ({
          ...prev,
          explanation: resp.explanation,
        }))
      } catch {
        setDetail(prev => ({
          ...prev,
          explanation: candidate.decisionTrace || 'Explanation not available',
        }))
      } finally {
        setExplainLoading(false)
      }
    },
    [],
  )

  const closeDetail = useCallback(() => {
    setDetail({ candidate: null, explanation: null, isOpen: false })
  }, [])

  return {
    detail,
    explainLoading,
    openDetail,
    closeDetail,
  }
}
