/**
 * The Content calls Krish makes, as one client function each.
 *
 * Each one goes to the route that already does the job where one exists, and
 * says so. Every function resolves to a result rather than throwing, so a
 * surface can show the engine's own sentence when it refuses (the fact gate
 * and the publish checks both refuse with a plain reason and a 409).
 *
 *   pickForSeries   POST /api/content/pick (this repo). The engine's PATCH
 *                   cannot store lane_slot, which a pick needs.
 *   unpick          POST /api/content/pick, action 'restore' (the phone's Undo).
 *   approvePiece    PATCH /api/content-ideas {state: 'approved'} (engine). The
 *                   engine re-runs the fact gate and the publish checks and
 *                   stamps meta.production_approval on success.
 *   readFactCheck   GET  /api/content-ideas/:id/fact-check (engine): the gate
 *                   for the current words, and how many sentences a rerun
 *                   would check fresh. Free: no model is called.
 *   allowFactCheck  POST /api/content-ideas/:id/fact-check (engine) with
 *                   max_fresh_sentences, the cap the engine enforces before it
 *                   calls any model. This is the paid check.
 *   setHowSure      GET then PATCH /api/content-ideas {body} (engine). The
 *                   number lives in the body, where the engine's publish check
 *                   reads it (api/_publishChecks.ts, confidenceOf), and the fact
 *                   gate's hash leaves it out, so a passed check stays passed.
 *   replyOnBoard    POST /api/workbench {action: 'reply'} (engine), through
 *                   src/lib/workBoard.ts. Only his cookie can write a reply.
 *   schedulePiece   POST /api/content-ideas/:id/schedule (engine).
 */
import { requestJson } from './apiFetch'
import { recordDecision, recordReroute } from './editLedger'
import { withHowSure } from './contentModel'
import type { PickPrevious } from './contentPick'
import { sendReply } from './workBoard'

export type ActionResult<T = Record<string, unknown>> =
  | { ok: true; data: T }
  | { ok: false; status: number; reason: string | null; error: string }

type Json = Record<string, any>

function failed(status: number, body: Json | null, fallback: string): ActionResult<never> {
  const error = typeof body?.error === 'string' && body.error.trim() ? body.error.trim() : fallback
  return { ok: false, status, reason: typeof body?.reason === 'string' ? body.reason : null, error }
}

async function call<T extends Json>(path: string, init: Parameters<typeof requestJson>[1], fallback: string): Promise<ActionResult<T>> {
  try {
    const r = await requestJson<Json>(path, init)
    if (!r.ok || r.json?.ok === false) return failed(r.status, r.json, fallback)
    return { ok: true, data: (r.json ?? {}) as T }
  } catch (e) {
    return { ok: false, status: 0, reason: 'transport', error: (e as Error)?.message || fallback }
  }
}

// ── Pick for a series ──────────────────────────────────────────────────────

export interface PickOptions {
  /** The reason codes he chose (DECISION_REASONS.approved), if any. */
  reasons?: string[]
  /** The panel run the judges scored, so calibration can join on it. */
  panelRunId?: string | null
  dwellMs?: number | null
  /** Only when he chose a series other than the one the piece was routed to:
   *  the series it was routed to (null for none), so the change is recorded
   *  as the reroute it is. Picking the routed series passes nothing. */
  from?: string | null
}

/**
 * Pick a piece for a series: it goes to drafting with that series, the same
 * thing on the desk and the phone.
 *
 * The move is the product and the ledger is the record of it, so the ledger
 * rows (the decision, and a reroute when the series changed) are written only
 * once the move has succeeded, and never block it.
 */
export async function pickForSeries(ideaId: string, seriesSlug: string, opts: PickOptions = {}): Promise<ActionResult<{ previous: PickPrevious }>> {
  if (!seriesSlug) {
    return { ok: false, status: 400, reason: 'no_series', error: 'This piece has no series yet. Choose where it goes first.' }
  }
  const r = await call<{ previous: PickPrevious }>('/api/content/pick', {
    method: 'POST', body: { action: 'pick', id: ideaId, series: seriesSlug },
  }, 'The piece could not be picked.')
  if (r.ok === false) return r
  void recordDecision({
    ideaId, kind: 'approved', reasons: opts.reasons ?? [], panelRunId: opts.panelRunId ?? null, dwellMs: opts.dwellMs ?? null,
  })
  if (opts.from !== undefined && opts.from !== seriesSlug) {
    void recordReroute({ ideaId, from: opts.from, to: seriesSlug, reasons: opts.reasons ?? [], panelRunId: opts.panelRunId ?? null })
  }
  return { ok: true, data: { previous: r.data.previous } }
}

/** Undo a pick, while the piece still sits where the pick put it. */
export async function unpick(ideaId: string, seriesSlug: string, previous: PickPrevious): Promise<ActionResult> {
  return call('/api/content/pick', {
    method: 'POST', body: { action: 'restore', id: ideaId, series: seriesSlug, previous },
  }, 'The pick could not be undone.')
}

// ── Approve ────────────────────────────────────────────────────────────────

/** Approve a finished piece. The engine refuses with its own sentence when the
 *  fact gate or a publish check has not passed on these exact words. */
export async function approvePiece(ideaId: string, opts: { panelRunId?: string | null } = {}): Promise<ActionResult> {
  return call('/api/content-ideas', {
    method: 'PATCH',
    body: { id: ideaId, state: 'approved', ...(opts.panelRunId ? { panel_run_id: opts.panelRunId } : {}) },
  }, 'The piece could not be approved.')
}

// ── The paid fact check ────────────────────────────────────────────────────

export interface FactCheckRead {
  /** False when the engine answered without a gate at all, so the caller
   *  falls back to the stored result instead of reading a missing gate as a
   *  failed one. */
  known: boolean
  gate: { ok: boolean; reason: string | null }
  /** Whether every publish check passes on these words as well. */
  ready: boolean
  /** Sentences a rerun would check fresh, or null when the engine did not say. */
  freshSentences: number | null
  ranAt: string | null
}

/** The fact gate for the current words, and the size of a rerun. No model is
 *  called and nothing is spent. */
export async function readFactCheck(ideaId: string): Promise<ActionResult<FactCheckRead>> {
  const r = await call<Json>(`/api/content-ideas/${encodeURIComponent(ideaId)}/fact-check`, { method: 'GET' }, 'The fact check could not be read.')
  if (r.ok === false) return r
  const j = r.data
  const fresh = j?.next_run?.fresh_sentences
  return {
    ok: true,
    data: {
      known: Boolean(j?.gate && typeof j.gate === 'object'),
      gate: { ok: j?.gate?.ok === true, reason: typeof j?.gate?.reason === 'string' ? j.gate.reason : null },
      ready: j?.ready === true,
      freshSentences: Number.isInteger(fresh) ? fresh : null,
      ranAt: typeof j?.fact_check?.ran_at === 'string' ? j.fact_check.ran_at : null,
    },
  }
}

/**
 * Run the paid fact check he allowed. `maxFreshSentences` is the cap he agreed
 * to: the engine refuses before calling any model when the rerun would check
 * more than that (409, reason 'rerun_scope'). A run takes a minute or two.
 */
export async function allowFactCheck(ideaId: string, opts: { maxFreshSentences?: number } = {}): Promise<ActionResult<{ passed: boolean; blocking: number }>> {
  const body = opts.maxFreshSentences !== undefined ? { max_fresh_sentences: opts.maxFreshSentences } : {}
  const r = await call<Json>(`/api/content-ideas/${encodeURIComponent(ideaId)}/fact-check`, {
    method: 'POST', body, timeoutMs: 300_000,
  }, 'The fact check could not run.')
  if (r.ok === false) return r
  return { ok: true, data: { passed: r.data.passed === true, blocking: Number(r.data.blocking) || 0 } }
}

// ── How sure we are ────────────────────────────────────────────────────────

/**
 * Set "How sure we are" on a piece's prediction.
 *
 * Reads the current words from the engine rather than trusting a cached row,
 * so a draft the engine rewrote a minute ago is not overwritten with an older
 * copy. Refuses on an approved piece: any change to its words takes the
 * approval back (content-engine api/content-ideas.ts, production_approval).
 */
export async function setHowSure(ideaId: string, percent: number): Promise<ActionResult> {
  const read = await call<Json>(`/api/content-ideas?id=${encodeURIComponent(ideaId)}`, { method: 'GET' }, 'The piece could not be read.')
  if (read.ok === false) return read
  // The engine answers { ok, piece: { id, state, lane_slot, idea, thesis, body, updated_at } }.
  const piece = (read.data.piece ?? null) as Json | null
  if (!piece) {
    return { ok: false, status: 502, reason: 'no_piece', error: 'The engine did not return the piece, so nothing was changed.' }
  }
  if (piece.state === 'approved' || piece.state === 'published') {
    return { ok: false, status: 409, reason: 'already_approved', error: 'This piece is already approved. Changing its words would take the approval back.' }
  }
  const next = withHowSure(typeof piece.body === 'string' ? piece.body : '', percent)
  if (next.ok === false) return { ok: false, status: 400, reason: 'no_prediction', error: next.reason }
  return call('/api/content-ideas', { method: 'PATCH', body: { id: ideaId, body: next.body } }, 'How sure we are could not be saved.')
}

// ── The work board ─────────────────────────────────────────────────────────

/** Answer a work board item in his words, e.g. its own prompt ("Yes, lock
 *  this exact article for production"). */
export async function replyOnBoard(itemId: string, text: string): Promise<ActionResult> {
  try {
    const reply = await sendReply(itemId, text)
    return { ok: true, data: { reply } }
  } catch (e) {
    return { ok: false, status: 0, reason: null, error: (e as Error)?.message || 'The reply could not be sent.' }
  }
}

// ── Putting a piece out ────────────────────────────────────────────────────

/** Set the day an approved piece goes out, YYYY-MM-DD, or clear it. */
export async function schedulePiece(ideaId: string, date: string | null): Promise<ActionResult> {
  return call(`/api/content-ideas/${encodeURIComponent(ideaId)}/schedule`, { method: 'POST', body: { date } }, 'The day could not be set.')
}
