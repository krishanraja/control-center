// Paired statistics for prompt A/B runs.
//
// The reason this file exists rather than a mean() one-liner: an LLM scored by
// an LLM is a noisy instrument, and the noise is large relative to the effects
// people claim. Printing "4.1 versus 4.3, B wins" from ten samples is worse
// than printing nothing, because it converts noise into a decision. Everything
// here is built to make the noise visible alongside the effect.

/** Deterministic PRNG so a bootstrap is reproducible across runs. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
}

export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1))
}

export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos), hi = Math.ceil(pos)
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

export interface PairedResult {
  n: number
  meanDelta: number
  ci95: [number, number]
  wins: number
  losses: number
  ties: number
  /** Two-sided sign-test p-value over non-tied pairs. */
  pSign: number
}

/** Exact two-sided sign test. No dependency, no normal approximation. */
export function signTest(wins: number, losses: number): number {
  const n = wins + losses
  if (n === 0) return 1
  const k = Math.min(wins, losses)
  // Sum of binomial pmf up to k, doubled, clamped at 1.
  let logC = 0, tail = 0
  for (let i = 0; i <= k; i++) {
    if (i > 0) logC += Math.log((n - i + 1) / i)
    tail += Math.exp(logC - n * Math.LN2)
  }
  return Math.min(1, 2 * tail)
}

/**
 * Paired bootstrap over CASES, not over samples.
 *
 * Resampling individual samples would treat two runs of the same case as
 * independent evidence, which they are not, and would shrink the interval to
 * something flattering and wrong. The unit of independent evidence is the case.
 */
export function paired(deltas: number[], opts: { iterations?: number; seed?: number; tieBand?: number } = {}): PairedResult {
  const n = deltas.length
  const iterations = opts.iterations ?? 5000
  const tie = opts.tieBand ?? 0
  const rand = mulberry32(opts.seed ?? 1)

  const wins = deltas.filter(d => d > tie).length
  const losses = deltas.filter(d => d < -tie).length

  const means: number[] = []
  for (let i = 0; i < iterations; i++) {
    let s = 0
    for (let j = 0; j < n; j++) s += deltas[Math.floor(rand() * n)]
    means.push(s / n)
  }
  means.sort((a, b) => a - b)

  return {
    n,
    meanDelta: mean(deltas),
    ci95: [quantile(means, 0.025), quantile(means, 0.975)],
    wins,
    losses,
    ties: n - wins - losses,
    pSign: signTest(wins, losses),
  }
}

/**
 * The verdict, given a measured effect and the harness's own noise floor.
 *
 * `floor` is the mean absolute delta observed when the baseline is run against
 * ITSELF. An effect smaller than the instrument's own scatter is not a small
 * effect, it is an unmeasured one, and the honest report says so rather than
 * quoting a direction.
 */
export function verdict(r: PairedResult, floor: number | null): string {
  const crossesZero = r.ci95[0] <= 0 && r.ci95[1] >= 0
  if (crossesZero) return 'INCONCLUSIVE — the 95% interval contains zero'
  if (floor !== null && Math.abs(r.meanDelta) < floor) {
    return `INCONCLUSIVE — effect (${r.meanDelta.toFixed(3)}) is inside the noise floor (${floor.toFixed(3)})`
  }
  const dir = r.meanDelta > 0 ? 'BETTER' : 'WORSE'
  return `${dir} — interval excludes zero${floor !== null ? ` and clears the noise floor (${floor.toFixed(3)})` : ''}`
}
