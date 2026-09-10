import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { callClaude, preamble, sanitizeVoice } from '../_content.js'
import { text } from '../_growth.js'
import { LANE_SLUG } from '../_growth.js'
import { ventureOffer } from '../_venturePositioning.js'
import { buildVideoScript, videoFormat } from '../_video.js'
import { isHumourRegister } from '../_humor.js'

// POST /api/growth/clip-script  { card_id, duration?, humour? }
//
// Writes the script and the shot notes onto a creative-board card.
//
// This is the bridge the migration that added weekly_briefs.video_scripts
// already anticipated: its own comment says those are stored "in the shape
// growth_creative_queue wants", and nothing ever carried one across. The card
// has had a `script` column and an empty state apologising for it since the
// board shipped.
//
// TWO STAGES, and the reason matters. `buildVideoScript()` CUTS AN EXISTING
// PIECE: its prompt opens "the argument does not change", it requires a
// `source`, and it refuses any claim or number the source did not earn. A clip
// card starts from a title and a brief, so there is no piece to cut. Stage A
// builds the argument from what the OS actually holds about this buyer and this
// place; stage B cuts that into beats, which is what keeps the length
// discipline, the spoken rules, the shot-note shape and the number check.
//
// "Researched" here means grounded in rows the OS already holds. It is not a
// live web sweep, and the surface says so rather than implying otherwise.

export const config = { maxDuration: 120 }

const ARGUMENT_SYSTEM = `You are drafting the argument for a short video Krish Raja will film himself, to camera.

Write the case, not the script. Prose, 250 to 450 words. Somebody else will cut it into timed beats afterwards, so do not write timecodes, shot directions or a hook line.

RULES
- Use ONLY the supplied material. Never invent a statistic, a customer, a company, a study or an outcome.
- If you do not have a number, make the point without one. A specific claim you cannot support is worse than a general one you can.
- Open on the buyer's own question. Answer it. Say what to do about it.
- Plain English a twelve year old could follow. No em dashes. No exclamation marks.
- No "the truth is", "here's the thing", "let's dive in", "unpack", "deep dive", "leverage", "journey", "landscape", "robust".
- Return the prose only. No preamble, no headings, no quotes around it.`

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (preamble(req, res, 'POST, OPTIONS')) return
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' })

  const body = (req.body || {}) as Record<string, unknown>
  const cardId = text(body.card_id)
  const fmt = videoFormat(text(body.duration) || '60s')
  const humour = isHumourRegister(text(body.humour)) ? (text(body.humour) as never) : null
  if (!cardId) return res.status(400).json({ ok: false, error: 'card_id is required' })
  if (!fmt) return res.status(400).json({ ok: false, error: 'unknown duration' })
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ ok: false, error: 'no_model_configured' })
  }

  try {
    const { data: card, error: cErr } = await supabase
      .from('growth_creative_queue')
      .select('id, title, brief, magic_sentence, product_slug, touchpoint_id, stage')
      .eq('id', cardId)
      .maybeSingle()
    if (cErr) throw new Error(cErr.message)
    if (!card) return res.status(404).json({ ok: false, error: 'card not found' })

    const c = card as {
      id: string; title: string | null; brief: string | null; magic_sentence: string | null
      product_slug: string | null; touchpoint_id: string | null; stage: string | null
    }

    let place: { icp_trigger: string | null; watering_hole: string | null; rationale: string | null } | null = null
    if (c.touchpoint_id) {
      const { data } = await supabase
        .from('growth_touchpoints')
        .select('icp_trigger, watering_hole, rationale')
        .eq('id', c.touchpoint_id)
        .maybeSingle()
      place = (data as typeof place) ?? null
    }

    const offer = ventureOffer(LANE_SLUG[c.product_slug || ''] || c.product_slug)

    const material = [
      c.title ? `TITLE: ${c.title}` : '',
      c.magic_sentence ? `THE ONE LINE IT HAS TO LAND: ${c.magic_sentence}` : '',
      c.brief ? `WHAT IT IS FOR: ${c.brief}` : '',
      place?.icp_trigger ? `THE BUYER'S QUESTION, IN THEIR WORDS: ${place.icp_trigger}` : '',
      place?.watering_hole ? `WHERE THEY ASK IT: ${place.watering_hole}` : '',
      place?.rationale ? `WHY THAT PLACE: ${place.rationale}` : '',
      offer ? `WHAT IS ON OFFER: ${offer.offer}` : '',
    ].filter(Boolean).join('\n')

    if (!c.title && !c.brief && !place?.icp_trigger) {
      return res.status(422).json({
        ok: false,
        error: 'nothing_to_write_from',
        detail: 'The card needs a title, a brief, or a place on the map before a script can be grounded in anything.',
      })
    }

    // Stage A: the argument.
    const argument = sanitizeVoice(await callClaude({
      agent: 'growth',
      system: ARGUMENT_SYSTEM,
      user: material,
      maxTokens: 1400,
      temperature: 0.6,
      timeoutMs: 50_000,
    })).trim()
    if (!argument) throw new Error('argument_empty')

    // Stage B: cut it, with every rule buildVideoScript already enforces.
    const script = await buildVideoScript({
      format: fmt,
      source: argument,
      title: c.title,
      thesis: c.magic_sentence,
      humour,
    })

    const { error: upErr } = await supabase
      .from('growth_creative_queue')
      .update({
        script: script.script,
        shot_notes: script.shot_notes,
        // A card with a script is past brief. Never walk it backwards: it may
        // already be producing or posted and this is a rewrite.
        ...(c.stage === 'brief' ? { stage: 'script' } : {}),
      })
      .eq('id', cardId)
    if (upErr) throw new Error(upErr.message)

    return res.status(200).json({
      ok: true,
      script: script.script,
      shot_notes: script.shot_notes,
      word_count: script.word_count,
      target_words: script.target_words,
      // Surfaced, not swallowed: a figure the check could not find in the
      // argument is the one thing worth reading before filming.
      unsupported_numbers: script.unsupported_numbers,
    })
  } catch (e: unknown) {
    return res.status(500).json({ ok: false, error: (e as Error)?.message?.slice(0, 200) || 'clip_script_failed' })
  }
}
