import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guard } from '../_auth.js'
import { supabase } from '../_supabase.js'
import { emailNorm, linkedinNorm } from '../_text.js'
import { buildIntelDoc, embedIntelDoc, type PersonFacts } from '../_personEnrich.js'
import { vectorLiteral } from '../_embeddings.js'
import { blockedMessage, isBlocking, summarise, type ProviderOutcome } from '../_quota.js'
import { raiseQuotaAlert } from '../_alert.js'

// POST /api/network/add-person
//
// Phase 2 of adding somebody from a screenshot: write the person into the
// network. Phase 1 (scan-card) only read the image; phase 3 (enrich-person)
// deepens what is here.
//
// "In my network" is two rows, not one:
//
//   contacts               identity + provenance. Anon-readable.
//   contact_intelligence   the judgment layer, and — the part that actually
//                          matters here — intel_doc + embedding, which is how
//                          network_search finds anyone at all.
//
// A contacts row on its own is invisible to the Network tab. That is why this
// route writes both, and why it treats a failed embedding as a failure rather
// than a detail: a person who cannot be found was not added.
//
// Split from enrichment on purpose. Enrichment can take 60s+ once a LinkedIn
// profile scrape is involved, and a Vercel function dies at 60. Getting the
// person in fast and deepening them afterwards means the record is never lost
// to a timeout.

export const config = { maxDuration: 30 }

const TIERS = new Set(['cold_scraped', 'cold_engaged', 'permissioned', 'warm', 'customer'])

interface Body {
  full_name?: string
  headline?: string | null
  title?: string | null
  company?: string | null
  location?: string | null
  linkedin_url?: string | null
  email?: string | null
  followers?: number | null
  origin_venture?: string
  origin_campaign?: string
  consent_tier?: string
  /** Free text from the operator: how they know this person. */
  note?: string | null
  /** Provenance of the image itself, for contacts.sources. */
  source_document_name?: string | null
  /** When set, update this existing contact instead of inserting. */
  merge_into?: string | null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guard(req, res)) return

  const b = (req.body || {}) as Body
  const fullName = (b.full_name || '').trim()
  if (!fullName) return res.status(400).json({ ok: false, error: 'full_name is required' })

  const consentTier = b.consent_tier || 'warm'
  if (!TIERS.has(consentTier)) return res.status(400).json({ ok: false, error: `invalid consent_tier: ${consentTier}` })
  // Provenance is required for the same reason it is required on CSV import:
  // it is how the Relationship Engine knows how it is allowed to speak to
  // someone. A screenshot cannot supply it, so the caller must.
  if (!b.origin_venture) return res.status(400).json({ ok: false, error: 'origin_venture is required' })
  if (!b.origin_campaign) return res.status(400).json({ ok: false, error: 'origin_campaign is required' })

  const email = emailNorm(b.email)
  const linkedinNormalized = linkedinNorm(b.linkedin_url)
  const now = new Date().toISOString()

  // ── 1. Resolve the target row ────────────────────────────────────────────
  let contactId: string | null = null
  let created = false

  try {
    if (b.merge_into) {
      const { data } = await supabase.from('contacts').select('id').eq('id', b.merge_into).maybeSingle()
      if (!data) return res.status(404).json({ ok: false, error: 'merge_into contact not found' })
      contactId = (data as { id: string }).id
    } else {
      // Re-check identity at write time even though scan-card already looked.
      // The two calls are seconds apart but the check is cheap and the cost of
      // getting it wrong is a duplicate person in a 10,670-row network.
      for (const probe of [
        linkedinNormalized ? { col: 'linkedin_url_norm', val: linkedinNormalized } : null,
        email ? { col: 'email_normalized', val: email } : null,
      ].filter(Boolean) as { col: string; val: string }[]) {
        const { data } = await supabase.from('contacts').select('id').eq(probe.col, probe.val).limit(1)
        if (data?.length) { contactId = (data[0] as { id: string }).id; break }
      }
    }

    if (contactId) {
      // Enrich in place. Only fill blanks — a screenshot must not overwrite a
      // title someone curated, and consent_tier is never demoted here.
      const { data: existing } = await supabase
        .from('contacts')
        .select('title, company, location, linkedin_url, email, sources, first_met_context')
        .eq('id', contactId).maybeSingle()
      const ex = (existing || {}) as Record<string, any>
      const patch: Record<string, unknown> = { updated_at: now }
      if (!ex.title && b.title) patch.title = b.title
      if (!ex.company && b.company) patch.company = b.company
      if (!ex.location && b.location) patch.location = b.location
      if (!ex.linkedin_url && b.linkedin_url) { patch.linkedin_url = b.linkedin_url; patch.linkedin_url_norm = linkedinNormalized }
      // NOT email_normalized: it is GENERATED ALWAYS AS lower(btrim(email)), so
      // naming it in a write makes Postgres reject the statement (428C9).
      if (!ex.email && b.email) patch.email = b.email
      if (!ex.first_met_context && b.note) patch.first_met_context = b.note
      const priorSources = Array.isArray(ex.sources) ? ex.sources : []
      patch.sources = [...priorSources, { type: 'screenshot', document: b.source_document_name || null, at: now }]
      const { error } = await supabase.from('contacts').update(patch).eq('id', contactId)
      if (error) return res.status(500).json({ ok: false, error: `contact update failed: ${error.message}` })
    } else {
      const { data, error } = await supabase.from('contacts').insert({
        full_name: fullName,
        email: b.email || null,
        linkedin_url: b.linkedin_url || null,
        linkedin_url_norm: linkedinNormalized,
        company: b.company || null,
        title: b.title || null,
        location: b.location || null,
        origin_channel: 'screenshot',
        origin_venture: b.origin_venture,
        origin_campaign: b.origin_campaign,
        sources: [{ type: 'screenshot', document: b.source_document_name || null, at: now }],
        consent_tier: consentTier,
        // 'triaged' rather than 'pending': this person was chosen by hand, not
        // swept up by a scraper, so they do not belong in the triage queue.
        triage_status: 'triaged',
        first_met_channel: 'linkedin',
        first_met_context: b.note || null,
        acquired_at: now,
        enrichment_status: 'none',
      }).select('id').single()
      if (error) return res.status(500).json({ ok: false, error: `contact insert failed: ${error.message}` })
      contactId = (data as { id: string }).id
      created = true
    }
  } catch (e: unknown) {
    return res.status(500).json({ ok: false, error: `write failed: ${String((e as Error)?.message || e).slice(0, 200)}` })
  }

  // ── 2. Make them findable ────────────────────────────────────────────────
  //
  // A first-pass intelligence row built from the screenshot alone. Marked
  // honestly: intel_method 'screenshot_v1', confidence 'low', and a network_tier
  // that reflects one source, not a relationship. Enrichment upgrades all three.
  const facts: PersonFacts = {
    title: b.title || undefined,
    company: b.company || undefined,
    location: b.location || undefined,
    headline: b.headline || undefined,
    followerCount: b.followers ?? undefined,
    career: [],
    skills: [],
    sourceList: ['screenshot'],
  }
  // The operator's own note is the strongest signal in this row — it is the
  // only sentence written by somebody who actually knows the person — so it
  // goes into the retrieval text as `who` rather than being kept aside.
  const intelDoc = buildIntelDoc(fullName, facts, b.note ? { who: b.note } : null)
  const { vector, outcome: embedOutcome } = await embedIntelDoc(intelDoc)

  const outcomes: ProviderOutcome[] = [embedOutcome]
  const summary = summarise(outcomes)

  const intelRow: Record<string, unknown> = {
    contact_id: contactId,
    who: b.headline || b.title || null,
    roles: [],
    surface_when: [],
    // Evidence tier, not permission tier: one source we own.
    network_tier: '4_owned_network',
    tier_weight: 1,
    confidence: 'low',
    intel_method: 'screenshot_v1',
    evidence: [`Added from a screenshot${b.source_document_name ? ` (${b.source_document_name})` : ''} on ${now.slice(0, 10)}`],
    source_count: 1,
    source_list: ['screenshot'],
    is_person: true,
    name_quality: fullName.trim().includes(' ') ? 'full' : 'partial',
    industry: null,
    intel_doc: intelDoc || null,
    updated_at: now,
  }
  if (vector) intelRow.embedding = vectorLiteral(vector)

  const { error: intelErr } = await supabase
    .from('contact_intelligence')
    .upsert(intelRow, { onConflict: 'contact_id' })

  // ── 3. Report honestly ───────────────────────────────────────────────────
  //
  // The contact exists either way — losing a hand-picked person because the
  // embedding provider is out of credits would be the worse failure. But it is
  // NOT reported as searchable when it is not, and a credit wall alerts.
  const searchable = Boolean(vector) && !intelErr
  let alertSent: boolean | undefined
  let alertError: string | undefined
  if (isBlocking(embedOutcome)) {
    const a = await raiseQuotaAlert({
      blocked: [embedOutcome],
      subject: `${fullName} — added to network but NOT searchable`,
      source: 'network-add-person',
    })
    alertSent = a.notified
    alertError = a.error
  }

  return res.status(created ? 201 : 200).json({
    ok: true,
    contact_id: contactId,
    created,
    merged: !created,
    searchable,
    // Named plainly rather than implied by absence.
    warning: searchable ? null
      : isBlocking(embedOutcome)
        ? `Saved, but NOT yet searchable: ${blockedMessage([embedOutcome])}. Re-run enrichment once credits are restored.`
        : intelErr
          ? `Saved, but the judgment layer failed to write: ${intelErr.message}`
          : 'Saved, but not yet searchable — no embedding could be produced (OPENAI_API_KEY unset?).',
    blocked: summary.blocked,
    alert: summary.blocked.length ? blockedMessage(summary.blocked) : null,
    alert_sent: alertSent,
    alert_error: alertError,
  })
}
