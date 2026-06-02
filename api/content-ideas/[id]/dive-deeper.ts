import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js'

// POST /api/content-ideas/:id/dive-deeper
//   body: { query: string }
//
// Scoped Perplexity follow-up on a sub-area of an idea (CONTENT_TAB_SPEC §4.3a).
// Appends {query, findings, citations, at} to meta.deep_dives and merges new
// citations into meta.research, so the draft can be re-transformed with the
// deeper material. Returns the new deep-dive entry.

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

  const q = String(((req.body || {}) as any).query || '').trim()
  if (!q) return res.status(400).json({ ok: false, error: 'query required' })

  const pplxKey = process.env.PERPLEXITY_API_KEY
  if (!pplxKey) return res.status(500).json({ ok: false, error: 'PERPLEXITY_API_KEY not configured' })

  const { data: idea, error: iErr } = await supabase.from('content_ideas').select('id, idea, meta').eq('id', ideaId).single()
  if (iErr || !idea) return res.status(404).json({ ok: false, error: 'idea not found' })

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

    const meta = (idea.meta || {}) as any
    const entry = { query: q, findings, citations, at: new Date().toISOString() }
    const deep_dives = [...(Array.isArray(meta.deep_dives) ? meta.deep_dives : []), entry]
    const research = uniq([...(Array.isArray(meta.research) ? meta.research : []), ...citations])

    const { error: uErr } = await supabase
      .from('content_ideas')
      .update({ meta: { ...meta, deep_dives, research }, updated_at: new Date().toISOString() })
      .eq('id', ideaId)
    if (uErr) return res.status(500).json({ ok: false, error: uErr.message })

    return res.status(200).json({ ok: true, entry })
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
}
