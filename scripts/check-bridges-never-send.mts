/**
 * The bridges surface may draft, never send.
 *
 * Krish's standing rule for hunter is that the system drafts and he sends. The
 * "Send to my inbox" button creates a Gmail draft addressed to him, with the
 * contact's address quoted in the body rather than filled into the To line, so
 * a mis-click in Gmail cannot reach the other person.
 *
 * That property should not rest on anyone remembering it. This check fails the
 * build if anything under the bridges surface gains a way to send: sendGmail,
 * a raw Gmail send endpoint, or any other outbound client.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOTS = ['api/bridges', 'src/components/BridgeCard.tsx']
const FORBIDDEN: Array<[RegExp, string]> = [
  [/\bsendGmail\b/, 'sendGmail: a send has already left when it returns'],
  [/gmail\/v1\/users\/[^/]+\/messages\/send/, 'a raw Gmail send endpoint'],
  [/\bnotifyOps\b/, 'notifyOps reaches Telegram'],
  [/api\.telegram\.org/, 'a Telegram endpoint'],
  [/\bsendMail\b|\bnodemailer\b|api\.instantly\.ai/, 'another outbound client'],
]

function walk(path: string): string[] {
  let st
  try { st = statSync(path) } catch { return [] }
  if (st.isFile()) return [path]
  return readdirSync(path).flatMap(name => walk(join(path, name)))
}

const problems: string[] = []
for (const root of ROOTS) {
  for (const file of walk(root)) {
    if (!/\.(ts|tsx)$/.test(file)) continue
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
  console.error('FAIL  the bridges surface must be able to draft and nothing else:')
  for (const p of problems) console.error(`  ${p}`)
  process.exit(1)
}
console.log('OK: the bridges surface can create a draft and cannot send.')
