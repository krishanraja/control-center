import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js'
import { preamble } from '../../_content.js'
import { VIDEO_FORMATS, buildVideoScript, videoFormat } from '../../_video.js'

// POST /api/briefs/:week/video-script   body: { duration, hint? }
//
// The weekly brief's version. Same generator as the content piece's route
// (api/_video.ts); the brief just keeps its scripts on the brief row rather
// than on a content_ideas.transformed_outputs, and is read-only about it: a
// script never touches body_md, so generating one cannot disturb an edit
// session in progress.

const MIN_SOURCE = 120

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (preamble(req, res)) return
  const week = (req.query.week || '') as string
  if (!/^\d{4}-W\d{2}$/.test(week)) return res.status(400).json({ ok: false, error: 'week required (YYYY-Www)' })

  const b = (req.body || {}) as { duration?: string; hint?: string }
  const fmt = videoFormat(b.duration)
  if (!fmt) return res.status(400).json({ ok: false, error: 'duration required', allowed: VIDEO_FORMATS.map(f => f.id) })

  const { data: brief, error } = await supabase
    .from('weekly_briefs').select('week, title, body_md, video_scripts').eq('week', week).single()
  if (error || !brief) return res.status(404).json({ ok: false, error: 'brief not found' })

  const source = (brief.body_md || '').trim()
  if (source.length < MIN_SOURCE) {
    return res.status(409).json({
      ok: false,
      error: 'no_draft',
      hint: 'The brief is empty. Assemble it first; a script compresses a brief, it does not invent one.',
    })
  }

  try {
    const script = await buildVideoScript({
      format: fmt,
      source,
      title: brief.title,
      // The brief carries its sources inline as endnote URLs rather than in
      // a metadata column, so pull them straight out of the markdown.
      citations: Array.from(new Set<string>(source.match(/https?:\/\/[^\s)\]]+/g) || [])).slice(0, 8),
      hint: b.hint,
    })

    const scripts = { ...((brief.video_scripts || {}) as any), [fmt.id]: script }
    const { error: uErr } = await supabase
      .from('weekly_briefs')
      .update({ video_scripts: scripts })
      .eq('week', week)
    if (uErr) return res.status(500).json({ ok: false, error: uErr.message })

    return res.status(200).json({ ok: true, duration: fmt.id, script })
  } catch (e: unknown) {
    return res.status(502).json({ ok: false, error: 'script_failed', detail: String((e as Error)?.message || e) })
  }
}

export const config = { maxDuration: 180 }
