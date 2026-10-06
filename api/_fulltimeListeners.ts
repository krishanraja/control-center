// Copy Full Time accounts into Control Center so pilot listeners can be
// counted (Ruling, Krish, 2026-10-06: "yes and 100").
//
// What a pilot listener is, the row shape and the count live in
// src/lib/pilotListeners.ts. This file is the copy: read Full Time's accounts
// with a read key for its own database, turn each into a listener row, and
// write the difference into `customers` (product full_time). The route
// (api/audience/fulltime-listeners.ts) runs it every six hours.
//
// Idempotent: a row is keyed by the Full Time user id, so a second run with
// nothing new writes nothing. It never writes `leads`, never reads or writes
// `pilot_deals`, and never touches a customers row of any other product:
// every query below is pinned to product full_time AND source
// fulltime_accounts. Pilot listeners and Mindmake's pilot customers are
// "TOTALLY unrelated" (Ruling, Krish, 2026-10-06).
//
// Loud, never silent: every run writes a workflow_runs heartbeat with what it
// did or why it could not, and a missing key is an error, not a skip.

import {
  LISTENER_PRODUCT, LISTENER_SOURCE, LISTENER_SYNC_WORKFLOW_ID, LISTENER_SYNC_WORKFLOW_NAME,
  countPilotListeners, listenerRowFor, type FullTimeAuthUser, type FullTimeProfile, type ListenerRaw, type ListenerRow,
} from '../src/lib/pilotListeners.js'
import { isTestRecord } from '../src/lib/recordHygiene.js'

/** The env names of the read key, resolved through resolveKey (env, then app_secrets). */
export const FULLTIME_URL_ENV = 'FULLTIME_SUPABASE_URL'
export const FULLTIME_KEY_ENV = 'FULLTIME_SUPABASE_SERVICE_ROLE_KEY'

const PAGE = 1000
const MAX_PAGES = 50

/** An existing listener row in Control Center, as the plan needs it. */
export interface ExistingListener {
  id: string
  signed_up_at: string | null
  raw: Record<string, unknown> | null
}

export interface ListenerPlan {
  inserts: ListenerRow[]
  updates: Array<{ id: string; signed_up_at: string | null; raw: Record<string, unknown> }>
  /** Rows whose Full Time account is gone: marked, never deleted. */
  removals: Array<{ id: string; raw: Record<string, unknown> }>
  /** Accounts read from Full Time that could be listeners (confirmed email). */
  accounts: number
  testAccounts: number
}

/** Map Full Time's accounts to listener rows. Pure. */
export function listenerRows(users: FullTimeAuthUser[], profiles: FullTimeProfile[], launchList: string[]): ListenerRow[] {
  const byId = new Map(profiles.map(p => [p.id, p]))
  const onList = new Set(launchList)
  const out: ListenerRow[] = []
  const seen = new Set<string>()
  for (const u of users) {
    if (!u || seen.has(u.id)) continue
    const row = listenerRowFor(u, byId.get(u.id), onList.has(u.id), r => isTestRecord(r))
    if (row) { out.push(row); seen.add(u.id) }
  }
  return out
}

function sameRaw(a: Record<string, unknown> | null, b: ListenerRaw): boolean {
  if (!a) return false
  for (const [k, v] of Object.entries(b)) if (JSON.stringify(a[k] ?? null) !== JSON.stringify(v ?? null)) return false
  return !a.removed_at
}

/**
 * The difference between what Full Time holds and what Control Center holds.
 * Pure, so a second run with nothing new plans nothing.
 */
export function planListenerSync(incoming: ListenerRow[], existing: ExistingListener[], nowIso: string): ListenerPlan {
  const have = new Map<string, ExistingListener>()
  for (const e of existing) {
    const id = typeof e.raw?.fulltime_user_id === 'string' ? e.raw.fulltime_user_id : ''
    if (id && !have.has(id)) have.set(id, e)
  }
  const plan: ListenerPlan = { inserts: [], updates: [], removals: [], accounts: incoming.length, testAccounts: 0 }
  const live = new Set<string>()
  for (const row of incoming) {
    const id = row.raw.fulltime_user_id
    live.add(id)
    if (row.raw.test_account) plan.testAccounts += 1
    const prev = have.get(id)
    if (!prev) { plan.inserts.push(row); continue }
    const raw: Record<string, unknown> = { ...(prev.raw ?? {}), ...row.raw }
    delete raw.removed_at
    if (!sameRaw(prev.raw, row.raw) || (prev.signed_up_at ?? null) !== (row.signed_up_at ?? null)) {
      plan.updates.push({ id: prev.id, signed_up_at: row.signed_up_at, raw })
    }
  }
  for (const [id, e] of have) {
    if (live.has(id) || e.raw?.removed_at) continue
    plan.removals.push({ id: e.id, raw: { ...(e.raw ?? {}), removed_at: nowIso, pilot_listener: false } })
  }
  return plan
}

/** The outcome line a heartbeat carries. Plain words, the count against the target. */
export function outcomeLine(plan: ListenerPlan, listeners: number, target: number): string {
  const changes = plan.inserts.length + plan.updates.length + plan.removals.length
  const head = `${listeners} of ${target} pilot listeners.`
  const tests = plan.testAccounts ? ` ${plan.testAccounts} test ${plan.testAccounts === 1 ? 'account' : 'accounts'} left out.` : ''
  const what = changes === 0
    ? ' Nothing new since the last copy.'
    : ` Copied ${plan.inserts.length} new, updated ${plan.updates.length}, marked ${plan.removals.length} gone.`
  return `${head}${what}${tests}`
}

// ---------- reading Full Time ----------

type Fetch = typeof fetch

async function readJson(f: Fetch, url: string, key: string): Promise<unknown> {
  const res = await f(url, { headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' } })
  const body = await res.text()
  if (!res.ok) {
    // Status only: a body can echo a request and nothing secret belongs in a heartbeat.
    throw new Error(res.status === 401 || res.status === 403
      ? `Full Time refused the read key (HTTP ${res.status})`
      : `Full Time answered HTTP ${res.status}`)
  }
  try { return JSON.parse(body) } catch { throw new Error('Full Time answered with something that is not JSON') }
}

/** Every Full Time account (admin API), every profile and the launch list. */
export async function readFullTime(f: Fetch, baseUrl: string, key: string): Promise<{ users: FullTimeAuthUser[]; profiles: FullTimeProfile[]; launchList: string[] }> {
  const base = baseUrl.replace(/\/+$/, '')
  const users: FullTimeAuthUser[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const j = await readJson(f, `${base}/auth/v1/admin/users?per_page=${PAGE}&page=${page}`, key) as { users?: FullTimeAuthUser[] }
    if (!j || !Array.isArray(j.users)) throw new Error('Full Time returned no account list')
    users.push(...j.users)
    if (j.users.length < PAGE) break
    if (page === MAX_PAGES) throw new Error(`More than ${PAGE * MAX_PAGES} Full Time accounts; raise the page cap before trusting a count`)
  }
  const profiles = await readJson(f, `${base}/rest/v1/profiles?select=id,display_name,plan&limit=100000`, key)
  const waitlist = await readJson(f, `${base}/rest/v1/waitlist?select=user_id&limit=100000`, key)
  if (!Array.isArray(profiles) || !Array.isArray(waitlist)) throw new Error('Full Time returned an unreadable profile or launch list')
  return {
    users,
    profiles: profiles as FullTimeProfile[],
    launchList: (waitlist as Array<{ user_id?: unknown }>).map(w => (typeof w.user_id === 'string' ? w.user_id : '')).filter(Boolean),
  }
}

// ---------- the run ----------

/** The slice of the Supabase client the run uses, so a test can hand it a fake. */
export interface ListenerDb {
  from(table: string): any
}

export interface ListenerRunResult {
  ok: boolean
  status: 'synced' | 'not_configured' | 'failed'
  listeners: number | null
  target: number
  line: string
  inserted?: number
  updated?: number
  removed?: number
}

export async function runListenerSync(opts: {
  db: ListenerDb
  fetch: Fetch
  url: string | null
  key: string | null
  target: number
  trigger: 'cron' | 'manual'
  now?: Date
}): Promise<ListenerRunResult> {
  const { db, target } = opts
  const started = opts.now ?? new Date()
  const nowIso = started.toISOString()

  // Heartbeat first. agent_id 'os': never an agent slug, which would stamp
  // that agent's last run and fake her liveness.
  let runId: number | null = null
  const hb = await db.from('workflow_runs').insert({
    workflow_id: LISTENER_SYNC_WORKFLOW_ID, workflow_name: LISTENER_SYNC_WORKFLOW_NAME, agent_id: 'os',
    run_at: nowIso, status: 'running', metadata: { trigger: opts.trigger },
  }).select('id').single()
  runId = (hb?.data as { id?: number } | null)?.id ?? null

  const finish = async (status: 'success' | 'error', line: string, metadata: Record<string, unknown>, error?: string) => {
    if (runId == null) return
    await db.from('workflow_runs').update({
      status, outcome: line, error_message: error ?? null,
      duration_ms: Date.now() - started.getTime(), metadata: { trigger: opts.trigger, ...metadata },
    }).eq('id', runId)
  }

  if (!opts.url || !opts.key) {
    const line = 'Not connected: Control Center has no read key for Full Time’s database, so pilot listeners cannot be counted.'
    await finish('error', line, { reason: 'not_configured' }, 'not_configured')
    return { ok: false, status: 'not_configured', listeners: null, target, line }
  }

  try {
    const ft = await readFullTime(opts.fetch, opts.url, opts.key)
    const incoming = listenerRows(ft.users, ft.profiles, ft.launchList)

    const { data: have, error: readErr } = await db.from('customers')
      .select('id, signed_up_at, raw')
      .eq('product', LISTENER_PRODUCT)
      .eq('source', LISTENER_SOURCE)
      .limit(100000)
    if (readErr) throw new Error(`Could not read the customers ledger: ${readErr.message}`)

    const plan = planListenerSync(incoming, (have ?? []) as ExistingListener[], nowIso)

    if (plan.inserts.length) {
      const { error } = await db.from('customers').insert(plan.inserts)
      if (error) throw new Error(`Could not add new listeners: ${error.message}`)
    }
    for (const u of plan.updates) {
      const { error } = await db.from('customers').update({ signed_up_at: u.signed_up_at, raw: u.raw, updated_at: nowIso })
        .eq('id', u.id).eq('product', LISTENER_PRODUCT).eq('source', LISTENER_SOURCE)
      if (error) throw new Error(`Could not update a listener: ${error.message}`)
    }
    for (const r of plan.removals) {
      const { error } = await db.from('customers').update({ raw: r.raw, updated_at: nowIso })
        .eq('id', r.id).eq('product', LISTENER_PRODUCT).eq('source', LISTENER_SOURCE)
      if (error) throw new Error(`Could not mark a removed account: ${error.message}`)
    }

    // Count what is now stored, the same way every surface counts it.
    const { data: after, error: afterErr } = await db.from('customers')
      .select('product, kind, raw')
      .eq('product', LISTENER_PRODUCT)
      .eq('source', LISTENER_SOURCE)
      .limit(100000)
    if (afterErr) throw new Error(`Could not read back the listeners: ${afterErr.message}`)
    const listeners = countPilotListeners((after ?? []) as Array<{ product: string; kind: string; raw: Record<string, unknown> }>)

    const line = outcomeLine(plan, listeners, target)
    await finish('success', line, {
      accounts: plan.accounts, listeners, target, test_accounts: plan.testAccounts,
      inserted: plan.inserts.length, updated: plan.updates.length, removed: plan.removals.length,
    })
    return {
      ok: true, status: 'synced', listeners, target, line,
      inserted: plan.inserts.length, updated: plan.updates.length, removed: plan.removals.length,
    }
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 300)
    const line = `The Full Time copy failed: ${msg}`
    await finish('error', line, { reason: 'failed' }, msg)
    return { ok: false, status: 'failed', listeners: null, target, line }
  }
}
