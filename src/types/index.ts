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
  description?: string // Legacy field, now using mission
  personality: string
  mission: string
  currentWork: string[]
  collaborations: string[]
  nextActions: string[]
  workSummary?: string
  blockers?: string[]
  dependencies?: string[]
  reportsTo?: string
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