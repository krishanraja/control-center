import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  editorialOpportunityHref,
  editorialSeriesForKey,
  publicKeyForEditorialSeries,
  readEditorialDecision,
  readEditorialOpportunity,
} from '../src/lib/editorialOpportunities'
import type { ContentIdeaRow } from '../src/hooks/useRealtimeContentIdeas'

const candidate = (series: 'money_of_ai' | 'built_with_ai', status: 'eligible' | 'near_miss' = 'eligible') => ({
  schema_version: 2,
  series,
  signal_id: 'source-1',
  status,
  title: `${series} title`,
  angle: `${series} angle`,
  growth: { clarity: 8 },
})

const source = {
  id: 'source-1',
  source_type: 'manual',
  state: 'seeded',
  idea: 'One neutral source',
  created_at: '2026-09-07T00:00:00Z',
  updated_at: '2026-09-07T00:00:00Z',
  meta: {
    editorial_radar: {
      schema_version: 2,
      lenses: {
        money_of_ai: candidate('money_of_ai'),
        built_with_ai: candidate('built_with_ai', 'near_miss'),
      },
      decisions: {
        money_of_ai: { status: 'approved', decided_at: '2026-09-07T01:00:00Z', child_id: 'money-child' },
      },
    },
  },
} as ContentIdeaRow

assert.equal(readEditorialOpportunity(source, 'money_of_ai')?.title, 'money_of_ai title')
assert.equal(readEditorialOpportunity(source, 'built_with_ai')?.title, 'built_with_ai title')
assert.equal(readEditorialDecision(source, 'money_of_ai')?.child_id, 'money-child')
assert.equal(readEditorialDecision(source, 'built_with_ai'), null)
assert.equal(editorialSeriesForKey('paid'), 'money_of_ai')
assert.equal(publicKeyForEditorialSeries('built_with_ai'), 'built')
assert.equal(editorialOpportunityHref('source 1', 'money_of_ai'), '#/content?idea=source%201&lens=money_of_ai')

const route = readFileSync(new URL('../api/content-ideas/[id]/editorial-route.ts', import.meta.url), 'utf8')
assert.match(route, /guard\(req, res, \['POST'\]\)/)
assert.match(route, /editorial-route-v1:/)
assert.match(route, /lane: 'publication'/)
assert.match(route, /const slot = series/)
assert.match(route, /status === 'near_miss' && overrideReason\.length < 8/)
assert.match(route, /hard_editorial_gate_failed/)
assert.doesNotMatch(route, /callClaude|ANTHROPIC_API_KEY|openai/i)

const contentTab = readFileSync(new URL('../src/components/content-v2/ContentV2Tab.tsx', import.meta.url), 'utf8')
assert.match(contentTab, /lane === 'publication'/)
assert.match(contentTab, /slot === 'built_with_ai'/)
assert.match(contentTab, /slot === 'money_of_ai'/)

console.log('PASS  one neutral source feeds independent editorial routes inside the existing Content spine')
