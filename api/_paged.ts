// Read every row of a PostgREST query, a page at a time.
//
// This project's PostgREST returns at most 1,000 rows per request, whatever
// .limit() asks for. A probe of audit_log?limit=5000 came back as rows 0-999 of
// 14,019, with no error. So a read that asks for 5,000 and gets 1,000 looks
// exactly like a read that found 1,000. That is how "Where it went · 30 days"
// came to cover about twenty days: readUnits asked for 5,000 meter rows,
// ordered newest first, and silently got the newest 1,000 of 1,408.
//
// No Supabase import here on purpose. The caller builds the query, so this
// stays testable without credentials and works with any table.

/** The most rows PostgREST hands back in one response on this project. */
export const POSTGREST_MAX_ROWS = 1000

export interface PageResult<T> {
  data: T[] | null
  error: { message: string } | null
}

/**
 * Keep asking for the next range until a short page says the table is done.
 *
 * `page(from, to)` must build a FRESH query each call (supabase-js builders
 * are mutable) with a stable total order, or rows can repeat or go missing
 * between pages. `max` is a safety ceiling, and `truncated` says when it bit,
 * so a caller can say "at least" instead of reporting a partial sum as whole.
 */
export async function readPaged<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  opts: { max?: number; pageSize?: number } = {},
): Promise<{ rows: T[]; error: string | null; truncated: boolean }> {
  const max = Math.max(1, opts.max ?? 50_000)
  const size = Math.max(1, Math.min(opts.pageSize ?? POSTGREST_MAX_ROWS, POSTGREST_MAX_ROWS))
  const rows: T[] = []
  let from = 0
  while (rows.length < max) {
    const want = Math.min(size, max - rows.length)
    const { data, error } = await page(from, from + want - 1)
    if (error) return { rows, error: error.message || String(error), truncated: false }
    const got = data || []
    // Only an EMPTY page proves the end. A short page usually is the end, but
    // a server cap below `want` also returns a short page, and treating that as
    // the end is the exact silent truncation this helper exists to stop. One
    // extra empty request is the price of never having to trust the cap.
    if (got.length === 0) return { rows, error: null, truncated: false }
    rows.push(...got)
    from += got.length
  }
  return { rows, error: null, truncated: true }
}
