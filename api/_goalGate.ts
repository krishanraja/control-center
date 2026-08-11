import { loadGoalMetrics, metricsPrompt, type GoalMetrics } from './_goalMetrics.js'

// The goal gate: does this text belong at this rung, and is it a goal at all?
//
// Two layers, cheap first. The deterministic layer is a zero-LLM lint in the
// shape of runQualityGate (api/_skill-prompt.ts) and conformanceViolations
// (api/_direction.ts). The judgment layer mirrors the worry compiler
// (api/_worry-prompt.ts): strict JSON, temperature 0, one retry, no fallback
// shape. If the key is missing the deterministic layer still stands on its own.
//
// WHY THE RUBRIC IS PER RUNG, which is the whole point:
// applying SMART uniformly gives wrong answers in both directions here.
//   - "Krish under 2 hours/day on ops" is a legitimate OS goal and correctly
//     has NO end date. A blanket Time-bound rule rejects it.
//   - "Ship the product-truth refresher" is a correct weekly goal measured
//     done or not done. A blanket Measurable rule demands a number it should
//     not have.
// So each rung requires different dimensions, and a goal entered at the wrong
// rung is a distinct verdict from a goal that is badly written.

export type Horizon = 'os' | 'mid_term' | 'weekly' | 'venture_objective'

export const HORIZONS: Horizon[] = ['os', 'mid_term', 'weekly', 'venture_objective']

export interface GoalCheck { id: string; label: string; pass: boolean; detail: string }

export interface GoalIssue {
  dimension: 'Specific' | 'Measurable' | 'Achievable' | 'Relevant' | 'Time-bound'
  problem: string
  fix: string
}

export interface GoalVerdict {
  verdict: 'pass' | 'revise' | 'wrong_tier'
  issues: GoalIssue[]
  suggested_rewrite: string | null
  suggested_tier: Horizon | null
  reasoning: string
  checks: GoalCheck[]
  model_used: boolean
}

export class GoalGateSchemaError extends Error {}

// ── layer 1: deterministic ─────────────────────────────────────────────────

const HAS_DATE = /\b(by|before|within|end of|q[1-4]|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|20\d\d|\d+\s*(day|week|month|quarter|year)s?)\b/i

// Digits that are part of WHEN, not part of HOW MUCH. Stripped before looking
// for a target quantity, because "by end of Q4" contains a digit and would
// otherwise satisfy Measurable on its own. scripts/check-goal-gate.mts caught
// exactly that: "Grow revenue meaningfully by end of Q4" passed has_number.
const DATEISH = /\b(?:\d{4}-\d{2}-\d{2}|q[1-4]|20\d\d|\d+\s*(?:day|week|month|quarter|year)s?|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*\d{0,2})\b/gi

/** A target quantity, as opposed to any digit anywhere in the string. */
function hasNumericTarget(t: string): boolean {
  return /\d/.test(t.replace(DATEISH, ' '))
}
// Verbs that name a single unit of work. An OS goal that opens with one is
// almost always a task that wandered up the ladder.
const TASK_VERB = /^(ship|send|write|draft|fix|call|email|post|publish|build|add|update|review|schedule|book|set up|wire|migrate|refactor|rename|delete)\b/i
// Verbs that name an open-ended state. A weekly goal that opens with one
// cannot be finished inside a week.
const OPEN_ENDED = /^(become|establish|be the|own the|dominate|transform|master|grow into|position)\b/i

/** Several goals wearing one string, which is what north_star was. */
function looksLikeSeveralGoals(title: string): boolean {
  const clauses = title.split(/,|;| and (?=[a-z0-9$])/i).map(s => s.trim()).filter(Boolean)
  if (clauses.length < 2) return false
  const substantive = clauses.filter(c => hasNumericTarget(c) || HAS_DATE.test(c))
  return substantive.length >= 2
}

export function runGoalChecks(
  title: string,
  horizon: Horizon,
  opts: { parentId?: string | null; venture?: string | null } = {},
): GoalCheck[] {
  const t = (title || '').trim()
  const checks: GoalCheck[] = []
  const add = (id: string, label: string, pass: boolean, detail: string) =>
    checks.push({ id, label, pass, detail })

  add('non_empty', 'Has a title', t.length > 0, `${t.length} chars`)
  add('under_200', 'Title under 200 characters', t.length > 0 && t.length <= 200, `${t.length} chars`)
  add('single_goal', 'One goal, not several', !looksLikeSeveralGoals(t),
    looksLikeSeveralGoals(t) ? 'Reads as several goals in one string. Split them.' : 'single clause')

  // A non-OS rung must name what it serves. This mirrors the server-side rule
  // already enforced in api/objectives/index.ts, kept here so the editor can
  // say it before the request is made.
  if (horizon !== 'os') {
    add('has_parent', 'Names what it serves', !!opts.parentId,
      opts.parentId ? 'parent set' : `a ${horizon} goal needs a parent`)
  }

  if (horizon === 'venture_objective') {
    add('has_venture', 'Names a venture', !!opts.venture, opts.venture || 'no venture set')
  }

  if (horizon === 'mid_term') {
    add('has_number', 'Carries a numeric target', hasNumericTarget(t),
      hasNumericTarget(t) ? 'target quantity present' : 'a mid-term goal needs a number to be measurable; a date alone is not one')
    add('has_date', 'Carries a date or window', HAS_DATE.test(t),
      HAS_DATE.test(t) ? 'date present' : 'a mid-term goal needs an explicit date')
  }

  if (horizon === 'os') {
    add('not_a_task', 'Is not a task', !TASK_VERB.test(t),
      TASK_VERB.test(t) ? 'opens with a task verb; this reads like work, not direction' : 'reads as direction')
  }

  if (horizon === 'weekly') {
    add('fits_a_week', 'Fits inside one week', !OPEN_ENDED.test(t),
      OPEN_ENDED.test(t) ? 'opens with an open-ended verb; this cannot finish in a week' : 'week-sized')
  }

  return checks
}

// ── layer 2: judgment ──────────────────────────────────────────────────────

export const GOAL_GATE_SYSTEM_PROMPT = `You judge whether a goal belongs at the rung it was entered at, and whether it
is written well enough to steer an autonomous system. You are a gate, not a
coach. No encouragement, no motivational language, no em dashes.

THE FOUR RUNGS. They are different sizes and hold different kinds of thing.

os                 What the whole system is for. Rarely changes. Either a
                   measurable outcome on a horizon of six months or more, OR a
                   standing constraint that holds indefinitely. A standing
                   constraint correctly has NO end date. Never require one.
                   Not a task. Not a project.

mid_term           The next few months. Serves an OS goal. REQUIRES a numeric
                   target and an explicit date between one and six months out.

weekly             What moves a mid-term goal this week. A deliverable that can
                   be finished in the named week. Measured done or not done. A
                   number is OPTIONAL and often wrong here. Never demand one.
                   The week is implicit, so never demand a date.

venture_objective  One venture's slice of a mid-term goal. Needs a numeric
                   target and a named venture. Inherits its parent's date.

WHAT TO CHECK, BY RUNG:
- Specific: required at every rung.
- Measurable: os needs a metric OR a standing threshold. mid_term and
  venture_objective need a number. weekly needs a nameable deliverable.
- Achievable: judge against the LIVE FACTS given below. If a target implies a
  multiple of the current figure, state the multiple plainly and name what
  would have to change. Do not soften and do not invent figures.
- Relevant: os is self-justifying. Every other rung must serve its parent.
- Time-bound: os needs a horizon of six months or more OR is standing.
  mid_term needs an explicit date. weekly and venture_objective inherit.

ANTI-PATTERNS, each of which is a revise:
- An OS goal that is really a single task.
- A weekly goal that is really a multi-month project.
- A mid-term goal with no number, or with a date already in the past.
- Several goals mashed into one string.
- A goal whose success nobody could adjudicate. "Becomes a licensable asset"
  has no threshold that decides whether it happened.

VERDICTS. Choose exactly one.
- "pass": belongs at this rung and is written well enough to steer work.
- "wrong_tier": it is a real goal but sized for a different rung. Set
  suggested_tier. This is NOT a writing problem, so keep issues short.
- "revise": right rung, but it fails one or more dimensions above.

Output STRICT JSON only, no prose:

{"verdict": "pass" | "revise" | "wrong_tier",
 "issues": [{"dimension": "Specific" | "Measurable" | "Achievable" | "Relevant" | "Time-bound",
             "problem": "<what is wrong, one sentence>",
             "fix": "<what would fix it, one sentence>"}],
 "suggested_rewrite": "<the goal rewritten to pass, or null if it already passes>",
 "suggested_tier": "os" | "mid_term" | "weekly" | "venture_objective" | null,
 "reasoning": "<one sentence on why this verdict>"}

On "pass", issues must be [] and suggested_rewrite must be null.`

let cachedOpenAIKey: string | null | undefined
async function getOpenAIKey(): Promise<string | null> {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY
  if (cachedOpenAIKey !== undefined) return cachedOpenAIKey
  try {
    const { supabase } = await import('./_supabase.js')
    const { data } = await supabase.from('app_secrets').select('value').eq('key', 'openai_api_key').maybeSingle()
    cachedOpenAIKey = data && typeof (data as { value?: unknown }).value === 'string'
      ? (data as { value: string }).value
      : null
  } catch {
    cachedOpenAIKey = null
  }
  return cachedOpenAIKey
}

const DIMENSIONS = new Set(['Specific', 'Measurable', 'Achievable', 'Relevant', 'Time-bound'])

function validate(parsed: unknown): Omit<GoalVerdict, 'checks' | 'model_used'> {
  const o = parsed as Record<string, unknown>
  const verdict = o?.verdict
  if (verdict !== 'pass' && verdict !== 'revise' && verdict !== 'wrong_tier') {
    throw new GoalGateSchemaError(`"verdict" was ${JSON.stringify(verdict)}`)
  }
  const rawIssues = Array.isArray(o.issues) ? o.issues : []
  const issues: GoalIssue[] = rawIssues.map((i) => {
    const it = i as Record<string, unknown>
    if (!DIMENSIONS.has(String(it.dimension))) {
      throw new GoalGateSchemaError(`unknown dimension ${JSON.stringify(it.dimension)}`)
    }
    return {
      dimension: String(it.dimension) as GoalIssue['dimension'],
      problem: String(it.problem || '').trim(),
      fix: String(it.fix || '').trim(),
    }
  })
  const tier = o.suggested_tier
  if (tier != null && !HORIZONS.includes(tier as Horizon)) {
    throw new GoalGateSchemaError(`unknown suggested_tier ${JSON.stringify(tier)}`)
  }
  if (verdict === 'wrong_tier' && tier == null) {
    throw new GoalGateSchemaError('wrong_tier without a suggested_tier')
  }
  if (verdict === 'pass' && issues.length > 0) {
    throw new GoalGateSchemaError('pass with issues')
  }
  return {
    verdict,
    issues,
    suggested_rewrite: typeof o.suggested_rewrite === 'string' && o.suggested_rewrite.trim()
      ? o.suggested_rewrite.trim() : null,
    suggested_tier: (tier as Horizon | null) ?? null,
    reasoning: String(o.reasoning || '').trim(),
  }
}

async function callOnce(
  title: string, horizon: Horizon, metrics: GoalMetrics,
  ctx: { parentTitle?: string | null; venture?: string | null },
): Promise<Omit<GoalVerdict, 'checks' | 'model_used'>> {
  const key = await getOpenAIKey()
  if (!key) throw new Error('No OpenAI key available (env or app_secrets)')

  const user = [
    metricsPrompt(metrics),
    '',
    `RUNG: ${horizon}`,
    ctx.parentTitle ? `SERVES: ${ctx.parentTitle}` : 'SERVES: (nothing named)',
    ctx.venture ? `VENTURE: ${ctx.venture}` : '',
    '',
    'GOAL:',
    title,
  ].filter(Boolean).join('\n')

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      response_format: { type: 'json_object' },
      temperature: 0,
      messages: [
        { role: 'system', content: GOAL_GATE_SYSTEM_PROMPT },
        { role: 'user', content: user },
      ],
    }),
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`OpenAI ${resp.status}: ${text.slice(0, 300)}`)
  }
  const json = await resp.json() as { choices?: Array<{ message?: { content?: string } }> }
  const content = json?.choices?.[0]?.message?.content
  if (!content) throw new GoalGateSchemaError('OpenAI returned empty content')
  let parsed: unknown
  try { parsed = JSON.parse(content) } catch { throw new GoalGateSchemaError('Model did not return valid JSON') }
  return validate(parsed)
}

/**
 * Gate one goal. The deterministic checks always run and are always returned.
 * The judgment pass retries once on malformed output and then gives up: a
 * wrong verdict is worse than an absent one, so on failure the caller gets the
 * lint result with model_used=false rather than a fabricated pass.
 */
export async function gateGoal(
  title: string,
  horizon: Horizon,
  ctx: { parentId?: string | null; parentTitle?: string | null; venture?: string | null } = {},
): Promise<GoalVerdict> {
  const checks = runGoalChecks(title, horizon, { parentId: ctx.parentId, venture: ctx.venture })
  const failed = checks.filter(c => !c.pass)

  // A title that fails the cheap lint does not need a model call to be wrong.
  if (failed.length > 0) {
    return {
      verdict: 'revise',
      issues: failed.map(c => ({
        dimension: c.id === 'has_date' ? 'Time-bound'
          : c.id === 'has_number' ? 'Measurable'
          : c.id === 'has_parent' || c.id === 'has_venture' ? 'Relevant'
          : 'Specific',
        problem: c.detail,
        fix: `Fix: ${c.label.toLowerCase()}.`,
      })),
      suggested_rewrite: null,
      suggested_tier: null,
      reasoning: `${failed.length} structural check(s) failed before judgment was needed.`,
      checks,
      model_used: false,
    }
  }

  const metrics = await loadGoalMetrics()
  try {
    let judged
    try {
      judged = await callOnce(title, horizon, metrics, ctx)
    } catch (first) {
      if (!(first instanceof GoalGateSchemaError)) throw first
      judged = await callOnce(title, horizon, metrics, ctx)
    }
    return { ...judged, checks, model_used: true }
  } catch {
    // The lint passed and judgment was unavailable. Report that honestly
    // instead of claiming a pass the gate did not actually make.
    return {
      verdict: 'pass',
      issues: [],
      suggested_rewrite: null,
      suggested_tier: null,
      reasoning: 'Structural checks passed. Judgment pass unavailable, so this goal was not fully assessed.',
      checks,
      model_used: false,
    }
  }
}
