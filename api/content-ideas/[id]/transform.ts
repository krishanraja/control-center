import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js'
import { sanitizeVoice } from '../../_content.js'

// POST /api/content-ideas/:id/transform
//   body: { lanes: string[], slots?: Record<lane, slot> }
//
// Industrialized Transform (CONTENT_TAB_SPEC §5.5). The parent content_ideas row
// is the researched atom; this spins it into one child row per requested lane,
// each in that lane's krish-voice gear (system_config.content_lane_*), inheriting
// the parent's research/citations. Re-transforming a lane replaces its prior child.

// Techonomic was retired 2026-08-06 and folded into Mindmake LIVE, so it is no
// longer a transform target. A stale client asking for it lands on mindmake
// rather than getting a 400 with an empty lane list.
const RETIRED_LANES: Record<string, string> = { techonomic: 'mindmake', publication: 'mindmake' }
const VALID_LANES = new Set(['signal_noise', 'mindmake', 'builder_economy_ig'])

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
  const lanes = [...new Set((body.lanes || []).map(l => RETIRED_LANES[l] || l).filter(l => VALID_LANES.has(l)))]
  if (lanes.length === 0) return res.status(400).json({ ok: false, error: 'lanes required (signal_noise|mindmake|builder_economy_ig)' })

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

  for (const lane of lanes) {
    const slot = body.slots?.[lane] || null
    const key = slot ? `content_lane_${lane}_${slot}` : `content_lane_${lane}`
    const cfg = cfgByKey[key] || cfgByKey[`content_lane_${lane}`] || cfgByKey[`content_lane_${lane}_roundup`]
    if (!cfg) { errors.push({ lane, error: 'no voice config' }); continue }

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
            content: `Transform this researched idea into a ${lane}${slot ? ' (' + slot + ')' : ''} piece, in the specified voice and format. Ground every claim in the research below; do not invent.\n\nSOURCE IDEA: ${parent.idea}\n\n${researchBlock}\n\nReturn ONLY a single JSON object: {"title":string,"body":string,"visual_suggestion":string|null,"sources":[url]}.`,
          }],
        }),
      })
      const j: any = await r.json().catch(() => ({}))
      if (!r.ok) { errors.push({ lane, error: `anthropic_${r.status}` }); continue }
      const d = robustJson(j?.content?.[0]?.text || '') || { title: parent.idea, body: j?.content?.[0]?.text || '' }

      // Re-transform: drop the prior transform child for this (parent, lane).
      await supabase.from('content_ideas').delete()
        .eq('parent_idea_id', parentId).eq('lane', lane).eq('meta->>generated_by', 'transform')

      const child = {
        idea: sanitizeVoice(d.title || `${parent.idea} (${lane})`),
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
        concept_id: `concept:content:${lane}:${slug(d.title || parent.idea)}-${parentId.slice(0, 8)}`,
      }
      const { data: ins, error: iErr } = await supabase.from('content_ideas').insert(child).select('id,lane,idea,state').single()
      if (iErr) { errors.push({ lane, error: iErr.message }); continue }
      created.push(ins)
    } catch (e: any) {
      errors.push({ lane, error: String(e?.message || e) })
    }
  }

  return res.status(created.length ? 200 : 502).json({ ok: created.length > 0, created, errors })
}

// Claude/webhook calls here can run 20-60s; raise the function ceiling above
// the short platform default so the request finishes instead of being killed
// mid-call (the cause of the composer hanging then dropping back to the draft).
export const config = { maxDuration: 60 }
