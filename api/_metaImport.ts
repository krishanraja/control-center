// Who each person in the Meta export is, and what about them can be believed.
//
// The export (Facebook friends, Instagram, the phone contacts Meta holds) came
// back from Apify with a LinkedIn profile guessed for about a third of it.
// Krish, 2026-10-04: these contacts "are a lot older ... less likely to have
// completely accurate Apify enrichment, and may be duplicates. It's really
// important that your judgement on what is actually additive is accurate."
//
// Measured before any rule was written, against his own 3,982 LinkedIn
// connections: where Apify and a connection disagree about who a name is, the
// connection is Krish's own record and Apify is a Google search. Apify agreed
// with the connection 70 times in 118 (59%). Its own match score did not
// separate right from wrong (the highest band was the worst, 16 of 48). Two
// signals did: the profile listing one of Krish's schools (7 of 7) or one of
// his close employers (28 of 29; the miss was the BBC, a 'wide' employer). So:
//
//   A guessed profile is believed only when something independent agrees:
//   the person Krish already has on record, his own connection list, a school
//   he went to, or a company he worked at closely. Anything else is shown to
//   him as a question and writes nothing.
//
// The identity rules run strictest first and stop at the first that holds.
// Only rules resting on a handle or on his own records link without asking;
// a bare name links only to someone he demonstrably knows first-hand, and
// only when the name is unique, and that link is marked unverified.
//
// Everything here is pure: no database, no network. The route loads the index
// and applies the decisions. tests/api/metaImport.test.ts holds the rules.

export type MetaNetwork = 'facebook' | 'instagram' | 'phone_book'

export interface MetaEmail { email: string; status: string | null; catch_all: boolean | null }
export interface MetaEducation { school: string; degree: string | null; field: string | null; period: string | null }
export interface MetaCareer { title: string | null; company: string | null; dates: string | null }
export interface MetaCandidate { url: string; title: string | null }

/** One person as the workbook describes them. */
export interface MetaRow {
  /** The workbook's own id ("C0123"), kept on the contact so a re-run finds it. */
  ref: string
  name: string
  networks: MetaNetwork[]
  /** Apify's guess. Not evidence on its own. */
  linkedin: string | null
  headline: string | null
  role: string | null
  company: string | null
  location: string | null
  followers: number | null
  emails: MetaEmail[]
  education: MetaEducation[]
  career: MetaCareer[]
  skills: string[]
  /** The guessed profile is a memorial page. */
  memorial: boolean
  /** Apify's candidate profiles where it could not choose one. */
  candidates: MetaCandidate[]
}

/** What the route knows about an existing contact, enough to decide. */
export interface KnownContact {
  id: string
  name: string | null
  slug: string | null
  email: string | null
  /** contacts.sources[].source (or .type), deduplicated. */
  sources: string[]
  /** Workbook refs already applied to this contact, with the basis each was
   *  linked on, so a re-run never promotes a name-only link. */
  meta_refs: Array<{ ref: string; basis: string }>
  is_self: boolean
}

export interface MetaIndex {
  byId: Map<string, KnownContact>
  bySlug: Map<string, string>
  byEmail: Map<string, string>
  byName: Map<string, string[]>
  /** First word of a name -> contacts, for spotting near-names ("Ada Byron
   *  Lovelace" and "Ada Lovelace"). Only ever raises a question. */
  byFirst: Map<string, string[]>
  byRef: Map<string, { id: string; basis: string }>
  /** Krish's own LinkedIn connections: slug -> the name LinkedIn has for them. */
  connections: Map<string, string>
  /** His schools, with his own years. A small school confirms on its own; a
   *  large one only where the years overlap his. */
  schools: SchoolTenure[]
  closeEmployers: RegExp[]
}

export interface SchoolTenure { re: RegExp; close: boolean; from: number | null; to: number | null }

/** The same rule as refresh_shared_history_and_plays(): academic years run
 *  September to June, so ranges that only touch at an end year never shared a
 *  year, and a single year (a graduation year) counts where it falls inside. */
export function yearsOverlap(period: string | null | undefined, from: number | null, to: number | null): boolean {
  if (!period || from === null) return false
  const years = [...period.matchAll(/(?:19|20)\d\d/g)].map(m => Number(m[0]))
  if (!years.length) return false
  const a = years[0]
  const b = years[years.length - 1]
  const kTo = to ?? from
  if (a === b) return a >= from && a <= kTo
  return a < kTo && b > from
}

// ── Names ───────────────────────────────────────────────────────────────────

/** "W I L L   B A R N A R D" is how some Instagram names arrive. Rejoin it,
 *  but only when every token is one letter and there are at least four, so
 *  true initials ("A K M") are left alone. */
export function despace(name: string): string {
  const clean = [...name].filter(ch => /[\p{L}\p{N}\s]/u.test(ch)).join('')
  const toks = clean.trim().split(/\s+/).filter(Boolean)
  if (toks.length >= 4 && toks.every(t => [...t].length === 1)) {
    return clean.trim().split(/\s{2,}/).map(w => w.replace(/\s+/g, '')).filter(Boolean).join(' ')
  }
  return name
}

/** Lower case, accents off, punctuation to spaces. The same rule as the
 *  analysis that measured the workbook, so a count here means what it meant
 *  there. */
export function normName(s: string | null | undefined): string | null {
  if (!s) return null
  const n = s.normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
  return n || null
}

export function isHandleLike(name: string): boolean {
  const n = name.trim()
  if (!n || /\s/.test(n) || !/^[A-Za-z0-9._]+$/.test(n)) return false
  return /[._0-9]/.test(n) || n === n.toLowerCase()
}

export function isInitialsOnly(name: string): boolean {
  const toks = (normName(name) || '').split(' ').filter(Boolean)
  return toks.length > 0 && toks.every(t => t.length === 1) && despace(name) === name
}

/** A page, a club or a brand that Instagram lists beside people. */
export function looksLikeAnOrganisation(name: string): boolean {
  const n = normName(name) || ''
  return /\b(project|official|studio|store|shop|club|band|records|tv|festival|events|gallery|magazine|podcast|academy|foundation|collective|productions|group)\b/.test(n)
    && !/\bkrish/.test(n)
}

/** Krish's own entry in his own phone. */
export function isKrish(name: string): boolean {
  const toks = (normName(name) || '').split(' ').filter(Boolean)
  if (!toks.length || !['krish', 'krishan'].includes(toks[0])) return false
  return toks.slice(1).every(t => t === 'raja' || t === 'uk' || /^\d+$/.test(t))
}

/** A name that can identify someone: two real words, not a handle, not
 *  initials. "michael" is seven people in this network. */
export function isIdentifyingName(name: string): boolean {
  const n = normName(despace(name))
  if (!n || isHandleLike(name) || isInitialsOnly(name)) return false
  const toks = n.split(' ')
  return toks.length >= 2 && toks.filter(t => t.length >= 2).length >= 2
}

const CREDENTIAL = /^(mba|miet|fcca|acca|aca|fca|cfa|cpa|ceng|cmgr|att|phd|msc|bsc|ba|ma|hons|cipd|pmp|frsa|mcips|frics|mrics|jr|sr)$/

/** A name without what LinkedIn adds to it: "Ada Lovelace - MBA",
 *  "Ada Lovelace (Byron)", "Ada Lovelace (FCCA, ATT)", "Ada Lovelace MIET".
 *  Used only to compare two names, never as a key. */
export function bareName(s: string | null | undefined): string | null {
  if (!s) return null
  let t = s.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
  t = t.split(/\s[-–—|]\s|,|\|/)[0]
  const toks = (normName(t) || '').split(' ').filter(Boolean)
  while (toks.length > 2 && CREDENTIAL.test(toks[toks.length - 1])) toks.pop()
  return toks.join(' ') || null
}

/** Two spellings of one person: the same first word and the same last word,
 *  or a last initial that fits ("Ada L." and "Ada Lovelace"). Middle names
 *  and maiden names in between do not matter, nor do the letters LinkedIn
 *  puts after a name. */
export function namesAgree(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = bareName(a)?.split(' ') || []
  const y = bareName(b)?.split(' ') || []
  if (x.length < 2 || y.length < 2) return false
  if (x[0] !== y[0]) return false
  const lx = x[x.length - 1]
  const ly = y[y.length - 1]
  if (lx === ly) return true
  if (lx.length === 1 && ly.startsWith(lx)) return true
  if (ly.length === 1 && lx.startsWith(ly)) return true
  return false
}

// ── LinkedIn ────────────────────────────────────────────────────────────────

/** The same rule as public.linkedin_slug(). */
export function slugOf(url: string | null | undefined): string | null {
  const m = /linkedin\.com\/(?:in|pub)\/([^/?#,\s]+)/i.exec(url || '')
  if (!m) return null
  const s = m[1].trim().toLowerCase()
  return s || null
}

export type ProfileVerdict =
  /** No guess was made. */
  | { kind: 'none' }
  /** The guess is the profile already on the contact. */
  | { kind: 'agrees'; slug: string }
  /** Believed, and why. */
  | { kind: 'verified'; slug: string; by: 'connection' | 'school' | 'employer'; detail: string }
  /** The contact already has a different profile. Krish's record wins. */
  | { kind: 'conflicts'; slug: string; kept: string }
  /** The guess belongs to someone else in the network with another name. */
  | { kind: 'taken'; slug: string; owner: string }
  /** Nothing independent agrees. Asked, never written. */
  | { kind: 'unverified'; slug: string }

const lc = (s: string | null | undefined) => (s || '').toLowerCase().replace(/[®™]/g, '').trim()

/** Does anything Krish knows for himself agree with Apify's guess? */
export function verifyProfile(row: MetaRow, slug: string, idx: MetaIndex): ProfileVerdict {
  const conn = idx.connections.get(slug)
  if (conn !== undefined && namesAgree(conn, despace(row.name))) {
    return { kind: 'verified', slug, by: 'connection', detail: 'one of your LinkedIn connections' }
  }
  // Measured, all seven school matches were right; every one was a large
  // school, and seven is a small number. Krish asked for accuracy above all,
  // so a large school confirms only where the years overlap his.
  for (const e of row.education) {
    const school = lc(e.school)
    if (!school) continue
    for (const s of idx.schools) {
      if (s.re.test(school) && (s.close || yearsOverlap(e.period, s.from, s.to))) {
        return { kind: 'verified', slug, by: 'school', detail: e.school }
      }
    }
  }
  for (const w of [...row.career, { title: row.role, company: row.company, dates: null }]) {
    const co = lc(w.company)
    if (co && idx.closeEmployers.some(p => p.test(co))) {
      return { kind: 'verified', slug, by: 'employer', detail: String(w.company) }
    }
  }
  return { kind: 'unverified', slug }
}

/** The first email Apify found that is worth keeping: deliverable and not a
 *  catch-all domain, which accepts every address and so proves nothing. */
export function usableEmail(row: MetaRow): string | null {
  for (const e of row.emails) {
    const addr = (e.email || '').trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) continue
    if ((e.status || '').toLowerCase() !== 'valid') continue
    if (e.catch_all === true) continue
    return addr
  }
  return null
}

// ── Identity ────────────────────────────────────────────────────────────────

/** Sources that mean Krish knows the person himself, rather than a list he
 *  bought, a roster he joined or a sheet of prospects. */
export const FIRST_HAND_SOURCES = new Set([
  'linkedin_export', 'instagram_export', 'phone_address_book', 'gmail_krish_mindmaker',
  'linkedin_messages', 'linkedin_messages_profile', 'meta_export',
])

const NETWORK_SOURCE: Record<MetaNetwork, string> = {
  facebook: 'facebook', // never imported before this export
  instagram: 'instagram_export',
  phone_book: 'phone_address_book',
}

export function isFirstHand(c: KnownContact, idx: MetaIndex): boolean {
  if (c.slug && idx.connections.has(c.slug)) return true
  return c.sources.some(s => FIRST_HAND_SOURCES.has(s))
}

export type Basis = 'meta_ref' | 'meta_slug' | 'meta_email' | 'meta_source' | 'meta_name'

export type Decision =
  | { action: 'skip'; ref: string; reason: 'krish' | 'no_name' | 'same_person_as'; same_as?: string }
  | {
      action: 'link'
      ref: string
      contact_id: string
      basis: Basis
      /** False only for a name-only link. */
      verified: boolean
      profile: ProfileVerdict
      /** Only on a re-run of a contact this import created: the same-named
       *  people the first run should have asked about. Asked if not asked yet. */
      maybe_same_as: string[]
    }
  | {
      action: 'create'
      ref: string
      profile: ProfileVerdict
      /** Existing contacts with this name that are not certainly them. Each
       *  becomes a "same person?" question, never a merge. */
      maybe_same_as: string[]
      is_person: boolean
    }

function profileFor(row: MetaRow, contact: KnownContact | null, idx: MetaIndex): ProfileVerdict {
  const slug = slugOf(row.linkedin)
  if (!slug) return { kind: 'none' }
  if (contact?.slug) {
    return contact.slug === slug ? { kind: 'agrees', slug } : { kind: 'conflicts', slug, kept: contact.slug }
  }
  const owner = idx.bySlug.get(slug)
  if (owner && owner !== contact?.id) return { kind: 'taken', slug, owner }
  return verifyProfile(row, slug, idx)
}

/** Decide one row. `rows` that share a person must be collapsed first
 *  (collapseRows), or the second is created as a duplicate of the first. */
export function decide(row: MetaRow, idx: MetaIndex): Decision {
  const name = despace(row.name || '').trim()
  if (!name) return { action: 'skip', ref: row.ref, reason: 'no_name' }
  if (isKrish(name)) return { action: 'skip', ref: row.ref, reason: 'krish' }

  const nn = normName(name)
  const usable = (id: string | undefined) => {
    const c = id ? idx.byId.get(id) : undefined
    return c && !c.is_self ? c : null
  }
  const link = (c: KnownContact, basis: Basis, verified: boolean, maybe: string[] = []): Decision => ({
    action: 'link', ref: row.ref, contact_id: c.id, basis, verified, profile: profileFor(row, c, idx), maybe_same_as: maybe,
  })
  const identifying = isIdentifyingName(name)
  const isPerson = !looksLikeAnOrganisation(name)
  const sameName = (nn ? idx.byName.get(nn) || [] : [])
    .map(id => usable(id)).filter((c): c is KnownContact => Boolean(c))
  /** Who to ask "same person?" about: the exact name first, then near-names
   *  that agree. Never a link, never a merge, only a question. */
  const askAbout = (except: string | null) => {
    if (!identifying) return []
    const near = !isPerson ? [] : [...new Set(idx.byFirst.get(nn!.split(' ')[0]) || [])]
      .map(id => usable(id))
      .filter((c): c is KnownContact => Boolean(c) && !sameName.includes(c!)
        && !looksLikeAnOrganisation(c!.name || '') && namesAgree(c!.name, name))
    return [...sameName, ...near].filter(c => c.id !== except).slice(0, 3).map(c => c.id)
  }

  // 1. Already imported: a re-run finds the same contact, whatever happened
  //    to it since (renamed, merged, enriched). A link that rested on a name
  //    still rests on a name: a re-run never promotes it.
  const priorRef = idx.byRef.get(row.ref)
  const prior = usable(priorRef?.id)
  if (prior) {
    if (priorRef!.basis === 'meta_name') return link(prior, 'meta_name', false)
    return link(prior, 'meta_ref', true, priorRef!.basis === 'meta_new' ? askAbout(prior.id) : [])
  }

  // 2. Apify's profile is already a contact, and the names agree: the guess
  //    and the record point at the same person.
  const slug = slugOf(row.linkedin)
  const bySlug = usable(slug ? idx.bySlug.get(slug) : undefined)
  if (bySlug && namesAgree(bySlug.name, name)) return link(bySlug, 'meta_slug', true)

  // 3. An address Apify found is already a contact's, and the names agree.
  for (const e of row.emails) {
    const c = usable(idx.byEmail.get((e.email || '').trim().toLowerCase()))
    if (c && namesAgree(c.name, name)) return link(c, 'meta_email', true)
  }

  // 4. The same name, already imported from the same network in February.
  //    Instagram and the phone book were read once before; this is the same
  //    entry read again, not a guess.
  const sameNetwork = sameName.filter(c => row.networks.some(n => c.sources.includes(NETWORK_SOURCE[n])))
  if (sameNetwork.length === 1) return link(sameNetwork[0], 'meta_source', true)

  // 5. A unique, identifying name that belongs to someone Krish knows
  //    first-hand. Against the same connections, an independently verified
  //    profile pointed at the same-named connection 35 times in 36. Linked,
  //    and marked as resting on a name.
  if (identifying && sameName.length === 1 && sameNetwork.length === 0 && isFirstHand(sameName[0], idx)) {
    return link(sameName[0], 'meta_name', false)
  }

  // 6. A new person. Any contact with the same or a near name becomes a
  //    question for Krish.
  return {
    action: 'create',
    ref: row.ref,
    profile: profileFor(row, null, idx),
    maybe_same_as: askAbout(null),
    is_person: isPerson,
  }
}

/** One person can appear twice in the export: once as a Facebook friend and
 *  once on Instagram, under the same name or under the same guessed profile.
 *  Those rows become one, with both networks. Different people who share a
 *  one-word name are left apart. */
export function collapseRows(rows: MetaRow[]): { rows: MetaRow[]; folded: Array<{ ref: string; into: string }> } {
  const out: MetaRow[] = []
  const folded: Array<{ ref: string; into: string }> = []
  const byKey = new Map<string, MetaRow>()
  for (const r of rows) {
    const name = despace(r.name || '')
    const slug = slugOf(r.linkedin)
    const keys = [
      isIdentifyingName(name) ? `name:${normName(name)}` : null,
      slug ? `slug:${slug}` : null,
    ].filter((k): k is string => Boolean(k))
    let into: MetaRow | undefined
    for (const k of keys) {
      const hit = byKey.get(k)
      if (!hit) continue
      // A shared guessed profile only joins two rows whose names agree.
      if (k.startsWith('slug:') && !namesAgree(despace(hit.name), name)) continue
      into = hit
      break
    }
    if (!into) {
      const copy: MetaRow = { ...r, networks: [...r.networks] }
      out.push(copy)
      for (const k of keys) byKey.set(k, copy)
      continue
    }
    for (const n of r.networks) if (!into.networks.includes(n)) into.networks.push(n)
    // Keep the longer name and the richer profile: the row folded in may be
    // the one Apify enriched.
    if (despace(r.name).length > despace(into.name).length) into.name = r.name
    if (!into.linkedin && r.linkedin) {
      Object.assign(into, {
        linkedin: r.linkedin, headline: r.headline, role: r.role, company: r.company,
        location: r.location, followers: r.followers, emails: r.emails, education: r.education,
        career: r.career, skills: r.skills, memorial: r.memorial,
      })
    }
    if (!into.candidates.length && r.candidates.length) into.candidates = r.candidates
    folded.push({ ref: r.ref, into: into.ref })
    for (const k of keys) if (!byKey.has(k)) byKey.set(k, into)
  }
  return { rows: out, folded }
}

// ── What a believed profile is allowed to write ─────────────────────────────

export interface ContactFill { [column: string]: unknown }

/** Blank fields only, from a profile that has been believed. Never a value
 *  Krish or a better source already set. `existing` is the contact as it is
 *  now; a missing key counts as blank. */
export function fillBlanks(existing: Record<string, unknown>, row: MetaRow, slug: string | null): ContactFill {
  const blank = (k: string) => {
    const v = existing[k]
    return v === null || v === undefined || (typeof v === 'string' && v.trim() === '')
  }
  const out: ContactFill = {}
  if (slug && blank('linkedin_url')) out.linkedin_url = `https://www.linkedin.com/in/${slug}`
  if (row.role && blank('title')) out.title = row.role
  if (row.company && blank('company')) out.company = row.company
  if (row.location && blank('location')) out.location = row.location
  return out
}

/** The dossier facts a believed profile adds, key by key. A career already on
 *  the record is never replaced: two careers on one person is how a
 *  namesake's job becomes theirs. */
export function factsToAdd(facts: Record<string, unknown> | null | undefined, row: MetaRow): Record<string, unknown> {
  const have = facts && typeof facts === 'object' ? facts : {}
  const add: Record<string, unknown> = {}
  const empty = (k: string) => !Array.isArray(have[k]) || (have[k] as unknown[]).length === 0
  const career = row.career.filter(c => c.title || c.company).slice(0, 12)
  if (career.length && empty('career')) add.career = career.map(c => ({ title: c.title, company: c.company, dates: c.dates }))
  const education = row.education.filter(e => e.school).slice(0, 6)
  if (education.length && empty('education')) {
    add.education = education.map(e => ({ school: e.school, degree: e.degree, field: e.field, period: e.period }))
  }
  if (row.skills.length && empty('skills')) add.skills = row.skills.slice(0, 20)
  if (row.headline && !have.headline) add.headline = row.headline
  return add
}

/** The words Krish sees for each network. */
export const NETWORK_LABEL: Record<MetaNetwork, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  phone_book: 'phone contacts',
}

// ── The writes, decided before anything is written ──────────────────────────
// Pure, so the promise "only additive, and only from a believed profile" is a
// test rather than a hope (tests/api/metaImport.test.ts).

type Rec = Record<string, unknown>

export type LinkDecision = Extract<Decision, { action: 'link' }>
export type CreateDecision = Extract<Decision, { action: 'create' }>

export const believed = (p: ProfileVerdict) => p.kind === 'agrees' || p.kind === 'verified'

export function metaSourceEntry(row: MetaRow, basis: string, importedAt: string): Rec {
  return { type: 'meta_export', ref: row.ref, networks: row.networks, basis, imported_at: importedAt }
}

function withFacts(dossier: unknown, add: Rec): Rec {
  const d = (dossier && typeof dossier === 'object' ? { ...(dossier as Rec) } : {}) as Rec
  const direct = (d._direct && typeof d._direct === 'object' ? { ...(d._direct as Rec) } : {}) as Rec
  const facts = (direct.facts && typeof direct.facts === 'object' ? direct.facts : {}) as Rec
  direct.facts = { ...facts, ...add }
  direct.sources = [...new Set([...(Array.isArray(direct.sources) ? (direct.sources as string[]) : []), 'meta_export_apify'])]
  d._direct = direct
  return d
}

export interface LinkPlan {
  /** Columns to update on contacts. Empty means nothing to write. */
  contact: Rec
  /** Columns to update on contact_intelligence. */
  intelligence: Rec
  /** The believed profile's slug, to record as an identity. */
  slug: string | null
  /** Kept out of proposals until Krish answers. */
  holds: boolean
  /** Which question, if any, to put to Krish. */
  ask: 'profile' | 'memorial' | null
  /** Apify's profile is already on another contact. In this export that has
   *  only ever meant the same person under a decorated LinkedIn name, so it
   *  becomes a "same person?" question rather than nothing. */
  sameAs: string | null
}

/** What linking one Meta person to an existing contact writes. Every value is
 *  a blank filled, a source appended, or an identity added; nothing that is
 *  set is ever replaced. */
export function planLink(
  existing: Rec,
  ci: Rec | null,
  row: MetaRow,
  d: LinkDecision,
  opts: {
    emailTaken: (email: string) => boolean; hasProfile: boolean; importedAt: string
    slugOwner?: (slug: string) => string | undefined
    /** A profile question about this contact exists, open or answered. Its
     *  answer is the only thing that writes a profile from then on. */
    profileAsked?: boolean
  },
): LinkPlan {
  const blank = (o: Rec | null, k: string) => !o || o[k] === null || o[k] === undefined || (typeof o[k] === 'string' && (o[k] as string).trim() === '')
  const contact: Rec = {}
  const sources = Array.isArray(existing.sources) ? (existing.sources as Rec[]) : []
  if (!sources.some(s => s && s.type === 'meta_export' && s.ref === row.ref)) {
    contact.sources = [...sources, metaSourceEntry(row, d.basis, opts.importedAt)]
  }
  const profile = recheck(d.profile, existing, d.contact_id, opts.slugOwner)
  // A name-only link never carries a profile across on its own say-so, and
  // once Krish has been asked about this contact's profile, only his answer
  // writes one: a re-run never writes over a "not them".
  const write = believed(profile) && d.basis !== 'meta_name' && !opts.profileAsked
  const slug = write && profile.kind === 'verified' ? profile.slug : null
  if (write) {
    Object.assign(contact, fillBlanks(existing, row, slug))
    const facts = ((existing.dossier as Rec | null)?._direct as Rec | undefined)?.facts as Rec | undefined
    const add = factsToAdd(facts, row)
    if (Object.keys(add).length) contact.dossier = withFacts(existing.dossier, add)
    const email = usableEmail(row)
    if (email && blank(existing, 'email') && !opts.emailTaken(email)) contact.email = email
    if (row.memorial && existing.status !== 'do_not_contact') contact.status = 'do_not_contact'
  }

  const intelligence: Rec = {}
  if (ci) {
    const list = Array.isArray(ci.source_list) ? (ci.source_list as string[]) : []
    if (!list.includes('meta_export')) {
      // One more network he knows them on, counted once however many of
      // Facebook, Instagram and his phone it spans.
      intelligence.source_list = [...list, 'meta_export']
      intelligence.source_count = list.length + 1
    }
    if (write) {
      if (row.headline && blank(ci, 'headline')) intelligence.headline = row.headline
      if (row.followers !== null && blank(ci, 'followers')) intelligence.followers = row.followers
      // Filling a blank never fires the role-change trigger; replacing a value
      // would, and would announce a job change that did not happen.
      if (row.role && blank(ci, 'current_title')) intelligence.current_title = row.role
      if (row.company && blank(ci, 'current_company')) intelligence.current_company = row.company
      if (blank(ci, 'enriched_at')) {
        intelligence.enriched_at = `${opts.importedAt}T00:00:00Z`
        intelligence.enriched_source = 'apify (meta export)'
      }
    }
  }

  // A contact with a LinkedIn profile on record is not asked which profile is
  // theirs: Krish's own record already answers it.
  let ask: LinkPlan['ask'] = null
  if (write && row.memorial) ask = 'memorial'
  else if (!write && !opts.hasProfile && profile.kind !== 'conflicts' && profile.kind !== 'taken') ask = 'profile'
  const sameAs = profile.kind === 'taken' && profile.owner !== d.contact_id ? profile.owner : null
  return { contact, intelligence, slug, holds: contact.status === 'do_not_contact', ask, sameAs }
}

/** A verdict decided before the run wrote anything can be stale by the time
 *  its row is applied: an earlier row may have put a profile on this contact,
 *  or claimed this profile for someone else. Either way the guess now writes
 *  nothing. One contact never ends up holding two profiles, and one profile
 *  never ends up on two contacts. */
function recheck(p: ProfileVerdict, existing: Rec, contactId: string | null, owner?: (slug: string) => string | undefined): ProfileVerdict {
  if (p.kind !== 'verified') return p
  const onRecord = slugOf(existing.linkedin_url as string | null)
  if (onRecord && onRecord !== p.slug) return { kind: 'conflicts', slug: p.slug, kept: onRecord }
  const held = owner?.(p.slug)
  if (held && held !== contactId) return { kind: 'taken', slug: p.slug, owner: held }
  return p
}

export interface CreatePlan {
  contact: Rec; intelligence: Rec; slug: string | null; holds: boolean; ask: 'profile' | 'memorial' | null
  /** As LinkPlan.sameAs. */
  sameAs: string | null
}

/** A new contact for someone not already here. Profile fields only from a
 *  believed profile; an unconfirmed memorial match is held out of proposals
 *  until Krish answers, because wrongly hiding a friend for a day costs little
 *  and proposing an ask to someone who has died costs a great deal. */
export function planCreate(
  row: MetaRow,
  d: CreateDecision,
  opts: { emailTaken: (email: string) => boolean; importedAt: string; slugOwner?: (slug: string) => string | undefined },
): CreatePlan {
  const name = despace(row.name).trim()
  const parts = name.split(/\s+/)
  const profile = recheck(d.profile, {}, null, opts.slugOwner)
  const ok = believed(profile)
  const slug = ok && profile.kind === 'verified' ? profile.slug : null
  const holds = row.memorial && (ok || profile.kind === 'unverified')
  const email = ok ? usableEmail(row) : null
  const contact: Rec = {
    full_name: name,
    first_name: parts.length > 1 ? parts[0] : null,
    last_name: parts.length > 1 ? parts.slice(1).join(' ') : null,
    sources: [metaSourceEntry(row, 'meta_new', opts.importedAt)],
    origin_channel: 'meta_export',
    consent_tier: 'cold_engaged',
    triage_status: 'pending',
    enrichment_status: ok ? 'enriched' : 'none',
    status: holds ? 'do_not_contact' : 'active',
    ...(ok ? fillBlanks({}, row, slug) : {}),
    ...(email && !opts.emailTaken(email) ? { email } : {}),
  }
  if (ok) {
    const add = factsToAdd({}, row)
    if (Object.keys(add).length) contact.dossier = withFacts(null, add)
  }
  const toks = (normName(name) || '').split(' ').filter(t => t.length >= 2)
  const intelligence: Rec = {
    network_tier: '4_owned_network',
    intel_method: 'pending',
    confidence: 'low',
    is_person: d.is_person,
    name_quality: toks.length >= 2 ? 'full' : 'partial',
    source_count: 1,
    source_list: ['meta_export'],
    reachable_via: [],
    ...(ok ? {
      headline: row.headline, followers: row.followers, current_title: row.role, current_company: row.company,
      enriched_at: `${opts.importedAt}T00:00:00Z`, enriched_source: 'apify (meta export)',
    } : {}),
  }
  const ask: CreatePlan['ask'] = ok ? (row.memorial ? 'memorial' : null) : profile.kind === 'taken' ? null : 'profile'
  const sameAs = profile.kind === 'taken' ? profile.owner : null
  return { contact, intelligence, slug, holds, ask, sameAs }
}
