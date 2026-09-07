import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  parseOpenStudioSessionInput,
  parseRecordStudioFeedbackInput,
} from '../api/video-studio/_sessionContracts.ts'

const root = process.cwd()
const sha = 'a'.repeat(64)
const sessionId = '11111111-1111-4111-8111-111111111111'
const idempotencyKey = '22222222-2222-4222-8222-222222222222'

const open = parseOpenStudioSessionInput({
  client: 'claude_ai',
  repository_revision: 'b'.repeat(40),
  idempotency_key: idempotencyKey,
})
if (!open || open.client !== 'claude_ai') throw new Error('portable session parser rejected a supported client')
if (parseOpenStudioSessionInput({ ...open, transcript: 'private chat' })) throw new Error('portable session parser accepted a whole transcript field')

const feedback = parseRecordStudioFeedbackInput({
  session_id: sessionId,
  idempotency_key: idempotencyKey,
  client: 'claude_ai',
  action: 'feedback_corrected',
  job_id: 'job-one',
  artifact: { artifact_id: 'slide-seven', before_hash: sha, after_hash: 'b'.repeat(64) },
  explicit_feedback_excerpt: 'Move the Mindmake wordmark to the bottom left.',
  detected_differences: [{ feature: 'brand.footer.anchor', summary: 'Moved the footer from right to left.' }],
  inference: { rationale: 'Use the bottom-left footer for this treatment.', confidence: 1, scope: { level: 'treatment', key: 'carousel_infographic' } },
  confirmation_state: 'corrected',
  occurred_at: '2026-09-07T09:00:00.000Z',
})
if (!feedback || feedback.confirmation_state !== 'corrected') throw new Error('portable feedback parser rejected a bounded confirmed event')
if (parseRecordStudioFeedbackInput({ ...feedback, raw_transcript: 'private chat' })) throw new Error('portable feedback parser accepted a whole transcript field')
if (parseRecordStudioFeedbackInput({ ...feedback, explicit_feedback_excerpt: String.raw`C:\private\source.mov` })) throw new Error('portable feedback parser accepted a local path')

const route = readFileSync(join(root, 'api', 'video-studio', 'mcp.ts'), 'utf8')
const auth = readFileSync(join(root, 'api', '_videoStudioMcpAuth.ts'), 'utf8')
const migration = readFileSync(join(root, 'supabase', 'migrations', '20260907091923_studio_session_learning_spine.sql'), 'utf8')

for (const tool of ['studio.capabilities', 'studio.session.open', 'studio.session.status', 'studio.session.close', 'studio.jobs.list', 'studio.reviews.list', 'studio.feedback.record', 'studio.learning.list']) {
  if (!route.includes(tool)) throw new Error(`MCP gateway is missing ${tool}`)
}
if (!auth.includes("Buffer.byteLength(token, 'utf8') < 32")) throw new Error('MCP auth must fail closed on a short or missing token')
if (!auth.includes('timingSafeEqual')) throw new Error('MCP bearer comparison must be constant-time')
if (route.includes('Access-Control-Allow-Origin')) throw new Error('MCP route must not expose wildcard CORS')
if (!migration.includes('enable row level security')) throw new Error('Studio session tables must enable RLS')
if (!migration.includes('mindmake_studio_interaction_events_append_only')) throw new Error('Studio interaction events must remain append-only')
if ((migration.match(/create trigger mindmake_studio_interaction_events_append_only/g) ?? []).length !== 1) throw new Error('Studio interaction append-only trigger must be declared exactly once')
if (!migration.includes('performance') || !migration.includes('independent_session_count >= 3')) throw new Error('performance learning floor is missing')
if (/\bcompound\b/i.test(`${route}\n${auth}\n${migration}`)) throw new Error('portable Studio gateway crossed the Compound boundary')

console.log('PASS  portable Studio session and learning gateway invariants')
