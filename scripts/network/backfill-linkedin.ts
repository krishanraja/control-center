#!/usr/bin/env -S npx tsx
// Close the LinkedIn gap across the network, in bounded batches.
//
// 5,827 of 10,768 contacts hold no LinkedIn URL. Until they do, the Network tab
// falls back to a people-search link for every one of them — which works, and is
// honestly labelled, and is still not the profile. This runner converts as many
// of those fallbacks into real profiles as the providers will give up.
//
// ── Why this is a runner and not a route ────────────────────────────────────
// api/network/enrich-person.ts already does the work for ONE person and already
// enforces the only rule that matters here: if a configured provider refuses for
// credit, auth or rate-limit reasons, NOTHING partial is written, the record is
// marked blocked_quota, and an alert fires. Do not weaken that, and do not
// reimplement it. This script's entire job is to choose who goes next, to stop
// when the providers say stop, and to be resumable.
//
// ── Order, and why it is not arbitrary ──────────────────────────────────────
// The people Krish will actually click come first. Spending the first thousand
// provider calls on the cold tail and running dry before reaching the people he
// talks to is the specific failure this ordering exists to prevent:
//
//   1. customer / warm          people he has a relationship with
//   2. permissioned             includes the 1,037 Circle community members
//   3. cold_engaged
//   4. cold_scraped             the tail, last, and possibly never
//
// Within a tier, people with an email first: a confirmed address makes the
// provider lookup far more likely to resolve, so the same spend buys more URLs.
//
// ── Stopping ────────────────────────────────────────────────────────────────
// The first blocked_quota ends the run. Grinding through four thousand more
// people against a dry provider produces four thousand blocked_quota rows, a
// pile of alerts, and no URLs. Read contacts.enrichment_status to see where it
// got to; contacts_enrichment_attention_idx exists for exactly this query.
//
// ── Two modes, because the gap has two halves ───────────────────────────────
// --mode urls (default) takes people with NO profile URL and tries to find one.
// --mode profiles takes people who HAVE one and reads it, which is what fills
// followers, headline and summary — the fields the ranker now scores on and the
// completeness score now measures. They are different jobs with different unit
// costs: finding a URL from a name needs a person API at roughly 200x the price
// of scraping a URL we already hold.
//
// Usage:
//   npx tsx scripts/network/backfill-linkedin.ts --limit 50              # dry
//   npx tsx scripts/network/backfill-linkedin.ts --limit 50 --commit
//   npx tsx scripts/network/backfill-linkedin.ts --limit 200 --commit --use-apify
//   npx tsx scripts/network/backfill-linkedin.ts --mode profiles --limit 50 --commit --use-apify
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CC_BASE_URL, ACCESS_CODE.

import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'

const SUPA_URL = process.env.SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BASE = (process.env.CC_BASE_URL || '').replace(/\/+$/, '')
const ACCESS_CODE = process.env.ACCESS_CODE || ''
if (!SUPA_URL || !SUPA_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const sb = createClient(SUPA_URL, SUPA_KEY)

const args = process.argv.slice(2)
const COMMIT = args.includes('--commit')
// Off by default. Every Apify run is a paid actor invocation, and a 200-person
// batch with it on is a bill nobody approved in advance.
const USE_APIFY = args.includes('--use-apify')
const modeArg = args.indexOf('--mode')
const MODE = modeArg >= 0 && args[modeArg + 1] === 'profiles' ? 'profiles' : 'urls'
const limitArg = args.indexOf('--limit')
const LIMIT = limitArg >= 0 ? Number(args[limitArg + 1]) : 50

const TIER_ORDER = ['customer', 'warm', 'permissioned', 'cold_engaged', 'cold_scraped']

interface Candidate {
  id: string
  full_name: string | null
  company: string | null
  consent_tier: string
  email: string | null
}

/** The cookie the edge gate issues, rebuilt from the same secret. No new
 *  credential: if Krish can open the dashboard, this script can call the route. */
function accessCookie(): string {
  if (!ACCESS_CODE) return ''
  return `cc_access=${createHash('sha256').update(ACCESS_CODE).digest('hex')}`
}

async function candidates(): Promise<Candidate[]> {
  const out: Candidate[] = []
  for (const tier of TIER_ORDER) {
    if (out.length >= LIMIT) break
    if (MODE === 'profiles') {
      // Driven from contact_intelligence, not from contacts, because
      // `enriched_at` there is the only field that records a profile having
      // been READ. contacts.deep_enriched_at is set by one enrichment path and
      // not by the Coresignal one: selecting on it would have re-bought 156
      // profiles we already hold.
      const { data, error } = await sb
        .from('contact_intelligence')
        .select('contact_id, contacts!inner(id, full_name, company, consent_tier, email)')
        .is('enriched_at', null)
        .eq('contacts.consent_tier', tier)
        .not('contacts.linkedin_url', 'is', null)
        .not('contacts.full_name', 'is', null)
        .not('contacts.enrichment_status', 'in', '("blocked_quota","failed")')
        .order('contact_id', { ascending: true })
        .limit(LIMIT - out.length)
      if (error) throw new Error(`candidate read failed: ${error.message}`)
      // The embedded row comes back typed as an array by the generated types
      // even though !inner makes it exactly one. Normalise rather than assert.
      for (const r of (data || []) as unknown as Array<{ contacts: Candidate | Candidate[] }>) {
        const c = Array.isArray(r.contacts) ? r.contacts[0] : r.contacts
        if (c) out.push(c)
      }
      continue
    }

    const { data, error } = await sb
      .from('contacts')
      .select('id, full_name, company, consent_tier, email')
      .eq('consent_tier', tier)
      .is('linkedin_url', null)
      .not('full_name', 'is', null)
      // Never retry someone the providers already refused on. They need the
      // quota problem fixed, not another call.
      .not('enrichment_status', 'in', '("blocked_quota","failed")')
      // A confirmed address makes the lookup far likelier to resolve.
      .order('email', { ascending: true, nullsFirst: false })
      .limit(LIMIT - out.length)
    if (error) throw new Error(`candidate read failed: ${error.message}`)
    out.push(...((data || []) as Candidate[]))
  }
  return out
}

async function main() {
  const people = await candidates()

  const { count: gap } = MODE === 'profiles'
    ? await sb.from('contact_intelligence')
        .select('contact_id, contacts!inner(id)', { count: 'exact', head: true })
        .is('enriched_at', null)
        .not('contacts.linkedin_url', 'is', null)
    : await sb.from('contacts')
        .select('id', { count: 'exact', head: true })
        .is('linkedin_url', null)

  console.log(MODE === 'profiles'
    ? `\nunread profiles: ${gap ?? '?'} contacts hold a URL nobody has read`
    : `\nnetwork LinkedIn gap: ${gap ?? '?'} contacts with no profile URL`)
  console.log(`this batch: ${people.length} (limit ${LIMIT}, apify ${USE_APIFY ? 'ON — paid' : 'off'})`)
  const byTier = new Map<string, number>()
  for (const p of people) byTier.set(p.consent_tier, (byTier.get(p.consent_tier) || 0) + 1)
  for (const t of TIER_ORDER) if (byTier.get(t)) console.log(`  ${t.padEnd(14)} ${byTier.get(t)}`)

  if (!COMMIT) {
    console.log('\nDRY RUN. Nothing called, nothing spent. Re-run with --commit.')
    return
  }
  if (!BASE) { console.error('CC_BASE_URL is required to call the enrichment route'); process.exit(1) }

  let resolved = 0, ran = 0
  for (const p of people) {
    const r = await fetch(`${BASE}/api/network/enrich-person`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: accessCookie() },
      body: JSON.stringify({ contact_id: p.id, use_apify: USE_APIFY, skip_web: true }),
    })
    const j: any = await r.json().catch(() => null)
    ran++

    // The route's own terminal states. `blocked` is not a failure of this
    // person; it is the providers saying stop, and continuing past it just
    // converts the rest of the batch into blocked_quota rows.
    if (j?.blocked || j?.error === 'blocked_quota' || r.status === 429) {
      console.log(`\nSTOPPED after ${ran}: providers are blocked — ${j?.message || j?.error || r.status}`)
      console.log('Fix the credit/auth problem, then re-run. Nothing partial was written.')
      break
    }
    if (!r.ok) { console.log(`  ${p.full_name}: HTTP ${r.status}`); continue }

    // Did this actually produce the thing the run is for? Asked of the
    // database rather than of the route's response, because the route reports
    // that it ran and this run is only worth anything if a fact landed.
    if (MODE === 'profiles') {
      const { data } = await sb.from('contact_intelligence')
        .select('completeness, followers, headline').eq('contact_id', p.id).single()
      const d = data as { completeness?: number; followers?: number; headline?: string } | null
      if (d && (d.followers != null || d.headline)) {
        resolved++
        console.log(`  ✓ ${p.full_name} — completeness ${d.completeness ?? '?'}`)
      } else console.log(`  · ${p.full_name} — read, nothing usable came back`)
    } else {
      const { data } = await sb.from('contacts').select('linkedin_url').eq('id', p.id).single()
      if ((data as { linkedin_url?: string } | null)?.linkedin_url) { resolved++; console.log(`  ✓ ${p.full_name}`) }
      else console.log(`  · ${p.full_name} — enriched, no profile found`)
    }
  }

  console.log(MODE === 'profiles'
    ? `\n${resolved}/${ran} profiles came back with something to store.`
    : `\n${resolved}/${ran} resolved to a real LinkedIn URL.`)
  if (MODE === 'urls') console.log(`${ran - resolved} keep the search fallback, which still works.`)
  if (MODE === 'profiles') console.log('Run scripts/network/reembed-stale.ts afterwards, or none of this reaches search.')
  console.log('Report the cost of this batch before running the next one.')
}

main().catch(e => { console.error(e); process.exit(1) })
