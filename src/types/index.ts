export interface Agent {
  id: string
  name: string
  humanName: string
  role: string
  model: "haiku" | "sonnet" | "opus"
  schedule: string
  nextRun: Date
  lastRun?: Date
  status: "running" | "waiting" | "blocked" | "error" | "success"
  description?: string
  personality?: string
  mission?: string
  currentWork: string[]
  collaborations: string[]
  nextActions: string[]
  workSummary?: string
  blockers?: string[]
  dependencies?: string[]
  reportsTo?: string
  kpi?: {
    label: string
    target: string
    current?: string
    unit?: string
  }
  pod?: 'ops' | 'revenue' | 'growth'
  planDocUrl?: string
  briefContent?: string
  briefUpdatedAt?: string
  briefChecksum?: string
  expected_runs_per_day?: number | null
  active?: boolean
  mandate?: string | null
  kpi_label?: string
  kpi_target?: string
  kpi_current?: string
}

export interface SystemHealth {
  overall: "healthy" | "warning" | "critical"
  agentsRunning: number
  totalAgents: number
  workflowsActive: number
  totalWorkflows: number
  lastSync: Date
  uptime: string
}

export interface WorkflowStatus {
  id: string
  name: string
  active: boolean
  lastExecution: {
    status: "success" | "error" | "running"
    startedAt: Date
    finishedAt?: Date
  }
  consecutiveErrors: number
}

export interface TaskFeedback {
  taskId: string
  agentId: string
  feedback: string
  status: "pending" | "done" | "needs_revision"
  timestamp: Date
  submittedBy: "krish" | "agatha"
}

/** Row of `content_creators`: the curated-creator registry feeding the
 *  creator scout (api/discover-creator-posts.ts) and the lens radar. */
export interface ContentCreator {
  id: string
  slug: string
  name: string
  linkedin_slug: string | null
  linkedin_url: string | null
  why: string
  lens_id: string
  active: boolean
  last_scraped_at: string | null
  last_post_url: string | null
  last_post_at: string | null
  posts_seen: number
  notes: string | null
  created_at: string
  updated_at: string
}