import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { guardCronRoute } from '../_auth.js'

// External runtime observer for the n8n fleet.
//
// Why this exists. Every other health signal in Mindmaker OS is self-reported:
// each workflow writes its own `workflow_runs` heartbeat, and it writes it at
// the END of a run. A workflow that dies at node 3 writes nothing at all, and
// "nothing" is indistinguishable from "wasn't scheduled today". So the failure
// mode that actually happens (a credential is deleted, a quota blows) is
// precisely the one the OS cannot see.
//
// The 2026-08-19 audit found HARO Ingestion had failed 94 of 94 runs on a
// deleted Gmail credential, Maya's Customer Acquisition Sweeper 12 of 12, and
// Vera's Feedback Aggregation 2 of 2 on a 401 — while `credential_health` held
// 20 rows all marked healthy, last verified three months earlier. The sensor
// was unplugged and stuck on green.
//
// This route asks n8n itself what happened, which is the one source that cannot
// lie by omission. It deliberately runs on Vercel cron rather than as an n8n
// workflow: an n8n workflow monitoring n8n shares the blind spot it is meant to
// close.
//
//   GET (CRON_SECRET) — every 6h   ·   POST — manual

const N8N_BASE = (process.env.N8N_BASE_URL || 'https://krishraja10101.app.n8n.cloud').replace(/\/+$/, '')
const WINDOW_DAYS = 28
const SCHEDULE_TRIGGERS = new Set([
  'n8n-nodes-base.scheduleTrigger',
  'n8n-nodes-base.cron',
  'n8n-nodes-base.intervalTrigger',
])

interface Wf {
  id: string; name: string; active: boolean; nodes?: { type: string }[]
  // n8n Cloud keeps a draft and a published (active) version. An edit made
  // through the MCP update_workflow tool writes the DRAFT: a manual test run
  // executes it and passes while the cron keeps running the old published
  // version, so a fix can look shipped and silently not be. Optional because
  // older n8n builds omit them; absent means 'cannot tell', never 'fine'.
  versionId?: string | null; activeVersionId?: string | null
}
interface Ex { workflowId: string; status: string; startedAt: string | null; stoppedAt?: string | null }

async function n8n<T>(path: string, key: string): Promise<T> {
  const res = await fetch(`${N8N_BASE}/api/v1${path}`, {
    headers: { 'X-N8N-API-KEY': key, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`n8n ${path} -> HTTP ${res.status}`)
  return res.json() as Promise<T>
}

/** Walk a cursor-paginated n8n collection to exhaustion (bounded). */
async function page<T>(path: string, key: string, maxPages: number): Promise<T[]> {
  const out: T[] = []
  let cursor = ''
  for (let i = 0; i < maxPages; i++) {
    const sep = path.includes('?') ? '&' : '?'
    const url = cursor ? `${path}${sep}cursor=${encodeURIComponent(cursor)}` : path
    const body = await n8n<{ data?: T[]; nextCursor?: string | null }>(url, key)
    out.push(...(body.data || []))
    if (!body.nextCursor) break
    cursor = body.nextCursor
  }
  return out
}

/** Group failures by cause, so a credential outage is one story not six. */
export function classifyFailure(message: string, type: string): string {
  const m = `${message} ${type}`.toLowerCase()
  // Quota is tested FIRST and deliberately. n8n wraps almost every non-2xx in
  // "Forbidden - perhaps check your credentials?", so Zara's real error
  // ("Monthly usage hard limit exceeded") reads as a credential fault to a
  // naive matcher and would send someone hunting for a broken key instead of
  // topping up a plan.
  if (/quota|rate limit|too many requests|429|usage hard limit|limit exceeded/.test(m)) return 'quota'
  if (/credential|unauthor|401|x-api-key|does not exist for type/.test(m)) return 'credential'
  if (/econnrefused|etimedout|enotfound|socket hang up|network|timeout/.test(m)) return 'network'
  if (/unexpected|syntaxerror|cannot read|undefined|expressionerror|is not a function|json/.test(m)) return 'logic'
  return 'unknown'
}

/** A workflow's health from its own execution record, not its own opinion. */
export function classifyStatus(opts: {
  active: boolean; isScheduled: boolean; runs: number; errors: number; lastSuccessAt: string | null
}): string {
  const { active, isScheduled, runs, errors, lastSuccessAt } = opts
  if (!active) return 'idle'
  // Scheduled, switched on, and never ran in the whole window: it is not quiet,
  // it is not running. This is the case no self-reported heartbeat can produce.
  if (isScheduled && runs === 0) return 'dead'
  if (runs === 0) return 'idle'
  const rate = errors / runs
  if (rate >= 0.99) return 'dead'
  if (rate >= 0.5) return 'failing'
  if (rate >= 0.15) return 'degraded'
  // Erroring less than 15% but nothing has actually succeeded: still failing.
  if (errors > 0 && !lastSuccessAt) return 'failing'
  return 'healthy'
}

async function reconcile(apiKey: string) {
  const since = Date.now() - WINDOW_DAYS * 86_400_000
  const workflows = await page<Wf>('/workflows?limit=100', apiKey, 12)
  const executions = await page<Ex>('/executions?limit=250&includeData=false', apiKey, 20)

  const agg = new Map<string, { runs: number; errors: number; lastRun: string | null; lastOk: string | null; lastErr: string | null }>()
  for (const e of executions) {
    if (!e.workflowId) continue
    const t = e.startedAt || ''
    if (t && Date.parse(t) < since) continue
    const a = agg.get(e.workflowId) || { runs: 0, errors: 0, lastRun: null, lastOk: null, lastErr: null }
    a.runs++
    if (t > (a.lastRun || '')) a.lastRun = t
    if (e.status === 'error') { a.errors++; if (t > (a.lastErr || '')) a.lastErr = t }
    else if (t > (a.lastOk || '')) a.lastOk = t
    agg.set(e.workflowId, a)
  }

  // One detail fetch per broken workflow only — the full-data payload is heavy
  // and healthy workflows have nothing to explain.
  const rows: Record<string, unknown>[] = []
  for (const w of workflows) {
    const a = agg.get(w.id) || { runs: 0, errors: 0, lastRun: null, lastOk: null, lastErr: null }
    const isScheduled = (w.nodes || []).some(n => SCHEDULE_TRIGGERS.has(n.type))
    // Only meaningful when n8n reports both ids and the workflow is published.
    const unpublishedDraft =
      Boolean(w.versionId && w.activeVersionId && w.versionId !== w.activeVersionId)
    const status = classifyStatus({
      active: w.active, isScheduled, runs: a.runs, errors: a.errors, lastSuccessAt: a.lastOk,
    })

    let node: string | null = null, etype: string | null = null, emsg: string | null = null, klass: string | null = null
    if (a.errors > 0 && (status === 'failing' || status === 'dead' || status === 'degraded')) {
      try {
        const det = await n8n<{ data?: { data?: { resultData?: { lastNodeExecuted?: string; error?: { name?: string; message?: string; description?: string; httpCode?: string } } } }[] }>(
          `/executions?limit=1&status=error&workflowId=${encodeURIComponent(w.id)}&includeData=true`, apiKey)
        const rd = det.data?.[0]?.data?.resultData
        node = rd?.lastNodeExecuted ?? null
        etype = [rd?.error?.name, rd?.error?.httpCode].filter(Boolean).join(' ') || null
        // description carries the ACTIONABLE cause and message is often just
        // n8n's wrapper. Zara and the Orchestrator both report "Forbidden -
        // perhaps check your credentials?" as the message while description
        // says "Monthly usage hard limit exceeded" and "Quota exceeded for
        // quota metric Queries" respectively. Classifying on message alone
        // sends someone to rotate a perfectly good key.
        const detail = [rd?.error?.message, rd?.error?.description].filter(Boolean).join(' | ')
        emsg = detail.slice(0, 500) || null
        klass = classifyFailure(detail, etype || '')
      } catch { /* detail is best-effort; the counts already tell the story */ }
    }

    rows.push({
      workflow_id: w.id, workflow_name: w.name, active: w.active, is_scheduled: isScheduled,
      runs_28d: a.runs, errors_28d: a.errors,
      error_rate: a.runs ? Math.round((a.errors / a.runs) * 1000) / 1000 : null,
      last_run_at: a.lastRun, last_success_at: a.lastOk, last_error_at: a.lastErr,
      last_error_node: node, last_error_type: etype, last_error_message: emsg,
      status, failure_class: klass, unpublished_draft: unpublishedDraft,
      checked_at: new Date().toISOString(),
    })
  }

  const { error: upErr } = await supabase.from('workflow_health').upsert(rows, { onConflict: 'workflow_id' })
  if (upErr) throw new Error(`workflow_health upsert failed: ${upErr.message}`)

  const broken = rows.filter(r => r.status === 'failing' || r.status === 'dead')
  // Degraded alerts too, one tier lower. A workflow erroring on a third of its
  // runs is not healthy, and "not fully broken" is exactly the band things sit
  // in while nobody looks at them.
  const alertable = rows.filter(r => r.status === 'failing' || r.status === 'dead' || r.status === 'degraded')

  // credential_health is what the tier-3 Critical Infrastructure Monitor reads.
  // It had been frozen on "all healthy" since May. Drive it from observed
  // credential-class failures so it reflects reality or says nothing.
  const credBroken = broken.filter(r => r.failure_class === 'credential')
  for (const r of credBroken) {
    await supabase.from('credential_health').upsert({
      credential_name: `n8n:${r.workflow_name}`,
      credential_type: 'n8n_workflow_binding',
      status: 'broken',
      health_score: 0,
      last_verified: new Date().toISOString(),
      notes: `${r.last_error_node ?? 'unknown node'}: ${r.last_error_message ?? ''}`.slice(0, 500),
      next_action: 'Rebind the credential on this node in n8n, then re-run.',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'credential_name' })
  }

  // One silent_failures row per broken workflow per day. Re-running the cron
  // must not multiply alerts, so we look before we write.
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString()
  let raised = 0
  for (const r of alertable) {
    const { data: dupe } = await supabase.from('silent_failures')
      .select('id').eq('workflow_id', r.workflow_id).eq('failure_type', 'runtime_failing')
      .gte('detected_at', dayAgo).is('resolved_at', null).limit(1)
    if (dupe && dupe.length) continue
    await supabase.from('silent_failures').insert({
      workflow_id: r.workflow_id as string,
      workflow_name: r.workflow_name as string,
      tier: r.status === 'degraded' ? 2 : 3,
      failure_type: 'runtime_failing',
      detail: `n8n runtime says this workflow is ${r.status}: ${r.errors_28d}/${r.runs_28d} executions failed in ${WINDOW_DAYS}d. `
        + `Class: ${r.failure_class ?? 'unknown'}. Node: ${r.last_error_node ?? 'n/a'}. ${r.last_error_message ?? ''}`.slice(0, 900),
      run_count: r.errors_28d as number,
    })
    raised++
  }

  // A draft that was never published errors on nothing: the workflow runs
  // happily on last week's code. Nothing in the execution counts can see it, so
  // it is raised on its own rather than inferred from failures.
  const stale = rows.filter(r => r.unpublished_draft && r.active)
  for (const r of stale) {
    const { data: dupe } = await supabase.from('silent_failures')
      .select('id').eq('workflow_id', r.workflow_id).eq('failure_type', 'unpublished_draft')
      .gte('detected_at', dayAgo).is('resolved_at', null).limit(1)
    if (dupe && dupe.length) continue
    await supabase.from('silent_failures').insert({
      workflow_id: r.workflow_id as string,
      workflow_name: r.workflow_name as string,
      tier: 2,
      failure_type: 'unpublished_draft',
      detail: 'Draft version differs from the published version, so the schedule is '
        + 'running older code than the editor shows. An edit was saved but never '
        + 'published (n8n MCP update_workflow writes a draft; a manual test run '
        + 'executes the draft and passes). Publish the workflow to make it live.',
      run_count: 0,
    })
    raised++
  }

  await supabase.from('audit_log').insert({
    event_type: 'fleet_reconciled', actor: 'fleet-reconcile', target: 'n8n runtime',
    details: JSON.stringify({
      workflows: rows.length,
      failing: broken.length,
      dead: rows.filter(r => r.status === 'dead').length,
      degraded: rows.filter(r => r.status === 'degraded').length,
      alerts_raised: raised,
      unpublished_drafts: stale.length,
      // Distinguishes "no drafts pending" from "this n8n build does not report
      // version ids, so drift is undetectable". Zero here means the check is
      // blind, not that the fleet is clean.
      version_ids_reported: workflows.filter(w => w.versionId && w.activeVersionId).length,
      by_class: broken.reduce((m: Record<string, number>, r) => {
        const k = String(r.failure_class ?? 'unknown'); m[k] = (m[k] || 0) + 1; return m
      }, {}),
    }),
  })

  return {
    workflows: rows.length, executions: executions.length,
    failing: broken.length, alerts_raised: raised,
    unpublished_drafts: stale.map(r => r.workflow_name),
    broken: broken.map(r => ({ name: r.workflow_name, status: r.status, class: r.failure_class, node: r.last_error_node })),
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guardCronRoute(req, res)) return

  const apiKey = process.env.N8N_API_KEY || ''
  if (!apiKey) {
    // Say so loudly rather than reporting a green fleet we never looked at.
    return res.status(503).json({ ok: false, error: 'N8N_API_KEY not configured; fleet health is UNKNOWN, not healthy' })
  }

  try {
    const result = await reconcile(apiKey)
    return res.status(200).json({ ok: true, ...result })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return res.status(500).json({ ok: false, error: msg })
  }
}
