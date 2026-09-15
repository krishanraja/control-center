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
//   npx tsx scripts/network/backfill-linkedin.ts --mode profiles --limit 50 --commit --use-apify --posts
//   npx tsx scripts/network/backfill-linkedin.ts --mode profiles --limit 400 --commit --use-apify --concurrency 8
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
// A second paid actor run per person, so it is opt-in. Worth it for people
// Krish would actually message and wasted on the cold tail: what a scraped lead
// posted last month is not a reason to do anything.
const WITH_POSTS = args.includes('--posts')
// How many people are in flight at once.
//
// One at a time is roughly 15 seconds per person — profile scrape, posts
// scrape, PDL, and a Claude judgment — which is 23 hours for the network and
// therefore not a plan. The work is one independent HTTP call per person
// against a platform that scales them, so the only real limits are the
// providers' rate limits and the blast radius of getting it wrong. Eight is
// chosen to stay well inside both: a rate-limited provider returns 429, which
// this runner treats as a stop rather than a retry, so being conservative here
// costs an hour and being greedy could cost the whole run.
const concArg = args.indexOf('--concurrency')
const CONCURRENCY = Math.min(Math.max(concArg >= 0 ? Number(args[concArg + 1]) || 1 : 1, 1), 12)
const modeArg = args.indexOf('--mode')
const MODE_ARG = modeArg >= 0 ? args[modeArg + 1] : ''
const MODE: 'urls' | 'profiles' | 'posts' =
  MODE_ARG === 'profiles' ? 'profiles' : MODE_ARG === 'posts' ? 'posts' : 'urls'
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
    if (MODE === 'posts') {
      // People whose posts have never been classified under the CURRENT model.
      // posts_sample is the marker because it is what makes a rescore free: the
      // first intent model stored a score and threw the text away, so those 307
      // flags could not be re-read when the model changed the next day.
      //
      // Scoped to the tiers where an intent signal is worth acting on. What a
      // scraped cold lead posted last month is not a reason to do anything.
      if (tier !== 'customer' && tier !== 'warm' && tier !== 'permissioned') continue
      const { data, error } = await sb
        .from('contact_intelligence')
        .select('contact_id, contacts!inner(id, full_name, company, consent_tier, email)')
        .is('posts_sample', null)
        .eq('contacts.consent_tier', tier)
        .not('contacts.linkedin_url', 'is', null)
        .not('contacts.full_name', 'is', null)
        .not('contacts.enrichment_status', 'in', '("blocked_quota","failed")')
        .order('contact_id', { ascending: true })
        .limit(LIMIT - out.length)
      if (error) throw new Error(`candidate read failed: ${error.message}`)
      for (const r of (data || []) as unknown as Array<{ contacts: Candidate | Candidate[] }>) {
        const c = Array.isArray(r.contacts) ? r.contacts[0] : r.contacts
        if (c) out.push(c)
      }
      continue
    }

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

  const { count: gap } = MODE === 'posts'
    ? await sb.from('contact_intelligence')
        .select('contact_id, contacts!inner(id)', { count: 'exact', head: true })
        .is('posts_sample', null)
        .in('contacts.consent_tier', ['customer', 'warm', 'permissioned'])
        .not('contacts.linkedin_url', 'is', null)
    : MODE === 'profiles'
    ? await sb.from('contact_intelligence')
        .select('contact_id, contacts!inner(id)', { count: 'exact', head: true })
        .is('enriched_at', null)
        .not('contacts.linkedin_url', 'is', null)
    : await sb.from('contacts')
        .select('id', { count: 'exact', head: true })
        .is('linkedin_url', null)

  console.log(
    MODE === 'posts' ? `\nunclassified posts: ${gap ?? '?'} reachable contacts whose posts have never been read under the current model`
    : MODE === 'profiles' ? `\nunread profiles: ${gap ?? '?'} contacts hold a URL nobody has read`
    : `\nnetwork LinkedIn gap: ${gap ?? '?'} contacts with no profile URL`)
  console.log(`this batch: ${people.length} (limit ${LIMIT}, ${CONCURRENCY} at a time, apify ${USE_APIFY ? 'ON — paid' : 'off'}${WITH_POSTS ? ', posts ON — second paid run each' : ''})`)
  const byTier = new Map<string, number>()
  for (const p of people) byTier.set(p.consent_tier, (byTier.get(p.consent_tier) || 0) + 1)
  for (const t of TIER_ORDER) if (byTier.get(t)) console.log(`  ${t.padEnd(14)} ${byTier.get(t)}`)

  if (!COMMIT) {
    console.log('\nDRY RUN. Nothing called, nothing spent. Re-run with --commit.')
    return
  }
  if (!BASE) { console.error('CC_BASE_URL is required to call the enrichment route'); process.exit(1) }

  let resolved = 0, ran = 0
  // Providers that refused while the run still produced something. Counted and
  // reported once at the end rather than shouted per person.
  const degradedBy = new Map<string, number>()
  let intent = 0
  const stances = new Map<string, number>()
  // A dry account refuses everyone; one bad profile URL refuses one person.
  // This is the number that tells them apart.
  const BLOCK_STREAK = 8
  // How many people may fail before a run that has never once succeeded gives
  // up. Larger than the streak because this is the last resort, not the normal
  // path, and stopping a healthy run is the expensive mistake.
  const COLD_START_GIVE_UP = 25
  let consecutiveBlocked = 0
  // Providers that have actually produced something during THIS run. A refusal
  // from a provider not in this set says nothing about the account's health.
  const servedThisRun = new Set<string>()
  // A shared cursor rather than pre-sliced chunks: people take wildly different
  // amounts of time (a profile with fifty posts against one with none), and
  // fixed chunks would leave workers idle waiting for the slowest.
  let next = 0
  let halted = false

  const worker = async () => {
    while (!halted) {
      const i = next++
      if (i >= people.length) return
      const p = people[i]
      await one(p)
    }
  }

  const one = async (p: Candidate) => {
    const r = await fetch(`${BASE}/api/network/enrich-person`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: accessCookie() },
      body: JSON.stringify({
        contact_id: p.id,
        use_apify: USE_APIFY,
        skip_web: true,
        with_posts: WITH_POSTS || MODE === 'posts',
      }),
    })
    const j: any = await r.json().catch(() => null)
    ran++

    // The route's own terminal states. Read from the OUTCOME, not from the
    // presence of a `blocked` list: since the credit wall was narrowed, a
    // successful enrichment also reports which providers refused, and testing
    // truthiness on that list halted a 20-person batch after one person who had
    // in fact been enriched. A run stops when the route says it wrote nothing.
    // The route reports that nothing could be written. That is not by itself a
    // reason to stop the run, and treating it as one cost a 400-person batch
    // after 47: PeopleDataLabs had run dry, and any person whose LinkedIn
    // scrape also came back empty then produced a 402 — a per-person failure
    // wearing the clothes of an account-wide one. Meanwhile Apify was serving
    // profiles at completeness 90.
    //
    // So a blocked write halts the run only when it happens repeatedly with no
    // success in between, which is what a genuinely dry account looks like. A
    // single unlucky profile no longer stops the other five thousand.
    const blockedWrite = r.status === 402 || r.status === 429 ||
      (j?.ok === false && (j?.error === 'api_credits' || j?.error === 'blocked_quota'))
    if (blockedWrite) {
      const blocked = (Array.isArray(j?.blocked) ? j.blocked : []) as { api?: string }[]
      const names = blocked.map(x => x?.api).filter(Boolean).join(', ')
      console.log(`  ! ${p.full_name} — nothing written (${names || j?.error || r.status})`)

      // Whether this counts toward stopping depends on WHICH provider refused.
      //
      // The streak rule was written for a dry account and fired twice on
      // something else. PeopleDataLabs has been exhausted all day, so every
      // person whose LinkedIn scrape happens to return nothing — dead profile,
      // private account, changed slug, which is common in the cold tail —
      // produces a 402 that looks identical to the account falling over. Eight
      // such people in a row stopped a 1,300-person run while Apify was
      // serving normally, verified by hand one minute later.
      //
      // So a refusal only counts if it comes from a provider that HAS worked
      // during this run. A provider that has never served has nothing to say
      // about whether the run can continue.
      const meaningful = blocked.some(b => b?.api && servedThisRun.has(b.api))
      if (meaningful) consecutiveBlocked++

      // The exception that keeps the original protection: if nothing at all has
      // succeeded yet, no provider can have "worked this run", and a genuinely
      // dry account would otherwise grind through every remaining person.
      const nothingHasWorked = servedThisRun.size === 0 && ran >= COLD_START_GIVE_UP

      if ((meaningful && consecutiveBlocked >= BLOCK_STREAK) || nothingHasWorked) {
        console.log(`\nSTOPPED after ${ran}: ${nothingHasWorked
          ? 'nothing has succeeded at all'
          : `${BLOCK_STREAK} in a row wrote nothing`} — ${names || j?.error || r.status}`)
        console.log('Every provider appears to be refusing. Fix the credit/auth problem, then re-run. Nothing partial was written.')
        // Stops every worker, not just this one. In-flight calls finish; no new
        // person is started against a provider that has said no.
        halted = true
      }
      return
    }
    consecutiveBlocked = 0
    for (const api of (Array.isArray(j?.used) ? j.used : []) as string[]) servedThisRun.add(api)
    if (!r.ok) { console.log(`  ${p.full_name}: HTTP ${r.status}`); return }
    if (Array.isArray(j?.blocked) && j.blocked.length) {
      for (const b of j.blocked as Array<{ api?: string; status?: string }>) {
        if (b?.api) degradedBy.set(b.api, (degradedBy.get(b.api) || 0) + 1)
      }
    }

    // Did this actually produce the thing the run is for? Asked of the
    // database rather than of the route's response, because the route reports
    // that it ran and this run is only worth anything if a fact landed.
    if (MODE === 'profiles' || MODE === 'posts') {
      const { data } = await sb.from('contact_intelligence')
        .select('completeness, followers, headline, intent_score, intent_stance, intent_evidence')
        .eq('contact_id', p.id).single()
      const d = data as {
        completeness?: number; followers?: number; headline?: string
        intent_score?: number | null; intent_stance?: string | null
        intent_evidence?: string | null
      } | null
      if (d && (d.followers != null || d.headline)) {
        resolved++
        if ((d.intent_score ?? 0) > 0) intent++
        // The stance and the quote, because a score alone cannot be checked.
        const flag = (d.intent_score ?? 0) > 0
          ? ` — ${d.intent_stance} (${d.intent_score}): "${(d.intent_evidence || '').slice(0, 90)}"`
          : ''
        if ((d.intent_score ?? 0) > 0 && d.intent_stance) {
          stances.set(d.intent_stance, (stances.get(d.intent_stance) || 0) + 1)
        }
        console.log(`  ✓ ${p.full_name} — completeness ${d.completeness ?? '?'}${flag}`)
      } else console.log(`  · ${p.full_name} — read, nothing usable came back`)
    } else {
      const { data } = await sb.from('contacts').select('linkedin_url').eq('id', p.id).single()
      if ((data as { linkedin_url?: string } | null)?.linkedin_url) { resolved++; console.log(`  ✓ ${p.full_name}`) }
      else console.log(`  · ${p.full_name} — enriched, no profile found`)
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, people.length) }, worker))

  console.log(MODE === 'profiles'
    ? `\n${resolved}/${ran} profiles came back with something to store.`
    : `\n${resolved}/${ran} resolved to a real LinkedIn URL.`)
  if (MODE === 'urls') console.log(`${ran - resolved} keep the search fallback, which still works.`)
  for (const [api, n] of degradedBy) console.log(`${api} refused on ${n} of them; the rest of the providers covered it.`)
  if (WITH_POSTS || MODE === 'posts') {
    console.log(`${intent} of them are active on AI right now:`)
    for (const [st, n] of [...stances.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${st.padEnd(11)} ${n}`)
    }
  }
  if (MODE === 'profiles' || MODE === 'posts') console.log('Run scripts/network/reembed-stale.ts afterwards, or none of this reaches search.')
  console.log('Report the cost of this batch before running the next one.')
}

main().catch(e => { console.error(e); process.exit(1) })
