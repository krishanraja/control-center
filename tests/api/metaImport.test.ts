import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  decide, collapseRows, verifyProfile, yearsOverlap, usableEmail, fillBlanks, factsToAdd, planLink, planCreate,
  despace, normName, bareName, isKrish, isIdentifyingName, looksLikeAnOrganisation, namesAgree, slugOf,
  type MetaRow, type MetaIndex, type KnownContact, type LinkDecision, type CreateDecision,
} from '../../api/_metaImport.ts'

// The Meta export is older than anything else in the network, and Apify's
// guesses on it are a Google search. Krish, 2026-10-04: "it's imperative that
// this is only additive", and "your judgement on what is actually additive" is
// paramount. These tests hold the two promises that follow from that:
//
//   1. A guessed profile writes nothing unless something independent agrees.
//   2. Nothing that is already set is ever replaced.
//
// Every name here is invented.

// The patterns as migration 20261004050000 seeds them, with Krish's years.
const TENURE_SCHOOLS = [
  { re: /^sutton grammar/i, close: true, from: 2004, to: 2005 },
  { re: /^((the )?(victoria )?university of manchester(?! institute of science)|manchester university|(alliance )?manchester business school)/i, close: false, from: 2005, to: 2008 },
]
const TENURE_CLOSE = [/^captify/i, /^(nine( entertainment( co\.?| company)?| network( australia)?| digital| publishing| radio)?|mi9.*|ninemsn.*|cudo \(ninemsn.*)$/i]

function row(over: Partial<MetaRow> = {}): MetaRow {
  return {
    ref: 'C9001', name: 'Orla Fenwick-Price', networks: ['facebook'], linkedin: null,
    headline: null, role: null, company: null, location: null, followers: null,
    emails: [], education: [], career: [], skills: [], memorial: false, candidates: [],
    ...over,
  }
}

function contact(over: Partial<KnownContact> & { id: string }): KnownContact {
  return { name: null, slug: null, email: null, sources: [], meta_refs: [], is_self: false, ...over }
}

function index(contacts: KnownContact[], connections: Record<string, string> = {}): MetaIndex {
  const idx: MetaIndex = {
    byId: new Map(), bySlug: new Map(), byEmail: new Map(), byName: new Map(), byFirst: new Map(), byRef: new Map(),
    connections: new Map(Object.entries(connections)), schools: TENURE_SCHOOLS, closeEmployers: TENURE_CLOSE,
  }
  for (const c of contacts) {
    idx.byId.set(c.id, c)
    if (c.slug) idx.bySlug.set(c.slug, c.id)
    if (c.email) idx.byEmail.set(c.email, c.id)
    for (const r of c.meta_refs) idx.byRef.set(r.ref, { id: c.id, basis: r.basis })
    const n = normName(c.name)
    if (n) idx.byName.set(n, [...(idx.byName.get(n) || []), c.id])
    if (n && n.includes(' ') && !c.is_self) idx.byFirst.set(n.split(' ')[0], [...(idx.byFirst.get(n.split(' ')[0]) || []), c.id])
  }
  return idx
}

const GUESS = 'https://www.linkedin.com/in/orla-fenwick-price-4b1c9a/'

// ── Believing a profile ─────────────────────────────────────────────────────

test('a guessed profile with nothing behind it is a question, not a fact', () => {
  const d = decide(row({ linkedin: GUESS, role: 'Chief Revenue Officer', company: 'Glasshouse Media' }), index([]))
  assert.equal(d.action, 'create')
  assert.equal(d.action === 'create' && d.profile.kind, 'unverified')
  const plan = planCreate(row({ linkedin: GUESS, role: 'Chief Revenue Officer', company: 'Glasshouse Media', emails: [{ email: 'orla@glasshouse.example.org', status: 'valid', catch_all: false }] }), d as CreateDecision, { emailTaken: () => false, importedAt: '2026-10-04' })
  // Not one profile field reaches the record.
  for (const k of ['linkedin_url', 'title', 'company', 'location', 'email', 'dossier']) {
    assert.equal(k in plan.contact, false, `${k} must not be written from an unverified guess`)
  }
  for (const k of ['headline', 'current_title', 'current_company', 'enriched_at', 'followers']) {
    assert.equal(k in plan.intelligence, false, `${k} must not be written from an unverified guess`)
  }
  assert.equal(plan.ask, 'profile')
})

test('a profile is believed for a school or a close employer, never for a wide one', () => {
  const idx = index([])
  const slug = slugOf(GUESS)!
  assert.equal(verifyProfile(row({ education: [{ school: 'Sutton Grammar School for Boys', degree: null, field: null, period: '1999 - 2006' }] }), slug, idx).kind, 'verified')
  assert.equal(verifyProfile(row({ career: [{ title: 'Analyst', company: 'Captify Technologies', dates: '2 yrs' }] }), slug, idx).kind, 'verified')
  // The BBC was the one miss in 29: a wide employer says nothing about who.
  assert.equal(verifyProfile(row({ career: [{ title: 'Producer', company: 'BBC Studios', dates: '4 yrs' }] }), slug, idx).kind, 'unverified')
  // A different university in the same city is not his.
  assert.equal(verifyProfile(row({ education: [{ school: 'Manchester Metropolitan University', degree: null, field: null, period: null }] }), slug, idx).kind, 'unverified')
  // A large university confirms only where the years overlap his: thousands
  // of people share a name with someone who went there at some point.
  assert.equal(verifyProfile(row({ education: [{ school: 'The University of Manchester', degree: null, field: null, period: '2006 - 2009' }] }), slug, idx).kind, 'verified')
  assert.equal(verifyProfile(row({ education: [{ school: 'The University of Manchester', degree: null, field: null, period: '2012 - 2015' }] }), slug, idx).kind, 'unverified')
  assert.equal(verifyProfile(row({ education: [{ school: 'The University of Manchester', degree: null, field: null, period: null }] }), slug, idx).kind, 'unverified')
  // "Group Nine Media" is not Nine.
  assert.equal(verifyProfile(row({ career: [{ title: 'VP', company: 'Group Nine Media', dates: null }] }), slug, idx).kind, 'unverified')
})

test("Krish's own connection confirms a profile only when the names agree", () => {
  const slug = slugOf(GUESS)!
  assert.equal(verifyProfile(row(), slug, index([], { [slug]: 'Orla Fenwick-Price' })).kind, 'verified')
  // Apify landed on one of his connections, but a different person.
  assert.equal(verifyProfile(row(), slug, index([], { [slug]: 'Declan Ashworth' })).kind, 'unverified')
})

test('a catch-all or risky address is never written', () => {
  assert.equal(usableEmail(row({ emails: [{ email: 'o@x.example.org', status: 'risky', catch_all: false }] })), null)
  assert.equal(usableEmail(row({ emails: [{ email: 'o@x.example.org', status: 'valid', catch_all: true }] })), null)
  assert.equal(usableEmail(row({ emails: [{ email: 'O@X.example.org ', status: 'valid', catch_all: false }] })), 'o@x.example.org')
})

// ── Who they are ────────────────────────────────────────────────────────────

test('the same guessed profile and an agreeing name is the contact already here', () => {
  const idx = index([contact({ id: 'a1', name: 'Orla Fenwick-Price', slug: slugOf(GUESS) })])
  const d = decide(row({ linkedin: GUESS }), idx)
  assert.equal(d.action, 'link')
  assert.equal(d.action === 'link' && d.basis, 'meta_slug')
  assert.equal(d.action === 'link' && d.profile.kind, 'agrees')
})

test('a guessed profile that belongs to someone with another name links nobody, and asks', () => {
  const idx = index([contact({ id: 'a1', name: 'Declan Ashworth', slug: slugOf(GUESS) })])
  const d = decide(row({ linkedin: GUESS }), idx)
  assert.equal(d.action, 'create')
  assert.equal(d.action === 'create' && d.profile.kind, 'taken')
  const plan = planCreate(row({ linkedin: GUESS, role: 'CEO' }), d as CreateDecision, { emailTaken: () => false, importedAt: '2026-10-04' })
  assert.equal(plan.contact.title, undefined)
  assert.equal(plan.ask, null, 'the profile is not asked about: it is already someone else\'s')
  // But in the real export a taken profile only ever meant the same person
  // under a decorated LinkedIn name, so it becomes a "same person?" question.
  assert.equal(plan.sameAs, 'a1')
})

test("LinkedIn's decorations do not hide that two names are one person", () => {
  assert.equal(bareName('Orla Fenwick-Price - MBA'), 'orla fenwick price')
  assert.equal(bareName('Orla Fenwick-Price (Byron)'), 'orla fenwick price')
  assert.equal(bareName('Orla Fenwick-Price (FCCA, ATT, CMgr, BSc Hons)'), 'orla fenwick price')
  assert.equal(bareName('Orla Price MIET'), 'orla price')
  // A two-word name keeps its last word even when it looks like letters.
  assert.equal(bareName('Orla Ma'), 'orla ma')
  for (const n of ['Orla Fenwick-Price - MBA', 'Orla Fenwick-Price (Byron)', 'Orla Fenwick-Price (FCCA, ATT, CMgr, BSc Hons)']) {
    const idx = index([contact({ id: 'li', name: n, slug: slugOf(GUESS), sources: ['linkedin_export'] })])
    const d = decide(row({ linkedin: GUESS }), idx)
    assert.equal(d.action === 'link' && d.basis, 'meta_slug', n)
  }
})

test('the same name read again from the same network is the same entry', () => {
  const idx = index([
    contact({ id: 'ig', name: 'Orla Fenwick-Price', sources: ['instagram_export'] }),
    contact({ id: 'li', name: 'Orla Fenwick-Price', sources: ['linkedin_export'], slug: 'orla-fp' }),
  ])
  const d = decide(row({ networks: ['instagram'] }), idx)
  assert.equal(d.action === 'link' && d.contact_id, 'ig')
  assert.equal(d.action === 'link' && d.basis, 'meta_source')
})

test('a unique name links to someone he knows first-hand, marked as resting on a name', () => {
  const idx = index([contact({ id: 'li', name: 'Orla Fenwick-Price', sources: ['linkedin_export'], slug: 'orla-fp' })])
  const d = decide(row(), idx)
  assert.equal(d.action, 'link')
  assert.equal(d.action === 'link' && d.basis, 'meta_name')
  assert.equal(d.action === 'link' && d.verified, false)
})

test('a name shared with a roster entry or with two people is a question, not a link', () => {
  const roster = index([contact({ id: 'r', name: 'Orla Fenwick-Price', sources: ['circle_roster'] })])
  const d1 = decide(row(), roster)
  assert.equal(d1.action, 'create')
  assert.deepEqual(d1.action === 'create' && d1.maybe_same_as, ['r'])

  const two = index([
    contact({ id: 'x', name: 'Orla Fenwick-Price', sources: ['linkedin_export'] }),
    contact({ id: 'y', name: 'Orla Fenwick-Price', sources: ['gmail_krish_mindmaker'] }),
  ])
  const d2 = decide(row(), two)
  assert.equal(d2.action, 'create')
  assert.deepEqual(d2.action === 'create' && [...d2.maybe_same_as].sort(), ['x', 'y'])
})

test('a near name is asked about, never linked', () => {
  // A middle name on either side, or a hyphenated surname read in part.
  const idx = index([contact({ id: 'li', name: 'Orla Price', sources: ['linkedin_export'] })])
  const d = decide(row({ name: 'Orla Jane Price' }), idx)
  assert.equal(d.action, 'create')
  assert.deepEqual(d.action === 'create' && d.maybe_same_as, ['li'])
  const back = index([contact({ id: 'li', name: 'Orla Jane Price', sources: ['phone_address_book'] })])
  const d2 = decide(row({ name: 'Orla Price' }), back)
  assert.deepEqual(d2.action === 'create' && d2.maybe_same_as, ['li'])
  // Two pages that share a first and last word are not the same anything.
  const orgs = index([contact({ id: 'o', name: 'The Copper Kettle Project', sources: ['instagram_export'] })])
  const d3 = decide(row({ name: 'The Harbour Light Project' }), orgs)
  assert.deepEqual(d3.action === 'create' && d3.maybe_same_as, [])
})

test('a one-word name never links on the name', () => {
  const idx = index([contact({ id: 'li', name: 'Saffron', sources: ['linkedin_export'] })])
  const d = decide(row({ name: 'Saffron' }), idx)
  assert.equal(d.action, 'create')
  assert.deepEqual(d.action === 'create' && d.maybe_same_as, [])
})

test("Krish's own rows are never a match, and his own entry is skipped", () => {
  const idx = index([contact({ id: 'me', name: 'Orla Fenwick-Price', sources: ['linkedin_export'], is_self: true })])
  assert.equal(decide(row(), idx).action, 'create')
  assert.equal(decide(row({ name: 'Krish UK 2026' }), idx).action, 'skip')
  assert.equal(isKrish('Krish Raja'), true)
  assert.equal(isKrish('Krish Okonkwo'), false)
})

test('a second run finds the people the first run made', () => {
  const idx = index([contact({ id: 'made', name: 'Orla Fenwick-Price', meta_refs: [{ ref: 'C9001', basis: 'meta_new' }], sources: ['meta_export'] })])
  const d = decide(row(), idx)
  assert.equal(d.action === 'link' && d.basis, 'meta_ref')
})

test('a second run never promotes a name-only link, nor writes over a profile question', () => {
  const r = row({ linkedin: GUESS, role: 'CRO', company: 'Glasshouse Media', education: [{ school: 'Sutton Grammar School', degree: null, field: null, period: '1999 - 2006' }] })
  const idx = index([contact({ id: 'ig', name: 'Orla Fenwick-Price', sources: ['instagram_export', 'meta_export'], meta_refs: [{ ref: 'C9001', basis: 'meta_name' }] })])
  const d = decide(r, idx) as LinkDecision
  assert.equal(d.basis, 'meta_name', 'still resting on a name')
  assert.equal(d.verified, false)
  assert.equal(d.profile.kind, 'verified')
  const existing = { sources: [{ type: 'meta_export', ref: 'C9001', basis: 'meta_name' }], status: 'active' }
  const again = planLink(existing, { source_list: ['meta_export'] }, r, d, { emailTaken: () => false, hasProfile: false, importedAt: '2026-10-04' })
  assert.deepEqual(again.contact, {}, 'the second run writes nothing the first did not')

  // A link on firmer ground still writes nothing once Krish has been asked
  // about the profile: his answer is the only thing that writes it.
  const asked = planLink(existing, { source_list: ['meta_export'] }, r, { ...d, basis: 'meta_ref', verified: true },
    { emailTaken: () => false, hasProfile: false, importedAt: '2026-10-04', profileAsked: true })
  assert.deepEqual(asked.contact, {})
  assert.equal(asked.slug, null)
})

test('a second run asks the same-person question about a contact the first run made', () => {
  const idx = index([
    contact({ id: 'made', name: 'Orla Fenwick-Price', meta_refs: [{ ref: 'C9001', basis: 'meta_new' }], sources: ['meta_export'] }),
    contact({ id: 'r', name: 'Orla Fenwick-Price', sources: ['circle_roster'] }),
  ])
  const d = decide(row(), idx) as LinkDecision
  assert.equal(d.basis, 'meta_ref')
  assert.deepEqual(d.maybe_same_as, ['r'])
  // A contact that was here before the import is never newly questioned.
  const before = index([
    contact({ id: 'ig', name: 'Orla Fenwick-Price', meta_refs: [{ ref: 'C9001', basis: 'meta_source' }], sources: ['instagram_export'] }),
    contact({ id: 'r', name: 'Orla Fenwick-Price', sources: ['circle_roster'] }),
  ])
  assert.deepEqual((decide(row(), before) as LinkDecision).maybe_same_as, [])
})

// ── Only additive ───────────────────────────────────────────────────────────

test('a believed profile fills blanks and never replaces a value', () => {
  const existing = { title: 'Board Advisor', company: null, location: '', linkedin_url: null, email: 'orla@own.example.org', sources: [], status: 'active' }
  const r = row({ linkedin: GUESS, role: 'CRO', company: 'Glasshouse Media', location: 'Leeds', career: [{ title: 'CRO', company: 'Captify', dates: '2 yrs' }],
    emails: [{ email: 'other@glasshouse.example.org', status: 'valid', catch_all: false }] })
  const idx = index([contact({ id: 'k', name: 'Orla Fenwick-Price', email: 'orla@own.example.org', sources: ['gmail_krish_mindmaker'] })])
  const d = decide(r, idx) as LinkDecision
  assert.equal(d.basis, 'meta_name')
  // Name-only, so even a believed profile is asked about rather than written.
  const held = planLink(existing, { source_list: ['gmail_krish_mindmaker'] }, r, d, { emailTaken: () => false, hasProfile: false, importedAt: '2026-10-04' })
  assert.deepEqual(Object.keys(held.contact), ['sources'])
  assert.deepEqual(Object.keys(held.intelligence).sort(), ['source_count', 'source_list'])
  assert.equal(held.ask, 'profile')

  // The same profile on a link that rests on an email is written, blanks only.
  const plan = planLink(existing, { current_title: 'Advisor', current_company: null, enriched_at: null, source_list: [] }, r,
    { ...d, basis: 'meta_email', verified: true }, { emailTaken: () => false, hasProfile: false, importedAt: '2026-10-04' })
  assert.equal(plan.contact.title, undefined, 'a title already set is kept')
  assert.equal(plan.contact.company, 'Glasshouse Media')
  assert.equal(plan.contact.location, 'Leeds')
  assert.equal(plan.contact.email, undefined, 'an address already set is kept')
  assert.equal(plan.intelligence.current_title, undefined, 'a current title already set is kept')
  assert.equal(plan.intelligence.current_company, 'Glasshouse Media')
})

test('a career already on the record is never replaced or blended', () => {
  const have = { career: [{ title: 'Partner', company: 'Ashworth & Co', dates: '3 yrs' }] }
  const add = factsToAdd(have, row({ career: [{ title: 'Intern', company: 'Elsewhere', dates: '1 yr' }], education: [{ school: 'Sutton Grammar School', degree: null, field: null, period: '2000 - 2007' }] }))
  assert.equal('career' in add, false)
  assert.equal(Array.isArray(add.education), true)
})

test('fillBlanks treats whitespace as blank and anything else as set', () => {
  const out = fillBlanks({ title: '  ', company: 'Set Ltd' }, row({ role: 'Director', company: 'Other Ltd' }), null)
  assert.equal(out.title, 'Director')
  assert.equal(out.company, undefined)
  assert.equal(out.linkedin_url, undefined, 'no slug, no LinkedIn')
})

test('a memorial match on a new person holds them out of proposals until Krish answers', () => {
  const r = row({ linkedin: GUESS, memorial: true })
  const d = decide(r, index([])) as CreateDecision
  const plan = planCreate(r, d, { emailTaken: () => false, importedAt: '2026-10-04' })
  assert.equal(plan.contact.status, 'do_not_contact')
  assert.equal(plan.holds, true)
  assert.equal(plan.ask, 'profile')
})

// ── Rows that are one person ────────────────────────────────────────────────

test('one person found on Facebook and on Instagram becomes one row with both', () => {
  const { rows, folded } = collapseRows([
    row({ ref: 'C1', name: 'Orla Fenwick-Price', networks: ['facebook'] }),
    row({ ref: 'C2', name: 'Orla Fenwick-Price', networks: ['instagram'], linkedin: GUESS, role: 'CRO' }),
    row({ ref: 'C3', name: 'Saffron', networks: ['facebook'] }),
    row({ ref: 'C4', name: 'Saffron', networks: ['instagram'] }),
  ])
  assert.equal(rows.length, 3, 'two Saffrons stay two: a single word identifies nobody')
  const orla = rows.find(r => r.ref === 'C1')!
  assert.deepEqual(orla.networks.sort(), ['facebook', 'instagram'])
  assert.equal(orla.linkedin, GUESS, 'the enriched row is not thrown away')
  assert.deepEqual(folded, [{ ref: 'C2', into: 'C1' }])
})

test('a shared guessed profile joins two rows only when their names agree', () => {
  const { rows } = collapseRows([
    row({ ref: 'C1', name: 'Orla Fenwick-Price', linkedin: GUESS }),
    row({ ref: 'C2', name: 'Declan Ashworth', linkedin: GUESS }),
  ])
  assert.equal(rows.length, 2)
})

// ── Names ───────────────────────────────────────────────────────────────────

test('names: letter-spaced, organisations, agreement', () => {
  assert.equal(despace('O R L A   F E N W I C K'), 'ORLA FENWICK')
  assert.equal(despace('A K M'), 'A K M')
  assert.equal(looksLikeAnOrganisation('Harbour Chess Club'), true)
  assert.equal(looksLikeAnOrganisation('Orla Fenwick-Price'), false)
  assert.equal(isIdentifyingName('orla.fp_88'), false)
  assert.equal(isIdentifyingName('O F'), false)
  assert.equal(namesAgree('Orla F.', 'Orla Fenwick'), true)
  assert.equal(namesAgree('Orla Fenwick', 'Orla Price'), false)
})

test('years overlap the way academic years do', () => {
  // Krish at Manchester, 2005 to 2008.
  assert.equal(yearsOverlap('2004 - 2008', 2005, 2008), true)
  assert.equal(yearsOverlap('Sep 2005 - Jun 2008', 2005, 2008), true)
  // Touching at an end year is the cohort before or after, not the same one.
  assert.equal(yearsOverlap('2002 - 2005', 2005, 2008), false)
  assert.equal(yearsOverlap('2008 - 2011', 2005, 2008), false)
  // A single year is a graduation year.
  assert.equal(yearsOverlap('2007', 2005, 2008), true)
  assert.equal(yearsOverlap('', 2005, 2008), false)
  assert.equal(yearsOverlap(null, 2005, 2008), false)
})

test('two rows landing on one contact never leave it holding two profiles', () => {
  const r1 = row({ ref: 'C1', linkedin: 'https://www.linkedin.com/in/orla-a/', education: [{ school: 'Sutton Grammar School', degree: null, field: null, period: '1999 - 2006' }], location: 'Leeds' })
  const r2 = row({ ref: 'C2', linkedin: 'https://www.linkedin.com/in/orla-b/', career: [{ title: 'VP', company: 'Captify', dates: '2 yrs' }], location: 'Perth' })
  const d1 = { action: 'link', ref: 'C1', contact_id: 'x', basis: 'meta_email', verified: true, profile: { kind: 'verified', slug: 'orla-a', by: 'school', detail: 'Sutton' }, maybe_same_as: [] } as LinkDecision
  const d2 = { ...d1, ref: 'C2', basis: 'meta_source', profile: { kind: 'verified', slug: 'orla-b', by: 'employer', detail: 'Captify' } } as LinkDecision
  const owners = new Map<string, string>()
  const opts = { emailTaken: () => false, hasProfile: false, importedAt: '2026-10-04', slugOwner: (s: string) => owners.get(s) }

  const first = planLink({ sources: [], status: 'active' }, { source_list: [] }, r1, d1, opts)
  assert.equal(first.slug, 'orla-a')
  owners.set('orla-a', 'x')
  // The second row plans against what the first wrote.
  const after = { sources: first.contact.sources, status: 'active', linkedin_url: first.contact.linkedin_url, location: first.contact.location }
  const second = planLink(after, { source_list: ['meta_export'] }, r2, d2, opts)
  assert.equal(second.slug, null, 'a second, different profile is not recorded')
  assert.equal(second.contact.location, undefined)
  assert.equal(second.contact.linkedin_url, undefined)

  // And a profile already claimed by someone else is never written on a new person.
  const c = planCreate(row({ ref: 'C3', linkedin: 'https://www.linkedin.com/in/orla-a/' }),
    { action: 'create', ref: 'C3', profile: { kind: 'verified', slug: 'orla-a', by: 'school', detail: 'Sutton' }, maybe_same_as: [], is_person: true },
    { emailTaken: () => false, importedAt: '2026-10-04', slugOwner: (s: string) => owners.get(s) })
  assert.equal(c.slug, null)
  assert.equal(c.contact.linkedin_url, undefined)
})
