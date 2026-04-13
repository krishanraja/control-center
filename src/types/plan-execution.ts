export interface Phase {
  name: string
  status: 'complete' | 'in_progress' | 'pending'
  planned_start?: string
  planned_end?: string
  tasks_assigned: string[]
  task_count: number
  completed_count: number
  progress_pct: number
  blockers: string[]
}

export interface Plan {
  agent: string
  plan_name: string
  overall_progress_pct: number
  timeline_status: 'ON_TRACK' | 'AT_RISK' | 'BLOCKED' | 'OVERDUE' | 'UNKNOWN'
  phases: Phase[]
  critical_blockers: string[]
  task_summary: {
    in_progress: number
    waiting: number
    blocked: number
    done: number
  }
  next_milestone: string
  brief_source?: string
  last_updated: string
}

export interface PlanExecutionData {
  schema_version: string
  generated_at: string
  total_agents: number
  total_tasks: number
  plans: Plan[]
  system_health: {
    all_plans_updated: boolean
    contradictions_detected: number
    sync_source: string
    next_sync: string
  }
}
