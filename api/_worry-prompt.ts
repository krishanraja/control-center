import { getOperatorTz, ymdIn, shiftYmd as tzShift } from './_timezone.js'
/**
 * The worry compiler's system prompt and LLM call.
 *
 * Reuses the repo's existing OpenAI pattern (api/_skill-prompt.ts): a plain
 * fetch to chat/completions with response_format json_object, no SDK, no new
 * dependency. Two deliberate differences from callSkillLLM:
 *   - temperature 0, because this is a classifier, not a writer.
 *   - no deterministic stub when the key is missing. callSkillLLM falls back to
 *     a stub; a compiler that silently invents a compilation would be worse
 *     than one that fails, so this throws.
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
 * Resolve the OpenAI key the way the rest of the repo does (api/_embeddings.ts):
 * deploy env first, then the service-role-only app_secrets table, so the
 * compiler works even when the key is not in the Vercel env. Cached per process.
 * The anon client cannot read app_secrets, so this stays server-side.
 */
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



async function callOnce(rawText: string): Promise<CompiledWorry> {
  const key = await getOpenAIKey()
  if (!key) throw new Error('No OpenAI key available (env or app_secrets)')

  // The model has no clock. Without today's date it emits a due date from its
  // training data, which lands in the past and makes the test read as already
  // due. The date goes in the user message so the system prompt stays verbatim.
  const today = ymdIn(new Date(), await getOperatorTz())
  const dated = [
    `TODAY: ${today}`,
    `A test_due_date must fall between ${tzShift(today, 1)} and ${tzShift(today, 7)}.`,
    '',
    'WORRY:',
    rawText,
  ].join('\n')

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      response_format: { type: 'json_object' },
      temperature: 0,
      messages: [
        { role: 'system', content: WORRY_COMPILER_SYSTEM_PROMPT },
        { role: 'user', content: dated },
      ],
    }),
  })

  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`OpenAI ${resp.status}: ${text.slice(0, 300)}`)
  }
  const json = await resp.json() as { choices?: Array<{ message?: { content?: string } }> }
  const content = json?.choices?.[0]?.message?.content
  if (!content) throw new CompilerSchemaError('OpenAI returned empty content')

  let parsed: unknown
  try { parsed = JSON.parse(content) } catch {
    throw new CompilerSchemaError('Model did not return valid JSON')
  }
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
