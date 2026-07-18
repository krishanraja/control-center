import { supabase } from './_supabase.js'

/**
 * The prompt spine. One place renders a lane's LOCKED direction into the
 * system-prompt block every copy-producing path uses (nurture sends, sequence
 * proposals, reply drafts, win-backs, social posts, push, SEO briefs). No path
 * composes brand voice ad hoc anymore — they all call getLaneDirection() and
 * directionPrompt(). This is what makes "Krish locks it, the system propagates
 * it" mechanical: change the locked direction, and every future generation
 * conforms without touching code.
 *
 * Standing rule baked in: no motion may require Krish's personal brand in
 * public. The prompt always forbids writing as / signing as / referencing him.
 */

export interface LaneDirection {
  id: string
  lane: string
  version: number
  status: 'draft' | 'locked' | 'superseded'
  positioning: string | null
  messaging_pillars: Array<{ pillar?: string; proof?: string }>
  offers: Array<{ name?: string; price?: string; url?: string }>
  icp: string | null
  voice: string | null
  never_say: string[]
  creative_direction: {
    sender?: string
    mailbox?: string
    palette_ref?: string
    canva_template_ids?: string[]
    image_style?: string
    video_style?: string
  }
  channel_priorities: string[]
  notes: string | null
  locked_at: string | null
  locked_by: string | null
}

/**
 * The locked direction for a lane, or the latest draft if none is locked yet.
 * Falls back to venture_registry.voice_profile only if no direction row exists
 * at all (pre-migration safety). Returns null if the lane is unknown.
 */
export async function getLaneDirection(lane: string): Promise<LaneDirection | null> {
  const { data } = await supabase
    .from('lane_directions')
    .select('*')
    .eq('lane', lane)
    .order('status', { ascending: true }) // 'draft' < 'locked' < 'superseded' — locked wins ties below
    .order('version', { ascending: false })
    .limit(10)
  const rows = (data as LaneDirection[] | null) || []
  if (rows.length) {
    const locked = rows.find(r => r.status === 'locked')
    return locked || rows.find(r => r.status === 'draft') || rows[0]
  }
  // Fallback: synthesize a pseudo-direction from voice_profile.
  const { data: v } = await supabase
    .from('venture_registry')
    .select('slug, voice_profile')
    .eq('slug', lane)
    .maybeSingle()
  const vp = (v?.voice_profile || null) as any
  if (!vp) return null
  return {
    id: 'voice_profile_fallback', lane, version: 0, status: 'locked',
    positioning: vp.strategy || null, messaging_pillars: [], offers: [],
    icp: vp.icp || null, voice: vp.voice || null,
    never_say: Array.isArray(vp.never_say) ? vp.never_say : [],
    creative_direction: { sender: vp.sender, mailbox: vp.mailbox },
    channel_priorities: Array.isArray(vp.channels) ? vp.channels : [],
    notes: null, locked_at: null, locked_by: null,
  }
}

/**
 * Render a locked direction into a system-prompt block. `context` narrows the
 * instruction to the surface (e.g. 'a nurture email', 'a LinkedIn post for the
 * product brand', 'a win-back email'). Always returns product-brand voice rules
 * and the personal-brand prohibition.
 */
export function directionPrompt(dir: LaneDirection, context: string): string {
  const sender = dir.creative_direction?.sender || 'the product team'
  const pillars = (dir.messaging_pillars || [])
    .map(p => p?.pillar ? `- ${p.pillar}${p.proof ? ` (proof: ${p.proof})` : ''}` : null)
    .filter(Boolean)
  const offers = (dir.offers || [])
    .map(o => o?.name ? `- ${o.name}${o.price ? ` (${o.price})` : ''}${o.url ? ` ${o.url}` : ''}` : null)
    .filter(Boolean)

  return [
    `You are writing ${context} for ${sender}.`,
    dir.positioning ? `POSITIONING: ${dir.positioning}` : null,
    dir.icp ? `AUDIENCE (ICP): ${dir.icp}` : null,
    dir.voice ? `VOICE: ${dir.voice}` : null,
    pillars.length ? `MESSAGING PILLARS (stay on these):\n${pillars.join('\n')}` : null,
    offers.length ? `OFFERS you may reference:\n${offers.join('\n')}` : null,
    dir.never_say.length ? `NEVER SAY: ${dir.never_say.join(', ')}.` : null,
    'BRAND RULE (absolute): never write as, sign as, or reference Krish or any personal brand. This is a product-brand voice only.',
    `Sign off as ${sender}. The message goes out from the product mailbox.`,
    'No em dashes. No AI-marketing filler. Write only the requested piece.',
  ].filter(Boolean).join('\n')
}

/** Convenience: fetch + render in one call. Returns { prompt, version } so the
 *  caller can stamp direction_version on whatever it generates. */
export async function directionSpine(
  lane: string,
  context: string,
): Promise<{ prompt: string; version: number; direction: LaneDirection } | null> {
  const dir = await getLaneDirection(lane)
  if (!dir) return null
  return { prompt: directionPrompt(dir, context), version: dir.version, direction: dir }
}

/**
 * Mechanical conformance lint (zero-LLM, zero-cost): does this generated text
 * violate the locked direction's never_say list? Returns the offending phrases.
 * Off-direction content cannot quietly ship — callers reject on non-empty.
 */
export function conformanceViolations(text: string, dir: LaneDirection): string[] {
  const hay = (text || '').toLowerCase()
  const hits: string[] = []
  for (const phrase of dir.never_say || []) {
    const p = String(phrase || '').trim().toLowerCase()
    if (p && p !== 'personal brand references' && hay.includes(p)) hits.push(phrase)
  }
  // Personal-brand guard: the standing rule, always checked.
  if (/\bkrish\b/i.test(text || '')) hits.push('personal brand reference (Krish)')
  return hits
}
