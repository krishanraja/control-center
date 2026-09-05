// The North Star. Every reasoning path reads this first (api/_goals.ts
// prepends it to the canon block), and every agent-facing surface that names
// the mission derives it from here rather than restating it.
//
// Source: Krish's Master Ikigai v4, locked 5 September 2026, and the Control
// Center Evolution tab of the same workbook. Reconciled against the repo in
// docs/DECISIONS/016-ikigai-v4-one-swing.md and docs/plans/one-swing/.
//
// Pure module on purpose: no supabase import, so scripts and guards can load
// it without secrets. The OS rung of the goal ladder carries the same line as
// data (goal:os:mission) so the ladder and the prompt cannot disagree.

export const MISSION =
  'Build the company that gives leaders their edge back before what is coming takes it, and sell it at scale with my name on it.'

export const PURPOSE =
  'I see what is coming before it is obvious and make it legible to people while it still counts.'

/** The face: the one person the mission is pictured on. */
export const FACE =
  'A senior leader who will not admit to anyone that they are not ready for what is happening. Concretely: leaders of PE and VC backed media, adtech and data businesses Krish already knows.'

/** The door: the only thing being sold this quarter. */
export const DOOR =
  'A confidential room: a three week private diagnostic, fixed fee, that tells the leader where they stand, what is coming for their business, and what to do first. Sold to people he already knows. Never cold.'

export type Job = 'fill_room' | 'keep_honest' | 'run_room' | 'feed_demand' | 'keep_edge'

export interface JobDef {
  id: Job
  /** Priority order from the Control Center Evolution tab. */
  n: 1 | 2 | 3 | 4 | 5
  label: string
  /** What the OS does under this job, one line. */
  does: string
  /** Which evolution gate opens it. */
  gate: 'now' | 'g2' | 'g3'
}

export const JOBS: JobDef[] = [
  { id: 'fill_room', n: 1, label: 'Fill the room', gate: 'now',
    does: 'Keep the list of 25 (then 100) named leaders who fit the face. Draft warm approaches in his voice from live signals. Queue them. Never send.' },
  { id: 'keep_honest', n: 2, label: 'Keep him honest', gate: 'now',
    does: 'Track sent, calls, paid, published and hours building unasked. Monday scorecard, Friday variance note. Rule 6 tripwire when unasked build hours exceed zero.' },
  { id: 'run_room', n: 3, label: 'Run the room', gate: 'g2',
    does: 'Prepare the dossier before the room and draft the edge file after. Opens when the first room is booked.' },
  { id: 'feed_demand', n: 4, label: 'Feed the demand engine', gate: 'now',
    does: 'Turn every room, keynote and podcast into one published piece a week aimed at the face, with sources.' },
  { id: 'keep_edge', n: 5, label: 'Keep the edge', gate: 'g3',
    does: 'Run CTRL for paying leaders. Opens when two leaders ask to keep it after the room.' },
]

const JOB_IDS = new Set<string>(JOBS.map(j => j.id))

export function isJob(v: unknown): v is Job {
  return typeof v === 'string' && JOB_IDS.has(v)
}

export function jobLabel(id: Job | string | null | undefined): string {
  const j = JOBS.find(x => x.id === id)
  return j ? j.label : ''
}

/** The rules from the Master tab that the engine holds above memory and workflows. */
export const STANDARDS = [
  'North Star: the mission line above. Any task that cannot name which of the five jobs it serves is refused.',
  'Cited or silent: no number, name or claim ships without a source.',
  'Approval walls: drafts never send. Krish or the partner sends. No outbound tool has send authority.',
  'Public by default: every build is shown or announced the week it exists.',
  'One swing: every item on the calendar traces to a job above.',
] as const

/** The NORTH STAR block. Terse: it rides on every reasoning call. */
export function missionBlock(): string {
  return [
    'NORTH STAR (read this first):',
    `Mission: ${MISSION}`,
    `Purpose: ${PURPOSE}`,
    `The face: ${FACE}`,
    `The door: ${DOOR}`,
    'The five jobs of the OS, in priority order:',
    ...JOBS.map(j => `${j.n}. ${j.label}${j.gate === 'now' ? '' : ' (gated, not yet open)'}: ${j.does}`),
    'Standards: ' + STANDARDS.join(' '),
  ].join('\n')
}

/** The face and the door alone, for drafts and pieces that write to one person. */
export function faceBlock(): string {
  return [
    `WHO THIS IS FOR: ${FACE}`,
    `WHAT IS ON OFFER: ${DOOR}`,
    'Write for that person. Name what is coming for their business, not for the industry in general. Cite a source for every claim about the world; a claim without a source is cut.',
  ].join('\n')
}
