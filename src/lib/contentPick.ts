/**
 * Picking a piece for a series, as a plan over one row.
 *
 * "Write this" used to mean two things. On the desk it recorded a ledger row
 * and moved nothing (DecideCard); on the phone it moved the piece to drafting
 * and left its series alone (MobileDecisionDeck through useContentTriage). A
 * pick is now one act everywhere: the piece goes to drafting with the series
 * stored in lane_slot, and it is protected from the Monday clear-out because
 * Krish chose it.
 *
 * The engine's PATCH /api/content-ideas cannot do this: it accepts state but
 * not lane_slot (content-engine apps/control-plane/api/content-ideas.ts, the
 * PATCH branch). So api/content/pick.ts writes it here, and this file decides
 * what it may write. No imports, so the serverless route can load it under
 * Node ESM as well as the app and the tests.
 */

/** States a piece can be picked from: nothing past writing. */
export const PICKABLE_STATES: readonly string[] = Object.freeze(['seeded', 'researching', 'drafting'])

export interface PickRow {
  id: string
  state: string
  lane_slot: string | null
  buried_at: string | null
  protected_at: string | null
  updated_at: string
}

/** What the row held before a pick, so an undo can put it back exactly. */
export interface PickPrevious {
  state: string
  lane_slot: string | null
  protected_at: string | null
}

export type PickPlan =
  | { ok: true; update: { state: string; lane_slot: string | null; protected_at: string | null }; previous: PickPrevious }
  | { ok: false; status: number; reason: string; error: string }

const refuse = (status: number, reason: string, error: string): PickPlan => ({ ok: false, status, reason, error })

/**
 * The write a pick makes, or why it cannot.
 *
 * `seriesIsLive` is the caller's reading of venture_formats for the slug (a
 * subchannel that is active), so this never holds its own copy of the list.
 */
export function planPick(row: PickRow | null, series: string, seriesIsLive: boolean, nowIso: string): PickPlan {
  if (!row) return refuse(404, 'not_found', 'That piece no longer exists.')
  if (!series || !seriesIsLive) return refuse(400, 'series_not_live', 'That is not one of the series that publishes, so the piece was not moved.')
  if (row.buried_at) return refuse(409, 'set_aside', 'This piece was set aside. Bring it back before picking it.')
  if (!PICKABLE_STATES.includes(row.state)) {
    return refuse(409, 'past_writing', 'This piece is already past writing, so there is nothing to pick.')
  }
  return {
    ok: true,
    update: { state: 'drafting', lane_slot: series, protected_at: row.protected_at ?? nowIso },
    previous: { state: row.state, lane_slot: row.lane_slot, protected_at: row.protected_at },
  }
}

/**
 * The write that undoes a pick, or why it cannot.
 *
 * Only a piece still sitting where the pick put it goes back. Once the engine
 * has started drafting it or anyone has moved it on, an undo would throw that
 * away, so it refuses instead.
 */
export function planRestore(row: PickRow | null, pickedSeries: string, previous: PickPrevious | null): PickPlan {
  if (!row) return refuse(404, 'not_found', 'That piece no longer exists.')
  if (!previous || !PICKABLE_STATES.includes(previous.state)) {
    return refuse(400, 'nothing_to_restore', 'There is no earlier state to put back.')
  }
  if (row.state !== 'drafting' || row.lane_slot !== pickedSeries) {
    return refuse(409, 'moved_on', 'This piece has moved on since it was picked, so it was left as it is.')
  }
  return {
    ok: true,
    update: { state: previous.state, lane_slot: previous.lane_slot, protected_at: previous.protected_at },
    previous: { state: row.state, lane_slot: row.lane_slot, protected_at: row.protected_at },
  }
}
