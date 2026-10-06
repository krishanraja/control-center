/**
 * Full Time's pilot listeners: what one is, how a Full Time account becomes a
 * row in Control Center, and how they are counted.
 *
 * Rulings (Krish, 2026-10-06): "yes and 100": copy Full Time sign-ups into
 * Control Center so pilot listeners can be counted, toward 100. And: Full
 * Time's pilot listeners and Mindmake's pilot customers "are TOTALLY unrelated
 * and cannot be confused with one another".
 *
 * THE DEFINITION. A pilot listener is a person with a Full Time account: a
 * user in Full Time's own auth with a confirmed email address, who is not an
 * anonymous session and not a test, QA or founder account (the same test
 * filter every live list uses, src/lib/recordHygiene.ts, applied by the sync
 * where the email is visible). Paying or not: Pro is a separate number, read
 * from Stripe as revenue. On Full Time's launch list or not.
 *
 * WHERE THEY LIVE HERE. The `customers` ledger, product `full_time`, kind
 * `free_signup`, one row per Full Time account, keyed by the Full Time user
 * id in `raw.fulltime_user_id`. Not `leads`: leads collapses every product
 * into one row per email and feeds Mindmake's outreach, which is exactly the
 * mixing the ruling forbids. Mindmake's pilot customers live in
 * `pilot_deals`, a different table; nothing here reads it, and nothing that
 * counts pilot customers reads this.
 *
 * NO EMAIL OR NAME IS COPIED. `customers` is readable with the app's public
 * key, and a count needs only to know that an account exists. The row carries
 * the Full Time user id, whether it is a test account, and whether it is on
 * the launch list. Who a listener is stays in Full Time's own database.
 *
 * Zero imports, no DOM: the serverless sync (api/audience/fulltime-listeners.ts)
 * and the UI both import this file, like portfolio.ts.
 */

/** customers.product for every pilot listener. The only product this module reads. */
export const LISTENER_PRODUCT = 'full_time' as const

/** customers.source the sync writes, so its rows can be told from Stripe's. */
export const LISTENER_SOURCE = 'fulltime_accounts' as const

/** The workflow_runs id of the sync, so Flows and Growth read the same heartbeat. */
export const LISTENER_SYNC_WORKFLOW_ID = 'cc-fulltime-listeners'
export const LISTENER_SYNC_WORKFLOW_NAME = 'Full Time pilot listeners sync'

/** The words. Always "pilot listeners", never "pilots" or "pilot customers". */
export const LISTENER_WORDS = { one: 'pilot listener', many: 'pilot listeners' } as const

/** A Full Time auth user, as the admin API returns it (only what the sync reads). */
export interface FullTimeAuthUser {
  id: string
  email?: string | null
  email_confirmed_at?: string | null
  created_at?: string | null
  is_anonymous?: boolean | null
}

/** A Full Time profiles row (only what the sync reads). */
export interface FullTimeProfile {
  id: string
  display_name?: string | null
  plan?: string | null
}

/** What the listener row carries in `raw`. Nothing in it identifies a person outside Full Time. */
export interface ListenerRaw {
  fulltime_user_id: string
  pilot_listener: true
  test_account: boolean
  on_launch_list: boolean
  fulltime_plan: string | null
}

/** The customers row the sync writes for one Full Time account. */
export interface ListenerRow {
  product: typeof LISTENER_PRODUCT
  kind: 'free_signup'
  email: null
  full_name: null
  signed_up_at: string | null
  source: typeof LISTENER_SOURCE
  raw: ListenerRaw
}

function hasEmail(v: unknown): v is string {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+$/.test(v.trim())
}

/**
 * One Full Time account as a customers row, or null when it is not an
 * account that could be a pilot listener (no email, an unconfirmed email, an
 * anonymous session). A test account still gets a row, marked, so the ledger
 * mirrors Full Time and the count can leave it out honestly.
 *
 * The row is ALWAYS kind 'free_signup'. Whether someone pays is Stripe's to
 * say (the daily revenue pull owns kind 'paid'), so the sync never claims a
 * payment and never takes one away.
 */
export function listenerRowFor(
  user: FullTimeAuthUser,
  profile: FullTimeProfile | null | undefined,
  onLaunchList: boolean,
  isTest: (r: { email: string; full_name: string | null }) => boolean,
): ListenerRow | null {
  if (!user || typeof user.id !== 'string' || !user.id) return null
  if (user.is_anonymous) return null
  if (!user.email_confirmed_at) return null
  if (!hasEmail(user.email)) return null
  const name = typeof profile?.display_name === 'string' && profile.display_name.trim() ? profile.display_name.trim() : null
  return {
    product: LISTENER_PRODUCT,
    kind: 'free_signup',
    email: null,
    full_name: null,
    signed_up_at: user.created_at ?? null,
    source: LISTENER_SOURCE,
    raw: {
      fulltime_user_id: user.id,
      pilot_listener: true,
      test_account: isTest({ email: user.email.trim().toLowerCase(), full_name: name }),
      on_launch_list: onLaunchList,
      fulltime_plan: typeof profile?.plan === 'string' ? profile.plan : null,
    },
  }
}

/** A customers row, as far as counting needs it. */
export interface ListenerCountRow {
  product: string
  kind?: string | null
  raw?: Record<string, unknown> | null
}

/**
 * How many pilot listeners there are. Reads ONLY rows the listener sync wrote:
 * product full_time with raw.pilot_listener true. Every other product's rows,
 * Mindmake's included, and Full Time's own Stripe rows are ignored. One Full
 * Time account counts once, and a test account never.
 */
export function countPilotListeners(rows: ReadonlyArray<ListenerCountRow>): number {
  const seen = new Set<string>()
  for (const r of rows) {
    if (!r || r.product !== LISTENER_PRODUCT) continue
    const raw = r.raw
    if (!raw || raw.pilot_listener !== true || raw.test_account === true) continue
    const id = typeof raw.fulltime_user_id === 'string' ? raw.fulltime_user_id : ''
    if (id) seen.add(id)
  }
  return seen.size
}

/** A workflow_runs heartbeat of the sync, as far as the UI needs it. */
export interface ListenerRun {
  status: string | null
  run_at: string | null
  outcome?: string | null
  error_message?: string | null
}

/** What the UI may say about the copy: whether a count can be trusted, and why not. */
export interface ListenerSyncState {
  /** True once a copy has succeeded: listener rows exist and a 0 is a measured 0. */
  ok: boolean
  /** When the newest successful copy ran. */
  lastOkAt: string | null
  /** True when the newest run failed, even if an older one succeeded. */
  failing: boolean
  /** One plain line for a cell or a card, or null when everything is fine. */
  line: string | null
}

/**
 * Read the sync's own heartbeats (newest first or in any order). A run that
 * never happened, a run still going and a run that failed are three different
 * sentences, and none of them is a zero.
 */
export function listenerSyncState(runs: ReadonlyArray<ListenerRun> | null | undefined): ListenerSyncState {
  if (!runs) return { ok: false, lastOkAt: null, failing: false, line: 'Could not read whether the Full Time copy has run.' }
  const done = runs.filter(r => r.run_at && r.status !== 'running')
    .sort((a, b) => (String(a.run_at) < String(b.run_at) ? 1 : -1))
  const lastOk = done.find(r => r.status === 'success') ?? null
  const newest = done[0] ?? null
  const failing = !!newest && newest.status !== 'success'
  if (!newest) {
    return { ok: false, lastOkAt: null, failing: false, line: 'The copy of Full Time accounts has not run yet, so pilot listeners cannot be counted.' }
  }
  const why = (newest.outcome || newest.error_message || '').trim()
  if (!lastOk) {
    return { ok: false, lastOkAt: null, failing: true, line: why ? `The Full Time copy has never worked: ${why}` : 'The Full Time copy has never worked.' }
  }
  return {
    ok: true,
    lastOkAt: lastOk.run_at,
    failing,
    line: failing ? (why ? `The last Full Time copy failed: ${why}` : 'The last Full Time copy failed.') : null,
  }
}

/** What the goal card says: the figure, one honest line, and the one next thing to do. */
export interface ListenerGoalView {
  /** Null when the count cannot be trusted yet: the card says why instead of 0. */
  count: number | null
  target: number
  headline: string
  line: string
  next: string
}

/**
 * The Full Time goal card on Growth, decided without a browser. One action:
 * connect the copy if it has never worked; otherwise the fulltime.fm site
 * action when the daily check has one under fill_listeners; otherwise ask
 * five fans. Never a Mindmake pilot action, whatever the site check holds.
 */
export function listenerGoalView(
  sync: ListenerSyncState,
  count: number,
  target: number,
  siteAction: { title: string; job: string } | null,
): ListenerGoalView {
  if (!sync.ok) {
    return {
      count: null, target,
      headline: 'Not connected',
      line: sync.line ?? 'The copy of Full Time accounts has not run yet, so pilot listeners cannot be counted.',
      next: 'Give Control Center the read key for Full Time’s database. The copy then runs every six hours.',
    }
  }
  const left = Math.max(0, target - count)
  const said = count === 0
    ? 'No pilot listeners yet. A pilot listener is a person with a Full Time account.'
    : left === 0
      ? `The target of ${target} is reached.`
      : `${left} to go. A pilot listener is a person with a Full Time account.`
  const next = siteAction && siteAction.job === 'fill_listeners'
    ? siteAction.title
    : 'Ask five football fans you know to make a free Full Time account.'
  return {
    count, target,
    headline: `${count} of ${target}`,
    line: sync.failing && sync.line ? `${said} ${sync.line}` : said,
    next,
  }
}

/** "3 of 100 pilot listeners". The number and the target, never a percentage. */
export function listenerProgressLine(count: number, target: number): string {
  return `${count} of ${target} ${LISTENER_WORDS.many}`
}
