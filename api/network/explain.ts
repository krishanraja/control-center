import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guard } from '../_auth.js'
import { supabase } from '../_supabase.js'
import { callClaude, robustJson, hasAnthropicKey } from '../_content.js'
import { SYNTHESIS_MODEL } from '../_models.js'
import { sharedHistoryLine, type SharedEntry } from '../../src/lib/sharedHistory.js'
import { RETIRED_VENTURES } from '../_venturePositioning.js'

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

You get the question and a numbered list of people. Each has FACTS (title, company, industry, place, LinkedIn headline, the opening of their LinkedIn summary, past roles, skills, where a profile was read) and a stored JUDGMENT (who, why_them, hook, risk) written earlier by a model.

Return STRICT JSON ONLY, no prose and no code fences:
{ "explanations": [{ "i": number, "why": string, "move": string }] }

Rules:
- "why" is ONE short sentence saying why this person answers THIS question, grounded in the FACTS first. Cite the concrete thing that matches: the title, the company, the past role, the skill, the line in their headline. "Ran retail media partnerships at a supermarket group for six years" beats "has relevant experience".
- The stored judgment can be stale or written for a different purpose, sometimes a business Krish no longer runs (${[...RETIRED_VENTURES].join(', ')}). Use it only where the facts agree with it, and never repeat a retired business's name or reasoning.
- "move" is the opening move: the channel and the first line's angle, in one short sentence. "Reply to their thread on procurement with the Maven cohort link" not "reach out to them". Name the channel from what the record shows is available (has_email, has_linkedin, has_twitter, best_channel, reachable_via) and never one it does not have.
- Where "posted" is present the person has said something publicly in the last quarter and "posting_about" says what kind of thing it was. That is the strongest opening available: respond to what they actually said, quoting or paraphrasing it. Where there is no "posted", fall back to the stored hook, then to a reciprocated email, then to what to find out first.
- Never invent a fact that is not in front of you. A "move" that assumes a relationship the record does not show is an invented fact.
- If someone is a poor match for the question, say so plainly in "why" and return "" for "move". A candidate list is not a promise that everyone on it fits.
- "tie" says which of Krish's networks they are in. "personal" or "both" means he knows them outside work, from Facebook or Instagram: that is a warm path, and the move can open as a friend rather than as a cold note. Where "personal_by_name_only" is true, that link rests on a name alone, so do not use it.
- "shared" names an employer or a school they and Krish both share. Cite it as that. Never say they worked or studied together at the same time unless it says "in the same years".
- No em dashes.`

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guard(req, res)) return

  const body = (req.body || {}) as Record<string, unknown>
  const question = typeof body.question === 'string' ? body.question.trim() : ''
  const ids = Array.isArray(body.contact_ids)
    ? body.contact_ids.map(String).filter(x => /^[0-9a-f-]{36}$/i.test(x)).slice(0, MAX_IDS)
    : []
  if (!question || !ids.length) return res.status(400).json({ ok: false, error: 'question_and_ids_required' })
  // ok:false with a reason, not an empty success. An empty success is
  // indistinguishable from "nothing to say about any of them", which is the
  // exact confusion the catch block below was rewritten to remove; this early
  // return had kept it. And hasAnthropicKey rather than the env var, so the
  // app_secrets fallback is actually reachable from here.
  if (!(await hasAnthropicKey())) {
    return res.status(200).json({
      ok: false, error: 'explain_failed', explanations: {}, moves: {},
      reason: 'no Anthropic key is configured',
    })
  }

  try {
    // Everything a "move" actually depends on.
    //
    // The prompt asks for the opening move and says to use a warm path where
    // the record shows one — then the query withheld every field that could
    // show one. No hook, no best_channel, no reachable_via, no addresses, no
    // intent. The model was being asked to name a channel it could not see and
    // to spot a warm path from data it had never been given, which is how a
    // "move" turns into "reach out to them".
    //
    // And the facts. This pass used to see the stored judgment plus the
    // import's title and company, and nothing the enrichment bought: no
    // headline, no summary, no career, no skills, not even the current title
    // for the 939 people whose job the profile scrape had updated. Someone
    // ranked on "ex-Amazon" was then explained from a why_them that never
    // mentioned Amazon, or called a poor match. Career and skills live in the
    // dossier; they are read by path so the rest of that blob stays behind.
    const { data, error } = await supabase
      .from('contact_intelligence')
      .select(`contact_id, who, why_them, hook, risk, roles, network_tier, completeness,
               best_channel, reachable_via, reciprocated_email,
               intent_stance, intent_score, intent_evidence, last_post_at,
               current_title, current_company, headline, summary, industry, seniority, country,
               tie, shared_history,
               contacts(full_name, title, company, location, email, linkedin_url, twitter_handle,
                        career:dossier->_direct->facts->career,
                        skills:dossier->_direct->facts->skills,
                        education:dossier->_direct->facts->education)`)
      .in('contact_id', ids)
    if (error) throw new Error(error.message)

    const rows = (data || []) as Array<Record<string, unknown>>
    // A personal link that rests on a name alone is not a warm path.
    const { data: idents } = await supabase.from('contact_identities')
      .select('contact_id, kind, basis').in('contact_id', ids).in('kind', ['facebook', 'instagram'])
    const social = new Map<string, string[]>()
    for (const i of (idents || []) as Array<Record<string, unknown>>) {
      social.set(String(i.contact_id), [...(social.get(String(i.contact_id)) || []), String(i.basis)])
    }
    const nameOnly = new Set([...social].filter(([, b]) => b.every(x => x === 'meta_name')).map(([k]) => k))
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
      const career = Array.isArray(c.career) ? (c.career as Array<Record<string, unknown>>) : []
      const skills = Array.isArray(c.skills) ? (c.skills as unknown[]) : []
      return {
        i,
        name: c.full_name,
        // FACTS. The profile's current title and company win over the import's,
        // the same precedence network_search now returns.
        title: r.current_title || c.title,
        company: r.current_company || c.company,
        industry: r.industry,
        seniority: r.seniority,
        place: c.location || r.country,
        headline: r.headline,
        summary: typeof r.summary === 'string' ? r.summary.slice(0, 400) : null,
        past_roles: career.slice(0, 6)
          .map(e => [e.title, e.company].filter(Boolean).join(' at '))
          .filter(Boolean),
        skills: skills.slice(0, 12).map(String),
        education: (Array.isArray(c.education) ? (c.education as Array<Record<string, unknown>>) : [])
          .slice(0, 3).map(e => [e.school, e.period].filter(Boolean).join(', ')).filter(Boolean),
        // Where he knows them from, and what they share. See the prompt.
        tie: r.tie ?? null,
        personal_by_name_only: nameOnly.has(String(r.contact_id)),
        shared: sharedHistoryLine(r.shared_history as SharedEntry[] | null),
        // JUDGMENT, stored earlier. See the prompt: facts first.
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
