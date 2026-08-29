// Section-level diff for brief revisions (BriefComposer's "keep just part").
//
// A magic edit or a Cleo instruction returns a whole rewritten draft. Replacing
// the entire body wholesale is all-or-nothing: you can't take the sharper
// ending but keep the headlines you already liked. This splits both drafts on
// their markdown headings, shows what actually changed per section, and lets
// each change be kept or dropped independently. The brief's structure is stable
// (Title / Headlines / What this actually means / Position / Sources), so
// heading keys line the two drafts up cleanly.

export type SectionStatus = 'same' | 'changed' | 'added' | 'removed'

export interface Section { key: string; heading: string; body: string }
export interface SectionDiff {
  key: string
  heading: string
  status: SectionStatus
  before: string
  after: string
}

export type DiffOp = { type: 'same' | 'add' | 'del'; text: string }

function slug(heading: string): string {
  return heading.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'section'
}

/** Split markdown into level-1/2 heading sections (### stays inside its parent). */
export function splitSections(md: string): Section[] {
  const lines = (md || '').replace(/\r\n/g, '\n').split('\n')
  const out: Section[] = []
  let cur: Section | null = null
  let preamble: string[] = []
  for (const line of lines) {
    const m = /^(#{1,2})\s+(.*)$/.exec(line)
    if (m) {
      if (cur) out.push(cur)
      const heading = m[2].trim()
      cur = { key: slug(heading), heading, body: line }
    } else if (cur) {
      cur.body += `\n${line}`
    } else {
      preamble.push(line)
    }
  }
  if (cur) out.push(cur)
  // Any text before the first heading becomes an untitled lead section so it is
  // never silently dropped by a merge.
  const lead = preamble.join('\n').trim()
  if (lead) out.unshift({ key: '__lead__', heading: '', body: lead })
  return out
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

/**
 * Diff two drafts by section. Order follows `after` (the revision); any
 * section that existed only in `before` (a removed section) is appended so it
 * still surfaces for review. Unchanged sections are included with status
 * 'same' so a merge can reproduce the full document.
 */
export function diffSections(before: string, after: string): SectionDiff[] {
  const a = splitSections(before)
  const b = splitSections(after)
  const aByKey = new Map(a.map(s => [s.key, s]))
  const bByKey = new Map(b.map(s => [s.key, s]))
  const out: SectionDiff[] = []

  for (const bs of b) {
    const as = aByKey.get(bs.key)
    if (!as) {
      out.push({ key: bs.key, heading: bs.heading, status: 'added', before: '', after: bs.body })
    } else {
      const status: SectionStatus = norm(as.body) === norm(bs.body) ? 'same' : 'changed'
      out.push({ key: bs.key, heading: bs.heading, status, before: as.body, after: bs.body })
    }
  }
  for (const as of a) {
    if (!bByKey.has(as.key)) {
      out.push({ key: as.key, heading: as.heading, status: 'removed', before: as.body, after: '' })
    }
  }
  return out
}

/**
 * Rebuild the draft, taking the revised version only for the section keys in
 * `kept`. Same sections and rejected changes keep their original text; a
 * rejected 'added' section is omitted; a rejected 'removed' section is retained.
 */
export function mergeSections(diffs: SectionDiff[], kept: Set<string>): string {
  const parts: string[] = []
  for (const d of diffs) {
    const keep = kept.has(d.key)
    if (d.status === 'same') parts.push(d.before)
    else if (d.status === 'changed') parts.push(keep ? d.after : d.before)
    else if (d.status === 'added') { if (keep) parts.push(d.after) }
    else if (d.status === 'removed') { if (!keep) parts.push(d.before) }
  }
  return parts.filter(Boolean).join('\n\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

/** Token-level (word + whitespace) diff via a longest-common-subsequence walk. */
export function wordDiff(before: string, after: string): DiffOp[] {
  const a = before.split(/(\s+)/).filter(t => t.length)
  const b = after.split(/(\s+)/).filter(t => t.length)
  const n = a.length, m = b.length
  // LCS length table.
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const ops: DiffOp[] = []
  const push = (type: DiffOp['type'], text: string) => {
    const last = ops[ops.length - 1]
    if (last && last.type === type) last.text += text
    else ops.push({ type, text })
  }
  let i = 0, j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) { push('same', a[i]); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { push('del', a[i]); i++ }
    else { push('add', b[j]); j++ }
  }
  while (i < n) { push('del', a[i]); i++ }
  while (j < m) { push('add', b[j]); j++ }
  return ops
}
