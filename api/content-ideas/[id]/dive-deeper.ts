import type { VercelRequest, VercelResponse } from '@vercel/node'
import { randomUUID } from 'node:crypto'
import { supabase } from '../../_supabase.js'
import { callClaude, readMaterials, robustJson, type Material } from '../../_content.js'

// POST /api/content-ideas/:id/dive-deeper
//   body: { query: string }            — scoped Perplexity follow-up on a sub-area
//   body: { suggest: true, force? }    — Cleo proposes the research worth running
//
// Dives append {query, findings, citations, at} to meta.deep_dives, merge new
// citations into meta.research, AND attach the findings to meta.materials, so
// the corpus that grounds Cleo's writing (and rides into the Google Doc) picks
// them up without re-pasting. Suggestions are cached on
// meta.research_suggestions until refreshed with force.

function uniq(arr: string[]): string[] {
  return Array.from(new Set(arr.filter(Boolean)))
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const id = req.query?.id
  const ideaId = Array.isArray(id) ? id[0] : id
  if (!ideaId) return res.status(400).json({ ok: false, error: 'id required' })

  const body = (req.body || {}) as { query?: string; suggest?: boolean; force?: boolean }

  const { data: idea, error: iErr } = await supabase
    .from('content_ideas').select('id, idea, thesis, body, meta').eq('id', ideaId).single()
  if (iErr || !idea) return res.status(404).json({ ok: false, error: 'idea not found' })

  const meta = (idea.meta || {}) as any

  // ── Suggest mode: Cleo arms the Research tab proactively ─────────────────
  if (body.suggest) {
    const cached = meta.research_suggestions
    if (!body.force && Array.isArray(cached?.items) && cached.items.length) {
      return res.status(200).json({ ok: true, suggestions: cached.items, cached: true })
    }

    const materials = readMaterials(meta)
    const known = uniq([
      ...(Array.isArray(meta.research) ? meta.research : []),
      ...(Array.isArray(meta.sources) ? meta.sources : []),
    ]).slice(0, 12)

    const system = [
      "You are Cleo, research director for Krish Raja's content. Propose the research that would most strengthen a piece with hard evidence: named companies, figures, dated events, primary sources.",
      'Reply with JSON only, shape {"suggestions":[{"query":"…","why":"…"}]}. Exactly 4 suggestions.',
      'Each query is a focused, searchable research question under 18 words. Each why is one short sentence on what it adds to THIS piece.',
      'Never suggest something the existing sources or materials already cover.',
    ].join('\n')
    const user = [
      `PIECE: ${idea.idea}`,
      idea.thesis ? `THESIS: ${idea.thesis}` : '',
      idea.body ? `DRAFT (excerpt):\n${String(idea.body).slice(0, 2200)}` : 'No draft yet.',
      materials.length ? `MATERIALS ALREADY ATTACHED: ${materials.map(m => m.title || m.kind).join('; ').slice(0, 600)}` : '',
      known.length ? `SOURCES ALREADY CITED:\n${known.join('\n')}` : '',
    ].filter(Boolean).join('\n\n')

    try {
      const txt = await callClaude({ system, user, maxTokens: 700, temperature: 0.4 })
      const parsed = robustJson(txt)
      const items = Array.isArray(parsed?.suggestions)
        ? parsed.suggestions
            .filter((s: any) => s && typeof s.query === 'string' && s.query.trim())
            .slice(0, 5)
            .map((s: any) => ({
              query: s.query.trim().slice(0, 200),
              why: typeof s.why === 'string' ? s.why.trim().slice(0, 300) : '',
            }))
        : []
      if (!items.length) return res.status(502).json({ ok: false, error: 'no_suggestions' })

      const research_suggestions = { items, at: new Date().toISOString() }
      const { error: uErr } = await supabase
        .from('content_ideas')
        .update({ meta: { ...meta, research_suggestions }, updated_at: new Date().toISOString() })
        .eq('id', ideaId)
      if (uErr) return res.status(500).json({ ok: false, error: uErr.message })

      return res.status(200).json({ ok: true, suggestions: items })
    } catch (e: any) {
      return res.status(502).json({ ok: false, error: String(e?.message || e) })
    }
  }

  // ── Dive mode: run the research and fold it into the piece ───────────────
  const q = String(body.query || '').trim()
  if (!q) return res.status(400).json({ ok: false, error: 'query required' })

  const pplxKey = process.env.PERPLEXITY_API_KEY
  if (!pplxKey) return res.status(500).json({ ok: false, error: 'PERPLEXITY_API_KEY not configured' })

  try {
    const r = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${pplxKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [
          { role: 'system', content: 'You are a precise research assistant. Always cite urls. Return named facts and figures, not vague summary.' },
          { role: 'user', content: `Regarding the content idea: "${idea.idea}". Dig deeper specifically on: ${q}. Provide detailed findings with named companies, figures, and dated events.` },
        ],
        temperature: 0.2,
        max_tokens: 1200,
      }),
    })
    const j: any = await r.json().catch(() => ({}))
    if (!r.ok) return res.status(502).json({ ok: false, error: `perplexity_${r.status}` })

    const findings = j?.choices?.[0]?.message?.content || ''
    const citations: string[] = Array.isArray(j?.citations) ? j.citations : []

    const entry = { query: q, findings, citations, at: new Date().toISOString() }
    const deep_dives = [...(Array.isArray(meta.deep_dives) ? meta.deep_dives : []), entry]
    const research = uniq([...(Array.isArray(meta.research) ? meta.research : []), ...citations])

    // Auto-attach the findings as a material so they ground Cleo's writing
    // and show up in the Materials log without re-pasting.
    let materials = readMaterials(meta)
    let material: Material | null = null
    if (findings.trim()) {
      material = {
        id: randomUUID(),
        kind: 'research',
        title: q.slice(0, 120),
        content: citations.length ? `${findings}\n\nSources:\n${citations.join('\n')}` : findings,
        url: null,
        bytes: findings.length,
        at: entry.at,
      }
      materials = [material, ...materials].slice(0, 40)
    }

    const { error: uErr } = await supabase
      .from('content_ideas')
      .update({ meta: { ...meta, deep_dives, research, materials }, updated_at: new Date().toISOString() })
      .eq('id', ideaId)
    if (uErr) return res.status(500).json({ ok: false, error: uErr.message })

    return res.status(200).json({ ok: true, entry, material })
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
}

// Claude/webhook calls here can run 20-60s; raise the function ceiling above
// the short platform default so the request finishes instead of being killed
// mid-call (the cause of the composer hanging then dropping back to the draft).
export const config = { maxDuration: 60 }
