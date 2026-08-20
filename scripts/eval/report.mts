/**
 * Re-render a saved run.
 *
 *   npx tsx scripts/eval/report.mts scripts/eval/reports/revise-<stamp>.json
 *
 * Reports carry every sample, so re-reading one costs nothing. Use this after
 * changing how a result is interpreted, or to look again at a run without
 * paying for the generations twice.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render } from './_report.mts'

const path = process.argv[2]
if (!path) {
  console.error('usage: npx tsx scripts/eval/report.mts <report.json>')
  process.exit(1)
}
const r = JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8'))
console.log(`\n${r.suite} — ${r.samples.length} samples across ${r.arms.length} arms\n`)
render({
  suite: r.suite,
  scale: r.scale ?? 'score',
  arms: r.arms,
  samples: r.samples,
  seed: r.opts?.seed ?? 1,
})
