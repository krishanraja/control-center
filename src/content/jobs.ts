// The jobs a goal, a pick or a move can serve, as the UI names them. Mirrors
// JOBS in api/_mission.ts (the API owns the ids and the prompt wording; this
// file owns what a chip says). The first five are the five jobs of the OS,
// Mindmake's, from the Control Center Evolution tab of the Master Ikigai v4,
// 5 September 2026. The sixth is Full Time's alone.
//
// Ruling (Krish, 2026-10-06): Full Time's pilot listeners and Mindmake's pilot
// customers "are TOTALLY unrelated and cannot be confused with one another".
// So the two never share a job, and each chip says which is which in full.

export type Job = 'fill_pilots' | 'keep_honest' | 'run_pilots' | 'feed_demand' | 'keep_edge' | 'fill_listeners'

export const JOB_OPTIONS: Array<{ value: Job; label: string }> = [
  { value: 'fill_pilots', label: 'Find pilot customers' },
  { value: 'keep_honest', label: 'Keep me honest' },
  { value: 'run_pilots', label: 'Run the pilots' },
  { value: 'feed_demand', label: 'Feed the demand engine' },
  { value: 'keep_edge', label: 'Keep the edge' },
  { value: 'fill_listeners', label: 'Find Full Time pilot listeners' },
]

const LABEL = new Map<string, string>(JOB_OPTIONS.map(o => [o.value, o.label]))

export function jobLabel(job: string | null | undefined): string {
  return (job && LABEL.get(job)) || ''
}

export function isJob(v: unknown): v is Job {
  return typeof v === 'string' && LABEL.has(v)
}
