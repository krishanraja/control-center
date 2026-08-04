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

/** Why an entry was rejected, so the UI can say something better than "no". */
export type RejectionReason = 'empty' | 'banned' | 'no_verb'

export interface ConcretenessResult {
  ok: boolean
  reason?: RejectionReason
  /** A specific, actionable sentence. Never the generic hint alone. */
  hint?: string
  /** The banned term that triggered the rejection, for the caller to highlight. */
  bannedTerm?: string
}

/**
 * Reject entries that contain no concrete verb, or that contain any banned
 * abstract term. Verbs match on word boundaries so "asked" and "asking" count
 * while "task" does not. Banned terms match as substrings because several are
 * multi-word phrases.
 *
 * The hint names the actual problem. A generic "rephrase it" reads as the
 * button being broken, which is exactly how the first version failed in use.
 */
export function validateConcreteness(text: string): ConcretenessResult {
  const trimmed = (text || '').trim()
  if (!trimmed) {
    return { ok: false, reason: 'empty', hint: 'Nothing entered yet.' }
  }

  const lower = trimmed.toLowerCase()

  const bannedTerm = BANNED_ABSTRACT.find(term => lower.includes(term))
  if (bannedTerm) {
    return {
      ok: false,
      reason: 'banned',
      bannedTerm,
      hint: `"${bannedTerm}" is processing, not shipping. Who receives something, and what?`,
    }
  }

  const hasVerb = CONCRETE_VERBS.some(verb => new RegExp(`\\b${verb}\\w*`, 'i').test(lower))
  if (!hasVerb) {
    return {
      ok: false,
      reason: 'no_verb',
      hint: 'No action in there yet. Start with Send, Reply, Publish, Invoice, Ask, or Book.',
    }
  }

  return { ok: true }
}

/** Verbs the system can resolve against real inventory (the content queue). */
export const PUBLISHABLE_VERBS: string[] = ['publish', 'post']

/** Placeholder objects. A concrete verb with one of these is intent, not a task. */
export const VAGUE_OBJECT_TERMS: string[] = [
  'something', 'anything', 'whatever', 'stuff', 'some content',
]

/** True when the text carries a publish-shaped verb at all. The picker routes
 *  these through the server-side judgment against the queue. */
export function isPublishIntent(text: string): boolean {
  const lower = (text || '').toLowerCase()
  return PUBLISHABLE_VERBS.some(v => new RegExp(`\\b${v}\\w*`).test(lower))
}

/**
 * The hole the concreteness rule leaves: "Publish something timely and unique"
 * passes because "publish" is a concrete verb, yet it names no artifact and no
 * destination, so it parks on the screen as a decision still to make. This
 * detects that shape so the caller can offer the queue's real candidate as a
 * substitution. Never used to reject: rejection on a red day reads as a broken
 * button, substitution reads as the system doing its job.
 */
export function isVaguePublishIntent(text: string): boolean {
  if (!isPublishIntent(text)) return false
  const lower = (text || '').toLowerCase()
  return VAGUE_OBJECT_TERMS.some(term => lower.includes(term))
}

/**
 * The tappable starters. Picking one guarantees the verb half of the rule is
 * satisfied, so the guided path can never dead-end the way free text can.
 */
export const ACTION_STARTERS: { verb: string; label: string; placeholder: string }[] = [
  { verb: 'Send',     label: 'Send',    placeholder: 'what, and to whom' },
  { verb: 'Reply to', label: 'Reply',   placeholder: 'whose message' },
  { verb: 'Publish',  label: 'Publish', placeholder: 'what, and where' },
  { verb: 'Invoice',  label: 'Invoice', placeholder: 'who, for what' },
  { verb: 'Ask',      label: 'Ask',     placeholder: 'who, for what' },
  { verb: 'Book',     label: 'Book',    placeholder: 'what, with whom' },
  { verb: 'Call',     label: 'Call',    placeholder: 'who, about what' },
  { verb: 'Post',     label: 'Post',    placeholder: 'what, and where' },
]
