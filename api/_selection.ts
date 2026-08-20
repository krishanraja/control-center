// Locating a highlighted passage inside the markdown it came from.
//
// The brief editor sent the selection as ProseMirror plain text and the server
// tested it with `body_md.includes(selection)`. That comparison could not work,
// and it failed in six independent ways at once:
//
//   1. Plain text vs markdown. A selection over `**a bold clue lead**` arrives
//      without the asterisks. The brief's clue leads are bold by design, so
//      most of the document was unmatchable.
//   2. Block separators. textBetween(..., '\n') joins blocks with one newline;
//      markdown paragraphs are separated by two.
//   3. sanitizeVoice (api/_content.ts) rewrites every em and en dash into a
//      comma on save, so any sentence containing a dash diverged from the DB
//      copy permanently, and highlighting it always failed.
//   4. The editor migrates inline citations to endnotes on open, adding `[n]`
//      markers the stored copy does not have yet.
//   5. Reading view strips those `[n]` markers and the Sources block back out.
//   6. Links. `[text](url)` renders as `text`; the URL is in the source only.
//
// Every one of those is a difference in punctuation, whitespace or markup, and
// none of them is a difference in the words. So match on the words: reduce both
// sides to lowercase alphanumerics, find the span there, then map back to real
// offsets in the original markdown. What the caller gets back is a substring
// that genuinely exists in the draft, which is the thing the model needs.

/** Lowercase alphanumeric projection of `src`, plus a map back to source offsets. */
function project(src: string): { text: string; map: number[] } {
  const out: string[] = []
  const map: number[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    // `[12]` — a citation marker. Present in the endnote form, absent in the
    // stored inline form and in reading view. Never part of the words.
    if (c === '[') {
      const close = src.indexOf(']', i)
      if (close > i && /^\d+$/.test(src.slice(i + 1, close))) { i = close + 1; continue }
    }
    // `](url)` — a link target. The words are the label before it; the URL is
    // in the markdown only, so skipping it lets a selection span a link.
    if (c === ']' && src[i + 1] === '(') {
      let depth = 0
      let j = i + 1
      for (; j < src.length; j++) {
        if (src[j] === '(') depth++
        else if (src[j] === ')') { depth--; if (depth === 0) { j++; break } }
      }
      i = j
      continue
    }
    if ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) { out.push(c); map.push(i) }
    else if (c >= 'A' && c <= 'Z') { out.push(c.toLowerCase()); map.push(i) }
    i++
  }
  return { text: out.join(''), map }
}

export interface SpanHit {
  /** Offsets into the ORIGINAL source. */
  start: number
  end: number
  /** The real markdown at those offsets — pass this to the model. */
  text: string
  /** True when the words appear more than once; the first is used. */
  ambiguous: boolean
}

/**
 * Find `selection` inside `source`, ignoring markup, punctuation and
 * whitespace. Returns null when the words genuinely are not there.
 *
 * `minWords` guards against a stray one-word highlight matching in the wrong
 * place; below it we would rather scope nothing than scope the wrong sentence.
 */
export function locateSpan(source: string, selection: string, minChars = 8): SpanHit | null {
  if (!source || !selection) return null
  const hay = project(source)
  const need = project(selection)
  if (need.text.length < minChars) return null

  const at = hay.text.indexOf(need.text)
  if (at < 0) return null

  const start = hay.map[at]
  const end = hay.map[at + need.text.length - 1] + 1
  return {
    start,
    end,
    text: source.slice(start, end),
    ambiguous: hay.text.indexOf(need.text, at + 1) >= 0,
  }
}
