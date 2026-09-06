import { callClaude, robustJson, sanitizeVoice } from './_content.js'
import { SYNTHESIS_MODEL } from './_models.js'
import type { CreatorRow } from './_creators.js'

// Move extraction for the creator scout (api/discover-creator-posts.ts).
//
// The product rule this encodes: a curated creator's post is inspiration for
// the transferable MOVE (hook type, structure, named concept, proof pattern,
// CTA), never for the wording. The output of this call is Krish's own
// differentiated take on the move; a paraphrase of the source post is a
// rejection, not a suggestion. That line is what separates an inspiration
// engine from a plagiarism engine, so it is enforced in the prompt AND
// re-checked by the caller's gates (brand fit, beat, dedup).
//
// One batched Sonnet-class call per run (MT-003: Opus is Agatha-only; no
// fallback ladder per CFG-COST-001..003).

export interface CreatorPost {
  url: string
  text: string
  postedAt: string | null
  creator: CreatorRow
}

export interface CreatorMove {
  is_move: boolean
  post_url: string
  creator_slug: string
  move: {
    hook_type: string | null
    structure: string | null
    named_concept: string | null
    proof_pattern: string | null
    cta_type: string | null
  } | null
  why_it_works: string | null
  krish_angle: string | null
  idea: string | null
  thesis: string | null
  pillar_id: string | null
  lane_slot: 'money_of_ai' | 'built_with_ai' | null
  distribution: string[]
  brand_fit_score: number | null
  confidence: number | null
  temporal_class: 'ephemeral' | 'developing' | 'durable' | null
  expires_in_days: number | null
  rejection_reason: string | null
}

export interface CreatorMoveCtx {
  pillars: { id: string; name: string; description: string }[]
  /** Recent idea headlines (60d, buried included): the novelty floor. */
  recentAngles: string[]
  minBrandFit: number
}

const LANE_SLOTS = new Set(['money_of_ai', 'built_with_ai'])
const TEMPORAL = new Set(['ephemeral', 'developing', 'durable'])

const clean = (v: unknown): string | null => {
  const s = typeof v === 'string' ? sanitizeVoice(v).trim() : ''
  return s || null
}

const intIn = (v: unknown, lo: number, hi: number): number | null => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null
}

function buildSystem(ctx: CreatorMoveCtx, creators: CreatorRow[]): string {
  const creatorsBlock = creators
    .map(c => `- ${c.name}${c.linkedin_slug ? ` (${c.linkedin_slug})` : ''}: ${c.why}`)
    .join('\n')
  const pillarsBlock = ctx.pillars
    .map(p => `- ${p.id}: ${p.name}. ${p.description}`)
    .join('\n')
  const recentBlock = ctx.recentAngles.length
    ? ctx.recentAngles.map(a => `- ${a}`).join('\n')
    : '- (none on record)'

  return [
    'You read recent LinkedIn posts by creators Krish Raja explicitly rates. Your job is NOT to summarise the posts. For each post, extract the transferable MOVE and propose Krish\'s differentiated take on that move for his own publication.',
    '',
    'A MOVE is: hook_type (how the first line earns the read), structure (the shape of the argument), named_concept (a coined term, if any, e.g. "verification debt"), proof_pattern (how it earns belief: real numbers, cohort results, a shipped artifact), cta_type (how it ends).',
    '',
    '## CREATORS KRISH RATES (the "why" is what to emulate)',
    creatorsBlock,
    '',
    '## KRISH PILLARS (pillar_id must be one of these ids, or null)',
    pillarsBlock,
    '',
    '## VOICE RULES',
    'Declarative and specific. Real numbers, real artifacts, one sharp thought per piece. Plain English, no buzzwords. Never use em dashes anywhere.',
    '',
    '## HARD RULES',
    '- Borrow the structure, never the wording. krish_angle must be Krish\'s own claim, grounded in his world: AI advisory, building an agentic operating system in public, the economics of AI. A restatement or paraphrase of the post is a REJECT: set is_move=false and rejection_reason="paraphrase".',
    '- Two channels only. lane_slot is "money_of_ai" (second-order economics of AI: pricing, margins, labour, positioning, unit economics; never the launch or benchmark itself) or "built_with_ai" (someone actually built and shipped something).',
    `- Score brand_fit_score 1-10 against the pillar bar. Below ${ctx.minBrandFit} is a REJECT: is_move=false, rejection_reason="low_fit".`,
    '- temporal_class: ephemeral (dies in days), developing (weeks), durable (evergreen). expires_in_days only for ephemeral or developing.',
    '',
    '## ALREADY SAID (hard novelty floor, last 60 days)',
    recentBlock,
    'A suggestion restating any of these angles, even with different numbers or companies, is a REJECT: is_move=false, rejection_reason="duplicate_angle".',
    '',
    '## OUTPUT',
    'Strict JSON only, no prose around it, exactly this shape with one item per input post, same order:',
    '{"items": [{"is_move": true, "post_url": "...", "creator_slug": "...", "move": {"hook_type": "...", "structure": "...", "named_concept": null, "proof_pattern": "...", "cta_type": "..."}, "why_it_works": "...", "krish_angle": "...", "idea": "headline in Krish voice", "thesis": "1-2 sentences", "pillar_id": "...", "lane_slot": "money_of_ai", "distribution": ["linkedin"], "brand_fit_score": 8, "confidence": 0.8, "temporal_class": "durable", "expires_in_days": null, "rejection_reason": null}]}',
  ].join('\n')
}

function buildUser(posts: CreatorPost[]): string {
  return posts
    .map((p, i) => [
      `### POST ${i + 1}`,
      `creator_slug: ${p.creator.slug}`,
      `creator: ${p.creator.name}`,
      `post_url: ${p.url}`,
      `posted_at: ${p.postedAt || 'unknown'}`,
      `text: ${p.text.slice(0, 1400)}`,
    ].join('\n'))
    .join('\n\n')
}

/** One batched extraction call over the surviving posts. Returns one entry per
 *  post the model answered for; the caller re-gates everything it keeps. */
export async function extractCreatorMoves(
  posts: CreatorPost[],
  ctx: CreatorMoveCtx,
): Promise<CreatorMove[]> {
  if (!posts.length) return []
  const creators = [...new Map(posts.map(p => [p.creator.slug, p.creator])).values()]

  const raw = await callClaude({
    system: buildSystem(ctx, creators),
    user: buildUser(posts),
    model: SYNTHESIS_MODEL,
    maxTokens: 3500,
    temperature: 0.4,
    timeoutMs: 120_000,
    agent: 'creator-scout',
  })

  const parsed = robustJson(raw)
  const items: unknown[] = Array.isArray(parsed?.items) ? parsed.items
    : Array.isArray(parsed) ? parsed : []
  const byUrl = new Map(posts.map(p => [p.url, p]))

  const out: CreatorMove[] = []
  items.forEach((it, i) => {
    const r = (it || {}) as Record<string, any>
    // Anchor each item back to a real input post: by echoed url first, by
    // position second. An item matching neither is a hallucinated post.
    const post = byUrl.get(String(r.post_url || '')) || posts[i]
    if (!post) return
    const mv = (r.move && typeof r.move === 'object' ? r.move : null) as Record<string, unknown> | null
    const slot = LANE_SLOTS.has(String(r.lane_slot)) ? String(r.lane_slot) as CreatorMove['lane_slot'] : null
    const temporal = TEMPORAL.has(String(r.temporal_class)) ? String(r.temporal_class) as CreatorMove['temporal_class'] : null
    const distribution = Array.isArray(r.distribution)
      ? r.distribution.filter((d: unknown) => typeof d === 'string' && d).slice(0, 4)
      : []
    const conf = Number(r.confidence)
    out.push({
      is_move: r.is_move === true,
      post_url: post.url,
      creator_slug: post.creator.slug,
      move: mv ? {
        hook_type: clean(mv.hook_type),
        structure: clean(mv.structure),
        named_concept: clean(mv.named_concept),
        proof_pattern: clean(mv.proof_pattern),
        cta_type: clean(mv.cta_type),
      } : null,
      why_it_works: clean(r.why_it_works),
      krish_angle: clean(r.krish_angle),
      idea: clean(r.idea),
      thesis: clean(r.thesis),
      pillar_id: clean(r.pillar_id),
      lane_slot: slot,
      distribution: distribution.length ? distribution : ['linkedin'],
      brand_fit_score: intIn(r.brand_fit_score, 1, 10),
      confidence: Number.isFinite(conf) ? Math.min(1, Math.max(0, conf)) : null,
      temporal_class: temporal,
      expires_in_days: intIn(r.expires_in_days, 3, 90),
      rejection_reason: clean(r.rejection_reason),
    })
  })
  return out
}
