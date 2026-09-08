// robustJson, the tolerant parser every model-facing route depends on.
//
// These exist because of a real failure: two of three answer-engine pages came
// back as complete, well-formed JSON and parsed as nothing, because the
// markdown body inside carried a fenced code block. The parser split on every
// fence, took the second slice, and cut the payload at the inner fence. The
// brace fallback could not rescue it, because the tail had already gone.
//
// The bug was invisible from the outside: the failure read "the model returned
// nothing usable", which is what a bad prompt looks like too.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { robustJson } from '../../api/_content.js'

test('plain JSON', () => {
  assert.deepEqual(robustJson('{"a":1}'), { a: 1 })
})

test('a fenced block, the common case', () => {
  assert.deepEqual(robustJson('```json\n{"a":1}\n```'), { a: 1 })
})

test('a fence with no language tag', () => {
  assert.deepEqual(robustJson('```\n{"a":1}\n```'), { a: 1 })
})

test('a payload containing its own code fence', () => {
  // The regression. The body is markdown and markdown contains code.
  const body = 'Here is the shape:\\n\\n```ts\\nconst x = 1\\n```\\n\\nThat is all.'
  const raw = '```json\n{"title":"A page","body":"' + body + '"}\n```'
  const out = robustJson(raw)
  assert.ok(out, 'a well-formed response must not parse as nothing just because its content has a fence')
  assert.equal(out.title, 'A page')
  assert.match(out.body, /const x = 1/)
})

test('a payload containing several code fences', () => {
  const body = '```sql\\nselect 1\\n```\\nand\\n```js\\nfoo()\\n```'
  const out = robustJson('```json\n{"body":"' + body + '"}\n```')
  assert.ok(out)
  assert.match(out.body, /select 1/)
  assert.match(out.body, /foo\(\)/)
})

test('prose around the JSON still falls back to the braces', () => {
  assert.deepEqual(robustJson('Sure, here you go:\n{"a":1}\nHope that helps.'), { a: 1 })
})

test('unparseable input returns null rather than throwing', () => {
  assert.equal(robustJson('not json at all'), null)
  assert.equal(robustJson(''), null)
  assert.equal(robustJson('```json\n{ broken\n```'), null)
})

test('a fence with trailing whitespace after it', () => {
  assert.deepEqual(robustJson('```json\n{"a":1}\n```   '), { a: 1 })
})
