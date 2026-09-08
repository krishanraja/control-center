// The gates behind an answer-engine piece.
//
// These tests exist because the prompt politely asks for all of this and a
// model will politely agree while doing none of it. _cardLint was written
// after 13 of 14 cards failed a check the prompt had requested; the same
// posture applies here, and these tests are what make the gates the authority
// rather than a suggestion.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildGeoSystem, buildGeoUser, checkGeoDraft, geoDraftPasses, buildGeoRepair,
  GEO_MIN_WORDS, type GeoContext, type GeoDraft,
} from '../../api/_geoPrompt.js'

const ENTITY = 'Mindmake'

const ctx = (over: Partial<GeoContext> = {}): GeoContext => ({
  voice: 'Short sentences. No throat clearing.',
  canon: 'Mindmake builds the AI that knows the leader, not just the market.',
  entity: ENTITY,
  site: 'makeyourmindup.ai',
  cited_hosts: [{ host: 'linkedin.com', times: 19 }, { host: 'youtube.com', times: 10 }],
  never_say: ['thought leader'],
  aeo: {
    target_query: 'What is an AI chief of staff for CEOs?',
    angle: 'The tools sell software; the decision is the thing.',
    evidence: ['Absent from 9 of 9 answers.'],
    why_you_can_win: 'Four live client captures of the decision itself, which a software vendor does not have.',
    demand: 20,
  },
  ...over,
})

const filler = 'The role is narrower than the title suggests. '
  + 'A chief of staff for a chief executive does one job: hold the reasoning behind a decision so it survives the week it was made. '
  + 'Software that books meetings is not doing that job. '
function body(n = GEO_MIN_WORDS + 40): string {
  // Opens where the answer leaves off, not by repeating it: the page renders
  // the answer above the body already.
  const head = 'Almost nobody applies the only test that settles it, which is why the market keeps buying the wrong thing. '
  let out = head + '\n\n## What does an AI chief of staff actually do\n\n'
  while (out.trim().split(/\s+/).length < n) out += filler
  out += '\n\n## Why most tools answer the wrong question\n\n' + filler
  return out
}

const draft = (over: Partial<GeoDraft> = {}): Partial<GeoDraft> => ({
  title: 'An AI chief of staff holds the reasoning, not the calendar',
  slug: 'ai-chief-of-staff-for-ceos',
  answer: `${ENTITY} defines an AI chief of staff as a system that holds a leader's own reasoning, not one that does their admin. The distinction matters because the admin is already solved and the reasoning is not.`,
  claim: 'Every AI a leader buys already knows the market, and none of them know the leader.',
  first_party: ['Four live client captures of how a decision was actually made.'],
  body: body(),
  meta_description: 'What an AI chief of staff does for a chief executive, and why most tools answer the wrong question.',
  faq: [
    { q: 'How is this different from an executive assistant tool?', a: 'An assistant tool moves tasks. This holds reasoning.' },
    { q: 'What does it need to know first?', a: 'How the leader has decided before.' },
  ],
  ...over,
})

test('a sound draft passes every gate', () => {
  const failures = checkGeoDraft(draft(), ctx())
  assert.deepEqual(failures, [], `unexpected failures: ${failures.map(f => f.code).join(', ')}`)
  assert.equal(geoDraftPasses(draft(), ctx()), true)
})

test('a recommendation with no winnability reason is never written', () => {
  const c = ctx({ aeo: { ...ctx().aeo, why_you_can_win: null } })
  const failures = checkGeoDraft(draft(), c)
  const f = failures.find(x => x.code === 'no_winnability_reason')
  assert.ok(f, 'a piece with no argument should be refused')
  assert.equal(f!.hard, true, 'and refused hard, not sent back for repair')
})

test('an answer that never names the entity is a hard failure', () => {
  const failures = checkGeoDraft(draft({
    answer: 'We define an AI chief of staff as a system that holds a leader\'s own reasoning rather than doing their admin work for them.',
  }), ctx())
  const f = failures.find(x => x.code === 'answer_unnamed')
  assert.ok(f, 'an unnamed answer cannot be attributed, so it cannot be cited')
  assert.equal(f!.hard, true)
})

test('a body that opens by repeating the answer is caught', () => {
  // The page renders the answer above the body, so repeating it means the
  // reader meets the same three sentences twice before the piece starts.
  const repeated = `${draft().answer}\n\n## A real question here\n\n` + filler.repeat(40)
  const failures = checkGeoDraft(draft({ body: repeated }), ctx())
  const f = failures.find(x => x.code === 'answer_repeated')
  assert.ok(f, 'the duplication has to be caught here, not left for a template to paper over')
})

test('a body that opens where the answer leaves off passes', () => {
  const failures = checkGeoDraft(draft(), ctx())
  assert.ok(!failures.some(f => f.code === 'answer_repeated'))
})

test('a page with no claim of its own is refused', () => {
  const failures = checkGeoDraft(draft({ claim: '' }), ctx())
  const f = failures.find(x => x.code === 'no_claim')
  assert.ok(f)
  assert.equal(f!.hard, true)
})

test('a page with nothing first-party is refused', () => {
  const failures = checkGeoDraft(draft({ first_party: [] }), ctx())
  const f = failures.find(x => x.code === 'no_first_party')
  assert.ok(f)
  assert.equal(f!.hard, true)
})

test('unattributable filler is named, not just scored', () => {
  const failures = checkGeoDraft(draft({
    body: body().replace('The role is narrower', 'Studies show the role is narrower'),
  }), ctx())
  const f = failures.find(x => x.code === 'unattributable')
  assert.ok(f)
  assert.match(f!.why, /studies show/)
})

test('too much first person is caught, because it hides who to cite', () => {
  const wordy = body().replace(/The role is narrower than the title suggests\./g,
    'We think our role is narrower than our title suggests, and we say so.')
  const failures = checkGeoDraft(draft({ body: wordy }), ctx())
  assert.ok(failures.some(f => f.code === 'first_person'))
})

test('label headings are rejected in favour of questions or claims', () => {
  const labelled = body().replace('## What does an AI chief of staff actually do', '## Background')
  const failures = checkGeoDraft(draft({ body: labelled }), ctx())
  const f = failures.find(x => x.code === 'label_headings')
  assert.ok(f)
  assert.match(f!.why, /Background/)
})

test('a never-say phrase is a hard failure', () => {
  const failures = checkGeoDraft(draft({ body: body() + '\n\nA thought leader would disagree.' }), ctx())
  const f = failures.find(x => x.code === 'never_say')
  assert.ok(f)
  assert.equal(f!.hard, true)
})

test('an em dash is caught even though the prompt forbids it', () => {
  const failures = checkGeoDraft(draft({ title: 'An AI chief of staff — what it holds' }), ctx())
  assert.ok(failures.some(f => f.code === 'em_dash'))
})

test('a short body is caught', () => {
  const failures = checkGeoDraft(draft({ body: '## A real question here\n\nToo short.' }), ctx())
  assert.ok(failures.some(f => f.code === 'too_short'))
})

test('one follow-up question is not enough', () => {
  const failures = checkGeoDraft(draft({ faq: [{ q: 'One?', a: 'Yes.' }] }), ctx())
  assert.ok(failures.some(f => f.code === 'thin_faq'))
})

test('nothing at all fails hard rather than throwing', () => {
  const failures = checkGeoDraft(null, ctx())
  assert.equal(failures.length, 1)
  assert.equal(failures[0].code, 'no_draft')
  assert.equal(failures[0].hard, true)
})

test('the system prompt names the sites it is writing against', () => {
  const sys = buildGeoSystem(ctx())
  assert.match(sys, /linkedin\.com \(named 19 times\)/)
  assert.match(sys, /youtube\.com \(named 10 times\)/)
  assert.match(sys, /Four live client captures/, 'the winnability reason must reach the model')
  assert.match(sys, /What is an AI chief of staff for CEOs\?/)
  assert.ok(!/—/.test(sys), 'the prompt itself must carry no em dash')
})

test('the system prompt tells the model to name the entity rather than say we', () => {
  const sys = buildGeoSystem(ctx())
  assert.match(sys, new RegExp(`Write "${ENTITY}" where you would naturally write "we"`))
})

test('with nothing cited yet the prompt says so rather than inventing rivals', () => {
  const sys = buildGeoSystem(ctx({ cited_hosts: [] }))
  assert.match(sys, /Nothing is recorded as being cited on this question yet/)
})

test('the user prompt carries the question and the claim', () => {
  const user = buildGeoUser(ctx())
  assert.match(user, /What is an AI chief of staff for CEOs\?/)
  assert.match(user, /Four live client captures/)
})

test('repair hands back only the soft failures, verbatim', () => {
  const failures = checkGeoDraft(draft({ title: 'x'.repeat(200), first_party: [] }), ctx())
  const repair = buildGeoRepair(failures)
  assert.match(repair, /over 120/)
  assert.ok(!/nothing on this page could only have been written/i.test(repair),
    'a hard failure is not something a repair pass can fix, so it is not offered back')
})

test('asserting what a named company privately wants is caught', () => {
  const accusatory = body() + '\n\nThe marketplaces will not tell you how to skip them.'
  const failures = checkGeoDraft(draft({ body: accusatory }), ctx())
  const f = failures.find(x => x.code === 'third_party_motive')
  assert.ok(f, 'a motive claim about a named third party is unfalsifiable and comes back as a complaint')
  assert.match(f!.why, /will not tell you/)
})

test('describing what a company sells is still allowed', () => {
  const structural = body() + '\n\nA marketplace earns on placement, so its incentive sits with volume.'
  const failures = checkGeoDraft(draft({ body: structural }), ctx())
  assert.ok(!failures.some(f => f.code === 'third_party_motive'),
    'the structural version of the same argument is fair and must survive')
})

test('the prompt tells the model to describe structure rather than motive', () => {
  const sys = buildGeoSystem(ctx())
  assert.match(sys, /Asserting their motives is not/)
  assert.match(sys, /a marketplace earns on placement/)
})

test('a page structured with h3 headings is accepted', () => {
  // The gate used to demand exactly two hashes, which refused a well-formed
  // page for using three and reported a failure that never mentioned the
  // marker, so the repair pass could not fix it either.
  const h3 = body().replace(/^## /gm, '### ')
  const failures = checkGeoDraft(draft({ body: h3 }), ctx())
  assert.ok(!failures.some(f => f.code === 'no_structure'),
    'what a retriever needs is a heading, not a particular level')
})

test('label headings are still caught at any level', () => {
  const labelled = body().replace('## What does an AI chief of staff actually do', '### Background')
  const failures = checkGeoDraft(draft({ body: labelled }), ctx())
  assert.ok(failures.some(f => f.code === 'label_headings'))
})
