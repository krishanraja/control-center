import type { VercelRequest, VercelResponse } from '@vercel/node'
import { weekOfLabel } from './_week.js'
import { supabase } from './_supabase.js'
import { syncNorthStar } from './_northStar.js'
import { isJob } from './_mission.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(200).end()

  // GET was removed 2026-08-11. It returned ONLY horizon='weekly' rows joined
  // to tasks, which is a third answer to "what are the goals" beside
  // /api/goals/ladder and /api/objectives. It had zero callers in src/ and no
  // checked-in n8n workflow referenced it. GET /api/goals/ladder is the one
  // read. PATCH below stays: it is the ladder's mutation path.
  if (req.method === 'GET') {
    return res.status(410).json({
      ok: false,
      error: 'GET /api/goals is retired. Use GET /api/goals/ladder for the whole ladder.',
    })
  }

  // POST was removed 2026-08-20. It could still mint orphan weekly rows
  // (hardcoded horizon, no gate, no parent requirement) and had zero callers:
  // the guard even named it a forbidden creator. POST /api/objectives is the
  // one gated create.
  if (req.method === 'POST') {
    return res.status(410).json({
      ok: false,
      error: 'POST /api/goals is retired. Create goals via POST /api/objectives (gated).',
    })
  }

  // DELETE was removed 2026-08-20. Retiring a goal is a status change
  // (PATCH status: dropped), never a row deletion: the row carries history
  // that learning signals and the chronicle hang off.
  if (req.method === 'DELETE') {
    return res.status(410).json({
      ok: false,
      error: 'DELETE /api/goals is retired. Retire a goal with PATCH { goalId, status: "dropped" }.',
    })
  }

  if (req.method === 'PATCH') {
    const body = req.body || {}

    // team_focus is retired (2026-08-20): the weekly rung of the ladder is the
    // one answer to "what is this week about". The free-text line beside it was
    // the last second store.
    if (body.team_focus !== undefined) {
      return res.status(400).json({
        ok: false,
        error: 'team_focus is retired. The weekly rung of the goal ladder is the weekly focus.',
      })
    }
    // north_star is NOT writable here any more. It is a mirror of the ladder's
    // OS rung (api/_northStar.ts), not a store. It had a write path that no UI
    // ever called, which is exactly how it came to sit unchanged from April to
    // August while Home rendered it as the mission.
    if (body.north_star !== undefined) {
      return res.status(400).json({
        ok: false,
        error: 'north_star is derived from the OS rung of the goal ladder. Edit the OS goal instead.',
      })
    }

    if (body.goalId) {
      // Pre-fetch so we can detect an *amendment* to one of Marcus's nominated
      // goals: we need the prior title to compare against and the goal's source
      // (provenance survives acceptance — see api/objectives/[id]/nominate-accept.ts).
      const { data: existing } = await supabase
        .from('goals')
        // `current` is read below for the amendment audit record. It was
        // missing here, so that record wrote current:null even when the goal
        // had a value — a silent hole in the provenance trail, surfaced by
        // the type error this select was causing.
        .select('title, source, venture, objective_kind, horizon, current')
        .eq('id', body.goalId)
        .single()

      const updates: any = { updated_at: new Date().toISOString() }
      if (body.title !== undefined) updates.title = body.title
      // Which of the five jobs of the OS this serves (api/_mission.ts). Null
      // clears it; anything outside the five is refused rather than stored.
      if (body.job !== undefined) {
        if (body.job !== null && !isJob(body.job)) {
          return res.status(400).json({ ok: false, error: `unknown job '${body.job}'` })
        }
        updates.job = body.job
      }
      // current / progress / notes retired with the legacy weekly-goal columns
      // (2026-08-20): done is a STATUS, not a percentage.
      // Retiring a goal is a status change, never a DELETE. Canon Rule A wants
      // decay reversible, and the row carries history the learning signals and
      // the chronicle hang off. Whitelisted so a client cannot invent a status
      // that no surface filters on, which would make the goal invisible
      // everywhere and unrecoverable from the UI.
      if (body.status !== undefined) {
        // Mirrors goals_status_objective_check exactly. 'archived' is NOT in it:
        // sending it returned a raw Postgres constraint error to the UI. Keep
        // these in step with the constraint, or the whitelist just moves the
        // failure one layer down.
        const ALLOWED_STATUS = new Set(['proposed', 'active', 'paused', 'done', 'dropped'])
        if (!ALLOWED_STATUS.has(String(body.status))) {
          return res.status(400).json({ ok: false, error: `unknown status '${body.status}'` })
        }
        updates.status = body.status
      }
      const { error } = await supabase.from('goals').update(updates).eq('id', body.goalId)
      if (error) {
        return res.status(500).json({ ok: false, error: error.message })
      }

      // Editing or retiring an OS goal changes what the mirror should say.
      if (existing?.horizon === 'os') await syncNorthStar()

      // Amendment-as-feedback: reshaping the *title* of a Marcus-nominated goal
      // is an objective-altitude override that should feed his learning loop.
      // Mirrors the override shape in api/objectives/[id]/nominate-reject.ts so
      // Vera's weekly aggregation clusters it (reason_code != 'other' => >= 2
      // threshold). Progress/notes/current edits and edits to krish_declared
      // goals write nothing: those self-authored goals reach Marcus via synthesis
      // grounding, not the correction loop. Best-effort (matches calibrate.ts):
      // the goal edit already succeeded, so a feedback-write hiccup is swallowed.
      const newTitle = typeof body.title === 'string' ? body.title.trim() : ''
      if (existing && existing.source === 'marcus_nominated' && newTitle.length > 0 && newTitle !== (existing.title || '')) {
        await supabase.from('feedback_queue').insert({
          source_table: 'goals',
          source_id: body.goalId,
          agent_id: 'marcus',
          original_agent: 'marcus',
          original_item_id: body.goalId,
          vote: -1,
          reason_code: 'marcus_objective_amended',
          reason_text: newTitle,
          meta: {
            original_title: existing.title || null,
            new_title: newTitle,
            current: existing.current || null,
            venture: existing.venture || null,
            objective_kind: existing.objective_kind || null,
            source: existing.source,
            captured_at: new Date().toISOString(),
          },
          status: 'pending',
        })
      }
    }

    const { data: goals } = await supabase.from('goals').select('*').order('created_at')
    const { data: configs } = await supabase.from('system_config').select('*').in('key', ['north_star'])
    const cfg: Record<string, string> = {}
    for (const c of configs || []) cfg[c.key] = c.value

    return res.json({
      ok: true,
      goals: { goals: goals || [], north_star: cfg.north_star || '', week_of: weekOfLabel() }
    })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
// deploy trigger Wed Apr 22 09:34:24 PM UTC 2026
