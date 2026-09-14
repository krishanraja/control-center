#!/usr/bin/env -S npx tsx
// Circle community rosters → the person spine.
//
// Reads the master member list for the three Circle communities Krish belongs
// to (1,037 people: AI Circle 386, Press Publish LA 389, Founders Common 262)
// and lands them against contacts + contact_intelligence.
//
//   1. NORMALISE  clean the 64 malformed LinkedIn URLs, split verified from
//                 pattern-guessed emails
//   2. DEDUPE     within the sheet (3 repeated slugs, 6 repeated names)
//   3. RESOLVE    each row to an existing contacts.id, or mark it new
//   4. UPSERT     identity + provenance into contacts
//   5. LOAD       contact_intelligence, INCLUDING intel_doc + embedding
//   6. EMBED      as a separate --embed pass, so a failed OpenAI call never
//                 rolls back a good identity load
//
// Shape and safety rails are lifted from import-intelligence.ts, which solved
// all of this once already. Read that file before changing this one.
//
// ── The mistake this script is built to not make ────────────────────────────
// api/network/add-person.ts states it plainly: "a contacts row on its own is
// invisible to the Network tab." network_search ranks over contact_intelligence
// and needs intel_doc + embedding to find anyone. An import that writes only
// `contacts` produces 1,037 people who are in the database and cannot be found,
// and nothing about that failure is visible — the rows are there, the counts
// are right, and the search returns nothing. So the intelligence row is written
// for every person, and step 6 is not optional.
//
// ── Consent ─────────────────────────────────────────────────────────────────
// These people are co-members of rooms Krish is in. They are not people he has
// met. Krish's ruling, 14 Sep 2026, is `permissioned` — community membership
// counts as opt-in context for outreach. That is recorded here rather than
// argued: the tier is a business decision and this script's job is to make it
// legible, not to override it.
//
// Requires env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// OPENAI_API_KEY additionally for --embed.
//
// Usage:
//   npx tsx scripts/network/import-circle.ts --file fixtures/circle-communities-2026-09.csv
//   npx tsx scripts/network/import-circle.ts --file <path> --commit
//   npx tsx scripts/network/import-circle.ts --embed --commit
//
// Default is --dry. Always run --dry first and read the reconciliation table.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { parseDelimitedObjects } from '../../api/_csv'
import { emailNorm, linkedinNorm } from '../../api/_text'
import { embedBatch, vectorLiteral } from '../../api/_embeddings'

const SUPA_URL = process.env.SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPA_URL || !SUPA_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const sb = createClient(SUPA_URL, SUPA_KEY)

const args = process.argv.slice(2)
const COMMIT = args.includes('--commit')
const EMBED_ONLY = args.includes('--embed')
const fileArg = args.indexOf('--file')
const FILE = fileArg >= 0 ? args[fileArg + 1] : null

// ── The three rooms ─────────────────────────────────────────────────────────
// Sheet group name → the slug that lands in origin_campaign. Anything not in
// this map is a new community the sheet grew without telling us, and is a hard
// stop rather than a silent passthrough: an unrecognised group would otherwise
// import as a campaign nobody can filter on.
const COMMUNITY: Record<string, { slug: string; label: string }> = {
  'ai circle':        { slug: 'ai_circle',        label: 'AI Circle' },
  'press publish la': { slug: 'press_publish_la', label: 'Press Publish LA' },
  'founders common':  { slug: 'founders_common',  label: 'Founders Common' },
}

const ORIGIN_CHANNEL = 'community'
const CONSENT = 'permissioned'
const INTEL_METHOD = 'circle_roster_v1'
const SOURCE = 'circle_roster'

// Consent ranks, same table as import-intelligence.ts. A re-tier can only ever
// move someone UP: somebody hand-marked `customer`, or promoted to `warm` off a
// recorded podcast, must not be demoted to `permissioned` because they also
// happen to be in a Circle community.
const CONSENT_RANK: Record<string, number> = {
  cold_scraped: 0, cold_engaged: 1, permissioned: 2, warm: 3, customer: 4,
}

interface Row {
  community: { slug: string; label: string }
  fullName: string
  firstName: string | null
  lastName: string | null
  headline: string | null
  location: string | null
  linkedinUrl: string | null
  /** Lower-cased /in/ slug. The resolution key — more reliable than the URL,
   *  which arrives in six different spellings in this file alone. */
  slug: string | null
  website: string | null
  twitter: string | null
  bio: string | null
  email: string | null
  emailSource: string | null
  /** A pattern guess from a company domain. NEVER written to contacts.email or
   *  email_normalized: that column is what every bulk-send path reads, and an
   *  address nobody confirmed does not belong in it. Lives in raw. */
  guessedEmail: string | null
  phone: string | null
  domain: string | null
}

/** Pull the /in/ slug out of any of the six LinkedIn spellings in this file:
 *  https://www.linkedin.com/in/x, https://linkedin.com/in/x,
 *  http://linkedin.com/in/x, https://Linkedin.com/in/x,
 *  https://www.linkedin.com/m/profile/in/x, and bare linkedin.com/in/x. */
function linkedinSlug(raw: string | null | undefined): string | null {
  const m = /linkedin\.com\/(?:m\/profile\/)?in\/([^/?#\s]+)/i.exec(raw || '')
  if (!m) return null
  const slug = decodeURIComponent(m[1]).toLowerCase().replace(/\/+$/, '')
  // `linkedin.com/me` and `/company/...` reach this regex's neighbours but not
  // this branch; a one-character slug is junk either way.
  return slug.length > 1 ? slug : null
}

function clean(s: string | undefined): string | null {
  const t = (s || '').trim()
  return t ? t : null
}

/** "@handle" or a full x.com/twitter.com URL → the bare handle. */
function twitterHandle(raw: string | null): string | null {
  if (!raw) return null
  const m = /(?:twitter|x)\.com\/([A-Za-z0-9_]{1,15})/i.exec(raw)
  const h = m ? m[1] : raw.trim().replace(/^@/, '')
  return /^[A-Za-z0-9_]{1,15}$/.test(h) ? h : null
}

/** "Ada Lovelace" → first/last. Single-token names keep a first name and no
 *  last, which is true rather than tidy. */
function splitName(full: string): { first: string | null; last: string | null } {
  const parts = full.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { first: null, last: null }
  if (parts.length === 1) return { first: parts[0], last: null }
  return { first: parts[0], last: parts.slice(1).join(' ') }
}

function parseRows(path: string): Row[] {
  const raw = parseDelimitedObjects(readFileSync(path, 'utf8'))
  const out: Row[] = []
  for (const r of raw) {
    const group = (r['group'] || '').trim().toLowerCase()
    const community = COMMUNITY[group]
    if (!community) {
      if (!group) continue
      console.error(`Unrecognised community "${r['group']}". Add it to COMMUNITY or fix the sheet.`)
      process.exit(1)
    }
    const fullName = (r['name'] || '').trim()
    if (!fullName) continue

    // Enriched LinkedIn is a later, better read than the original column, so it
    // wins where both exist.
    const li = clean(r['linkedin (enriched)']) || clean(r['linkedin'])
    const slug = linkedinSlug(li)
    const { first, last } = splitName(fullName)
    // The sheet marks its own guesses. Trust that marking rather than trying to
    // re-derive which addresses are real.
    const verified = emailNorm(clean(r['email (verified)']))
    const guessed = emailNorm(clean(r['likely personal email (unverified guess)']))

    out.push({
      community,
      fullName,
      firstName: first,
      lastName: last,
      headline: clean(r['headline']),
      location: clean(r['location']),
      // Store the canonical form, never the raw spelling.
      linkedinUrl: slug ? `https://www.linkedin.com/in/${slug}` : null,
      slug,
      website: clean(r['website']),
      twitter: twitterHandle(clean(r['twitter/x'])),
      bio: clean(r['bio']),
      email: verified,
      emailSource: clean(r['email source']),
      // A guess that duplicates the verified address is not a guess.
      guessedEmail: guessed && guessed !== verified ? guessed : null,
      phone: clean(r['phone']),
      domain: clean(r['company / personal domain']),
    })
  }
  return out
}

/** Collapse the same person appearing twice in the sheet. Keyed on slug where
 *  there is one (3 collisions) and on lower-cased name where there is not (6).
 *  The richer row wins, field by field, so a second appearance can only ever
 *  ADD information. */
function dedupe(rows: Row[]): { rows: Row[]; collapsed: number } {
  const byKey = new Map<string, Row>()
  let collapsed = 0
  for (const r of rows) {
    const key = r.slug ? `li:${r.slug}` : `nm:${r.fullName.toLowerCase()}|${r.community.slug}`
    const prev = byKey.get(key)
    if (!prev) { byKey.set(key, r); continue }
    collapsed++
    byKey.set(key, {
      ...prev,
      headline: prev.headline || r.headline,
      location: prev.location || r.location,
      linkedinUrl: prev.linkedinUrl || r.linkedinUrl,
      slug: prev.slug || r.slug,
      website: prev.website || r.website,
      twitter: prev.twitter || r.twitter,
      bio: (prev.bio && r.bio) ? (prev.bio.length >= r.bio.length ? prev.bio : r.bio) : (prev.bio || r.bio),
      email: prev.email || r.email,
      emailSource: prev.emailSource || r.emailSource,
      guessedEmail: prev.guessedEmail || r.guessedEmail,
      phone: prev.phone || r.phone,
      domain: prev.domain || r.domain,
    })
  }
  return { rows: [...byKey.values()], collapsed }
}

interface Existing {
  id: string
  email_normalized: string | null
  linkedin_url_norm: string | null
  linkedin_url: string | null
  full_name: string | null
  consent_tier: string
  sources: unknown[]
  linkedin_url_present: boolean
}

/** The whole person spine, paged. 10,768 rows is small enough to hold and far
 *  cheaper than 1,037 round-trips. */
async function loadContacts(): Promise<Existing[]> {
  const out: Existing[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from('contacts')
      .select('id, email_normalized, linkedin_url_norm, linkedin_url, full_name, consent_tier, sources')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`contacts read failed: ${error.message}`)
    if (!data?.length) break
    for (const c of data as any[]) {
      out.push({ ...c, sources: Array.isArray(c.sources) ? c.sources : [], linkedin_url_present: !!c.linkedin_url })
    }
    if (data.length < PAGE) break
  }
  return out
}

type Resolution =
  | { kind: 'matched'; by: 'email' | 'linkedin' | 'name'; existing: Existing; row: Row }
  | { kind: 'new'; row: Row }

/**
 * Resolve in descending order of confidence.
 *
 * email    a unique index backs it; two people never share one
 * linkedin the slug IS the identity on LinkedIn
 * name     ambiguous by construction, and used anyway because the alternative
 *          is importing a duplicate of someone already in the network. Only
 *          applied when the existing row has NO LinkedIn URL of its own —
 *          otherwise "John Smith" in the sheet would merge into whichever John
 *          Smith the network already holds, which is a worse error than a dupe.
 */
function resolve(rows: Row[], existing: Existing[]): Resolution[] {
  const byEmail = new Map<string, Existing>()
  const bySlug = new Map<string, Existing>()
  const byName = new Map<string, Existing[]>()
  for (const c of existing) {
    if (c.email_normalized) byEmail.set(c.email_normalized, c)
    const s = linkedinSlug(c.linkedin_url_norm || c.linkedin_url)
    if (s && !bySlug.has(s)) bySlug.set(s, c)
    const n = (c.full_name || '').trim().toLowerCase()
    if (n) { const a = byName.get(n) || []; a.push(c); byName.set(n, a) }
  }

  return rows.map<Resolution>(row => {
    if (row.email) {
      const hit = byEmail.get(row.email)
      if (hit) return { kind: 'matched', by: 'email', existing: hit, row }
    }
    if (row.slug) {
      const hit = bySlug.get(row.slug)
      if (hit) return { kind: 'matched', by: 'linkedin', existing: hit, row }
    }
    const candidates = byName.get(row.fullName.toLowerCase()) || []
    // Exactly one candidate, and it holds no LinkedIn identity of its own.
    if (candidates.length === 1 && !candidates[0].linkedin_url_present) {
      return { kind: 'matched', by: 'name', existing: candidates[0], row }
    }
    return { kind: 'new', row }
  })
}

/** What the sheet knows about this person, as one searchable string. This is
 *  what network_search actually matches against — see buildIntelDoc, whose
 *  shape this mirrors without needing a PersonFacts. */
function intelDoc(r: Row): string {
  return [r.fullName, r.headline, r.location, r.bio, r.community.label]
    .filter(Boolean).join(' · ').replace(/\s+/g, ' ').trim()
}

function contactPayload(r: Row, existing?: Existing) {
  const sources = [...(existing?.sources || [])] as any[]
  if (!sources.some((s: any) => s?.type === SOURCE && s?.community === r.community.slug)) {
    sources.push({ type: SOURCE, community: r.community.slug, imported_at: '2026-09-14' })
  }
  // Only ever upward. See CONSENT_RANK.
  const currentRank = CONSENT_RANK[existing?.consent_tier || 'cold_scraped'] ?? 0
  const consent = currentRank >= CONSENT_RANK[CONSENT] ? (existing!.consent_tier) : CONSENT

  return {
    full_name: r.fullName,
    first_name: r.firstName,
    last_name: r.lastName,
    // An existing verified address is never overwritten, and a guess never
    // reaches this column at all. email_normalized is GENERATED ALWAYS AS
    // lower(btrim(email)) — writing it is rejected by the database, which is
    // the right way round: the unique index can never disagree with the column
    // it indexes.
    ...(r.email ? { email: r.email } : {}),
    ...(r.linkedinUrl ? { linkedin_url: r.linkedinUrl, linkedin_url_norm: linkedinNorm(r.linkedinUrl) } : {}),
    ...(r.twitter ? { twitter_handle: r.twitter } : {}),
    ...(r.location ? { location: r.location } : {}),
    ...(r.headline ? { title: r.headline } : {}),
    origin_channel: ORIGIN_CHANNEL,
    origin_campaign: r.community.slug,
    first_met_context: `${r.community.label} member, imported Sep 2026`,
    consent_tier: consent,
    sources,
    raw: {
      circle_community: r.community.slug,
      ...(r.guessedEmail ? { guessed_email: r.guessedEmail, guessed_email_basis: r.domain || 'company domain pattern' } : {}),
      ...(r.website ? { website: r.website } : {}),
      ...(r.phone ? { phone: r.phone } : {}),
      ...(r.emailSource ? { email_source: r.emailSource } : {}),
      ...(r.bio ? { bio: r.bio } : {}),
    },
    updated_at: new Date().toISOString(),
  }
}

function intelPayload(contactId: string, r: Row) {
  return {
    contact_id: contactId,
    who: r.headline || r.bio?.slice(0, 280) || null,
    // Deliberately null. why_them / hook / risk are JUDGMENTS, and nobody has
    // made one about these people yet. A roster line is not a reason to talk to
    // someone, and writing a plausible-sounding one here would put invented
    // rationale under a real name. enrich-person fills these properly.
    why_them: null,
    hook: null,
    risk: null,
    roles: [],
    surface_when: [],
    network_tier: '4_owned_network',
    tier_weight: 1,
    confidence: 'low',
    intel_method: INTEL_METHOD,
    evidence: [`${r.community.label} member roster`],
    source_count: 1,
    source_list: [SOURCE],
    is_person: true,
    name_quality: r.lastName ? 'full' : 'partial',
    reachable_via: [
      ...(r.email ? ['email'] : []),
      ...(r.linkedinUrl ? ['linkedin_dm'] : []),
      ...(r.twitter ? ['twitter'] : []),
    ],
    best_channel: r.email ? 'email' : r.linkedinUrl ? 'linkedin_dm' : null,
    ...(r.location ? { country: null } : {}),
    intel_doc: intelDoc(r),
    updated_at: new Date().toISOString(),
  }
}

async function chunked<T>(items: T[], size: number, fn: (batch: T[]) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) await fn(items.slice(i, i + size))
}

// ── The embed pass ──────────────────────────────────────────────────────────
// Separate from the identity load on purpose. Embedding 1,037 rows is a paid
// external call that can fail halfway; identity is a local write that cannot.
// Coupling them means one OpenAI outage costs the whole import.
async function embedPass(): Promise<void> {
  const { data, error } = await sb
    .from('contact_intelligence')
    .select('contact_id, intel_doc')
    .eq('intel_method', INTEL_METHOD)
    .is('embedding', null)
  if (error) throw new Error(`embed read failed: ${error.message}`)
  const rows = (data || []).filter(r => (r as any).intel_doc)
  console.log(`\nembed: ${rows.length} rows without an embedding`)
  if (!rows.length || !COMMIT) return

  let done = 0
  await chunked(rows, 128, async batch => {
    const vecs = await embedBatch(batch.map((r: any) => ({ title: r.intel_doc })))
    for (let i = 0; i < batch.length; i++) {
      const v = vecs[i]
      if (!v) continue
      const { error: e } = await sb
        .from('contact_intelligence')
        .update({ embedding: vectorLiteral(v) })
        .eq('contact_id', (batch[i] as any).contact_id)
      if (e) throw new Error(`embed write failed: ${e.message}`)
      done++
    }
    console.log(`  embedded ${done}/${rows.length}`)
  })
  // Anything still null could not be embedded and is therefore unfindable. Say
  // so rather than reporting a clean finish.
  if (done < rows.length) {
    console.log(`  WARNING ${rows.length - done} rows have no embedding and will NOT appear in network search.`)
  }
}

async function main() {
  if (EMBED_ONLY) { await embedPass(); return }
  if (!FILE) { console.error('--file <path> is required'); process.exit(1) }

  const parsed = parseRows(FILE)
  const { rows, collapsed } = dedupe(parsed)
  console.log(`\nsheet: ${parsed.length} rows → ${rows.length} people (${collapsed} collapsed as duplicates)`)

  const byCommunity = new Map<string, number>()
  for (const r of rows) byCommunity.set(r.community.label, (byCommunity.get(r.community.label) || 0) + 1)
  for (const [k, v] of byCommunity) console.log(`  ${k.padEnd(20)} ${v}`)

  console.log('\nloading the person spine...')
  const existing = await loadContacts()
  console.log(`  ${existing.length} contacts`)

  // contacts.email_normalized carries a UNIQUE index. Two sheet rows holding
  // the same verified address — a shared team inbox, usually — would take the
  // insert loop down partway through, leaving a half-written import. Collapse
  // the collision here, keeping the address on the first row only, so the
  // second person is still imported and simply arrives without an email.
  const seenEmail = new Set<string>()
  let emailCollisions = 0
  for (const r of rows) {
    if (!r.email) continue
    if (seenEmail.has(r.email)) { r.email = null; emailCollisions++ }
    else seenEmail.add(r.email)
  }

  const resolutions = resolve(rows, existing)
  const counts = { new: 0, email: 0, linkedin: 0, name: 0 }
  for (const r of resolutions) {
    if (r.kind === 'new') counts.new++
    else counts[r.by]++
  }

  console.log('\n── reconciliation ──────────────────────────────')
  console.log(`  new people                 ${counts.new}`)
  console.log(`  matched on email           ${counts.email}`)
  console.log(`  matched on LinkedIn slug   ${counts.linkedin}`)
  console.log(`  matched on name            ${counts.name}`)
  console.log(`  ─────────────────────────  ${resolutions.length}`)

  const withLi = rows.filter(r => r.linkedinUrl).length
  const withEmail = rows.filter(r => r.email).length
  const withGuess = rows.filter(r => !r.email && r.guessedEmail).length
  console.log('\n── reach ───────────────────────────────────────')
  console.log(`  LinkedIn profile URL       ${withLi} / ${rows.length}`)
  console.log(`  verified email             ${withEmail}`)
  console.log(`  guessed email only         ${withGuess}  (raw only — never a send target)`)
  if (emailCollisions) console.log(`  shared addresses dropped   ${emailCollisions}  (same verified email on two people)`)
  console.log(`  LinkedIn search fallback   ${rows.length - withLi}`)

  if (!COMMIT) {
    console.log('\nDRY RUN. Nothing written. Re-run with --commit when the table above is right.')
    return
  }

  console.log('\ncommitting...')
  let written = 0
  const intelRows: ReturnType<typeof intelPayload>[] = []

  for (const r of resolutions) {
    if (r.kind === 'matched') {
      const { error } = await sb.from('contacts').update(contactPayload(r.row, r.existing)).eq('id', r.existing.id)
      if (error) throw new Error(`update ${r.existing.id} failed: ${error.message}`)
      intelRows.push(intelPayload(r.existing.id, r.row))
    } else {
      const { data, error } = await sb.from('contacts').insert(contactPayload(r.row)).select('id').single()
      if (error) throw new Error(`insert ${r.row.fullName} failed: ${error.message}`)
      intelRows.push(intelPayload((data as any).id, r.row))
    }
    if (++written % 100 === 0) console.log(`  contacts ${written}/${resolutions.length}`)
  }
  console.log(`  contacts ${written}/${resolutions.length}`)

  // The step that decides whether any of this is findable. An existing
  // intelligence row from a real enrichment pass is NOT clobbered — that would
  // trade a read profile for a roster line.
  const existingIntel = new Set<string>()
  await chunked(intelRows, 500, async batch => {
    const { data } = await sb
      .from('contact_intelligence')
      .select('contact_id, intel_method')
      .in('contact_id', batch.map(b => b.contact_id))
    for (const row of (data || []) as any[]) {
      if (row.intel_method && row.intel_method !== INTEL_METHOD) existingIntel.add(row.contact_id)
    }
  })
  const toWrite = intelRows.filter(r => !existingIntel.has(r.contact_id))
  console.log(`  intelligence ${toWrite.length} to write, ${existingIntel.size} left alone (already enriched)`)

  await chunked(toWrite, 200, async batch => {
    const { error } = await sb.from('contact_intelligence').upsert(batch, { onConflict: 'contact_id' })
    if (error) throw new Error(`intelligence upsert failed: ${error.message}`)
  })

  console.log('\nidentity loaded. Now run:  npx tsx scripts/network/import-circle.ts --embed --commit')
  console.log('Until that finishes, these people are in the database and invisible to search.')
}

main().catch(e => { console.error(e); process.exit(1) })
