// What Krish can press for hunter in Control Center, checked before it is
// queued. Hunter applies it (hunter/src/hunter/actions.py), writing column A
// as exactly the words he would have typed there, so the reasons below must
// match hunter/src/hunter/verdicts.py TASTE_CODES word for word.

export const DECLINE_REASONS = [
  'domain expertise', 'function wrong', 'business uninteresting', 'seniority below',
  'seniority above', 'requirements mismatch', 'geo or language', 'comp below bar',
  'stage wrong', 'too much travel',
] as const

export const OUTCOMES = ['interview', 'offer', 'rejected', 'withdrew'] as const
export const OUTCOME_LABEL: Record<(typeof OUTCOMES)[number], string> = {
  interview: 'Interview', offer: 'Offer', rejected: 'They said no', withdrew: 'I withdrew',
}

export type HunterAction =
  | { kind: 'verdict'; job_id: string; payload: { verdict: 'yes' | 'applied' } | { verdict: 'declined'; reason: string } }
  | { kind: 'prepare'; job_id: string; payload: Record<string, never> }
  | { kind: 'outcome'; job_id: string; payload: { outcome: (typeof OUTCOMES)[number] } }

export function checkAction(body: unknown): { action: HunterAction } | { error: string } {
  const b = (body || {}) as Record<string, unknown>
  const jobId = typeof b.job_id === 'string' ? b.job_id.trim() : ''
  if (!jobId || jobId.length > 300) return { error: 'job_id is required' }
  const p = (b.payload || {}) as Record<string, unknown>
  if (b.kind === 'verdict') {
    if (p.verdict === 'yes' || p.verdict === 'applied') {
      return { action: { kind: 'verdict', job_id: jobId, payload: { verdict: p.verdict } } }
    }
    if (p.verdict === 'declined') {
      const reason = String(p.reason || '')
      if (!(DECLINE_REASONS as readonly string[]).includes(reason)) return { error: 'a decline needs one of the reasons' }
      return { action: { kind: 'verdict', job_id: jobId, payload: { verdict: 'declined', reason } } }
    }
    return { error: 'verdict must be yes, applied or declined' }
  }
  if (b.kind === 'prepare') return { action: { kind: 'prepare', job_id: jobId, payload: {} } }
  if (b.kind === 'outcome') {
    const o = String(p.outcome || '')
    if (!(OUTCOMES as readonly string[]).includes(o)) return { error: 'unknown outcome' }
    return { action: { kind: 'outcome', job_id: jobId, payload: { outcome: o as (typeof OUTCOMES)[number] } } }
  }
  return { error: 'kind must be verdict, prepare or outcome' }
}
