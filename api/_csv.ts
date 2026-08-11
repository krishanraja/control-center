// Dependency-free RFC-4180-ish delimited parser.
//
// Promoted out of api/contacts/import.ts, which had the only copy. The network
// intelligence importer needs the identical parser — the file it reads is
// exported from the same pipeline that produces contact imports, and two
// parsers that disagree about quoting would produce two different networks.

/** Split CSV or TSV text into rows of raw fields. Delimiter is sniffed from the
 *  first non-empty line. Handles quoted fields, escaped quotes, embedded
 *  newlines, and both CRLF and CR line endings. */
export function parseDelimited(text: string): string[][] {
  const clean = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const firstLine = clean.split('\n').find(l => l.trim().length > 0) || ''
  const delim = firstLine.split('\t').length > firstLine.split(',').length ? '\t' : ','

  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else {
        field += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === delim) {
        row.push(field); field = ''
      } else if (ch === '\n') {
        row.push(field); field = ''
        rows.push(row); row = []
      } else {
        field += ch
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

/** Parse into objects keyed by header. Headers are lower-cased and trimmed;
 *  rows shorter than the header are padded rather than dropped. */
export function parseDelimitedObjects(text: string): Record<string, string>[] {
  const rows = parseDelimited(text)
  if (rows.length < 2) return []
  const headers = rows[0].map(h => h.trim().toLowerCase())
  const out: Record<string, string>[] = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    if (r.length === 1 && r[0].trim() === '') continue
    const o: Record<string, string> = {}
    headers.forEach((h, j) => { o[h] = (r[j] ?? '').trim() })
    out.push(o)
  }
  return out
}
