// Every environment variable the code reads must be named in .env.example.
//
// A build-time flag that is missing from one environment does not error: it
// silently serves a different product. VITE_CONTENT_V2_ENABLED was read by the
// app for a month and never listed here, so a fresh deploy rendered the retired
// triage surface with nothing in the logs. This makes the list the contract:
// name the variable, say what it does, or the build fails.
//
//   npx tsx scripts/check-env-example.mts
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

let fail = 0
const bad = (m: string) => { console.log('FAIL: ' + m); fail++ }

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) { if (e !== 'node_modules') walk(p, out) }
    else if (/\.(ts|tsx|mts)$/.test(e)) out.push(p)
  }
  return out
}

const example = readFileSync('.env.example', 'utf8')
const declared = new Set([...example.matchAll(/^#?\s*([A-Z][A-Z0-9_]+)=/gm)].map(m => m[1]))

// Variables the platform injects or that are documented elsewhere on purpose.
const PLATFORM = new Set([
  'NODE_ENV', 'VERCEL', 'VERCEL_ENV', 'VERCEL_URL', 'VERCEL_GIT_COMMIT_SHA', 'VERCEL_REGION',
  'CI', 'GITHUB_ACTIONS', 'PLAYWRIGHT_CHROMIUM_PATH', 'PLAYWRIGHT_BROWSERS_PATH', 'HOME', 'PATH', 'TZ',
  'MODE', 'DEV', 'PROD', 'BASE_URL', 'SSR',
])

const used = new Map<string, string>()
for (const file of [...walk('src'), ...walk('api')]) {
  const src = readFileSync(file, 'utf8')
  for (const m of src.matchAll(/import\.meta\.env\.([A-Z][A-Z0-9_]+)/g)) if (!used.has(m[1])) used.set(m[1], file)
  for (const m of src.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) if (!used.has(m[1])) used.set(m[1], file)
  for (const m of src.matchAll(/process\.env\[['"]([A-Z][A-Z0-9_]+)['"]\]/g)) if (!used.has(m[1])) used.set(m[1], file)
}

for (const [name, file] of used) {
  if (PLATFORM.has(name) || declared.has(name)) continue
  bad(`${name} is read in ${file} but not named in .env.example`)
}

if (fail) { console.log(`${fail} FAILURE(S)`); process.exit(1) }
console.log(`PASS  ${used.size} environment variables read by src/ and api/ are all named in .env.example`)
