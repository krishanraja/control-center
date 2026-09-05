import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { resolveTz, ymdIn, dayStartUtcIn, weekOfIn } from '../_timezone.js'

/**
 * /api/pilot/ships
 *
 * The ship ledger. A ship is something that left the machine toward another
 * human. Internal work never lands here.
 *
 * POST  ingest one ship. Two shapes, and which one you get depends on auth:
 *
 *       WEBHOOK (authenticated). Body: { occurred_at?, channel, description,
 *       external_ref?, dedup_key? }. Writes source 'webhook'. When dedup_key is
 *       present the write upserts on it, so n8n retries are idempotent and can
 *       never double count.
 *
 *       MANUAL (unauthenticated). Body: { source: 'manual', channel,
 *       description }. Writes source 'manual'. No dedup_key, no external_ref,
 *       no occurred_at override: this is the operator tapping "log a ship" in
 *       his own browser, and the browser cannot hold SYNC_SECRET.
 *
 *       Why manual is unauthenticated: the alternative is shipping the secret
 *       into the bundle, which is not an option. This matches the posture the
 *       repo already takes for every operator-facing write (api/goals PATCH
 *       from DesktopHome, api/daily-focus/complete, api/tasks-inbox/*), all of
 *       which are unauthenticated. The blast radius of the manual path is one
 *       junk ledger row; the webhook path, which carries idempotency keys and
 *       arbitrary timestamps, stays secret-gated.
 *
 * GET   the summary the home widget renders. Public read, matching the repo's
 *       other read routes (api/daily-focus/today.ts) and the edge gate in
 *       middleware.ts, which already keeps /api/* out of the browser curtain.
 *
 * Auth note: the repo's existing SYNC_SECRET consumer (api/sync.ts) uses the
 * X-Sync-Secret header, so that is the primary. Authorization: Bearer is also
 * accepted so n8n can wire either way. Unlike api/sync.ts this route fails
 * CLOSED when SYNC_SECRET is unset, because it writes the ledger the whole
 * pilot layer is scored on.
 */

/** The fixed channel list. Mirrors SHIP_CHANNELS in src/types/pilot.ts. */
const MANUAL_CHANNELS = new Set(['email', 'publish', 'invoice', 'ask', 'approach', 'campaign', 'other'])

const DAY_MS = 24 * 60 * 60 * 1000
const TRAILING_DAYS = 60

function authorised(req: VercelRequest): boolean {
  const secret = process.env.SYNC_SECRET
  if (!secret) return false
  const header = req.headers['x-sync-secret']
  const provided = Array.isArray(header) ? header[0] : header
  if (provided && provided === secret) return true
  const auth = String(req.headers.authorization || '')
  return auth === `Bearer ${secret}`
}


function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Sync-Secret, Authorization')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method === 'POST') return post(req, res)
  if (req.method === 'GET') return get(req, res)
  return res.status(405).json({ ok: false, error: 'Method not allowed' })
}

async function post(req: VercelRequest, res: VercelResponse) {
  const body = (req.body || {}) as Record<string, unknown>

  const channel = typeof body.channel === 'string' ? body.channel.trim() : ''
  const description = typeof body.description === 'string' ? body.description.trim() : ''
  if (!channel) return res.status(400).json({ ok: false, error: '"channel" is required' })
  if (!description) return res.status(400).json({ ok: false, error: '"description" is required' })

  // The manual path is the operator's own browser, so it is deliberately narrow:
  // a channel from the fixed list and a description, nothing else.
  if (body.source === 'manual') {
    if (!MANUAL_CHANNELS.has(channel)) {
      return res.status(400).json({ ok: false, error: `"channel" must be one of ${[...MANUAL_CHANNELS].join(', ')}` })
    }
    const { data, error } = await supabase.from('ships').insert({
      occurred_at: new Date().toISOString(),
      source: 'manual' as const,
      channel,
      description,
      external_ref: null,
      dedup_key: null,
    }).select().single()
    if (error) return res.status(500).json({ ok: false, error: error.message })
    return res.status(201).json({ ok: true, ship: data, deduped: false })
  }

  // Everything else is external ingest and must carry the secret.
  if (!authorised(req)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' })
  }

  let occurredAt = new Date()
  if (body.occurred_at != null) {
    const parsed = new Date(String(body.occurred_at))
    if (Number.isNaN(parsed.getTime())) {
      return res.status(400).json({ ok: false, error: '"occurred_at" is not a valid date' })
    }
    occurredAt = parsed
  }

  const externalRef = typeof body.external_ref === 'string' && body.external_ref.trim()
    ? body.external_ref.trim()
    : null
  const dedupKey = typeof body.dedup_key === 'string' && body.dedup_key.trim()
    ? body.dedup_key.trim()
    : null

  const row = {
    occurred_at: occurredAt.toISOString(),
    source: 'webhook' as const,
    channel,
    description,
    external_ref: externalRef,
    dedup_key: dedupKey,
  }

  // With a dedup_key, an upsert on the unique constraint makes a retry a no-op
  // that still returns the original row. Without one, every post is a new ship.
  if (dedupKey) {
    const existing = await supabase.from('ships').select('id').eq('dedup_key', dedupKey).maybeSingle()
    const { data, error } = await supabase
      .from('ships')
      .upsert(row, { onConflict: 'dedup_key' })
      .select()
      .single()
    if (error) return res.status(500).json({ ok: false, error: error.message })
    return res.status(existing.data ? 200 : 201).json({ ok: true, ship: data, deduped: Boolean(existing.data) })
  }

  const { data, error } = await supabase.from('ships').insert(row).select().single()
  if (error) return res.status(500).json({ ok: false, error: error.message })
  return res.status(201).json({ ok: true, ship: data, deduped: false })
}

async function get(req: VercelRequest, res: VercelResponse) {
  const now = new Date()
  const tz = await resolveTz(req)
  const dayStart = (at: Date) => dayStartUtcIn(ymdIn(at, tz), tz)
  const since = new Date(now.getTime() - TRAILING_DAYS * DAY_MS)

  const { data, error } = await supabase
    .from('ships')
    .select('*')
    .gte('occurred_at', since.toISOString())
    .order('occurred_at', { ascending: false })
  if (error) return res.status(500).json({ ok: false, error: error.message })

  const ships = data || []

  const weekStart = dayStartUtcIn(weekOfIn(now, tz), tz)
  const this_week = ships.filter(s => new Date(s.occurred_at).getTime() >= weekStart.getTime()).length

  // days_since_last needs the newest ship overall, which may predate the 60-day
  // window when the operator has been quiet for a long stretch.
  let newest = ships[0]?.occurred_at as string | undefined
  if (!newest) {
    const latest = await supabase
      .from('ships')
      .select('occurred_at')
      .order('occurred_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    newest = latest.data?.occurred_at
  }
  const days_since_last = newest
    ? Math.max(0, Math.round((dayStart(now).getTime() - dayStart(new Date(newest)).getTime()) / DAY_MS))
    : null

  // Return rate: how quickly activity resumes after a gap, as the median gap in
  // days between consecutive ships across the trailing window. Null under two
  // ships, because one ship has no gap to measure.
  const ascending = [...ships].sort(
    (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime(),
  )
  const gaps: number[] = []
  for (let i = 1; i < ascending.length; i += 1) {
    const prev = dayStart(new Date(ascending[i - 1].occurred_at)).getTime()
    const curr = dayStart(new Date(ascending[i].occurred_at)).getTime()
    gaps.push(Math.round((curr - prev) / DAY_MS))
  }
  const return_rate = median(gaps)

  return res.json({
    ok: true,
    this_week,
    days_since_last,
    last_ten: ships.slice(0, 10),
    return_rate,
    week_start: weekStart.toISOString(),
    trailing_days: TRAILING_DAYS,
  })
}
