import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildVideoStudioFeed, sanitizeInternalPattern, toVideoStudioCandidate } from '../api/_videoStudioExport.js'
import { consumeExportRateLimit } from '../api/_auth.js'
import type { SeedCandidate } from '../api/_seedSources.js'

const privateSeed: SeedCandidate = {
  key: 'opp:real-row-id',
  kind: 'deal',
  text: 'Won Acme Holdings Ltd — Priya Shah at Monzo paid £120,000 because the workflow replaced 340 manual reviews. "They hated the first version." priya@acme.test',
  sub: 'mindmaker',
  source_type: 'crm_opportunity',
  source_ref: 'real-row-id',
  source_url: null,
  score: null,
  norm_score: 0.6,
  occurred_at: '2026-08-27T10:00:00.000Z',
  weight: 1,
}

const scrubbed = sanitizeInternalPattern(privateSeed.text)
for (const forbidden of ['Acme', 'Priya', 'Monzo', '120,000', '340', 'They hated', 'priya@']) assert.equal(scrubbed.includes(forbidden), false, `private token leaked: ${forbidden}`)

const candidate = toVideoStudioCandidate(privateSeed)
assert.equal(candidate.sensitivity, 'internal_sanitized')
assert.equal(candidate.source_urls.length, 0)
assert.equal(candidate.evidence_status, 'public_evidence_required')
assert.equal(JSON.stringify(candidate).includes(privateSeed.source_ref), false)

const feed = buildVideoStudioFeed([privateSeed], new Date('2026-08-28T10:00:00.000Z'))
assert.equal(feed.schema_version, 1)
assert.equal(feed.provider, 'control_center')
assert.equal(feed.candidates.length, 1)
assert.equal(feed.source_age, 86_400)
const fixture = JSON.parse(await readFile(new URL('../api/fixtures/video-studio-radar-v1.json', import.meta.url), 'utf8'))
assert.equal(fixture.schema_version, feed.schema_version)
assert.equal(fixture.provider, feed.provider)
assert.equal(JSON.stringify(fixture).includes('real-row-id'), false)
assert.equal(consumeExportRateLimit('fixture-token', 0, 2, 60_000), 0)
assert.equal(consumeExportRateLimit('fixture-token', 1, 2, 60_000), 0)
assert.equal(consumeExportRateLimit('fixture-token', 2, 2, 60_000), 60)
console.log('video studio export invariants passed')
