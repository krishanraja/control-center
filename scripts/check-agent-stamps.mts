#!/usr/bin/env tsx
/**
 * Every Anthropic call site names the agent that makes it.
 *
 * The usage meter answers "which agent is spending" from a stamp passed at the
 * call site (api/_content.ts ClaudeOpts.agent). A site that forgets it still
 * meters — as `unattributed`, which is honest but useless. This guard exists
 * because the failure is silent and arrives by drift: the content-engine
 * rewrite landed four new callClaude sites on main while the meter was being
 * built on a branch, and nothing would have said so.
 *
 * Checked: callClaude({ … }) and streamClaude({ … }). NOT callMetered, which
 * defaults to 'investigations' inside _harness.ts and cannot be unstamped.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOTS = ['api', 'scripts']
const CALL = /\b(callClaude|streamClaude)\(\{/g
/** How far past the opening brace to look for the stamp. */
const LOOKAHEAD = 400

const SELF = 'check-agent-stamps.mts'

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|mts)$/.test(e) && e !== SELF) out.push(p)
  }
  return out
}

const files = ROOTS.flatMap(r => walk(r))
const misses: string[] = []

for (const file of files) {
  const src = readFileSync(file, 'utf8')
  // The definitions themselves are not call sites.
  if (/export async function (callClaude|streamClaude)\b/.test(src) && file.endsWith('_content.ts')) continue
  if (file.endsWith('_stream.ts')) continue

  for (const m of src.matchAll(CALL)) {
    const start = m.index! + m[0].length
    const window = src.slice(start, start + LOOKAHEAD)
    // Stop at the first line that closes the object, so a stamp belonging to a
    // LATER call cannot vouch for this one.
    const objectEnd = window.search(/^\s*\}\)/m)
    const scope = objectEnd === -1 ? window : window.slice(0, objectEnd)
    if (!/\bagent:\s*['"`]/.test(scope)) {
      const line = src.slice(0, m.index!).split('\n').length
      misses.push(`${file}:${line}  ${m[1]}({ … }) has no agent stamp`)
    }
  }
}

if (misses.length) {
  console.error('Anthropic call sites with no agent stamp — their spend meters as "unattributed":\n')
  for (const s of misses) console.error(`  ${s}`)
  console.error('\nAdd `agent: \'<name>\'` to the options object. Name the job, not the file.')
  process.exit(1)
}
console.log(`check-agent-stamps: ${files.length} files scanned, every Anthropic call site is stamped.`)
