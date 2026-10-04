import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cn } from '../../src/lib/utils.js'

// The role sizes are custom names. Stock twMerge filed `text-body` with the
// colours and dropped it next to `text-ink-muted`, so every SegmentedNav pill
// but the selected one rendered at the browser's 16px (audit 2026-10-04).

test('a colour token never cancels a role size', () => {
  for (const size of ['micro', 'label', 'body', 'ui', 'lede', 'title', 'heading', 'display', 'hero']) {
    const out = cn(`text-${size}`, 'text-ink-muted').split(' ')
    assert.ok(out.includes(`text-${size}`), `text-${size} survived text-ink-muted`)
    assert.ok(out.includes('text-ink-muted'))
  }
})

test('the later role size still wins over an earlier one', () => {
  assert.equal(cn('text-body', 'text-label'), 'text-label')
})

test('the later colour still wins over an earlier one', () => {
  assert.equal(cn('text-ink', 'text-ink-muted'), 'text-ink-muted')
})
