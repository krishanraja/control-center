// Citation rendering for the weekly brief (BriefEditor).
//
// The brief's canonical body is markdown. Historically each Headlines bullet
// carried its citation INLINE, right after the bold headline:
//
//   - **Meta spent $145B on agents...** (Evolving AI Insights / Yahoo Finance, https://...)
//     Why it matters: ...
//
// That reads badly: the source and a raw URL interrupt the sentence every line.
// Krish's rule is "citations always go at the end," with a toggle to hide them
// entirely. This module is the single source of truth for that transform.
//
// The canonical form we normalize TO is endnote style: clean headline bullets
// carrying a small [n] marker, and a "## Sources" section at the very end that
// lists each numbered source as a markdown link. `renderBrief` is idempotent —
// feeding it endnote-form or legacy inline-form (or a mix) yields the same
// result — so it doubles as a one-way migration when a legacy brief is opened.

export interface Citation {
  source: string
  url: string | null
}

const URL_RE = /https?:\/\/[^\s)\]]+/
// A trailing parenthetical only counts as a citation (vs. a headline aside like
// "(a lot)") when it carries a URL, a comma, or a source path separator.
const LOOKS_LIKE_CITATION = /https?:\/\/|,|\s\/\s|\|/

const SOURCES_HEADING = /^#{1,6}\s+sources\s*$/i
const LIST_ITEM = /^(\s*)([-*])\s+(.*)$/
const BOLD = /\*\*.+?\*\*/

function parseCitationInner(inner: string): Citation {
  const trimmed = inner.trim()
  const m = trimmed.match(URL_RE)
  if (m) {
    const url = m[0]
    // Everything before the URL is the source; drop the trailing separator.
    const source = trimmed.slice(0, m.index).replace(/[\s,;:·|]+$/, '').replace(/[\s—–-]+$/, '').trim()
    return { source: source || url, url }
  }
  return { source: trimmed, url: null }
}

// Parse a "## Sources" list entry: "1. [Source](url)" | "1. Source — url" | "1. Source".
function parseSourceEntry(line: string): Citation | null {
  const body = line.trim().replace(/^(?:\d+[.)]|[-*])\s+/, '')
  if (!body) return null
  const link = body.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)\s*$/)
  if (link) return { source: link[1].trim(), url: link[2] }
  return parseCitationInner(body)
}

/**
 * Reduce any brief markdown to clean prose (no inline citations, no [n]
 * markers, no Sources section) plus the ordered list of citations. Citations
 * are read from an existing "## Sources" section when present, otherwise from
 * the inline parentheticals on the headline bullets.
 */
export function extractCitations(md: string): { prose: string; sources: Citation[] } {
  const lines = (md || '').replace(/\r\n/g, '\n').split('\n')

  // 1) Peel off a trailing "## Sources" section, if any.
  let sourcesStart = -1
  for (let i = lines.length - 1; i >= 0; i--) {
    if (SOURCES_HEADING.test(lines[i])) { sourcesStart = i; break }
    // Only look at the tail: stop once we hit real content above a heading gap.
    if (/^#{1,6}\s+/.test(lines[i]) && !SOURCES_HEADING.test(lines[i])) break
  }
  const endSources: Citation[] = []
  let body = lines
  if (sourcesStart !== -1) {
    for (const raw of lines.slice(sourcesStart + 1)) {
      const c = parseSourceEntry(raw)
      if (c) endSources.push(c)
    }
    body = lines.slice(0, sourcesStart)
  }

  // 2) Strip inline citations / markers off headline bullets, collecting the
  //    inline ones in bullet order.
  const inlineSources: Citation[] = []
  const clean = body.map(line => {
    const li = line.match(LIST_ITEM)
    if (!li || !BOLD.test(line)) return line
    const boldClose = line.lastIndexOf('**')
    if (boldClose === -1) return line
    const head = line.slice(0, boldClose + 2)
    const tail = line.slice(boldClose + 2)
    // Trailing [n] marker (endnote form) — drop it; source comes from endSources.
    // TipTap's markdown serializer backslash-escapes brackets, so a marker can
    // round-trip back as "\[1\]"; tolerate the escaped form too.
    const marker = tail.match(/^\s*\\?\[\d+\\?\]\s*$/)
    if (marker) return head
    // Trailing (citation) — extract and drop it.
    const paren = tail.match(/^\s*\((.*)\)\s*$/)
    if (paren && LOOKS_LIKE_CITATION.test(paren[1])) {
      inlineSources.push(parseCitationInner(paren[1]))
      return head
    }
    return line
  })

  const sources = endSources.length ? endSources : inlineSources
  const prose = clean.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '')
  return { prose, sources }
}

function sourcesBlock(sources: Citation[]): string {
  const items = sources.map((s, i) => {
    const label = s.source || s.url || 'source'
    return s.url ? `${i + 1}. [${label}](${s.url})` : `${i + 1}. ${label}`
  })
  return ['## Sources', '', ...items].join('\n')
}

/**
 * Render a brief for reading/editing.
 *   citations=true  → clean prose + [n] markers on headlines + "## Sources" end.
 *   citations=false → clean prose only (markers and Sources removed).
 * Idempotent in both directions, so it's safe to run on already-rendered input.
 */
export function renderBrief(md: string, citations: boolean): string {
  const { prose, sources } = extractCitations(md)
  if (!citations || sources.length === 0) return prose

  // Re-attach [n] markers to the headline bullets, in order.
  let n = 0
  const marked = prose.split('\n').map(line => {
    if (n >= sources.length) return line
    const li = line.match(LIST_ITEM)
    if (!li || !BOLD.test(line)) return line
    const boldClose = line.lastIndexOf('**')
    if (boldClose === -1) return line
    n += 1
    return `${line.slice(0, boldClose + 2)} [${n}]${line.slice(boldClose + 2)}`
  }).join('\n')

  return `${marked.replace(/\s+$/, '')}\n\n${sourcesBlock(sources)}\n`
}

/** Canonical (endnote) form for storage: citations always live at the end. */
export function toEndnotes(md: string): string {
  return renderBrief(md, true)
}
