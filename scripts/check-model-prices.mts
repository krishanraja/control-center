#!/usr/bin/env tsx
/**
 * Every Claude model the OS calls has a price.
 *
 * api/_prices.ts prices an unknown model at ZERO on purpose — a guessed rate
 * is worse than a visible gap. That is the right default and a terrible thing
 * to discover in production, because the meter keeps reporting numbers; they
 * are just all zero for the model nobody added.
 *
 * This nearly happened. A model sweep moved the fleet onto Claude 5 in the same
 * week the usage meter was built, and until the rows were added every
 * synthesis call in the OS would have metered real tokens against $0.00. The
 * failure is silent, arrives by drift, and looks exactly like "we did not spend
 * anything on Anthropic this month".
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { MODEL_PRICES, isPriced } from '../api/_prices.js'

const ROOTS = ['api', 'scripts', 'src']
const SELF = 'check-model-prices.mts'
/** Model ids appear in code as string literals; a dated suffix prices by family. */
const MODEL = /claude-[a-z0-9]+(?:-[a-z0-9]+)*/g

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx|mts)$/.test(e) && e !== SELF) out.push(p)
  }
  return out
}

const seen = new Map<string, string>()
for (const file of ROOTS.flatMap(r => walk(r))) {
  // The price table itself declares the families; it is not a call site.
  if (file.endsWith('api/_prices.ts')) continue
  const src = readFileSync(file, 'utf8')
  for (const m of src.match(MODEL) || []) {
    if (!seen.has(m)) seen.set(m, file)
  }
}

const unpriced = [...seen].filter(([model]) => !isPriced(model))
if (unpriced.length) {
  console.error('Claude models used in the repo with no row in api/_prices.ts.')
  console.error('Their spend meters as $0.00 against real token counts:\n')
  for (const [model, file] of unpriced) console.error(`  ${model}  (first seen in ${file})`)
  console.error(`\nPriced families: ${Object.keys(MODEL_PRICES).join(', ')}`)
  console.error('Add the row with the PUBLISHED rate. Never guess one — a plausible')
  console.error('wrong number in a spend report is worse than a visible gap.')
  process.exit(1)
}
console.log(`check-model-prices: ${seen.size} model ids in use, all priced.`)
