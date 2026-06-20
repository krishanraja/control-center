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

const SUPA_URL = process.env.SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPA_URL || !SUPA_KEY) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
if (!process.env.APOLLO_API_KEY) { console.error('Missing APOLLO_API_KEY'); process.exit(1) }
if (!process.env.ANTHROPIC_API_KEY) { console.error('Missing ANTHROPIC_API_KEY'); process.exit(1) }
const sb = createClient(SUPA_URL, SUPA_KEY)

const GEO = ['United States', 'United Kingdom', 'Australia']

// Per-lane Apollo search filters — the operational form of rubric §2.
const LANE_FILTERS: Record<string, ApolloSearchFilters> = {
  mindmaker: {
    person_titles: ['Founder', 'CEO', 'Chief Executive Officer', 'COO', 'President', 'CMO', 'CTO', 'Chief of Staff', 'VP Operations', 'VP Marketing', 'Head of Product', 'Head of Strategy'],
    person_seniorities: ['owner', 'founder', 'c_suite', 'partner', 'vp', 'head'],
    organization_num_employees_ranges: ['11,50', '51,200', '201,500', '501,1000', '1001,5000'],
    person_locations: GEO,
    q_keywords: 'AI transformation',
  },
  fractional_network: {
    person_titles: ['Fractional CTO', 'Fractional CMO', 'Fractional COO', 'Fractional CPO', 'Fractional CAIO', 'Fractional Executive', 'Independent Advisor', 'Principal Consultant', 'Managing Partner', 'Advisor'],
    person_seniorities: ['owner', 'founder', 'partner', 'c_suite'],
    organization_num_employees_ranges: ['1,10', '11,50', '51,200'],
    person_locations: GEO,
    q_keywords: 'fractional advisory AI',
  },
  signal_noise: {
    person_titles: ['Editor', 'Editor-in-Chief', 'Journalist', 'Podcast Host', 'Head of Content', 'Producer', 'Communications Director', 'Media Director'],
    person_seniorities: ['owner', 'founder', 'c_suite', 'vp', 'head', 'senior'],
    person_locations: GEO,
    q_keywords: 'AI media journalism',
  },
  builder_economy: {
    person_titles: ['Founder', 'Co-Founder', 'Indie Hacker', 'Software Engineer', 'AI Engineer', 'Developer', 'Maker', 'Engineer'],
    person_seniorities: ['owner', 'founder', 'c_suite', 'senior'],
    organization_num_employees_ranges: ['1,10', '11,50'],
    q_keywords: 'AI build in public agents indie',
  },
  mm_ctrl_buyer: {
    person_titles: ['CEO', 'COO', 'Founder', 'VP Strategy', 'Head of Operations', 'Director'],
    person_seniorities: ['owner', 'founder', 'c_suite', 'vp', 'head', 'director'],
    organization_num_employees_ranges: ['11,50', '51,200', '201,1000'],
    person_locations: GEO,
    q_keywords: 'decision strategy leadership AI',
  },
  ecosystem_partner: {
    person_titles: ['Partner', 'Program Director', 'Community Lead', 'Platform Lead', 'Managing Director', 'Head of Community'],
    person_seniorities: ['owner', 'founder', 'partner', 'c_suite', 'director'],
    q_keywords: 'accelerator community venture ecosystem agency',
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

async function loadDedupKeys(): Promise<{ emails: Set<string>; lis: Set<string> }> {
  const emails = new Set<string>(); const lis = new Set<string>()
  for (const table of ['leads', 'contacts'] as const) {
    let from = 0
    for (;;) {
      const { data, error } = await sb.from(table).select('email_norm, linkedin_url_norm').range(from, from + 999)
      if (error) { console.warn(`dedup load ${table}: ${error.message}`); break }
      for (const r of data || []) { if (r.email_norm) emails.add(r.email_norm); if (r.linkedin_url_norm) lis.add(r.linkedin_url_norm) }
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
        pool.push({ lane: laneKey, lite: p, detail: { id: p.id, first_name: p.first_name, last_name: p.last_name, name: p.name, organization_name: p.organization_name, linkedin_url: p.linkedin_url } })
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
      const result = await scoreProspect(e); scored++
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
    email_norm: emailNorm(e.email) || null,
    linkedin_url: e.linkedin_url || null,
    linkedin_url_norm: liNorm(e.linkedin_url) || null,
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
    status: 'new',
    raw_extraction: { apollo: e.raw, scoring: { lane, best_lane: r.best_lane, best_score: r.best_score, dimensions: r.dimension_breakdown }, at: new Date().toISOString() },
  }
}

run().catch(e => { console.error(e); process.exit(1) })
