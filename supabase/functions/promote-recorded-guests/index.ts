// One-off server-side backfill: promote every recorded/published guest into the
// Network (contacts), mirroring api/_guest-to-contact.ts. Runs with the service
// role (bypasses RLS) since this session has no SUPABASE_SERVICE_ROLE_KEY for the
// CLI script. Idempotent: dedupes on source_guest_id -> email -> linkedin, so
// re-runs are safe. Also backfills contacts.linkedin_url_norm (real linkedin.com
// URLs only) so the linkedin dedup tier actually matches existing contacts.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const PODCAST_VENTURE: Record<string, string | null> = {
  signal_noise: 'signal_noise',
  builder_economy: 'builder_economy',
  either: null,
}

// --- normalization, ported verbatim from api/_text.ts ---
function canonicalUrl(input: string | null | undefined): string | null {
  if (!input) return null
  const raw = String(input).trim()
  if (!raw) return null
  let u: URL
  try { u = new URL(raw) } catch {
    try { u = new URL('https://' + raw) } catch { return null }
  }
  let host = u.hostname.toLowerCase()
  if (host.startsWith('www.')) host = host.slice(4)
  u.hostname = host
  u.search = ''
  u.hash = ''
  if (u.protocol === 'http:' || u.protocol === 'https:') u.protocol = 'https:'
  while (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1)
  return u.toString()
}
function emailNorm(input: string | null | undefined): string | null {
  if (!input) return null
  const e = String(input).trim().toLowerCase()
  return e.includes('@') && e.length > 3 ? e : null
}
function linkedinNorm(input: string | null | undefined): string | null {
  if (!input) return null
  let c = canonicalUrl(input)
  if (!c) return null
  while (c.endsWith('/')) c = c.slice(0, -1)
  return c.toLowerCase()
}

Deno.serve(async () => {
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // Backfill linkedin_url_norm on existing contacts (real linkedin.com only, to
  // skip "Search LinkedIn"/"TBD" junk) so the linkedin dedup tier can match.
  let backfilled = 0
  {
    const { data } = await sb.from('contacts')
      .select('id, linkedin_url')
      .ilike('linkedin_url', '%linkedin.com%')
      .is('linkedin_url_norm', null)
      .limit(5000)
    for (const c of data || []) {
      const ln = linkedinNorm(c.linkedin_url)
      if (!ln) continue
      const { error } = await sb.from('contacts').update({ linkedin_url_norm: ln }).eq('id', c.id)
      if (!error) backfilled++
    }
  }

  const { data: guests, error } = await sb.from('guests')
    .select('*').in('status', ['recorded', 'published'])
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 })

  let created = 0, matched = 0, failed = 0
  for (const g of guests || []) {
    try {
      const venture = PODCAST_VENTURE[g.podcast_target as string] ?? null
      const en = emailNorm(g.email)
      const ln = linkedinNorm(g.linkedin_url)

      let existingId: string | null = null
      {
        const { data } = await sb.from('contacts').select('id').eq('source_guest_id', g.id).maybeSingle()
        if (data?.id) existingId = data.id
      }
      if (!existingId && en) {
        const { data } = await sb.from('contacts').select('id').eq('email_normalized', en).maybeSingle()
        if (data?.id) existingId = data.id
      }
      if (!existingId && ln && ln.includes('linkedin.com')) {
        const { data } = await sb.from('contacts').select('id').eq('linkedin_url_norm', ln).maybeSingle()
        if (data?.id) existingId = data.id
      }

      if (existingId) {
        await sb.from('contacts').update({ source_guest_id: g.id }).eq('id', existingId)
        matched++
        continue
      }

      const now = new Date().toISOString()
      const { error: insErr } = await sb.from('contacts').insert({
        full_name: g.name || null,
        email: g.email || null,
        // email_normalized is a GENERATED column (lower(btrim(email))) — never write it.
        linkedin_url: g.linkedin_url || null,
        linkedin_url_norm: ln && ln.includes('linkedin.com') ? ln : null,
        twitter_handle: g.twitter_handle || null,
        origin_channel: 'podcast_guest',
        origin_venture: venture,
        origin_campaign: g.podcast_target ? `podcast_${g.podcast_target}` : 'podcast',
        primary_venture: venture,
        consent_tier: 'warm',
        triage_status: 'triaged',
        status: 'active',
        first_met_channel: 'podcast_guest',
        first_met_context: g.one_liner || g.why_fit || null,
        tags: ['podcast_guest'],
        sources: [{ type: 'podcast_guest', guest_id: g.id, podcast: g.podcast_target, at: now }],
        source_guest_id: g.id,
        acquired_at: g.recorded_at || g.created_at || now,
      })
      if (insErr) { failed++; continue }
      created++
    } catch { failed++ }
  }

  return Response.json({ ok: true, total: (guests || []).length, created, matched, failed, linkedin_norm_backfilled: backfilled })
})
