// Checks the MYMU: Teardown beat gate (api/_beat.ts) in BOTH directions.
// A guard that over-blocks is as damaging as one that under-blocks, so the
// on-beat cases matter as much as the off-beat ones.
//   npx tsx scripts/check-teardown-beat.mts
import { onTeardownBeat } from '../api/_beat.js'

const OFF: [string, string][] = [
  ['OpenAI launches GPT-5.5 with a 2M token context window', 'scores 94.2 on SWE-bench'],
  ['Anthropic unveils Claude Opus 5, beats GPT-5 on reasoning', 'outperforms by 12 points'],
  ['EU AI Act compliance deadline arrives for general purpose models', '18 months to comply'],
  ['Acme Corp announces enterprise AI pilot programme with Microsoft', '500 employees in the pilot'],
  ['Mistral raises $640M Series C', 'valuation of $6B'],
  ['Meta open-sources Llama 5', '405 billion parameters'],
]
const ON: [string, string][] = [
  ['OpenAI raises API pricing 40% as the subsidy era ends', 'cost per million tokens rose from $3 to $4.20'],
  ['Cursor cuts its seat price and shifts to usage billing', 'gross margin fell to 41%'],
  ['Klarna rehires the support staff its AI replaced', 'headcount back up 12%'],
  ['Why every AI coding tool is converging on the same price point', 'take rate compressed to 8%'],
  // the load-bearing case: an event word, but the story is the repricing
  ['GPT-5.5 launch quietly repriced the whole agent market', 'margin on resold inference went negative'],
  ['The unit economics of AI search when the click stops happening', 'revenue per session fell 60%'],
]

let fail = 0
for (const [h, s] of OFF) if (onTeardownBeat(h, s)) { console.log('FAIL should block:', h); fail++ }
for (const [h, s] of ON) if (!onTeardownBeat(h, s)) { console.log('FAIL should pass:', h); fail++ }
console.log(fail === 0 ? `PASS ${OFF.length} blocked, ${ON.length} passed` : `${fail} FAILURES`)
process.exit(fail ? 1 : 0)
