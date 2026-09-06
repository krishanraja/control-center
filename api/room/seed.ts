import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guard } from '../_auth.js'
import { supabase } from '../_supabase.js'
import { runNetworkSearch } from '../_networkSearch.js'
import type { QueryPlan } from '../_networkQuery.js'
import { FACE } from '../_mission.js'

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

export interface RoomProposal {
  contact_id: string
  full_name: string | null
  title: string | null
  company: string | null
  linkedin_url: string | null
  why_face: string
  score: number
}

function whyFace(r: { title: string | null; company: string | null; who: string | null; why_them: string | null }): string {
  const role = [r.title, r.company].filter(Boolean).join(' at ')
  const judgment = (r.why_them || r.who || '').replace(/\s*[\u2014\u2013]\s*/g, ', ').trim()
  return [role ? `${role}.` : '', judgment].filter(Boolean).join(' ').slice(0, 600)
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

    const proposals: RoomProposal[] = out.results
      .filter(r => !taken.has(r.contact_id))
      .slice(0, limit)
      .map(r => ({
        contact_id: r.contact_id,
        full_name: r.full_name,
        title: r.title,
        company: r.company,
        linkedin_url: r.linkedin_url,
        why_face: whyFace(r),
        score: Math.round(Number(r.match_score) || 0),
      }))

    return res.status(200).json({ ok: true, proposals, degraded: out.degraded, inserted: 0 })
  } catch (e: unknown) {
    return res.status(500).json({ ok: false, error: (e as Error)?.message?.slice(0, 200) || 'seed_failed' })
  }
}
