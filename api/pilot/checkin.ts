import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { resolveTz, ymdIn, shiftYmd, dayStartUtcIn, dayEndUtcIn } from '../_timezone.js'
import { upsertSlots, validateSlot, type SlotInput } from '../_dailyFocus.js'
import { guard } from '../_auth.js'

/**
 * /api/pilot/checkin
 *
 * GET   today's pilot state: this morning's row (null means the gate renders),
 *       the most recent evening row (which carries today's ONE), and whether
 *       tonight's shutdown is already done. Public read, matching the repo's
 *       other read routes and the edge gate in middleware.ts.
 *
 * POST  write a check-in. Body is one of:
 *         { kind: 'morning', energy, anxiety, one_word?, mode }
 *         { kind: 'evening', shipped_today?, tomorrow_one, tomorrow_one_url?,
 *           tomorrow: [{ slot, text, goal_id?, job? }]? }
 *         { kind: 'evening', skipped: true }
 *       Morning writes are idempotent per civil day: a second post updates the
 *       existing row rather than stacking, so a reload can never re-gate.
 *
 *       An evening row also writes TOMORROW'S daily_focus row (api/_dailyFocus.ts):
 *       slot 1 is the ONE, slots 2 and 3 are optional. One writer, so red mode
 *       (reads tomorrow_one) and Home's Today list (reads daily_focus) can
 *       never disagree about what tomorrow is for.
 *
 *       A skipped evening closes tonight's prompt on every device until
 *       tomorrow, the same way a skipped morning closes the gate. It carries
 *       no ONE, so GET's last_evening (tomorrow_one not null) ignores it.
 *
 * PATCH record the red mode override on today's morning row.
 *       Body: { override: true }
 *
 * The civil day comes from the operator_timezone setting (api/_timezone.ts),
 * the same value src/lib/civilDate.ts holds in the browser and public.operator_tz()
 * reads in SQL. The three must agree or the gate flickers.
 */



function clampScore(value: unknown): number | null {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  const rounded = Math.round(n)
  if (rounded < 1 || rounded > 5) return null
  return rounded
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && guard(req, res, ['PATCH', 'POST'])) return

  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method === 'GET') return get(req, res)
  if (req.method === 'POST') return post(req, res)
  if (req.method === 'PATCH') return patch(req, res)
  return res.status(405).json({ ok: false, error: 'Method not allowed' })
}


async function get(req: VercelRequest, res: VercelResponse) {
  const now = new Date()
  const tz = await resolveTz(req)
  const today = ymdIn(now, tz)
  const yesterday = shiftYmd(today, -1)
  const [morningRes, eveningRes, eveningTodayRes, ydayRes, yshipRes] = await Promise.all([
    supabase.from('pilot_checkins').select('*')
      .eq('kind', 'morning').eq('checkin_date', today).maybeSingle(),
    // A tomorrow_one is FOR the day after it was filed (last night's shutdown)
    // or for the same day (red mode's morning ask writes an evening row dated
    // today). Anything older is a stale ONE from a past day and must not own
    // this morning: the unbounded version of this query is how a task typed
    // last Tuesday kept resurfacing every red day after.
    supabase.from('pilot_checkins').select('*')
      .eq('kind', 'evening').not('tomorrow_one', 'is', null)
      .in('checkin_date', [yesterday, today])
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('pilot_checkins').select('id')
      .eq('kind', 'evening').eq('checkin_date', today).maybeSingle(),
    // Yesterday, for the one-line recap the gate opens with.
    supabase.from('pilot_checkins').select('energy, anxiety, mode, one_word, intent, skipped')
      .eq('kind', 'morning').eq('checkin_date', yesterday).maybeSingle(),
    supabase.from('ships').select('id', { count: 'exact', head: true })
      .gte('occurred_at', dayStartUtcIn(yesterday, tz).toISOString())
      .lt('occurred_at', dayEndUtcIn(yesterday, tz).toISOString()),
  ])

  const firstError = morningRes.error || eveningRes.error || eveningTodayRes.error
  if (firstError) return res.status(500).json({ ok: false, error: firstError.message })

  return res.json({
    ok: true,
    morning: morningRes.data || null,
    last_evening: eveningRes.data || null,
    evening_done_today: Boolean(eveningTodayRes.data),
    yesterday: ydayRes.data
      ? { ...ydayRes.data, ships: yshipRes.count ?? 0, date: yesterday }
      : null,
    timezone: tz,
    today,
  })
}

async function post(req: VercelRequest, res: VercelResponse) {
  const body = (req.body || {}) as Record<string, unknown>
  const kind = body.kind

  if (kind !== 'morning' && kind !== 'evening') {
    return res.status(400).json({ ok: false, error: '"kind" must be "morning" or "evening"' })
  }

  const now = new Date()
  const today = ymdIn(now, await resolveTz(req))

  if (kind === 'morning') {
    const mode = body.mode
    if (mode !== 'green' && mode !== 'red') {
      return res.status(400).json({ ok: false, error: '"mode" must be "green" or "red"' })
    }
    // A skipped morning is not a reading. It records that the day was seen and
    // closed, and deliberately carries no energy or anxiety, because inventing
    // a neutral one puts a number he never gave into his own history.
    const skipped = body.skipped === true

    const row = {
      kind: 'morning' as const,
      checkin_date: today,
      skipped,
      energy: skipped ? null : clampScore(body.energy),
      anxiety: skipped ? null : clampScore(body.anxiety),
      one_word: typeof body.one_word === 'string' && body.one_word.trim() ? body.one_word.trim() : null,
      mode,
      intent: typeof body.intent === 'string' && body.intent.trim() ? body.intent.trim() : null,
      // Accountability, not scoping: which venture today is for. Null is a
      // legitimate answer ("no single venture today").
      venture: typeof body.venture === 'string' && body.venture.trim() ? body.venture.trim() : null,
    }

    // One morning row per civil day. A reload must never re-gate, so a second
    // post updates today's row instead of inserting beside it.
    const existing = await supabase.from('pilot_checkins').select('id')
      .eq('kind', 'morning').eq('checkin_date', today).maybeSingle()

    if (existing.data) {
      const { data, error } = await supabase.from('pilot_checkins')
        .update(row).eq('id', existing.data.id).select().single()
      if (error) return res.status(500).json({ ok: false, error: error.message })
      return res.json({ ok: true, checkin: data })
    }

    const { data, error } = await supabase.from('pilot_checkins').insert(row).select().single()
    if (error) return res.status(500).json({ ok: false, error: error.message })
    return res.status(201).json({ ok: true, checkin: data })
  }

  // Evening, skipped. Closes tonight's prompt without a ONE. A skip never
  // overwrites a real shutdown already filed today.
  if (body.skipped === true) {
    const existing = await supabase.from('pilot_checkins').select('id, tomorrow_one')
      .eq('kind', 'evening').eq('checkin_date', today).maybeSingle()
    if (existing.data) return res.json({ ok: true, checkin: existing.data, skipped: true })
    const { data, error } = await supabase.from('pilot_checkins')
      .insert({ kind: 'evening' as const, checkin_date: today, skipped: true })
      .select().single()
    if (error) return res.status(500).json({ ok: false, error: error.message })
    return res.status(201).json({ ok: true, checkin: data, skipped: true })
  }

  // Evening. tomorrow_one is what red mode renders tomorrow, so it is required.
  const tomorrowOne = typeof body.tomorrow_one === 'string' ? body.tomorrow_one.trim() : ''
  if (!tomorrowOne) {
    return res.status(400).json({ ok: false, error: '"tomorrow_one" is required' })
  }

  // Tomorrow's 3. Slot 1 is always the ONE; slots 2 and 3 arrive in `tomorrow`
  // when he chose them tonight. Validated before anything is written.
  const rawSlots = Array.isArray(body.tomorrow) ? body.tomorrow as Array<Partial<SlotInput>> : []
  const slots: SlotInput[] = [{ slot: 1, text: tomorrowOne }]
  for (const s of rawSlots) {
    const n = Number((s as { slot?: unknown }).slot)
    if (n !== 2 && n !== 3) continue
    const text = typeof s.text === 'string' ? s.text.trim() : ''
    if (!text) continue
    const candidate: SlotInput = { slot: n, text, goal_id: s.goal_id ?? null, job: s.job ?? null }
    const problem = validateSlot(candidate)
    if (problem) return res.status(400).json({ ok: false, error: `tomorrow[${n}]: ${problem}` })
    slots.push(candidate)
  }
  const one = rawSlots.find(s => Number((s as { slot?: unknown }).slot) === 1)
  if (one) {
    const problem = validateSlot({ slot: 1, text: tomorrowOne, goal_id: one.goal_id ?? null, job: one.job ?? null })
    if (problem) return res.status(400).json({ ok: false, error: `tomorrow[1]: ${problem}` })
    slots[0] = { slot: 1, text: tomorrowOne, goal_id: one.goal_id ?? null, job: one.job ?? null }
  }

  const row = {
    kind: 'evening' as const,
    checkin_date: today,
    skipped: false,
    shipped_today: typeof body.shipped_today === 'string' && body.shipped_today.trim()
      ? body.shipped_today.trim() : null,
    tomorrow_one: tomorrowOne,
    tomorrow_one_url: typeof body.tomorrow_one_url === 'string' && body.tomorrow_one_url.trim()
      ? body.tomorrow_one_url.trim() : null,
  }

  const existing = await supabase.from('pilot_checkins').select('id')
    .eq('kind', 'evening').eq('checkin_date', today).maybeSingle()

  let checkin: unknown
  let created = false
  if (existing.data) {
    const { data, error } = await supabase.from('pilot_checkins')
      .update(row).eq('id', existing.data.id).select().single()
    if (error) return res.status(500).json({ ok: false, error: error.message })
    checkin = data
  } else {
    const { data, error } = await supabase.from('pilot_checkins').insert(row).select().single()
    if (error) return res.status(500).json({ ok: false, error: error.message })
    checkin = data
    created = true
  }

  // The same choice, landed on tomorrow's Today list. A shutdown filed twice
  // in one evening replaces what the earlier one wrote; it never stacks.
  const tomorrow = shiftYmd(today, 1)
  const focus = await upsertSlots(tomorrow, slots, { replace: true })

  return res.status(created ? 201 : 200).json({
    ok: true,
    checkin,
    tomorrow_focus: focus.row,
    tomorrow_focus_error: focus.error,
  })
}

async function patch(req: VercelRequest, res: VercelResponse) {
  const now = new Date()
  const today = ymdIn(now, await resolveTz(req))

  const existing = await supabase.from('pilot_checkins').select('id')
    .eq('kind', 'morning').eq('checkin_date', today).maybeSingle()

  if (!existing.data) {
    return res.status(404).json({ ok: false, error: 'No morning check-in today' })
  }

  const { data, error } = await supabase.from('pilot_checkins')
    .update({ override_at: new Date().toISOString() })
    .eq('id', existing.data.id).select().single()
  if (error) return res.status(500).json({ ok: false, error: error.message })
  return res.json({ ok: true, checkin: data })
}
