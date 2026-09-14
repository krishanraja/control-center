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
 * Neither shows up in an execution list: the runs are green. So the invariants
 * are asserted here instead of discovered in six months of thin output.
 *
 *   npx tsx scripts/check-anthropic-fallback.mts
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const N8N = join(process.cwd(), 'scripts', 'n8n')
const ANTHROPIC = 'api.anthropic.com'
const GEMINI = 'generativelanguage.googleapis.com'

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

// The API side has no cross-provider fallback by design (a user-facing surface
// should fail loudly rather than answer from a model nobody chose), but it must
// still survive an overload.
const content = readFileSync(join(process.cwd(), 'api', '_content.ts'), 'utf8')
if (!/RETRY_STATUS/.test(content)) failures.push('api/_content.ts: no RETRY_STATUS set, so a 429/529 is a hard failure')
const proxy = readFileSync(join(process.cwd(), 'api', 'internal', 'sonnet-proxy.ts'), 'utf8')
if (!/RETRY_STATUS/.test(proxy)) failures.push('api/internal/sonnet-proxy.ts: forwards an overload straight to n8n without retrying')

if (failures.length) {
  console.error(`FAIL: ${failures.length} Anthropic fallback invariant(s) broken.\n`)
  for (const f of failures) console.error(`  ${f}`)
  console.error('\nA fallback that cannot see the prompt, or whose answer nothing can parse, is not a fallback.')
  process.exit(1)
}

console.log(`PASS  ${anthropicNodes} Anthropic nodes retry; ${fallbackChains} Gemini fallback chains carry a prompt and a shape adapter`)
