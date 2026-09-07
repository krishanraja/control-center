import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildEditorialLensSystemPrompt,
  parseEditorialLensResponse,
  type EditorialSignalV2,
} from '../api/_editorialRadar.js'

const signal: EditorialSignalV2 = {
  id: 'signal-1',
  title: 'OpenAI releases a new coding agent',
  summary: 'The agent completes longer coding tasks with fewer operator interventions.',
  occurred_at: '2026-09-07T09:00:00.000Z',
  source_urls: ['https://primary.test/story', 'https://second.test/story'],
  corroboration: 2,
  category: 'model',
}

const base = {
  signal_id: signal.id,
  status: 'candidate',
  title: 'Coding agents change the price of implementation',
  angle: 'When implementation time falls, service firms have to choose whether to pass the saving to buyers or keep it as margin.',
  audience_problem: 'Leaders cannot tell whether lower build effort changes price or only supplier margin.',
  why_now: 'The new capability makes longer autonomous implementation work credible enough to test.',
  proposed_hook: 'The coding agent is not the story. What it does to the price of implementation is.',
  honest_payoff: 'A framework for deciding where the saved implementation time will land.',
  mechanism: 'Lower labour cost per implementation changes pricing, gross margin and buyer expectations.',
  visual_proof: 'Show the source claim, then a before and after implementation cost stack.',
  source_mode: 'short_native',
  production_effort: 'medium',
  strongest_failure: 'The effect may remain inside early adopters and never reach buyer pricing.',
  safer_version: 'Explain the implementation cost mechanism without claiming market-wide repricing.',
  ambitious_version: 'Test whether AI implementation services are about to lose time-based pricing.',
  recommended_version: 'Show the pricing choice created by falling implementation effort.',
  recommendation_reason: 'It turns a release into a decision leaders already face.',
  credible_contradiction: 'Early buyers may continue paying for outcome risk rather than implementation hours.',
  editorial: { truth: true, evidence: true, confidentiality: true, rights: true, series_fit: true, meaningful_mechanism: true },
  growth: { first_beat_tension: 8, clarity: 8, surprise: 7, payoff: 8, delivery_strength: 7, visual_proof: 7, share_save_usefulness: 8, qualified_audience_fit: 9, novelty: 7 },
}

const money = parseEditorialLensResponse({ opportunities: [base] }, 'money_of_ai', [signal])[0]
assert.equal(money.status, 'eligible')
assert.deepEqual(money.source_urls, signal.source_urls)
assert.equal(money.series, 'money_of_ai')

const rawRelease = parseEditorialLensResponse({ opportunities: [{
  ...base,
  title: 'OpenAI released a new coding agent',
  angle: 'The new coding agent has better benchmark performance.',
  mechanism: 'It has a larger context window and stronger benchmark scores.',
}] }, 'money_of_ai', [signal])[0]
assert.equal(rawRelease.status, 'rejected')
assert(rawRelease.hard_blocks.some((block) => block.includes('second-order commercial')))

const built = parseEditorialLensResponse({ opportunities: [{
  ...base,
  title: 'The handoff that changes when a coding agent runs for an hour',
  angle: 'The useful change is not code generation. It is how the operator scopes, observes and checks a long-running task.',
  mechanism: 'The workflow moves human attention from typing code to setting boundaries and reviewing artifacts.',
}] }, 'built_with_ai', [signal])[0]
assert.equal(built.status, 'eligible')
assert.equal(built.series, 'built_with_ai')

const none = parseEditorialLensResponse({ opportunities: [{ signal_id: signal.id, status: 'no_angle', no_angle_reason: 'The evidence supports an event but no useful commercial mechanism.' }] }, 'money_of_ai', [signal])[0]
assert.equal(none.status, 'no_angle')
assert.match(none.strongest_failure, /no useful commercial mechanism/i)

const moneyPrompt = buildEditorialLensSystemPrompt('money_of_ai', '', '')
const builtPrompt = buildEditorialLensSystemPrompt('built_with_ai', '', '')
assert.match(moneyPrompt, /event is never the story/i)
assert.match(moneyPrompt, /not filling a quota/i)
assert.match(builtPrompt, /workflow change/i)

const route = readFileSync(new URL('../api/content-opportunities/refresh.ts', import.meta.url), 'utf8')
assert.match(route, /guardBearerExport\(req, res, 'CRON_SECRET', \['GET'\]\)/)
assert.match(route, /runLens\('money_of_ai'/)
assert.match(route, /runLens\('built_with_ai'/)
assert.doesNotMatch(route, /chooseSeries/)

const pool = readFileSync(new URL('../api/_pool.ts', import.meta.url), 'utf8')
const ingest = readFileSync(new URL('../api/feed/ingest.ts', import.meta.url), 'utf8')
assert.match(pool, /sourceUrls: string\[\]/)
assert.match(ingest, /source_urls: s\.sourceUrls/)

const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
assert(vercel.crons.some((cron: { path: string }) => cron.path === '/api/content-opportunities/refresh'))

console.log('PASS  editorial radar v2 keeps signals neutral and runs independent series lenses')

