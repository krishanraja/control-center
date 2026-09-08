/**
 * Guard: every Anthropic call must hand the meter its whole usage object.
 *
 * Prompt caching fails silently. There is no error when a breakpoint stops
 * working, only a larger bill, so the only defence is a number you watch. That
 * number did not exist until 2026-09-09: five call sites each plucked
 * input_tokens and output_tokens by hand and dropped cache_read_input_tokens
 * and cache_creation_input_tokens on the floor, so a cached call and an
 * uncached one of the same size were indistinguishable in meter_daily.
 *
 * The fix was to give meter.anthropicCall the raw usage object and read the
 * cache fields in exactly one place. This guard stops the old shape coming
 * back, which is the realistic failure: someone adds a sixth call site,
 * copies the pattern from a fifth, and the new site is invisible.
 *
 * Deterministic and free. It makes no API call, so it can run on every push,
 * which is the point: a guard that costs money runs rarely and catches late.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const failures: string[] = []

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.git' || e === 'dist') continue
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|mts)$/.test(e)) out.push(p)
  }
  return out
}

const files = walk('api')

for (const f of files) {
  const src = readFileSync(f, 'utf8')
  // _meter.ts routes it and _prices.ts parses it. Those two are the one place
  // allowed to touch the raw fields; that is what the guard is protecting.
  if (f.endsWith('_meter.ts') || f.endsWith('_prices.ts')) continue

  // 1. No call site may pass the hand-plucked token counts to the meter. The
  //    two fields still exist on the signature for callers that genuinely have
  //    only two numbers, but nothing reading an Anthropic response qualifies.
  const calls = [...src.matchAll(/meter\.anthropicCall\(\{[\s\S]{0,400}?\}\)/g)]
  for (const m of calls) {
    const block = m[0]
    const line = src.slice(0, m.index).split('\n').length
    // `usage: j?.usage` and the shorthand `usage` are both correct.
    const passesUsage = /\busage\s*[:,}]/.test(block)
    if (/inputTokens\s*:/.test(block) && !passesUsage) {
      failures.push(`${f}:${line} meters an Anthropic call with hand-plucked token counts and no usage object. Cache tokens are dropped, so this site's caching is invisible. Pass \`usage: j?.usage\` instead.`)
    }
    if (!passesUsage && !/inputTokens\s*:/.test(block)) {
      failures.push(`${f}:${line} calls anthropicCall with neither a usage object nor token counts.`)
    }
  }

  // 2. Nothing outside the meter may read the cache fields directly. One place
  //    derives them, or the five-sites problem returns in a new costume.
  for (const [i, l] of src.split('\n').entries()) {
    if (/cache_read_input_tokens|cache_creation_input_tokens/.test(l)) {
      failures.push(`${f}:${i + 1} reads a cache token field directly. api/_prices.ts readUsage() is the one place that parses usage; use it or pass the object to the meter.`)
    }
  }
}

// 3. The price table must carry cache multipliers, because pricing a cache read
//    at the full input rate would report a saving that is not there.
const prices = readFileSync('api/_prices.ts', 'utf8')
for (const needed of ['CACHE_MULTIPLIERS', 'priceUsdDetailed', 'priceUsdUncached', 'readUsage']) {
  if (!prices.includes(needed)) failures.push(`api/_prices.ts no longer exports ${needed}; cache pricing cannot be computed.`)
}
if (!/read:\s*0\.1/.test(prices)) failures.push('api/_prices.ts cache read multiplier is not 0.1x input.')

if (failures.length) {
  console.error('Cache metering guard FAILED:')
  for (const f of failures) console.error(`- ${f}`)
  process.exit(1)
}
console.log(`Cache metering guard passed: ${files.length} api files, every anthropicCall passes a usage object, cache pricing intact.`)
