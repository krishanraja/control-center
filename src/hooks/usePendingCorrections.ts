import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface PendingCorrection {
  id: string
  agent_id: string
  pattern_reason_code: string | null
  proposed_brief_edit: string | null
  consumed_feedback_ids: string[] | null
  created_at: string
  detected_at: string | null
  correction_type: string | null
  pattern_extracted: string | null
}

interface State {
  data: PendingCorrection[]
  loading: boolean
  error: string | null
}

export function usePendingCorrections(limit = 5): State & { refetch: () => Promise<void> } {
  const [state, setState] = useState<State>({ data: [], loading: true, error: null })

  const refetch = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }))
    const { data, error } = await supabase
      .from('corrections')
      .select('id, agent_id, pattern_reason_code, proposed_brief_edit, consumed_feedback_ids, created_at, detected_at, correction_type, pattern_extracted')
      .eq('approval_state', 'pending')
      .not('proposed_brief_edit', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) {
      setState({ data: [], loading: false, error: error.message })
    } else {
      setState({ data: (data as PendingCorrection[]) || [], loading: false, error: null })
    }
  }, [limit])

  useEffect(() => { refetch() }, [refetch])

  return { ...state, refetch }
}
