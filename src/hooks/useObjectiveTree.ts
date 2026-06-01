import { useEffect, useState, useCallback } from 'react'

export type MilestoneStatus = 'proposed' | 'accepted' | 'active' | 'done' | 'dropped'
export type MilestoneSource = 'marcus_proposed' | 'krish_authored' | 'krish_tweaked' | 'agatha_decomposed'

// The OS-vs-you split Marcus fills per milestone (Phase 6): what the agent fleet
// can drive unattended vs the steps that need Krish himself.
export interface OwnerSplit {
  os?: Array<{ agent: string; does: string }>
  krish?: string[]
}

export interface Milestone {
  id: string
  title: string
  description: string | null
  sequence: number
  status: MilestoneStatus
  source: MilestoneSource
  est_deep_work_hours: number | null
  proposed_at: string | null
  accepted_at: string | null
  completed_at: string | null
  marcus_reasoning: string | null
  concept_id: string | null
  created_at: string
  updated_at: string
  task_count?: number
  tasks_done?: number
  // Phase 6 OS-vs-you fields.
  owner_split?: OwnerSplit | null
  is_accomplishment?: boolean
  auto_executable_pct?: number | null
}

export interface AgentContribution {
  agent_id: string
  contribution_note: string | null
}

export interface ObjectiveNode {
  id: string
  title: string
  venture: string | null
  status: string
  priority: number | null
  definition_of_done: string | null
  why_now: string | null
  target_horizon: string | null
  primary_kpi: string | null
  secondary_kpi: string | null
  is_auto: boolean
  source: string
  objective_kind: string | null
}

export interface ObjectiveTree {
  objective: ObjectiveNode | null
  milestones: Milestone[]
  // Phase 6: which agents contribute to this objective (populated since Phase 1e,
  // surfaced by get_objective_tree only now). Drives the OS-vs-you line.
  contributions?: AgentContribution[]
}

export function useObjectiveTree(goalId: string | null) {
  const [tree, setTree] = useState<ObjectiveTree | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchTree = useCallback(async (id: string) => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(`/api/objectives/${encodeURIComponent(id)}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'unknown')
      setTree(j.tree as ObjectiveTree)
    } catch (e) {
      setError((e as Error).message)
      setTree(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!goalId) { setTree(null); return }
    fetchTree(goalId)
  }, [goalId, fetchTree])

  const refresh = useCallback(() => {
    if (goalId) fetchTree(goalId)
  }, [goalId, fetchTree])

  return { tree, loading, error, refresh }
}
