// What is allowed to leave the browser for the edit ledger.
//
// content_edit_events is the only record of what Krish actually did to a piece,
// and the weekly compiler reasons from it. Two rules govern what may go in, and
// both are easy to break by accident from this side:
//
//   Anti-echo. The table may inform form and craft. It must never let a
//   candidate rank higher because he showed interest in its subject. briefDiff
//   keys a section by slugging its heading, so the key IS the topic, and the
//   bodies obviously are. The builder is handed all three and must emit none.
//
//   Bounded. Hashes, a structured diff and counts. Never two full bodies.
//
// A leak here would not throw and would not fail a type check. It would just
// quietly become evidence, forever.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { briefSectionEvent, magicVerdictEvent, sha256Hex } from '../../src/lib/editLedger.ts'

const SECTION = {
  status: 'changed',
  before: 'The renewal quote landed at 340k, up from 210k last year.',
  after: 'The renewal quote landed at 340k. Last year it was 210k.',
  kept: true,
}

const build = (overrides = {}) => briefSectionEvent({
  week: '2026-W38',
  mode: 'tighten',
  section: SECTION,
  idempotencyKey: '11111111-1111-4111-8111-111111111111',
  beforeHash: 'a'.repeat(64),
  afterHash: 'b'.repeat(64),
  client: 'desktop',
  ...overrides,
})

test('no body text reaches the ledger, only its hash and its length', () => {
  const wire = JSON.stringify(build())
  for (const leak of ['renewal', 'quote', '340k', '210k', 'landed']) {
    assert.ok(!wire.includes(leak), `"${leak}" reached the ledger`)
  }
  const event = build()
  assert.equal(event.chars_before, SECTION.before.length)
  assert.equal(event.chars_after, SECTION.after.length)
  assert.equal(event.before_hash, 'a'.repeat(64))
  assert.equal(event.after_hash, 'b'.repeat(64))
})

test('delta_features carries the shape of the change, never its subject', () => {
  assert.deepEqual(build().delta_features, ['changed'])
  assert.deepEqual(build({ section: { ...SECTION, status: 'removed' } }).delta_features, ['removed'])
})

test('the verdict is the whole point, and it goes both ways', () => {
  assert.equal(build().action, 'section_kept')
  assert.equal(build({ section: { ...SECTION, kept: false } }).action, 'section_dropped')
})

test('every field the route admits on is present and in its vocabulary', () => {
  // Mirrors the sets in content-engine's api/_editEvents.ts. A row that fails
  // these is refused by name at the boundary, and the signal is lost silently
  // because this write is ambient and never surfaces its own failure.
  const e = build()
  assert.equal(e.subject_table, 'weekly_briefs')
  assert.equal(e.artifact_kind, 'brief_section')
  assert.equal(e.surface, 'brief_editor')
  assert.ok(['desktop', 'mobile'].includes(e.client as string))
  assert.match(e.idempotency_key as string, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  assert.equal(e.subject_id, '2026-W38')
})

test('a missing hash is admissible, because a section verdict does not require one', () => {
  // sha256Hex returns null outside a secure context. The engine only demands a
  // hash for manual_edit, magic_accepted, magic_rejected and
  // external_final_captured, so a hashless verdict is still evidence rather
  // than a dropped row.
  const e = build({ beforeHash: null, afterHash: null })
  assert.equal(e.before_hash, null)
  assert.equal(e.after_hash, null)
  assert.equal(e.action, 'section_kept')
})

test('the mode says which edit produced the revision, and is allowed to be absent', () => {
  assert.equal(build().mode, 'tighten')
  assert.equal(build({ mode: null }).mode, null)
})

test('sha256Hex agrees with the hash the engine would compute', async () => {
  // Same digest node:crypto createHash('sha256') produces in api/_editEvents.ts,
  // so a hash written here is comparable with one written there.
  assert.equal(
    await sha256Hex('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  )
  assert.equal(
    await sha256Hex(''),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  )
})

test('a platform with no webcrypto gets null, not a throw', async () => {
  // The other half of the contract, and the half that was only ever exercised
  // by accident: CI ran Node 18, which has no `globalThis.crypto`, so this was
  // silently the ONLY path the runner took and the assertion above failed there
  // and nowhere else. CI is on Node 20 now, so the digest path above is real.
  // This keeps the fallback covered deliberately rather than by an old runner:
  // section_kept and section_dropped are admissible with no hashes at all.
  const had = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
  try {
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true })
    assert.equal(await sha256Hex('abc'), null)
  } finally {
    if (had) Object.defineProperty(globalThis, 'crypto', had)
  }
})

// ---------------------------------------------------------------------------
// THE VERDICT HALF, which did not exist.
//
// api/content-ideas/:id/revise has always written a `magic_invoked` row and
// returned edit_event_id so the composer "can later resolve the same event to
// accepted or rejected". Nothing ever did: there was no resolver anywhere in
// the fleet and nothing in this repo so much as read edit_event_id.
//
// The cost is not a missing nicety. learning/compile's presetProposals gates on
// `resolved = accepted + rejected` and needs three before it will say anything.
// With no writer for either verdict that count is permanently zero, so the
// detector could never emit a proposal however hard the composer was used. The
// suggestion was recorded; what Krish did with it was not.
//
// content_edit_events is append-only, so a verdict is a NEW row that pairs on
// before_hash. These tests pin the pairing and the table's own constraints,
// because every one of them fails as a swallowed 400 rather than as an error
// anyone sees.

const VERDICT = {
  ideaId: '7f3a1c2e-0000-4000-8000-000000000001',
  mode: 'tone',
  value: 'punchier',
  idempotencyKey: '22222222-2222-4222-8222-222222222222',
  beforeHash: 'c'.repeat(64),
  afterHash: 'd'.repeat(64),
  charsBefore: 900,
  charsAfter: 740,
  dwellMs: 4200,
  client: 'desktop' as const,
}

const verdict = (overrides = {}) => magicVerdictEvent({ ...VERDICT, kept: true, ...overrides })

test('a kept edit pairs to its invocation on before_hash and carries its result', () => {
  const e = verdict()
  assert.equal(e.action, 'magic_accepted')
  // content_edit_events_resolution_has_parent: a verdict without this is
  // rejected by the table, and a row that cannot pair teaches nothing anyway.
  assert.equal(e.before_hash, 'c'.repeat(64))
  // content_edit_events_change_has_result.
  assert.equal(e.after_hash, 'd'.repeat(64))
})

// A rejected edit produced no result, so it carries none. Sending the preview's
// hash anyway would assert that text became the draft when it never did.
test('a rejected edit still pairs, but claims no result', () => {
  const e = verdict({ kept: false })
  assert.equal(e.action, 'magic_rejected')
  assert.equal(e.before_hash, 'c'.repeat(64))
  assert.equal(e.after_hash, null)
})

// presetProposals counts by `${mode}:${value}`. If a verdict keyed differently
// from its invocation it would never be counted against it, and every preset
// would look like it was invoked and never resolved.
test('the verdict keys on the same preset the invocation did', () => {
  const e = verdict()
  assert.equal(e.mode, 'tone')
  assert.equal(e.value, 'punchier')
})

test('no draft text reaches the ledger, only hashes, lengths and the verdict', () => {
  const wire = JSON.stringify(verdict())
  for (const leak of ['punchier draft', 'the renewal', 'Cleo', 'headline']) {
    assert.ok(!wire.includes(leak), `"${leak}" reached the ledger`)
  }
  assert.equal(verdict().chars_before, 900)
  assert.equal(verdict().chars_after, 740)
})

test('delta_features says which way it went, never what it was about', () => {
  assert.deepEqual(verdict().delta_features, ['kept'])
  assert.deepEqual(verdict({ kept: false }).delta_features, ['dropped'])
})

// Dwell is how long he looked at it before deciding. A fast discard and a long
// deliberation are different signals and the table has a column for it.
test('dwell is carried, and is allowed to be absent', () => {
  assert.equal(verdict().dwell_ms, 4200)
  assert.equal(verdict({ dwellMs: null }).dwell_ms, null)
})

test('every field the table constrains is in its vocabulary', () => {
  const e = verdict()
  assert.equal(e.subject_table, 'content_ideas')
  assert.equal(e.artifact_kind, 'draft')
  assert.equal(e.surface, 'composer')
  assert.equal(e.client, 'desktop')
  // content_edit_events_mode_check: ^[a-z][a-z0-9_]{0,39}$
  assert.match(String(e.mode), /^[a-z][a-z0-9_]{0,39}$/)
  // content_edit_events_value_check: at most 120 characters.
  assert.ok(String(e.value).length <= 120)
})
