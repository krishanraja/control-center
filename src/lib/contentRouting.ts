import type { PublicSeriesKey } from './publicSeries'

// Routing an idea to a format, and refusing to route the ones that belong in
// neither.
//
// ── Why this exists ──────────────────────────────────────────────────────
//
// On 2026-09-09 there were 119 live ideas and not one carried a lane_slot, so
// `laneOf` returned null for every one of them and both format rooms rendered
// empty while the pile sat behind a drawer. The obvious fix is to sort the pile
// into the two rooms.
//
// The obvious fix is wrong on its own. A sample of the same pile ran roughly
// 40 percent governance, safety, security and incident stories, which is the
// exact vocabulary the 2026-08-27 rewrite retired on the grounds that it "exists
// to stop producing those stories". A router with only two outcomes cannot
// express that. It would distribute the noise evenly into both channels and put
// Krish's mastheads on top of it.
//
// So this router has three outcomes, and `null` is the important one. Built is
// how a thing actually got made. Paid is who pays and for what. Everything else
// is refused by name, with the reason recorded, so a refusal can be argued with
// rather than guessed at.
//
// ── What this deliberately is not ────────────────────────────────────────
//
// Not a classifier that pretends to judgement. It reads words. It will be wrong
// at the margin, which is why `routeIdea` returns its reason and why the surface
// shows the verdict as provisional rather than writing it to the row. The
// editorial radar is the thing that should carry real judgement here, and it
// cannot yet: it has returned `no_angle` on both series for all 35 ideas it has
// ever judged, so there is no lens signal in the data to route on.

export type ContentRoute = PublicSeriesKey | null

export interface RouteVerdict {
  route: ContentRoute
  /** Plain-language reason, shown in the UI. Never a bare code. */
  reason: string
  /** True when the router refused rather than failed to decide. The difference
   *  matters: refused means off-beat by name, undecided means no signal. */
  refused: boolean
}

interface Rule {
  /** Whole-word match, case insensitive. Kept as words rather than regex source
   *  so this list stays readable and arguable by someone who is not debugging. */
  terms: string[]
  reason: string
}

// The retired vocabulary, by name. Matching here is a refusal, and it runs
// before either format, because a pricing story about a security incident is a
// security story. Sourced from the 2026-08-27 migration's own list plus the
// three categories it froze.
const OFF_BEAT: Rule[] = [
  {
    terms: [
      'governance', 'compliance', 'regulator', 'regulators', 'regulatory', 'regulation',
      'legislation', 'oversight', 'policy framework', 'guardrails', 'watchdog',
    ],
    reason: 'Governance and regulation, retired from the vocabulary on 2026-08-27',
  },
  {
    terms: [
      'safety', 'unsafe', 'alignment', 'misalignment', 'bioweapon', 'harm', 'harmful',
      'catastrophic', 'existential', 'red team', 'red-team', 'jailbreak', 'jailbroken',
    ],
    reason: 'Safety and alignment, retired from the vocabulary on 2026-08-27',
  },
  {
    terms: [
      'security', 'breach', 'exfiltrate', 'exfiltrating', 'exfiltration', 'attack',
      'attacker', 'attackers', 'hostile', 'malicious', 'exploit', 'exploitable',
      'vulnerability', 'vulnerabilities', 'phishing', 'ransomware', 'incident',
      'incidents', 'rogue', 'threat', 'intrusion',
    ],
    reason: 'Security and incidents, retired from the vocabulary on 2026-08-27',
  },
]

// A different kind of refusal. These are on-topic for some other Mindmake
// surface and off-topic for both publications. They were arriving through
// `aeo_signal` and are the reason the review queue carried fractional-CMO
// directory bait beside real editorial work.
const OFF_PUBLICATION: Rule[] = [
  {
    terms: [
      'fractional', 'chief of staff', 'podcast', 'newsletter directory', 'marketplace pitch',
    ],
    reason: 'Search bait for another surface, not editorial for either publication',
  },
]

// How things make money. Deliberately concrete nouns: the abstract ones
// ("value", "growth") match everything and route nothing.
const PAID: Rule[] = [
  {
    terms: [
      'pricing', 'price', 'prices', 'priced', 'per-seat', 'per seat', 'seats', 'seat',
      'subscription', 'subscriptions', 'tier', 'tiers', 'tiering', 'bundle', 'bundling',
      'metering', 'metered', 'free tier', 'paywall', 'monetise', 'monetize',
      'monetisation', 'monetization',
    ],
    reason: 'Pricing and packaging, which is what The Money of AI is for',
  },
  {
    terms: [
      'revenue', 'arr', 'annualized', 'annualised', 'valuation', 'ipo', 'funding',
      'raised', 'margin', 'margins', 'profit', 'profitable', 'p&l', 'cost per',
      'unit economics', 'ad market', 'advertising', 'adtech', 'cpm', 'spend',
      'billing', 'acquisition', 'acquiring', 'buying', 'roi', 'cost', 'costs',
    ],
    reason: 'Revenue, cost and market structure, which is what The Money of AI is for',
  },
]

// How things actually get built. The parts that broke count double, which is
// the format's own stated promise.
const BUILT: Rule[] = [
  {
    terms: [
      'agent', 'agents', 'agentic', 'orchestration', 'orchestrate', 'pipeline',
      'workflow', 'workflows', 'harness', 'eval', 'evals', 'evaluation harness',
      'benchmark', 'benchmarks', 'fine-tune', 'fine-tuning', 'rag', 'context window',
      'prompt', 'prompts', 'inference', 'latency', 'throughput',
    ],
    reason: 'Building and running the thing, which is what Built With AI is for',
  },
  {
    terms: [
      'shipped', 'deployed', 'deployment', 'rebuilt', 'refactor', 'migration',
      'stack', 'codebase', 'repo', 'integration', 'broke', 'broken', 'regression',
      'postmortem', 'post-mortem', 'rollback',
    ],
    reason: 'How it was built and what broke, which is what Built With AI is for',
  },
]

function hit(haystack: string, rules: Rule[]): Rule | null {
  for (const rule of rules) {
    for (const term of rule.terms) {
      // Word boundaries on both ends, so "rag" does not match "fragment" and
      // "cost" does not match "costume". A short list of English suffixes is
      // tolerated on the tail, because the alternative is listing spend,
      // spends, spending and spent by hand and forgetting one: the first pass
      // of this router left 47 percent of the pile undecided largely because
      // "spend" did not match "spending".
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      if (new RegExp(`(^|[^a-z0-9])${escaped}(s|es|ed|d|ing)?([^a-z0-9]|$)`, 'i').test(haystack)) return rule
    }
  }
  return null
}

export interface RoutableIdea {
  idea?: string | null
  body?: string | null
  meta?: Record<string, unknown> | null
}

/**
 * Decide which publication an idea belongs to, or refuse it.
 *
 * Order is load bearing. A refusal beats a format, because a pricing story
 * about a breach is a breach story. `mindmake_build` beats everything, because
 * Krish's own builds are Built With AI by definition and never need guessing.
 */
export function routeIdea(idea: RoutableIdea): RouteVerdict {
  const meta = (idea.meta || {}) as Record<string, unknown>
  if (meta.mindmake_build === true) {
    return { route: 'built', reason: 'One of your own builds', refused: false }
  }

  // Title first and body second, but both, because a headline can be coy about
  // a story that the first paragraph states plainly.
  const text = `${idea.idea || ''} ${idea.body || ''}`.trim()
  if (!text) {
    return { route: null, reason: 'Nothing written down yet to route on', refused: false }
  }

  const off = hit(text, OFF_BEAT) || hit(text, OFF_PUBLICATION)
  if (off) return { route: null, reason: off.reason, refused: true }

  const paid = hit(text, PAID)
  const built = hit(text, BUILT)

  // Both, or neither, is not a coin toss. Both means the story genuinely spans
  // the two formats and a human should pick; neither means there is no signal.
  // Saying so is more useful than a confident wrong answer, and it keeps the
  // unrouted count honest rather than driving it to zero for its own sake.
  if (paid && built) {
    return { route: null, reason: 'Reads as both formats, so it needs your call', refused: false }
  }
  if (paid) return { route: 'paid', reason: paid.reason, refused: false }
  if (built) return { route: 'built', reason: built.reason, refused: false }
  return { route: null, reason: 'No clear signal for either format', refused: false }
}
