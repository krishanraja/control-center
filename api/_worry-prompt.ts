import { getOperatorTz, ymdIn, shiftYmd as tzShift } from './_timezone.js'
import { callClaude, robustJson } from './_content.js'
import { UTILITY_MODEL } from './_models.js'
/**
 * The worry compiler's system prompt and LLM call.
 *
 * Runs on Claude through the repo's shared client (api/_content.ts callClaude),
 * same as every other judgment call here. It was the last call site on OpenAI,
 * and on gpt-4o: the oldest model in the codebase running the sharpest prompt
 * in it.
 *
 * The contract is unchanged and is the reason this file is careful. Every
 * compilation must terminate in one of four states, a malformed one is retried
 * exactly once and then fails loudly, and there is no fallback shape — a wrong
 * compilation is worse than no compilation, because the whole point is to stop
 * a worry from being carried around unresolved.
 */

export const WORRY_COMPILER_SYSTEM_PROMPT = `You are a worry compiler for one specific operator. His failure loop: a worry
arrives, he promotes it from a bounded problem to a referendum on his identity
and future, then regulates the anxiety with research, reorganization, planning,
and reopened decisions. Nothing external ships. Your job is to break that loop
by compiling the raw worry into exactly one terminal state.

Rules you operate by:
1. Convert abstract processing to concrete processing. Abstract phrasing asks
   why and what it means. Concrete phrasing names an observable action, a
   recipient, and a date. Always move toward concrete.
2. Worry is a prediction wearing a disguise. If the worry contains an implicit
   forecast about the world, extract it as a falsifiable prediction and design
   the cheapest, fastest real-world test. Small and ugly beats thorough.
3. A worry that is really a reopened past decision gets one question only:
   what NEW evidence arrived since the decision was made? Discomfort is not
   evidence.
4. A worry that is unfalsifiable and outside his control is weather. Label it
   plainly. Do not solve it, reframe it, or soften it.
5. Never prescribe research, reading, planning, thinking it over, or waiting
   for clarity. Those are the loop. Every output must terminate in contact
   with reality or in closure.
6. Tests must be completable within 7 days and cost under 30 minutes to run.
7. Actions must be completable in 15 minutes and end with something leaving
   his machine toward another human.
8. Tone: direct, calm, zero reassurance, zero motivational language. You are
   a compiler, not a coach.

Output STRICT JSON only, no prose, matching exactly one of:

{"state": "test", "belief": "<the belief underneath the worry, one sentence>",
 "prediction": "<falsifiable prediction with a number or observable outcome>",
 "test_plan": "<cheapest concrete test, who is contacted, what is sent>",
 "test_due_date": "<YYYY-MM-DD within 7 days>",
 "reasoning": "<one sentence on why this state>"}

{"state": "action", "action_text": "<one 15-minute action: verb, artifact,
 recipient>", "reasoning": "<one sentence>"}

{"state": "relitigation", "original_decision": "<the decision being reopened,
 one sentence>", "evidence_question": "What new evidence has arrived since
 this was decided?", "reasoning": "<one sentence>"}

{"state": "weather", "label": "<the worry restated as an unfalsifiable or
 uncontrollable condition, one sentence>", "reasoning": "<one sentence>"}

If the raw text contains multiple worries, compile only the one with the
largest real-world consequence and note the count in reasoning.`

export type WorryState = 'test' | 'action' | 'relitigation' | 'weather'

export interface CompiledWorry {
  state: WorryState
  reasoning: string
  belief?: string
  prediction?: string
  test_plan?: string
  test_due_date?: string
  action_text?: string
  original_decision?: string
  evidence_question?: string
  label?: string
}

/** Thrown when the model returns something that is not a valid compilation. */
export class CompilerSchemaError extends Error {}

const YMD = /^\d{4}-\d{2}-\d{2}$/

/**
 * Validates model output against the four state shapes. Returns the compilation
 * or throws CompilerSchemaError, which is what triggers the single retry.
 */
export function validateCompilation(
  raw: unknown,
  bounds?: { min: string; max: string },
): CompiledWorry {
  if (!raw || typeof raw !== 'object') throw new CompilerSchemaError('Output was not an object')
  const o = raw as Record<string, unknown>

  const str = (k: string): string => {
    const v = o[k]
    if (typeof v !== 'string' || !v.trim()) throw new CompilerSchemaError(`Missing or empty "${k}"`)
    return v.trim()
  }

  const state = o.state
  if (state !== 'test' && state !== 'action' && state !== 'relitigation' && state !== 'weather') {
    throw new CompilerSchemaError(`"state" was ${JSON.stringify(state)}`)
  }
  const reasoning = str('reasoning')

  if (state === 'test') {
    const due = str('test_due_date')
    if (!YMD.test(due)) throw new CompilerSchemaError(`"test_due_date" was ${JSON.stringify(due)}`)
    if (bounds && (due < bounds.min || due > bounds.max)) {
      throw new CompilerSchemaError(`"test_due_date" ${due} is outside ${bounds.min}..${bounds.max}`)
    }
    return {
      state, reasoning,
      belief: str('belief'),
      prediction: str('prediction'),
      test_plan: str('test_plan'),
      test_due_date: due,
    }
  }

  if (state === 'action') {
    return { state, reasoning, action_text: str('action_text') }
  }

  if (state === 'relitigation') {
    return {
      state, reasoning,
      original_decision: str('original_decision'),
      evidence_question: str('evidence_question'),
    }
  }

  return { state, reasoning, label: str('label') }
}

/**
 * What the worry is actually about.
 *
 * The compiler used to see the worry text and today's date, and nothing else.
 * Its own rules forbid prescribing research or planning and demand an action
 * that ends with something leaving the machine toward another human, which is
 * the sharpest anti-summary contract in this repo — and it was applying that
 * contract blind. It could not know the worry was about a bet already marked
 * lost, a stall already open with moves drafted, or a thing already on today's
 * three. Those change the compilation: a worry about an open question is a
 * test, and the same worry about a question already answered is a
 * relitigation.
 *
 * Small and best-effort. A context read that fails must never stop a worry
 * being compiled, so every branch returns a string and none of them throw.
 */
async function businessContext(): Promise<string> {
  try {
    const { supabase } = await import('./_supabase.js')
    const [bets, stalls, focus] = await Promise.all([
      supabase.from('bets').select('hypothesis, kind, status').eq('status', 'live').limit(5),
      supabase.from('growth_stalls').select('metric_key, baseline_value, latest_value').eq('status', 'open').limit(5),
      supabase.from('daily_focus').select('target_1_text, target_2_text, target_3_text')
        .order('focus_date', { ascending: false }).limit(1),
    ])
    const f = focus.data?.[0] as Record<string, string> | undefined
    const three = f ? [f.target_1_text, f.target_2_text, f.target_3_text].filter(Boolean) : []
    const lines = [
      bets.data?.length
        ? `Live bets: ${bets.data.map((b: any) => `"${b.hypothesis}" (${b.kind})`).join('; ')}`
        : 'Live bets: none.',
      stalls.data?.length
        ? `Open growth stalls: ${stalls.data.map((r: any) => `${r.metric_key} ${r.baseline_value} to ${r.latest_value}`).join('; ')}`
        : 'Open growth stalls: none.',
      three.length ? `Today's three: ${three.join(' | ')}` : "Today's three: not set.",
    ]
    return lines.join('\n')
  } catch {
    return 'Business context unavailable for this compilation.'
  }
}

async function callOnce(rawText: string): Promise<CompiledWorry> {
  // The model has no clock. Without today's date it emits a due date from its
  // training data, which lands in the past and makes the test read as already
  // due. The date goes in the user message so the system prompt stays verbatim.
  const today = ymdIn(new Date(), await getOperatorTz())
  const context = await businessContext()
  const dated = [
    `TODAY: ${today}`,
    `A test_due_date must fall between ${tzShift(today, 1)} and ${tzShift(today, 7)}.`,
    '',
    'WHAT IS ALREADY TRUE (use it to tell a live question from a settled one):',
    context,
    '',
    'WORRY:',
    rawText,
  ].join('\n')

  // Claude, not gpt-4o. The prompt is unchanged and so is the four-state
  // contract; only the provider moves. It was the one call site left on
  // OpenAI for a judgment task, on the oldest model in the repo.
  const text = await callClaude({
    agent: 'krish-worry-compiler',
    system: WORRY_COMPILER_SYSTEM_PROMPT,
    user: dated,
    model: UTILITY_MODEL,
    maxTokens: 1200,
    temperature: 0,
  })

  const parsed = robustJson(text)
  if (parsed === null) throw new CompilerSchemaError('Model did not return valid JSON')
  return validateCompilation(parsed, { min: today, max: tzShift(today, 7) })
}

/**
 * Compile one worry. Retries exactly once on malformed output, then fails
 * loudly. A wrong compilation is worse than no compilation, so there is no
 * third attempt and no fallback shape.
 */
export async function compileWorry(rawText: string): Promise<CompiledWorry> {
  try {
    return await callOnce(rawText)
  } catch (first) {
    if (!(first instanceof CompilerSchemaError)) throw first
    try {
      return await callOnce(rawText)
    } catch (second) {
      const detail = second instanceof Error ? second.message : String(second)
      throw new CompilerSchemaError(`Compiler returned malformed output twice: ${detail}`)
    }
  }
}
