import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  MAX_IDEAS_PER_SUBJECT, SIGNAL_TTL_DAYS, aeoSignalRow, aeoSignalSummary, aeoSourceRef, probeRows, queryRows, validatePacket,
  type AeoPacket,
} from '../../api/_aeo.ts'
import { CONTENT_ENGINE_JOBS, contentEngineAttention } from '../../src/lib/contentEngineSchedule.ts'
import { LANE_SLUG, PRODUCT_SLUGS } from '../../api/_growth.ts'

// The AEO engine's landing, the pure half: the packet contract, the row the
// content spine receives, and the schedule row that says when the machine
// has gone quiet.

const Q1 = '11111111-1111-4111-8111-111111111111'
const Q2 = '22222222-2222-4222-8222-222222222222'
const SUBJECT = '33333333-3333-4333-8333-333333333333'
const RUN = '44444444-4444-4444-8444-444444444444'

function packet(over: Partial<AeoPacket> = {}): AeoPacket {
  return {
    schema_version: 1,
    run_id: RUN,
    command_id: null,
    subject: { id: SUBJECT, kind: 'venture', slug: 'ctrl', product_slug: 'ctrl' },
    week_start: '2026-09-07',
    generated_at: '2026-09-13T04:12:00.000Z',
    engines: ['perplexity', 'chatgpt'],
    themes_status: 'ok',
    themes: [{ theme: 'Founders want their decisions to stay theirs', calls: 2, evidence: [{ call_ref: 'a1b2c3d4', date: '2026-09-10', paraphrase: 'A founder said the tools decide for them.' }] }],
    calls: { considered: 4, attributed: 2 },
    queries: [
      {
        query_id: Q1, query: 'best AI decision tools for founders', source: 'transcript', demand_score: 71,
        demand_basis: { llm_demand: 30, transcript_evidence: 21, rising_volume: 20, labels: ['no prompt-volume corpus; proxies only'] },
        call_evidence: [{ call_ref: 'a1b2c3d4', date: '2026-09-10', paraphrase: 'A founder said the tools decide for them.' }],
        gap: { we_cited_engines: [], competitor_domains: ['notion.so'] },
        trend: 'new', status: 'recommend', touchpoint_id: null,
        probes: [{ engine: 'perplexity', model: 'sonar', question: 'best AI decision tools for founders', answer_snapshot: 'Some answer.', we_cited: false, citations: ['https://notion.so/x'], cost_usd: 0.004 }],
      },
      {
        query_id: Q2, query: 'how to build a personal AI brain', source: 'seed', demand_score: 35,
        demand_basis: { llm_demand: 20, transcript_evidence: 0, rising_volume: 15, labels: ['no prompt-volume corpus; proxies only'] },
        call_evidence: [], gap: { we_cited_engines: ['perplexity'], competitor_domains: [] },
        trend: 'flat', status: 'watch', touchpoint_id: null, probes: [],
      },
    ],
    strongest_signal: 'Two founder calls asked the same question and no engine answered it with CTRL.',
    recommendations: [{ n: 1, title: 'The decision stays yours', target_query: 'best AI decision tools for founders', query_id: Q1, angle: 'Why a tool that decides for you is the wrong tool.', evidence: ['2 calls raised it', 'not cited on perplexity or chatgpt'], engines: ['perplexity', 'chatgpt'], demand: 71 }],
    watch_list: [{ query_id: Q2, query: 'how to build a personal AI brain', why: 'cited once, worth a second week' }],
    competitor_gap: { domain: 'notion.so', times_cited: 3, questions: ['best AI decision tools for founders'] },
    playbook: null,
    approach_hook: null,
    stats: { queries: 2, probes: 1, probes_failed: 0, probes_skipped_cap: 0, cost_usd: 0.004, engines: 2, transcripts: 4, digest_writer: 'claude' },
    ...over,
  }
}

test('a well-formed packet validates and comes back sanitized', () => {
  const r = validatePacket(packet({ strongest_signal: 'Two calls — no answer' }))
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.packet.strongest_signal, 'Two calls, no answer')
})

test('private material is refused as a whole', () => {
  const email = validatePacket(packet({ themes: [{ theme: 'Ask jane@example.com', calls: 1, evidence: [] }] }))
  assert.equal(email.ok, false)
  if (!email.ok) assert.ok(email.errors.some(e => /email address/.test(e)))
  const handle = validatePacket(packet({ strongest_signal: 'Reach @someone about it' }))
  assert.equal(handle.ok, false)
  const rawId = validatePacket(packet({ themes: [{ theme: 'x', calls: 1, evidence: [{ call_ref: 'transcript-123', date: '2026-09-10', paraphrase: 'p' }] }] }))
  assert.equal(rawId.ok, false)
})

test('the week must be a Monday and the kind must match its extras', () => {
  const tuesday = validatePacket(packet({ week_start: '2026-09-08' }))
  assert.equal(tuesday.ok, false)
  if (!tuesday.ok) assert.ok(tuesday.errors.some(e => /Monday/.test(e)))
  const ventureWithPlaybook = validatePacket(packet({ playbook: [] }))
  assert.equal(ventureWithPlaybook.ok, false)
  const prospectNoProduct = validatePacket(packet({ subject: { id: SUBJECT, kind: 'prospect', slug: 'acme-media', product_slug: 'ctrl' } }))
  assert.equal(prospectNoProduct.ok, false)
  const prospect = validatePacket(packet({ subject: { id: SUBJECT, kind: 'prospect', slug: 'acme-media', product_slug: null }, approach_hook: 'Their leaders keep asking who owns the data.' }))
  assert.equal(prospect.ok, true)
  const emptyThemesWhenNoCalls = validatePacket(packet({ themes_status: 'no_calls' }))
  assert.equal(emptyThemesWhenNoCalls.ok, false)
  const ok = validatePacket(packet({ themes_status: 'no_calls', themes: [] }))
  assert.equal(ok.ok, true)
})

test('a recommendation must point at one of the packet queries', () => {
  const r = validatePacket(packet({ recommendations: [{ n: 1, title: 't', target_query: 'q', query_id: '55555555-5555-4555-8555-555555555555', angle: 'a', evidence: [], engines: [], demand: 10 }] }))
  assert.equal(r.ok, false)
})

test('the content row mirrors a build signal and never claims an evergreen expiry', () => {
  const p = packet()
  const row = aeoSignalRow(p, p.recommendations[0], 'CTRL', new Date('2026-09-13T05:00:00.000Z'))
  assert.equal(row.source_type, 'aeo_signal')
  assert.equal(row.source_ref, aeoSourceRef('venture', 'ctrl', '2026-09-07', 1))
  assert.equal(row.source_ref, 'aeo:venture:ctrl:2026-09-07:1')
  assert.equal(row.lane, 'publication')
  assert.equal(row.horizon, 'news')
  assert.equal(row.state, 'seeded')
  assert.equal(row.expires_at, new Date(Date.parse('2026-09-13T05:00:00.000Z') + SIGNAL_TTL_DAYS * 86_400_000).toISOString())
  assert.equal(row.meta.aeo.target_query, 'best AI decision tools for founders')
  assert.equal(row.meta.aeo.subject_kind, 'venture')
  assert.match(row.meta.source_label, /AEO research, CTRL/)
  const prospect = aeoSignalRow(packet({ subject: { id: SUBJECT, kind: 'prospect', slug: 'acme', product_slug: null } }), p.recommendations[0], 'Acme Media')
  assert.match(prospect.meta.source_label, /in front of Acme Media/)
  assert.match(aeoSignalSummary(row.meta.aeo, row.thesis), /Target query: best AI decision tools for founders/)
  assert.ok(MAX_IDEAS_PER_SUBJECT <= 5)
})

test('probe and query rows carry the subject, the run and the query', () => {
  const p = packet()
  const probes = probeRows(p)
  assert.equal(probes.length, 1)
  assert.equal(probes[0].product_slug, 'ctrl')
  assert.equal(probes[0].subject_kind, 'venture')
  assert.equal(probes[0].run_id, RUN)
  assert.equal(probes[0].query_id, Q1)
  assert.equal(probes[0].run_at, p.generated_at)
  const prospectProbes = probeRows(packet({ subject: { id: SUBJECT, kind: 'prospect', slug: 'acme-media', product_slug: null } }))
  assert.equal(prospectProbes[0].product_slug, 'acme-media')
  assert.equal(prospectProbes[0].subject_kind, 'prospect')
  const queries = queryRows(p)
  assert.equal(queries.length, 2)
  assert.equal(queries[1].status, 'watch')
})

test('the lane map covers every Growth product and the ledger knows the external job', () => {
  for (const slug of PRODUCT_SLUGS) assert.ok(slug in LANE_SLUG, `${slug} has a lane entry (null is a valid answer)`)
  const job = CONTENT_ENGINE_JOBS.find(j => j.job === 'aeo_ingest')
  assert.ok(job && job.trigger === 'external')
  const now = new Date('2026-09-20T12:00:00.000Z')
  const stale = contentEngineAttention([{ job: 'aeo_ingest', status: 'ok', reason: null, finished_at: '2026-09-06T04:30:00.000Z' }], now)
  assert.equal(stale.attention.length, 1)
  assert.match(stale.attention[0].line, /AEO research has not succeeded/)
})

test('the winnability gate: a reason is optional on the wire, carried when present, and never invented', () => {
  const p = packet()
  const withReason = validatePacket(packet({
    recommendations: [{ ...p.recommendations[0], why_you_can_win: 'You have four live captures of this decision running in CTRL; the sites cited sell advice about it.' }],
  }))
  assert.equal(withReason.ok, true)

  // An older packet, written before the gate, still lands rather than being
  // refused. The tab says the reason is missing; it never implies there was one.
  const withoutReason = validatePacket(p)
  assert.equal(withoutReason.ok, true)
  if (withoutReason.ok) {
    const row = aeoSignalRow(withoutReason.packet, withoutReason.packet.recommendations[0], 'CTRL')
    assert.equal(row.meta.aeo.why_you_can_win, null)
  }

  const tooLong = validatePacket(packet({
    recommendations: [{ ...p.recommendations[0], why_you_can_win: 'x'.repeat(301) }],
  }))
  assert.equal(tooLong.ok, false)
})

test('what not to chase must point at questions the packet actually probed', () => {
  const good = validatePacket(packet({
    not_worth_chasing: [{ query_id: Q2, query: 'how to build a personal AI brain', owned_by: ['linkedin.com', 'youtube.com'], why_not: 'A social network and a video platform own this answer by reach. One piece will not move it.' }],
  }))
  assert.equal(good.ok, true)

  const strayId = validatePacket(packet({
    not_worth_chasing: [{ query_id: '99999999-9999-4999-8999-999999999999', query: 'x', owned_by: [], why_not: 'y' }],
  }))
  assert.equal(strayId.ok, false)
  if (!strayId.ok) assert.ok(strayId.errors.some(e => /not one of the packet's queries/.test(e)))

  const tooMany = validatePacket(packet({
    not_worth_chasing: Array.from({ length: 7 }, () => ({ query_id: Q2, query: 'x', owned_by: [], why_not: 'y' })),
  }))
  assert.equal(tooMany.ok, false)
})
