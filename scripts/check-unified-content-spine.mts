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
import { CONTENT_OUTPUTS, storedContentOutputs } from '../src/lib/contentOutputs'
import { SUBCHANNELS, formatSpelling, resolveFormat } from '../src/lib/formats'

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
assert.equal(publicKeyForEditorialSeries('built_with_ai'), 'under_the_hood')
assert.equal(editorialOpportunityHref('source 1', 'money_of_ai'), '#/content?idea=source%201&lens=money_of_ai')

// The editorial-route half moved to the engine with the route
// (apps/control-plane/scripts/check-unified-content-spine.ts). What stays here
// is the spine the browser reads: one opportunity shape, one output registry.

const outputKeys = new Set(CONTENT_OUTPUTS.map(output => output.key))
for (const required of ['substack', 'linkedin', 'instagram', 'youtube', 'podcast', 'signal_noise', 'video_15s', 'video_60s', 'carousel_linkedin', 'carousel_instagram']) {
  assert(outputKeys.has(required), `missing output registry entry: ${required}`)
}
const stored = storedContentOutputs({
  linkedin: { body: 'A LinkedIn cut' },
  video_60s: { script: 'A spoken script', shot_notes: '0:00 Krish on camera' },
})
assert.deepEqual(stored.map(output => output.definition.key), ['linkedin', 'video_60s'])

const contentTab = readFileSync(new URL('../src/components/content-v2/ContentV2Tab.tsx', import.meta.url), 'utf8')
assert.match(contentTab, /lane === 'publication'/)

// Until 2026-09-20 the next three lines named the two rooms by slug, so this
// guard went green on the retired vocabulary and would have failed on the
// correct one. What is held now is the derivation, not the words: the rooms
// come from SUBCHANNELS and the slot resolves through the rename ledger, so a
// fourth subchannel in venture_formats needs no edit to this file and a
// hand-typed room needs one it cannot get.
assert.match(contentTab, /\.\.\.SUBCHANNELS\.map\(/)
assert.match(contentTab, /resolveFormat\(slot\)/)
assert.match(contentTab, /f\.kind === 'subchannel'/)

// The behaviour those literals used to stand in for, asserted against the one
// reader rather than against a source string.
assert.equal(resolveFormat('built_with_ai')?.slug, 'under_the_hood')
assert.equal(resolveFormat('money_of_ai')?.slug, 'follow_the_money')
assert.equal(resolveFormat('paid')?.slug, 'follow_the_money')
assert.equal(resolveFormat('built')?.slug, 'under_the_hood')
assert.equal(resolveFormat('not_a_format'), null)
assert(SUBCHANNELS.length >= 3, 'the publication runs three subchannels, not two')

// Reading is generous, writing is not. A retired spelling must route a
// historical row to its live room AND be refused for a new one; when those were
// one question the answer was wrong for whichever half lost the tie.
assert.equal(formatSpelling('under_the_hood'), 'current')
assert.equal(formatSpelling('built_with_ai'), 'retired')
assert.equal(formatSpelling('built'), 'retired')
assert.equal(formatSpelling('money_of_ai'), 'retired')
assert.equal(formatSpelling('not_a_format'), 'unknown')

console.log('PASS  one neutral source feeds independent editorial routes inside the existing Content spine')
