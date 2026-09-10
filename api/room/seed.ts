import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guard } from '../_auth.js'
import { supabase } from '../_supabase.js'
import { runNetworkSearch } from '../_networkSearch.js'
import type { QueryPlan } from '../_networkQuery.js'
import { FACE, DOOR } from '../_mission.js'
import { callClaude, robustJson } from '../_content.js'

// POST /api/room/seed  { limit? }
//
// "Find five more." Proposes people from Krish's own network who fit the face,
// using the same scorer as /api/network/recommend: the face is the semantic
// query, seniority and industry are soft constraints, and the relationship
// tier is hard because the door is sold to people he already knows, never
// cold. People already in the Room are dropped.
//
// This route inserts nothing. Every proposal is accepted or skipped by hand
// on the People, Room lane, and only an accept writes a row.

export const config = { maxDuration: 60 }

const MAX = 25
const TIERS = ['1_reciprocated', '2_core_network']
const INDUSTRY = ['media', 'advertising', 'adtech', 'publishing', 'broadcast', 'data', 'martech']

export type AskKind = 'buyer' | 'intro' | 'collaborator'

export interface RoomProposal {
  contact_id: string
  full_name: string | null
  title: string | null
  company: string | null
  linkedin_url: string | null
  why_face: string
  score: number
  /** Who this person is to the door. Absent when the classifier was skipped. */
  ask_kind?: AskKind
  /** One plain sentence saying what to ask them. Absent for the same reason. */
  ask_line?: string
}

/**
 * People the OS already knows are Krish's own collaborators.
 *
 * The scorer ranks on relationship tier, so the people he works with most
 * closely rank highest, and it proposed his own podcast co-host as a sales
 * prospect with "already emails Krish" as the reason. The repo knew who Rio was
 * the whole time (api/_venturePositioning.ts, docs/GLOSSARY.md,
 * docs/MINDMAKE_OS_ARCHITECTURE.md); the Room lane just never asked.
 *
 * This is a named list rather than a lookup because there is no structured
 * collaborator field on contact_intelligence today. `roles[]` is its natural
 * home and should carry it in time; until it does, a short honest list beats
 * proposing a business partner as a lead. They are surfaced and labelled, never
 * silently dropped: Krish can still want them on the list for a different ask.
 */
const KNOWN_COLLABORATORS = ['Rio Longacre', 'Brett House']

/**
 * Why this person fits the face.
 *
 * This used to prefix "{title} at {company}." onto a judgment that, for most
 * contacts, already opened with exactly that, so a card printed the same role
 * twice: once as its subtitle and again as the first sentence of its body. The
 * card already renders the role, so the body is the judgment alone.
 */
function whyFace(r: { title: string | null; company: string | null; who: string | null; why_them: string | null }): string {
  const judgment = (r.why_them || r.who || '').replace(/\s*[\u2014\u2013]\s*/g, ', ').trim()
  if (judgment) return judgment.slice(0, 600)
  const role = [r.title, r.company].filter(Boolean).join(' at ')
  return role ? `${role}.` : 'In your network, no stored judgment yet.'
}

interface Candidate {
  contact_id: string
  full_name: string | null
  title: string | null
  company: string | null
  why_face: string
  roles: string[] | null
  reachable_via: string[] | null
  best_channel: string | null
  seniority: string | null
}

const CLASSIFY_SYSTEM = `You are sorting people in Krish Raja's own network by what he can realistically ask them for.

WHAT IS BEING SOLD: ${DOOR}

For each candidate return one of three kinds:
- "buyer": they run a business or a P&L and could personally decide to pay a fixed fee for the room. A founder, CEO, MD, GM, president, owner, or a C-level or VP with budget at a company that BUYS advice.
- "intro": senior and credible, but they sell advisory, consulting or agency services themselves, or they hold no budget over this. They do not buy this; they can open a door to someone who does. Partners and directors at consultancies, agencies and services firms are almost always "intro".
- "collaborator": the supplied COLLABORATORS list names them. Krish already works with them.

Also write "ask_line": ONE short sentence, addressed to Krish, saying what to ask this person. Plain English a twelve year old could follow. No em dashes. No exclamation marks.

RULES
- Ground every judgment ONLY in the fields supplied for that candidate. Never invent an employer, a role, a budget or a fact about their business.
- If the supplied fields do not say enough to tell a buyer from an intro, answer "intro". Asking for a door is never the wrong ask; asking a non-buyer to buy is.
- Return JSON only: {"people":[{"i":number,"ask_kind":"buyer"|"intro"|"collaborator","ask_line":string}]}
- "i" is the candidate's given index. Include every candidate exactly once.`

/**
 * Classify the shortlist and write the ask, in one metered call.
 *
 * The scorer already returns roles, reachable_via, best_channel and the stored
 * judgment, and `whyFace()` threw all of it away. This reads those same fields
 * and answers the question the lane never asked: can this person sign, or can
 * they only open a door?
 *
 * Degrades rather than fails, the way every other stage of the network search
 * does. "Find five more" already takes about eight seconds; if this call is
 * slow, unconfigured or unparseable the proposals still come back, just without
 * the split, and the card falls back to the relationship reason alone.
 */
async function classify(candidates: Candidate[]): Promise<Map<string, { ask_kind: AskKind; ask_line: string }>> {
  const out = new Map<string, { ask_kind: AskKind; ask_line: string }>()
  if (!candidates.length || !process.env.ANTHROPIC_API_KEY) return out

  const lines = candidates.map((c, i) => JSON.stringify({
    i,
    name: c.full_name,
    title: c.title,
    company: c.company,
    seniority: c.seniority,
    roles: c.roles,
    reachable_via: c.reachable_via,
    best_channel: c.best_channel,
    stored_judgment: c.why_face,
  }))

  const user = [
    `COLLABORATORS (Krish already works with these people): ${KNOWN_COLLABORATORS.join(', ')}`,
    `CANDIDATES:\n${lines.join('\n')}`,
  ].join('\n\n')

  const txt = await callClaude({
    agent: 'room',
    system: CLASSIFY_SYSTEM,
    user,
    maxTokens: 1200,
    temperature: 0.2,
    timeoutMs: 25_000,
  })
  const parsed = robustJson(txt)
  if (!parsed || !Array.isArray(parsed.people)) throw new Error('classify_unparseable')

  for (const row of parsed.people) {
    const i = Number(row?.i)
    const c = candidates[i]
    if (!c) continue
    const kind: AskKind = row?.ask_kind === 'buyer' ? 'buyer'
      : row?.ask_kind === 'collaborator' ? 'collaborator'
      : 'intro'
    const line = typeof row?.ask_line === 'string' ? row.ask_line.trim().slice(0, 240) : ''
    if (line) out.set(c.contact_id, { ask_kind: kind, ask_line: line })
  }
  return out
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guard(req, res, ['POST'])) return

  const body = (req.body || {}) as Record<string, unknown>
  const limit = Math.max(1, Math.min(MAX, typeof body.limit === 'number' && Number.isFinite(body.limit) ? Math.floor(body.limit) : 5))

  const plan: QueryPlan = {
    restated: 'The leaders in your network who fit the face.',
    semantic_query: FACE,
    keywords: INDUSTRY.join(' '),
    venture: null,
    constraints: [
      { field: 'seniority', values: ['founder_cxo', 'vp_director'], weight: 1 },
      { field: 'industry', values: INDUSTRY, weight: 0.8 },
    ],
  }

  try {
    const { data: listed, error } = await supabase.from('room_targets').select('contact_id')
    if (error) throw new Error(error.message)
    const taken = new Set((listed || []).map(r => String((r as { contact_id: string }).contact_id)))

    const out = await runNetworkSearch({
      plan,
      tiers: TIERS,
      filterMode: 'hard',
      limit: Math.min(100, limit * 2 + taken.size),
      rerank: false,
    })

    const shortlist = out.results
      .filter(r => !taken.has(r.contact_id))
      .slice(0, limit)

    const proposals: RoomProposal[] = shortlist.map(r => ({
      contact_id: r.contact_id,
      full_name: r.full_name,
      title: r.title,
      company: r.company,
      linkedin_url: r.linkedin_url,
      why_face: whyFace(r),
      score: Math.round(Number(r.match_score) || 0),
    }))

    // Who can sign, who can only open a door, and what to ask each of them.
    try {
      const asks = await classify(shortlist.map((r, i) => ({
        contact_id: r.contact_id,
        full_name: r.full_name,
        title: r.title,
        company: r.company,
        why_face: proposals[i].why_face,
        roles: r.roles ?? null,
        reachable_via: r.reachable_via ?? null,
        best_channel: r.best_channel ?? null,
        seniority: r.seniority ?? null,
      })))
      for (const p of proposals) {
        const a = asks.get(p.contact_id)
        if (a) { p.ask_kind = a.ask_kind; p.ask_line = a.ask_line }
      }
      if (asks.size === 0 && proposals.length) out.degraded.push('ask:unavailable')
    } catch (e: unknown) {
      // The split is an improvement on the list, never a gate in front of it.
      out.degraded.push(`ask:${(e as Error)?.message?.slice(0, 60) || 'error'}`)
    }

    return res.status(200).json({ ok: true, proposals, degraded: out.degraded, inserted: 0 })
  } catch (e: unknown) {
    return res.status(500).json({ ok: false, error: (e as Error)?.message?.slice(0, 200) || 'seed_failed' })
  }
}
