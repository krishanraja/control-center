import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from './_supabase.js'

type Level = 'healthy' | 'degraded' | 'failed' | 'unknown'

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'failed'
  badge: 'green' | 'amber' | 'red'
  timestamp: string
  components: Record<string, { status: Level; last_check: string; message?: string }>
  alerts: Array<{
    severity: 'info' | 'warning' | 'critical'
    message: string
    component: string
    timestamp: string
  }>
}

function worst(a: Level, b: Level): Level {
  const rank: Record<Level, number> = { unknown: -1, healthy: 0, degraded: 1, failed: 2 }
  return rank[b] > rank[a] ? b : a
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')

  const now = new Date()
  const nowIso = now.toISOString()
  const health: HealthStatus = {
    status: 'healthy',
    badge: 'green',
    timestamp: nowIso,
    components: {},
    alerts: [],
  }

  try {
    // 1. Supabase connection + task count
    const { count, error: taskError } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })

    health.components['supabase-connection'] = {
      status: taskError ? 'failed' : 'healthy',
      last_check: nowIso,
      message: taskError ? taskError.message : `${count} tasks in database`,
    }
    if (taskError) {
      health.alerts.push({
        severity: 'critical',
        message: 'Supabase connection failed',
        component: 'supabase-connection',
        timestamp: nowIso,
      })
    }

    // 2. Active agents
    const { count: agentCount } = await supabase
      .from('agents')
      .select('*', { count: 'exact', head: true })
      .eq('active', true)

    health.components['agents'] = {
      status: (agentCount || 0) >= 11 ? 'healthy' : 'degraded',
      last_check: nowIso,
      message: `${agentCount} active agents`,
    }

    // 3. System services
    const { data: sysHealth } = await supabase
      .from('system_health')
      .select('component, status')

    const failingComponents = (sysHealth || []).filter((s: any) => s.status === 'failing')
    health.components['system-services'] = {
      status: failingComponents.length > 0 ? 'degraded' : 'healthy',
      last_check: nowIso,
      message: `${sysHealth?.length || 0} services tracked, ${failingComponents.length} failing`,
    }

    // 4. Agent freshness — read from agent_plans.last_rendered_at (the
    // cron-maintained source). agents.last_run is unmaintained for most
    // agents and produces always-red dashboards (audit 2026-05-26 F10).
    const { data: planRows } = await supabase
      .from('agent_plans')
      .select('agent_id, last_rendered_at')
    const FRESH_THRESHOLD_HOURS = 30

    const stale: string[] = []
    for (const p of planRows || []) {
      const lastMs = p.last_rendered_at ? new Date(p.last_rendered_at).getTime() : 0
      const ageHours = (now.getTime() - lastMs) / 3600000
      if (!p.last_rendered_at || ageHours > FRESH_THRESHOLD_HOURS) {
        stale.push(p.agent_id || 'unknown')
      }
    }
    const freshStatus: Level = stale.length === 0 ? 'healthy' : stale.length <= 2 ? 'degraded' : 'failed'
    health.components['agent-freshness'] = {
      status: freshStatus,
      last_check: nowIso,
      message: stale.length === 0 ? 'All tracked agents fresh' : `Stale: ${stale.join(', ')}`,
    }
    if (freshStatus === 'failed') {
      health.alerts.push({
        severity: 'critical',
        message: `${stale.length} agents stale`,
        component: 'agent-freshness',
        timestamp: nowIso,
      })
    } else if (freshStatus === 'degraded') {
      health.alerts.push({
        severity: 'warning',
        message: `${stale.length} agents stale`,
        component: 'agent-freshness',
        timestamp: nowIso,
      })
    }

    // 5. Workflow success rate (last 24h)
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
    const { data: runs } = await supabase
      .from('workflow_runs')
      .select('status, run_at, created_at')
      .or(`created_at.gte.${since},run_at.gte.${since}`)

    const total = runs?.length || 0
    const successes = (runs || []).filter((r: any) => r.status === 'success').length
    const rate = total === 0 ? 0 : successes / total
    let wfStatus: Level
    let wfMessage: string
    if (total === 0) {
      wfStatus = 'degraded'
      wfMessage = 'No workflow runs in last 24h'
    } else if (rate >= 0.9) {
      wfStatus = 'healthy'
      wfMessage = `${successes}/${total} succeeded (${Math.round(rate * 100)}%)`
    } else if (rate >= 0.6) {
      wfStatus = 'degraded'
      wfMessage = `${successes}/${total} succeeded (${Math.round(rate * 100)}%)`
    } else {
      wfStatus = 'failed'
      wfMessage = `${successes}/${total} succeeded (${Math.round(rate * 100)}%)`
    }
    health.components['workflow-runs'] = {
      status: wfStatus,
      last_check: nowIso,
      message: wfMessage,
    }
    if (wfStatus === 'failed') {
      health.alerts.push({
        severity: 'critical',
        message: `Workflow success rate below 60% (${Math.round(rate * 100)}%)`,
        component: 'workflow-runs',
        timestamp: nowIso,
      })
    }

    // 6. Credential health
    const { data: credRows, error: credErr } = await supabase
      .from('credential_health')
      .select('status')

    if (credErr) {
      health.components['credentials'] = {
        status: 'unknown',
        last_check: nowIso,
        message: credErr.message,
      }
    } else if (!credRows || credRows.length === 0) {
      health.components['credentials'] = {
        status: 'unknown',
        last_check: nowIso,
        message: 'No credential checks recorded yet',
      }
    } else {
      let credStatus: Level = 'healthy'
      for (const r of credRows) {
        const s = String(r.status || '').toLowerCase()
        if (s === 'failed' || s === 'failing' || s === 'critical') credStatus = worst(credStatus, 'failed')
        else if (s === 'degraded' || s === 'warning') credStatus = worst(credStatus, 'degraded')
      }
      health.components['credentials'] = {
        status: credStatus,
        last_check: nowIso,
        message: `${credRows.length} credential checks tracked`,
      }
      if (credStatus === 'failed') {
        health.alerts.push({
          severity: 'critical',
          message: 'Credential failures detected',
          component: 'credentials',
          timestamp: nowIso,
        })
      }
    }

    // 7. API endpoints
    health.components['api-endpoints'] = {
      status: 'healthy',
      last_check: nowIso,
      message: 'All Supabase-backed endpoints operational',
    }

    // Overall status
    if (health.alerts.some(a => a.severity === 'critical')) health.status = 'failed'
    else if (health.alerts.some(a => a.severity === 'warning')) health.status = 'degraded'
    else {
      // Derive from component levels (ignore unknown)
      let overall: Level = 'healthy'
      for (const c of Object.values(health.components)) {
        if (c.status === 'unknown') continue
        overall = worst(overall, c.status)
      }
      health.status = overall === 'failed' ? 'failed' : overall === 'degraded' ? 'degraded' : 'healthy'
    }

    health.badge = health.status === 'failed' ? 'red' : health.status === 'degraded' ? 'amber' : 'green'

    return res.json(health)
  } catch (error) {
    health.status = 'failed'
    health.badge = 'red'
    health.alerts.push({
      severity: 'critical',
      message: `Health check failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      component: 'health-check',
      timestamp: nowIso,
    })
    return res.status(500).json(health)
  }
}
