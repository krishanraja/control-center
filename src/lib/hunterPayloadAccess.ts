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
  if (!row) return false
  if (!sameSecret(String(row.open_key || ''), key)) return false
  if (!OPEN_STATES.includes(String(row.state))) return false
  return Boolean(row.fill_payload)
}
