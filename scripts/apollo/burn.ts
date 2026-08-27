#!/usr/bin/env -S npx tsx
// Apollo credit burn-down — search → dedup → enrich → score → insert leads.
//
// The n8n lead pipeline is down until ~Jul 1; this is the interim, metered way
// to spend the standing Apollo credit balance into the Control Center WITHOUT
// n8n. It shares the exact rubric + Apollo client the API uses (api/_apollo.ts,
// api/_icpScore.ts) so behaviour matches a future server route.
//
// Requires env: APOLLO_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// ANTHROPIC_API_KEY. (This is why it runs where those secrets live — the VPS or
// any secrets-injected env — not an empty CI container.)
//
// Usage:
//   npx tsx scripts/apollo/burn.ts --test 50 --dry        # plan only, no spend
//   npx tsx scripts/apollo/burn.ts --test 50 --commit     # the 50-lead gate
//   npx tsx scripts/apollo/burn.ts --commit --max-credits 1500
//   npx tsx scripts/apollo/burn.ts --enrich-existing --commit --max-credits 200
//   npx tsx scripts/apollo/burn.ts --lanes mindmaker,fractional_network --commit
//
// Default is --dry. Always run --dry first and read the estimate.

import { createClient } from '@supabase/supabase-js'
import { apolloSearch, apolloBulkEnrich, apolloCreditsRemaining, type ApolloSearchFilters, type ApolloEnriched } from '../../api/_apollo'
import { scoreProspect, LANES } from '../../api/_icpScore'
import { webResearch } from '../../api/_enrich'

const SUPA_URL = process.env.SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPA_URL || !SUPA_KEY) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
if (!process.env.APOLLO_API_KEY) { console.error('Missing APOLLO_API_KEY'); process.exit(1) }
if (!process.env.ANTHROPIC_API_KEY) { console.error('Missing ANTHROPIC_API_KEY'); process.exit(1) }
const sb = createClient(SUPA_URL, SUPA_KEY)

const GEO = ['United States', 'United Kingdom', 'Australia']

// NAICS prefixes for software / IT-services / AI vendors. Excluded from the
// BUYER lanes (mindmaker, mm_ctrl) so we stop recruiting the supply side.
const VENDOR_NAICS = ['5415', '5112', '5182']
// Government (92) + nonprofit/civic (813) — excluded from ecosystem_partner.
const GOVT_NONPROFIT_NAICS = ['92', '813']

// Per-lane Apollo search filters — the operational form of rubric §2.
//
// Calibration v2 (2026-06-20), from the live 45-record test pull:
//   - Multi-word q_keywords AND-match and starved 4/6 lanes → use one term or none.
//   - "AI" as a keyword recruits AI *vendors* (the supply side); for buyer lanes
//     we DROP the AI keyword and EXCLUDE vendor NAICS instead. Intent is judged
//     by the rubric, not by the employer being an AI company.
//   - mm_ctrl_buyer = leaders at NON-AI operating companies (CTRL's real ICP).
//   - builder_economy = "impossible before AI" builders → founded 2022+ proxy.
const LANE_FILTERS: Record<string, ApolloSearchFilters> = {
  // AI-adoption buyers: senior operators + dedicated AI/transformation roles
  // INSIDE non-vendor operating companies (the only genuine buyer the v1 pull
  // found was exactly this: an in-house Head of AI Transformation).
  mindmaker: {
    person_titles: ['CEO', 'COO', 'President', 'Chief Digital Officer', 'Chief Transformation Officer', 'Chief Information Officer', 'Head of AI', 'Head of Digital Transformation', 'Head of Innovation', 'VP Operations'],
    person_seniorities: ['owner', 'founder', 'c_suite', 'vp', 'head'],
    organization_num_employees_ranges: ['51,200', '201,500', '501,1000', '1001,5000'],
    person_locations: GEO,
    not_organization_naics_codes: VENDOR_NAICS,
  },
  // Fractional/advisory who actually DELIVER AI work (the v1 noise was generic
  // fractional CMOs at welders/wellness shops). One AI keyword + fractional titles.
  fractional_network: {
    person_titles: ['Fractional CTO', 'Fractional CMO', 'Fractional COO', 'Fractional CAIO', 'Fractional Executive', 'AI Advisor', 'AI Consultant', 'Principal Consultant'],
    person_seniorities: ['owner', 'founder', 'partner', 'c_suite'],
    organization_num_employees_ranges: ['1,10', '11,50', '51,200'],
    person_locations: GEO,
    q_keywords: 'AI',
  },
  signal_noise: {
    person_titles: ['Editor-in-Chief', 'Journalist', 'Podcast Host', 'Head of Content', 'Communications Director', 'Media Director'],
    person_seniorities: ['owner', 'founder', 'c_suite', 'vp', 'head', 'senior'],
    person_locations: GEO,
    q_keywords: 'AI',
  },
  // "Impossible before AI" builders: founders at tiny, AI-era (founded 2022+)
  // companies. Apollo has no audience/traction signal, so the rubric's novelty/
  // leverage dims + a web pass (Exa/Perplexity) do the real judging.
  builder_economy: {
    person_titles: ['Founder', 'Co-Founder', 'Creator', 'Indie Hacker'],
    person_seniorities: ['owner', 'founder'],
    organization_num_employees_ranges: ['1,10', '11,50'],
    person_locations: GEO,
    organization_founded_year_range: { min: 2022, max: 2026 },
    q_keywords: 'AI',
  },
  // CTRL decision-clarity buyers: leaders at NON-AI operating companies in
  // decision-heavy traditional industries; AI/software vendors excluded.
  mm_ctrl_buyer: {
    person_titles: ['CEO', 'COO', 'President', 'General Manager', 'VP Operations', 'Head of Operations'],
    person_seniorities: ['owner', 'c_suite', 'vp', 'head'],
    organization_num_employees_ranges: ['51,200', '201,1000', '1001,5000'],
    person_locations: GEO,
    q_organization_keyword_tags: ['manufacturing', 'healthcare', 'logistics', 'professional services', 'construction', 'retail'],
    not_organization_naics_codes: VENDOR_NAICS,
  },
  ecosystem_partner: {
    person_titles: ['Partner', 'Program Director', 'Managing Director', 'Head of Community', 'Platform Lead'],
    person_seniorities: ['owner', 'founder', 'partner', 'c_suite', 'director'],
    person_locations: GEO,
    q_organization_keyword_tags: ['startup accelerator', 'venture capital', 'startup'],
    not_organization_naics_codes: GOVT_NONPROFIT_NAICS,
  },
}

interface Args {
  dry: boolean
  test: number | null
  limit: number
  maxCredits: number
  lanes: string[]
  enrichExisting: boolean
}

function parseArgs(): Args {
  const a = process.argv.slice(2)
  const args: Args = { dry: true, test: null, limit: 1000, maxCredits: 1500, lanes: LANES.map(l => l.key), enrichExisting: false }
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--dry') args.dry = true
    else if (a[i] === '--commit') args.dry = false
    else if (a[i] === '--test' && a[i + 1]) args.test = parseInt(a[++i], 10) || 50
    else if (a[i] === '--limit' && a[i + 1]) args.limit = parseInt(a[++i], 10) || 1000
    else if (a[i] === '--max-credits' && a[i + 1]) args.maxCredits = parseInt(a[++i], 10) || 1500
    else if (a[i] === '--lanes' && a[i + 1]) args.lanes = a[++i].split(',').map(s => s.trim()).filter(Boolean)
    else if (a[i] === '--enrich-existing') args.enrichExisting = true
  }
  return args
}

const emailNorm = (e?: string | null) => (e ? e.trim().toLowerCase() : '')
const liNorm = (u?: string | null) => (u ? u.trim().toLowerCase().replace(/\/+$/, '') : '')

// The live `leads`/`contacts` tables have no *_norm columns (that migration is
// not applied), so we dedup on normalized email/linkedin computed here. And
// because Apollo search masks emails, dedup is necessarily POST-reveal.
async function loadDedupKeys(): Promise<{ emails: Set<string>; lis: Set<string> }> {
  const emails = new Set<string>(); const lis = new Set<string>()
  for (const table of ['leads', 'contacts'] as const) {
    let from = 0
    for (;;) {
      const { data, error } = await sb.from(table).select('email, linkedin_url').range(from, from + 999)
      if (error) { console.warn(`dedup load ${table}: ${error.message}`); break }
      for (const r of data || []) { if (r.email) emails.add(emailNorm(r.email)); if (r.linkedin_url) lis.add(liNorm(r.linkedin_url)) }
      if (!data || data.length < 1000) break
      from += 1000
    }
  }
  return { emails, lis }
}

async function run() {
  const args = parseArgs()
  const perLaneTarget = args.test ? Math.ceil(args.test / args.lanes.length) : Math.ceil(args.limit / args.lanes.length)
  console.log(`\n— Apollo burn-down ${args.dry ? '(DRY RUN — no spend, no writes)' : '(COMMIT)'} —`)
  console.log(`Lanes: ${args.lanes.join(', ')}`)
  console.log(`Target: ${args.test ? `${args.test} test leads` : `up to ${args.limit}`} · ~${perLaneTarget}/lane · max-credits ${args.maxCredits}`)

  const startCredits = await apolloCreditsRemaining()
  console.log(`Apollo credits remaining: ${startCredits ?? 'unknown (metering via local reveal counter)'}`)

  const { emails, lis } = await loadDedupKeys()
  console.log(`Dedup index: ${emails.size} emails, ${lis.size} linkedin urls already in leads+contacts`)

  // 1. Search each lane (cheap, no credits) and collect a de-duplicated candidate pool.
  const pool: Array<{ lane: string; detail: any; lite: any }> = []
  const seen = new Set<string>()
  for (const laneKey of args.lanes) {
    const filters = LANE_FILTERS[laneKey]
    if (!filters) { console.warn(`no filters for lane ${laneKey}, skipping`); continue }
    let collected = 0
    for (let page = 1; page <= 4 && collected < perLaneTarget; page++) {
      const { people, total_entries } = await apolloSearch({ ...filters, page, per_page: Math.min(25, perLaneTarget) })
      for (const p of people) {
        const eKey = emailNorm(p.raw?.email); const lKey = liNorm(p.linkedin_url)
        if (eKey && emails.has(eKey)) continue
        if (lKey && lis.has(lKey)) continue
        const dedupId = lKey || `${(p.first_name || '').toLowerCase()}|${(p.last_name || '').toLowerCase()}|${(p.organization_name || '').toLowerCase()}`
        if (seen.has(dedupId)) continue
        seen.add(dedupId)
        // Match on the Apollo person_id from search — name+org alone returns 0
        // matches because search masks last names (learned from the v1 pull).
        pool.push({ lane: laneKey, lite: p, detail: { id: p.id, first_name: p.first_name, organization_name: p.organization_name } })
        collected++
        if (collected >= perLaneTarget) break
      }
      if (!people.length || people.length < 1) break
      void total_entries
    }
    console.log(`  ${laneKey}: ${collected} new candidates`)
  }
  console.log(`Candidate pool (deduped): ${pool.length}`)

  if (args.dry) {
    console.log(`\nDRY RUN — would reveal/enrich up to ${Math.min(pool.length, args.maxCredits)} prospects (~1 credit each), score against the rubric, and insert those with best lane ≥ ${'70'}.`)
    console.log('Re-run with --commit to spend.')
    return
  }

  // 2. Enrich (CREDITS) in capped batches, 3. score, 4. insert (best lane ≥ threshold).
  let revealed = 0, scored = 0, inserted = 0, skippedLow = 0
  const batch = pool.slice(0, args.maxCredits)
  for (let i = 0; i < batch.length; i += 10) {
    if (revealed >= args.maxCredits) { console.log('Hit max-credits cap, stopping.'); break }
    const chunk = batch.slice(i, i + 10)
    const { enriched, revealedCount } = await apolloBulkEnrich(chunk.map(c => c.detail), { revealPersonalEmails: true })
    revealed += revealedCount
    for (let k = 0; k < enriched.length; k++) {
      const e = enriched[k]
      const lane = chunk[k]?.lane || 'mindmaker'
      const eKey = emailNorm(e.email); const lKey = liNorm(e.linkedin_url)
      if ((eKey && emails.has(eKey)) || (lKey && lis.has(lKey))) continue   // re-check post-reveal
      // builder_economy can't be judged from Apollo alone (no audience/novelty
      // signal), so augment that lane with a web pass before scoring.
      let webContext: string | undefined
      if (lane === 'builder_economy' && (e.name || e.organization_name)) {
        try {
          const w = await webResearch(`${e.name || ''}${e.organization_name ? `, founder of ${e.organization_name}` : ''}: what have they built with AI that wasn't possible before, audience/following, and notable traction?`)
          webContext = w.text || undefined
        } catch { /* best-effort */ }
      }
      const result = await scoreProspect(e, { webContext }); scored++
      if (!result.insert) { skippedLow++; continue }
      const row = buildLeadRow(e, lane, result)
      const { error } = await sb.from('leads').insert(row)
      if (error) { console.warn(`insert failed (${e.name}): ${error.message}`); continue }
      if (eKey) emails.add(eKey); if (lKey) lis.add(lKey)
      inserted++
    }
    console.log(`  …revealed ${revealed} · scored ${scored} · inserted ${inserted} · skipped(low) ${skippedLow}`)
  }

  const endCredits = await apolloCreditsRemaining()
  console.log(`\nDone. revealed=${revealed} scored=${scored} inserted=${inserted} skipped_low=${skippedLow}`)
  console.log(`Apollo credits: ${startCredits ?? '?'} → ${endCredits ?? '?'}`)
}

function buildLeadRow(e: ApolloEnriched, lane: string, r: Awaited<ReturnType<typeof scoreProspect>>) {
  return {
    full_name: e.name || `${e.first_name || ''} ${e.last_name || ''}`.trim() || null,
    email: e.email || null,
    linkedin_url: e.linkedin_url || null,
    company: e.organization_name || null,
    title: e.title || null,
    source_type: 'apollo',
    source_ref: `apollo:${lane}`,
    source_url: e.linkedin_url || null,
    icp_score: r.icp_score,
    icp_scores: r.icp_scores,
    tier: r.tier,
    tags: r.tags,
    primary_venture: r.primary_venture,
    why_relevant: r.why_relevant || null,
    next_step: r.next_step || null,
    status: 'new',
    raw_extraction: { apollo: e.raw, scoring: { lane, best_lane: r.best_lane, best_score: r.best_score, dimensions: r.dimension_breakdown }, at: new Date().toISOString() },
  }
}

run().catch(e => { console.error(e); process.exit(1) })
