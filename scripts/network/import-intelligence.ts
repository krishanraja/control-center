#!/usr/bin/env -S npx tsx
// Network intelligence import — resolve, re-tier, and load the judgment layer.
//
// Reads the enriched network export (network_intelligence.csv, 10,670 people ×
// 49 columns) and lands it against the live person spine:
//
//   1. RESOLVE   each row to an existing contacts.id, or mark it new
//   2. UPSERT    identity for the new people into contacts
//   3. RE-TIER   contacts.consent_tier where the file has better evidence
//   4. LOAD      the judgment layer into contact_intelligence
//   5. EMBED     intel_doc (a separate pass, --embed, so a failed OpenAI call
//                never rolls back a good identity load)
//
// Requires env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// OPENAI_API_KEY additionally for --embed.
//
// Usage:
//   npx tsx scripts/network/import-intelligence.ts --file <path>            # dry
//   npx tsx scripts/network/import-intelligence.ts --file <path> --commit
//   npx tsx scripts/network/import-intelligence.ts --embed --commit
//
// Default is --dry. Always run --dry first and read the reconciliation table.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { parseDelimitedObjects } from '../../api/_csv'
import { emailNorm, linkedinNorm } from '../../api/_text'
import { embedBatch, vectorLiteral } from '../../api/_embeddings'

const SUPA_URL = process.env.SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const OFFLINE = process.argv.includes('--contacts-snapshot')
if (!OFFLINE && (!SUPA_URL || !SUPA_KEY)) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const sb = createClient(SUPA_URL || 'http://offline.invalid', SUPA_KEY || 'offline')

const args = process.argv.slice(2)
const COMMIT = args.includes('--commit')
const EMBED_ONLY = args.includes('--embed')
const fileArg = args.indexOf('--file')
const FILE = fileArg >= 0 ? args[fileArg + 1] : null
const snapArg = args.indexOf('--contacts-snapshot')
// Dry-running the plan should not require production WRITE credentials. Point
// this at a JSON array of {id, email_normalized, linkedin_url_norm, full_name,
// consent_tier} and the resolution pass runs entirely offline, so the
// reconciliation table can be reviewed by someone who holds no service-role key.
const SNAPSHOT = snapArg >= 0 ? args[snapArg + 1] : null
const limitArg = args.indexOf('--limit')
const LIMIT = limitArg >= 0 ? Number(args[limitArg + 1]) : Infinity

// ── Tier translation ────────────────────────────────────────────────────────
// The file's network_tier is an EVIDENCE statement (how many independent
// sources assert this person). contacts.consent_tier is a PERMISSION statement
// (what we are allowed to do). They are not the same axis, so this is a
// deliberate, lossy mapping and the evidence tier is preserved verbatim in
// contact_intelligence.network_tier rather than being thrown away.
//
// SCHEMA.md asks for exactly this: "539 people the Control Center currently
// treats as cold leads are in fact in Krish's own network ... should be
// re-tiered in the database."
const TIER_TO_CONSENT: Record<string, string> = {
  '1_reciprocated': 'warm',
  '2_core_network': 'warm',
  '3_known_network': 'cold_engaged',
  '4_owned_network': 'cold_engaged',
  '5_cold_lead': 'cold_scraped',
}
// Ranked so a re-tier can only ever move someone UP. A contact hand-marked
// `customer`, or promoted to `warm` off a recorded podcast, must not be
// demoted by a bulk file that only knows about source overlap.
const CONSENT_RANK: Record<string, number> = {
  cold_scraped: 0, cold_engaged: 1, permissioned: 2, warm: 3, customer: 4,
}

// ── Python-repr readers ─────────────────────────────────────────────────────
// The `dossier` column is a Python dict repr, not JSON: single-quoted keys and
// bare `nan` / `None` / `True`. 1,148 of 4,345 non-empty values fail a strict
// parse. Rather than try to rewrite Python syntax into JSON and get it subtly
// wrong, pull the two fields that carry retrieval signal directly. Anything
// unreadable is COUNTED, not silently dropped.
function pyField(repr: string, key: string): string | null {
  if (!repr) return null
  const re = new RegExp(`['"]${key}['"]\\s*:\\s*(?:'((?:[^'\\\\]|\\\\.)*)'|"((?:[^"\\\\]|\\\\.)*)")`)
  const m = repr.match(re)
  const raw = m ? (m[1] ?? m[2]) : null
  if (!raw) return null
  const v = raw.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, ' ').trim()
  return v && v !== 'nan' && v !== 'None' ? v : null
}

function jsonArray(s: string): string[] {
  if (!s) return []
  try {
    const v = JSON.parse(s)
    return Array.isArray(v) ? v.map(String) : []
  } catch { return [] }
}
function jsonObject(s: string): Record<string, number> {
  if (!s) return {}
  try {
    const v = JSON.parse(s)
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  } catch { return {} }
}
function pipeList(s: string): string[] {
  return s ? s.split('|').map(x => x.trim()).filter(Boolean) : []
}
function num(s: string): number | null {
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}
function bool(s: string): boolean {
  return /^(true|1|yes)$/i.test((s || '').trim())
}
function nameKey(s: string): string | null {
  const k = (s || '').trim().toLowerCase().replace(/\s+/g, ' ')
  return k.length > 1 ? k : null
}

/** The retrieval surface. Both intel_tsv and the embedding derive from this one
 *  string, so the lexical and semantic tiers can never disagree about what was
 *  actually indexed. */
function buildIntelDoc(r: Record<string, string>): string {
  const headline = pyField(r.dossier, 'headline')
  const about = pyField(r.dossier, 'about')
  return [
    r.who, r.why_them, r.hook,
    r.title, r.company, r.industry, r.location || r.country,
    headline, about,
  ].filter(Boolean).join(' · ').replace(/\s+/g, ' ').trim()
}

// ── Load the live spine ─────────────────────────────────────────────────────
interface LiveContact {
  id: string
  email_normalized: string | null
  linkedin_url_norm: string | null
  full_name: string | null
  consent_tier: string
}

async function loadLiveContacts(): Promise<LiveContact[]> {
  if (SNAPSHOT) return JSON.parse(readFileSync(SNAPSHOT, 'utf8')) as LiveContact[]
  const out: LiveContact[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from('contacts')
      .select('id, email_normalized, linkedin_url_norm, full_name, consent_tier')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`load contacts: ${error.message}`)
    if (!data || data.length === 0) break
    out.push(...(data as LiveContact[]))
    if (data.length < PAGE) break
  }
  return out
}

async function main() {
  if (EMBED_ONLY) return embedPass()
  if (!FILE) { console.error('Missing --file <path to network_intelligence.csv>'); process.exit(1) }

  console.log(`mode: ${COMMIT ? 'COMMIT' : 'DRY RUN (no writes)'}`)
  console.log(`file: ${FILE}`)

  const rows = parseDelimitedObjects(readFileSync(FILE, 'utf8')).slice(0, LIMIT)
  console.log(`parsed ${rows.length} rows\n`)

  const live = await loadLiveContacts()
  const byEmail = new Map<string, LiveContact>()
  const byLinkedin = new Map<string, LiveContact>()
  const byName = new Map<string, LiveContact>()
  for (const c of live) {
    if (c.email_normalized) byEmail.set(c.email_normalized, c)
    const ln = linkedinNorm(c.linkedin_url_norm)
    if (ln) byLinkedin.set(ln, c)
    const nk = nameKey(c.full_name || '')
    // First writer wins: a duplicate name must not silently reassign identity.
    if (nk && !byName.has(nk)) byName.set(nk, c)
  }
  console.log(`live contacts: ${live.length} (email ${byEmail.size} · linkedin ${byLinkedin.size} · name ${byName.size})\n`)

  const stats = {
    total: rows.length,
    matchedLinkedin: 0, matchedEmail: 0, matchedName: 0, unmatched: 0,
    retierUp: 0, retierHeld: 0,
    dossierPresent: 0, dossierRead: 0, dossierUnreadable: 0,
    emptyIntelDoc: 0, notPerson: 0, rulesOnly: 0,
    collisions: 0, collisionsDropped: 0, collisionsDemoted: 0,
    byTier: {} as Record<string, number>,
  }

  // ── Pass 1: resolve ───────────────────────────────────────────────────────
  // Every row gets a contact id (or null for new) plus a rank, and NOTHING is
  // built yet. The single-pass version could not undo a decision once a better
  // row turned up later, which is exactly the case that matters here.
  //
  // A contact can carry only one intelligence row (contact_id is the PK), and
  // two CSV rows genuinely do resolve to the same contact: the live spine holds
  // records whose full_name is a bare first name or an Instagram handle
  // (name_quality = 'partial' on 651 rows), so a DB row called "Josh" matches
  // the file's "Josh" by name while the file's "Josh Peters" matches the same
  // DB row by email. Both are the same human; only one row can win.
  //
  // Match tier dominates the rank because it is a different kind of claim: a
  // LinkedIn or email hit is an identity assertion, a name hit is a guess. No
  // amount of profile richness should let a guess outrank an assertion.
  const MATCH_RANK = { linkedin: 3, email: 2, name: 1, none: 0 } as const
  const NAME_RANK: Record<string, number> = { full: 2, partial: 1, missing: 0 }
  const EVIDENCE_RANK: Record<string, number> = {
    llm_v2_full: 5, llm_v1: 4, llm_v1_thin: 3, llm_v1_company: 2, rules_v1: 1,
  }
  const CONFIDENCE_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 }

  type Resolved = {
    row: Record<string, string>
    contactId: string | null
    live: LiveContact | null
    via: keyof typeof MATCH_RANK
    rank: number
  }

  const resolved: Resolved[] = rows.map(r => {
    const em = emailNorm(r.email)
    const ln = linkedinNorm(r.linkedin_url)
    const nk = nameKey(r.full_name)

    let live: LiveContact | null = null
    let via: keyof typeof MATCH_RANK = 'none'
    if (ln && byLinkedin.has(ln)) { live = byLinkedin.get(ln)!; via = 'linkedin' }
    else if (em && byEmail.has(em)) { live = byEmail.get(em)!; via = 'email' }
    else if (nk && byName.has(nk)) { live = byName.get(nk)!; via = 'name' }

    const rank =
      MATCH_RANK[via] * 10000 +
      (NAME_RANK[r.name_quality] ?? 0) * 1000 +
      (EVIDENCE_RANK[r.intel_method] ?? 0) * 100 +
      (CONFIDENCE_RANK[r.confidence] ?? 0) * 10 +
      Math.min(9, Number(r.source_count) || 0)

    return { row: r, contactId: live?.id ?? null, live, via, rank }
  })

  // ── Pass 2: settle collisions ─────────────────────────────────────────────
  const best = new Map<string, Resolved>()
  const collisionNotes: string[] = []
  for (const x of resolved) {
    if (!x.contactId) continue
    const prev = best.get(x.contactId)
    if (!prev) { best.set(x.contactId, x); continue }
    stats.collisions++
    const winner = x.rank > prev.rank ? x : prev
    const loser  = x.rank > prev.rank ? prev : x
    best.set(x.contactId, winner)
    collisionNotes.push(
      `kept ${winner.row.full_name || '(unnamed)'} [${winner.via}/${winner.row.name_quality}] ` +
      `over ${loser.row.full_name || '(unnamed)'} [${loser.via}/${loser.row.name_quality}]`,
    )
  }
  // Losing a collision must not delete a person. A row that lost because its
  // only claim was a NAME match was never proven to be that contact — the name
  // tier is a guess, and a guess that has now been beaten is simply wrong. So
  // it is demoted to "new" and inserted as its own contact rather than
  // discarded. Only a row that lost while holding a LinkedIn or email match is
  // a genuine duplicate of the winner, and only those are dropped.
  const survivors: Resolved[] = []
  for (const x of resolved) {
    if (!x.contactId || best.get(x.contactId) === x) { survivors.push(x); continue }
    if (x.via === 'name') {
      survivors.push({ ...x, contactId: null, live: null, via: 'none' })
      stats.collisionsDemoted++
    } else {
      stats.collisionsDropped++
    }
  }

  // ── Pass 3: build ─────────────────────────────────────────────────────────
  const inserts: Record<string, unknown>[] = []
  const retiers: { id: string; from: string; to: string }[] = []
  const intel: Record<string, unknown>[] = []

  for (const x of survivors) {
    const r = x.row
    if (x.via === 'linkedin') stats.matchedLinkedin++
    else if (x.via === 'email') stats.matchedEmail++
    else if (x.via === 'name') stats.matchedName++
    else stats.unmatched++

    const tier = r.tier || '5_cold_lead'
    stats.byTier[tier] = (stats.byTier[tier] || 0) + 1
    if (!bool(r.is_person)) stats.notPerson++
    if (r.intel_method === 'rules_v1') stats.rulesOnly++

    if (r.dossier && r.dossier !== '{}') {
      stats.dossierPresent++
      if (pyField(r.dossier, 'headline') || pyField(r.dossier, 'about')) stats.dossierRead++
      else stats.dossierUnreadable++
    }

    const intelDoc = buildIntelDoc(r)
    if (!intelDoc) stats.emptyIntelDoc++

    const proposed = TIER_TO_CONSENT[tier] || 'cold_scraped'

    if (x.live) {
      if ((CONSENT_RANK[proposed] ?? 0) > (CONSENT_RANK[x.live.consent_tier] ?? 0)) {
        stats.retierUp++
        retiers.push({ id: x.live.id, from: x.live.consent_tier, to: proposed })
      } else if (proposed !== x.live.consent_tier) {
        stats.retierHeld++
      }
    } else {
      inserts.push({
        full_name: r.full_name || null,
        email: r.email || null,
        // email_normalized is GENERATED ALWAYS — never name it in an insert.
        linkedin_url: r.linkedin_url || null,
        linkedin_url_norm: linkedinNorm(r.linkedin_url),
        company: r.company || null,
        title: r.title || null,
        location: r.location || r.country || null,
        origin_channel: 'network_intelligence',
        origin_venture: r.primary_venture && r.primary_venture !== 'none' ? r.primary_venture : null,
        origin_campaign: 'network_intelligence_2026_08',
        first_met_channel: r.first_met_channel || null,
        first_met_context: r.first_met_context || null,
        sources: pipeList(r.source_list).map(sl => ({ type: 'network_intelligence', source: sl })),
        consent_tier: proposed,
        // Imported rows land triaged: they arrive WITH a judgment attached, so
        // routing them through the pending queue would ask Krish to re-decide
        // something the file already decided.
        triage_status: 'triaged',
      })
    }

    intel.push({
      _match: x.live?.id ?? null,
      // Explicit back-reference to the insert that will mint this contact's id.
      // The two arrays are built in one pass so a positional walk would work
      // today, but it would break silently the moment anything filters one of
      // them, and the failure mode is a person's judgment filed under a
      // stranger's name.
      _insertIdx: x.live ? null : inserts.length - 1,
      who: r.who || null,
      why_them: r.why_them || null,
      hook: r.hook || null,
      risk: r.risk || null,
      roles: jsonArray(r.roles),
      surface_when: jsonArray(r.surface_when),
      venture_scores: jsonObject(r.venture_scores),
      primary_venture: r.primary_venture && r.primary_venture !== 'none' ? r.primary_venture : null,
      mindmaker_buyer_family: r.mindmaker_buyer_family && r.mindmaker_buyer_family !== 'none' ? r.mindmaker_buyer_family : null,
      network_tier: tier,
      tier_weight: num(r.tier_weight) ?? 0,
      priority: num(r.priority),
      fit: num(r.fit),
      warmth: num(r.warmth),
      confidence: r.confidence || 'low',
      intel_method: r.intel_method || 'rules_v1',
      evidence: jsonArray(r.evidence),
      seniority: r.seniority || null,
      country: r.country || null,
      industry: r.industry || null,
      reachable_via: pipeList(r.reachable_via),
      best_channel: r.best_channel && r.best_channel !== 'none' ? r.best_channel : null,
      source_count: num(r.source_count) ?? 0,
      source_list: pipeList(r.source_list),
      is_person: bool(r.is_person),
      name_quality: r.name_quality || 'missing',
      reciprocated_email: bool(r.reciprocated_email),
      email_inbound: num(r.email_inbound) ?? 0,
      email_outbound: num(r.email_outbound) ?? 0,
      email_last: r.email_last || null,
      intel_doc: intelDoc || null,
    })
  }

  report(stats, inserts.length, retiers, intel, collisionNotes)

  if (COMMIT && SNAPSHOT) {
    console.error('\nRefusing to --commit against a snapshot: it is a point-in-time copy,')
    console.error('and anything inserted since would be duplicated. Drop --contacts-snapshot.')
    process.exit(1)
  }
  if (!COMMIT) {
    console.log('\nDRY RUN — nothing written. Re-run with --commit to apply,')
    console.log('then `--embed --commit` for the embedding pass.')
    return
  }
  await applyWrites(inserts, retiers, intel)
}

function report(
  s: Record<string, any>,
  insertCount: number,
  retiers: { from: string; to: string }[],
  intel: Record<string, unknown>[],
  notes: string[] = [],
) {
  const pct = (n: number) => `${((100 * n) / s.total).toFixed(1)}%`
  console.log('── RESOLUTION ' + '─'.repeat(52))
  console.log(`  matched on linkedin      ${String(s.matchedLinkedin).padStart(6)}  ${pct(s.matchedLinkedin)}`)
  console.log(`  matched on email         ${String(s.matchedEmail).padStart(6)}  ${pct(s.matchedEmail)}`)
  console.log(`  matched on name          ${String(s.matchedName).padStart(6)}  ${pct(s.matchedName)}`)
  console.log(`  NEW (would insert)       ${String(s.unmatched).padStart(6)}  ${pct(s.unmatched)}`)
  console.log(`  → contacts insert count  ${String(insertCount).padStart(6)}`)

  console.log('\n── RE-TIER ' + '─'.repeat(55))
  const moves: Record<string, number> = {}
  for (const r of retiers) moves[`${r.from} → ${r.to}`] = (moves[`${r.from} → ${r.to}`] || 0) + 1
  console.log(`  promoted                 ${String(s.retierUp).padStart(6)}`)
  for (const [k, v] of Object.entries(moves).sort((a, b) => b[1] - a[1])) {
    console.log(`      ${k.padEnd(30)} ${String(v).padStart(5)}`)
  }
  console.log(`  held (would be a demote) ${String(s.retierHeld).padStart(6)}`)

  console.log('\n── EVIDENCE TIER (from the file) ' + '─'.repeat(33))
  for (const [k, v] of Object.entries(s.byTier).sort((a: any, b: any) => b[1] - a[1])) {
    console.log(`  ${String(k).padEnd(24)} ${String(v).padStart(6)}`)
  }

  console.log('\n── DATA QUALITY ' + '─'.repeat(50))
  console.log(`  dossier present          ${String(s.dossierPresent).padStart(6)}`)
  console.log(`      readable             ${String(s.dossierRead).padStart(6)}`)
  console.log(`      UNREADABLE           ${String(s.dossierUnreadable).padStart(6)}   (python repr, counted not dropped)`)
  console.log(`  empty intel_doc          ${String(s.emptyIntelDoc).padStart(6)}   (will not be searchable)`)
  console.log(`  is_person = false        ${String(s.notPerson).padStart(6)}   (hard-excluded from search)`)
  console.log(`  intel_method = rules_v1  ${String(s.rulesOnly).padStart(6)}   (scored down + marked, not hidden)`)
  console.log(`  intelligence rows        ${String(intel.length).padStart(6)}`)

  console.log('\n── COLLISIONS ' + '─'.repeat(52))
  console.log(`  rows resolving to an already-claimed contact  ${String(s.collisions).padStart(5)}`)
  console.log(`  dropped as a true duplicate                  ${String(s.collisionsDropped).padStart(5)}`)
  console.log(`  demoted to a NEW contact (lost a name guess)  ${String(s.collisionsDemoted).padStart(5)}`)
  if (notes.length) {
    console.log('  how each was settled:')
    for (const n of notes.slice(0, 10)) console.log(`      ${n}`)
    if (notes.length > 10) console.log(`      … and ${notes.length - 10} more`)
  }
}

async function applyWrites(
  inserts: Record<string, unknown>[],
  retiers: { id: string; to: string }[],
  intel: Record<string, unknown>[],
) {
  const CHUNK = 500
  console.log('\n── WRITING ' + '─'.repeat(55))

  // 1. New contacts. Chunked, and the returned ids are mapped straight back
  //    onto the intelligence rows so nothing has to be re-resolved.
  const newIds = new Map<number, string>()
  for (let i = 0; i < inserts.length; i += CHUNK) {
    const slice = inserts.slice(i, i + CHUNK)
    const { data, error } = await sb.from('contacts').insert(slice).select('id')
    if (error) throw new Error(`insert contacts @${i}: ${error.message}`)
    ;(data || []).forEach((row: { id: string }, j) => newIds.set(i + j, row.id))
    console.log(`  contacts inserted ${Math.min(i + CHUNK, inserts.length)}/${inserts.length}`)
  }

  // 2. Re-tier.
  const byTarget = new Map<string, string[]>()
  for (const r of retiers) {
    if (!byTarget.has(r.to)) byTarget.set(r.to, [])
    byTarget.get(r.to)!.push(r.id)
  }
  for (const [tier, ids] of byTarget) {
    for (let i = 0; i < ids.length; i += CHUNK) {
      const { error } = await sb.from('contacts')
        .update({ consent_tier: tier }).in('id', ids.slice(i, i + CHUNK))
      if (error) throw new Error(`retier ${tier}: ${error.message}`)
    }
    console.log(`  re-tiered → ${tier}: ${ids.length}`)
  }

  // 3. Intelligence. Rows whose contact could not be resolved AND could not be
  //    inserted are skipped and reported rather than written orphaned.
  const payload: Record<string, unknown>[] = []
  let skipped = 0
  for (const row of intel) {
    const { _match, _insertIdx, ...rest } = row as Record<string, any>
    const cid = (_match as string | null) ?? (_insertIdx === null ? null : newIds.get(_insertIdx) ?? null)
    if (!cid) { skipped++; continue }
    payload.push({ contact_id: cid, ...rest })
  }
  for (let i = 0; i < payload.length; i += CHUNK) {
    const { error } = await sb.from('contact_intelligence')
      .upsert(payload.slice(i, i + CHUNK), { onConflict: 'contact_id' })
    if (error) throw new Error(`upsert intelligence @${i}: ${error.message}`)
    console.log(`  intelligence upserted ${Math.min(i + CHUNK, payload.length)}/${payload.length}`)
  }
  if (skipped) console.log(`  SKIPPED (unresolvable contact): ${skipped}`)
  console.log('\nDone. Now run: --embed --commit')
}

// ── Embedding pass ──────────────────────────────────────────────────────────
// Deliberately separate. Embedding is the only step that spends money and the
// only one that depends on a third party being up; keeping it out of the
// identity load means a transient OpenAI failure never leaves the spine
// half-written.
async function embedPass() {
  console.log(`embed pass — ${COMMIT ? 'COMMIT' : 'DRY RUN'}`)
  const PAGE = 256
  let done = 0, skipped = 0
  for (;;) {
    const { data, error } = await sb
      .from('contact_intelligence')
      .select('contact_id, intel_doc')
      .is('embedding', null)
      .not('intel_doc', 'is', null)
      .limit(PAGE)
    if (error) throw new Error(`select for embed: ${error.message}`)
    if (!data || data.length === 0) break

    const rows = data as { contact_id: string; intel_doc: string }[]
    if (!COMMIT) {
      console.log(`  would embed ${rows.length} (first: ${rows[0].intel_doc.slice(0, 80)}…)`)
      const { count } = await sb.from('contact_intelligence')
        .select('contact_id', { count: 'exact', head: true })
        .is('embedding', null).not('intel_doc', 'is', null)
      console.log(`  total pending: ${count}`)
      console.log(`  est cost: $${(((count || 0) * 300) / 4 / 1e6 * 0.02).toFixed(4)} at text-embedding-3-small pricing`)
      return
    }

    const vecs = await embedBatch(rows.map(r => ({ title: null, body: r.intel_doc })))
    for (let i = 0; i < rows.length; i++) {
      const v = vecs[i]
      if (!v) { skipped++; continue }
      const { error: upErr } = await sb.from('contact_intelligence')
        .update({ embedding: vectorLiteral(v) })
        .eq('contact_id', rows[i].contact_id)
      if (upErr) throw new Error(`write embedding: ${upErr.message}`)
      done++
    }
    console.log(`  embedded ${done} (skipped ${skipped})`)
  }
  console.log(`\nembedded ${done}, skipped ${skipped}`)
}

main().catch(e => { console.error('\nFAILED:', e.message); process.exit(1) })
