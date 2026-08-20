import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js'
import { VIDEO_FORMATS, buildVideoScript, videoFormat } from '../../_video.js'
import { readMaterials } from '../../_content.js'

// POST /api/content-ideas/:id/video-script
//   body: { duration: '15s'|'30s'|'60s'|'3min'|'10min'|'20min', hint?, source_text? }
//
// Turns an existing piece into a spoken script at a chosen length. Modelled on
// channel-cut: it compresses a draft that already exists, it never invents one,
// and it writes to transformed_outputs rather than touching `body`. The piece
// stays whatever it was.
//
// The prompt and the per-length structure live in api/_video.ts, shared with
// the weekly brief's version of this route.

const MIN_SOURCE = 120

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const raw = req.query?.id
  const ideaId = Array.isArray(raw) ? raw[0] : raw
  if (!ideaId) return res.status(400).json({ ok: false, error: 'id required' })

  const b = (req.body || {}) as { duration?: string; hint?: string; source_text?: string }
  const fmt = videoFormat(b.duration)
  if (!fmt) return res.status(400).json({ ok: false, error: 'duration required', allowed: VIDEO_FORMATS.map(f => f.id) })

  const { data: idea, error: iErr } = await supabase
    .from('content_ideas')
    .select('id, idea, thesis, body, meta, source_url, transformed_outputs')
    .eq('id', ideaId).single()
  if (iErr || !idea) return res.status(404).json({ ok: false, error: 'idea not found' })

  const source = (b.source_text || idea.body || '').trim()
  if (source.length < MIN_SOURCE) {
    return res.status(409).json({
      ok: false,
      error: 'no_draft',
      hint: 'Write or generate the piece first. A script compresses an existing piece, it does not invent one.',
    })
  }

  const meta = (idea.meta || {}) as any
  try {
    const script = await buildVideoScript({
      format: fmt,
      source,
      title: idea.idea,
      thesis: idea.thesis,
      citations: [idea.source_url, ...(Array.isArray(meta.research) ? meta.research : []), ...(Array.isArray(meta.sources) ? meta.sources : [])].filter(Boolean),
      materials: readMaterials(meta),
      hint: b.hint,
    })

    // Non-destructive, and keyed by duration so a 60 second cut and a 10 minute
    // cut of the same piece coexist instead of overwriting each other.
    const outputs = { ...((idea.transformed_outputs || {}) as any), [`video_${fmt.id}`]: script }
    const { error: uErr } = await supabase
      .from('content_ideas')
      .update({ transformed_outputs: outputs, updated_at: script.generated_at })
      .eq('id', ideaId)
    if (uErr) return res.status(500).json({ ok: false, error: uErr.message })

    return res.status(200).json({ ok: true, duration: fmt.id, script })
  } catch (e: unknown) {
    return res.status(502).json({ ok: false, error: 'script_failed', detail: String((e as Error)?.message || e) })
  }
}

export const config = { maxDuration: 180 }
