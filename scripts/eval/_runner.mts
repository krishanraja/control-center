// The A/B engine.
//
// Runs every case through every arm, judges each output, and reports the paired
// difference with an interval around it. Two design choices carry most of the
// value:
//
//   PAIRED. Every arm sees the identical case set. Content varies enormously in
//   how well it scores, and that variance is far larger than any prompt effect;
//   comparing arm means across different cases would drown the signal. Comparing
//   each case against itself removes it.
//
//   NULL ARM. With --null the baseline is entered twice under different names.
//   The two are the same prompt, so their measured difference is pure
//   instrument noise. That number is the floor any real result has to clear,
//   and without it a report cannot tell a finding from a coin flip.

import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Suite, Variant, GenResult } from './_types.mts'
import { render, type Sample } from './_report.mts'

export interface RunOpts {
  repeats: number
  concurrency: number
  seed: number
  nullArm: boolean
  fixture: string | null
  limit: number
  outDir: string
}

/**
 * Retry transient upstream failures.
 *
 * Not in callClaude: a route that 502s lets the user retry, and silently
 * burning 30s of a serverless budget on backoff is the wrong trade there. An
 * eval is the opposite case. A dropped sample does not just lose one number, it
 * unbalances the pairing — the arm that happened to hit an overloaded minute
 * gets compared on a different set of cases than the arm that did not, which is
 * exactly the bias the paired design exists to remove.
 */
async function withRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  let last: unknown
  for (let i = 0; i < tries; i++) {
    try { return await fn() } catch (e: any) {
      last = e
      const msg = String(e?.message || e)
      // 5xx and timeouts are transport. "could not parse score" is a sampling
      // failure: the judge runs at temperature 0.3 and occasionally returns
      // something robustJson cannot recover, and re-drawing fixes it. Both are
      // worth retrying; a 400 or a missing key is not, and must fail loudly
      // rather than burn four attempts on a deterministic error.
      const transient = /anthropic_(408|409|429|5\d\d)|timeout|ECONNRESET|fetch failed|could not parse/i.test(msg)
      if (!transient || i === tries - 1) throw e
      await new Promise(r => setTimeout(r, 1500 * 2 ** i))
    }
  }
  throw last
}

/** Bounded-concurrency map that preserves input order. */
async function pool<T, R>(items: T[], n: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.max(1, Math.min(n, items.length)) }, async () => {
    for (;;) {
      const i = next++
      if (i >= items.length) return
      out[i] = await fn(items[i], i)
    }
  })
  await Promise.all(workers)
  return out
}

export async function run<C extends { id: string }>(suite: Suite<C>, opts: RunOpts): Promise<void> {
  const cases = await suite.loadCases({ fixture: opts.fixture, limit: opts.limit })
  if (!cases.length) throw new Error('no cases loaded')

  const arms: Variant<C>[] = [...suite.variants]
  if (opts.nullArm) {
    const base = suite.variants[0]
    arms.splice(1, 0, { ...base, name: `${base.name} (null control)`, note: 'identical to baseline; measures instrument noise' })
  }

  const jobs: { c: C; arm: Variant<C>; rep: number }[] = []
  for (const c of cases) for (const arm of arms) for (let rep = 0; rep < opts.repeats; rep++) jobs.push({ c, arm, rep })

  console.log(`\n${suite.name} — ${suite.describe}`)
  console.log(`cases ${cases.length} · arms ${arms.length} · repeats ${opts.repeats} · ${jobs.length} generations + judgements\n`)
  for (const a of arms) console.log(`  · ${a.name}${a.note ? ` — ${a.note}` : ''}`)
  console.log()

  let done = 0
  const samples = await pool(jobs, opts.concurrency, async ({ c, arm, rep }) => {
    const s: Sample = { caseId: c.id, arm: arm.name, rep, score: NaN, ms: 0, usd: 0, output: '', group: suite.groupOf?.(c) }
    try {
      const g: GenResult = await withRetry(() => arm.run(c))
      s.output = g.output; s.ms = g.ms; s.usd = g.usd
      const j = await withRetry(() => suite.judge(c, g.output))
      s.score = j.score; s.detail = j.detail
    } catch (e: any) {
      s.error = String(e?.message || e).slice(0, 300)
    }
    done++
    process.stdout.write(`\r  ${done}/${jobs.length}   `)
    return s
  })
  process.stdout.write('\r' + ' '.repeat(30) + '\r')

  render({
    suite: suite.name,
    describe: suite.describe,
    scale: suite.scale,
    arms: arms.map(a => a.name),
    samples,
    seed: opts.seed,
  })

  mkdirSync(opts.outDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const path = resolve(opts.outDir, `${suite.name}-${stamp}.json`)
  writeFileSync(path, JSON.stringify({ suite: suite.name, scale: suite.scale, opts, arms: arms.map(a => a.name), samples }, null, 2))
  console.log(`report: ${path}`)
}

/** Print every arm's assembled prompt for one case, calling nothing. */
export async function dry<C extends { id: string }>(suite: Suite<C>, opts: RunOpts): Promise<void> {
  const cases = await suite.loadCases({ fixture: opts.fixture, limit: Math.max(1, opts.limit) })
  if (!cases.length) throw new Error('no cases loaded')
  const c = cases[0]
  console.log(`\n${suite.name} — dry run on case ${c.id}\n`)
  for (const v of suite.variants) {
    console.log('='.repeat(78))
    console.log(`ARM: ${v.name}${v.note ? ` — ${v.note}` : ''}`)
    console.log('='.repeat(78))
    if (!v.preview) { console.log('(this arm has no preview; it calls a model to build its prompt)\n'); continue }
    const p = v.preview(c)
    console.log(`\n--- SYSTEM (${p.system.length} chars) ---\n${p.system}`)
    console.log(`\n--- USER (${p.user.length} chars) ---\n${p.user}\n`)
  }
}
