// Rendering a run's numbers, separated from producing them.
//
// Split out so a finished run can be re-read: reports carry every sample, so
// changing how a result is interpreted should never mean paying for the
// generations again. `report.mts` re-renders a saved file through this exact
// code path.

import { mean, stdev, paired, quantile, verdict } from './_stats.mts'

function pearson(x: number[], y: number[]): number {
  if (x.length < 3) return NaN
  const mx = mean(x), my = mean(y)
  let n = 0, dx = 0, dy = 0
  for (let i = 0; i < x.length; i++) { n += (x[i] - mx) * (y[i] - my); dx += (x[i] - mx) ** 2; dy += (y[i] - my) ** 2 }
  return dx && dy ? n / Math.sqrt(dx * dy) : NaN
}

/** Least-squares fit of score on log output length, used to residualise. */
function fitLogLength(samples: Sample[]): { slope: number; intercept: number; r: number } {
  const x = samples.map(s => Math.log(Math.max(1, s.output.length)))
  const y = samples.map(s => s.score)
  const mx = mean(x), my = mean(y)
  let num = 0, den = 0
  for (let i = 0; i < x.length; i++) { num += (x[i] - mx) * (y[i] - my); den += (x[i] - mx) ** 2 }
  const slope = den ? num / den : 0
  return { slope, intercept: my - slope * mx, r: pearson(x, y) }
}

export interface Sample {
  caseId: string
  arm: string
  rep: number
  score: number
  ms: number
  usd: number
  output: string
  group?: string
  detail?: unknown
  error?: string
}

export interface ReportInput {
  suite: string
  describe?: string
  scale: string
  arms: string[]
  samples: Sample[]
  seed: number
}

const NULL_SUFFIX = ' (null control)'

function pct(xs: number[], q: number): number {
  return quantile([...xs].sort((a, b) => a - b), q)
}

function pairDeltas(armCase: Map<string, Map<string, number>>, base: string, other: string, keep?: Set<string>): number[] {
  const a = armCase.get(base), b = armCase.get(other)
  if (!a || !b) return []
  const out: number[] = []
  for (const [cid, av] of a) {
    if (keep && !keep.has(cid)) continue
    const bv = b.get(cid)
    if (bv !== undefined) out.push(bv - av)
  }
  return out
}

export function render(r: ReportInput): void {
  const { arms, samples } = r

  const failed = samples.filter(s => s.error)
  if (failed.length) {
    console.log(`${failed.length}/${samples.length} calls failed after retries. First few:`)
    for (const f of failed.slice(0, 3)) console.log(`  ${f.arm} / ${f.caseId}: ${f.error}`)
    console.log()
  }

  // Average an arm's repeats per case before anything is compared, so one lucky
  // sample cannot stand in for a case.
  const byArm = new Map<string, Map<string, number[]>>()
  const cost = new Map<string, number>()
  const lat = new Map<string, number[]>()
  const groupOfCase = new Map<string, string>()
  for (const s of samples) {
    if (!byArm.has(s.arm)) { byArm.set(s.arm, new Map()); cost.set(s.arm, 0); lat.set(s.arm, []) }
    cost.set(s.arm, (cost.get(s.arm) || 0) + s.usd)
    if (s.ms) lat.get(s.arm)!.push(s.ms)
    if (s.group) groupOfCase.set(s.caseId, s.group)
    if (!Number.isFinite(s.score)) continue
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

  const w = Math.max(...arms.map(a => a.length), 10)
  console.log(`SCORE (${r.scale})\n`)
  console.log(`  ${'arm'.padEnd(w)}   n    mean    sd     p50 ms    p95 ms    $`)
  for (const a of arms) {
    const xs = [...(armCase.get(a)?.values() ?? [])]
    const ls = lat.get(a) ?? []
    console.log(
      `  ${a.padEnd(w)}  ${String(xs.length).padStart(3)}  ${mean(xs).toFixed(3)}  ${stdev(xs).toFixed(3)}` +
      `  ${String(Math.round(pct(ls, 0.5))).padStart(7)}  ${String(Math.round(pct(ls, 0.95))).padStart(7)}` +
      `  ${(cost.get(a) || 0).toFixed(4)}`,
    )
  }

  const baseName = arms[0]
  const nullName = arms.find(a => a.endsWith(NULL_SUFFIX))

  let floor: number | null = null
  if (nullName) {
    const d = pairDeltas(armCase, baseName, nullName)
    const nr = paired(d, { seed: r.seed })
    // How far from zero this instrument drifts BY CHANCE at this sample size:
    // the far edge of the null arm's interval, not the mean per-case scatter.
    // Scatter is a property of a single comparison; the interval already
    // accounts for averaging it over n cases, and a real, consistent effect can
    // legitimately be smaller than the scatter.
    floor = Math.max(Math.abs(nr.ci95[0]), Math.abs(nr.ci95[1]))
    console.log(`\nNOISE FLOOR (baseline vs itself — same prompt, both arms)`)
    console.log(`  mean delta ${nr.meanDelta.toFixed(3)} · 95% CI [${nr.ci95[0].toFixed(3)}, ${nr.ci95[1].toFixed(3)}] · per-case scatter ${mean(d.map(Math.abs)).toFixed(3)}`)
    console.log(`  floor ${floor.toFixed(3)} — an effect this size or smaller is chance at n=${d.length}.`)
  }

  const counts = arms.map(a => armCase.get(a)?.size ?? 0)
  if (new Set(counts).size > 1) {
    console.log(`\nNOTE: arms scored different numbers of cases (${counts.join(', ')}).`)
    console.log(`Pairing uses only cases present in both arms, so each comparison stays valid,`)
    console.log(`but a large imbalance means failures were not random and the run should be repeated.`)
  }

  const candidates = arms.slice(1).filter(a => a !== nullName)
  console.log(`\nPAIRED vs ${baseName}\n`)
  for (const a of candidates) {
    const d = pairDeltas(armCase, baseName, a)
    if (!d.length) { console.log(`  ${a}: no comparable cases\n`); continue }
    const pr = paired(d, { seed: r.seed })
    const dc = (cost.get(a) || 0) - (cost.get(baseName) || 0)
    const dl = pct(lat.get(a) ?? [], 0.5) - pct(lat.get(baseName) ?? [], 0.5)
    console.log(`  ${a}`)
    console.log(`    delta ${pr.meanDelta >= 0 ? '+' : ''}${pr.meanDelta.toFixed(3)} · 95% CI [${pr.ci95[0].toFixed(3)}, ${pr.ci95[1].toFixed(3)}] · win/loss/tie ${pr.wins}/${pr.losses}/${pr.ties} · sign p=${pr.pSign.toFixed(4)}`)
    console.log(`    cost ${dc >= 0 ? '+' : ''}$${dc.toFixed(4)} · median latency ${dl >= 0 ? '+' : ''}${Math.round(dl)}ms`)
    console.log(`    ${verdict(pr, floor)}\n`)
  }

  // ── Judge validity: is the score tracking length rather than quality? ──────
  //
  // This exists because it changed a conclusion. On the first real run of the
  // revise suite the candidate arm looked +0.100 ahead, and the entire gap was
  // output length: its briefs were fuller, so its rewrites were longer, and the
  // Five Standards judge correlates with length at r≈0.57. Residualised, the
  // effect was +0.002. A harness that had not checked would have recommended
  // shipping a change that does nothing.
  //
  // Length is the confound worth checking by default because almost every
  // prompt edit changes output length as a side effect, and almost every rubric
  // that rewards depth or evidence rewards length along with it.
  const scored = samples.filter(s => Number.isFinite(s.score) && s.output)
  if (scored.length >= 8) {
    const fit = fitLogLength(scored)
    const rLen = pearson(scored.map(s => s.output.length), scored.map(s => s.score))
    console.log(`JUDGE DIAGNOSTICS\n`)
    console.log(`  score vs output length: r = ${rLen.toFixed(3)} (log-length r = ${fit.r.toFixed(3)}, n = ${scored.length})`)
    console.log(`  ${'arm'.padEnd(w)}   mean chars`)
    for (const a of arms) {
      const g = scored.filter(s => s.arm === a)
      console.log(`  ${a.padEnd(w)}   ${String(Math.round(mean(g.map(s => s.output.length)) || 0)).padStart(10)}`)
    }
    if (Math.abs(rLen) >= 0.3) {
      console.log(`\n  The judge is tracking length. Repeating the comparison on scores`)
      console.log(`  residualised on log(length), so an arm cannot win by writing more:\n`)
      const rAvg = residualArmCase(scored, fit)
      const nullD = nullName ? pairDeltas(rAvg, baseName, nullName) : []
      const rFloor = nullD.length
        ? (() => { const nr = paired(nullD, { seed: r.seed }); return Math.max(Math.abs(nr.ci95[0]), Math.abs(nr.ci95[1])) })()
        : null
      for (const a of candidates) {
        const d = pairDeltas(rAvg, baseName, a)
        if (!d.length) continue
        const pr = paired(d, { seed: r.seed })
        console.log(`    ${a}  delta ${pr.meanDelta >= 0 ? '+' : ''}${pr.meanDelta.toFixed(3)} · 95% CI [${pr.ci95[0].toFixed(3)}, ${pr.ci95[1].toFixed(3)}] · win/loss/tie ${pr.wins}/${pr.losses}/${pr.ties}`)
        console.log(`      ${verdict(pr, rFloor)}`)
      }
    }
    console.log()
  }

  // Per-slice breakdown. An overall delta near zero can be two slices cancelling.
  const groups = new Map<string, Set<string>>()
  for (const [cid, g] of groupOfCase) {
    if (!groups.has(g)) groups.set(g, new Set())
    groups.get(g)!.add(cid)
  }
  if (groups.size > 1 && candidates.length) {
    console.log(`BY SLICE (delta vs ${baseName})\n`)
    const gw = Math.max(...[...groups.keys()].map(g => g.length), 5)
    console.log(`  ${'slice'.padEnd(gw)}   n   ` + candidates.map(a => a.padStart(12)).join('  '))
    for (const [g, ids] of groups) {
      const cells = candidates.map(a => {
        const d = pairDeltas(armCase, baseName, a, ids)
        return (d.length ? `${mean(d) >= 0 ? '+' : ''}${mean(d).toFixed(2)}` : '—').padStart(12)
      })
      // n counts PAIRED cases, not cases in the slice: one whose generation
      // failed in an arm contributes to neither number beside it.
      const nPaired = pairDeltas(armCase, baseName, candidates[0], ids).length
      console.log(`  ${g.padEnd(gw)}  ${String(nPaired).padStart(2)}   ` + cells.join('  '))
    }
    console.log()
  }
}

/** Per-arm, per-case mean of length-residualised scores. */
function residualArmCase(scored: Sample[], fit: { slope: number; intercept: number }): Map<string, Map<string, number>> {
  const acc = new Map<string, Map<string, number[]>>()
  for (const s of scored) {
    const e = s.score - (fit.intercept + fit.slope * Math.log(Math.max(1, s.output.length)))
    if (!acc.has(s.arm)) acc.set(s.arm, new Map())
    const m = acc.get(s.arm)!
    if (!m.has(s.caseId)) m.set(s.caseId, [])
    m.get(s.caseId)!.push(e)
  }
  const out = new Map<string, Map<string, number>>()
  for (const [arm, m] of acc) {
    const o = new Map<string, number>()
    for (const [cid, xs] of m) o.set(cid, mean(xs))
    out.set(arm, o)
  }
  return out
}
