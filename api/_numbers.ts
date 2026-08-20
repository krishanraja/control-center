// Number verification, shared by every route that asks a model to write from
// a source it must not exceed. Extracted from content-ideas/[id]/channel-cut,
// which learned the lesson the hard way and wrote it down; the comment below
// is that lesson, unchanged.

/** Numbers in the text, normalised so "$606" and "606" compare equal and
 *  thousands separators do not create false mismatches. */
export function numbersIn(text: string): string[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) || []).map(n => n.replace(/,/g, '').replace(/\.0+$/, ''))
}

/**
 * Which figures in a cut are NOT present in what it was cut from.
 *
 * The system prompt tells the model every number must appear verbatim in the
 * source. It mostly obeys and then quietly does not: a cut of a piece stating
 * 606 and 470 produced "142 saved" (the arithmetic is 136), and a later run
 * produced a "40 minutes" that existed nowhere. Both read as researched facts.
 *
 * So this checks rather than trusts. It does not block: a channel cut is a
 * draft Krish reads, and a false positive that refused to save would be worse
 * than a flag he can glance at. The unmatched figures go into the cut's notes
 * and into the toast, which is the difference between an invented number he
 * catches now and one he catches after publishing.
 *
 * Small integers are ignored deliberately. Numbers under 13 are overwhelmingly
 * ordinary prose ("three retry loops", "one config change") rather than claims,
 * and flagging them buries the real finding in noise.
 */
export function unsupportedNumbers(cut: string, source: string): string[] {
  const inSource = new Set(numbersIn(source))
  const seen = new Set<string>()
  const out: string[] = []
  for (const n of numbersIn(cut)) {
    if (inSource.has(n) || seen.has(n)) continue
    if (Number(n) < 13) continue
    // A year the source does not mention is still worth flagging, but a
    // percentage the source states as a decimal is not: check both readings.
    if (inSource.has(String(Number(n) / 100)) || inSource.has(String(Number(n) * 100))) continue
    seen.add(n)
    out.push(n)
  }
  return out.slice(0, 8)
}
