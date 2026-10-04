import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guard } from '../_auth.js'
import { supabase } from '../_supabase.js'
import { recordSuggestions, type SuggestionInput } from '../_suggestions.js'
import {
  collapseRows, decide, despace, normName, slugOf, usableEmail, planLink, planCreate, namesAgree, isIdentifyingName,
  type MetaRow, type MetaIndex, type KnownContact, type Decision, type ProfileVerdict, type MetaNetwork,
  type CreateDecision,
} from '../_metaImport.js'

// POST /api/network/import-meta   { rows: MetaRow[], dryRun?, offset?, limit?, finish? }
//
// Brings the Meta export (Facebook friends, Instagram, the phone contacts Meta
// holds) into the network as additions only. The rules for who each person is
// and which of Apify's guesses to believe live in api/_metaImport.ts, with the
// measurements behind them. This file applies them.
//
// WHAT IT WRITES, AND NOTHING ELSE
//   On someone already here: a 'meta_export' source naming the networks, one
//   identity per network, and, only from a profile that has been believed,
//   blank fields filled. A field that has a value keeps it.
//   For someone new: a contact, an intelligence row, the identities, and the
//   same believed-profile fields.
//   A guess nothing confirms writes nothing. It becomes a "which profile"
//   question for Krish, with the profile attached, so a yes later applies it.
//   A name shared with someone already here becomes a "same person?" question.
//
// The workbook itself never enters this repository (it is public). The caller
// posts its rows; each contact keeps the row's id ("C0123") so a second run
// finds the same people rather than making them again.
//
// Dry by default, like every bulk write that touches real people.

export const config = { maxDuration: 300 }

const PAGE = 1000
const IMPORTED_AT = '2026-10-04'
const PRODUCER = { agent: 'meta-import', export: 'meta-2026-10' }
const NETWORKS: readonly MetaNetwork[] = ['facebook', 'instagram', 'phone_book']

type Row = Record<string, unknown>

/** Every row of a table, paged and ordered, because PostgREST stops at 1,000
 *  without saying so and an exclusion list read short creates duplicates. */
async function readAll(table: string, columns: string, order: string, filter?: (q: any) => any): Promise<Row[]> {
  const out: Row[] = []
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select(columns).order(order, { ascending: true }).range(from, from + PAGE - 1)
    if (filter) q = filter(q)
    const { data, error } = await q
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...((data || []) as unknown as Row[]))
    if (!data || data.length < PAGE) break
  }
  return out
}

function sourceKeys(sources: unknown): string[] {
  if (!Array.isArray(sources)) return []
  const out = new Set<string>()
  for (const s of sources as Row[]) {
    if (!s || typeof s !== 'object') continue
    const k = (s.source || s.type) as string | undefined
    if (k) out.add(String(k))
  }
  return [...out]
}

function metaRefs(sources: unknown): Array<{ ref: string; basis: string }> {
  if (!Array.isArray(sources)) return []
  return (sources as Row[]).filter(s => s && s.type === 'meta_export' && typeof s.ref === 'string')
    .map(s => ({ ref: String(s.ref), basis: String(s.basis || '') }))
}

export async function loadIndex(): Promise<MetaIndex> {
  const [contacts, identities, connections, tenures] = await Promise.all([
    readAll('contacts', 'id, full_name, first_name, last_name, email_normalized, linkedin_url, sources, status_reason', 'id'),
    readAll('contact_identities', 'contact_id, kind, value', 'id', q => q.in('kind', ['email', 'li_slug']).is('retired_at', null)),
    readAll('linkedin_connections', 'linkedin_slug, full_name', 'linkedin_slug'),
    supabase.from('krish_tenures').select('pattern, closeness, kind, started, finished'),
  ])
  if (tenures.error) throw new Error(`krish_tenures: ${tenures.error.message}`)

  const idx: MetaIndex = {
    byId: new Map(), bySlug: new Map(), byEmail: new Map(), byName: new Map(), byFirst: new Map(), byRef: new Map(),
    connections: new Map(), schools: [], closeEmployers: [],
  }
  const push = (m: Map<string, string[]>, key: string, id: string) => {
    const list = m.get(key) || []
    if (!list.includes(id)) list.push(id)
    m.set(key, list)
  }
  const addName = (n: string | null, id: string, self: boolean) => {
    if (!n) return
    push(idx.byName, n, id)
    if (!self && n.includes(' ')) push(idx.byFirst, n.split(' ')[0], id)
  }
  for (const c of contacts) {
    const id = String(c.id)
    const k: KnownContact = {
      id,
      name: (c.full_name as string) || null,
      slug: slugOf(c.linkedin_url as string),
      email: (c.email_normalized as string) || null,
      sources: sourceKeys(c.sources),
      meta_refs: metaRefs(c.sources),
      is_self: c.status_reason === 'self',
    }
    idx.byId.set(id, k)
    if (k.slug && !idx.bySlug.has(k.slug)) idx.bySlug.set(k.slug, id)
    if (k.email && !idx.byEmail.has(k.email)) idx.byEmail.set(k.email, id)
    for (const r of k.meta_refs) idx.byRef.set(r.ref, { id, basis: r.basis })
    addName(normName(k.name), id, k.is_self)
    const fl = normName([c.first_name, c.last_name].filter(Boolean).join(' '))
    if (fl && fl.includes(' ')) addName(fl, id, k.is_self)
  }
  // Identities carry the handles a merge kept: a second address, an old
  // profile. They point at the same people, so they win over nothing and add
  // what the row alone would miss.
  for (const i of identities) {
    const v = String(i.value)
    if (i.kind === 'li_slug' && !idx.bySlug.has(v)) idx.bySlug.set(v, String(i.contact_id))
    if (i.kind === 'email' && !idx.byEmail.has(v)) idx.byEmail.set(v, String(i.contact_id))
  }
  for (const c of connections) idx.connections.set(String(c.linkedin_slug).toLowerCase(), String(c.full_name || ''))
  for (const t of (tenures.data || []) as Row[]) {
    const re = new RegExp(String(t.pattern), 'i')
    const year = (d: unknown) => (typeof d === 'string' && /^\d{4}/.test(d) ? Number(d.slice(0, 4)) : null)
    if (t.kind === 'school') idx.schools.push({ re, close: t.closeness === 'close', from: year(t.started), to: year(t.finished) })
    else if (t.closeness === 'close') idx.closeEmployers.push(re)
  }
  return idx
}

/** Rows arrive from a caller; accept only the shape the rules read. */
export function cleanRows(input: unknown): MetaRow[] {
  if (!Array.isArray(input)) return []
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const out: MetaRow[] = []
  for (const r of input as Row[]) {
    if (!r || typeof r !== 'object') continue
    const ref = str(r.ref)
    const name = str(r.name)
    if (!ref || !/^[A-Za-z0-9_-]{1,32}$/.test(ref) || !name) continue
    const networks = (Array.isArray(r.networks) ? r.networks : [])
      .filter((n): n is MetaNetwork => NETWORKS.includes(n as MetaNetwork))
    if (!networks.length) continue
    const arr = (v: unknown) => (Array.isArray(v) ? (v as Row[]).filter(x => x && typeof x === 'object') : [])
    out.push({
      ref, name, networks: [...new Set(networks)],
      linkedin: str(r.linkedin),
      headline: str(r.headline), role: str(r.role), company: str(r.company), location: str(r.location),
      followers: Number.isFinite(Number(r.followers)) && r.followers !== null ? Number(r.followers) : null,
      emails: arr(r.emails).map(e => ({ email: String(e.email || ''), status: str(e.status), catch_all: typeof e.catch_all === 'boolean' ? e.catch_all : null })),
      education: arr(r.education).map(e => ({ school: String(e.school || ''), degree: str(e.degree), field: str(e.field), period: str(e.period) })).filter(e => e.school),
      career: arr(r.career).map(c => ({ title: str(c.title), company: str(c.company), dates: str(c.dates) })),
      skills: (Array.isArray(r.skills) ? r.skills : []).map(s => String(s).trim()).filter(Boolean).slice(0, 40),
      memorial: r.memorial === true,
      candidates: arr(r.candidates).map(c => ({ url: String(c.url || ''), title: str(c.title) })).filter(c => slugOf(c.url)).slice(0, 5),
    })
  }
  return out
}

/** The profile, as a question. Asked when nothing confirms Apify's guess, and
 *  also when the guess is confirmed but the person was matched to the contact
 *  by name alone: two links that each rest partly on a name are not enough to
 *  write someone's job onto a record. */
/** Whether this run put the contact on hold, and the status it replaced, so
 *  a "not them" releases only a hold the import placed and puts back what was
 *  there. A hold Krish set himself is never undone by an answer here. */
interface Hold { held: boolean; prior: string }

function profileQuestion(row: MetaRow, contactId: string, p: ProfileVerdict, hold: Hold): SuggestionInput | null {
  const guessedSlug = p.kind === 'unverified' || p.kind === 'verified' ? p.slug : null
  const guessed = guessedSlug ? [{ url: `https://www.linkedin.com/in/${guessedSlug}`, title: row.headline }] : []
  const candidates = [...guessed, ...row.candidates.filter(c => slugOf(c.url) !== guessedSlug)].slice(0, 5)
  if (!candidates.length) return null
  const one = candidates.length === 1
  return {
    surface: 'contact_link',
    subject_table: 'contacts',
    subject_id: contactId,
    proposed: {
      ref: row.ref,
      networks: row.networks,
      memorial: row.memorial && Boolean(guessedSlug),
      held: hold.held,
      prior_status: hold.prior,
      confirmed_by: p.kind === 'verified' ? p.detail : null,
      candidates: candidates.map((c, i) => ({
        url: c.url,
        slug: slugOf(c.url),
        title: c.title,
        // The memorial page is the guessed profile. The search results beside
        // it are other people, and none of them has died as far as anyone knows.
        memorial: i === 0 && row.memorial && Boolean(guessedSlug),
        // Only the guessed profile has a read behind it. The rest are search
        // results: a name, a line, a place.
        profile: i === 0 && guessedSlug ? {
          headline: row.headline, role: row.role, company: row.company, location: row.location,
          followers: row.followers, education: row.education.slice(0, 4), career: row.career.slice(0, 6),
          skills: row.skills.slice(0, 20), email: usableEmail(row),
        } : null,
      })),
    },
    reason: p.kind === 'verified'
      ? `This profile lists ${p.detail}, so it is probably right, but this person was matched to the contact by name alone.`
      : one
        ? 'Apify guessed this LinkedIn profile from the name alone, and nothing you already have confirms it.'
        : 'Apify found several LinkedIn profiles with this name and could not tell which, if any, is them.',
    confidence: p.kind === 'verified' ? 0.8 : p.kind === 'unverified' ? 0.5 : 0.2,
    producer: PRODUCER,
  }
}

type MergeRule = 'same_name' | 'similar_name' | 'same_profile'

const MERGE_REASON: Record<MergeRule, { reason: string; confidence: number }> = {
  same_name: { reason: 'The same name is already in your network, and nothing else says whether it is the same person.', confidence: 0.4 },
  similar_name: { reason: 'A name like this one is already in your network, with a middle name or an initial different. Nothing else says whether it is the same person.', confidence: 0.3 },
  same_profile: { reason: 'Apify matched this person to a LinkedIn profile that is already on another contact. Are they the same person?', confidence: 0.6 },
}

function mergeQuestion(newId: string, otherId: string, row: MetaRow, rule: MergeRule): SuggestionInput {
  return {
    surface: 'contact_merge',
    subject_table: 'contacts',
    subject_id: newId,
    proposed: { a: newId, b: otherId, rule, ref: row.ref, networks: row.networks },
    reason: MERGE_REASON[rule].reason,
    confidence: MERGE_REASON[rule].confidence,
    producer: PRODUCER,
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guard(req, res, ['POST'])) return
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as Row
  const dryRun = b.dryRun !== false
  const all = cleanRows(b.rows)
  if (!all.length && b.finish !== true) return res.status(400).json({ ok: false, error: 'rows is required' })

  try {
    const { rows: people, folded } = collapseRows(all)
    const offset = Math.max(0, Number(b.offset) || 0)
    // A write run does a few round trips per person, so it goes in slices
    // that finish well inside the function's 300 seconds. A dry run writes
    // nothing and can read the whole export at once.
    const limit = Math.max(1, Math.min(2000, Number(b.limit) || (dryRun ? people.length : 200) || 1))
    const slice = people.slice(offset, offset + limit)

    const idx = await loadIndex()
    const decisions: Array<{ row: MetaRow; d: Decision }> = slice.map(row => ({ row, d: decide(row, idx) }))

    const tally: Record<string, number> = {}
    const bump = (k: string) => { tally[k] = (tally[k] || 0) + 1 }
    for (const { d } of decisions) {
      bump(`action:${d.action}${d.action === 'link' ? `:${d.basis}` : d.action === 'skip' ? `:${d.reason}` : ''}`)
      if (d.action !== 'skip') bump(`profile:${d.profile.kind}${d.profile.kind === 'verified' ? `:${d.profile.by}` : ''}`)
      if (d.action !== 'skip' && d.maybe_same_as.length) bump('question:same_person')
      if (d.action !== 'skip' && d.profile.kind === 'taken') bump('question:same_profile')
    }

    if (dryRun) {
      return res.status(200).json({
        ok: true, dryRun: true, received: all.length, people: people.length, folded: folded.length,
        offset, considered: slice.length, tally,
        sample: decisions.slice(0, 12).map(({ row, d }) => ({
          ref: row.ref, action: d.action,
          ...(d.action === 'link' ? { basis: d.basis, verified: d.verified } : {}),
          ...(d.action !== 'skip' ? { profile: d.profile.kind } : {}),
        })),
      })
    }

    const out = { linked: 0, created: 0, filled: 0, identities: 0, questions: 0, held_back: 0, failures: [] as string[] }
    const questions: SuggestionInput[] = []
    // Questions are written as the run goes, not at the end: a run cut short
    // by the clock keeps every question for the people it already wrote. One
    // lost to a refused batch is asked again by the next run (decide() rule 1).
    const flush = async (force = false) => {
      if (!questions.length || (!force && questions.length < 10)) return
      const batch = questions.splice(0, questions.length)
      for (let i = 0; i < batch.length; i += 100) {
        const r = await recordSuggestions(batch.slice(i, i + 100))
        if (r.ok === false) out.failures.push(`questions: ${r.reason}`)
        else out.questions += r.ids.length
      }
    }
    const runName = (row: MetaRow) => normName(despace(row.name))
    const ruleFor = (otherId: string, row: MetaRow): MergeRule => {
      const n = runName(row)
      return n && (idx.byName.get(n) || []).includes(otherId) ? 'same_name' : 'similar_name'
    }

    // Open questions already asked about a contact are not asked twice.
    const asked = new Set<string>()
    for (const s of await readAll('suggestions', 'surface, subject_id', 'id', q => q.in('surface', ['contact_link', 'contact_merge']))) {
      asked.add(`${s.surface}:${s.subject_id}`)
    }

    // ── People already here ──
    const links = decisions.filter(x => x.d.action === 'link') as Array<{ row: MetaRow; d: Extract<Decision, { action: 'link' }> }>
    const linkIds = [...new Set(links.map(x => x.d.contact_id))]
    const current = new Map<string, Row>()
    const currentCi = new Map<string, Row>()
    for (let i = 0; i < linkIds.length; i += 200) {
      const ids = linkIds.slice(i, i + 200)
      const [{ data: cs, error: cErr }, { data: cis, error: ciErr }] = await Promise.all([
        supabase.from('contacts').select('id, title, company, location, linkedin_url, email, dossier, sources, status').in('id', ids),
        supabase.from('contact_intelligence').select('contact_id, headline, followers, current_title, current_company, enriched_at, enriched_source, source_list').in('contact_id', ids),
      ])
      if (cErr) throw new Error(cErr.message)
      if (ciErr) throw new Error(ciErr.message)
      for (const c of (cs || []) as Row[]) current.set(String(c.id), c)
      for (const c of (cis || []) as Row[]) currentCi.set(String(c.contact_id), c)
    }

    const emailTaken = (e: string) => idx.byEmail.has(e)
    for (const { row, d } of links) {
      const c = current.get(d.contact_id)
      if (!c) { out.failures.push(`${row.ref}: contact gone`); continue }
      const plan = planLink(c, currentCi.get(d.contact_id) || null, row, d, {
        emailTaken, hasProfile: Boolean(idx.byId.get(d.contact_id)?.slug || slugOf(c.linkedin_url as string)), importedAt: IMPORTED_AT,
        slugOwner: s => idx.bySlug.get(s),
        profileAsked: asked.has(`contact_link:${d.contact_id}`),
      })
      if (Object.keys(plan.contact).length) {
        const { error } = await supabase.from('contacts').update(plan.contact).eq('id', d.contact_id)
        if (error) { out.failures.push(`${row.ref}: ${error.message}`); continue }
        if (Object.keys(plan.contact).some(k => k !== 'sources')) out.filled++
        // Two rows can land on one contact in one run. The second must plan
        // against what the first wrote, or it overwrites the first's source
        // entry and fills a blank the first already filled.
        current.set(d.contact_id, { ...c, ...plan.contact })
        if (typeof plan.contact.email === 'string') idx.byEmail.set(plan.contact.email, d.contact_id)
        if (plan.slug) {
          idx.bySlug.set(plan.slug, d.contact_id)
          const k = idx.byId.get(d.contact_id)
          if (k && !k.slug) k.slug = plan.slug
        }
      }
      if (Object.keys(plan.intelligence).length) {
        const { error } = await supabase.from('contact_intelligence').update(plan.intelligence).eq('contact_id', d.contact_id)
        if (error) out.failures.push(`${row.ref} intel: ${error.message}`)
        else currentCi.set(d.contact_id, { ...(currentCi.get(d.contact_id) || {}), ...plan.intelligence })
      }
      if (plan.holds) out.held_back++
      out.identities += await addIdentities(d.contact_id, row, d.basis, d.verified)
      if (plan.slug) out.identities += await addSlug(d.contact_id, plan.slug)
      if (plan.ask && !asked.has(`contact_link:${d.contact_id}`)) {
        const hold: Hold = { held: plan.holds, prior: String(c.status ?? 'active') }
        const q = plan.ask === 'memorial' ? memorialQuestion(row, d.contact_id, hold) : profileQuestion(row, d.contact_id, d.profile, hold)
        if (q) { questions.push(q); asked.add(`contact_link:${d.contact_id}`) }
      }
      if (!asked.has(`contact_merge:${d.contact_id}`)) {
        const merges = new Map<string, MergeRule>()
        for (const o of d.maybe_same_as) merges.set(o, ruleFor(o, row))
        if (plan.sameAs) merges.set(plan.sameAs, 'same_profile')
        for (const [o, rule] of merges) questions.push(mergeQuestion(d.contact_id, o, row, rule))
        if (merges.size) asked.add(`contact_merge:${d.contact_id}`)
      }
      out.linked++
      await flush()
    }

    // ── New people ──
    const creates = decisions.filter(x => x.d.action === 'create') as Array<{ row: MetaRow; d: CreateDecision }>
    // Two new people in one run whose names agree ("Ada Lovelace" and "Ada
    // Byron Lovelace") were both unknown when the run decided, so neither
    // decision could ask about the other. Asked here instead.
    const madeThisRun = new Map<string, Array<{ id: string; name: string }>>()
    for (const { row, d } of creates) {
      const plan = planCreate(row, d, { emailTaken, importedAt: IMPORTED_AT, slugOwner: s => idx.bySlug.get(s) })
      const { data: made, error } = await supabase.from('contacts').insert(plan.contact).select('id').single()
      if (error || !made) { out.failures.push(`${row.ref}: ${error?.message || 'insert failed'}`); continue }
      const id = String((made as Row).id)
      if (plan.holds) out.held_back++
      const { error: ciErr } = await supabase.from('contact_intelligence').insert({ contact_id: id, ...plan.intelligence })
      if (ciErr) out.failures.push(`${row.ref} intel: ${ciErr.message}`)
      out.identities += await addIdentities(id, row, 'meta_new', true)
      if (plan.slug) {
        out.identities += await addSlug(id, plan.slug)
        idx.bySlug.set(plan.slug, id)
      }
      if (typeof plan.contact.email === 'string') idx.byEmail.set(plan.contact.email, id)
      const hold: Hold = { held: plan.holds, prior: 'active' }
      const q = plan.ask === 'memorial' ? memorialQuestion(row, id, hold) : plan.ask === 'profile' ? profileQuestion(row, id, d.profile, hold) : null
      if (q) { questions.push(q); asked.add(`contact_link:${id}`) }

      const merges = new Map<string, MergeRule>()
      for (const o of d.maybe_same_as) merges.set(o, ruleFor(o, row))
      if (plan.sameAs) merges.set(plan.sameAs, 'same_profile')
      const name = despace(row.name).trim()
      const first = runName(row)?.split(' ')[0]
      if (first && d.is_person && isIdentifyingName(name)) {
        for (const prev of madeThisRun.get(first) || []) {
          if (!merges.has(prev.id) && namesAgree(prev.name, name)) {
            merges.set(prev.id, normName(prev.name) === runName(row) ? 'same_name' : 'similar_name')
          }
        }
        madeThisRun.set(first, [...(madeThisRun.get(first) || []), { id, name }])
      }
      for (const [o, rule] of merges) questions.push(mergeQuestion(id, o, row, rule))
      if (merges.size) asked.add(`contact_merge:${id}`)
      out.created++
      await flush()
    }
    await flush(true)

    let refreshed: Row | null = null
    if (b.finish === true) refreshed = await refreshAll()

    return res.status(200).json({
      ok: true, dryRun: false, people: people.length, folded: folded.length, offset, considered: slice.length,
      tally, ...out, failures: out.failures.slice(0, 20), refreshed,
    })
  } catch (err) {
    return res.status(500).json({ ok: false, error: String((err as Error)?.message || err).slice(0, 300) })
  }
}

function memorialQuestion(row: MetaRow, contactId: string, hold: Hold): SuggestionInput {
  return {
    surface: 'contact_link',
    subject_table: 'contacts',
    subject_id: contactId,
    proposed: {
      ref: row.ref, networks: row.networks, memorial: true, held: hold.held, prior_status: hold.prior,
      candidates: [{ url: row.linkedin, slug: slugOf(row.linkedin), title: row.headline, profile: null, memorial: true }],
    },
    reason: 'The LinkedIn profile matched to this person is a memorial page. They are kept out of every proposal until you say.',
    confidence: 0.5,
    producer: PRODUCER,
  }
}

/** One identity per network the person was found in. A name is not unique, so
 *  these never collide with anyone else's. */
async function addIdentities(contactId: string, row: MetaRow, basis: string, verified: boolean): Promise<number> {
  const value = normName(despace(row.name))
  if (!value) return 0
  const { data, error } = await supabase.from('contact_identities').upsert(
    row.networks.map(kind => ({ contact_id: contactId, kind, value, source: 'meta_export', basis, verified })),
    { onConflict: 'contact_id,kind,value', ignoreDuplicates: true },
  ).select('id')
  return error ? 0 : (data || []).length
}

async function addSlug(contactId: string, slug: string): Promise<number> {
  const { data, error } = await supabase.from('contact_identities').upsert(
    [{ contact_id: contactId, kind: 'li_slug', value: slug, source: 'meta_export', basis: 'meta_verified', verified: true }],
    { onConflict: 'contact_id,kind,value', ignoreDuplicates: true },
  ).select('id')
  return error ? 0 : (data || []).length
}

/** Plays, shared history, ties and warmth, rebuilt for everyone once a batch
 *  has landed. */
export async function refreshAll(): Promise<Row> {
  const out: Row = {}
  for (const fn of ['refresh_shared_history_and_plays', 'refresh_ties', 'refresh_relationship_rollup']) {
    const { data, error } = await supabase.rpc(fn)
    out[fn] = error ? `error: ${error.message}` : data
  }
  return out
}

