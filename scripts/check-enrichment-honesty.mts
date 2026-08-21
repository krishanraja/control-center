// Guards the one rule the screenshot-to-network path exists to keep:
//
//   "if there are not enough api credits anywhere, I need an alert rather than
//    just half enriching."  — Krish
//
// The failure it prevents is quiet and permanent. Every provider helper in
// api/_enrich.ts returns '' on any error, so a run where People Data Labs
// answered 402 and Perplexity answered 429 still produced a Claude-only summary,
// still wrote enrichment_status='enriched', and — because the row then carried a
// dossier — became permanently ineligible for retry under the `already_enriched`
// guard. Nothing recorded that three of four sources never ran.
//
// The rule cannot be expressed in the type system: "do not set 'enriched' when a
// provider was blocked" is a control-flow property, and the next person to add a
// provider will not read the comment. So it is checked here.
//
//   npx tsx scripts/check-enrichment-honesty.mts
import { readFileSync } from 'node:fs'

let fail = 0
const bad = (m: string) => { console.log('FAIL: ' + m); fail++ }

const ENRICH_ROUTE = 'api/network/enrich-person.ts'
const ADD_ROUTE = 'api/network/add-person.ts'
const SCAN_ROUTE = 'api/network/scan-card.ts'
const QUOTA = 'api/_quota.ts'
const PERSON_ENRICH = 'api/_personEnrich.ts'

const read = (p: string) => readFileSync(p, 'utf8')

/** The body of the brace-delimited block whose opening `{` is at `open`.
 *  Naive matching — no string/comment awareness — which is fine here because it
 *  runs over one known block in one file this script also asserts the shape of. */
function blockAt(src: string, open: number): string {
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') {
      depth--
      if (depth === 0) return src.slice(open, i + 1)
    }
  }
  return ''
}

// 1. The three statuses that mean "the account cannot serve this call" must all
//    stay blocking. Dropping one — rate_limited is the tempting one, because it
//    looks transient — puts a whole class of empty-account failures back on the
//    silent path.
{
  const src = read(QUOTA)
  const block = /const BLOCKING[^=]*=[\s\S]*?\]\)/.exec(src)?.[0] ?? ''
  for (const s of ['exhausted', 'auth_failed', 'rate_limited']) {
    if (!block.includes(`'${s}'`)) bad(`${QUOTA}: '${s}' is no longer in the BLOCKING set, so it will degrade silently instead of stopping the run.`)
  }
  if (!/skipped_no_key/.test(src)) bad(`${QUOTA}: skipped_no_key is gone — an unset key would then read as a fault and alert on every run.`)
}

// 2. The enrichment route must check `blocked` and return BEFORE it can write
//    'enriched'.
//
//    Checked by SHAPE, not just by presence. An earlier version of this guard
//    only asserted that the string appeared before the write, which
//    `if (false && result.summary.blocked.length)` satisfies — so it passed a
//    deliberately disabled guard. The conditional is now matched exactly, and
//    its body must contain the 402 return: a check that does not return is not
//    a check.
{
  const src = read(ENRICH_ROUTE)
  const GUARD = 'if (result.summary.blocked.length) {'
  const guard = src.indexOf(GUARD)
  const enriched = src.indexOf(`enrichment_status: 'enriched'`)

  if (guard < 0) {
    bad(`${ENRICH_ROUTE}: the blocked guard is missing or reshaped. It must read exactly \`${GUARD}\` — anything else (an && , a negation, a flag) can disable it without looking disabled.`)
  }
  if (enriched < 0) bad(`${ENRICH_ROUTE}: expected an enrichment_status: 'enriched' write to guard.`)
  if (guard >= 0 && enriched >= 0) {
    if (guard > enriched) {
      bad(`${ENRICH_ROUTE}: the blocked check appears AFTER the 'enriched' write, so a credit wall would be recorded as a completed enrichment.`)
    }
    // The guard's OWN block, found by brace matching — not the whole span up to
    // the write. Slicing to the write was wrong: a second 402 return further
    // down (the embedding-blocked branch) sat inside that span and satisfied
    // the test even with this guard's own return deleted.
    const body = blockAt(src, guard + GUARD.length - 1)
    if (!/return res\.status\(402\)/.test(body)) {
      bad(`${ENRICH_ROUTE}: the blocked guard does not return 402 before the 'enriched' write, so execution continues into it.`)
    }
    if (!/enrichment_status: 'blocked_quota'/.test(body)) {
      bad(`${ENRICH_ROUTE}: the blocked guard does not record 'blocked_quota', so the row would keep whatever status it had and never be retried deliberately.`)
    }
    // Scoped to the block, not the file: an alert raised somewhere else in the
    // route does not make THIS path noisy, and a silent stop is the failure
    // this whole guard exists to prevent.
    if (!/raiseQuotaAlert\(/.test(body)) {
      bad(`${ENRICH_ROUTE}: the blocked guard stops the run without raising an alert. Stopping quietly is only marginally better than half enriching.`)
    }
  }
  if (!src.includes('blocked_quota')) bad(`${ENRICH_ROUTE}: no 'blocked_quota' terminal status — a credit wall would be indistinguishable from a transient failure and would be retried forever or not at all.`)
  if (!src.includes('raiseQuotaAlert')) bad(`${ENRICH_ROUTE}: no raiseQuotaAlert call — the run would stop silently, which is the failure mode this path was built to remove.`)
  // An embedding failure is the same class of problem: no vector, no findability.
  if (!/isBlocking\(embedOutcome\)/.test(src)) bad(`${ENRICH_ROUTE}: the embedding outcome is not checked for blocking — a person could be marked enriched while being invisible to network_search.`)
}

// 3. Every route that can meet a paid API must be able to raise the alert.
for (const route of [ADD_ROUTE, SCAN_ROUTE]) {
  const src = read(route)
  if (!src.includes('raiseQuotaAlert')) bad(`${route}: reaches a paid API but cannot raise a quota alert.`)
  if (!/isBlocking|blocked/.test(src)) bad(`${route}: never inspects whether a provider was blocked.`)
}

// 4. The blocked_quota status must be legal in the database, or every write of
//    it fails the CHECK constraint at runtime — turning the honest path into a
//    500 and the dishonest one into the only one that works.
{
  const migrations = readFileSync('supabase/migrations/20260821090000_enrichment_blocked_quota.sql', 'utf8')
  if (!migrations.includes('blocked_quota')) bad('the enrichment_status migration no longer permits blocked_quota.')
}

// 5. The structured enrichment must not go back to swallowing failures into ''.
//    This is the exact shape of the original bug, so it is worth naming.
{
  const src = read(PERSON_ENRICH)
  if (/catch\s*\{\s*return\s*''\s*\}/.test(src) || /catch\s*\{\s*return\s*""\s*\}/.test(src)) {
    bad(`${PERSON_ENRICH}: a provider swallows its failure into an empty string. Return a ProviderOutcome so the caller can tell "no credits" from "no footprint".`)
  }
  if (!src.includes('hasEvidence')) {
    bad(`${PERSON_ENRICH}: hasEvidence is gone — a run where every provider was skipped would write a Claude-authored judgment with nothing behind it.`)
  }
}

console.log(fail === 0
  ? 'check-enrichment-honesty: OK — a blocked provider stops the run and alerts.'
  : `check-enrichment-honesty: ${fail} problem(s)`)
process.exit(fail === 0 ? 0 : 1)
