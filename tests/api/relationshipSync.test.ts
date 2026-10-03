import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { MAIL_HEADERS, parseAddresses, isAutomated, SELF } from '../../api/_mailHeaders.ts'

// The relationship sync reads Krish's own mailboxes. The promise made when it
// was built (2026-10-03) is counts and dates only: never a body, never a
// subject line. These tests are that promise.

test('the sync asks for no subject, body or snippet', () => {
  assert.ok(!MAIL_HEADERS.map(h => h.toLowerCase()).includes('subject'))
  // Code only: the file's own comments explain that snippets are never read.
  const src = readFileSync(new URL('../../api/_relationshipSync.ts', import.meta.url), 'utf8')
    .split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n')
  assert.ok(src.includes('format=metadata'), 'messages must be fetched as metadata')
  assert.ok(!/format=(full|raw|minimal)/.test(src), 'no fuller message format may be requested')
  assert.ok(!/\bsnippet\b/.test(src), 'snippets carry message text and must not be read')
})

test('addresses parse from real header shapes', () => {
  assert.deepEqual(parseAddresses('Jane Doe <Jane@Acme.com>, bob@x.io'), [
    { email: 'jane@acme.com', name: 'Jane Doe' }, { email: 'bob@x.io', name: undefined },
  ])
  assert.deepEqual(parseAddresses('"Doe, Jane" <jane@acme.com>'), [{ email: 'jane@acme.com', name: 'Doe, Jane' }])
  assert.deepEqual(parseAddresses(undefined), [])
})

test('machine senders are not people, real people at generic-looking addresses are', () => {
  assert.ok(isAutomated('noreply@stripe.com'))
  assert.ok(isAutomated('calendar-notification@google.com'))
  assert.ok(isAutomated('notifications@github.com'))
  assert.ok(!isAutomated('hello@founderco.com'))
  assert.ok(!isAutomated('jane.notley@acme.com'))
  // Bulk senders do write from a subdomain, and a rule on the domain cannot
  // be told from a real one: these are a newspaper and a university Krish has
  // live contacts at, and the rule tried on 2026-10-03 silenced them all.
  assert.ok(!isAutomated('paul.oyama@news.com.au'))
  assert.ok(!isAutomated('mplatt@mail.med.upenn.edu'))
  assert.ok(!isAutomated('anna@info.n8n.io'))
  // A machine mailbox is still caught whatever it sends from.
  assert.ok(isAutomated('service@paypal.com.au'))
  assert.ok(isAutomated('shipment-tracking@amazon.com.au'))
  assert.ok(isAutomated('store-news@amazon.com.au'))
})

test('all three of Krish\'s accounts and the alias count as him', () => {
  for (const a of ['krish@mindmake.co', 'krish@themindmaker.ai', 'hello@krishraja.com', 'krishanraja@gmail.com']) assert.ok(SELF.has(a))
})
