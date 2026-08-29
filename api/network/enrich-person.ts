import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guard } from '../_auth.js'
import { supabase } from '../_supabase.js'
import { enrichPerson, buildIntelDoc, embedIntelDoc } from '../_personEnrich.js'
import { vectorLiteral } from '../_embeddings.js'
import { blockedMessage, isBlocking, type ProviderOutcome } from '../_quota.js'
import { raiseQuotaAlert } from '../_alert.js'

// POST /api/network/enrich-person   { contact_id, use_apify?, skip_web? }
//
// Phase 3: deepen a person already in the network. Runs PDL + Apollo + the
// Perplexity/Exa/Brave cascade (+ the paid Apify LinkedIn profile scrape when
// asked), merges the structured facts, asks Claude for the judgment layer, and
// rewrites contact_intelligence.
//
// THE RULE THIS ROUTE EXISTS TO ENFORCE, in Krish's words: "if there are not
// enough api credits anywhere, I need an alert rather than just half
// enriching."
//
// So there are exactly two terminal states and no third:
//
//   COMPLETE  every provider that was asked either answered or was
//             deliberately not configured. enrichment_status = 'enriched'.
//   BLOCKED   at least one configured provider refused for credit, auth or
//             rate-limit reasons. NOTHING partial is written to the judgment
//             layer, enrichment_status = 'blocked_quota', and an alert goes to
//             Telegram + audit_log + api_usage_state.
//
// The old behaviour — write whatever came back, mark it 'enriched', move on —
// is the one outcome that is not available here. A record that says it was
// enriched when three of four providers were dry is worse than no record: it
// will never be retried, because nothing knows it needs retrying.

export const config = { maxDuration: 60 }

interface Body {
  contact_id?: string
  /** Run the paid Apify LinkedIn profile scrape. Costs one actor run. */
  use_apify?: boolean
  /** Skip Perplexity/Exa/Brave — faster and cheaper when the profile is enough. */
  skip_web?: boolean
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Evidence tier from how many independent sources actually asserted this
 *  person. Distinct from consent_tier, which is a permission statement and is
 *  never touched here. */
function tierFor(sourceCount: number): { tier: string; weight: number } {
  if (sourceCount >= 3) return { tier: '2_core_network', weight: 3 }
  if (sourceCount === 2) return { tier: '3_known_network', weight: 2 }
  return { tier: '4_owned_network', weight: 1 }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guard(req, res)) return

  const b = (req.body || {}) as Body
  const id = (b.contact_id || '').trim()
  if (!UUID.test(id)) return res.status(400).json({ ok: false, error: 'valid contact_id is required' })

  const { data: contact, error } = await supabase
    .from('contacts')
    .select('id, full_name, first_name, email, company, title, location, linkedin_url, consent_tier')
    .eq('id', id)
    .maybeSingle()
  if (error) return res.status(500).json({ ok: false, error: error.message })
  if (!contact) return res.status(404).json({ ok: false, error: 'contact not found' })

  const c = contact as Record<string, any>
  const name = c.full_name || c.first_name || ''
  if (!name) return res.status(400).json({ ok: false, error: 'contact has no name to research' })

  // Pull the headline the screenshot captured, so enrichment starts from what
  // is already known rather than from the name alone.
  const { data: priorIntel } = await supabase
    .from('contact_intelligence')
    .select('who, source_list, source_count')
    .eq('contact_id', id)
    .maybeSingle()
  const prior = (priorIntel || {}) as Record<string, any>

  await supabase.from('contacts').update({ enrichment_status: 'enriching' }).eq('id', id)

  let result
  try {
    result = await enrichPerson({
      name,
      company: c.company,
      title: c.title,
      linkedinUrl: c.linkedin_url,
      email: c.email,
      location: c.location,
      headline: prior.who || null,
    }, {
      useApify: b.use_apify !== false,
      skipWeb: b.skip_web === true,
      // Leave headroom inside the 60s ceiling for the embedding and two writes.
      timeoutMs: 25000,
    })
  } catch (e: unknown) {
    await supabase.from('contacts').update({ enrichment_status: 'failed' }).eq('id', id)
    return res.status(502).json({ ok: false, error: `enrich failed: ${String((e as Error)?.message || e).slice(0, 200)}` })
  }

  // ── The credit wall ──────────────────────────────────────────────────────
  if (result.summary.blocked.length) {
    await supabase.from('contacts').update({ enrichment_status: 'blocked_quota' }).eq('id', id)
    const alert = await raiseQuotaAlert({
      blocked: result.summary.blocked,
      subject: `${name}${c.company ? ` (${c.company})` : ''}`,
      source: 'network-enrich-person',
    })
    return res.status(402).json({
      ok: false,
      error: 'api_credits',
      contact_id: id,
      status: 'blocked_quota',
      blocked: result.summary.blocked,
      // Everything that DID answer, so it is obvious what is missing rather
      // than only that something is.
      used: result.summary.used,
      skipped: result.summary.skipped,
      alert: blockedMessage(result.summary.blocked),
      alert_sent: alert.notified,
      alert_error: alert.error,
      detail: 'Nothing was written. The contact is unchanged and still marked un-enriched, so re-running after a top-up will pick it up.',
    })
  }

  // ── Nothing blocked, but nothing found either ────────────────────────────
  //
  // Not a credit problem, so not an alert — but equally not an enrichment, and
  // it must not be recorded as one. Writing a Claude-authored judgment with no
  // evidence behind it is how a network fills up with confident fiction.
  if (!result.hasEvidence) {
    await supabase.from('contacts').update({ enrichment_status: 'failed' }).eq('id', id)
    return res.status(200).json({
      ok: true,
      contact_id: id,
      status: 'no_evidence',
      used: [],
      skipped: result.summary.skipped,
      degraded: result.summary.degraded,
      detail: result.summary.skipped.length
        ? `No provider returned anything. Not configured: ${result.summary.skipped.join(', ')}.`
        : 'Every provider ran and found nothing on this person.',
    })
  }

  // ── Write ────────────────────────────────────────────────────────────────
  const { facts, judgment } = result
  const now = new Date().toISOString()
  const intelDoc = buildIntelDoc(name, facts, judgment)
  const { vector, outcome: embedOutcome } = await embedIntelDoc(intelDoc)

  // An embedding that fails on credits is the same class of problem as a
  // provider that does: the person ends up unfindable. It gets the same
  // treatment rather than a shrug.
  if (isBlocking(embedOutcome)) {
    await supabase.from('contacts').update({ enrichment_status: 'blocked_quota' }).eq('id', id)
    const alert = await raiseQuotaAlert({
      blocked: [embedOutcome],
      subject: `${name} — enriched but not indexable`,
      source: 'network-enrich-person',
    })
    return res.status(402).json({
      ok: false, error: 'api_credits', contact_id: id, status: 'blocked_quota',
      blocked: [embedOutcome], used: result.summary.used,
      alert: blockedMessage([embedOutcome]),
      alert_sent: alert.notified, alert_error: alert.error,
      detail: 'Research completed but the embedding could not be produced, so the person would not be findable. Nothing was written.',
    })
  }

  const priorSources: string[] = Array.isArray(prior.source_list) ? prior.source_list : []
  const sourceList = Array.from(new Set([...priorSources, ...facts.sourceList]))
  const { tier, weight } = tierFor(sourceList.length)

  const intelRow: Record<string, unknown> = {
    contact_id: id,
    who: judgment?.who || prior.who || null,
    why_them: judgment?.why_them || null,
    hook: judgment?.hook || null,
    risk: judgment?.risk || null,
    roles: judgment?.roles ?? [],
    reachable_via: judgment?.reachable_via ?? [],
    best_channel: judgment?.best_channel || null,
    seniority: judgment?.seniority || facts.seniority || null,
    industry: judgment?.industry || facts.industry || null,
    country: facts.country || null,
    network_tier: tier,
    tier_weight: weight,
    confidence: judgment?.confidence || 'low',
    intel_method: 'direct_enrich_v1',
    evidence: [
      `Enriched ${now.slice(0, 10)} from: ${facts.sourceList.join(', ')}`,
      ...(result.summary.degraded.length ? [`Degraded: ${result.summary.degraded.join('; ')}`] : []),
    ],
    source_count: sourceList.length,
    source_list: sourceList,
    is_person: true,
    name_quality: name.trim().includes(' ') ? 'full' : 'partial',
    intel_doc: intelDoc || null,
    updated_at: now,
  }
  if (vector) intelRow.embedding = vectorLiteral(vector)

  const { error: intelErr } = await supabase
    .from('contact_intelligence')
    .upsert(intelRow, { onConflict: 'contact_id' })
  if (intelErr) {
    await supabase.from('contacts').update({ enrichment_status: 'failed' }).eq('id', id)
    return res.status(500).json({ ok: false, error: `intelligence write failed: ${intelErr.message}` })
  }

  // Backfill the identity columns the screenshot could not supply. Only blanks
  // are filled: enrichment adds, it does not overwrite curated values.
  const patch: Record<string, unknown> = {
    enrichment_status: 'enriched',
    deep_enriched_at: now,
    updated_at: now,
    dossier: {
      pass5_meeting_weapon: { who_they_are: judgment?.who || null, why_them: judgment?.why_them || null, hook: judgment?.hook || null },
      _direct: { sources: result.sources, facts, providers: result.summary, at: now },
    },
  }
  if (!c.title && facts.title) patch.title = facts.title
  if (!c.company && facts.company) patch.company = facts.company
  if (!c.location && facts.location) patch.location = facts.location
  if (!c.linkedin_url && facts.linkedinUrl) patch.linkedin_url = facts.linkedinUrl
  await supabase.from('contacts').update(patch).eq('id', id)

  return res.status(200).json({
    ok: true,
    contact_id: id,
    status: 'enriched',
    searchable: Boolean(vector),
    who: judgment?.who || null,
    why_them: judgment?.why_them || null,
    hook: judgment?.hook || null,
    confidence: judgment?.confidence || 'low',
    network_tier: tier,
    used: result.summary.used,
    skipped: result.summary.skipped,
    // Reported even on the happy path: "ran and found nothing" is information
    // the operator should have before trusting a thin brief.
    degraded: result.summary.degraded,
    sources: result.sources,
  })
}

/** Exported for the invariant check in scripts/check-enrichment-honesty.mts:
 *  the set of terminal statuses this route may write. 'enriched' must never be
 *  reachable from a path where a provider was blocked. */
export const TERMINAL_STATUSES = ['enriched', 'blocked_quota', 'failed'] as const
export type TerminalStatus = (typeof TERMINAL_STATUSES)[number]
export type { ProviderOutcome }
