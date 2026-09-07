// The dashboard's schedule table and vercel.json must name the same crons.
//
// src/lib/contentEngineSchedule.ts is what the Content tab reads to say a job
// has gone quiet. If a cron is added to vercel.json and not here, its silence
// is invisible; if one is removed from vercel.json and stays here, the tab
// nags about a job that no longer exists. Both directions fail the build.
//
//   npx tsx scripts/check-content-engine-schedule.mts
import { readFileSync } from 'node:fs'
import { CONTENT_ENGINE_JOBS } from '../src/lib/contentEngineSchedule.ts'

let fail = 0
const bad = (m: string) => { console.log('FAIL: ' + m); fail++ }

const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as { crons?: Array<{ path: string; schedule: string }> }
const cronPaths = new Set((vercel.crons || []).map(c => c.path))

for (const job of CONTENT_ENGINE_JOBS) {
  if (!cronPaths.has(job.path)) bad(`${job.job} points at ${job.path}, which is not a cron in vercel.json`)
  const file = 'api' + job.path.slice('/api'.length) + '.ts'
  let src = ''
  try { src = readFileSync(file, 'utf8') } catch { bad(`${job.job}: ${file} does not exist`); continue }
  if (!src.includes(`withContentRun('${job.job}'`)) bad(`${file} must export withContentRun('${job.job}', handler) so its runs land in the ledger`)
}

// Any content cron that records runs must be in the schedule table too.
const seen = new Set(CONTENT_ENGINE_JOBS.map(j => j.job))
const ids = new Set(CONTENT_ENGINE_JOBS.map(j => j.job))
if (ids.size !== CONTENT_ENGINE_JOBS.length) bad('duplicate job ids in CONTENT_ENGINE_JOBS')
for (const c of vercel.crons || []) {
  const file = 'api' + c.path.slice('/api'.length) + '.ts'
  let src = ''
  try { src = readFileSync(file, 'utf8') } catch { continue }
  const m = src.match(/withContentRun\('([a-z0-9_]+)'/)
  if (m && !seen.has(m[1])) bad(`${file} records runs as '${m[1]}' but that job is not in src/lib/contentEngineSchedule.ts`)
}

if (fail) { console.log(`${fail} FAILURE(S)`); process.exit(1) }
console.log(`PASS  ${CONTENT_ENGINE_JOBS.length} content engine jobs match vercel.json and record their runs`)
