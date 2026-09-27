/**
 * The drafting surfaces may draft, never send.
 *
 * Krish's standing rule for hunter is that the system drafts and he sends. The
 * "Draft in Gmail" button creates a Gmail draft in his own drafts folder,
 * written to the contact and addressed to them (his ruling, 2026-09-03).
 * Nothing leaves until he presses send in Gmail himself.
 *
 * The strategist (2026-09-27) is the second surface under the same rule. It
 * drafts objectives, next steps and asks to named warm contacts, and offers
 * one-click contact that opens his own mail client or LinkedIn with the draft
 * waiting (src/lib/contactAction.ts). Nothing it does sends.
 *
 * That property should not rest on anyone remembering it. This check fails the
 * build if anything under a drafting surface gains a way to send: sendGmail, a
 * raw Gmail send endpoint, or any other outbound client.
 *
 * Every root must exist. walk() used to return nothing for a path that was not
 * there, so a misspelled or moved root passed silently: the check reported the
 * surface clean after reading none of it. A root that is gone now fails by
 * name, and the fix is to correct the path here, not to delete the line.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOTS = [
  // Bridges (hunter).
  'api/bridges',
  'src/components/BridgeCard.tsx',
  // The strategist: its route, its pure half, its reads, the learning bank's
  // writer and verdict route, and the client that renders the drafts.
  'api/strategist.ts',
  'api/_strategist.ts',
  'api/_strategistGrounding.ts',
  'api/_suggestions.ts',
  'api/suggestions',
  'src/components/strategist',
  'src/hooks/useStrategist.ts',
  'src/lib/strategist.ts',
]
const FORBIDDEN: Array<[RegExp, string]> = [
  [/\bsendGmail\b/, 'sendGmail: a send has already left when it returns'],
  [/gmail\/v1\/users\/[^/]+\/messages\/send/, 'a raw Gmail send endpoint'],
  [/\bnotifyOps\b/, 'notifyOps reaches Telegram'],
  [/api\.telegram\.org/, 'a Telegram endpoint'],
  [/\bsendMail\b|\bnodemailer\b|api\.instantly\.ai/, 'another outbound client'],
]

function walk(path: string): string[] {
  const st = statSync(path)
  if (st.isFile()) return [path]
  return readdirSync(path).flatMap(name => walk(join(path, name)))
}

const problems: string[] = []
const missing = ROOTS.filter(root => !existsSync(root))
for (const root of missing) {
  problems.push(`${root}: this root does not exist, so nothing under it was checked. Correct the path.`)
}

let scanned = 0
for (const root of ROOTS.filter(r => !missing.includes(r))) {
  for (const file of walk(root)) {
    if (!/\.(ts|tsx)$/.test(file)) continue
    scanned += 1
    // Comments explain the rule and must be allowed to name what they forbid;
    // it is the code that has to be clean.
    const body = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
    for (const [pattern, why] of FORBIDDEN) {
      if (pattern.test(body)) problems.push(`${file}: ${why}`)
    }
  }
}

if (problems.length) {
  console.error('FAIL  the drafting surfaces must be able to draft and nothing else:')
  for (const p of problems) console.error(`  ${p}`)
  process.exit(1)
}
console.log(`OK: the drafting surfaces can draft and cannot send (${ROOTS.length} roots, ${scanned} files).`)
