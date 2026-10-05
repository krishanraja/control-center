/**
 * The one place that knows what a visibility number means.
 *
 * `visibility_targets.relevance_score` was never one scale. Read off the live
 * table on 2026-10-05:
 *
 *   nell-scout, nell-triage-2026-05-27     7, 8, 9      85 rows   (a 1-10 scale)
 *   nova_sweep, nova_retarget_2026-06-02   72 to 95     20 rows   (a 0-100 scale)
 *   nova_podchaser_*                       NULL         24 rows
 *
 * No row in the corpus scores between 10 and 69, and there was no CHECK
 * constraint to stop either writer. The read path did not know either: three
 * call sites rendered the column as "/10", so a Nova row at 88 printed the
 * literal string "88/10" with its strength bar pinned at full and a composite
 * of 880. Both halves looked plausible on their own, which is why it survived.
 *
 * The standard (api/_visibilityScore.ts, score_version 1) replaces it with three
 * axes on one declared 0-100 scale. This module exists for the in-between: the
 * legacy column still holds the only record of the 14 targets Krish ever acted
 * on, so it is read, normalised honestly, and never confused with the new one.
 *
 * Zero imports, no DOM, no import.meta: the serverless tree imports this file
 * too ('../../src/lib/visibilityScale.js'), like ventureOptions.ts and
 * webProperties.ts.
 */

/** The verdicts the standard can reach. `unjudged` is the honest fourth state:
 *  the material did not support a judgement, which is not the same fact as a
 *  low score and must never render as one. */
export type VisibilityVerdict = 'take' | 'stretch' | 'rejected' | 'unjudged'

/** The score version the current standard writes. Anything else is history. */
export const VISIBILITY_STANDARD_VERSION = 1

/**
 * A legacy `relevance_score` as a number out of ten, whichever scale it was
 * written on.
 *
 * Above 10 the writer was on the 0-100 scale, so it is divided; at or below 10
 * it was already out of ten. The boundary is safe precisely because the corpus
 * is empty between 10 and 69, and that gap is asserted by
 * scripts/check-visibility-standard.mts so a future row cannot land in it
 * unnoticed.
 *
 * Returns null rather than a default. A made-up middling number is how the
 * backburner sweep produced a confident "score 38" for two rows that had no
 * score at all, and those two rows became the entire evidence base for a
 * proposed hard floor.
 */
export function legacyRelevanceOutOfTen(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN
  if (!Number.isFinite(n)) return null
  const out = n > 10 ? n / 10 : n
  return Math.max(0, Math.min(10, Math.round(out * 10) / 10))
}

/** The three axes and the conjunction, for a row read from the database. */
export interface VisibilityAxes {
  room: number | null
  standing: number | null
  onlyHim: number | null
  /** The minimum of the three. Null until the standard has judged the row. */
  overall: number | null
}

/** Just the columns the standard writes. A structural type rather than
 *  Record<string, unknown>, so a typed row from the hook and an untyped row
 *  from the registry both satisfy it without a cast at every call site. */
export interface ScoredRow {
  score_version?: number | null
  room_score?: number | null
  standing_score?: number | null
  only_him_score?: number | null
  visibility_score?: number | null
  verdict?: string | null
}

function int(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null
}

/**
 * Axes for a row, or all nulls when the standard has not judged it under the
 * current version. A row judged under an older version is treated as unjudged
 * rather than silently mixed with current ones, which is the rule
 * events.score_version exists for.
 */
export function axesOf(row: ScoredRow | null | undefined): VisibilityAxes {
  const none: VisibilityAxes = { room: null, standing: null, onlyHim: null, overall: null }
  if (!row) return none
  if (int(row.score_version) !== VISIBILITY_STANDARD_VERSION) return none
  return {
    room: int(row.room_score),
    standing: int(row.standing_score),
    onlyHim: int(row.only_him_score),
    overall: int(row.visibility_score),
  }
}

/** The verdict on a row, or null when it has not been judged under the current
 *  standard. Never inferred from a number: a verdict the code guessed is a
 *  verdict nothing computed. */
export function verdictOf(row: ScoredRow | null | undefined): VisibilityVerdict | null {
  if (!row) return null
  if (int(row.score_version) !== VISIBILITY_STANDARD_VERSION) return null
  const v = row.verdict
  return v === 'take' || v === 'stretch' || v === 'rejected' || v === 'unjudged' ? v : null
}

/** Plain words for a verdict, for a label or an aria string. */
export const VERDICT_LABEL: Record<VisibilityVerdict, string> = {
  take: 'Worth taking',
  stretch: 'Stretch',
  rejected: 'Refused',
  unjudged: 'Not judged',
}

/**
 * The reject codes, in plain words, for the surface that shows a refusal.
 *
 * The codes themselves are the ONE taxonomy in servedSurfaces.ts; these are the
 * sentences the card prints, written as the reason Krish would give rather than
 * as a category name. A rejection the reader cannot understand is the same as a
 * silent drop with extra steps.
 */
export const REJECT_SENTENCE: Record<string, string> = {
  visibility_wrong_audience: 'The audience does not contain anyone who can move a decision.',
  visibility_too_low_tier: 'The platform does not carry enough standing to be worth citing later.',
  visibility_too_technical: 'The room is practitioners, not the people who buy.',
  visibility_off_vertical: 'The audience is press and commentators rather than operators.',
  visibility_pay_to_play: 'The slot is bought. Exposure on its own is not payment.',
  visibility_no_relevant_talk: 'The angle is one anybody could give, so it is not his.',
  visibility_bad_timing: 'The date has passed.',
  visibility_unlikely_accepted: 'The application is unlikely to be accepted.',
  visibility_wrong_location: 'The wrong city, with no trip that makes it work.',
  visibility_already_pitched: 'Already pitched.',
  visibility_other: 'Refused, with no reason recorded. That is a defect in the judge, not a verdict.',
}

/** The sentence for a reject code, honest about an unknown one rather than
 *  rendering a raw code at a reader. */
export function rejectSentence(code: string | null | undefined): string {
  if (!code) return REJECT_SENTENCE.visibility_other
  return REJECT_SENTENCE[code] || `Refused as ${code.replace(/^visibility_/, '').replace(/_/g, ' ')}.`
}
