import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { compileWorry, CompilerSchemaError } from '../_worry-prompt.js'

/**
 * /api/pilot/worries
 *
 * One file, four actions, dispatched on method plus a discriminator, because
 * the addendum specifies a single route. Unauthenticated, matching every other
 * operator-facing route in the repo including the LLM ones (api/skills/generate,
 * api/ask-marcus). The OpenAI key never leaves the server.
 *
 *   POST   { action: 'compile', raw_text }  compile only, writes nothing
 *   POST   { ...compilation }               validate, enforce the cap, write
 *   GET                                     tests due today + calibration
 *   PATCH  { id, outcome, outcome_note? }   close a test
 *
 * There is deliberately NO endpoint that lists worries. The only rows this
 * route will ever hand back are tests due today and, on a cap rejection, the
 * five open tests blocking the save. Raw text is never returned after save.
 * Adding a list endpoint would turn the compiler into the archive it exists to
 * prevent. Do not add one.
 */

const OPEN_TEST_CAP = 5
const PILOT_TZ = 'America/New_York'
const WEATHER_DAYS = 7

/** Today's civil date in the pilot zone as YYYY-MM-DD. Mirrors src/lib/pilotDay.ts. */
function pilotToday(at: Date = new Date()): string {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: PILOT_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(at)
  const get = (t: string) => f.find(p => p.type === t)?.value || ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const base = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  base.setUTCDate(base.getUTCDate() + days)
  return base.toISOString().slice(0, 10)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    if (req.method === 'GET') return await due(res)
    if (req.method === 'PATCH') return await outcome(req, res)
    if (req.method === 'POST') {
      const body = (req.body || {}) as Record<string, unknown>
      return body.action === 'compile' ? await compile(body, res) : await save(body, res)
    }
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unexpected error'
    const status = e instanceof CompilerSchemaError ? 502 : 500
    return res.status(status).json({ ok: false, error: message })
  }
}

/** POST { action: 'compile', raw_text }. Proposes, never writes. */
async function compile(body: Record<string, unknown>, res: VercelResponse) {
  const rawText = typeof body.raw_text === 'string' ? body.raw_text.trim() : ''
  if (!rawText) return res.status(400).json({ ok: false, error: '"raw_text" is required' })
  if (rawText.length > 4000) return res.status(400).json({ ok: false, error: '"raw_text" is too long' })

  // Throws CompilerSchemaError after one retry on malformed output, which the
  // handler turns into a 502 with a real body. Never a 200 wrapping an error.
  const compilation = await compileWorry(rawText)
  return res.json({ ok: true, compilation, raw_text: rawText })
}

/** The five open tests, used only to explain a cap rejection. */
async function openTests() {
  const { data, error } = await supabase
    .from('worries')
    .select('id, prediction, test_due_date')
    .eq('state', 'test')
    .is('closed_at', null)
    .order('test_due_date', { ascending: true })
  if (error) throw new Error(error.message)
  return data || []
}

/** POST the confirmed compilation. The operator may have edited any field. */
async function save(body: Record<string, unknown>, res: VercelResponse) {
  const rawText = typeof body.raw_text === 'string' ? body.raw_text.trim() : ''
  if (!rawText) return res.status(400).json({ ok: false, error: '"raw_text" is required' })

  const state = body.state
  if (state !== 'test' && state !== 'action' && state !== 'relitigation' && state !== 'weather') {
    return res.status(400).json({ ok: false, error: '"state" must be test, action, relitigation, or weather' })
  }

  const str = (k: string): string => (typeof body[k] === 'string' ? (body[k] as string).trim() : '')
  const now = new Date().toISOString()
  const today = pilotToday()

  if (state === 'test') {
    const belief = str('belief')
    const prediction = str('prediction')
    const testPlan = str('test_plan')
    const dueDate = str('test_due_date')
    if (!belief || !prediction || !testPlan || !dueDate) {
      return res.status(400).json({
        ok: false,
        error: 'A test needs belief, prediction, test_plan, and test_due_date',
      })
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      return res.status(400).json({ ok: false, error: '"test_due_date" must be YYYY-MM-DD' })
    }
    // A past due date would make the test read as already due the moment it is
    // saved, which is how a test becomes another thing nagging at him.
    if (dueDate < today) {
      return res.status(400).json({ ok: false, error: 'A test cannot be due in the past' })
    }

    // The cap. Server-side, so the UI cannot route around it.
    const open = await openTests()
    if (open.length >= OPEN_TEST_CAP) {
      return res.status(409).json({
        ok: false,
        error: 'Five tests are open. Close one to open another.',
        open_tests: open,
      })
    }

    const { data, error } = await supabase.from('worries').insert({
      raw_text: rawText, state, belief, prediction,
      test_plan: testPlan, test_due_date: dueDate,
    }).select('id, state, closed_at, expires_at, test_due_date').single()
    if (error) return res.status(500).json({ ok: false, error: error.message })
    return res.status(201).json({ ok: true, worry: data })
  }

  if (state === 'action') {
    const actionText = str('action_text')
    if (!actionText) return res.status(400).json({ ok: false, error: '"action_text" is required' })
    const disposition = body.action_disposition
    if (disposition !== 'done_now' && disposition !== 'tomorrow_one') {
      return res.status(400).json({ ok: false, error: '"action_disposition" must be done_now or tomorrow_one' })
    }

    // tomorrow_one writes through the same evening-checkin mechanism the
    // shutdown uses, so there is one place a ONE can come from.
    if (disposition === 'tomorrow_one') {
      const existing = await supabase.from('pilot_checkins')
        .select('id, tomorrow_one')
        .eq('kind', 'evening')
        .not('tomorrow_one', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1).maybeSingle()

      const hasOne = Boolean(existing.data?.tomorrow_one)
      if (hasOne && body.confirm_overwrite !== true) {
        return res.status(409).json({
          ok: false,
          error: 'A ONE is already set for tomorrow.',
          existing_one: existing.data?.tomorrow_one,
          needs_confirm: true,
        })
      }
      if (hasOne && existing.data) {
        await supabase.from('pilot_checkins')
          .update({ tomorrow_one: actionText }).eq('id', existing.data.id)
      } else {
        await supabase.from('pilot_checkins')
          .insert({ kind: 'evening', tomorrow_one: actionText })
      }
    }

    const { data, error } = await supabase.from('worries').insert({
      raw_text: rawText, state, action_text: actionText,
      action_disposition: disposition, closed_at: now,
    }).select('id, state, closed_at, expires_at, test_due_date').single()
    if (error) return res.status(500).json({ ok: false, error: error.message })
    return res.status(201).json({ ok: true, worry: data })
  }

  if (state === 'relitigation') {
    const note = str('outcome_note') || 'no new evidence'
    const { data, error } = await supabase.from('worries').insert({
      raw_text: rawText, state, outcome_note: note, closed_at: now,
    }).select('id, state, closed_at, expires_at, test_due_date').single()
    if (error) return res.status(500).json({ ok: false, error: error.message })
    return res.status(201).json({ ok: true, worry: data })
  }

  // weather. Labelled, given a 7-day shelf life, and left alone.
  const { data, error } = await supabase.from('worries').insert({
    raw_text: rawText, state,
    outcome_note: str('label') || null,
    expires_at: new Date(`${addDays(today, WEATHER_DAYS)}T00:00:00Z`).toISOString(),
  }).select('id, state, closed_at, expires_at, test_due_date').single()
  if (error) return res.status(500).json({ ok: false, error: error.message })
  return res.status(201).json({ ok: true, worry: data })
}

/** GET: tests due today, plus calibration once enough tests have closed. */
async function due(res: VercelResponse) {
  const today = pilotToday()

  // Weather expires lazily on read. No cron, and nothing accumulates.
  await supabase.from('worries')
    .update({ closed_at: new Date().toISOString() })
    .eq('state', 'weather')
    .is('closed_at', null)
    .lte('expires_at', new Date().toISOString())

  const [dueRes, closedRes] = await Promise.all([
    supabase.from('worries')
      .select('id, prediction, test_plan, test_due_date')
      .eq('state', 'test').is('closed_at', null).lte('test_due_date', today)
      .order('test_due_date', { ascending: true }),
    supabase.from('worries')
      .select('outcome')
      .eq('state', 'test').not('outcome', 'is', null),
  ])
  if (dueRes.error) return res.status(500).json({ ok: false, error: dueRes.error.message })
  if (closedRes.error) return res.status(500).json({ ok: false, error: closedRes.error.message })

  const closed = closedRes.data || []
  const total = closed.length
  const pct = (o: string) => (total ? Math.round((closed.filter(r => r.outcome === o).length / total) * 100) : 0)

  return res.json({
    ok: true,
    due: dueRes.data || [],
    calibration: {
      total_closed: total,
      pct_confirmed: pct('confirmed'),
      pct_disconfirmed: pct('disconfirmed'),
      pct_partial: pct('partial'),
    },
    open_test_count: (await openTests()).length,
    cap: OPEN_TEST_CAP,
    today,
  })
}

/** PATCH { id, outcome, outcome_note? }. Closes a test. Rejects a reclose. */
async function outcome(req: VercelRequest, res: VercelResponse) {
  const body = (req.body || {}) as Record<string, unknown>
  const id = typeof body.id === 'string' ? body.id.trim() : ''
  const result = body.outcome
  if (!id) return res.status(400).json({ ok: false, error: '"id" is required' })
  if (result !== 'confirmed' && result !== 'disconfirmed' && result !== 'partial') {
    return res.status(400).json({ ok: false, error: '"outcome" must be confirmed, disconfirmed, or partial' })
  }

  const existing = await supabase.from('worries')
    .select('id, state, closed_at').eq('id', id).maybeSingle()
  if (existing.error) return res.status(500).json({ ok: false, error: existing.error.message })
  if (!existing.data) return res.status(404).json({ ok: false, error: 'No such worry' })
  if (existing.data.state !== 'test') {
    return res.status(400).json({ ok: false, error: 'Only tests carry an outcome' })
  }
  if (existing.data.closed_at) {
    return res.status(409).json({ ok: false, error: 'That test is already closed' })
  }

  const { data, error } = await supabase.from('worries').update({
    outcome: result,
    outcome_note: typeof body.outcome_note === 'string' && body.outcome_note.trim()
      ? body.outcome_note.trim() : null,
    closed_at: new Date().toISOString(),
  }).eq('id', id).select('id, state, outcome, closed_at').single()
  if (error) return res.status(500).json({ ok: false, error: error.message })
  return res.json({ ok: true, worry: data })
}
