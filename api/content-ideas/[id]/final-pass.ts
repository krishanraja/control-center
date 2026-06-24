import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js'
import {
  callClaude, corpusForChannel, loadCorpus, loadVoiceBlock,
  materialsContext, pathId, preamble, readMaterials, robustJson, sanitizeVoice,
} from '../../_content.js'
import {
  applyAutofixes, buildFinalPassSystem, laneToVenture, normalizePass, rubricFor,
} from '../../_finalPass.js'

// POST /api/content-ideas/:id/final-pass
//   body: { source_text: string, lenses?: string[] }
//
// The ship-moment editor. Runs Cleo over the WHOLE draft against the venture's
// rubric and returns a structured verdict the composer turns into a review gate:
//   - instant_fail  → Save Draft is disabled until it clears (Krish, Q1)
//   - autofixes     → real errors, applied to produce `cleaned_text` (Q2a)
//   - suggestions   → content improvements, dismissible one by one (Q2b/Q4)
//   - lenses        → (Techonomic) which investigative lenses landed (Q5)
//   - verify        → claims to source before shipping (Q12)
//   - standards     → the Five Standards, so this reads as one system with /score
//
// Read-only on the row except an audit stamp in meta.final_pass — the actual
// body change (accepting fixes/suggestions) happens client-side then rides the
// normal autosave + save-draft path. Nothing here fires the factory.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (preamble(req, res)) return
  const id = pathId(req)
  if (!id) return res.status(400).json({ ok: false, error: 'id required' })

  const b = (req.body || {}) as { source_text?: string; lenses?: string[] }
  const sourceRaw = (b.source_text || '').trim()
  if (!sourceRaw) return res.status(400).json({ ok: false, error: 'source_text required — write a draft first' })

  const { data: idea } = await supabase
    .from('content_ideas').select('idea,thesis,meta,lane,lane_slot').eq('id', id).single()

  const venture = laneToVenture(idea?.lane, idea?.lane_slot)
  const rubric = rubricFor(venture)

  const [voice, corpus] = await Promise.all([loadVoiceBlock(), loadCorpus()])
  const channelCorpus = corpusForChannel(corpus, rubric.corpusChannel)
  const materials = readMaterials(idea?.meta)
  const materialsBlock = materials.length ? `\n${materialsContext(materials)}` : ''

  // Deterministic em-dash sanitize first, so the model never wastes an autofix on
  // it and the diff Krish reviews is the same text that will ship.
  const source = sanitizeVoice(sourceRaw)

  const lenses = Array.isArray(b.lenses) ? b.lenses.filter(x => typeof x === 'string') : undefined
  const system = buildFinalPassSystem({ rubric, voice, channelCorpus, materialsBlock, cfg: { lenses } })

  const ctx = idea
    ? `PIECE: ${idea.idea}${idea.thesis ? `\nTHESIS: ${idea.thesis}` : ''}\n\n`
    : ''
  const user = `${ctx}Run the final pass on this draft. Return only the JSON object.\n\nDRAFT:\n${source}`

  let result
  try {
    const txt = await callClaude({ system, user, maxTokens: 3200, temperature: 0.3 })
    const parsed = robustJson(txt)
    if (!parsed) return res.status(502).json({ ok: false, error: 'could not parse final pass result' })
    result = normalizePass(parsed)
  } catch (e: any) {
    return res.status(502).json({ ok: false, error: String(e?.message || e) })
  }

  // Apply the auto-fixes (errors only) to produce the cleaned draft the UI adopts.
  // Re-sanitize in case a fix reintroduced a dash. Suggestions are NOT applied here.
  const cleaned = sanitizeVoice(applyAutofixes(source, result.autofixes))

  // Audit stamp: last pass per piece (non-destructive). The override log is written
  // at ship time by save-draft, so dismissals/ships are captured against the real
  // decision, not the preview.
  const meta = (idea?.meta || {}) as any
  await supabase.from('content_ideas')
    .update({
      meta: {
        ...meta,
        final_pass: {
          venture,
          at: new Date().toISOString(),
          instant_fail: result.instant_fail.failed,
          verdict: result.verdict,
          counts: {
            autofixes: result.autofixes.length,
            suggestions: result.suggestions.length,
            verify: result.verify.length,
          },
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  return res.status(200).json({
    ok: true,
    venture,
    venture_label: rubric.label,
    has_lenses: !!rubric.lenses,
    cleaned_text: cleaned,
    changed: cleaned !== source,
    ...result,
  })
}

// Claude/webhook calls here can run 20-60s; raise the function ceiling above
// the short platform default so the request finishes instead of being killed
// mid-call (the cause of the composer hanging then dropping back to the draft).
export const config = { maxDuration: 60 }
