import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildProductionBrief,
  contentRevisionHash,
  createProductionApproval,
  productionBriefHash,
  readProductionApproval,
} from '../api/_productionBrief'
import {
  hashLeaseToken,
  leaseTokenMatches,
  productionBriefCanBeClaimed,
  readProductionBriefEnvelope,
} from '../api/video-studio/_productionBriefQueue'
import { CONTENT_OUTPUTS, hasExactProductionApproval, storedProductionBriefs } from '../src/lib/contentOutputs'

const row = {
  id: '11111111-1111-4111-8111-111111111111',
  idea: 'When AI cuts implementation labour, who gets the saving?',
  thesis: 'The labour saving changes price, margin or scope only when the commercial mechanism lets it through.',
  body: 'Longer autonomous runs can mean fewer interventions and less delivery labour. Buyers still pay for risk and accountability, so the saving may never reach the invoice.',
  lane: 'publication',
  lane_slot: 'money_of_ai',
  source_url: 'https://example.com/evidence',
  meta: {
    editorial_route: {
      candidate: {
        audience_problem: 'Enterprise leaders need to know who captures the saving.',
        honest_payoff: 'A way to inspect whether AI changes price, margin or scope.',
        visual_proof: 'Show the task trace beside the commercial before and after.',
        source_urls: ['https://example.com/evidence'],
        hard_blocks: [],
        status: 'eligible',
      },
    },
  },
}

const approval = createProductionApproval(row, '2026-09-07T12:00:00.000Z')
assert.equal(readProductionApproval(approval)?.approved_by, 'Krish')
assert.equal(contentRevisionHash({ ...row, body: `${row.body} ` }), approval.content_revision_hash, 'irrelevant outer whitespace must not change the revision')
assert.notEqual(contentRevisionHash({ ...row, body: `${row.body} Changed.` }), approval.content_revision_hash, 'meaningful edits must retire approval')

const brief = buildProductionBrief({ row, approval, productionKinds: ['video'], sourceMode: 'solo' })
assert.equal(brief.editorial_approval.approved_by, 'Krish')
assert.equal(brief.content_revision_hash, approval.content_revision_hash)
assert.equal(brief.series, 'money_of_ai')
assert.equal(brief.claims[0]?.verification, 'human_required')
assert.deepEqual(brief.claims[0]?.evidence_urls, ['https://example.com/evidence'])
assert.throws(() => buildProductionBrief({ row, approval, productionKinds: ['video'], sourceMode: 'written' }), /video_source_mode_required/)
const contractFixture = JSON.parse(readFileSync(new URL('../fixtures/contracts/production-brief-v1.json', import.meta.url), 'utf8'))
assert.deepEqual(brief, contractFixture, 'Control Center must emit the shared cross-repository contract fixture')
assert.equal(productionBriefHash(contractFixture), '84da9d78420f15d5068c43b93774c76dbeaefded45665ba0bd0005a096f12ca3')

const wrapper = {
  production_briefs: {
    [brief.brief_id]: { brief, status: 'ready_for_studio', created_at: '2026-09-07T12:01:00.000Z' },
  },
}
assert.equal(storedProductionBriefs(wrapper)[0]?.brief_id, brief.brief_id)
assert.equal(hasExactProductionApproval({ production_approval: approval }), true)
assert(CONTENT_OUTPUTS.some(output => output.key === 'studio_video' && output.engine === 'studio'))

const queued = readProductionBriefEnvelope({
  brief,
  brief_hash: productionBriefHash(brief),
  status: 'ready_for_studio',
  requested_by: 'Krish',
  created_at: '2026-09-07T12:01:00.000Z',
})
assert(queued)
assert.equal(productionBriefCanBeClaimed(queued, new Date('2026-09-07T12:02:00.000Z')), true)
assert.equal(leaseTokenMatches(hashLeaseToken('a'.repeat(32)), 'a'.repeat(32)), true)
assert.equal(leaseTokenMatches(hashLeaseToken('a'.repeat(32)), 'b'.repeat(32)), false)
assert.equal(readProductionBriefEnvelope({ ...queued, brief_hash: 'f'.repeat(64) }), null, 'changed briefs must fail closed')

const approvalRoute = readFileSync(new URL('../api/content-ideas.ts', import.meta.url), 'utf8')
assert.match(approvalRoute, /production_approval: createProductionApproval/)
assert.match(approvalRoute, /production_approval: null/)
assert.match(approvalRoute, /current\.state === 'approved'.*updates\.state = 'review'/s)
assert.match(approvalRoute, /retired_revision_changed/)
assert.match(approvalRoute, /eq\('updated_at', current\.updated_at\)/, 'approval edits must not overwrite a concurrent runner acknowledgement')

const bridgeRoute = readFileSync(new URL('../api/content-ideas/[id]/production-brief.ts', import.meta.url), 'utf8')
assert.match(bridgeRoute, /guard\(req, res, \['POST'\]\)/)
assert.match(bridgeRoute, /confirm_hard_gates !== true/)
assert.match(bridgeRoute, /approval\.content_revision_hash !== contentRevisionHash\(row\)/)
assert.match(bridgeRoute, /hard_editorial_gate_failed/)
assert.doesNotMatch(bridgeRoute, /callClaude|ANTHROPIC_API_KEY|openai/i)

const claimRoute = readFileSync(new URL('../api/video-studio/runner/production-brief-claim.ts', import.meta.url), 'utf8')
const completeRoute = readFileSync(new URL('../api/video-studio/runner/production-brief-complete.ts', import.meta.url), 'utf8')
for (const route of [claimRoute, completeRoute]) {
  assert.match(route, /guardVideoStudioRunner/)
  assert.match(route, /enforceVideoStudioRateLimit/)
  assert.match(route, /eq\('updated_at', row\.updated_at\)/, 'queue writes must use optimistic compare-and-set')
}
assert.match(claimRoute, /hashLeaseToken/)
assert.match(claimRoute, /envelope\.brief\.content_revision_hash !== currentRevisionHash/)
assert.match(completeRoute, /leaseTokenMatches/)
assert.match(completeRoute, /production_brief_lease_conflict/)
assert.match(completeRoute, /production_brief_revision_retired/)

console.log('PASS  exact approved revisions produce deterministic, runner-claimed Studio briefs')
