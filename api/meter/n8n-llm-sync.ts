import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardCronRoute } from '../_auth.js'
import { dayKey, replaceDays, type MeterRow } from '../_meter.js'
import { isPriced, priceUsdDetailed, priceUsdUncached, readUsage, type TokenUsage } from '../_prices.js'

// What the FLEET's model calls cost, as opposed to what n8n charges to run them.
//
// meter/n8n-sync.ts records executions and leaves usd at 0, which is right:
// n8n Cloud bills by execution and its API reports no price. But it made a
// second, larger silence easy to mistake for a small one. Thirty-three active
// workflows hold roughly forty-six nodes that POST straight to api.anthropic.com
// on Krish's key. None of that passes through api/_content.ts, so none of it
// reaches api/_meter.ts, so none of it has ever been in meter_daily at all.
//
// The meter therefore read: anthropic $24.49, n8n $0.00. The second number
// was true about n8n and false about the fleet, and the shape of the two
// together said the automation layer is free. It is not; it is the half nobody
// was looking at. One Inspiration Sweep extraction measured 22,089 input
// tokens, and it runs every hour or two.
//
//   GET (CRON_SECRET) — hourly   ·   POST — manual re-sync
//   ?days=N  how far back to recompute (default 3, max 14)
//
// Idempotent like the other two collectors: whole days are recomputed from
// n8n's own execution records and written over, so overlapping windows and
// re-runs cannot double-count. The one rule that keeps that true is at the
// bottom of syncN8nLlm — a day is written only if it was read in full.

const PAGE = 250
const MAX_LIST_PAGES = 12
/** Executions whose data we will pull in one invocation. See BUDGET below. */
const MAX_DETAIL_FETCHES = 220
/**
 * BUDGET.
 *
 * Measured rather than assumed, on 2026-09-21: 127 executions across the whole
 * account in twenty-four hours, of which the LLM-bearing subset is a minority
 * (the high-frequency workflows are housekeeping). A three day window is
 * therefore well inside one invocation, and the cap exists for the day the
 * fleet doubles, not for the normal case.
 *
 * When the cap or the deadline does bite, the run does NOT write the day it
 * was in the middle of. A partial day written over a complete one would turn
 * a busy Tuesday into a quiet one, silently, which is the exact failure this
 * whole collector exists to end.
 */
const DEADLINE_MS = 45_000

const ANTHROPIC_HOST = 'api.anthropic.com'
const GEMINI_HOST = 'generativelanguage.googleapis.com'

function base(): string {
  return (process.env.N8N_BASE_URL || 'https://krishraja10101.app.n8n.cloud').replace(/\/+$/, '')
}

async function n8n<T>(key: string, path: string): Promise<{ data: T | null; error: string | null }> {
  try {
    const r = await fetch(`${base()}/api/v1${path}`, {
      headers: { 'X-N8N-API-KEY': key, Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    })
    const body = await r.text().catch(() => '')
    if (!r.ok) return { data: null, error: `n8n_${r.status}: ${body.replace(/\s+/g, ' ').slice(0, 180)}` }
    return { data: JSON.parse(body) as T, error: null }
  } catch (e) {
    return { data: null, error: String((e as Error)?.message || e).slice(0, 180) }
  }
}

interface N8nNode { name: string; parameters?: Record<string, unknown> }
interface N8nWorkflow { id?: string | number; name?: string; nodes?: N8nNode[] }

/** A workflow's name plus the names of the nodes that call a model directly. */
interface LlmWorkflow { name: string; nodes: string[] }

/**
 * Which nodes in a workflow talk to a model API.
 *
 * Matched on the HOST in the node's own parameters, the same test
 * scripts/check-anthropic-fallback.mts uses, because that is the thing that
 * actually determines whether a call is billed to us. Matching on node type
 * would miss these entirely: they are plain httpRequest nodes, not the
 * LangChain model nodes, which is also why n8n's own usage reporting has
 * never seen them.
 */
function llmNodesOf(wf: N8nWorkflow): string[] {
  const out: string[] = []
  for (const node of wf.nodes || []) {
    const p = JSON.stringify(node.parameters || {})
    if (p.includes(ANTHROPIC_HOST) || p.includes(GEMINI_HOST)) out.push(node.name)
  }
  return out
}

interface N8nExecutionSummary { id?: number | string; workflowId?: string | number; status?: string; startedAt?: string }

/** One node run's output items, whatever depth n8n nested them at. */
interface RunItem { json?: Record<string, unknown> }
interface NodeRun { data?: { main?: Array<Array<RunItem> | null> } }
interface ExecutionDetail {
  data?: { resultData?: { runData?: Record<string, NodeRun[]> } }
}

/** One model call read off a node's output: who answered, and for how many tokens. */
export interface ModelCall { model: string; usage: TokenUsage }

/**
 * Pull the model call out of one node output item.
 *
 * VERIFIED against a live execution (Inspiration Sweep 43145, node "Anthropic
 * Extract Seeds", 2026-09-20): an httpRequest node hands the provider's raw
 * response body through untouched, so `json` IS the Anthropic message — `model`
 * and `usage` at the top level — and readUsage already parses exactly that
 * shape, cache fields included.
 *
 * The Gemini branch is NOT verified the same way, and is written to fail
 * closed rather than guess: the fallback nodes are idle by design, so no
 * recent execution has one to read. `modelVersion` + `usageMetadata` is
 * Gemini's documented response shape; if it is wrong, the branch matches
 * nothing and the call is simply absent, never a row with invented numbers.
 * It earns its place anyway, because the fallback layer fires precisely when
 * Anthropic stops answering, and without it a spend cap would show up here as
 * the fleet going free rather than as the fleet changing provider.
 */
export function modelCallOf(json: Record<string, unknown>): ModelCall | null {
  const model = typeof json.model === 'string' ? json.model : ''
  if (model && json.usage && typeof json.usage === 'object') {
    return { model, usage: readUsage(json.usage) }
  }
  const meta = json.usageMetadata as Record<string, unknown> | undefined
  if (meta && typeof meta === 'object') {
    const n = (v: unknown) => Number(v) || 0
    const gemini = typeof json.modelVersion === 'string' ? json.modelVersion : 'gemini-unknown'
    const input = n(meta.promptTokenCount)
    const output = n(meta.candidatesTokenCount)
    if (!input && !output) return null
    return { model: gemini, usage: { input, output, cacheRead: n(meta.cachedContentTokenCount) } }
  }
  return null
}

/**
 * Every model call an execution's LLM nodes made.
 *
 * A DECLARED GAP: a call that failed before producing tokens is not counted,
 * because it has no usage object to count. n8n routes a failed HTTP node down
 * its second output branch, and that item carries the REQUEST and an error,
 * never a response — verified on Synthesis Engine 43152, whose "Sonnet
 * Synthesize" node holds a 400 reading "You have reached your specified API
 * usage limits", the spend cap of 2026-09-20. So the meter says nothing about
 * it, which is right for money (a rejected request bills nothing) and wrong
 * for health: a workflow whose every call is refused looks identical here to
 * one that was never scheduled.
 *
 * Left as a gap rather than papered over, because the fix belongs elsewhere.
 * A failed call has no model, and this meter's bucket IS the model; a row with
 * an empty bucket would break that invariant for every reader of the table to
 * carry a signal that check-anthropic-fallback.mts and the n8n execution status
 * in meter/n8n-sync.ts already carry properly.
 */
export function modelCallsOf(detail: ExecutionDetail, nodeNames: string[]): Array<ModelCall & { node: string }> {
  const runData = detail.data?.resultData?.runData || {}
  const out: Array<ModelCall & { node: string }> = []
  for (const node of nodeNames) {
    for (const run of runData[node] || []) {
      // A node that ran more than once (a loop, a retry) has one entry per run
      // and each one was billed, so every entry is read rather than the first.
      for (const branch of run.data?.main || []) {
        for (const item of branch || []) {
          const call = item?.json ? modelCallOf(item.json) : null
          if (call) out.push({ ...call, node })
        }
      }
    }
  }
  return out
}

/**
 * Which days this run is allowed to overwrite.
 *
 * The whole safety of a recompute-and-replace collector rests here. replaceDays
 * overwrites a whole cell, which is what makes re-running and overlapping
 * windows safe — and is exactly what makes a PARTIAL day dangerous: half of
 * Tuesday written over all of Tuesday reads as a cheap Tuesday, with nothing
 * anywhere to say it was measured short. A quiet wrong number is the failure
 * this collector was built to end, so it must not introduce one.
 *
 * Two things can leave a day short, and both are treated the same way:
 *
 *   stoppedAtDay   the fetch budget ran out part-way through that day, so it
 *                  and everything after it is unread
 *   listComplete   the execution LISTING never reached the window edge, so the
 *                  oldest day may be missing executions we never enumerated —
 *                  invisible from inside, because a day we only half-listed
 *                  looks exactly like a quiet one
 */
export function writableDays(
  daysInWindow: string[],
  stoppedAtDay: string | null,
  listComplete: boolean,
): { complete: string[]; incomplete: string[] } {
  const sorted = [...new Set(daysInWindow)].sort()
  let complete = stoppedAtDay ? sorted.filter(d => d < stoppedAtDay) : sorted
  if (!listComplete && complete.length) complete = complete.slice(1)
  const done = new Set(complete)
  return { complete, incomplete: sorted.filter(d => !done.has(d)) }
}

export interface N8nLlmSyncResult {
  days: number
  /** Executions in the window that belong to a workflow holding an LLM node. */
  candidates: number
  /** Of those, how many we actually pulled data for. */
  detail_fetched: number
  llm_workflows: number
  model_calls: number
  rows_written: number
  usd: number
  /** Days read in full, and therefore safe to write over. */
  days_written: string[]
  /** Days the budget cut short. Left alone rather than half-written. */
  days_incomplete: string[]
  /** Models seen with no row in the price table: real tokens, no dollars. */
  unpriced_models: string[]
  errors: string[]
}

export async function syncN8nLlm(days: number, now = Date.now()): Promise<N8nLlmSyncResult> {
  const key = process.env.N8N_API_KEY
  const errors: string[] = []
  const empty: N8nLlmSyncResult = {
    days, candidates: 0, detail_fetched: 0, llm_workflows: 0, model_calls: 0,
    rows_written: 0, usd: 0, days_written: [], days_incomplete: [], unpriced_models: [], errors,
  }
  if (!key) return { ...empty, errors: ['N8N_API_KEY not configured'] }

  const since = new Date(now - (days - 1) * 86_400_000)
  since.setUTCHours(0, 0, 0, 0)
  const sinceDay = dayKey(since)

  // 1. The executions in the window. Cheap: no data, newest first.
  const summaries: N8nExecutionSummary[] = []
  let cursor: string | null = null
  let reachedEdge = false
  let exhausted = false
  let listFailed = false
  for (let page = 0; page < MAX_LIST_PAGES && !reachedEdge; page++) {
    const q: string = `/executions?limit=${PAGE}&includeData=false${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
    const { data, error } = await n8n<{ data?: N8nExecutionSummary[]; nextCursor?: string | null }>(key, q)
    if (error) { errors.push(error); listFailed = true; break }
    for (const e of data?.data || []) {
      const day = e.startedAt ? dayKey(e.startedAt) : ''
      if (!day) continue
      if (day < sinceDay) { reachedEdge = true; continue }
      summaries.push(e)
    }
    cursor = data?.nextCursor || null
    if (!cursor) { exhausted = true; break }
  }
  // The listing covered the window only if it ran past the far edge, or ran out
  // of executions entirely. Stopping on the page cap or on an error means the
  // oldest day may be missing runs nobody enumerated.
  const listComplete = (reachedEdge || exhausted) && !listFailed

  // 2. Which of their workflows hold an LLM node. Read per workflow rather than
  //    from the whole account, and only for workflows that actually ran in the
  //    window, so this costs one request per distinct workflow (~25) instead of
  //    one per workflow that exists.
  const workflows = new Map<string, LlmWorkflow | null>()
  for (const id of new Set(summaries.map(e => (e.workflowId == null ? '' : String(e.workflowId))).filter(Boolean))) {
    const { data, error } = await n8n<N8nWorkflow>(key, `/workflows/${encodeURIComponent(id)}`)
    if (error) { errors.push(`workflow ${id}: ${error}`); workflows.set(id, null); continue }
    const nodes = llmNodesOf(data || {})
    workflows.set(id, nodes.length ? { name: data?.name || id, nodes } : null)
  }

  const candidates = summaries.filter(e => workflows.get(String(e.workflowId)))

  // 3. Their data, oldest first inside the window.
  //
  // Oldest first is what makes truncation honest. The days this run completes
  // are then a prefix of the window, and the day it stops in is the only one
  // left unwritten — as opposed to newest-first, where a cut leaves the oldest
  // days permanently unreachable because every later run starts over at today.
  candidates.sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)))

  const cells = new Map<string, MeterRow>()
  const unpriced = new Set<string>()
  let fetched = 0
  let calls = 0
  let stoppedAtDay: string | null = null

  for (const e of candidates) {
    const day = dayKey(e.startedAt || '')
    if (fetched >= MAX_DETAIL_FETCHES || Date.now() - now > DEADLINE_MS) { stoppedAtDay = day; break }
    const wf = workflows.get(String(e.workflowId))
    if (!wf || !day) continue

    const { data, error } = await n8n<ExecutionDetail>(key, `/executions/${encodeURIComponent(String(e.id))}?includeData=true`)
    fetched++
    if (error) {
      // An execution we could not read is a hole in the day, so the day stops
      // being safe to overwrite. Reported, not guessed past.
      errors.push(`execution ${e.id}: ${error}`)
      stoppedAtDay = day
      break
    }

    const failed = e.status === 'error' || e.status === 'crashed'
    for (const call of modelCallsOf(data || {}, wf.nodes)) {
      calls++
      if (!isPriced(call.model)) unpriced.add(call.model)
      const u = call.usage
      const cached = (u.cacheRead || 0) + (u.cacheWrite5m || 0) + (u.cacheWrite1h || 0)
      const id = `${e.workflowId}|${call.node}|${day}|${call.model}`
      let cell = cells.get(id)
      if (!cell) {
        cell = {
          // The provider is whoever sends the bill, not whoever ran the node.
          // These tokens are billed by Anthropic on the same key as the Vercel
          // routes, so they rank in the same column as the rest of the spend.
          provider: call.model.startsWith('gemini') ? 'google' : 'anthropic',
          unit_kind: 'agent',
          // Keyed on the workflow ID rather than its name, so a rename does not
          // start a second row for the same node, and on the node as well as
          // the workflow, because a workflow with seven Anthropic nodes has
          // seven different appetites and one number cannot say which is the
          // expensive one.
          unit_key: `n8n/${e.workflowId}/${call.node}`,
          day,
          bucket: call.model,
          unit_label: `${wf.name} · ${call.node}`,
          category: isPriced(call.model) ? 'priced' : 'unpriced-model',
          usd: 0, runs: 0, failed: 0, units: 0, unit_name: 'tokens',
          cache_read_tokens: 0, cache_write_tokens: 0, usd_uncached: 0,
        }
        cells.set(id, cell)
      }
      cell.usd += priceUsdDetailed(call.model, u)
      cell.usd_uncached = (cell.usd_uncached || 0) + priceUsdUncached(call.model, u)
      cell.runs += 1
      if (failed) cell.failed += 1
      cell.units += u.input + u.output + cached
      cell.cache_read_tokens = (cell.cache_read_tokens || 0) + (u.cacheRead || 0)
      cell.cache_write_tokens = (cell.cache_write_tokens || 0) + (u.cacheWrite5m || 0) + (u.cacheWrite1h || 0)
    }
  }

  // 4. Write only the days we read end to end. A day the budget cut into is
  //    not written at all; it is named in the result instead. See writableDays.
  const inWindow = candidates.map(e => dayKey(e.startedAt || '')).filter(Boolean)
  const { complete, incomplete } = writableDays(inWindow, stoppedAtDay, listComplete)
  const writable = new Set(complete)
  const rows = [...cells.values()].filter(r => writable.has(r.day))

  const written = await replaceDays(rows)
  if (written.error) errors.push(`meter_write: ${written.error}`)

  return {
    days,
    candidates: candidates.length,
    detail_fetched: fetched,
    llm_workflows: [...workflows.values()].filter(Boolean).length,
    model_calls: calls,
    rows_written: written.written,
    usd: Math.round(rows.reduce((s, r) => s + r.usd, 0) * 10000) / 10000,
    days_written: complete,
    days_incomplete: incomplete,
    unpriced_models: [...unpriced],
    errors,
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guardCronRoute(req, res)) return
  const raw = Number(req.query.days ?? (req.body as { days?: number } | undefined)?.days ?? 3)
  const days = Math.min(14, Math.max(1, Number.isFinite(raw) ? Math.trunc(raw) : 3))
  try {
    const result = await syncN8nLlm(days)
    return res.status(200).json({ ok: result.errors.length === 0, ...result })
  } catch (e) {
    return res.status(500).json({ ok: false, error: String((e as Error)?.message || e).slice(0, 300) })
  }
}

// One execution's data at a time, dozens of them, each a round trip to n8n
// Cloud. The deadline above stops short of this ceiling on purpose so the
// function reports what it managed rather than being killed mid-day.
export const config = { maxDuration: 60 }
