// Checks locateSpan (api/_selection.ts) against the six ways the brief
// editor's highlight-to-edit used to fail, plus the cases where refusing to
// match is the correct answer. A locator that matches anything is as bad as
// one that matches nothing: it would scope the rewrite to the wrong sentence.
//   npx tsx scripts/check-selection.mts
import { locateSpan } from '../api/_selection.js'

const DRAFT = `## The clues

**The model stopped being the story. Here is what replaced it.** [1] What it
tells you: when operators running millions of automated tasks monthly cannot
name their underlying model, the model has become a commodity input.

Thomson Reuters built its own foundation model, and the CFO math is why every
enterprise follows. See [the filing](https://example.com/q3-filing?a=1) for the
numbers, which are not small.

## Sources
[1] https://example.com/a16z`

// [label, selection as the EDITOR would hand it over, must resolve to]
const SHOULD_MATCH: [string, string, string][] = [
  ['1. bold markup stripped by the renderer',
   'The model stopped being the story. Here is what replaced it.',
   'The model stopped being the story. Here is what replaced it.'],

  ['2. block separator: one newline in, two in the source',
   'name their underlying model, the model has become a commodity input.\nThomson Reuters built its own foundation model',
   'commodity input.'],

  ['3. sanitizeVoice divergence: em dash on screen, comma in the DB',
   'Thomson Reuters built its own foundation model — and the CFO math is why every enterprise follows.',
   'Thomson Reuters built its own foundation model, and the CFO math is why every enterprise follows.'],

  ['4. citation marker present on screen, absent in the stored copy',
   'The model stopped being the story. Here is what replaced it. [1] What it tells you',
   'What it tells you'],

  ['5. reading view: the same span with the marker stripped back out',
   'Here is what replaced it. What it tells you: when operators',
   'when operators'],

  ['6. selection spanning a link, whose URL exists only in the markdown',
   'See the filing for the numbers',
   'See [the filing](https://example.com/q3-filing?a=1) for the numbers'],

  ['bonus: heading markup',
   'The clues',
   'The clues'],
]

const SHOULD_REFUSE: [string, string][] = [
  ['words that are simply not in the draft', 'a sentence that was never written here'],
  ['too short to be safe', 'the'],
  ['empty', '   '],
]

let fail = 0

// Compare on words, not punctuation. A located span deliberately starts and
// ends on an alphanumeric (so it never swallows a trailing `**`), and the
// source is hard-wrapped, so asserting on raw text would be asserting on the
// test fixture's line breaks rather than on the behaviour.
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

for (const [label, sel, expect] of SHOULD_MATCH) {
  const hit = locateSpan(DRAFT, sel)
  if (!hit) { console.log(`FAIL (no match) ${label}`); fail++; continue }
  if (!words(hit.text).includes(words(expect))) {
    console.log(`FAIL (wrong span) ${label}\n   got: ${JSON.stringify(hit.text.slice(0, 90))}\n   want to cover: ${JSON.stringify(expect)}`)
    fail++; continue
  }
  if (DRAFT.slice(hit.start, hit.end) !== hit.text) {
    console.log(`FAIL (offsets disagree with text) ${label}`); fail++; continue
  }
  // The whole point: what comes back is really in the draft the model is given.
  if (!DRAFT.includes(hit.text)) {
    console.log(`FAIL (span not present in source) ${label}`); fail++
  }
}

for (const [label, sel] of SHOULD_REFUSE) {
  const hit = locateSpan(DRAFT, sel)
  if (hit) { console.log(`FAIL (should not have matched) ${label}: ${JSON.stringify(hit.text.slice(0, 60))}`); fail++ }
}

// Ambiguity is reported, not hidden: the caller decides whether to scope.
const dup = locateSpan('the same words here. and the same words here again.', 'the same words here')
if (!dup?.ambiguous) { console.log('FAIL: repeated span not flagged ambiguous'); fail++ }

console.log(fail === 0
  ? `PASS ${SHOULD_MATCH.length} located, ${SHOULD_REFUSE.length} refused, ambiguity flagged`
  : `${fail} FAILURES`)
process.exit(fail ? 1 : 0)
