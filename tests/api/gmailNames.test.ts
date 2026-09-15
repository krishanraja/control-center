import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nameFromHeader, splitName } from '../../api/_gmailNames.ts'

// The asymmetry that shapes every rule here: a MISSING name costs a record that
// stays unmatchable, which is the status quo. A WRONG name goes into the
// Network tab under a real person and ends up in the first line of an email to
// them. So every ambiguous case returns null.

test('the ordinary case: a display name we did not have', () => {
  // Measured from the real mailbox — contact "James" at dothinkdo.com.
  assert.equal(nameFromHeader('James Harrabin <james@dothinkdo.com>', 'james@dothinkdo.com'), 'James Harrabin')
})

test('quoted names lose their quotes', () => {
  assert.equal(nameFromHeader('"Sidney Lawlor-McDonald" <sid.lm@x.com>', 'sid.lm@x.com'), 'Sidney Lawlor-McDonald')
})

test('a directory flip is unflipped', () => {
  assert.equal(nameFromHeader('"Harrabin, James" <james@dothinkdo.com>', 'james@dothinkdo.com'), 'James Harrabin')
})

test('a firm with a comma is not treated as a flipped person', () => {
  assert.equal(nameFromHeader('"Smith, Jones & Partners LLP" <hi@sjp.com>', 'hi@sjp.com'), null)
})

test('encoded words are decoded, not stored as mojibake', () => {
  // =?UTF-8?B?...?= is how a non-ASCII name actually arrives.
  const b64 = Buffer.from('Renée Dupont', 'utf8').toString('base64')
  assert.equal(nameFromHeader(`=?UTF-8?B?${b64}?= <r@x.com>`, 'r@x.com'), 'Renée Dupont')
  assert.equal(nameFromHeader('=?UTF-8?Q?Jos=C3=A9_Garc=C3=ADa?= <j@x.com>', 'j@x.com'), 'José García')
})

test('a bare address yields nothing', () => {
  assert.equal(nameFromHeader('james@dothinkdo.com', 'james@dothinkdo.com'), null)
  assert.equal(nameFromHeader('<james@dothinkdo.com>', 'james@dothinkdo.com'), null)
})

test('a display name that is just the address again yields nothing', () => {
  assert.equal(nameFromHeader('"james@dothinkdo.com" <james@dothinkdo.com>', 'james@dothinkdo.com'), null)
  assert.equal(nameFromHeader('bill <bill@orbit.me>', 'bill@orbit.me'), null)
})

test('one token is not a repair', () => {
  // Accepting "Bill" would mark the record fixed and stop it ever being
  // retried, which is strictly worse than leaving it visibly broken.
  assert.equal(nameFromHeader('Bill <bill@orbit.me>', 'bill@orbit.me'), null)
})

test('role accounts wearing a person-shaped name are rejected', () => {
  assert.equal(nameFromHeader('Orbit Team <bill@orbit.me>', 'bill@orbit.me'), null)
  assert.equal(nameFromHeader('Maven Notifications <chelsea@maven.com>', 'chelsea@maven.com'), null)
  assert.equal(nameFromHeader('Sarah via Substack <s@substack.com>', 's@substack.com'), null)
})

test('a signature block that leaked into the header is rejected', () => {
  assert.equal(nameFromHeader('Sidney Lawlor-McDonald Founder TenderSNAP AI DISCOVER <s@x.com>', 's@x.com'), null)
})

test('nothing in, nothing out', () => {
  assert.equal(nameFromHeader(null, 'a@b.com'), null)
  assert.equal(nameFromHeader('', 'a@b.com'), null)
  assert.equal(nameFromHeader('   ', 'a@b.com'), null)
})

test('names split for the first/last columns', () => {
  assert.deepEqual(splitName('James Harrabin'), { first: 'James', last: 'Harrabin' })
  assert.deepEqual(splitName('Sidney Lawlor-McDonald'), { first: 'Sidney', last: 'Lawlor-McDonald' })
  assert.deepEqual(splitName('Jean Claude Van Damme'), { first: 'Jean', last: 'Claude Van Damme' })
})
