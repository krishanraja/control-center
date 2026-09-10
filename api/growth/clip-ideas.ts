import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { callClaude, preamble, robustJson, sanitizeVoice } from '../_content.js'
import { PRODUCT_SLUGS, text } from '../_growth.js'
import { LANE_SLUG } from '../_growth.js'
import { ventureOffer } from '../_venturePositioning.js'

// POST /api/growth/clip-ideas  { product_slug, touchpoint_id? }
//
// Five clip titles to pick from, for one product and (optionally) one place on
// the map.
//
// The creative board's own header has always said the card exists "to hand him
// the script and the shot notes without a second click", and its empty state
// admitted the opposite: "Nothing here is generated for you." Every title and
// every script was typed by hand, so the board stayed empty and the weekly run
// of 3 to 5 never happened.
//
// What grounds a title is the touchpoint: `icp_trigger` is the buyer's own
// question, in their words, which is the whole point of the map. The venture
// positioning says what is being sold into that question. Neither is invented
// here, and the route says plainly when it has neither.

export const config = { maxDuration: 60 }

const MAX = 5

export interface ClipIdea {
  title: string
  why: string
}

const SYSTEM = `You are proposing short video titles for Krish Raja, a British-Australian founder-operator. He films these himself, to camera, and posts them where his buyers already are.

A good title here STATES THE CLAIM rather than teasing it. "Why 0 of 114 signups ever activated" is the shape. "The truth about activation" is not: it promises a reveal and says nothing.

RULES
- Ground every title in the supplied buyer question, place and offer. Never invent a statistic, a customer, a company or an outcome.
- If a number appears in a title it must appear verbatim in the supplied material.
- Plain English a twelve year old could follow. No em dashes. No exclamation marks. No colons used to stack two fragments.
- No "the truth about", "here's the thing", "let's dive in", "unpack", "deep dive", "leverage", "journey", "landscape".
- Each title is one line, under 80 characters, and different from the others in ANGLE, not just wording.
- "why" is one short sentence saying who this is for and what it argues.
- Return JSON only: {"ideas":[{"title":string,"why":string}]}`

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (preamble(req, res, 'POST, OPTIONS')) return
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' })

  const body = (req.body || {}) as Record<string, unknown>
  const product = text(body.product_slug) || ''
  const touchpointId = text(body.touchpoint_id)
  if (!PRODUCT_SLUGS.has(product)) {
    return res.status(400).json({ ok: false, error: 'product_slug must be one of the growth products' })
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ ok: false, error: 'no_model_configured' })
  }

  try {
    // The place, in the buyer's own words.
    let place: { icp_trigger: string | null; channel: string | null; watering_hole: string | null; rationale: string | null } | null = null
    if (touchpointId) {
      const { data } = await supabase
        .from('growth_touchpoints')
        .select('icp_trigger, channel, watering_hole, rationale')
        .eq('id', touchpointId)
        .maybeSingle()
      place = (data as typeof place) ?? null
    }

    // What the council said to do next, if it has spoken. These are the moves
    // the board is supposed to carry, so a title that serves one is worth more
    // than a title invented from nothing.
    const { data: reviews } = await supabase
      .from('growth_council_reviews')
      .select('double_down, kill_list, product_slug')
      .eq('product_slug', product)
      .order('week_start', { ascending: false })
      .limit(1)
    const council = reviews?.[0] as { double_down?: unknown; kill_list?: unknown } | undefined

    const offer = ventureOffer(LANE_SLUG[product] || product)

    const grounding = [
      `PRODUCT: ${product}`,
      offer ? `WHAT IS ON OFFER: ${offer.offer}` : '',
      place?.icp_trigger ? `THE BUYER'S QUESTION, IN THEIR WORDS: ${place.icp_trigger}` : '',
      place?.watering_hole ? `WHERE THEY ASK IT: ${place.watering_hole}${place.channel ? ` (${place.channel})` : ''}` : '',
      place?.rationale ? `WHY THAT PLACE: ${place.rationale}` : '',
      council?.double_down ? `THE COUNCIL SAID TO DOUBLE DOWN ON: ${JSON.stringify(council.double_down).slice(0, 900)}` : '',
      council?.kill_list ? `THE COUNCIL SAID TO STOP: ${JSON.stringify(council.kill_list).slice(0, 600)}` : '',
    ].filter(Boolean).join('\n')

    // Cited or silent, the same standard the Room holds: with no question and
    // no offer there is nothing to ground a title in, and five invented titles
    // are worse than none.
    if (!place?.icp_trigger && !offer && !council?.double_down) {
      return res.status(200).json({
        ok: true,
        ideas: [],
        note: 'Nothing to go on yet. Pick a place on the map, or rule on a review, and the titles come from that.',
      })
    }

    const txt = await callClaude({
      agent: 'growth',
      system: SYSTEM,
      user: `${grounding}\n\nPropose ${MAX} titles.`,
      maxTokens: 1200,
      temperature: 0.7,
      timeoutMs: 45_000,
    })
    const parsed = robustJson(txt)
    const ideas: ClipIdea[] = Array.isArray(parsed?.ideas)
      ? parsed.ideas
          .map((i: unknown) => {
            const row = i as { title?: unknown; why?: unknown }
            return {
              title: sanitizeVoice(String(row?.title ?? '')).trim().slice(0, 120),
              why: sanitizeVoice(String(row?.why ?? '')).trim().slice(0, 240),
            }
          })
          .filter((i: ClipIdea) => i.title)
          .slice(0, MAX)
      : []

    return res.status(200).json({ ok: true, ideas })
  } catch (e: unknown) {
    return res.status(500).json({ ok: false, error: (e as Error)?.message?.slice(0, 200) || 'clip_ideas_failed' })
  }
}
