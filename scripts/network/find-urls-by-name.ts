#!/usr/bin/env -S npx tsx
// Find LinkedIn URLs for warm contacts who have none, by name, and accept a
// match only when it is provably the same person.
//
// Why this exists: 112 of Krish's reciprocated and core contacts (the people he
// actually emails) hold no LinkedIn URL, so they can never be enriched, and
// People Data Labs, the provider that finds URLs from an email, is out of
// credit and judged too expensive (2026-10-03).
// harvestapi/linkedin-profile-search-by-name does it from a name at about
// $0.012 a person.
//
// Why it is strict: name search returns several people per name, and a wrong
// URL is worse than none. In 2026-09, 1,381 of 4,105 Apollo-file URLs
// belonged to someone else. So a candidate is accepted only when its current
// or past employer matches the company we hold, or the organisation behind the
// person's work email domain, and exactly one candidate does. Anything else is
// reported and left alone.
//
// Usage:
//   npx tsx scripts/network/find-urls-by-name.ts --limit 10            # dry: who would be searched
//   npx tsx scripts/network/find-urls-by-name.ts --limit 10 --commit   # search and write matches
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APIFY_TOKEN.
// It only writes contacts.linkedin_url, and only where it is blank. Run
// `backfill-linkedin.ts --mode profiles --use-apify --no-pdl` afterwards to
// read the profiles, then `reembed-stale.ts`.

import { createClient } from '@supabase/supabase-js'

const SUPA_URL = process.env.SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const APIFY = process.env.APIFY_TOKEN
if (!SUPA_URL || !SUPA_KEY || !APIFY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / APIFY_TOKEN')
  process.exit(1)
}
const sb = createClient(SUPA_URL, SUPA_KEY)
const args = process.argv.slice(2)
const COMMIT = args.includes('--commit')
const limitArg = args.indexOf('--limit')
const LIMIT = limitArg >= 0 ? Number(args[limitArg + 1]) : 10
const ACTOR = 'harvestapi~linkedin-profile-search-by-name'

// Personal mail tells us nothing about where someone works.
const FREEMAIL = /@(gmail|googlemail|yahoo|hotmail|outlook|icloud|me|mac|live|aol|proton(mail)?|msn|bigpond|btinternet)\./i

interface Person { id: string; full_name: string; company: string | null; email_normalized: string | null }

/** Lowercase letters and digits only, so "Omnicom Media Group" and
 *  "omnicommediagroup.com" can be compared. */
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** The organisation a work address points at: "jane@au.omnicommediagroup.com"
 *  gives "omnicommediagroup". */
function domainOrg(email: string | null): string | null {
  if (!email || FREEMAIL.test(email)) return null
  const host = email.split('@')[1] || ''
  const parts = host.split('.').filter(Boolean)
  if (parts.length < 2) return null
  // Drop the top-level domain whatever it is (.com, .group, .info), then a
  // second-level suffix if there is one (.co.uk, .com.au).
  parts.pop()
  if (parts.length > 1 && ['co', 'com', 'org', 'net', 'gov', 'edu', 'ac'].includes(parts[parts.length - 1])) parts.pop()
  const org = parts[parts.length - 1]
  return org && org.length >= 4 && !GENERIC.has(org) ? org : null
}

/** Words that name no particular organisation. As an anchor they would match
 *  half of LinkedIn, which is exactly the false match this script exists to
 *  refuse. */
const GENERIC = new Set(['info', 'online', 'group', 'community', 'mail', 'email', 'media', 'agency',
  'global', 'consulting', 'digital', 'studio', 'company', 'business', 'office', 'team', 'home', 'world'])

/** True when an employer name and our anchor plainly refer to the same
 *  organisation. Substring either way on squashed text, with a length floor so
 *  "ab" cannot match everything. */
function sameOrg(employer: string | undefined, anchor: string): boolean {
  if (!employer) return false
  const a = squash(employer), b = squash(anchor)
  if (a.length < 3 || b.length < 3) return false
  // A short anchor ("vice", "cheq") must equal the employer outright: as a
  // substring it would match "Vice President" or anything containing it.
  if (b.length < 5 || a.length < 5) return a === b
  return a.includes(b) || b.includes(a)
}

function anchorsFor(p: Person): string[] {
  const company = p.company && squash(p.company).length >= 4 && !GENERIC.has(squash(p.company)) ? p.company.trim() : null
  return [company, domainOrg(p.email_normalized)].filter(Boolean) as string[]
}

async function searchByName(first: string, last: string): Promise<Record<string, any>[]> {
  const url = `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${APIFY}&timeout=120&maxTotalChargeUsd=0.08`
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ firstName: first, lastName: last, profileScraperMode: 'Full', strictSearch: true, maxPages: 1, maxItems: 5 }),
  })
  if (!r.ok) throw new Error(`apify ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const j = await r.json().catch(() => [])
  return Array.isArray(j) ? j : []
}

function employers(p: Record<string, any>): string[] {
  const out: string[] = []
  for (const e of (Array.isArray(p.experience) ? p.experience : [])) if (e?.companyName) out.push(String(e.companyName))
  for (const e of (Array.isArray(p.currentPosition) ? p.currentPosition : [])) if (e?.companyName) out.push(String(e.companyName))
  // Not the headline: it is free text, and "Vice President" is not Vice Media.
  return out
}

async function main() {
  const { data, error } = await sb
    .from('contact_intelligence')
    .select('contact_id, network_tier, contacts!inner(id, full_name, company, email_normalized, linkedin_url)')
    .in('network_tier', ['1_reciprocated', '2_core_network'])
    .eq('is_person', true)
    .is('contacts.linkedin_url', null)
    .limit(500)
  if (error) throw new Error(error.message)

  const people: Person[] = ((data || []) as any[])
    .map(r => r.contacts as Person)
    .filter(p => /\S+\s+\S+/.test(p.full_name || ''))
    // Searchable only with an anchor to verify against.
    .filter(p => anchorsFor(p).length > 0)
    .slice(0, LIMIT)

  console.log(`${people.length} warm contacts to search (name plus a company or work-email anchor)`)
  if (!COMMIT) {
    for (const p of people) console.log(`  ${p.full_name} — anchor: ${anchorsFor(p).join(' / ')}`)
    console.log(`\nDRY RUN. About $${(people.length * 0.012).toFixed(2)} to search. Re-run with --commit.`)
    return
  }

  let found = 0, ambiguous = 0, none = 0
  for (const p of people) {
    const parts = p.full_name.trim().split(/\s+/)
    const first = parts[0], last = parts[parts.length - 1]
    const anchors = anchorsFor(p)
    let results: Record<string, any>[] = []
    try { results = await searchByName(first, last) } catch (e) { console.log(`  ! ${p.full_name}: ${(e as Error).message}`); continue }
    const matches = results.filter(r => employers(r).some(emp => anchors.some(a => sameOrg(emp, a))))
    const urls = Array.from(new Set(matches.map(m => String(m.linkedinUrl || '')).filter(Boolean)))
    if (urls.length === 1) {
      found++
      console.log(`  ✓ ${p.full_name} → ${urls[0]}`)
      const { error: uerr } = await sb.from('contacts').update({ linkedin_url: urls[0] }).eq('id', p.id).is('linkedin_url', null)
      if (uerr) console.log(`    write failed: ${uerr.message}`)
    } else if (urls.length > 1) {
      ambiguous++
      console.log(`  ? ${p.full_name}: ${urls.length} candidates match ${anchors.join('/')}, left alone`)
    } else {
      none++
      console.log(`  · ${p.full_name}: ${results.length} results, none at ${anchors.join('/')}`)
    }
  }
  console.log(`\n${found} matched and written, ${ambiguous} ambiguous, ${none} not found, of ${people.length}.`)
}

main().catch(e => { console.error(e); process.exit(1) })
