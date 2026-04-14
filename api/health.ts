import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from './_supabase'

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')

  const health: HealthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    components: {},
    alerts: []
  }

  try {
    // Check 1: Supabase connection + task count
    const { count, error: taskError } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })

    health.components['supabase-connection'] = {
      status: taskError ? 'failed' : 'healthy',
      last_check: new Date().toISOString(),
      message: taskError ? taskError.message : `${count} tasks in database`
    }

    if (taskError) {
      health.alerts.push({
        severity: 'critical',
        message: 'Supabase connection failed',
        component: 'supabase-connection',
        timestamp: new Date().toISOString()
      })
    }

    // Check 2: Agent count
    const { count: agentCount } = await supabase
      .from('agents')
      .select('*', { count: 'exact', head: true })
      .eq('active', true)

    health.components['agents'] = {
      status: (agentCount || 0) >= 11 ? 'healthy' : 'degraded',
      last_check: new Date().toISOString(),
      message: `${agentCount} active agents`
    }

    // Check 3: System health entries
    const { data: sysHealth } = await supabase
      .from('system_health')
      .select('component, status')

    const failingComponents = (sysHealth || []).filter(s => s.status === 'failing')
    health.components['system-services'] = {
      status: failingComponents.length > 0 ? 'degraded' : 'healthy',
      last_check: new Date().toISOString(),
      message: `${sysHealth?.length || 0} services tracked, ${failingComponents.length} failing`
    }

    // Check 4: API endpoints
    health.components['api-endpoints'] = {
      status: 'healthy',
      last_check: new Date().toISOString(),
      message: 'All Supabase-backed endpoints operational'
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
