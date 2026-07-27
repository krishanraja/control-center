// Concreteness validation for anything the operator commits to as a next action:
// the evening shutdown's tomorrow ONE, and red mode's fallback question when no
// evening entry exists.
//
// Deterministic, no LLM call. The point is not accuracy, it is friction in one
// specific direction: abstract phrasing ("think about positioning") is how a
// task becomes a research project instead of a thing that leaves the machine.
//
// Both lists live here as one editable constant block on purpose. Edit them
// freely, that is the intended maintenance path.

/** An observable action verb. At least one of these must appear. */
export const CONCRETE_VERBS: string[] = [
  'send', 'email', 'publish', 'post', 'call', 'invoice', 'price', 'ask',
  'submit', 'book', 'activate', 'ship', 'dm', 'reply',
]

/** Abstract processing. Any one of these rejects the entry outright. */
export const BANNED_ABSTRACT: string[] = [
  'strategy', 'positioning', 'think about', 'figure out', 'plan for',
  'explore', 'research', 'consider', 'decide who', 'vision',
]

export const REWRITE_HINT = 'Name the action, the recipient, and what leaves your machine.'

export interface ConcretenessResult {
  ok: boolean
  /** Populated only when ok is false. */
  hint?: string
  /** The banned term that triggered the rejection, for the caller to highlight. */
  bannedTerm?: string
}

/**
 * Reject entries that contain no concrete verb, or that contain any banned
 * abstract term. Verbs match on word boundaries so "asked" and "asking" count
 * while "task" does not. Banned terms match as substrings because several are
 * multi-word phrases.
 */
export function validateConcreteness(text: string): ConcretenessResult {
  const trimmed = (text || '').trim()
  if (!trimmed) return { ok: false, hint: REWRITE_HINT }

  const lower = trimmed.toLowerCase()

  const bannedTerm = BANNED_ABSTRACT.find(term => lower.includes(term))
  if (bannedTerm) return { ok: false, hint: REWRITE_HINT, bannedTerm }

  const hasVerb = CONCRETE_VERBS.some(verb => new RegExp(`\\b${verb}\\w*`, 'i').test(lower))
  if (!hasVerb) return { ok: false, hint: REWRITE_HINT }

  return { ok: true }
}
