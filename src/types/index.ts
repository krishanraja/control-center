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