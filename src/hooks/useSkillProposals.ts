import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface SkillProposal {
  id: string
  target_agent_id: string | null
  skill_title: string
  skill_body: string
  pattern_key: string
  evidence_count: number | null
  confidence: 'low' | 'medium' | 'high'
  created_at: string
}

interface State {
  data: SkillProposal[]
  loading: boolean
  error: string | null
}

/**
 * Pending generative skill proposals from Vera (status='proposed'). Mirrors
 * usePendingCorrections: a plain fetch + refetch the approve/reject handlers
 * call after a mutation. These are the success-induction twin of corrections.
 */
export function useSkillProposals(limit = 10): State & { refetch: () => Promise<void> } {
  const [state, setState] = useState<State>({ data: [], loading: true, error: null })

  const refetch = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }))
    const { data, error } = await supabase
      .from('skill_proposals')
      .select('id, target_agent_id, skill_title, skill_body, pattern_key, evidence_count, confidence, created_at')
      .eq('status', 'proposed')
      .is('buried_at', null)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) {
      setState({ data: [], loading: false, error: error.message })
    } else {
      setState({ data: (data as unknown as SkillProposal[]) || [], loading: false, error: null })
    }
  }, [limit])

  useEffect(() => { refetch() }, [refetch])

  return { ...state, refetch }
}
