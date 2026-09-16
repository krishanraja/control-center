// The five jobs of the OS, in priority order, as the UI names them. Mirrors
// JOBS in api/_mission.ts (the API owns the ids and the prompt wording; this
// file owns what a chip says). Source: Control Center Evolution tab of the
// Master Ikigai v4, 5 September 2026.

export type Job = 'fill_pilots' | 'keep_honest' | 'run_pilots' | 'feed_demand' | 'keep_edge'

export const JOB_OPTIONS: Array<{ value: Job; label: string }> = [
  { value: 'fill_pilots', label: 'Find pilot customers' },
  { value: 'keep_honest', label: 'Keep me honest' },
  { value: 'run_pilots', label: 'Run the pilots' },
  { value: 'feed_demand', label: 'Feed the demand engine' },
  { value: 'keep_edge', label: 'Keep the edge' },
]

const LABEL = new Map<string, string>(JOB_OPTIONS.map(o => [o.value, o.label]))

export function jobLabel(job: string | null | undefined): string {
  return (job && LABEL.get(job)) || ''
}

export function isJob(v: unknown): v is Job {
  return typeof v === 'string' && LABEL.has(v)
}
