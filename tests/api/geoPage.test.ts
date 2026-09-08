// The markdown a published answer page is written as.
//
// These exist because two faults in this one function broke a production
// build, and neither was visible from Control Center: the page looked correct
// in the database and in the pull request diff, and only the receiving site's
// loader could tell that the closing fence had no line of its own and that the
// date was a timestamp. A generator writing files for somebody else's parser
// needs its output checked here rather than discovered there.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderPage } from '../../api/_geoRun.js'

const geo = {
  title: 'A page about a thing',
  slug: 'a-page-about-a-thing',
  meta_description: 'What the page says, briefly.',
  answer: 'Mindmake says the answer is this, and here is the second sentence.',
  claim: 'The claim nobody else answering this makes.',
  target_query: 'How do I do the thing?',
  first_party: ['Something only this business can say.'],
  faq: [{ q: 'A follow-up?', a: 'Yes.' }, { q: 'Another?', a: 'Also yes.' }],
  body_md: 'The prose starts here.\n\n## A real heading\n\nMore prose.',
}

test('the closing fence gets a line of its own', () => {
  // The fault that broke a build: the fence glued to the first line of prose,
  // so the receiving parser could not find the front matter block at all.
  const page = renderPage(geo, { idea: geo.title }, '2026-09-08T13:02:49.278Z')
  const lines = page.split('\n')
  const close = lines.indexOf('---', 1)
  assert.ok(close > 0, 'there must be a closing fence on its own line')
  assert.equal(lines[close], '---')
  assert.equal(lines[close + 1], '', 'and a blank line after it, before the prose')
  assert.ok(!/\n---\S/.test(page), 'nothing may be glued to a fence')
})

test('published_at is a date, not a timestamp', () => {
  // At least one site loader requires exactly YYYY-MM-DD and refuses more.
  const page = renderPage(geo, { idea: geo.title }, '2026-09-08T13:02:49.278Z')
  assert.match(page, /^published_at: "2026-09-08"$/m)
  assert.ok(!page.includes('13:02:49'), 'the time of the commit is not the date of the page')
})

test('the front matter carries every field the sites read', () => {
  const page = renderPage(geo, { idea: geo.title }, '2026-09-08T00:00:00.000Z')
  for (const key of ['title', 'slug', 'description', 'answer', 'claim', 'target_query', 'published_at', 'first_party', 'faq']) {
    assert.match(page, new RegExp(`^${key}:`, 'm'), `${key} is missing from the front matter`)
  }
})

test('a quote in a value is escaped rather than ending it', () => {
  const page = renderPage({ ...geo, title: 'She said "no" to that' }, { idea: '' }, '2026-09-08T00:00:00.000Z')
  assert.match(page, /^title: "She said \\"no\\" to that"$/m)
})

test('the body follows the front matter intact', () => {
  const page = renderPage(geo, { idea: geo.title }, '2026-09-08T00:00:00.000Z')
  assert.ok(page.includes('The prose starts here.'))
  assert.ok(page.includes('## A real heading'))
})

test('the follow-up questions are rendered as real sections too', () => {
  // They are in the front matter for the structured data and in the prose for
  // a reader, so a page that lists them only as metadata is half a page.
  const page = renderPage(geo, { idea: geo.title }, '2026-09-08T00:00:00.000Z')
  assert.match(page, /## Questions people ask next/)
  assert.match(page, /### A follow-up\?/)
  assert.match(page, /### Another\?/)
})

test('a page with no follow-ups renders no empty section', () => {
  const page = renderPage({ ...geo, faq: [] }, { idea: geo.title }, '2026-09-08T00:00:00.000Z')
  assert.ok(!page.includes('Questions people ask next'))
})
