import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkLinkedIn, classifyEmail, bestOf, gateContact } from '../../api/_ingestGate.ts'

// The fixtures are real rows from the consolidated Apollo export that prompted
// this module. Every "wrong" case below is a URL that file actually carried on
// that person's row, and the name it actually belongs to.

test('a slug that shares a name token is accepted', () => {
  assert.equal(checkLinkedIn('Jessica Triffitt', 'http://www.linkedin.com/in/jess-triffitt').verdict, 'verified')
  assert.equal(checkLinkedIn('Dave Rosner', 'https://www.linkedin.com/in/dave-rosner').verdict, 'verified')
})

test("LinkedIn's disambiguating hex tail does not disqualify a real profile", () => {
  // Profiles collide, so real slugs carry a suffix. Rejecting these would throw
  // away a large share of legitimate URLs.
  assert.equal(checkLinkedIn('Clare Nordstrom', 'https://www.linkedin.com/in/clare-nordstrom-0ba40278').verdict, 'verified')
  assert.equal(checkLinkedIn('Bindi Saikia', 'https://linkedin.com/in/bindi-saikia-73b346b').verdict, 'verified')
})

test('a surname run together in a handle is still that surname', () => {
  assert.equal(checkLinkedIn('Michael Beebe', 'https://www.linkedin.com/in/mjbeebe').verdict, 'verified')
  assert.equal(checkLinkedIn('Larry Linietsky', 'https://www.linkedin.com/in/linietsky').verdict, 'verified')
})

test('the rows that would have poisoned the network are refused', () => {
  // Each of these is verbatim from the file. The slug is another named row's.
  for (const [name, url] of [
    ['Madison Benveniste', 'https://www.linkedin.com/in/cally-baute-780581b'],
    ['Crystal Gillette',   'https://www.linkedin.com/in/nyssa-miccio-24b62336'],
    ['Scott Henkle',       'https://www.linkedin.com/in/david-doolittle-b138471'],
    ['Martin Knell',       'https://www.linkedin.com/in/susan-r-jacobs'],
  ] as const) {
    const v = checkLinkedIn(name, url)
    assert.equal(v.verdict, 'unverifiable', `${name} should not be verified against ${url}`)
  }
})

test('a legitimate vanity handle is refused too, and that is the correct trade', () => {
  // adgirl1075 really is Melissa Gordon. There is no signal that separates it
  // from a shifted column, so it loses — she keeps the search fallback, which
  // works. Accepting it would mean accepting the four rows above.
  assert.equal(checkLinkedIn('Melissa Gordon', 'https://www.linkedin.com/in/adgirl1075').verdict, 'unverifiable')
})

test('a company page or a junk URL is malformed, not merely unverified', () => {
  assert.equal(checkLinkedIn('X Co', 'https://www.linkedin.com/company/ontrack-careers/').verdict, 'malformed')
  assert.equal(checkLinkedIn('Someone', 'https://www.linkedin.com/me').verdict, 'malformed')
  assert.equal(checkLinkedIn('Someone', '').verdict, 'malformed')
})

test('the canonical form is what gets written, whatever spelling arrived', () => {
  for (const u of [
    'http://linkedin.com/in/marenza', 'https://Linkedin.com/in/marenza',
    'https://www.linkedin.com/m/profile/in/marenza', 'linkedin.com/in/marenza/',
  ]) assert.equal(checkLinkedIn('Marenza Altieri-Douglas', u).url, 'https://www.linkedin.com/in/marenza')
})

test('a guessed address never reaches the sendable column', () => {
  assert.deepEqual(classifyEmail('ada@analytical.com', 'inferred'),
    { verified: null, guessed: 'ada@analytical.com' })
  assert.deepEqual(classifyEmail('ada@analytical.com', 'roster'),
    { verified: 'ada@analytical.com', guessed: null })
})

test('a worse source never overwrites a better one', () => {
  assert.equal(bestOf({ value: 'CMO', source: 'read_profile' }, { value: 'Marketing', source: 'lead_file' }), 'CMO')
  assert.equal(bestOf({ value: 'Marketing', source: 'lead_file' }, { value: 'CMO', source: 'read_profile' }), 'CMO')
  // Equal evidence: what is already stored wins. Churn on a tie is noise.
  assert.equal(bestOf({ value: 'A', source: 'roster' }, { value: 'B', source: 'roster' }), 'A')
  // A gap is always worth filling.
  assert.equal(bestOf({ value: null, source: 'read_profile' }, { value: 'B', source: 'inferred' }), 'B')
  assert.equal(bestOf({ value: 'A', source: 'inferred' }, { value: null, source: 'read_profile' }), 'A')
})

test('the gate applies every rule at once, and says what it refused', () => {
  const { patch, rejected } = gateContact(
    { full_name: 'Madison Benveniste', linkedin_url: null, email_normalized: null, company: 'Audacy' },
    { full_name: 'Madison Benveniste', linkedin_url: 'https://www.linkedin.com/in/cally-baute-780581b',
      email: 'madison.benveniste@audacy.com', title: 'VP Sales' },
    'lead_file',
  )
  assert.equal(patch.linkedin_url, undefined, 'the shifted URL must not be written')
  assert.equal(patch.email, 'madison.benveniste@audacy.com')
  assert.equal(patch.title, 'VP Sales')
  assert.match(rejected.join(' '), /linkedin_url unverifiable/)
})

test('the gate never downgrades a profile we already verified', () => {
  const { patch } = gateContact(
    { full_name: 'Dave Rosner', linkedin_url: 'https://www.linkedin.com/in/dave-rosner', company: 'Permutive' },
    { full_name: 'Dave Rosner', linkedin_url: 'https://www.linkedin.com/in/dave-rosner-old', company: 'Permutive' },
    'lead_file',
  )
  assert.equal(patch.linkedin_url, undefined)
})

test('email_normalized is never written — the database generates it', () => {
  const { patch } = gateContact(null, { full_name: 'A B', email: 'a@b.com' }, 'roster')
  assert.equal(patch.email, 'a@b.com')
  assert.equal('email_normalized' in patch, false)
})
