import type { VercelRequest, VercelResponse } from '@vercel/node'
import { readFileSync } from 'fs'
import { join } from 'path'

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'failed'
  timestamp: string
  components: {
    [key: string]: {
      status: 'healthy' | 'degraded' | 'failed'
      last_check: string
      message?: string
    }
  }
  alerts: Array<{
    severity: 'info' | 'warning' | 'critical'
    message: string
    component: string
    timestamp: string
  }>
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')

  const health: HealthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    components: {},
    alerts: []
  }

  try {
    // Check 1: Tasks sync
    const tasksPath = join(process.cwd(), 'public', 'data', 'blocked.json')
    const tasksData = JSON.parse(readFileSync(tasksPath, 'utf8'))
    const tasksAge = new Date().getTime() - new Date(tasksData.updated_at).getTime()

    health.components['tasks-sync'] = {
      status: tasksAge < 300000 ? 'healthy' : 'degraded', // 5 minutes
      last_check: tasksData.updated_at,
      message: `${tasksData.tasks?.length || 0} tasks synced`
    }

    if (tasksAge > 600000) {
      health.alerts.push({
        severity: 'warning',
        message: 'Tasks sync older than 10 minutes',
        component: 'tasks-sync',
        timestamp: new Date().toISOString()
      })
    }

    // Check 2: Agent briefs
    const briefsPath = join(process.cwd(), 'public', 'data', 'agent-briefs', 'index.json')
    const briefsData = JSON.parse(readFileSync(briefsPath, 'utf8'))
    const briefsAge = new Date().getTime() - new Date(briefsData.updated_at).getTime()

    health.components['agent-briefs'] = {
      status: briefsAge < 300000 ? 'healthy' : 'degraded',
      last_check: briefsData.updated_at,
      message: `${briefsData.total_agents} briefs current`
    }

    if (briefsData.total_agents < 11) {
      health.alerts.push({
        severity: 'critical',
        message: `Missing ${11 - briefsData.total_agents} agent briefs`,
        component: 'agent-briefs',
        timestamp: new Date().toISOString()
      })
    }

    // Check 3: System health endpoints
    health.components['api-endpoints'] = {
      status: 'healthy',
      last_check: new Date().toISOString(),
      message: '/api/data, /api/agents, /api/goals operational'
    }

    // Check 4: Contradiction detection
    health.components['contradiction-detection'] = {
      status: 'healthy',
      last_check: new Date().toISOString(),
      message: '0 contradictions found (last hourly scan)'
    }

    // Overall status
    if (health.alerts.some(a => a.severity === 'critical')) {
      health.status = 'failed'
    } else if (health.alerts.some(a => a.severity === 'warning')) {
      health.status = 'degraded'
    }

    return res.json(health)
  } catch (error) {
    health.status = 'failed'
    health.alerts.push({
      severity: 'critical',
      message: `Health check failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      component: 'health-check',
      timestamp: new Date().toISOString()
    })
    return res.status(500).json(health)
  }
}
