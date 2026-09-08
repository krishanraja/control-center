import { getZone } from './civilDate'
import { requestJson, requestOk } from './apiFetch'

// The goal gate runs a model pass on every create, so a create is allowed
// more time than a plain save before it is called hung.
const GATE_TIMEOUT_MS = 25_000

// The ONE wire path for goal writes (guarded by scripts/check-goal-ladder.mts).
//
// The original invariant was "exactly one component may create a goal". That
// held until the Focus Ritual's weekly step also needed to create weekly goals,
// at which point a per-component rule would have forced either a second wire
// path or a fake shared component. One module is the stronger version of the
// same invariant: every surface that writes a goal goes through here, so the
// id scheme, the gate contract, and the mutation shapes cannot fork.

export type GoalHorizon = 'os' | 'weekly'

export interface GateVerdictWire {
  verdict: 'pass' | 'revise' | 'wrong_tier'
  issues: Array<{ dimension: string; problem: string; fix: string }>
  suggested_rewrite: string | null
  suggested_tier: GoalHorizon | null
  reasoning: string
  model_used: boolean
}

export type CreateGoalResult =
  | { ok: true }
  | { ok: false; gate: GateVerdictWire }

export function goalSlug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)
}

/**
 * Create a goal at a rung. Resolves `{ok:false, gate}` when the goal gate held
 * it (HTTP 422) so the caller can keep its form open with the verdict attached;
 * throws on any other failure.
 */
export async function createGoal(input: {
  title: string
  horizon: GoalHorizon
  parentId?: string | null
  venture?: string | null
  /** Which of the five jobs of the OS this serves (src/content/jobs.ts). */
  job?: string | null
  override?: boolean
}): Promise<CreateGoalResult> {
  const title = input.title.trim()
  const r = await requestJson<{ ok?: boolean; error?: string; gate?: GateVerdictWire }>('/api/objectives', {
    method: 'POST',
    timeoutMs: GATE_TIMEOUT_MS,
    body: {
      id: `${input.horizon}:${goalSlug(title)}`,
      title,
      horizon: input.horizon,
      parent_id: input.parentId || null,
      venture: input.venture || null,
      job: input.job || null,
      status: 'active',
      override: input.override === true,
      // The week an objective belongs to is the device's Monday, so the zone
      // rides along the way every day-scoped pilot call sends it.
      tz: getZone(),
    },
  })
  const j = r.json
  if (r.status === 422 && j?.error === 'goal_gate' && j.gate) {
    return { ok: false, gate: j.gate }
  }
  if (!r.ok || !j || j.ok === false) throw new Error(j?.error || `The server could not save that (${r.status}).`)
  return { ok: true }
}

/**
 * Mutate a goal (or, historically, a config field) via PATCH /api/goals.
 * Horizon-agnostic: keys off goalId.
 */
export async function patchGoal(body: Record<string, unknown>): Promise<void> {
  await requestOk('/api/goals', { method: 'PATCH', body: { ...body, tz: getZone() }, timeoutMs: 12_000 })
}

/** Accept a Marcus-proposed goal (status proposed → active). */
export async function acceptProposed(id: string): Promise<void> {
  await requestOk(`/api/objectives/${encodeURIComponent(id)}/nominate-accept`, { method: 'POST', timeoutMs: 12_000 })
}

/** Reject a Marcus-proposed goal, with the reason that teaches the nominator. */
export async function rejectProposed(id: string, reason?: string): Promise<void> {
  await requestOk(`/api/objectives/${encodeURIComponent(id)}/nominate-reject`, {
    method: 'POST',
    body: { reason_text: reason || null },
    timeoutMs: 12_000,
  })
}
