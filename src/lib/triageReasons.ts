// Reject-reason vocabulary, now a thin view over src/lib/servedSurfaces.ts.
//
// This file used to own one of three competing copies of the taxonomy. It
// keeps its exports so the ten call sites that import `reasonsFor` /
// `DEFAULT_REASON` / `labelForReason` do not all have to change, but the codes
// themselves now come from the registry, which is the only place they are
// declared and the only place a new surface can be added.
//
// See servedSurfaces.ts for why the split mattered: eighteen codes the UI
// could emit were missing from the API's allow-list, so a whole class of
// rejection was landing in Vera's 'other' bucket.

import {
  SERVED_TABLES,
  SURFACES,
  reasonsFor,
  defaultReasonFor,
  labelForReason,
  type ReasonChip,
} from './servedSurfaces'

export type { ReasonChip }
export { reasonsFor, labelForReason }

/** Reason chips keyed by source_table. Derived; do not edit here. */
export const REJECT_REASONS: Record<string, ReasonChip[]> = Object.fromEntries(
  SERVED_TABLES.map(t => [t, SURFACES[t].reasons]),
)

/** The code a bare "Skip" emits, so a -1 always carries something clusterable. */
export const DEFAULT_REASON: Record<string, string> = Object.fromEntries(
  SERVED_TABLES.map(t => [t, SURFACES[t].defaultReason]),
)

export { defaultReasonFor }
