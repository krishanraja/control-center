import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guard } from '../_auth.js'
import { supabase } from '../_supabase.js'
import { callClaude, robustJson } from '../_content.js'
import { SYNTHESIS_MODEL } from '../_models.js'

// POST /api/network/explain
//   { question, contact_ids: string[] }
//   -> { ok, explanations: { [contact_id]: string } }
//
// Phase two of a search. /api/network/search returns the ranked list fast; this
// fills in the per-person "why does this answer THAT question" line behind an
// already-rendered result set.
//
// It is split out because it was measured as the whole problem: search took
// 33.5s with the explanation pass inline and 8.2s without, and 33s on a phone
// reads as a hang, not as thinking. Ranking never depended on it. The scorer
// decides the order; the model only says why.

export const config = { maxDuration: 60 }

const MODEL = SYNTHESIS_MODEL
const MAX_IDS = 12

const SYSTEM = `You are explaining why each person answers a question about Krish Raja's professional network.

You get the question and a numbered list of people, each with their role, company, relationship tier and the stored judgment about them.

Return STRICT JSON ONLY, no prose and no code fences:
{ "explanations": [{ "i": number, "why": string, "move": string }] }

Rules:
- "why" is ONE short sentence, grounded ONLY in that person's supplied fields, saying why they answer THIS question. Cite the concrete thing: their role, their company, the stored reason.
- "move" is the opening move: the channel and the first line's angle, in one short sentence. "Reply to their thread on procurement with the Maven cohort link" not "reach out to them". Name the channel from what the record shows is available (has_email, has_linkedin, has_twitter, best_channel, reachable_via) and never one it does not have.
- Where "posted" is present the person has said something publicly in the last quarter and "posting_about" says what kind of thing it was. That is the strongest opening available: respond to what they actually said, quoting or paraphrasing it. Where there is no "posted", fall back to the stored hook, then to a reciprocated email, then to what to find out first.
- Never invent a fact that is not in front of you. A "move" that assumes a relationship the record does not show is an invented fact.
- If someone is a poor match for the question, say so plainly in "why" and return "" for "move". A candidate list is not a promise that everyone on it fits.
- No em dashes.`

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guard(req, res)) return

  const body = (req.body || {}) as Record<string, unknown>
  const question = typeof body.question === 'string' ? body.question.trim() : ''
  const ids = Array.isArray(body.contact_ids)
    ? body.contact_ids.map(String).filter(x => /^[0-9a-f-]{36}$/i.test(x)).slice(0, MAX_IDS)
    : []
  if (!question || !ids.length) return res.status(400).json({ ok: false, error: 'question_and_ids_required' })
  if (!process.env.ANTHROPIC_API_KEY) return res.status(200).json({ ok: true, explanations: {} })

  try {
    // Everything a "move" actually depends on.
    //
    // The prompt asks for the opening move and says to use a warm path where
    // the record shows one — then the query withheld every field that could
    // show one. No hook, no best_channel, no reachable_via, no addresses, no
    // intent. The model was being asked to name a channel it could not see and
    // to spot a warm path from data it had never been given, which is how a
    // "move" turns into "reach out to them".
    const { data, error } = await supabase
      .from('contact_intelligence')
      .select(`contact_id, who, why_them, hook, risk, roles, network_tier, completeness,
               best_channel, reachable_via, reciprocated_email,
               intent_stance, intent_score, intent_evidence, last_post_at,
               contacts(full_name, title, company, email, linkedin_url, twitter_handle)`)
      .in('contact_id', ids)
    if (error) throw new Error(error.message)

    const rows = (data || []) as Array<Record<string, unknown>>
    // Preserve the caller's order so index i means the same thing on both sides.
    const byId = new Map(rows.map(r => [String(r.contact_id), r]))
    const ordered = ids.map(id => byId.get(id)).filter(Boolean) as Array<Record<string, unknown>>
    if (!ordered.length) return res.status(200).json({ ok: true, explanations: {} })

    const candidates = ordered.map((r, i) => {
      const c = (r.contacts || {}) as Record<string, unknown>
      // Intent is only offered when it is LIVE. The stored score is a snapshot
      // and nothing decays it on read, so a stance whose evidence has aged past
      // the cliff must not be handed to a model that will dutifully build an
      // opening line out of it.
      const lastPost = r.last_post_at ? Date.parse(String(r.last_post_at)) : NaN
      const intentLive = Number.isFinite(lastPost)
        && Date.now() - lastPost < 90 * 86_400_000
        && Number(r.intent_score ?? 0) > 0
      return {
        i,
        name: c.full_name, title: c.title, company: c.company,
        tier: r.network_tier, roles: r.roles,
        who: r.who, why_them: r.why_them, hook: r.hook, risk: r.risk,
        // The warm paths. Named so the model can cite one instead of inventing
        // a relationship the record does not show.
        best_channel: r.best_channel,
        reachable_via: r.reachable_via,
        reciprocated_email: r.reciprocated_email,
        has_email: Boolean(c.email),
        has_linkedin: Boolean(c.linkedin_url),
        has_twitter: Boolean(c.twitter_handle),
        // What they are publicly doing about AI right now, with the sentence
        // that says so. The single best opening a cold record can offer.
        posting_about: intentLive ? r.intent_stance : null,
        posted: intentLive ? r.intent_evidence : null,
        // Same test network_search uses, for the same reason: thinness is a
        // property of the record, not of the importer that wrote it. Keeping
        // intel_method here told the model "no profile was ever read" about
        // people we had just bought a full profile for.
        thin_evidence: Number(r.completeness ?? 0) < 50,
      }
    })

    const text = await callClaude({
      agent: 'network-explain',
      model: MODEL,
      system: SYSTEM,
      user: `QUESTION:\n${question}\n\nPEOPLE:\n${JSON.stringify(candidates, null, 1)}`,
      maxTokens: 900,
      temperature: 0,
      // Well under maxDuration. If it misses, the caller keeps the stored
      // why_them it is already showing rather than getting an error.
      timeoutMs: 25_000,
    })
    const parsed = robustJson(text) as { explanations?: { i: number; why: string; move?: string }[] } | null

    const clean = (v: unknown) => String(v ?? '').replace(/\s*[—–]\s*/g, ', ').slice(0, 400)
    const explanations: Record<string, string> = {}
    const moves: Record<string, string> = {}
    for (const e of parsed?.explanations || []) {
      const idx = Number(e?.i)
      const row = ordered[idx]
      if (row && typeof e.why === 'string') {
        explanations[String(row.contact_id)] = clean(e.why)
        if (e.move) moves[String(row.contact_id)] = clean(e.move)
      }
    }
    return res.status(200).json({ ok: true, explanations, moves })
  } catch (e: unknown) {
    // ok:false, not ok:true-with-nothing.
    //
    // This used to answer a failure with `{ ok: true, explanations: {} }` and a
    // `reason` the client never read, on the grounds that the list is already
    // on screen and this pass is an enrichment. Both halves are true and the
    // conclusion still does not follow: an empty success is indistinguishable
    // from "Marcus looked and had nothing to say about any of them", so the one
    // person who could retry never learns there is anything to retry.
    return res.status(200).json({
      ok: false,
      error: 'explain_failed',
      explanations: {},
      moves: {},
      reason: (e as Error)?.message?.slice(0, 120),
    })
  }
}
