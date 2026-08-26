// Keeps the six lenses in api/_lenses.ts and the CHECK constraint in the
// migration from drifting apart.
//
// They are declared twice because they have to be: the constraint is what
// actually rejects a bad write, and the TypeScript union is what stops the code
// producing one. If the two disagree, the failure lands at write time in
// production rather than at build time here, and it lands as a constraint
// violation inside a cron with no obvious cause.
//
// The guard also holds the two design rules that a future edit is most likely
// to quietly undo, because both are the kind of thing that looks like a small
// convenience at the time:
//
//   no catch-all      An 'other' lens makes the discard rule unenforceable, and
//                     the discard rate is the signal about whether the corpus
//                     is right. The old nine-area vocabulary covered everything
//                     and therefore selected for nothing.
//   no resurrection   governance, security and proof have no counterpart among
//                     the six on purpose. Adding one back re-opens the exact
//                     story class the rewrite exists to stop producing.
//
//   npx tsx scripts/check-content-vocabulary.mts
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { LENSES, LENS_SPEC, CHANNELS, CHANNEL_LABEL, RETIRED_AREAS } from '../api/_lenses.ts'

let fail = 0
const bad = (m: string) => { console.log('FAIL: ' + m); fail++ }

const MIGRATIONS = 'scripts/migrations'

// The migration that declares the lens CHECK.
const lensMigration = readdirSync(MIGRATIONS)
  .filter(f => f.endsWith('.sql'))
  .map(f => readFileSync(join(MIGRATIONS, f), 'utf8'))
  .find(s => /shifts_lens_check/.test(s))

if (!lensMigration) {
  bad('no migration declares shifts_lens_check, so nothing in Postgres constrains the lens column')
} else {
  // Pull the values out of the CHECK's array literal.
  const block = lensMigration.slice(lensMigration.indexOf('shifts_lens_check check'))
  const arr = block.slice(0, block.indexOf(']::text[]'))
  const inSql = [...arr.matchAll(/'([a-z_]+)'/g)].map(m => m[1])

  const missingFromSql = LENSES.filter(l => !inSql.includes(l))
  const missingFromCode = inSql.filter(l => !(LENSES as readonly string[]).includes(l))
  if (missingFromSql.length) bad(`lens in code but not in the CHECK: ${missingFromSql.join(', ')}`)
  if (missingFromCode.length) bad(`lens in the CHECK but not in code: ${missingFromCode.join(', ')}`)
  if (!missingFromSql.length && !missingFromCode.length) {
    console.log(`  ${LENSES.length} lenses, code and constraint agree`)
  }
}

// No catch-all.
for (const banned of ['other', 'misc', 'miscellaneous', 'general', 'uncategorised', 'uncategorized']) {
  if ((LENSES as readonly string[]).includes(banned)) {
    bad(`"${banned}" is a catch-all lens. A candidate fitting no lens is discarded, and the discard rate is the signal about the corpus`)
  }
}

// None of the nine retired areas has come back as a lens.
for (const area of RETIRED_AREAS) {
  if ((LENSES as readonly string[]).includes(area)) {
    bad(`"${area}" is back as a lens. It was retired because it selected for the wrong stories`)
  }
}

// Every lens carries a spec, or the classifier has nothing to classify against.
for (const l of LENSES) {
  const spec = LENS_SPEC[l]
  if (!spec?.covers?.trim()) bad(`lens "${l}" has no "covers" text`)
  if (!spec?.channel) bad(`lens "${l}" routes to no channel`)
}
const specOnly = Object.keys(LENS_SPEC).filter(k => !(LENSES as readonly string[]).includes(k))
if (specOnly.length) bad(`LENS_SPEC describes lenses that do not exist: ${specOnly.join(', ')}`)

// Channels: the stored keys must stay as they are, whatever the labels say.
if (CHANNELS.length !== 2 || !CHANNELS.includes('built') || !CHANNELS.includes('paid')) {
  bad(`channel keys changed to ${CHANNELS.join('/')}. shifts.lane, ContentV2Tab, LaneRoom and laneOf() all read 'built' and 'paid'; rename the labels, not the keys`)
}
for (const c of CHANNELS) {
  if (!CHANNEL_LABEL[c]?.trim()) bad(`channel "${c}" has no display label`)
}

// The eleven folders must be seeded by a migration, and the reframed one must
// carry its reframing rather than the narrower question the brief proposed.
{
  const themes = readdirSync(MIGRATIONS)
    .filter(f => f.endsWith('.sql'))
    .map(f => readFileSync(join(MIGRATIONS, f), 'utf8'))
    .find(s => /create table if not exists public\.content_themes/.test(s))
  if (!themes) bad('no migration creates content_themes, so the folders have nowhere to live')
  else {
    const slugs = [...themes.matchAll(/^\s*\('([a-z0-9-]+)',/gm)].map(m => m[1])
    if (slugs.length !== 11) bad(`${slugs.length} folders seeded, expected 11`)
    if (!slugs.includes('judgment-kept-or-codified')) {
      bad('folder 11 is missing. Krish kept it separate from folder 9 and widened it from "who owns the eval"')
    }
    if (/who owns the eval\?/i.test(themes)) {
      bad('folder 11 still carries the narrow "who owns the eval" question, which Krish replaced')
    }
  }
}

console.log(fail === 0
  ? 'PASS  six lenses agreed with the constraint, no catch-all, no retired area, eleven folders seeded'
  : `${fail} FAILURE(S)`)
process.exit(fail ? 1 : 0)
