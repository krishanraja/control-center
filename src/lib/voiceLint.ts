// voiceLint — pure-client enforcement of the krish-voice kill list.
//
// This is the mechanical layer of the voice skill: the things that are always
// wrong regardless of argument, so they can be flagged inline as Krish edits a
// draft WITHOUT an LLM round-trip. Substance (angle, antagonist, the Five
// Standards) is judged server-side; this only catches the tells.
//
// Source of truth: krish-voice "Hard Rules (The Kill List)" + "Words to avoid".
// Keep this list in sync with that skill, not with general copy-editing taste.

export type LintSeverity = 'error' | 'warn'

export interface LintIssue {
  /** Stable rule id, e.g. 'em-dash'. */
  rule: string
  severity: LintSeverity
  /** Character offset into the linted text where the match starts. */
  index: number
  /** The exact matched substring. */
  match: string
  /** Human message — short, in Krish's register. */
  message: string
}

// Banned vocabulary (krish-voice → "Words to avoid" + kill list). Matched as
// whole words, case-insensitive. "leverage" is banned except inside the fixed
// framework name "leverage audit" — handled as a special case below.
const BANNED_WORDS = [
  'excited', 'thrilled', 'seamless', 'empower', 'journey', 'landscape',
  'game-changer', 'game-changing', 'revolutionary', 'cutting-edge', 'robust',
  'utilise', 'utilize', 'facilitate', 'paradigm', 'tapestry', 'moreover',
  'furthermore', 'groundbreaking', 'innovative', 'synergy', 'holistic',
  'spearhead', 'transformative', 'mission-critical', 'best-in-class', 'delve',
  'unpack',
]

// Multi-word AI-tell phrases (kill list). Case-insensitive substring.
const BANNED_PHRASES = [
  "in today's world", "in today's rapidly", 'rapidly evolving',
  'at the end of the day', "here's the thing", 'the truth is',
  "let's dive in", 'deep dive', 'what if i told you', 'the bottom line is',
  'this finds you well', 'i hope this message finds you', 'in your journey',
  'let me know what you think', 'let me know your thoughts',
]

// Correspondence openers that restore the subject pronoun (kill list).
const PRONOUN_OPENERS = [
  'i hope this', 'i am reaching out', "i'm reaching out", 'i wanted to reach',
  'i wanted to share', 'i have been thinking', "i've been thinking",
  'i really enjoyed', 'thank you so much for taking', 'following up on our',
]

function pushWholeWord(text: string, lower: string, word: string, issues: LintIssue[], make: (i: number, m: string) => LintIssue) {
  const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    // "leverage audit" is the one permitted use of leverage.
    if (word === 'leverage' && lower.slice(m.index, m.index + 15) === 'leverage audit') continue
    issues.push(make(m.index, m[0]))
  }
}

/** Lint a block of text against the kill list. Returns issues in document order. */
export function lintVoice(text: string): LintIssue[] {
  if (!text) return []
  const issues: LintIssue[] = []
  const lower = text.toLowerCase()

  // Em dashes — anywhere, hard error. (No em dashes. Anywhere.)
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '—') {
      issues.push({ rule: 'em-dash', severity: 'error', index: i, match: '—', message: 'No em dashes. Use a comma, period, or parentheses.' })
    }
  }

  // Banned single words.
  for (const w of [...BANNED_WORDS, 'leverage']) {
    pushWholeWord(text, lower, w, issues, (i, m) => ({
      rule: 'banned-word', severity: 'warn', index: i, match: m,
      message: `"${m}" is on the kill list.`,
    }))
  }

  // Banned phrases / AI tells.
  for (const p of BANNED_PHRASES) {
    let from = 0, idx
    while ((idx = lower.indexOf(p, from)) !== -1) {
      issues.push({ rule: 'ai-tell', severity: 'warn', index: idx, match: text.slice(idx, idx + p.length), message: `AI tell: "${p}".` })
      from = idx + p.length
    }
  }

  // Restored-pronoun correspondence openers (line-start sensitive-ish: match anywhere, it's almost always an opener).
  for (const p of PRONOUN_OPENERS) {
    const idx = lower.indexOf(p)
    if (idx !== -1) {
      issues.push({ rule: 'restored-pronoun', severity: 'warn', index: idx, match: text.slice(idx, idx + p.length), message: 'Drop the subject pronoun / generic opener. Get straight to purpose.' })
    }
  }

  // Summary ending: a final paragraph opening with a summarising connective.
  const tail = text.trimEnd()
  const lastBreak = Math.max(tail.lastIndexOf('\n'), tail.lastIndexOf('. ') + 1)
  const lastSentence = tail.slice(Math.max(0, lastBreak)).trim().toLowerCase()
  if (/^(in summary|in conclusion|to sum up|to conclude|overall,|in short,)/.test(lastSentence)) {
    issues.push({ rule: 'summary-ending', severity: 'warn', index: Math.max(0, lastBreak), match: lastSentence.slice(0, 24), message: 'End on a hard verdict, not a summary.' })
  }
  // Rhetorical-question or soft closer at the very end.
  if (/\b(i hope|let me know|thoughts\?|in your journey)\b[^.!?]*[.!?]?\s*$/i.test(tail) && tail.length > 40) {
    issues.push({ rule: 'soft-closer', severity: 'warn', index: tail.length - 1, match: 'soft close', message: 'No soft CTA / "I hope" / "let me know" closer. Land a verdict.' })
  }

  return issues.sort((a, b) => a.index - b.index)
}

/** Compact summary for badge display. */
export function lintSummary(text: string): { errors: number; warns: number; issues: LintIssue[] } {
  const issues = lintVoice(text)
  return {
    errors: issues.filter(i => i.severity === 'error').length,
    warns: issues.filter(i => i.severity === 'warn').length,
    issues,
  }
}
