#!/usr/bin/env tsx
/**
 * What is ACTUALLY running, as opposed to what we decided should run.
 *
 * Every other check-*.mts in this repo reads the repository. That is the right
 * thing for a policy guard and it is structurally incapable of catching the
 * failure that prompted this file.
 *
 * On 2026-09-24, `sonnet-task-lever-rater` was running in production on
 * `claude-opus-5` with `max_tokens: 16000`, on a two-hourly cron. The mirror
 * said `claude-sonnet-5` / 2000 / thinking disabled, because
 * docs/MODEL_ROUTING_AUDIT.md changed it on 2026-09-12 and the change was
 * committed to git and never deployed. check-model-routing.mts asserts, for
 * that exact file, `excludes: ['claude-opus-5', 'max_tokens: 16000']`. It
 * passed, every run, for twelve days. It was reading the mirror, and the mirror
 * was correct. The runtime was not.
 *
 * Three more of the same shape were found in the same pass:
 * cleo-omnichannel-content-factory on gpt-4o, zara-layer-1 on gpt-4.1-nano,
 * hunter-job-sweep on gemini-2.0-flash — a model Google shut down on
 * 2026-06-01. All four are routes the audit records as already changed.
 *
 * So git is canonical for INTENT and the runtime is canonical for WHAT IS
 * RUNNING, and neither one alone is the truth. This guard is the thing that
 * compares them.
 *
 * It needs N8N_API_KEY, which CI does not hold, so it cannot gate a pull
 * request. Without the key it prints NOT CHECKED and exits 0 — the pattern
 * scripts/check-format-drift.mts already sets here, for the reason that file
 * states plainly: "a guard that quietly skips is worse than no guard: it
 * reports green for a thing it never looked at." Run it wherever the key lives.
 *
 *   N8N_API_KEY=... npx tsx scripts/check-model-routing-live.mts
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ROUTES, MODEL, forbiddenActive } from './modelRoutePolicy.mts'

const N8N = join(process.cwd(), 'scripts', 'n8n')
const KEY = process.env.N8N_API_KEY || ''
const BASE = (process.env.N8N_BASE_URL || 'https://krishraja10101.app.n8n.cloud').replace(/\/+$/, '')

if (!KEY) {
  console.log(
    'NOT CHECKED  N8N_API_KEY is needed to read the live workflows.\n' +
    '             check-model-routing.mts proves the MIRRORS are right. It cannot\n' +
    '             prove the runtime received them, and on 2026-09-24 it had not:\n' +
    '             production ran claude-opus-5 for twelve days behind a green guard.',
  )
  process.exit(0)
}

interface CloudWorkflow {
  id: string
  name: string
  active?: boolean
  isArchived?: boolean
  nodes?: unknown[]
}

async function listLive(): Promise<CloudWorkflow[]> {
  const out: CloudWorkflow[] = []
  let cursor: string | undefined
  for (;;) {
    const url = `${BASE}/api/v1/workflows?limit=100${cursor ? `&cursor=${cursor}` : ''}`
    const r = await fetch(url, { headers: { 'X-N8N-API-KEY': KEY, accept: 'application/json' } })
    if (!r.ok) throw new Error(`n8n list failed: ${r.status}`)
    const page = await r.json() as { data: CloudWorkflow[]; nextCursor?: string }
    out.push(...page.data)
    if (!page.nextCursor) break
    cursor = page.nextCursor
  }
  // Archived copies are not the runtime, and at least one name has both an
  // archived and a live copy (Nell | Guest Speaker Briefing). Matching by name
  // without this filter picks whichever sorts last, which is how a comparison
  // of that workflow read as three nodes of drift that do not exist.
  return out.filter(w => !w.isArchived)
}

const failures: string[] = []
const notes: string[] = []

const live = await listLive()
const byName = new Map(live.map(w => [w.name, w]))

// 1. The policy table, asserted against the runtime rather than the mirror.
for (const route of ROUTES) {
  const mirrorPath = join(N8N, route.file)
  let mirrorName: string
  try {
    mirrorName = String((JSON.parse(readFileSync(mirrorPath, 'utf8')) as { name?: string }).name ?? '')
  } catch {
    failures.push(`${route.file}: mirror unreadable, cannot resolve its workflow name`)
    continue
  }
  const cloud = byName.get(mirrorName)
  if (!cloud) {
    notes.push(`${route.file}: no live workflow named "${mirrorName}" (archived, renamed or never deployed)`)
    continue
  }
  const source = JSON.stringify(cloud.nodes ?? [])
  // The mirror's assertions are written against the mirror's own JSON spelling,
  // where a quote inside a string is escaped. A live node comes back parsed, so
  // it is re-serialised above and compared the same way.
  for (const expected of route.includes) {
    // An assertion naming a {{PLACEHOLDER}} is a statement about the MIRROR, not
    // the runtime: scripts/n8n/secrets.mjs resolves placeholders on push, so the
    // live copy holds the real credential by design. Asserting it here would
    // fail every time and, worse, would be "fixed" by putting a live secret into
    // the expectation. check-model-routing.mts already covers these against the
    // file, which is the only place the placeholder is supposed to exist.
    if (expected.includes('{{')) continue
    if (!source.includes(expected)) {
      failures.push(`LIVE "${mirrorName}": missing ${expected} (${route.rationale})`)
    }
  }
  for (const forbidden of route.excludes || []) {
    if (source.includes(forbidden)) {
      failures.push(`LIVE "${mirrorName}": contains ${forbidden} (${route.rationale})`)
    }
  }
}

// 2. No forbidden model anywhere in an ACTIVE live workflow.
const inventory = new Map<string, number>()
let activeAi = 0
for (const w of live) {
  if (!w.active) continue
  const source = JSON.stringify(w.nodes ?? [])
  const models = new Set(source.match(MODEL) || [])
  if (!models.size) continue
  activeAi += 1
  for (const model of models) {
    inventory.set(model, (inventory.get(model) || 0) + 1)
    if (forbiddenActive.has(model)) {
      failures.push(`LIVE "${w.name}" (active) uses disallowed ${model}`)
    }
  }
}

// 3. Retired provider models, which fail closed rather than loudly.
//    A shut-down Gemini id behind `neverError: true` renders as a green node,
//    so the runtime is the only place this is visible at all.
const RETIRED: Readonly<Record<string, string>> = {
  'gemini-2.0-flash': 'shut down 2026-06-01',
  'gemini-2.5-pro': '404, retired for new users',
  'gemini-3.1-pro-preview': 'free-tier quota limit 0 on this project',
}
/**
 * Whether a model id is actually INVOKED, rather than merely mentioned.
 *
 * The first version of this check flagged Cleo Inspiration Sweep for calling
 * gemini-2.5-pro. It does not. The string is a telemetry label inside a parse
 * node — `model_used = 'gemini-2.5-pro-fallback'` — while the URL right above
 * it calls gemini-3.6-flash. Flagging that is exactly the disease this file
 * exists to cure: a guard nobody trusts is a guard nobody reads, and the
 * previous audit hid four real regressions inside forty-two false ones.
 *
 * So an id counts only where a request would actually carry it: in a Google
 * generateContent URL, or as the value of a `model` field.
 *
 * (Those stale labels are a real if smaller bug — the fallback reports a model
 * it no longer uses, so the telemetry names the wrong one. Same pattern is in
 * cleo-synthesis-engine. Not this guard's job.)
 */
function invokes(source: string, id: string): boolean {
  const q = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`models/${q}(?::|["'\\\\/\\s])`).test(source)
    || new RegExp(`model\\s*\\\\?["']?\\s*:\\s*\\\\?["']${q}\\\\?["']`).test(source)
}

for (const w of live) {
  const source = JSON.stringify(w.nodes ?? [])
  for (const [id, why] of Object.entries(RETIRED)) {
    if (invokes(source, id)) {
      const where = w.active ? 'active' : 'inactive'
      const msg = `LIVE "${w.name}" (${where}) calls retired ${id} - ${why}`
      // An inactive workflow is not serving anyone today, but it is armed: the
      // moment it is switched on, the fallback it relies on is already dead.
      if (w.active) failures.push(msg)
      else notes.push(msg)
    }
  }
}

// 4. Mirrors whose live twin disagrees on which models it names. This is the
//    general form of the four regressions, and it catches ones the ROUTES table
//    has no row for.
for (const name of readdirSync(N8N).filter(n => n.endsWith('.workflow.json') && !n.startsWith('zz-archived-'))) {
  let mirror: { name?: string; nodes?: unknown[] }
  try { mirror = JSON.parse(readFileSync(join(N8N, name), 'utf8')) } catch { continue }
  const cloud = byName.get(String(mirror.name ?? ''))
  if (!cloud) continue
  const a = new Set(JSON.stringify(mirror.nodes ?? []).match(MODEL) || [])
  const b = new Set(JSON.stringify(cloud.nodes ?? []).match(MODEL) || [])
  const onlyMirror = [...a].filter(m => !b.has(m))
  const onlyLive = [...b].filter(m => !a.has(m))
  if (onlyMirror.length || onlyLive.length) {
    failures.push(
      `${name}: mirror and runtime name different models` +
      (onlyLive.length ? ` — running ${onlyLive.join(', ')}` : '') +
      (onlyMirror.length ? ` — mirror expects ${onlyMirror.join(', ')}` : ''),
    )
  }
}

for (const note of notes) console.log(`NOTE  ${note}`)

if (failures.length) {
  console.error(`\nFAIL: ${failures.length} live routing invariant(s) broken.\n`)
  for (const f of failures) console.error(`  ${f}`)
  console.error(
    '\nThese are what is RUNNING, not what is committed. A mirror fix does not\n' +
    'resolve them; the runtime has to receive it. See docs/MODEL_ROUTING_AUDIT.md.',
  )
  process.exit(1)
}

console.log(`PASS  runtime matches policy across ${activeAi} active AI workflows (${live.length} live)`)
console.log(`INFO  live model inventory: ${[...inventory].sort().map(([m, n]) => `${m}=${n}`).join(', ')}`)
