import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js'
import { sanitizeVoice } from '../../_content.js'

// POST /api/content-ideas/:id/transform
//   body: { lanes: string[], slots?: Record<lane, slot> }
//
// Industrialized Transform (CONTENT_TAB_SPEC §5.5). The parent content_ideas row
// is the researched atom; this spins it into one child row per requested
// (lane, slot), each in that format's krish-voice gear
// (system_config.content_lane_*), inheriting the parent's research/citations.
// Re-transforming a target replaces its prior child.
//
// ── THIS WAS DEAD, AND SILENTLY (fixed 2026-08-13) ────────────────────────
// The 2026-08-11 refocus renamed the taxonomy: one media venture
// ('mindmaker_live') with two format slots ('paid', 'built'). The UI moved with
// it, and ResearchAndTransform derives its targets from VENTURE_FORMATS, so it
// posts { lanes: ['mindmaker_live'], slots: { mindmaker_live: 'paid' } }.
// This file did not move. It still declared the pre-refocus venture lanes and
// rewrote 'mindmaker_live' BACKWARDS onto 'mindmaker'. Two failures followed:
//
//   1. The rewrite happened before the slot lookup, so `slots['mindmaker']` was
//      undefined and the slot was silently dropped.
//   2. It then looked for a config called `content_lane_mindmaker`, which does
//      not exist. The live keys are content_lane_mindmaker_live_paid and
//      content_lane_mindmaker_live_built.
//
// Every transform therefore ended in 'no voice config' and a 502. The database
// agrees: exactly one transform child has ever been created, on 2026-06-11,
// before the rename. Legacy names now map FORWARD onto the live venture and
// slot, which is the direction every other mapping table in this codebase uses.

/** The one live media venture. Formats live in the slot, never in the lane. */
const VALID_LANES = new Set(['mindmaker_live'])

/** Retired lane -> the live (lane, slot) it becomes. Forward only: a stale
 *  client or an old stored row keeps working instead of getting a 400. */
const RETIRED_LANES: Record<string, { lane: string; slot: string | null }> = {
  // Retired 2026-08-06 into MYMU, then 2026-08-11 into Mindmaker Live: Paid.
  techonomic: { lane: 'mindmaker_live', slot: 'paid' },
  investigation: { lane: 'mindmaker_live', slot: 'paid' },
  makeyourmindup: { lane: 'mindmaker_live', slot: 'paid' },
  mymu: { lane: 'mindmaker_live', slot: 'paid' },
  // 'mindmaker' was the content lane before the venture split.
  mindmaker: { lane: 'mindmaker_live', slot: 'paid' },
  // Instagram was buried inside this venture value; it is a channel now, and
  // the Builder Economy thesis lives on as the Built format.
  builder_economy: { lane: 'mindmaker_live', slot: 'built' },
  builder_economy_ig: { lane: 'mindmaker_live', slot: 'built' },
  // Signal & Noise stopped being a venture and became a distribution channel,
  // so nothing is commissioned for it. A piece aimed there is a Built piece.
  signal_noise: { lane: 'mindmaker_live', slot: 'built' },
}

interface Target { lane: string; slot: string | null }

/** Normalise the wire body into concrete (lane, slot) targets, resolving
 *  retired names forward and reading the slot off the ORIGINAL key the client
 *  sent, which is the step the old code skipped. */
function resolveTargets(lanes: string[], slots: Record<string, string> | undefined): Target[] {
  const out: Target[] = []
  const seen = new Set<string>()
  for (const requested of lanes) {
    if (!requested) continue
    const askedSlot = slots?.[requested] ?? null
    const retired = RETIRED_LANES[requested]
    const lane = retired ? retired.lane : requested
    if (!VALID_LANES.has(lane)) continue
    // An explicit slot from the client always wins over the retired default:
    // the client knows which format it meant, the mapping table only guesses.
    const slot = askedSlot ?? (retired ? retired.slot : null)
    const key = `${lane}:${slot ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ lane, slot })
  }
  return out
}

function parseVal(v: unknown): any {
  if (typeof v === 'string') { try { return JSON.parse(v) } catch { return null } }
  return v
}
function slug(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 50)
}
function robustJson(txt: string): any {
  let t = String(txt).trim()
  if (t.startsWith('```')) t = t.split('```')[1].replace(/^json/, '').trim()
  try { return JSON.parse(t) } catch { /* fallthrough */ }
  const i = t.indexOf('{'), j = t.lastIndexOf('}')
  if (i >= 0 && j > i) { try { return JSON.parse(t.slice(i, j + 1)) } catch { /* noop */ } }
  return null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const id = req.query?.id
  const parentId = Array.isArray(id) ? id[0] : id
  if (!parentId) return res.status(400).json({ ok: false, error: 'id required' })

  const body = (req.body || {}) as { lanes?: string[]; slots?: Record<string, string> }
  const targets = resolveTargets(body.lanes || [], body.slots)
  if (targets.length === 0) {
    return res.status(400).json({
      ok: false,
      error: 'lanes required. Send lane "mindmaker_live" with slots {"mindmaker_live":"paid"|"built"}.',
    })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ ok: false, error: 'ANTHROPIC_API_KEY not configured' })

  // Parent idea
  const { data: parent, error: pErr } = await supabase.from('content_ideas').select('*').eq('id', parentId).single()
  if (pErr || !parent) return res.status(404).json({ ok: false, error: 'parent idea not found' })

  // Lane voice/format configs
  const { data: cfgRows } = await supabase.from('system_config').select('key,value').like('key', 'content_lane_%')
  const cfgByKey: Record<string, any> = {}
  for (const r of cfgRows || []) cfgByKey[(r as any).key] = parseVal((r as any).value)

  const pmeta = (parent.meta || {}) as any
  const researchBlock = [
    parent.body ? `Existing draft / thesis:\n${parent.body}` : '',
    parent.source_snippet ? `Research snippet:\n${parent.source_snippet}` : '',
    Array.isArray(pmeta.research) && pmeta.research.length ? `Citations: ${pmeta.research.slice(0, 8).join(', ')}` : '',
    Array.isArray(pmeta.deep_dives) && pmeta.deep_dives.length
      ? `Deeper findings:\n${pmeta.deep_dives.map((d: any) => `- ${d.query}: ${String(d.findings || '').slice(0, 600)}`).join('\n')}`
      : '',
  ].filter(Boolean).join('\n\n')

  const created: any[] = []
  const errors: any[] = []

  for (const { lane, slot } of targets) {
    // Most specific first, then the venture's house register. The old code also
    // tried a `_roundup` suffix, which was a MYMU-era key that no longer exists
    // in system_config; it is gone rather than left as a decoy fallback.
    const key = slot ? `content_lane_${lane}_${slot}` : `content_lane_${lane}`
    const cfg = cfgByKey[key] || cfgByKey[`content_lane_${lane}`]
    if (!cfg) {
      // Name the key that was missing. 'no voice config' sent whoever hit this
      // looking through the UI taxonomy when the problem was a system_config row.
      errors.push({ lane, slot, error: `no voice config (looked for ${key} then content_lane_${lane})` })
      continue
    }

    // Human label for the prompt. "a mindmaker_live (paid) piece" is a slug
    // read aloud to a model; "a Paid piece" is what the format is called.
    const label = slot ? (slot.charAt(0).toUpperCase() + slot.slice(1)) : (cfg.format || lane)

    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 4000,
          temperature: 0.5,
          system: cfg.draft_system + ' Keep the body within ~700 words so the JSON stays complete.',
          messages: [{
            role: 'user',
            content: `Transform this researched idea into a ${label} piece, in the specified voice and format. Ground every claim in the research below; do not invent.\n\nSOURCE IDEA: ${parent.idea}\n\n${researchBlock}\n\nReturn ONLY a single JSON object: {"title":string,"body":string,"visual_suggestion":string|null,"sources":[url]}.`,
          }],
        }),
      })
      const j: any = await r.json().catch(() => ({}))
      if (!r.ok) { errors.push({ lane, slot, error: `anthropic_${r.status}` }); continue }
      const d = robustJson(j?.content?.[0]?.text || '') || { title: parent.idea, body: j?.content?.[0]?.text || '' }

      // Re-transform: drop the prior transform child for this exact target.
      //
      // This MUST match on the slot as well as the lane. Before the refocus each
      // format had its own lane, so (parent, lane) identified one child. Now Paid
      // and Built share lane 'mindmaker_live' and differ only by slot, so a
      // lane-only delete would silently destroy the sibling format's draft every
      // time the other one was regenerated.
      const del = supabase.from('content_ideas').delete()
        .eq('parent_idea_id', parentId).eq('lane', lane).eq('meta->>generated_by', 'transform')
      await (slot ? del.eq('lane_slot', slot) : del.is('lane_slot', null))

      const child = {
        idea: sanitizeVoice(d.title || `${parent.idea} (${label})`),
        body: sanitizeVoice(d.body || ''),
        lane,
        lane_slot: slot || cfg.slot || null,
        state: 'drafting',
        source_type: parent.source_type || 'inspiration_sweep',
        distribution: [],
        parent_idea_id: parentId,
        related_idea_ids: [parentId],
        source_url: parent.source_url || (Array.isArray(d.sources) ? d.sources[0] : null) || null,
        source_snippet: parent.source_snippet || null,
        pillar_id: parent.pillar_id || null,
        meta: {
          research: pmeta.research || [],
          sources: d.sources || pmeta.sources || [],
          visual_suggestion: d.visual_suggestion || null,
          generated_by: 'transform',
          lane_format: cfg.format,
          transformed_from: parentId,
        },
        // The slot is part of the identity now. Both formats share the lane, so
        // without it a Paid and a Built child of the same parent could collide
        // on one concept_id whenever the model returned a similar title.
        concept_id: `concept:content:${lane}${slot ? `:${slot}` : ''}:${slug(d.title || parent.idea)}-${parentId.slice(0, 8)}`,
      }
      const { data: ins, error: iErr } = await supabase.from('content_ideas').insert(child).select('id,lane,lane_slot,idea,state').single()
      if (iErr) { errors.push({ lane, slot, error: iErr.message }); continue }
      created.push(ins)
    } catch (e: any) {
      errors.push({ lane, slot, error: String(e?.message || e) })
    }
  }

  return res.status(created.length ? 200 : 502).json({ ok: created.length > 0, created, errors })
}

// Claude/webhook calls here can run 20-60s; raise the function ceiling above
// the short platform default so the request finishes instead of being killed
// mid-call (the cause of the composer hanging then dropping back to the draft).
export const config = { maxDuration: 60 }
