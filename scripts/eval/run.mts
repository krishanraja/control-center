/**
 * Prompt A/B harness.
 *
 *   npx tsx scripts/eval/run.mts <suite> [options]
 *
 * Options
 *   --dry                 assemble and print the prompts; call nothing
 *   --cases <n>           number of cases (default 10)
 *   --repeats <n>         samples per case per arm (default 2)
 *   --concurrency <n>     parallel jobs (default 4)
 *   --null                add a control arm identical to the baseline, to
 *                         measure the harness's own noise floor (recommended)
 *   --fixture <path>      load cases from JSON instead of the database
 *   --seed <n>            bootstrap seed (default 1)
 *   --out <dir>           report directory (default scripts/eval/reports)
 *
 * Examples
 *   npx tsx scripts/eval/run.mts revise --dry --fixture scripts/eval/cases/revise.sample.json
 *   npx tsx scripts/eval/run.mts revise --cases 12 --repeats 2 --null
 */
import { loadEnv, requireEnv } from './_env.mts'
import { run, dry, type RunOpts } from './_runner.mts'

loadEnv()

const argv = process.argv.slice(2)
const name = argv.find(a => !a.startsWith('--'))
const flag = (k: string) => argv.includes(`--${k}`)
const val = (k: string, d: string) => {
  const i = argv.indexOf(`--${k}`)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d
}

const SUITES: Record<string, () => Promise<{ suite: any }>> = {
  revise: () => import('./suites/revise.mts'),
}

if (!name || !SUITES[name]) {
  console.error(`usage: npx tsx scripts/eval/run.mts <${Object.keys(SUITES).join('|')}> [--dry] [--cases n] [--repeats n] [--null]`)
  process.exit(1)
}

const opts: RunOpts = {
  repeats: Number(val('repeats', '2')),
  concurrency: Number(val('concurrency', '4')),
  seed: Number(val('seed', '1')),
  nullArm: flag('null'),
  fixture: argv.includes('--fixture') ? val('fixture', '') : null,
  limit: Number(val('cases', '10')),
  outDir: val('out', 'scripts/eval/reports'),
}

const { suite } = await SUITES[name]()

const needsDb = !opts.fixture
const needsModel = !flag('dry')
requireEnv([
  ...(needsDb ? ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] : []),
  ...(needsModel ? ['ANTHROPIC_API_KEY'] : []),
])

if (flag('dry')) await dry(suite, opts)
else await run(suite, opts)
