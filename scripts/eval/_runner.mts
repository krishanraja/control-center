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
import { mean, stdev, paired, quantile, verdict } from './_stats.mts'

export interface RunOpts {
  repeats: number
  concurrency: number
  seed: number
  nullArm: boolean
  fixture: string | null
  limit: number
  outDir: string
}

interface Sample { caseId: string; arm: string; rep: number; score: number; ms: number; usd: number; output: string; detail?: unknown; error?: string }

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
      const transient = /anthropic_(429|500|502|503|529)|timeout|ECONNRESET|fetch failed/i.test(msg)
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

function pct(xs: number[], q: number): number {
  return quantile([...xs].sort((a, b) => a - b), q)
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
    const s: Sample = { caseId: c.id, arm: arm.name, rep, score: NaN, ms: 0, usd: 0, output: '' }
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

  const failed = samples.filter(s => s.error)
  if (failed.length) {
    console.log(`${failed.length}/${samples.length} calls failed. First few:`)
    for (const f of failed.slice(0, 3)) console.log(`  ${f.arm} / ${f.caseId}: ${f.error}`)
    console.log()
  }

  // Per case per arm: average the repeats first, so one lucky sample cannot
  // stand in for a case.
  const byArm = new Map<string, Map<string, number[]>>()
  const cost = new Map<string, number>()
  const lat = new Map<string, number[]>()
  for (const s of samples) {
    if (!byArm.has(s.arm)) { byArm.set(s.arm, new Map()); cost.set(s.arm, 0); lat.set(s.arm, []) }
    cost.set(s.arm, (cost.get(s.arm) || 0) + s.usd)
    if (s.ms) lat.get(s.arm)!.push(s.ms)
    if (Number.isNaN(s.score)) continue
    const m = byArm.get(s.arm)!
    if (!m.has(s.caseId)) m.set(s.caseId, [])
    m.get(s.caseId)!.push(s.score)
  }
  const armCase = new Map<string, Map<string, number>>()
  for (const [arm, m] of byArm) {
    const avg = new Map<string, number>()
    for (const [cid, xs] of m) avg.set(cid, mean(xs))
    armCase.set(arm, avg)
  }

  const w = Math.max(...arms.map(a => a.name.length), 10)
  console.log(`SCORE (${suite.scale})\n`)
  console.log(`  ${'arm'.padEnd(w)}   n    mean    sd     p50 ms    p95 ms    $`)
  for (const a of arms) {
    const xs = [...(armCase.get(a.name)?.values() ?? [])]
    const ls = lat.get(a.name) ?? []
    console.log(
      `  ${a.name.padEnd(w)}  ${String(xs.length).padStart(3)}  ${mean(xs).toFixed(3)}  ${stdev(xs).toFixed(3)}` +
      `  ${String(Math.round(pct(ls, 0.5))).padStart(7)}  ${String(Math.round(pct(ls, 0.95))).padStart(7)}` +
      `  ${(cost.get(a.name) || 0).toFixed(4)}`,
    )
  }

  // Noise floor from the null arm, if present.
  const baseName = arms[0].name
  const nullName = arms.find(a => a.name.endsWith('(null control)'))?.name
  let floor: number | null = null
  if (nullName) {
    const d = pairDeltas(armCase, baseName, nullName)
    floor = mean(d.map(Math.abs))
    const r = paired(d, { seed: opts.seed })
    console.log(`\nNOISE FLOOR (baseline vs itself)`)
    console.log(`  mean |delta| ${floor.toFixed(3)} · mean delta ${r.meanDelta.toFixed(3)} · 95% CI [${r.ci95[0].toFixed(3)}, ${r.ci95[1].toFixed(3)}]`)
    console.log(`  Read this as the smallest difference this harness can honestly resolve.`)
  }

  const counts = arms.map(a => armCase.get(a.name)?.size ?? 0)
  if (new Set(counts).size > 1) {
    console.log(`\nWARNING: arms scored different numbers of cases (${counts.join(', ')}).`)
    console.log(`Pairing below uses only cases present in both arms, so the comparison stays valid,`)
    console.log(`but a large imbalance means failures were not random and the run should be repeated.`)
  }

  console.log(`\nPAIRED vs ${baseName}\n`)
  for (const a of arms.slice(1)) {
    if (a.name === nullName) continue
    const d = pairDeltas(armCase, baseName, a.name)
    if (!d.length) { console.log(`  ${a.name}: no comparable cases`); continue }
    const r = paired(d, { seed: opts.seed })
    console.log(`  ${a.name}`)
    console.log(`    delta ${r.meanDelta >= 0 ? '+' : ''}${r.meanDelta.toFixed(3)} · 95% CI [${r.ci95[0].toFixed(3)}, ${r.ci95[1].toFixed(3)}] · win/loss/tie ${r.wins}/${r.losses}/${r.ties} · sign p=${r.pSign.toFixed(4)}`)
    const dc = (cost.get(a.name) || 0) - (cost.get(baseName) || 0)
    const dl = pct(lat.get(a.name) ?? [], 0.5) - pct(lat.get(baseName) ?? [], 0.5)
    console.log(`    cost ${dc >= 0 ? '+' : ''}$${dc.toFixed(4)} · median latency ${dl >= 0 ? '+' : ''}${Math.round(dl)}ms`)
    console.log(`    ${verdict(r, floor)}\n`)
  }

  // Per-slice breakdown. An overall delta can hide two effects cancelling.
  if (suite.groupOf) {
    const groups = new Map<string, string[]>()
    for (const c of cases) {
      const g = suite.groupOf(c)
      if (!groups.has(g)) groups.set(g, [])
      groups.get(g)!.push(c.id)
    }
    if (groups.size > 1) {
      console.log(`BY SLICE (delta vs ${baseName})\n`)
      const gw = Math.max(...[...groups.keys()].map(g => g.length))
      const armsToShow = arms.slice(1).filter(a => a.name !== nullName)
      console.log(`  ${'slice'.padEnd(gw)}   n   ` + armsToShow.map(a => a.name.padStart(12)).join('  '))
      for (const [g, ids] of groups) {
        const idSet = new Set(ids)
        const cells = armsToShow.map(a => {
          const d = pairDeltas(armCase, baseName, a.name).length
            ? pairDeltasFiltered(armCase, baseName, a.name, idSet)
            : []
          return (d.length ? `${mean(d) >= 0 ? '+' : ''}${mean(d).toFixed(2)}` : '—').padStart(12)
        })
        console.log(`  ${g.padEnd(gw)}  ${String(ids.length).padStart(2)}   ` + cells.join('  '))
      }
      console.log()
    }
  }

  mkdirSync(opts.outDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const path = resolve(opts.outDir, `${suite.name}-${stamp}.json`)
  writeFileSync(path, JSON.stringify({ suite: suite.name, opts, arms: arms.map(a => a.name), samples }, null, 2))
  console.log(`report: ${path}`)
}

function pairDeltasFiltered(armCase: Map<string, Map<string, number>>, base: string, other: string, keep: Set<string>): number[] {
  const a = armCase.get(base), b = armCase.get(other)
  if (!a || !b) return []
  const out: number[] = []
  for (const [cid, av] of a) { if (!keep.has(cid)) continue; const bv = b.get(cid); if (bv !== undefined) out.push(bv - av) }
  return out
}

function pairDeltas(armCase: Map<string, Map<string, number>>, base: string, other: string): number[] {
  const a = armCase.get(base), b = armCase.get(other)
  if (!a || !b) return []
  const out: number[] = []
  for (const [cid, av] of a) { const bv = b.get(cid); if (bv !== undefined) out.push(bv - av) }
  return out
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
