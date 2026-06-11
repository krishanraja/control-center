import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js'
import { callClaude, loadCorpus, pathId, preamble, robustJson } from '../../_content.js'

// POST /api/content-ideas/:id/score
//   body: { source_text?: string }
//
// The Five Standards gate (Phase 6). Scores the current draft 1-5 on each of the
// content-corpus standards — undeniably unique, well-researched, thoughtful,
// kind, helpful — names the failing ones, and writes the result to meta.standards
// + a glanceable quality_score (green/amber/red). Advisory only: it WARNS, it
// never blocks (decision 2026-06-11). Most AI-default content fails #1 and #4,
// so those two are the watch standards.

const KEYS = ['unique', 'researched', 'thoughtful', 'kind', 'helpful'] as const

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (preamble(req, res)) return
  const id = pathId(req)
  if (!id) return res.status(400).json({ ok: false, error: 'id required' })

  const { data: idea, error } = await supabase
    .from('content_ideas').select('idea,thesis,body,source_type,meta').eq('id', id).single()
  if (error || !idea) return res.status(404).json({ ok: false, error: 'idea not found' })

  const draft = (((req.body || {}) as any).source_text || idea.body || '').trim()
  if (!draft) return res.status(400).json({ ok: false, error: 'no draft to score (source_text or body required)' })

  const corpus = await loadCorpus()
  const meta = (idea.meta || {}) as any
  const hasArtifact = !!(meta.source_label || idea.source_type === 'openclaw_workspace' || idea.source_type === 'cleo_chat')

  const system = [
    'You are the Five Standards gate for Krish Raja\'s content. Score a draft against the channel corpus. Be a hard, honest editor — most drafts are a 3 on unique and kind; reserve 5 for genuinely exceptional. The two watch standards are "unique" (could anyone in his peer group have written this?) and "kind" (warm to people, sharp on ideas, never cruel or generic-mean).',
    corpus ? `\nCORPUS (the bar each standard must clear):\n${corpus.slice(0, 6000)}` : '',
    '\nReturn ONLY JSON: {"unique":1-5,"researched":1-5,"thoughtful":1-5,"kind":1-5,"helpful":1-5,"notes":{"unique":string,"researched":string,"thoughtful":string,"kind":string,"helpful":string},"verdict":string}',
  ].join('\n')

  const user = `IDEA: ${idea.idea}${idea.thesis ? `\nTHESIS: ${idea.thesis}` : ''}\nARTIFACT-SOURCED: ${hasArtifact ? 'yes' : 'unknown — may be commentary on a thing read'}\n\nDRAFT:\n${draft.slice(0, 6000)}`

  let parsed: any
  try {
    parsed = robustJson(await callClaude({ system, user, maxTokens: 1200, temperature: 0.3 }))
  } catch (e: any) {
    return res.status(502).json({ ok: false, error: String(e?.message || e) })
  }
  if (!parsed) return res.status(502).json({ ok: false, error: 'could not parse score' })

  const scores: Record<string, number> = {}
  for (const k of KEYS) scores[k] = Math.max(1, Math.min(5, Number(parsed[k]) || 3))
  const failing = KEYS.filter(k => scores[k] < 3)
  const watchFails = failing.filter(k => k === 'unique' || k === 'kind')
  // green: nothing failing; amber: a non-watch fail; red: a watch fail.
  const quality_score = watchFails.length ? 'red' : failing.length ? 'amber' : 'green'

  const standards = {
    scores, failing, notes: parsed.notes || {}, verdict: parsed.verdict || null,
    artifact_sourced: hasArtifact, scored_at: new Date().toISOString(),
  }
  await supabase.from('content_ideas')
    .update({ meta: { ...meta, standards }, quality_score, updated_at: new Date().toISOString() })
    .eq('id', id)

  return res.status(200).json({ ok: true, standards, quality_score })
}
