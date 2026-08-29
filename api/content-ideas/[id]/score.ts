import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js'
import { loadCorpus, pathId, preamble } from '../../_content.js'
import { scoreStandards } from '../../_standards.js'
import { JUDGE_MODEL } from '../../_models.js'

// POST /api/content-ideas/:id/score
//   body: { source_text?: string }
//
// The Five Standards gate (Phase 6). Scores the current draft 1-5 on each of the
// content-corpus standards — undeniably unique, well-researched, thoughtful,
// kind, helpful — names the failing ones, and writes the result to meta.standards
// + a glanceable quality_score (green/amber/red). Advisory only: it WARNS, it
// never blocks (decision 2026-06-11). Most AI-default content fails #1 and #4,
// so those two are the watch standards.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (preamble(req, res)) return
  const id = pathId(req)
  if (!id) return res.status(400).json({ ok: false, error: 'id required' })

  const { data: idea, error } = await supabase
    .from('content_ideas').select('idea,thesis,body,source_type,meta').eq('id', id).single()
  if (error || !idea) return res.status(404).json({ ok: false, error: 'idea not found' })

  const draft = (((req.body || {}) as any).source_text || idea.body || '').trim()
  if (!draft) return res.status(400).json({ ok: false, error: 'no draft to score (source_text or body required)' })

  // Tier: manual scoring uses Sonnet (sharper judgment); the auto-score trigger
  // (Postgres → pg_net) passes model:'haiku' to stay MT-003 cost-safe.
  const model = ((req.body || {}) as any).model === 'haiku' ? JUDGE_MODEL : undefined

  const corpus = await loadCorpus()
  const meta = (idea.meta || {}) as any
  const hasArtifact = !!(meta.source_label || idea.source_type === 'openclaw_workspace' || idea.source_type === 'cleo_chat')

  // The rubric itself lives in _standards.ts so an eval run grades against the
  // exact bar the product grades against. This route keeps what is genuinely
  // its own: loading the row, and writing the verdict back.
  let verdict: Awaited<ReturnType<typeof scoreStandards>>
  try {
    verdict = await scoreStandards(
      { idea: idea.idea, thesis: idea.thesis, draft, hasArtifact },
      { corpus, model },
    )
  } catch (e: any) {
    return res.status(502).json({ ok: false, error: String(e?.message || e) })
  }

  const { quality_score } = verdict
  const standards = {
    scores: verdict.scores,
    failing: verdict.failing,
    notes: verdict.notes,
    verdict: verdict.verdict,
    fix: verdict.fix,
    artifact_sourced: hasArtifact,
    scored_at: new Date().toISOString(),
  }
  await supabase.from('content_ideas')
    .update({ meta: { ...meta, standards }, quality_score, updated_at: new Date().toISOString() })
    .eq('id', id)

  return res.status(200).json({ ok: true, standards, quality_score })
}

// Claude/webhook calls here can run 20-60s; raise the function ceiling above
// the short platform default so the request finishes instead of being killed
// mid-call (the cause of the composer hanging then dropping back to the draft).
export const config = { maxDuration: 60 }
