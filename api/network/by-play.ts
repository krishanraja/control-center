import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guard } from '../_auth.js'
import { supabase } from '../_supabase.js'
import type { NetworkResult } from '../_networkSearch.js'

// POST /api/network/by-play  { play?, employer?, limit? }
//   -> { ok, results: NetworkResult[], restated, counts, employers }
//
// Browse the network by what each person can do for Krish, not by what they
// match. The five plays are his own categories (2026-10-03): alumni, the
// people he has worked beside; multipliers, one relationship that reaches many
// buyers; buyers, who hold a commercial budget; amplifiers, who put him in
// rooms or in print; subjects, AI-native builders for makeyourmindup.
//
// The rows are NetworkResult so they land in the same list, the same person
// sheet and the same score breakdown as a search. There is no question, so the
// score is network_search's own no-question formula, mirrored here term for
// term: (0.18 relationship + 0.10 actionability) / 0.28. The breakdown already
// says "Ranked on who you know, not on the words you used" for exactly this
// case, so it tells the truth without being changed.

export const config = { maxDuration: 30 }

const PLAYS = ['alumni', 'multiplier', 'buyer', 'amplifier', 'subject'] as const
type Play = typeof PLAYS[number]

/** What each door says when it opens. Plain, and true of the rule behind it. */
const RESTATE: Record<Play, string> = {
  alumni: 'People who worked at a company you worked at, senior ones first',
  multiplier: 'People who can put you in front of many buyers at once',
  buyer: 'People who hold a commercial budget',
  amplifier: 'People who can put you in a room or in print',
  subject: 'Founders building with AI, for makeyourmindup',
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/** network_search's relationship term, unchanged. A guessed warmth is read at
 *  most 50, as it is everywhere since 20261003210000. */
function relationship(r: Record<string, unknown>): number {
  const warmth = Number(r.warmth ?? 0)
  const usable = r.warmth_source === 'measured' ? warmth : Math.min(warmth, 50)
  return 0.40 * (Number(r.tier_weight ?? 0) / 100)
    + 0.30 * (usable / 100)
    + 0.15 * (r.reciprocated_email ? 1 : 0)
    + 0.15 * (Math.min(Number(r.source_count ?? 0), 5) / 5)
}

/** network_search's actionability term, unchanged. */
function actionability(r: Record<string, unknown>): number {
  const reach = Array.isArray(r.reachable_via) && r.reachable_via.length > 0 ? 0.26 : 0
  const conf = r.confidence === 'high' ? 0.18 : r.confidence === 'medium' ? 0.11 : 0.03
  const complete = 0.24 * (Number(r.completeness ?? 0) / 100)
  const f = Number(r.followers)
  const followTerm = Number.isFinite(f) && f > 0 ? Math.min(1, Math.log(Math.max(f, 1)) / Math.log(20000)) : 0
  const voice = r.is_influencer ? 0.90 : r.is_creator ? 0.55 : 0
  const posted = r.last_post_at ? Date.parse(String(r.last_post_at)) : NaN
  const live = Number.isFinite(posted) && Date.now() - posted < 90 * 86_400_000 ? Number(r.intent_score ?? 0) : 0
  return reach + conf + complete + 0.17 * Math.max(followTerm, voice) + 0.15 * (live / 100)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guard(req, res, ['GET', 'POST'])) return

  // GET: just the doors, with their counts, for the picker to draw before
  // anything is chosen.
  if (req.method === 'GET') {
    try {
      const [{ data: tenures }, counts] = await Promise.all([
        supabase.from('krish_tenures').select('key, label, closeness').order('closeness').order('label'),
        Promise.all(PLAYS.map(async p => {
          const { count } = await supabase.from('contact_intelligence')
            .select('contact_id', { count: 'exact', head: true }).contains('plays', [p])
          return [p, count ?? 0] as const
        })),
      ])
      return res.status(200).json({ ok: true, counts: Object.fromEntries(counts), employers: tenures || [] })
    } catch (err) {
      return res.status(500).json({ ok: false, error: String((err as Error)?.message || err).slice(0, 300) })
    }
  }

  const body = (req.body || {}) as Record<string, unknown>
  const play = PLAYS.includes(body.play as Play) ? (body.play as Play) : 'alumni'
  const employer = typeof body.employer === 'string' && /^[a-z_]{2,30}$/.test(body.employer) ? body.employer : null
  const limit = Math.max(1, Math.min(100, Number(body.limit) || 40))

  try {
    // An employer is its own question. Microsoft is marked wide, so nobody is
    // alumni because of it, and asking for "alumni at Microsoft" would return
    // only the few who are alumni of somewhere else as well.
    const { data: idRows, error } = await supabase.rpc('network_by_play', {
      p_play: employer ? null : play, p_employer: employer, p_limit: limit,
    })
    if (error) throw new Error(error.message)
    const ids = ((idRows || []) as Array<{ contact_id: string }>).map(r => r.contact_id)

    // Counts for the doors, and the employers for the alumni door. Small and
    // cheap enough to send every time, so the chips never show a stale number.
    const [{ data: tenures }, counts] = await Promise.all([
      supabase.from('krish_tenures').select('key, label, closeness').order('closeness').order('label'),
      Promise.all(PLAYS.map(async p => {
        const { count } = await supabase.from('contact_intelligence')
          .select('contact_id', { count: 'exact', head: true }).contains('plays', [p])
        return [p, count ?? 0] as const
      })),
    ])

    let results: NetworkResult[] = []
    if (ids.length) {
      const { data, error: dErr } = await supabase
        .from('contact_intelligence')
        .select(`contact_id, who, why_them, hook, risk, roles, surface_when, venture_scores, network_tier,
                 tier_weight, warmth, warmth_source, confidence, intel_method, seniority, country, geo_code,
                 industry, reachable_via, best_channel, source_count, reciprocated_email, followers,
                 completeness, intent_score, intent_topics, intent_summary, intent_stance, intent_evidence,
                 intent_evidence_url, last_post_at, is_influencer, is_creator, sells_competing_services,
                 current_title, current_company, shared_history, plays,
                 contacts(full_name, company, title, email, linkedin_url, twitter_handle,
                          origin_channel, origin_campaign, first_met_context)`)
        .in('contact_id', ids)
      if (dErr) throw new Error(dErr.message)

      const byId = new Map((data || []).map((r: Record<string, unknown>) => [String(r.contact_id), r]))
      results = ids.map(id => byId.get(id)).filter(Boolean).map(raw => {
        const r = raw as Record<string, unknown>
        const c = (r.contacts || {}) as Record<string, unknown>
        const rel = clamp01(relationship(r))
        const act = clamp01(actionability(r))
        const posted = r.last_post_at ? Date.parse(String(r.last_post_at)) : NaN
        const live = Number.isFinite(posted) && Date.now() - posted < 90 * 86_400_000
        return {
          contact_id: String(r.contact_id),
          full_name: (c.full_name as string) ?? null,
          company: (r.current_company as string) || (c.company as string) || null,
          title: (r.current_title as string) || (c.title as string) || null,
          email: (c.email as string) ?? null,
          linkedin_url: (c.linkedin_url as string) ?? null,
          twitter_handle: (c.twitter_handle as string) ?? null,
          origin_channel: (c.origin_channel as string) ?? null,
          origin_campaign: (c.origin_campaign as string) ?? null,
          first_met_context: (c.first_met_context as string) ?? null,
          followers: (r.followers as number) ?? null,
          completeness: Number(r.completeness ?? 0),
          intent_score: live ? (r.intent_score as number) ?? null : (r.intent_score == null ? null : 0),
          intent_stance: (r.intent_stance as string) ?? null,
          intent_evidence: (r.intent_evidence as string) ?? null,
          intent_evidence_url: (r.intent_evidence_url as string) ?? null,
          intent_topics: (r.intent_topics as string[]) ?? null,
          intent_summary: (r.intent_summary as string) ?? null,
          last_post_at: (r.last_post_at as string) ?? null,
          who: (r.who as string) ?? null,
          why_them: (r.why_them as string) ?? null,
          hook: (r.hook as string) ?? null,
          risk: (r.risk as string) ?? null,
          roles: (r.roles as string[]) ?? [],
          surface_when: (r.surface_when as string[]) ?? [],
          network_tier: String(r.network_tier ?? ''),
          best_channel: (r.best_channel as string) ?? null,
          reachable_via: (r.reachable_via as string[]) ?? [],
          confidence: String(r.confidence ?? 'low'),
          intel_method: String(r.intel_method ?? ''),
          seniority: (r.seniority as string) ?? null,
          country: (r.country as string) ?? null,
          geo_code: (r.geo_code as string) ?? null,
          industry: (r.industry as string) ?? null,
          venture_scores: (r.venture_scores as Record<string, number>) ?? {},
          thin_evidence: Number(r.completeness ?? 0) < 50,
          sells_competing_services: (r.sells_competing_services as boolean) ?? null,
          match_score: Math.round(1000 * clamp01((0.18 * rel + 0.10 * act) / 0.28)) / 10,
          query_relevance: null,
          s_semantic: 0,
          s_lexical: 0,
          s_constraint: 0,
          s_relationship: Math.round(rel * 1000) / 1000,
          s_actionability: Math.round(act * 1000) / 1000,
          venture_multiplier: 1,
          shared_history: (r.shared_history as NetworkResult['shared_history']) ?? [],
          plays: (r.plays as string[]) ?? [],
        } satisfies NetworkResult
      })
    }

    const employerLabel = employer
      ? ((tenures || []) as Array<{ key: string; label: string }>).find(t => t.key === employer)?.label
      : null

    return res.status(200).json({
      ok: true,
      results,
      restated: employerLabel ? `People who were at ${employerLabel}, senior ones first` : RESTATE[play],
      weak: false,
      counts: Object.fromEntries(counts),
      employers: tenures || [],
    })
  } catch (err) {
    return res.status(500).json({ ok: false, error: String((err as Error)?.message || err).slice(0, 300) })
  }
}
