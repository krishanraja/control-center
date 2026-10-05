import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { applyWeekEntry, composeWeekEntry, CHANGELOG_HEADING, REFRESH_MARK, entryMark } from '../../api/_architectureDoc.js'

// The architecture doc is read by code, not only by people. On 2026-10-05 it
// was rebuilt from 415 KB of accreted history into a lean core, and the
// rebuild nearly broke the engine in a way no other check would see:
// applyWeekEntry ends a replaced entry at the next "\n### ", so with no
// heading after the oldest engine entry, re-running that week would have cut
// the doc from that entry to the end of the file, section 21 included. These
// tests read the real file and pin every anchor the engine and the Monday note
// depend on. Mutation-tested: removing the sentinel heading fails the last one.

// The engine reads the file from the GitHub contents API, which serves the
// stored bytes: LF. A Windows checkout with core.autocrlf hands this test CRLF
// instead, so normalise to what the engine actually sees.
const doc = readFileSync('docs/MINDMAKE_OS_ARCHITECTURE.md', 'utf8').replace(/\r\n/g, '\n')

test('the Monday note finds the refresh stamp in the first 20,000 bytes it fetches', () => {
  const head = Buffer.from(doc, 'utf8').subarray(0, 20000).toString('utf8')
  assert.match(head, /\*\*Last engine refresh:\*\* (\d{4}-\d{2}-\d{2}|never)/)
})

test('the section 20 heading the engine inserts under exists exactly once', () => {
  assert.equal(doc.split(CHANGELOG_HEADING).length, 2)
})

test('a new week lands first under the heading and only the week and the stamp change', () => {
  const entry = composeWeekEntry('2026-10-09', '2026-10-11', [])
  const { next, replaced } = applyWeekEntry(doc, '2026-10-09', entry, '2026-10-11')
  assert.equal(replaced, false)
  const first = next.indexOf('\n### ', next.indexOf(CHANGELOG_HEADING))
  assert.ok(next.slice(first + 1).startsWith(`### 2026-10-11: the week's builds, written by the engine ${entryMark('2026-10-09')}`))
  assert.equal((next.match(REFRESH_MARK) || [])[1], '2026-10-11')
  const stamp = (doc.match(REFRESH_MARK) || [])[0]
  const undone = next.replace(entry, '').replace('**Last engine refresh:** 2026-10-11', stamp).replace(`${CHANGELOG_HEADING}\n\n`, `${CHANGELOG_HEADING}\n`)
  assert.equal(undone, doc)
})

test('a re-run replaces its own week rather than duplicating it', () => {
  const once = applyWeekEntry(doc, '2026-10-09', composeWeekEntry('2026-10-09', '2026-10-11', []), '2026-10-11').next
  const twice = applyWeekEntry(once, '2026-10-09', composeWeekEntry('2026-10-09', '2026-10-12', []), '2026-10-12')
  assert.equal(twice.replaced, true)
  assert.equal(twice.next.split(entryMark('2026-10-09')).length, 2)
})

test('replacing the oldest engine entry leaves every later section intact', () => {
  const marks = [...doc.matchAll(/<!-- engine-week:(\d{4}-\d{2}-\d{2}) -->/g)].map(m => m[1])
  assert.ok(marks.length > 0, 'no engine entries in section 20')
  const oldest = marks[marks.length - 1]
  const { next, replaced } = applyWeekEntry(doc, oldest, composeWeekEntry(oldest, '2026-10-11', []), '2026-10-11')
  assert.equal(replaced, true)
  assert.ok(next.includes('## 21. Update protocol'), 'section 21 was cut')
  assert.ok(next.length > doc.length * 0.9, 'the replace removed far more than one entry')
})
