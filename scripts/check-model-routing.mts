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
// One policy, two readers. check-model-routing-live.mts asserts the same table
// against the n8n runtime; a second copy here is how the runtime half would go
// stale without anyone noticing.
import { ROUTES, API_ROUTES, MODEL, forbiddenActive } from './modelRoutePolicy.mts'

const N8N = join(process.cwd(), 'scripts', 'n8n')

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
