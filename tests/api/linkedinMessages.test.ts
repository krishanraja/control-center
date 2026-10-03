import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { tallyMessages, slugOf, parseExportDate } from '../../api/network/import-linkedin-messages.ts'
import { parseDelimited } from '../../api/_csv.ts'

// The LinkedIn message import reads Krish's own export. The promise, like the
// mail sync's, is counts and dates only: never the text of a message.

const HEAD = 'CONVERSATION ID,CONVERSATION TITLE,FROM,SENDER PROFILE URL,TO,RECIPIENT PROFILE URLS,DATE,SUBJECT,CONTENT,FOLDER,ATTACHMENTS,IS MESSAGE DRAFT,IS CONVERSATION DRAFT'

const row = (from: string, fromUrl: string, to: string, toUrl: string, date: string, content = 'secret text', draft = 'No') =>
  `c1,,${from},${fromUrl},${to},${toUrl},${date},a subject,${content},INBOX,,${draft},No`

test('no message text or subject is ever read into a tally', () => {
  const src = readFileSync(new URL('../../api/network/import-linkedin-messages.ts', import.meta.url), 'utf8')
    .split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n')
  assert.ok(!/\bCONTENT\b/.test(src), 'the CONTENT column must never be referenced in code')
  assert.ok(!/col\('SUBJECT'\)/.test(src), 'the SUBJECT column must never be read')

  const csv = [HEAD,
    row('Krish Raja', 'https://www.linkedin.com/in/krish-raja', 'Ada Lovelace', 'https://www.linkedin.com/in/ada', '2026-02-20 15:49:04 UTC', 'do not store me'),
  ].join('\n')
  const t = tallyMessages(parseDelimited(csv))
  assert.equal(JSON.stringify([...t.values()]).includes('do not store me'), false)
  assert.equal(JSON.stringify([...t.values()]).includes('a subject'), false)
})

test('direction follows the sender, and both sides of a thread count', () => {
  const csv = [HEAD,
    row('Krish Raja', 'https://www.linkedin.com/in/krish-raja', 'Ada Lovelace', 'https://www.linkedin.com/in/ada', '2026-02-20 15:49:04 UTC'),
    row('Ada Lovelace', 'https://www.linkedin.com/in/ada', 'Krish Raja', 'https://www.linkedin.com/in/krish-raja', '2026-02-21 09:00:00 UTC'),
    row('Krish Raja', 'https://www.linkedin.com/in/krish-raja', 'Ada Lovelace', 'https://www.linkedin.com/in/ada', '2026-02-22 10:00:00 UTC'),
  ].join('\n')
  const t = tallyMessages(parseDelimited(csv))
  const ada = t.get('ada')
  assert.ok(ada)
  assert.equal(ada.outbound_count, 2)
  assert.equal(ada.inbound_count, 1)
  assert.equal(ada.display_name, 'Ada Lovelace')
  assert.equal(ada.first_at, '2026-02-20T15:49:04.000Z')
  assert.equal(ada.last_at, '2026-02-22T10:00:00.000Z')
  // Krish is never a correspondent of his own.
  assert.equal(t.has('krish-raja'), false)
})

test('a draft was never sent, so it is not contact', () => {
  const csv = [HEAD,
    row('Krish Raja', 'https://www.linkedin.com/in/krish-raja', 'Ada', 'https://www.linkedin.com/in/ada', '2026-02-20 15:49:04 UTC', 'x', 'Yes'),
  ].join('\n')
  assert.equal(tallyMessages(parseDelimited(csv)).size, 0)
})

test('every recipient of a group message is credited', () => {
  const csv = [HEAD,
    'c1,,Krish Raja,https://www.linkedin.com/in/krish-raja,Ada Lovelace,https://www.linkedin.com/in/ada https://www.linkedin.com/in/grace,2026-02-20 15:49:04 UTC,,hi,INBOX,,No,No',
  ].join('\n')
  const t = tallyMessages(parseDelimited(csv))
  assert.equal(t.get('ada')?.outbound_count, 1)
  assert.equal(t.get('grace')?.outbound_count, 1)
  // The TO column names one person, so the other must not take their name.
  assert.equal(t.get('grace')?.display_name, undefined)
})

test('slugOf matches public.linkedin_slug, including its two fixed bugs', () => {
  assert.equal(slugOf('https://www.linkedin.com/in/michael-peters-178161?miniProfileUrn=x'), 'michael-peters-178161')
  assert.equal(slugOf('http://LinkedIn.com/in/Foo-Bar/'), 'foo-bar')
  assert.equal(slugOf('www.linkedin.com/pub/jane-doe/1/2/3'), 'jane-doe')
  // Anything that is not a profile URL has no identity, or unrelated people
  // collide under one key.
  assert.equal(slugOf('not a url'), null)
  assert.equal(slugOf(undefined), null)
})

test('the export date format is read as UTC', () => {
  assert.equal(parseExportDate('2026-02-20 15:49:04 UTC'), '2026-02-20T15:49:04.000Z')
  assert.equal(parseExportDate(''), undefined)
  assert.equal(parseExportDate('rubbish'), undefined)
})
