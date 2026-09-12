#!/usr/bin/env tsx
/**
 * Model routing is a task policy, not a collection of arbitrary literals.
 *
 * This guard covers the decisions that are safe to assert without live evals:
 * narrow classifiers use the small tier, bounded generation uses the middle
 * tier, research uses a search model, and no active n8n workflow silently
 * reintroduces a retired or unjustified premium model. Sonnet 4.6 remains an
 * explicit migration queue because Sonnet 5 changes thinking, sampling and
 * tokenisation; upgrading those calls requires prompt-specific evals.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const N8N = join(process.cwd(), 'scripts', 'n8n')

interface RouteAssertion {
  file: string
  rationale: string
  includes: string[]
  excludes?: string[]
}

const ROUTES: RouteAssertion[] = [
  {
    file: 'krish-inbox-classifier.workflow.json',
    rationale: 'high-volume constrained classification belongs on Haiku',
    includes: ["model: 'claude-haiku-4-5'", 'Bearer {{N8N_PROXY_SECRET}}'],
    excludes: ['claude-sonnet-4-6'],
  },
  {
    file: 'krish-focus-calibrator.workflow.json',
    rationale: 'cross-table business relevance needs Sonnet, but not thinking',
    includes: ["model: 'claude-sonnet-5'", "thinking: { type: 'disabled' }", 'Bearer {{N8N_PROXY_SECRET}}'],
  },
  {
    file: 'sonnet-task-lever-rater.workflow.json',
    rationale: '20-row structured business scoring does not justify Opus',
    includes: ["model: 'claude-sonnet-5'", 'max_tokens: 2000', "thinking: { type: 'disabled' }"],
    excludes: ['claude-opus-5', 'max_tokens: 16000'],
  },
  {
    file: 'cleo-content-idea-capture.workflow.json',
    rationale: 'schema extraction is a nano task',
    includes: ['gpt-5.4-nano'],
  },
  {
    file: 'zara-layer-1-signal-inbox-drive-watcher.workflow.json',
    rationale: 'structured extraction and ranking are nano tasks',
    includes: ['gpt-5.4-nano'],
    excludes: ['gpt-4.1-nano'],
  },
  {
    file: 'cleo-omnichannel-content-factory.workflow.json',
    rationale: 'fallback drafting needs mini quality, not a legacy flagship',
    includes: ['gpt-5.4-mini'],
    excludes: ['model: \\"gpt-4o\\"'],
  },
]

const API_ROUTES = [
  {
    file: 'api/_goalGate.ts',
    rationale: 'bounded rubric judgment belongs on the OpenAI judge route',
    includes: ['OPENAI_JUDGE_MODEL', 'process.env.OPENAI_JUDGE_MODEL'],
  },
  {
    file: 'api/_skill-prompt.ts',
    rationale: 'full skill generation belongs on the OpenAI generation route',
    includes: ['OPENAI_GENERATION_MODEL', 'process.env.OPENAI_SKILL_MODEL'],
  },
]

const failures: string[] = []
for (const route of ROUTES) {
  const source = readFileSync(join(N8N, route.file), 'utf8')
  for (const expected of route.includes) {
    if (!source.includes(expected)) failures.push(`${route.file}: missing ${expected} (${route.rationale})`)
  }
  for (const forbidden of route.excludes || []) {
    if (source.includes(forbidden)) failures.push(`${route.file}: contains ${forbidden} (${route.rationale})`)
  }
}
for (const route of API_ROUTES) {
  const source = readFileSync(join(process.cwd(), route.file), 'utf8')
  for (const expected of route.includes) {
    if (!source.includes(expected)) failures.push(`${route.file}: missing ${expected} (${route.rationale})`)
  }
}

const MODEL = /(?:claude-(?:opus|sonnet|haiku|fable)-\d+(?:-\d+)*(?:-\d{8})?|gpt-(?:\d+(?:\.\d+)*|4o)(?:-(?:nano|mini|transcribe))?|gemini-\d+(?:\.\d+)?-(?:flash|pro)|sonar(?:-pro)?)/g
const forbiddenActive = new Set(['gpt-4.1-nano', 'gpt-4o', 'claude-opus-5'])
const inventory = new Map<string, number>()
let activeAiWorkflows = 0
let sonnet46Workflows = 0

for (const name of readdirSync(N8N).filter(n => n.endsWith('.workflow.json') && !n.startsWith('zz-archived-'))) {
  const source = readFileSync(join(N8N, name), 'utf8')
  const workflow = JSON.parse(source) as { active?: boolean }
  if (!workflow.active) continue
  const models = new Set(source.match(MODEL) || [])
  if (!models.size) continue
  activeAiWorkflows += 1
  if (models.has('claude-sonnet-4-6')) sonnet46Workflows += 1
  for (const model of models) {
    inventory.set(model, (inventory.get(model) || 0) + 1)
    if (forbiddenActive.has(model)) failures.push(`${name}: active workflow uses disallowed ${model}`)
  }
}

if (failures.length) {
  console.error(`FAIL: ${failures.length} model-routing invariant(s) broken.`)
  for (const failure of failures) console.error(`  ${failure}`)
  process.exit(1)
}

console.log(`PASS  ${ROUTES.length + API_ROUTES.length} task routes enforced across ${activeAiWorkflows} active AI workflows`)
console.log(`INFO  Sonnet 4.6 migration queue: ${sonnet46Workflows} active workflows (eval before changing)`)
console.log(`INFO  active model inventory: ${[...inventory].sort().map(([m, n]) => `${m}=${n}`).join(', ')}`)
