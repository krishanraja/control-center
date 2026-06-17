import { supabase } from './_supabase.js'
import { emailNorm, linkedinNorm } from './_text.js'

// A recorded/published podcast guest is a warm relationship, not an opportunity.
// Promote it into the Network (contacts) under the venture its show maps to.
// 'either' has no single venture, so it's left null for the user to assign.
const PODCAST_VENTURE: Record<string, string | null> = {
  signal_noise: 'signal_noise',
  builder_economy: 'builder_economy',
  either: null,
}

export interface PromoteResult {
  ok: boolean
  contact_id?: string
  created?: boolean
  matched?: boolean
  error?: string
}

/**
 * Upsert a contact from a guest. Idempotent: dedupes on source_guest_id first,
 * then email / linkedin (the same identity keys contacts/import uses), so a
 * guest never spawns a duplicate contact and re-runs are safe. On a match it
 * just stamps source_guest_id; otherwise it inserts a warm, already-triaged
 * contact so it lands straight in the Network warm queue.
 */
export async function promoteGuestToContact(guestId: string): Promise<PromoteResult> {
  const { data: g, error } = await supabase.from('guests').select('*').eq('id', guestId).single()
  if (error || !g) return { ok: false, error: error?.message || 'guest not found' }

  const venture = PODCAST_VENTURE[g.podcast_target as string] ?? null
  const en = emailNorm(g.email)
  const ln = linkedinNorm(g.linkedin_url)

  // Dedup: prior promotion of this guest, then email, then linkedin.
  let existingId: string | null = null
  {
    const { data } = await supabase.from('contacts').select('id').eq('source_guest_id', guestId).maybeSingle()
    if (data?.id) existingId = data.id
  }
  if (!existingId && en) {
    const { data } = await supabase.from('contacts').select('id').eq('email_normalized', en).maybeSingle()
    if (data?.id) existingId = data.id
  }
  if (!existingId && ln) {
    const { data } = await supabase.from('contacts').select('id').eq('linkedin_url_norm', ln).maybeSingle()
    if (data?.id) existingId = data.id
  }

  if (existingId) {
    const { error: upErr } = await supabase.from('contacts').update({ source_guest_id: guestId }).eq('id', existingId)
    if (upErr) return { ok: false, error: upErr.message }
    return { ok: true, contact_id: existingId, matched: true, created: false }
  }

  const now = new Date().toISOString()
  const insert: Record<string, unknown> = {
    full_name: g.name || null,
    email: g.email || null,
    email_normalized: en,
    linkedin_url: g.linkedin_url || null,
    linkedin_url_norm: ln,
    twitter_handle: g.twitter_handle || null,
    origin_channel: 'podcast_guest',
    origin_venture: venture,
    origin_campaign: g.podcast_target ? `podcast_${g.podcast_target}` : 'podcast',
    primary_venture: venture,
    consent_tier: 'warm',           // a recorded guest is a warm relationship
    triage_status: 'triaged',       // known to us — skip the cold triage pile
    status: 'active',
    notes: g.one_liner || g.why_fit || null,
    tags: ['podcast_guest'],
    sources: [{ type: 'podcast_guest', guest_id: guestId, podcast: g.podcast_target, at: now }],
    source_guest_id: guestId,
    acquired_at: g.recorded_at || g.created_at || now,
  }
  const { data, error: insErr } = await supabase.from('contacts').insert(insert).select('id').single()
  if (insErr) return { ok: false, error: insErr.message }

  await supabase.from('audit_log').insert({
    event_type: 'guest_promoted_to_contact',
    actor: 'nell',
    target: data.id,
    details: JSON.stringify({ guest_id: guestId, venture, name: g.name }),
  })
  return { ok: true, contact_id: data.id, created: true }
}
