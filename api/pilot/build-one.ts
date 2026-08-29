import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { goalsSpine } from '../_goals.js'
import {
  callClaude,
  corpusForChannel,
  loadCorpus,
  loadVoiceBlock,
  preamble,
  robustJson,
  sanitizeVoice,
  slug,
  VOICE_GUARDRAILS,
} from '../_content.js'
import { titleNorm, contentHash } from '../_text.js'
import { embed, vectorLiteral } from '../_embeddings.js'
import { UTILITY_MODEL } from '../_models.js'

/**
 * POST /api/pilot/build-one
 *
 * The build-it-now arm of red mode. When resolve-ask says nothing outstanding
 * matches the operator's publish intent, this route generates a real draft
 * synchronously, grounded in the voice block and the channel corpus, and lands
 * it as a content_ideas row in the normal review flow. PUB-001 holds: this
 * DRAFTS, it never publishes; Krish remains the gate in the Composer.
 *
 * Body:     { ask: string }
 * Response: { ok, id, idea, lane, lane_slot, reused }
 *
 * Idempotent within a red day: an identical ask inside 20 hours returns the
 * already-built row instead of spending a second generation (the same
 * pragmatic window PilotGate uses for once-a-day semantics).
 */

// Techonomic was retired 2026-08-06 and folded into Mindmake LIVE. A model that
// still reaches for the old name lands on mindmake instead of failing the build.
const RETIRED_LANES: Record<string, string> = { techonomic: 'mindmake', publication: 'mindmake' }
const ALLOWED_LANES = new Set(['signal_noise', 'mindmake', 'builder_economy_ig'])
const REUSE_WINDOW_MS = 20 * 60 * 60 * 1000

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (preamble(req, res)) return

  const ask = String(req.body?.ask || '').trim().slice(0, 500)
  if (!ask) return res.status(400).json({ ok: false, error: 'ask is required' })

  // Same ask, same day: hand back the row that already exists.
  const since = new Date(Date.now() - REUSE_WINDOW_MS).toISOString()
  const { data: existing } = await supabase
    .from('content_ideas')
    .select('id, idea, lane, lane_slot')
    .eq('meta->built_from_ask->>ask', ask)
    .gte('created_at', since)
    .limit(1)
    .maybeSingle()
  if (existing) {
    return res.json({ ok: true, reused: true, ...existing })
  }

  const [voice, corpus, goals] = await Promise.all([
    loadVoiceBlock(), loadCorpus(), goalsSpine('choosing what to write today'),
  ])
  const today = new Date().toISOString().slice(0, 10)

  const system = [
    'You are drafting a publishable piece for Krish Raja, in his voice, on his lowest-capacity day. The bar does not drop because the day is hard.',
    voice ? `\nKRISH VOICE\n${voice.slice(0, 4000)}` : '',
    `\n${VOICE_GUARDRAILS}`,
    corpus ? `\nCHANNEL CORPUS (pick the one lane this piece belongs to, and clear the Five Standards)\n${corpusForChannel(corpus, null, 5000)}` : '',
    `\n${goals.prompt}`,
    '\nNever invent numbers, quotes, or events. If the ask needs evidence you do not have, build the piece from Krish\'s operating reality (building and running an autonomous agent fleet, AI advisory, the builder economy) where his own experience IS the evidence.',
  ].filter(Boolean).join('\n')

  const user = [
    `Today is ${today}.`,
    `Krish's intent, verbatim: "${ask}"`,
    '',
    'Write ONE complete, timely, undeniably-his piece that serves this intent. Choose the lane it belongs to from: signal_noise, mindmake (lane_slot roundup or field_learning), builder_economy_ig.',
    'Length follows the lane: a LinkedIn-register piece runs 150-300 words, an essay lane runs 500-800. It must be finishable and publishable inside fifteen minutes of light editing.',
    '',
    'Return ONLY a JSON object:',
    '{',
    '  "title": string,          // the headline',
    '  "thesis": string,         // one arguable sentence',
    '  "body": string,           // the full draft, ready to edit',
    '  "lane": string,           // one of the three lanes',
    '  "lane_slot": string|null, // only for mindmake',
    '  "why_now": string         // one sentence on why this is timely today',
    '}',
  ].join('\n')

  let rawText: string
  try {
    rawText = await callClaude({ agent: 'pilot-build-one', system, user, maxTokens: 3500, temperature: 0.6 })
  } catch (e: any) {
    return res.status(502).json({ ok: false, error: String(e?.message || e) })
  }

  const parsed = robustJson(rawText)
  if (!parsed || typeof parsed.body !== 'string' || parsed.body.trim().length < 200) {
    return res.status(502).json({ ok: false, error: 'build returned no usable draft', preview: rawText.slice(0, 300) })
  }

  const title = sanitizeVoice(String(parsed.title || ask).slice(0, 250))
  const body = sanitizeVoice(String(parsed.body))
  const thesis = parsed.thesis ? sanitizeVoice(String(parsed.thesis)).slice(0, 500) : null
  const rawLane = RETIRED_LANES[parsed.lane] || parsed.lane
  const lane = ALLOWED_LANES.has(rawLane) ? rawLane : null
  const laneSlot = lane === 'mindmake' && ['roundup', 'field_learning'].includes(parsed.lane_slot)
    ? parsed.lane_slot
    : null
  const whyNow = parsed.why_now ? String(parsed.why_now).slice(0, 300) : null

  let embedding: string | null = null
  try {
    const vec = await embed({ title, body: thesis || body.slice(0, 1500) })
    if (vec) embedding = vectorLiteral(vec)
  } catch { /* non-fatal */ }

  const now = new Date().toISOString()
  const insertRow = {
    idea: title,
    thesis,
    body,
    lane,
    lane_slot: laneSlot,
    state: 'drafting',
    source_type: 'manual',
    source_snippet: whyNow,
    source_captured_at: now,
    distribution: [],
    confidence: null,
    origin: 'user',
    meta: {
      built_from_ask: {
        ask,
        at: now,
        model: UTILITY_MODEL,
        surface: 'pilot',
        why_now: whyNow,
      },
    },
    canonical_url: null,
    title_norm: titleNorm(title),
    content_hash: contentHash(body.slice(0, 2000)),
    concept_id: `concept:content:${lane || 'dynamic'}:built:${slug(title)}-${now.slice(0, 10)}`,
    ...(embedding ? { embedding } : {}),
  }

  const { data: inserted, error: iErr } = await supabase
    .from('content_ideas')
    .insert(insertRow)
    .select('id, idea, lane, lane_slot')
    .single()
  if (iErr || !inserted) {
    return res.status(500).json({ ok: false, error: `build insert failed: ${iErr?.message}` })
  }

  return res.json({ ok: true, reused: false, ...inserted })
}

export const config = { maxDuration: 60 }
