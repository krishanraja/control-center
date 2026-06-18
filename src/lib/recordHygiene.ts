// recordHygiene — keep test/demo rows out of live decision views.
//
// Krish's call (2026-06-17): hide test/demo data from every live list. This is a
// VIEW filter only — nothing is deleted; the rows stay in the DB and in any
// admin/debug surface that opts out. Conservative by design: it must never hide
// a real lead/contact/customer/guest. If a pattern is too aggressive, narrow it
// here — this is the single place every tab reads.

const TEST_PATTERNS: RegExp[] = [
  /^\s*test[-_ ]/i,          // "test-", "test_", "test "
  /^\s*test\d/i,             // "test123"
  /\btest-\d{6,}\b/i,        // "test-1781008408512" (timestamped test ids)
  /^\s*demo[-_ ]/i,          // "demo-"
  /@(test|example|demo)\.(com|org|net)$/i, // throwaway domains
  /\bplaceholder\b/i,
  /\blorem ipsum\b/i,
]

// Known one-off demo/non-business accounts (exact, lowercased). laurenkthermos is
// Lauren's personal account — not a Krish-business customer (see OS hard rule).
const KNOWN_TEST = new Set<string>([
  'laurenkthermos',
  'laurenkthermos@gmail.com',
])

/** Fields that, if they look like test data, mark the whole row as test. */
const CANDIDATE_FIELDS = ['full_name', 'name', 'email', 'company', 'title', 'idea'] as const

export function isTestRecord(row: Record<string, any> | null | undefined): boolean {
  if (!row) return false
  for (const key of CANDIDATE_FIELDS) {
    const raw = row[key]
    if (typeof raw !== 'string' || !raw.trim()) continue
    const low = raw.toLowerCase().trim()
    if (KNOWN_TEST.has(low)) return true
    if (TEST_PATTERNS.some(re => re.test(raw))) return true
  }
  return false
}

/** Drop test/demo rows from a list for a live view. */
export function withoutTestRecords<T extends Record<string, any>>(rows: T[]): T[] {
  return rows.filter(r => !isTestRecord(r))
}

/** Count of test rows hidden — for an honest "N demo rows hidden" affordance. */
export function countTestRecords(rows: Array<Record<string, any>>): number {
  let n = 0
  for (const r of rows) if (isTestRecord(r)) n++
  return n
}
