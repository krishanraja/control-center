// Who may read one application's fill payload.
//
// The payload carries Krish's CV and every answer he gave, so this is the whole
// of the access decision, kept out of the route so it can be tested without a
// database. The capability is the token AND the key: a job id is guessable in
// shape, a 32-character key generated per application is not.

import { timingSafeEqual } from 'node:crypto'

export const OPEN_STATES = ['awaiting', 'approved']

export type ApprovalRow = {
  state?: string | null
  open_key?: string | null
  fill_payload?: unknown
} | null

export function sameSecret(a: string, b: string): boolean {
  // Constant time. A timing oracle on a secret is still a way to read it.
  // Uint8Array rather than Buffer: this file is typechecked against the DOM
  // lib as well as node, where Buffer's ArrayBufferLike does not satisfy
  // ArrayBufferView.
  const left = new TextEncoder().encode(a || '')
  const right = new TextEncoder().encode(b || '')
  if (left.length !== right.length || left.length === 0) return false
  return timingSafeEqual(left, right)
}

// One answer for every failure. A wrong key, an unknown token, a cancelled
// application and one with no payload all read the same from outside, so this
// cannot be used to find out which applications exist.
export function mayRead(row: ApprovalRow, key: string): boolean {
  return verdict(row, key) === 'ok'
}

// Someone holding the right key for a superseded application is the person the
// email was sent to, not a stranger probing for job ids, so telling them it was
// superseded gives nothing away and saves them a bare 404 on a link they were
// told to press. Krish opened an older email and got "the server said 404".
// Every OTHER failure stays indistinguishable.
export type Verdict = 'ok' | 'superseded' | 'no'

export function verdict(row: ApprovalRow, key: string): Verdict {
  if (!row) return 'no'
  if (!sameSecret(String(row.open_key || ''), key)) return 'no'
  if (!row.fill_payload) return 'no'
  if (OPEN_STATES.includes(String(row.state))) return 'ok'
  return 'superseded'
}

// Whether a press may be RECORDED, which is a different question from whether a
// payload may be read, and must not borrow verdict()'s answer.
//
// verdict()'s 'superseded' means "not awaiting or approved", and that includes
// 'cancelled'. A cancelled token is one approval.supersede() killed so a stale
// APPROVE could not land later, for the one reason it is ever used: Krish asked
// for the application to be amended. Recording a submit on it would flip it back
// to submitted, archive the role off his Pipeline tab into Applied, and make
// hunter skip the APPROVE he sends for the rebuilt application. The role would
// read applied for a package he rejected, and never be hunted again.
//
//   record   mark it submitted
//   already  it is already closed, so do nothing and say so. Pressing twice, or
//            the employer's receipt landing first, is not an error
//   gone     the right key on a token that is no longer open. He is the person
//            the email went to, so he is told, exactly as a superseded read is
//   no       indistinguishable from every other failure
export type SubmitVerdict = 'record' | 'already' | 'gone' | 'no'

export function maySubmit(
  row: (ApprovalRow & { submitted_at?: string | null }) | null,
  key: string,
): SubmitVerdict {
  if (!row) return 'no'
  if (!sameSecret(String(row.open_key || ''), key)) return 'no'
  // Before the state gate: a submitted row is itself outside OPEN_STATES.
  if (row.submitted_at) return 'already'
  if (!OPEN_STATES.includes(String(row.state))) return 'gone'
  return 'record'
}

// What gets recorded as the evidence for a submission.
//
// Two kinds of report reach /submitted. The extension saw the form confirm it,
// and sends the words it matched, which are quoted into the receipt email. Or
// Krish pressed "I applied, mark it" on the banner because the form never said
// anything the extension recognised (openrouter, 25 September). That second
// kind is his word, and the server writes its own sentence for it rather than
// trusting text from the page: hunter's receipts branch on this exact prefix to
// say "recorded on your word" instead of "the form acknowledged it".
export const SAID_SO = 'Krish said he submitted this himself'

export function recordedEvidence(body: { evidence?: unknown; said_so?: unknown }): string {
  if (body.said_so === true) return `${SAID_SO} (extension button)`
  return String(body.evidence || '').slice(0, 300).trim()
}
