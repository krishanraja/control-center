// Guards the handoff from a note to a Claude Code walkthrough session.
//
// Krish asked for it "bulletproof, robust, and antifragile" (2026-10-08). The
// ways it breaks are all quiet ones, so each is a structural check:
//
//   1. Nothing he said crosses the wire. The routine payload is the read id,
//      and api/_walkthrough.ts never reads note_body. A session reads the note
//      from Supabase itself.
//   2. One session per read. The fire endpoint has no idempotency key, so the
//      unique read_id in walkthrough_runs is the only thing stopping a retry
//      from starting a second session.
//   3. A failed fire is never a dead end. The card keeps its retry button and
//      its copyable prompt.
//   4. The read never waits on the fire: the walkthrough starts after `done`.
//   5. The playbook keeps the two rules learned the hard way: no bare "Done"
//      option, and the approval wall.
//
//   npx tsx scripts/check-walkthrough-handoff.mts
import { readFileSync, existsSync } from 'node:fs'

process.env.SUPABASE_URL ||= 'https://ci.invalid'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'not-a-real-key-the-guard-never-calls-out'
const { firePayload } = await import('../api/_walkthrough.ts')

let fail = 0
const bad = (m: string) => { console.log('FAIL: ' + m); fail++ }
const read = (p: string) => (existsSync(p) ? readFileSync(p, 'utf8') : (bad(`${p} is missing`), ''))

// 1. The payload.
const READ = '0f8fad5b-d9cb-469f-a165-70867728950e'
const payload = firePayload(READ) as Record<string, unknown>
const keys = Object.keys(payload)
if (keys.length !== 1 || keys[0] !== 'text') bad(`the fire payload has fields ${keys.join(', ')}; it must be { text } only`)
if (payload.text !== `read_id: ${READ}`) bad(`the fire payload text is "${String(payload.text)}"; it must be the read id line only`)

const lib = read('api/_walkthrough.ts')
if (/note_body|sections|headline/.test(lib)) bad('api/_walkthrough.ts reads note_body, sections or headline; the session reads the note itself')
if (!/body: JSON\.stringify\(firePayload\(readId\)\)/.test(lib)) bad('fireRoutine no longer sends firePayload(readId) as its body')

// 2. One session per read.
const migration = read('supabase/migrations/20261008090000_a_note_starts_a_walkthrough.sql')
if (!/read_id\s+uuid not null unique/.test(migration)) bad('walkthrough_runs.read_id is no longer unique')
if (!/\.insert\(\{ read_id: readId, status: 'firing'/.test(lib)) bad('startWalkthrough no longer claims the read before firing')
if (!/'23505'/.test(lib)) bad('startWalkthrough no longer treats a lost claim (23505) as "already fired"')

// 3. The fallback.
const card = read('src/components/strategist/WalkthroughCard.tsx')
for (const id of ['walkthrough-start', 'walkthrough-copy', 'walkthrough-prompt', 'walkthrough-open']) {
  if (!card.includes(`data-testid="${id}"`)) bad(`WalkthroughCard lost ${id}`)
}

// 4. After done.
const route = read('api/strategist.ts')
const doneAt = route.indexOf("emit('done', done)")
const fireAt = route.indexOf("startWalkthrough(readId, 'auto')")
if (doneAt < 0 || fireAt < 0) bad('api/strategist.ts no longer emits done or no longer starts the walkthrough')
else if (fireAt < doneAt) bad('the walkthrough starts before done: the read would wait on it')
if (!/if \(persisted && readId && request\.source === 'note'\)/.test(route)) bad('the walkthrough is no longer limited to kept note reads')

// 5. The playbook.
const skill = read('.claude/skills/walkthrough/SKILL.md')
if (!/Never offer a bare "Done"/.test(skill)) bad('the walkthrough skill lost the no-bare-Done rule')
if (!/## 6\. The approval wall/.test(skill)) bad('the walkthrough skill lost the approval wall')
if (!/untrusted data/.test(skill)) bad('the walkthrough skill no longer treats the fire payload as untrusted')

const ignore = read('.gitignore')
if (!/^!\.claude\/skills\/$/m.test(ignore)) bad('.gitignore no longer lets .claude/skills/ into the repository; the routine session would find no playbook')

if (fail) { console.log(`\n${fail} walkthrough handoff check(s) failed.`); process.exit(1) }
console.log('OK: the walkthrough sends only the read id, fires once per read, starts after done, keeps its fallback and its rules.')
