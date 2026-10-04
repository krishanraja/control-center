import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { guardCronRoute } from '../_auth.js'
import {
  ALERTABLE, WINDOW_DAYS, alertTier, classifyFailure, collectRuns, describeEvidence, gradeWorkflow,
  pageIsPastWindow, planResolutions, summariseRuns, type GradedWorkflow, type RunEvidence,
} from '../_fleetGrade.js'

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
// How it judges, since 2026-10-04 (rules and reasons in api/_fleetGrade.ts):
// a workflow is graded on its recent PRODUCTION runs, newest first. Manual and
// test runs are left out. An open runtime_failing alert is resolved by this
// route as soon as the workflow leaves the alertable set, which takes its
// newest K production runs all succeeding. Before that date it graded a 28-day
// error ratio that counted test runs and never resolved an alert, so a fixed
// workflow stayed red for weeks and a fresh outage could read healthy.
//
//   GET (CRON_SECRET) — every 6h   ·   POST — manual

const N8N_BASE = (process.env.N8N_BASE_URL || 'https://krishraja10101.app.n8n.cloud').replace(/\/+$/, '')
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
  // An archived workflow cannot run. Absent on builds that do not report it,
  // which reads as not archived.
  isArchived?: boolean
}
interface Ex {
  id?: string | number; workflowId: string; status: string; mode?: string | null
  startedAt: string | null; stoppedAt?: string | null
}
interface ExDetail {
  data?: { resultData?: { lastNodeExecuted?: string; error?: { name?: string; message?: string; description?: string; httpCode?: string } } }
}

async function n8n<T>(path: string, key: string): Promise<T> {
  const res = await fetch(`${N8N_BASE}/api/v1${path}`, {
    headers: { 'X-N8N-API-KEY': key, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`n8n ${path} -> HTTP ${res.status}`)
  return res.json() as Promise<T>
}

/**
 * Walk a cursor-paginated n8n collection to exhaustion (bounded). `done`, when
 * given, ends the walk early once a page shows nothing further can matter.
 * `complete` is false when the page cap stopped the walk with more still to
 * read.
 */
async function page<T>(
  path: string, key: string, maxPages: number, done?: (page: T[]) => boolean,
): Promise<{ items: T[]; complete: boolean }> {
  const items: T[] = []
  let cursor = ''
  for (let i = 0; i < maxPages; i++) {
    const sep = path.includes('?') ? '&' : '?'
    const url = cursor ? `${path}${sep}cursor=${encodeURIComponent(cursor)}` : path
    const body = await n8n<{ data?: T[]; nextCursor?: string | null }>(url, key)
    const got = body.data || []
    items.push(...got)
    if (!body.nextCursor || (done && done(got))) return { items, complete: true }
    cursor = body.nextCursor
  }
  return { items, complete: false }
}

/** The newest production failure, with node data. Best-effort. */
async function failureDetail(w: Wf, ev: RunEvidence, apiKey: string): Promise<ExDetail | undefined> {
  // By id, so the explanation comes from the same production run the grade
  // came from. The old query took the newest error of any mode, so a manual
  // test failure could stand in as the reason a scheduled run broke.
  if (ev.lastFailureId) {
    return n8n<ExDetail>(`/executions/${encodeURIComponent(ev.lastFailureId)}?includeData=true`, apiKey)
  }
  const det = await n8n<{ data?: ExDetail[] }>(
    `/executions?limit=1&status=error&workflowId=${encodeURIComponent(w.id)}&includeData=true`, apiKey)
  return det.data?.[0]
}

async function reconcile(apiKey: string) {
  const since = Date.now() - WINDOW_DAYS * 86_400_000
  const wfList = await page<Wf>('/workflows?limit=100', apiKey, 12)
  // Newest first, so the walk stops at the first page wholly older than the
  // window. complete then means every run in the window was read.
  const exList = await page<Ex>('/executions?limit=250&includeData=false', apiKey, 20,
    p => pageIsPastWindow(p, since))
  const workflows = wfList.items
  const executions = exList.items
  const collected = collectRuns(executions, since)

  // One detail fetch per alertable workflow only: the full-data payload is
  // heavy and healthy workflows have nothing to explain.
  const rows: Record<string, unknown>[] = []
  const graded: GradedWorkflow[] = []
  const evidenceById = new Map<string, RunEvidence>()
  for (const w of workflows) {
    const ev = summariseRuns(collected.byWorkflow.get(w.id) || [])
    evidenceById.set(w.id, ev)
    const isScheduled = (w.nodes || []).some(n => SCHEDULE_TRIGGERS.has(n.type))
    const active = Boolean(w.active) && !w.isArchived
    // Only meaningful when n8n reports both ids and the workflow is published.
    const unpublishedDraft =
      Boolean(w.versionId && w.activeVersionId && w.versionId !== w.activeVersionId)
    const status = gradeWorkflow({ active, isScheduled, evidence: ev })
    graded.push({ workflow_id: w.id, status, active, evidence: ev })

    let node: string | null = null, etype: string | null = null, emsg: string | null = null, klass: string | null = null
    if (ev.failures > 0 && ALERTABLE.has(status)) {
      try {
        const rd = (await failureDetail(w, ev, apiKey))?.data?.resultData
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

    // runs_28d / errors_28d now count production runs only (manual and test
    // runs are out), and every last_* column comes from the same runs.
    rows.push({
      workflow_id: w.id, workflow_name: w.name, active, is_scheduled: isScheduled,
      runs_28d: ev.runs, errors_28d: ev.failures,
      error_rate: ev.runs ? Math.round((ev.failures / ev.runs) * 1000) / 1000 : null,
      last_run_at: ev.lastRunAt, last_success_at: ev.lastSuccessAt, last_error_at: ev.lastFailureAt,
      last_error_node: node, last_error_type: etype, last_error_message: emsg,
      status, failure_class: klass, unpublished_draft: unpublishedDraft,
      checked_at: new Date().toISOString(),
    })
  }

  const { error: upErr } = await supabase.from('workflow_health').upsert(rows, { onConflict: 'workflow_id' })
  if (upErr) throw new Error(`workflow_health upsert failed: ${upErr.message}`)

  const broken = rows.filter(r => r.status === 'failing' || r.status === 'dead')
  // Degraded alerts too, one tier lower. A workflow that has failed recently
  // and has not yet proved it recovered is not healthy, and "not fully broken"
  // is exactly the band things sit in while nobody looks at them.
  const alertable = rows.filter(r => ALERTABLE.has(String(r.status)))

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
    // The only unique constraint is credential_health_unique_name_type over
    // (credential_name, credential_type). Naming just credential_name made
    // Postgres reject every upsert, which is part of why this table sat
    // frozen on "all healthy" since May. Verified live 2026-09-06.
    }, { onConflict: 'credential_name,credential_type' })
  }

  // Close the alerts of every workflow that has left the alertable set, and
  // the tier-3 rows of one that has dropped to degraded. Until 2026-10-04
  // nothing ever did, so 479 rows piled up and the Home alarm kept naming
  // workflows that had been fixed for weeks. The test for "fixed" lives in
  // planResolutions / gradeWorkflow: the newest K production runs all
  // succeeded, never "last success is newer than last error".
  let resolved = 0
  const resolvedNames: string[] = []
  let resolveError: string | null = null
  const { data: openRows, error: openErr } = await supabase.from('silent_failures')
    .select('workflow_id, tier').eq('failure_type', 'runtime_failing').is('resolved_at', null).limit(5000)
  if (openErr) {
    resolveError = openErr.message
  } else {
    const open = (openRows || []).map(r => ({ workflow_id: String(r.workflow_id), tier: Number(r.tier) }))
    const plan = planResolutions(graded, open, wfList.complete, exList.complete)
    const nowIso = new Date().toISOString()
    const nameOf = new Map(workflows.map(w => [w.id, w.name]))
    for (const p of plan) {
      let q = supabase.from('silent_failures')
        .update({ resolved_at: nowIso, resolution_note: p.note })
        .eq('workflow_id', p.workflowId).eq('failure_type', 'runtime_failing').is('resolved_at', null)
      if (p.minTier) q = q.gte('tier', p.minTier)
      const { data: done, error } = await q.select('id')
      if (error) { resolveError = error.message; continue }
      resolved += done?.length ?? 0
      resolvedNames.push(nameOf.get(p.workflowId) ?? p.workflowId)
    }
  }

  // One silent_failures row per alertable workflow per day. Re-running the
  // cron must not multiply alerts, so we look before we write. Only a row at
  // the same tier or higher counts as the duplicate: a workflow that was
  // degraded this morning and is failing every run tonight is a new, worse
  // fact, and holding its tier-3 row back for a day would keep it off Home.
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString()
  let raised = 0
  for (const r of alertable) {
    const tier = alertTier(String(r.status))
    const { data: dupe } = await supabase.from('silent_failures')
      .select('id').eq('workflow_id', r.workflow_id).eq('failure_type', 'runtime_failing')
      .gte('detected_at', dayAgo).gte('tier', tier).is('resolved_at', null).limit(1)
    if (dupe && dupe.length) continue
    const ev = evidenceById.get(String(r.workflow_id))
    const detail = `n8n runtime says this workflow is ${r.status}. ${ev ? describeEvidence(ev, Boolean(r.is_scheduled)) : ''} `
      + `${r.errors_28d}/${r.runs_28d} production runs failed in ${WINDOW_DAYS}d. `
      + `Class: ${r.failure_class ?? 'unknown'}. Node: ${r.last_error_node ?? 'n/a'}. ${r.last_error_message ?? ''}`
    await supabase.from('silent_failures').insert({
      workflow_id: r.workflow_id as string,
      workflow_name: r.workflow_name as string,
      tier,
      failure_type: 'runtime_failing',
      detail: detail.slice(0, 900),
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
      alerts_resolved: resolved,
      workflows_resolved: resolvedNames.length,
      resolve_error: resolveError,
      // Left out of grading on purpose, counted here so the exclusion is
      // visible rather than silent.
      test_runs_excluded: collected.testRuns,
      undated_executions: collected.undated,
      // False means a page cap cut the read short. A workflow absent from a
      // short workflow list is not resolved, and a short execution read
      // (the oldest runs in the window unseen) closes no alert on an idle
      // grade and needs the full ten clean runs to close one on recovery.
      workflows_complete: wfList.complete,
      executions_complete: exList.complete,
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
    failing: broken.length, alerts_raised: raised, alerts_resolved: resolved,
    resolved: resolvedNames,
    ...(resolveError ? { resolve_error: resolveError } : {}),
    test_runs_excluded: collected.testRuns, undated_executions: collected.undated,
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
