import type { VercelRequest, VercelResponse } from '@vercel/node'
import { randomUUID } from 'node:crypto'
import { supabase } from '../../_supabase.js'
import { pathId, readMaterials, type Material } from '../../_content.js'

// /api/content-ideas/:id/materials
//   GET    — list the background materials attached to a piece.
//   POST   — attach one. body: { kind:'paste'|'link'|'file', title?, content?, url? }
//   DELETE — ?materialId=... remove one.
//
// Materials live on content_ideas.meta.materials[] (jsonb). This is the fix for
// the "corpus gets lost" problem: the research you paste/link to a piece is now
// stored durably, surfaced in the composer, used to ground Cleo's writing, and
// folded into the Google Doc on Save Draft.

const MAX_CONTENT = 400_000 // ~400KB of corpus per material is plenty

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const id = pathId(req)
  if (!id) return res.status(400).json({ ok: false, error: 'id required' })

  const { data: idea, error } = await supabase
    .from('content_ideas').select('id,meta').eq('id', id).single()
  if (error || !idea) return res.status(404).json({ ok: false, error: 'idea not found' })

  const meta = (idea.meta || {}) as any
  const materials = readMaterials(meta)

  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, materials })
  }

  if (req.method === 'POST') {
    const b = (req.body || {}) as Partial<Material>
    const kind = b.kind === 'link' || b.kind === 'file' ? b.kind : 'paste'
    const content = typeof b.content === 'string' ? b.content.slice(0, MAX_CONTENT) : ''
    const url = typeof b.url === 'string' ? b.url.trim().slice(0, 2000) : ''
    if (kind === 'link' && !url) return res.status(400).json({ ok: false, error: 'url required for a link' })
    if (kind !== 'link' && !content.trim()) return res.status(400).json({ ok: false, error: 'content required' })

    const title = (typeof b.title === 'string' && b.title.trim())
      ? b.title.trim().slice(0, 200)
      : kind === 'link'
        ? hostnameOf(url)
        : firstHeadingOrLine(content)

    const material: Material = {
      id: randomUUID(),
      kind,
      title,
      content: kind === 'link' ? null : content,
      url: kind === 'link' ? url : null,
      bytes: kind === 'link' ? url.length : content.length,
      at: new Date().toISOString(),
    }
    const next = [material, ...materials].slice(0, 40)
    const { error: upErr } = await supabase.from('content_ideas')
      .update({ meta: { ...meta, materials: next }, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (upErr) return res.status(500).json({ ok: false, error: upErr.message })
    return res.status(200).json({ ok: true, material, materials: next })
  }

  if (req.method === 'DELETE') {
    const mid = Array.isArray(req.query.materialId) ? req.query.materialId[0] : req.query.materialId
    if (!mid) return res.status(400).json({ ok: false, error: 'materialId required' })
    const next = materials.filter(m => m.id !== mid)
    const { error: upErr } = await supabase.from('content_ideas')
      .update({ meta: { ...meta, materials: next }, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (upErr) return res.status(500).json({ ok: false, error: upErr.message })
    return res.status(200).json({ ok: true, materials: next })
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' })
}

function hostnameOf(u: string): string {
  try { return new URL(u).hostname.replace(/^www\./, '') } catch { return u.slice(0, 60) }
}
function firstHeadingOrLine(s: string): string {
  const line = s.split('\n').map(x => x.replace(/^#+\s*/, '').trim()).find(Boolean) || 'Pasted material'
  return line.slice(0, 120)
}
