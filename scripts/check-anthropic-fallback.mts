#!/usr/bin/env tsx
/**
 * A fallback nobody has watched fail is a fallback nobody has.
 *
 * Every Gemini branch in scripts/n8n was inserted in one bulk pass and nine of
 * the eleven could not have worked. Two independent breakages, both silent:
 *
 *   1. The body builder read `src.anthropic_body` off the error item. Each
 *      workflow keys its request differently (anthropicBody, claudeBody,
 *      extract_body, assembly_body) and n8n's error output does not carry the
 *      input json anyway, so Gemini was asked an EMPTY question.
 *   2. The Gemini answer went straight into a parse node reading Anthropic's
 *      `content[0].text`. Gemini returns `candidates[0].content.parts[0].text`,
 *      so the parse found nothing and the run finished "successfully" with
 *      empty output. Maya went further and alerted "LLM call failed" on a
 *      fallback that had in fact answered.
 *
 *   3. The model id itself goes stale. Google retired gemini-2.5-pro and six
 *      fallbacks started answering "no longer available to new users" — with
 *      `neverError: true` set so the parse step can read the body, a 404
 *      renders as a GREEN node. It was found on 2026-09-20 only because the
 *      Anthropic key hit a spend cap that afternoon and the fallback was asked
 *      to work for the first time in months. gemini-2.0-flash had been shut
 *      down since 2026-06-01 on the same terms.
 *
 * Neither shows up in an execution list: the runs are green. So the invariants
 * are asserted here instead of discovered in six months of thin output.
 *
 * GEMINI_ALIVE is not Google's catalogue. It is what answered when probed
 * against THIS project's credential on the date named. The distinction is the
 * whole point: gemini-3.1-pro-preview is current, documented, and useless here,
 * because the key is free-tier and every *pro* model carries a free-tier quota
 * of `limit: 0`. A documentation page would have waved it through.
 *
 * Widening the list means probing first — one 8-token generateContent call on
 * the real credential, candidates[] in the reply — never reading a doc page.
 *
 *   npx tsx scripts/check-anthropic-fallback.mts
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const N8N = join(process.cwd(), 'scripts', 'n8n')
const ANTHROPIC = 'api.anthropic.com'
const GEMINI = 'generativelanguage.googleapis.com'

/** Probed against the live googlePalmApi credential on 2026-09-20. */
const GEMINI_ALIVE = new Set(['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-2.5-flash'])

/** Probed the same day and refused by this project, with the reason. */
const GEMINI_DEAD: Readonly<Record<string, string>> = {
  'gemini-2.5-pro': '404, retired for new users',
  'gemini-2.0-flash': 'shut down 2026-06-01',
  'gemini-3.1-pro-preview': '429, free-tier quota limit 0 - pro needs billing on the Google project',
}

const GEMINI_MODEL = /models\/(gemini-[a-z0-9.-]+?)(?=:|["'\\/\s])/g

interface Node { name: string; type: string; parameters?: Record<string, unknown>; onError?: string; retryOnFail?: boolean; maxTries?: number }
interface Workflow { active?: boolean; nodes: Node[]; connections: Record<string, { main?: Array<Array<{ node: string }>> }> }

const failures: string[] = []
const params = (n: Node | undefined) => JSON.stringify(n?.parameters || {})
let anthropicNodes = 0
let fallbackChains = 0

for (const file of readdirSync(N8N).filter(n => n.endsWith('.workflow.json') && !n.startsWith('zz-archived-'))) {
  const wf = JSON.parse(readFileSync(join(N8N, file), 'utf8')) as Workflow
  if (!wf.active) continue
  const nodes = new Map(wf.nodes.map(n => [n.name, n]))
  const out = (name: string, index = 0) => (wf.connections[name]?.main?.[index] || []).map(t => t.node)
  const bad = (msg: string) => failures.push(`${file}: ${msg}`)

  for (const node of wf.nodes) {
    if (!params(node).includes(ANTHROPIC)) continue
    anthropicNodes += 1

    // A 529 overload is weather, not a bug. A workflow that dies on one is a
    // workflow that dies on weather.
    if (!node.retryOnFail || (node.maxTries ?? 0) < 2) {
      bad(`"${node.name}" calls Anthropic without retryOnFail + maxTries >= 2`)
    }

    if (node.onError !== 'continueErrorOutput') continue

    // An error output wired to nothing is worse than no error output: the
    // failure is swallowed and the run still reports success.
    const errorBranch = out(node.name, 1)
    if (!errorBranch.length) {
      bad(`"${node.name}" declares an error output that is wired to nothing`)
      continue
    }

    for (const entry of errorBranch) {
      const chain = [entry, ...out(entry)]
      const gemini = chain.find(n => params(nodes.get(n)).includes(GEMINI))
      if (!gemini) continue
      fallbackChains += 1

      // The builder must name the node the prompt lives on. Reading it off the
      // error item is what produced the empty prompts.
      const builder = nodes.get(entry)
      if (builder?.type?.endsWith('.code')) {
        const code = String((builder.parameters as { jsCode?: string })?.jsCode || '')
        const named = code.match(/const PROMPT_NODES = (\[[^\]]*\])/)
        if (!named) {
          bad(`"${builder.name}" builds a Gemini body without pinning PROMPT_NODES`)
        } else {
          for (const ref of JSON.parse(named[1]) as string[]) {
            if (!nodes.has(ref)) bad(`"${builder.name}" pins PROMPT_NODES "${ref}", which is not a node in this workflow`)
          }
        }
      }

      // Whatever reads the Gemini answer has to know its shape.
      const after = out(gemini)
      if (!after.length) {
        bad(`"${gemini}" answers into nothing`)
        continue
      }
      for (const next of after) {
        const code = params(nodes.get(next))
        if (!code.includes('candidates')) {
          bad(`"${gemini}" feeds "${next}", which cannot read a Gemini response (no candidates[] handling)`)
        }
      }
    }
  }
}

// Every Gemini id in the mirrors, including the workflows that are switched
// off: a dead id waiting in an inactive workflow is still a dead id, and
// hunter-job-sweep sat on a model Google shut down in June.
const geminiModels = new Map<string, Set<string>>()
for (const file of readdirSync(N8N).filter(n => n.endsWith('.workflow.json') && !n.startsWith('zz-archived-'))) {
  for (const m of readFileSync(join(N8N, file), 'utf8').matchAll(GEMINI_MODEL)) {
    if (!geminiModels.has(m[1])) geminiModels.set(m[1], new Set())
    geminiModels.get(m[1])!.add(file)
  }
}
for (const [id, files] of geminiModels) {
  if (GEMINI_ALIVE.has(id)) continue
  const why = GEMINI_DEAD[id] ?? 'not probed against this credential'
  for (const f of [...files].sort()) failures.push(`${f}: Gemini model "${id}" - ${why}`)
}

// ── The API side ───────────────────────────────────────────────────────────
//
// This block used to open "the API side has no cross-provider fallback by
// design (a user-facing surface should fail loudly rather than answer from a
// model nobody chose)". That stopped being true on 2026-09-23, when three
// Anthropic outages in one month settled the argument the other way: failing
// loudly is only the better answer when somebody is there to hear it, and an
// eight-day lockout is not that. The comment survived the change, which is the
// ordinary way a guard starts describing a system that no longer exists.
//
// What it asserts now is that every transport still has BOTH halves — a retry
// for the transient case and a rescue for the terminal one.
const content = readFileSync(join(process.cwd(), 'api', '_content.ts'), 'utf8')
if (!/RETRY_STATUS/.test(content)) failures.push('api/_content.ts: no RETRY_STATUS set, so a 429/529 is a hard failure')
const proxy = readFileSync(join(process.cwd(), 'api', 'internal', 'sonnet-proxy.ts'), 'utf8')
if (!/RETRY_STATUS/.test(proxy)) failures.push('api/internal/sonnet-proxy.ts: forwards an overload straight to n8n without retrying')

// Each of these went dark for all three outages because the rescue was wired
// into callClaude and nothing else. They are named individually rather than
// checked as a group so a new transport cannot be added without either
// inheriting the rescue or being argued about here.
const RESCUED: Array<{ file: string; fn: string; why: string }> = [
  { file: 'api/_content.ts', fn: 'callClaude', why: '24 call sites inherit this one' },
  { file: 'api/_content.ts', fn: 'callClaudeMessages', why: 'the Cleo composer' },
  { file: 'api/_stream.ts', fn: 'streamClaude', why: 'Ask Marcus and every tab chat' },
]
for (const { file, fn, why } of RESCUED) {
  const src = file === 'api/_content.ts' ? content : readFileSync(join(process.cwd(), ...file.split('/')), 'utf8')
  const body = src.slice(src.indexOf(`export async function ${fn}`))
  const end = body.indexOf('\nexport ')
  const scoped = end > 0 ? body.slice(0, end) : body
  if (!/toRescue|askRescue|streamRescue/.test(scoped)) {
    failures.push(`${file}: ${fn}() has no rescue provider - ${why} would go dark for the whole outage`)
  }
  if (!/anthropicIsShut/.test(scoped)) {
    failures.push(`${file}: ${fn}() does not check the breaker, so a known outage still costs a doomed round trip per call`)
  }
}

// The rescue models are OpenRouter slugs and must stay OUT of the price table:
// the meter records OpenRouter's own usage.cost, and a second rate that has to
// agree with the invoice is the two-price-tables bug this repo already paid for.
const models = readFileSync(join(process.cwd(), 'api', '_models.ts'), 'utf8')
const prices = readFileSync(join(process.cwd(), 'api', '_prices.ts'), 'utf8')
for (const m of models.matchAll(/RESCUE_\w+_MODEL = '([^']+)'/g)) {
  if (!m[1].includes('/')) failures.push(`api/_models.ts: rescue model "${m[1]}" is not an OpenRouter slug (expected a provider/ prefix)`)
  if (prices.includes(`'${m[1]}'`)) failures.push(`api/_prices.ts: rescue model "${m[1]}" has a rate row - the meter uses the provider's own cost, so this is a second price that will drift`)
}

if (failures.length) {
  console.error(`FAIL: ${failures.length} Anthropic fallback invariant(s) broken.\n`)
  for (const f of failures) console.error(`  ${f}`)
  console.error('\nA fallback that cannot see the prompt, whose answer nothing can parse, or whose model Google no longer serves, is not a fallback.')
  process.exit(1)
}

console.log(`PASS  ${anthropicNodes} Anthropic nodes retry; ${fallbackChains} Gemini fallback chains carry a prompt and a shape adapter; ${[...geminiModels.keys()].join(', ')} probed alive`)
