import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { transcribeRequest } from '../_whisper.js'

// POST /api/objectives/voice   (audio body; bodyParser off)
//   Query: ?goal_id=<id>  optional — focus the narration on one objective.
//
// The objective-altitude voice flow Krish asked for: he narrates what he thinks
// of his objectives (is the priority order right? is this one mis-leveled? what
// would he change?), and Marcus turns it into a STRUCTURED, confirmable change
// set — nothing is applied here. The client renders the summary + diff and only
// then calls PATCH /api/objectives/:id and propose-milestones (recalibrate).
//
// Two steps, both server-side:
//   1. Whisper transcription (shared transcribeRequest).
//   2. Marcus (Sonnet 4.6) interprets the transcript against the live portfolio
//      (read here, so the client sends only audio) into the proposal schema.
//
// Returns { ok, transcript, proposal } or { ok:false, fallback:'text', reason }.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-6'

interface ObjectiveLite {
  id: string
  title: string
  venture: string | null
  priority: number | null
  primary_kpi: string | null
  definition_of_done: string | null
  why_now: string | null
}

const SYSTEM = `You are Marcus, the BD/COO intelligence agent for Krish Raja's AI operating system.
Krish has just spoken a free-form reaction to his PORTFOLIO OBJECTIVES — the multi-week unlocks that sit ABOVE weekly milestones. He may be telling you: the priority ORDER is wrong; an objective is worded badly; an objective is mis-LEVELED (it's really a weekly milestone and a bigger objective belongs above it); or what KPI/definition it should have.

Translate his narration into a precise, minimal change set. Rules:
- Only propose changes he actually implied. Do not invent objectives he didn't ask for.
- "Re-level" = when an objective is really a milestone: promote a bigger outcome objective above it, and demote the current one to a milestone under that new objective. Example shape Krish has used: "Build a repeatable Builder Economy guest pipeline" should become a milestone under a new objective "Launch Builder Economy podcast with guests in the pipeline."
- reprioritize: list ONLY the objectives whose priority should change, with their new integer priority (1 = highest). Keep the set internally consistent.
- edits: per objective, only the fields he wants changed.
- recalibrate_goal_ids: objectives whose milestones Marcus should regenerate because their shape changed.
- Keep summary to one sentence Krish can confirm at a glance.

Output STRICT JSON ONLY (no prose, no code fences) matching exactly:
{
  "summary": string,
  "reprioritize": [{ "id": string, "title": string, "priority": number }],
  "edits": [{ "id": string, "title"?: string, "primary_kpi"?: string, "definition_of_done"?: string, "why_now"?: string }],
  "relevel": null | { "promote": { "suggested_id": string, "title": string, "venture": string|null, "primary_kpi": string|null, "definition_of_done": string|null, "why_now": string|null }, "demote": { "objective_id": string, "as_milestone_title": string } },
  "recalibrate_goal_ids": [string],
  "notes": string
}
Empty arrays and null are valid. suggested_id for a new objective follows the existing convention obj:<venture>:<slug>.`

function parseJsonLoose(text: string): unknown | null {
  const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  try { return JSON.parse(cleaned) } catch { /* fall through */ }
  const a = cleaned.indexOf('{'); const b = cleaned.lastIndexOf('}')
  if (a >= 0 && b > a) { try { return JSON.parse(cleaned.slice(a, b + 1)) } catch { /* nope */ } }
  return null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, fallback: 'text', reason: 'method_not_allowed' })

  // 1. Transcribe.
  const { status, result } = await transcribeRequest(req)
  if (!result.ok) return res.status(status).json(result)
  const transcript = result.text

  // 2. Ground Marcus in the live portfolio (active objectives by priority).
  const focusId = typeof req.query.goal_id === 'string' ? req.query.goal_id : null
  const { data: rows } = await supabase
    .from('goals')
    .select('id, title, venture, priority, primary_kpi, definition_of_done, why_now')
    .eq('status', 'active')
    .order('priority', { ascending: true, nullsFirst: false })
  const portfolio = (rows || []) as ObjectiveLite[]

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    // Degrade gracefully: hand back the transcript so the UI can still let Krish
    // edit/reprioritize manually.
    return res.status(200).json({ ok: true, transcript, proposal: null, reason: 'missing_anthropic_key' })
  }

  const userContent = [
    focusId ? `Krish is focused on objective: ${focusId}` : 'Krish is reacting to the whole portfolio.',
    '',
    'CURRENT ACTIVE OBJECTIVES (priority order):',
    JSON.stringify(portfolio, null, 2),
    '',
    'KRISH (transcribed narration):',
    transcript,
  ].join('\n')

  const ctrl = new AbortController()
  const tid = setTimeout(() => ctrl.abort('marcus_timeout'), 45_000)
  try {
    const r = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system: SYSTEM,
        messages: [{ role: 'user', content: userContent }],
      }),
      signal: ctrl.signal,
    })
    if (!r.ok) {
      return res.status(200).json({ ok: true, transcript, proposal: null, reason: `marcus_${r.status}` })
    }
    const j = (await r.json()) as { content?: Array<{ text?: string }> }
    const text = (j.content || []).map(c => c.text || '').join('').trim()
    const proposal = parseJsonLoose(text)
    return res.status(200).json({ ok: true, transcript, proposal: proposal || null, ...(proposal ? {} : { reason: 'marcus_unparseable', raw: text.slice(0, 500) }) })
  } catch (e: unknown) {
    const reason = (e as Error)?.name === 'AbortError' ? 'marcus_timeout' : 'marcus_error'
    return res.status(200).json({ ok: true, transcript, proposal: null, reason })
  } finally {
    clearTimeout(tid)
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
}
