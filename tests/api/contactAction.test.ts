import assert from 'node:assert/strict'
import { test } from 'node:test'
import { contactAction, subjectFor } from '../../src/lib/contactAction.ts'

// Krish 2026-09-15: "every network suggestion in controlcenter should be oneclick
// to contact them." The channel is decided from what is known about the person, and
// the draft travels with the click every time. These tests pin which channel wins
// and, more importantly, that the draft is never left behind.

const DRAFT = 'You have Head of GTM open. In my experience that seat opens when...'

test('an email address wins, and the message is already in the body', () => {
  const a = contactAction(
    { name: 'Lin Qiao', email: 'lin@fireworks.ai', linkedin_url: 'https://linkedin.com/in/lin' },
    DRAFT, { role: 'Head of GTM', company: 'Fireworks AI' })
  assert.equal(a.kind, 'email')
  assert.equal(a.label, 'Email Lin')
  assert.ok(a.href.startsWith('mailto:lin@fireworks.ai?'))
  assert.ok(a.href.includes(encodeURIComponent('Head of GTM at Fireworks AI')))
  assert.ok(a.href.includes(encodeURIComponent(DRAFT)))
  // Nothing to copy: it is already in the compose window.
  assert.equal(a.copies, false)
})

test('no email falls to LinkedIn, and the draft goes to the clipboard', () => {
  // LinkedIn has no prefill, so the honest promise is profile open, draft copied.
  const a = contactAction(
    { name: 'Tyrone Millard', email: null, linkedin_url: 'https://www.linkedin.com/in/tyronemillard' },
    DRAFT)
  assert.equal(a.kind, 'linkedin')
  assert.equal(a.href, 'https://www.linkedin.com/in/tyronemillard')
  assert.equal(a.copies, true)
  assert.match(a.note, /Paste it/)
})

test('a fabricated profile string is not a link', () => {
  // hunter used to synthesise linkedin.com/in/<contact_key>; anything that is not
  // an http URL must not become a button that goes nowhere.
  const a = contactAction({ name: 'Chad', email: null, linkedin_url: 'cold:chad-gerhardstein' }, DRAFT)
  assert.equal(a.kind, 'clipboard')
  assert.equal(a.href, '')
})

test('neither on record still does something, and says why', () => {
  const a = contactAction({ name: 'Ada Nguyen', email: null, linkedin_url: null }, DRAFT)
  assert.equal(a.kind, 'clipboard')
  assert.equal(a.copies, true)
  assert.match(a.note, /needs finding first/)
  assert.match(a.note, /Ada/)
})

test('an empty draft still produces a usable action', () => {
  const a = contactAction({ name: 'Sam', email: 'sam@example.com' }, '')
  assert.equal(a.kind, 'email')
  assert.ok(a.href.startsWith('mailto:sam@example.com'))
})

test('a missing name never renders as undefined', () => {
  const a = contactAction({ email: 'x@example.com' }, DRAFT)
  assert.equal(a.label, 'Email them')
})

test('the subject reads like a person wrote it', () => {
  assert.equal(subjectFor('Head of GTM', 'Harvey'), 'Head of GTM at Harvey')
  assert.equal(subjectFor(null, 'Harvey'), 'Harvey')
  assert.equal(subjectFor(null, null), 'Quick question')
})
