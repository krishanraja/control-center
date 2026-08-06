// Thin fetch wrappers for the three learning endpoints, shared by every swipe
// deck. Each resolves to an `ok` boolean (never throws) so the optimistic deck
// can restore a card on failure. All three write a feedback_queue vote that
// feeds Vera's correction loop — see api/triage/{promote,reject}.ts + api/feedback.ts.

async function postOk(url: string, body: unknown): Promise<boolean> {
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!r.ok) return false
    const json = await r.json().catch(() => ({}))
    return json?.ok !== false
  } catch {
    return false
  }
}

/** Advance a triage item to its kept state + write vote +1 (Vera positive signal). */
export function triagePromote(source_table: string, source_id: string, agent?: string | null) {
  return postOk('/api/triage/promote', { source_table, source_id, agent: agent || null })
}

/** Move a triage item to its terminal state + write vote −1 with a reason code. */
export function triageReject(
  source_table: string,
  source_id: string,
  agent?: string | null,
  reason_code?: string,
  reason_text?: string | null,
) {
  return postOk('/api/triage/reject', {
    source_table, source_id, agent: agent || null,
    reason_code: reason_code || null, reason_text: reason_text || null,
  })
}

/** Raw ±1 feedback (used where there is no promote/reject endpoint, e.g. contacts).
 *  A −1 on contacts also flips triage_status → 'skipped' server-side. */
export function feedbackVote(
  source_table: string,
  source_id: string,
  vote: 1 | -1,
  agent_id?: string | null,
  reason_code?: string,
  reason_text?: string | null,
  meta?: Record<string, unknown> | null,
) {
  return postOk('/api/feedback', {
    source_table, source_id, vote,
    agent_id: agent_id || null, reason_code: reason_code || null,
    reason_text: reason_text || null, meta: meta || null,
  })
}
