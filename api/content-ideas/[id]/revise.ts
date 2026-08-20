import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js'
import { openStream, send, fail, streamClaude } from '../../_stream.js'
import { corpusForChannel, laneToCorpusChannel, loadCorpus, loadVoiceBlock, materialsContext, pathId, preamble, readMaterials, sanitizeVoice, VOICE_GUARDRAILS } from '../../_content.js'
import { buildHumourSystem, isHumourRegister } from '../../_humor.js'

// POST /api/content-ideas/:id/revise
//   body: {
//     mode: 'tone' | 'length' | 'zoom' | 'feedback' | 'humor',
//     value: string,            // preset value (e.g. 'punchier') or feedback chip
//     instruction?: string,     // open-ended feedback (free text)
//     hint?: string,            // steer text from the client preset (TONE/LENGTH/ITERATE)
//     source_text: string,      // the draft currently on screen (body or a variant)
//     selection?: string,       // optional substring to rewrite in place
//   }
//
// In-place rewrite of the CURRENT draft (Phases 1 + 5). Does NOT mutate the row's
// body — returns the revised text so the card can preview-then-accept. A history
// entry is appended to meta.revisions[] for auditability.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (preamble(req, res)) return
  const id = pathId(req)
  if (!id) return res.status(400).json({ ok: false, error: 'id required' })

  const b = (req.body || {}) as {
    mode?: string; value?: string; instruction?: string; hint?: string
    source_text?: string; selection?: string
  }
  const mode = b.mode || 'feedback'
  const sourceText = (b.source_text || '').trim()
  if (!sourceText) return res.status(400).json({ ok: false, error: 'source_text required' })
  if (!['tone', 'length', 'zoom', 'feedback', 'humor'].includes(mode)) {
    return res.status(400).json({ ok: false, error: 'invalid mode' })
  }
  // Humour passes get a dedicated, examples-driven system prompt (see _humor.ts),
  // run hotter and on a stronger model — the generic rewriter does not produce it.
  const humour = mode === 'humor' || isHumourRegister(b.value)

  // Grab the idea for context (thesis/angle) — best effort.
  const { data: idea } = await supabase
    .from('content_ideas').select('idea,thesis,meta,lane,lane_slot').eq('id', id).single()

  const [voice, corpus] = await Promise.all([loadVoiceBlock(), loadCorpus()])
  // Adapt-to-lane (value 'adapt-<channel>') rewrites the draft FOR a different
  // channel, so the corpus must follow the target, not the piece's current lane.
  const adaptMatch = /^adapt-(.+)$/.exec(b.value || '')
  const corpusChannel = adaptMatch ? adaptMatch[1] : laneToCorpusChannel((idea as any)?.lane, (idea as any)?.lane_slot)
  const channelCorpus = corpusForChannel(corpus, corpusChannel)
  const corpusBlock = channelCorpus
    ? `\n\nCHANNEL CORPUS (the mandate, audience, and bar for this channel — bend the draft toward THIS, not a generic rewrite):\n${channelCorpus}`
    : ''
  const materials = readMaterials((idea as any)?.meta)
  const materialsBlock = materials.length ? `\n\n${materialsContext(materials)}` : ''

  const inPlace = b.selection && sourceText.includes(b.selection)
  const target = inPlace ? (b.selection as string) : sourceText

  const directive =
    mode === 'zoom'
      ? (b.hint || 'Zoom into the single sharpest angle and expand only that. Discard the rest.')
      : (b.hint || b.instruction || `Apply this change: ${b.value}.`)
  const extra = b.instruction && b.instruction !== directive ? `\nAlso apply this specific feedback: ${b.instruction}` : ''

  const system = humour
    ? buildHumourSystem({ register: b.value || 'witty', voice, channelCorpus, materialsBlock })
    : [
      'You are Cleo, rewriting a draft in Krish Raja\'s voice. Krish is a British-Australian founder-operator in Brooklyn who runs a production AI agent fleet. Founder-practitioner, two gears, compression, the "Not X, Y" clarifier, hard-verdict endings.',
      '',
      voice ? `VOICE REFERENCE:\n${voice}` : '',
      corpusBlock,
      '',
      VOICE_GUARDRAILS,
      materialsBlock,
      '',
      'Return ONLY the rewritten text. No preamble, no explanation, no quotes around it.',
    ].filter(Boolean).join('\n')

  const ctx = idea
    ? `IDEA: ${idea.idea}${idea.thesis ? `\nTHESIS: ${idea.thesis}` : ''}${idea.meta?.contrarian ? `\nCONTRARIAN ANGLE: ${idea.meta.contrarian}` : ''}\n\n`
    : ''
  const user = inPlace
    ? `${ctx}Rewrite ONLY the SELECTED passage below. ${directive}${extra}\n\nFULL DRAFT (for context, do not return it):\n${sourceText}\n\nSELECTED PASSAGE (return only the rewritten version of this):\n${target}`
    : `${ctx}Rewrite the draft below. ${directive}${extra}\n\nDRAFT:\n${target}`

  // Streamed. The user is watching their own draft being rewritten, which is
  // the single best case for streaming in the product: the text appearing IS
  // the progress indicator, and no honest placeholder can beat it.
  //
  // What streams is the raw fragment, as a preview. What the client APPLIES is
  // the `revised` value in the `done` event, after sanitizeVoice and (for an
  // in-place edit) the splice back into the full draft. Those cannot be done
  // per-token, and applying half-sanitised text would put em dashes into the
  // draft that the voice pass exists to remove.
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(503).json({ ok: false, error: 'ANTHROPIC_API_KEY not configured' })

  openStream(res)
  let revisedFragment: string
  try {
    revisedFragment = (await streamClaude({
      apiKey,
      model: humour ? 'claude-opus-4-8' : 'claude-sonnet-4-6',
      maxTokens: mode === 'length' && b.value === 'long' ? 3200 : 2200,
      system,
      messages: [{ role: 'user', content: user }],
      onText: chunk => send(res, 'delta', { text: chunk }),
    })).trim()
  } catch (e: any) {
    return fail(res, 'revise_failed', String(e?.message || e))
  }
  // Strip stray surrounding quotes / em dashes the model may have slipped in.
  revisedFragment = sanitizeVoice(revisedFragment.replace(/^["'`]+|["'`]+$/g, ''))

  const revised = inPlace ? sourceText.replace(b.selection as string, revisedFragment) : revisedFragment

  // Append history (non-destructive; body is only changed when the user accepts).
  const meta = (idea?.meta || {}) as any
  const revisions = Array.isArray(meta.revisions) ? meta.revisions : []
  revisions.unshift({ mode, value: b.value || null, instruction: b.instruction || null, at: new Date().toISOString(), chars: revised.length })
  await supabase.from('content_ideas')
    .update({ meta: { ...meta, revisions: revisions.slice(0, 20) }, updated_at: new Date().toISOString() })
    .eq('id', id)

  send(res, 'done', { ok: true, revised, mode, value: b.value || null })
  return res.end()
}

// Claude/webhook calls here can run 20-60s; raise the function ceiling above
// the short platform default so the request finishes instead of being killed
// mid-call (the cause of the composer hanging then dropping back to the draft).
export const config = { maxDuration: 60 }
