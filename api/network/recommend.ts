import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guard } from '../_auth.js'
import { runNetworkSearch } from '../_networkSearch.js'
import type { QueryPlan } from '../_networkQuery.js'

// POST /api/network/recommend
//   { venture, intent?, limit? }
//
// "Who should I talk to for Mindmake this week."
//
// Same scorer as /search, different entry: instead of a parsed question, the
// venture drives the multiplier and the intent becomes a role constraint. There
// is no free text, so no model call is needed to plan — a fixed thesis per
// venture supplies the semantic query, which also makes this endpoint work with
// no ANTHROPIC_API_KEY at all.

export const config = { maxDuration: 60 }

// One sentence describing the person each venture needs. Embedded as the
// semantic query, so recommend mode retrieves on MEANING rather than only on
// the stored venture_scores. Kept here rather than in the database because it is
// positioning, and positioning is edited far more often than schema.
const VENTURE_THESIS: Record<string, string> = {
  mindmake:
    'A senior operator or executive at a company that is not an AI vendor, accountable for building real AI capability in their organisation, facing the gap between tool rollout and actual capability.',
  adfixus:
    'A publisher, media owner or platform person who owns identity, addressability, first-party data or consent, and feels the loss of third-party cookies commercially.',
  signal_noise:
    'An operator with a specific, hard-won go-to-market or AI story worth an hour of podcast conversation, who can speak concretely rather than in abstractions.',
  builder_economy:
    'Someone building products or a business that was not practical before AI, who teaches in public and has an audience or a cohort.',
}

const INTENT_TO_ROLE: Record<string, string> = {
  sell: 'buyer', buyer: 'buyer',
  partner: 'partner',
  intro: 'introducer', introducer: 'introducer',
  guest: 'guest',
  invest: 'investor', investor: 'investor',
  hire: 'hire',
  peer: 'operator_peer',
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guard(req, res)) return

  const body = (req.body || {}) as Record<string, unknown>
  const venture = typeof body.venture === 'string' ? body.venture : ''
  if (!VENTURE_THESIS[venture]) {
    return res.status(400).json({ ok: false, error: 'venture_required', allowed: Object.keys(VENTURE_THESIS) })
  }
  const intent = typeof body.intent === 'string' ? body.intent.toLowerCase() : ''
  const role = INTENT_TO_ROLE[intent] || null

  const label = role ? `${role.replace(/_/g, ' ')}s` : 'people'
  const plan: QueryPlan = {
    restated: `The ${label} in your network most worth contacting for ${venture.replace(/_/g, ' ')} right now.`,
    semantic_query: VENTURE_THESIS[venture],
    keywords: '',
    venture,
    // Soft, like everything else: someone with no role recorded but a 90
    // venture score should still surface.
    constraints: role ? [{ field: 'roles', values: [role], weight: 0.9 }] : [],
  }

  try {
    const out = await runNetworkSearch({
      plan,
      venture,
      limit: typeof body.limit === 'number' ? body.limit : 20,
      // No question to explain against, and the reason to talk to someone is
      // already stored in why_them. A rerank here would paraphrase it at the
      // cost of a second and a model call.
      rerank: false,
    })
    return res.status(200).json(out)
  } catch (e: unknown) {
    return res.status(500).json({ ok: false, error: (e as Error)?.message?.slice(0, 200) || 'recommend_failed' })
  }
}
