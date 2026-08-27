import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import {
  callClaude,
  loadConfig,
  loadVoiceBlock,
  robustJson,
  sanitizeVoice,
  slug,
  VOICE_GUARDRAILS,
} from '../_content.js'
import { canonicalUrl, titleNorm, contentHash } from '../_text.js'
import { embed, vectorLiteral } from '../_embeddings.js'
import { UTILITY_MODEL } from '../_models.js'

// POST /api/content-ideas/synthesize
//
// Body:
//   {
//     source_idea_ids: string[],           // 2..25 cards to fold into one narrative
//     target_lane: 'mindmaker_live',
//     lane_slot?: string,                  // the format: 'paid' or 'built'
//     angle_hint?: string,                 // optional: Krish's steer for the take
//   }
//
// This is the core "235 cards → 20 narratives" move. Instead of treating each
// card as a 1:1 candidate for publishing, we synthesize a cluster into a
// single drafted piece in the requested lane's voice. A long-form investigation
// typically references 10-15 cards, so this is the operation that match-fits
// the OS to that workflow.
//
// Behavior:
//   1. Load all source cards (title, thesis, source_url, source_snippet, meta).
//   2. Load the lane's voice config from system_config.content_lane_*.
//   3. Build a synthesis prompt that:
//        - grounds in the source cards' actual text + URLs
//        - asks for ONE coherent argument (not a roundup of separate stories
//          unless the lane_slot is 'roundup')
//        - returns a confidence score so we can flag weak clusters in the UI
//   4. Call Claude Sonnet via the shared helper.
//   5. Create a NEW content_ideas row with source_type='synthesis',
//      state='drafting', related_idea_ids=source_ids, and meta.synthesis
//      carrying the cluster summary + per-source citation strip.
//   6. Flip each source card to state='absorbed' (NOT 'dropped') with
//      meta.absorbed_into pointing to the new parent — so the source cards
//      vanish from the active triage deck but stay traceable.
//
// The output goes to 'drafting', NEVER auto-'review'. Krish must open the
// ContentComposer, eyeball the citations, and accept. The Five Standards
// autoscore trigger fires on body insert.

// There is one content venture now, Mindmaker Live, with two formats carried in
// `lane_slot` (paid, built). Every retired lane maps forward rather than 400ing,
// so a stale client or an old saved cluster still synthesizes.
const RETIRED_LANES: Record<string, string> = {
  techonomic: 'mindmaker_live',
  makeyourmindup: 'mindmaker_live',
  mymu: 'mindmaker_live',
  mindmaker: 'mindmaker_live',
  signal_noise: 'mindmaker_live',
  builder_economy: 'mindmaker_live',
  builder_economy_ig: 'mindmaker_live',
}
const VALID_LANES = new Set(['mindmaker_live'])
const MIN_SOURCES = 2
const MAX_SOURCES = 25

interface SourceCard {
  id: string
  idea: string
  thesis?: string | null
  source_url?: string | null
  source_snippet?: string | null
  source_type?: string | null
  pillar_id?: string | null
  meta?: any
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const body = (req.body || {}) as {
    source_idea_ids?: string[]
    target_lane?: string
    lane_slot?: string | null
    angle_hint?: string | null
  }

  const sourceIds = Array.isArray(body.source_idea_ids)
    ? body.source_idea_ids.filter(s => typeof s === 'string' && s.length > 0)
    : []
  if (sourceIds.length < MIN_SOURCES) {
    return res.status(400).json({ ok: false, error: `source_idea_ids must have at least ${MIN_SOURCES} cards` })
  }
  if (sourceIds.length > MAX_SOURCES) {
    return res.status(400).json({ ok: false, error: `source_idea_ids capped at ${MAX_SOURCES} cards per synthesis` })
  }

  const requestedLane = body.target_lane || ''
  const targetLane = RETIRED_LANES[requestedLane] || requestedLane
  if (!VALID_LANES.has(targetLane)) {
    return res.status(400).json({ ok: false, error: `target_lane must be one of: ${Array.from(VALID_LANES).join(', ')}` })
  }
  const laneSlot = body.lane_slot || null

  // Load source cards.
  const { data: sources, error: sErr } = await supabase
    .from('content_ideas')
    .select('id, idea, thesis, source_url, source_snippet, source_type, pillar_id, meta')
    .in('id', sourceIds)
  if (sErr) return res.status(500).json({ ok: false, error: `failed to load source cards: ${sErr.message}` })
  if (!sources || sources.length < MIN_SOURCES) {
    return res.status(400).json({ ok: false, error: 'too few source cards found in DB' })
  }
  const sourceCards = sources as SourceCard[]

  // Load lane voice config + Krish voice block in parallel.
  const cfgKey = laneSlot ? `content_lane_${targetLane}_${laneSlot}` : `content_lane_${targetLane}`
  const [cfgRows, voiceBlock] = await Promise.all([
    loadConfig([cfgKey, `content_lane_${targetLane}`]),
    loadVoiceBlock(),
  ])
  const laneCfg = cfgRows[cfgKey] || cfgRows[`content_lane_${targetLane}`] || null
  if (!laneCfg || typeof laneCfg !== 'object') {
    return res.status(500).json({ ok: false, error: `no voice config for lane: ${cfgKey}` })
  }

  // Build the source block. Each card is one numbered item so the model can
  // cite back as [1], [2]... in its body — we'll render these into a citation
  // strip in the composer.
  const sourceBlock = sourceCards.map((c, i) => {
    const lines: string[] = [`### Source [${i + 1}]: ${c.idea}`]
    if (c.thesis) lines.push(`Thesis: ${c.thesis}`)
    if (c.source_snippet) lines.push(`Snippet: ${c.source_snippet.slice(0, 800)}`)
    if (c.source_url) lines.push(`URL: ${c.source_url}`)
    const m = (c.meta || {}) as any
    if (m.named_entities && Array.isArray(m.named_entities) && m.named_entities.length) {
      lines.push(`Entities: ${m.named_entities.slice(0, 8).join(', ')}`)
    }
    if (Array.isArray(m.research) && m.research.length) {
      lines.push(`Cited: ${m.research.slice(0, 4).join(', ')}`)
    }
    return lines.join('\n')
  }).join('\n\n')

  const draftSystem = typeof laneCfg.draft_system === 'string' ? laneCfg.draft_system : ''
  const audience = typeof laneCfg.audience === 'string' ? laneCfg.audience : ''
  const format = typeof laneCfg.format === 'string' ? laneCfg.format : 'essay'

  const system = [
    draftSystem,
    voiceBlock ? `\n\nVOICE BLOCK\n${voiceBlock}` : '',
    `\n\nVOICE GUARDRAILS\n${VOICE_GUARDRAILS}`,
    `\n\nYOU ARE WRITING ONE COHERENT ${format.toUpperCase()} — NOT A ROUNDUP. ${
      laneSlot === 'roundup'
        ? 'Exception: this IS the roundup slot, so it can be a curated list, but it still has a single editorial throughline.'
        : 'The source cards are seedlings of ONE narrative. Find the underlying argument that ties them together. Discard the cards that do not earn a place in the final piece. Cite the cards you use as [1], [2] inline.'
    }`,
  ].filter(Boolean).join('')

  const user = [
    `Synthesize the following ${sourceCards.length} content seedlings into ONE ${format} for the ${targetLane}${laneSlot ? ' / ' + laneSlot : ''} lane.`,
    audience ? `Audience: ${audience}.` : '',
    body.angle_hint ? `\nKrish's steer for the angle: ${body.angle_hint}` : '',
    `\n\nSOURCE CARDS\n${sourceBlock}`,
    `\n\nReturn ONLY a single JSON object with this exact shape:`,
    `{`,
    `  "title": string,                     // headline for the synthesized piece`,
    `  "thesis": string,                    // one-line arguable claim`,
    `  "body": string,                      // the full draft, with [n] inline citations to source cards`,
    `  "cluster_summary": string,           // 1-2 sentence description of the narrative thread (for the cockpit cluster badge)`,
    `  "cohesion_confidence": number,       // 0..1 — how cohesive these cards are as one narrative. <0.6 means the cluster is weak; the UI will warn Krish.`,
    `  "sources_used": number[],            // indices (1-based) of the source cards that actually earned a place in the body`,
    `  "sources_discarded": number[]        // indices that did not — and a one-line reason for each in "discard_reasons"`,
    `  "discard_reasons": string[]`,
    `}`,
  ].filter(Boolean).join('\n')

  let rawText: string
  try {
    rawText = await callClaude({
      agent: 'cleo-synthesize',
      system,
      user,
      model: UTILITY_MODEL,
      maxTokens: 4500,
      temperature: 0.5,
    })
  } catch (e: any) {
    return res.status(502).json({ ok: false, error: String(e?.message || e) })
  }

  const parsed = robustJson(rawText)
  if (!parsed || typeof parsed.body !== 'string' || !parsed.body.trim()) {
    return res.status(502).json({
      ok: false,
      error: 'synthesis returned no usable body',
      preview: rawText.slice(0, 400),
    })
  }

  const title = sanitizeVoice(String(parsed.title || sourceCards[0].idea).slice(0, 250))
  const draftBody = sanitizeVoice(String(parsed.body))
  const thesis = parsed.thesis ? sanitizeVoice(String(parsed.thesis)).slice(0, 500) : null
  const clusterSummary = parsed.cluster_summary ? String(parsed.cluster_summary).slice(0, 500) : null
  const cohesion = typeof parsed.cohesion_confidence === 'number'
    ? Math.max(0, Math.min(1, parsed.cohesion_confidence))
    : null
  const sourcesUsed = Array.isArray(parsed.sources_used)
    ? parsed.sources_used.filter((n: any) => Number.isInteger(n) && n > 0 && n <= sourceCards.length)
    : []
  const sourcesDiscarded = Array.isArray(parsed.sources_discarded)
    ? parsed.sources_discarded.filter((n: any) => Number.isInteger(n) && n > 0 && n <= sourceCards.length)
    : []
  const discardReasons = Array.isArray(parsed.discard_reasons)
    ? parsed.discard_reasons.map((s: any) => String(s).slice(0, 200))
    : []

  // Map back to actual card ids for storage.
  const usedSourceIds = sourcesUsed.map((n: number) => sourceCards[n - 1]?.id).filter(Boolean) as string[]
  const discardedSourceIds = sourcesDiscarded.map((n: number) => sourceCards[n - 1]?.id).filter(Boolean) as string[]
  const allCitedIds = usedSourceIds.length > 0 ? usedSourceIds : sourceCards.map(c => c.id)

  // Compute dedup keys + embedding for the new synthesis row.
  const canonical_url = null  // syntheses are NOT identified by a single URL
  const title_norm = titleNorm(title)
  const content_hash = contentHash(draftBody.slice(0, 2000))
  let embedding: string | null = null
  try {
    const vec = await embed({ title, body: thesis || draftBody.slice(0, 1500) })
    if (vec) embedding = vectorLiteral(vec)
  } catch { /* non-fatal */ }

  const sourceCitationStrip = allCitedIds.map((id, i) => {
    const c = sourceCards.find(s => s.id === id)
    return {
      ref: i + 1,
      id,
      title: c?.idea || '',
      source_url: c?.source_url || null,
      source_type: c?.source_type || null,
    }
  })

  const now = new Date().toISOString()
  const conceptId = `concept:content:${targetLane}:synth:${slug(title)}-${now.slice(0, 10)}`

  const insertRow = {
    idea: title,
    thesis,
    body: draftBody,
    lane: targetLane,
    lane_slot: laneSlot,
    state: 'drafting',
    source_type: 'synthesis',
    source_ref: null,
    source_url: null,
    source_snippet: clusterSummary,
    source_captured_at: now,
    distribution: [],
    related_idea_ids: allCitedIds,
    pillar_id: sourceCards.find(c => c.pillar_id)?.pillar_id || null,
    confidence: cohesion,
    origin: 'user',  // Krish triggered this; not auto-buried by the backburner sweep
    meta: {
      synthesis: {
        source_ids: sourceIds,
        sources_used: usedSourceIds,
        sources_discarded: discardedSourceIds,
        discard_reasons: discardReasons,
        citation_strip: sourceCitationStrip,
        cluster_summary: clusterSummary,
        cohesion_confidence: cohesion,
        model: UTILITY_MODEL,
        prompt_version: 'v1',
        synthesized_at: now,
        target_lane: targetLane,
        lane_slot: laneSlot,
        angle_hint: body.angle_hint || null,
      },
    },
    canonical_url,
    title_norm,
    content_hash,
    concept_id: conceptId,
    ...(embedding ? { embedding } : {}),
  }

  const { data: inserted, error: iErr } = await supabase
    .from('content_ideas')
    .insert(insertRow)
    .select('id')
    .single()
  if (iErr || !inserted) {
    return res.status(500).json({ ok: false, error: `synthesis insert failed: ${iErr?.message}` })
  }

  // Flip the cited source cards to 'absorbed' with a pointer to the new
  // parent. We deliberately leave non-cited cards alone — they remain in
  // triage in case Krish wants to use them in a different narrative.
  if (allCitedIds.length > 0) {
    const { error: aErr } = await supabase.rpc('mark_absorbed', {
      p_source_ids: allCitedIds,
      p_parent_id: inserted.id,
    })
    if (aErr) {
      // Fall back to per-row updates if the RPC isn't available yet.
      for (const sid of allCitedIds) {
        const card = sourceCards.find(c => c.id === sid)
        const prevMeta = (card?.meta && typeof card.meta === 'object') ? card.meta : {}
        await supabase
          .from('content_ideas')
          .update({
            state: 'absorbed',
            meta: { ...prevMeta, absorbed_into: inserted.id, absorbed_at: now },
            updated_at: now,
          })
          .eq('id', sid)
      }
    }
  }

  return res.json({
    ok: true,
    id: inserted.id,
    cohesion_confidence: cohesion,
    sources_used: usedSourceIds.length,
    sources_discarded: discardedSourceIds.length,
    cluster_summary: clusterSummary,
  })
}
