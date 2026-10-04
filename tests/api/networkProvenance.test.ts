import assert from 'node:assert/strict'
import { test } from 'node:test'
import { contactProvenance } from '../../src/lib/contactProvenance.ts'
import { resolveReach, linkedinSearchHref } from '../../src/lib/networkReach.ts'
import { knownFrom, knownFromWords } from '../../src/lib/knownFrom.ts'
import { sharedHistoryLine } from '../../src/lib/sharedHistory.ts'

// The two promises the Network tab now has to keep for every person in it:
// "I can tell where I know them from" and "one click to their LinkedIn". Both
// are pure functions, and both have a failure mode that is worse than being
// wrong — being confidently, plausibly wrong about a real named person Krish is
// about to message. These tests are aimed at that.

// ── Where do I know them from ───────────────────────────────────────────────

test('a named room beats the pipeline that loaded it', () => {
  const p = contactProvenance({ origin_channel: 'community', origin_campaign: 'ai_circle' })
  assert.equal(p.label, 'AI Circle')
  assert.equal(p.known, true)
})

test('the Cannes enrichment blob never reaches the screen', () => {
  // Measured verbatim from the corpus: 639 event_cannes rows carry this shape
  // in first_met_context. Printing it under someone's name is what this whole
  // helper exists to stop.
  const blob = '✓ MX verified — domain accepts email. Pattern guess; recommend NeverBounce or single-send delivery test before bulk send. | Why fit (Master rationale): Creative agency founder with demonstrated thought leadership'
  const p = contactProvenance({
    origin_channel: 'event_cannes', origin_campaign: 'Cannes 2026', first_met_context: blob,
  })
  assert.equal(p.label, 'Cannes 2026')
  assert.equal(p.detail, null)
})

test('a short human note is kept, because that is the memory cue', () => {
  const p = contactProvenance({
    origin_channel: 'network_intelligence', first_met_context: 'connected 2010-09-28',
  })
  assert.equal(p.label, 'LinkedIn network')
  assert.equal(p.detail, 'connected 2010-09-28')
})

test('a bare URL is a link, not a memory', () => {
  const p = contactProvenance({
    origin_channel: 'crm', first_met_context: 'https://www.svquad.com/kanwal-rekhi',
  })
  assert.equal(p.detail, null)
})

test('an unknown channel becomes words rather than disappearing', () => {
  const p = contactProvenance({ origin_channel: 'some_future_importer' })
  assert.equal(p.label, 'Some future importer')
  assert.equal(p.known, true)
})

test('knowing nothing is stated, never invented', () => {
  const p = contactProvenance({})
  assert.equal(p.label, 'Unknown source')
  assert.equal(p.known, false)
})

test('a campaign echoed into first_met_context is not printed twice', () => {
  const p = contactProvenance({
    origin_channel: 'apollo', origin_campaign: 'Pavilion GTM Dinner', first_met_context: 'Pavilion GTM Dinner',
  })
  assert.equal(p.label, 'Pavilion GTM Dinner')
  assert.equal(p.detail, null)
})

// ── One click to LinkedIn ───────────────────────────────────────────────────

test('a real profile is the LinkedIn route, and the fallback does not appear', () => {
  const r = resolveReach({
    full_name: 'Ada Lovelace', company: 'Analytical', linkedin_url: 'https://www.linkedin.com/in/ada',
  })
  assert.equal(r.linkedin?.channel, 'linkedin_dm')
  assert.equal(r.linkedin?.speculative, undefined)
  assert.equal(r.options.some(o => o.channel === 'linkedin_search'), false)
})

test('no profile still yields a LinkedIn button, marked as a search', () => {
  const r = resolveReach({ full_name: 'Ada Lovelace', company: 'Analytical Engines' })
  assert.equal(r.linkedin?.channel, 'linkedin_search')
  assert.equal(r.linkedin?.speculative, true)
  assert.match(r.linkedin!.href, /linkedin\.com\/search\/results\/people/)
  assert.match(r.linkedin!.href, /Ada%20Lovelace%20Analytical%20Engines/)
})

test('the search fallback is never the primary action and never counts as contact details', () => {
  const r = resolveReach({ full_name: 'Ada Lovelace', best_channel: 'phone' })
  // `best` is what goes under the thumb. A guess at who someone might be is not
  // that, even when it is the only thing on the row.
  assert.equal(r.best, null)
  assert.equal(r.linkedin?.channel, 'linkedin_search')
  // And the reason there is nothing to act on is still stated — the fallback
  // must not quietly absorb the "we think phone, we hold no number" note.
  assert.match(r.note!, /no address for it is recorded/)
})

test('a person with no name at all gets no fabricated search', () => {
  // A keywordless people-search is a link to nothing — the exact dead button
  // this module refuses to render.
  assert.equal(linkedinSearchHref(null, null), null)
  const r = resolveReach({ full_name: null, company: null })
  assert.equal(r.linkedin, null)
  assert.equal(r.options.length, 0)
})

test('a guessed address is offered but labelled, and only when nothing is verified', () => {
  const guessOnly = resolveReach({ full_name: 'Ada', guessed_email: 'ada@analytical.com' })
  const email = guessOnly.options.find(o => o.channel === 'email')
  assert.equal(email?.address, 'ada@analytical.com')
  assert.equal(email?.unverified, true)

  // A confirmed address is never displaced by a guess, and the guess does not
  // ride along beside it as a second, worse option.
  const both = resolveReach({ full_name: 'Ada', email: 'ada@real.com', guessed_email: 'ada@analytical.com' })
  const emails = both.options.filter(o => o.channel === 'email')
  assert.equal(emails.length, 1)
  assert.equal(emails[0].address, 'ada@real.com')
  assert.equal(emails[0].unverified, undefined)
})

test('a search fallback is not contact details, and the note says so', () => {
  // 368 people are recorded best-reached by phone with no phone column in the
  // database. Adding a LinkedIn search for them must not make that read as
  // "we can reach this person".
  const withRecommendation = resolveReach({ full_name: 'Ada', company: 'X', best_channel: 'phone' })
  assert.equal(withRecommendation.best, null)
  assert.match(withRecommendation.note!, /Phone/)

  // And with no recommendation either, the blunt version.
  const bare = resolveReach({ full_name: 'Ada', company: 'X' })
  assert.equal(bare.best, null)
  assert.equal(bare.options.length, 1)
  assert.equal(bare.note, 'No contact details on file for this person.')
})

test('a reachable person whose recommended channel has no address is told which', () => {
  const r = resolveReach({ full_name: 'Ada', email: 'a@b.com', best_channel: 'phone' })
  assert.equal(r.best?.channel, 'email')
  assert.match(r.note!, /no number is recorded/)
})

test('a pipeline run identifier never passes as a room', () => {
  // 8,297 people — 77% of the network — carry this campaign. It is the id of an
  // import run, and printing it under their names would make the provenance
  // chip worse than useless on three quarters of the tab.
  const p = contactProvenance({
    origin_channel: 'network_intelligence',
    origin_campaign: 'network_intelligence_2026_08',
    first_met_context: 'connected 2024-05-24',
  })
  assert.equal(p.label, 'LinkedIn network')
  assert.equal(p.detail, 'connected 2024-05-24')
})

test('a room a person typed still wins, underscores or not', () => {
  assert.equal(contactProvenance({ origin_channel: 'event_cannes', origin_campaign: 'Cannes 2026 Outreach' }).label, 'Cannes 2026 Outreach')
  assert.equal(contactProvenance({ origin_channel: 'feedback', origin_campaign: 'Feedback 30 Final' }).label, 'Feedback 30 Final')
  // A slug we have explicitly taught it the meaning of.
  assert.equal(contactProvenance({ origin_channel: 'podcast_guest', origin_campaign: 'podcast_signal_noise' }).label, 'Signal & Noise')
})

test('a campaign too long for a chip is trimmed, not wrapped', () => {
  const p = contactProvenance({
    origin_channel: 'cold_outbound',
    origin_campaign: 'Mindmaker — Leaders — Make Your Nervous Decision',
  })
  assert.ok(p.label.length <= 30, p.label)
  assert.match(p.label, /…$/)
})

test('a guessed address never outranks a profile we actually hold', () => {
  // Email is the preferred channel and a guess is still an email, so without an
  // explicit certainty rule the guess becomes the highlighted primary button —
  // the one tapped without reading the label.
  const r = resolveReach({
    full_name: 'Ada', company: 'Analytical',
    linkedin_url: 'https://www.linkedin.com/in/ada',
    guessed_email: 'ada@analytical.com',
  })
  assert.equal(r.best?.channel, 'linkedin_dm')
  assert.equal(r.options[1].channel, 'email')
  assert.equal(r.options[1].unverified, true)
})

test('but a VERIFIED address still outranks the profile, as it always did', () => {
  const r = resolveReach({
    full_name: 'Ada', email: 'ada@real.com', linkedin_url: 'https://www.linkedin.com/in/ada',
  })
  assert.equal(r.best?.channel, 'email')
  assert.equal(r.linkedin?.channel, 'linkedin_dm')
})

// ── Where he knows them from, when the channel is only a pipeline ──────────


test('a phone or Instagram contact is no longer called "LinkedIn network"', () => {
  // 1,830 phone contacts and 460 Instagram ones printed "LinkedIn network",
  // because the chip read the pipeline's name and never the sources.
  const keys = knownFrom([{ type: 'network_intelligence', source: 'phone_address_book' }])
  const p = contactProvenance({ origin_channel: 'network_intelligence', known_from: keys })
  assert.equal(p.label, 'Your phone')
  const ig = contactProvenance({
    origin_channel: 'network_intelligence',
    known_from: knownFrom([{ type: 'network_intelligence', source: 'instagram_export' }, { type: 'network_intelligence', source: 'linkedin_export' }]),
  })
  assert.equal(ig.label, 'Instagram · LinkedIn')
})

test('a named room still beats the networks', () => {
  const p = contactProvenance({ origin_channel: 'community', origin_campaign: 'ai_circle', known_from: ['facebook'] })
  assert.equal(p.label, 'AI Circle')
})

test('the Meta export and its identities read as the networks they came from', () => {
  const keys = knownFrom([{ type: 'meta_export', ref: 'C9001', networks: ['facebook', 'phone_book'] }], ['instagram'])
  assert.deepEqual(keys, ['facebook', 'instagram', 'phone'])
  assert.equal(knownFromWords(keys), 'Facebook, Instagram and your phone')
})

test('a school says "the same years" only when both sides say so', () => {
  const school = { key: 'sutton_grammar', label: 'Sutton Grammar School', closeness: 'close' as const, their_title: null, current: false, kind: 'school' as const }
  assert.equal(sharedHistoryLine([{ ...school, same_years: true }]), 'Went to Sutton Grammar School in the same years as you.')
  assert.equal(sharedHistoryLine([{ ...school, same_years: false }]), 'Also went to Sutton Grammar School.')
  // A close employer still leads: it is the stronger professional thread.
  const nine = { key: 'nine', label: 'Nine', closeness: 'close' as const, their_title: 'Producer', current: false, kind: 'employer' as const }
  assert.equal(sharedHistoryLine([{ ...school, same_years: true }, nine]), 'Also at Nine, as Producer and 1 more of yours.')
  // Rows written before schools existed have no kind and still read as employers.
  assert.equal(sharedHistoryLine([{ key: 'nine', label: 'Nine', closeness: 'close', their_title: null, current: true }]), 'Now at Nine, where you worked.')
})
