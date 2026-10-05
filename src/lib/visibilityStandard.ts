/**
 * What the Visibility surface is allowed to show, computed in one place.
 *
 * Reading rule, and it is the whole point: a row is an OPPORTUNITY only when
 * Nova's standard has judged it `take` or `stretch` under the current version.
 * Everything else is either a refusal (shown, with its reason) or not yet
 * judged (shown as a count, never as an opportunity).
 *
 * The database holds the same gate in `visibility_recommendable`, because every
 * reader goes through a view and no reader remembers a rule. This module is the
 * client half, for the surfaces that already hold the whole polled set.
 */

import type { VisibilityTargetRow } from '../hooks/useVisibilityTargets'
import { axesOf, verdictOf, VISIBILITY_STANDARD_VERSION } from './visibilityScale'

/** At most this many stretch rows ever surface. Mirrors VISIBILITY_FLOORS
 *  .stretchCap in api/_visibilityScore.ts, and the guard asserts the two agree.
 *  A stretch lane that grows is the long tail coming back under a new name. */
export const STRETCH_CAP = 2

/** Live statuses. A row Krish has already applied to is not an opportunity to
 *  surface again, and a buried one was buried on purpose. */
function isOpen(t: VisibilityTargetRow): boolean {
  return (t.status === 'sourced' || t.status === 'queued') && !t.buried_at
}

/** A date in the past makes a row dead whatever the standard said about it. The
 *  Tuesday refresh drops these, and this is the belt to its braces: between two
 *  cron ticks a stage can pass its own date while sitting at the top of the
 *  board. */
function dateIsLive(t: VisibilityTargetRow, now = Date.now()): boolean {
  for (const iso of [t.event_start_at, t.deadline_at]) {
    if (!iso) continue
    const ts = Date.parse(iso)
    if (Number.isNaN(ts)) continue
    if (ts < now) return false
  }
  return true
}

export interface StandardView {
  /** Clears all three floors. Ordered best first. */
  take: VisibilityTargetRow[]
  /** The right room and the right angle on a platform that is merely small.
   *  Marked, capped, and never the hero. */
  stretch: VisibilityTargetRow[]
  /** Refused, each with a reason the surface prints. */
  refused: VisibilityTargetRow[]
  /** Looked at, and the material did not support a judgement. */
  unjudged: VisibilityTargetRow[]
  /** Open rows the standard has not reached yet. A queue length, not a verdict. */
  awaiting: VisibilityTargetRow[]
  /** True when the standard has judged nothing at all. The surface says so in
   *  different words from "judged everything and nothing cleared the bar",
   *  because those are different facts and one of them is a gap in the system. */
  neverRun: boolean
}

/** Best first: the conjunction, then the nearer deadline as the tie-break. */
function byStrength(a: VisibilityTargetRow, b: VisibilityTargetRow): number {
  const sa = axesOf(a).overall ?? -1
  const sb = axesOf(b).overall ?? -1
  if (sb !== sa) return sb - sa
  const da = a.deadline_at ? Date.parse(a.deadline_at) : Infinity
  const db = b.deadline_at ? Date.parse(b.deadline_at) : Infinity
  return da - db
}

export function applyStandard(targets: VisibilityTargetRow[], now = Date.now()): StandardView {
  const take: VisibilityTargetRow[] = []
  const stretch: VisibilityTargetRow[] = []
  const refused: VisibilityTargetRow[] = []
  const unjudged: VisibilityTargetRow[] = []
  const awaiting: VisibilityTargetRow[] = []
  let judgedAny = false

  for (const t of targets) {
    const verdict = verdictOf(t)
    if (verdict) judgedAny = true

    // A refusal is worth showing whatever the row's status is: it is the record
    // of what the standard turned down, and burying it would rebuild the silent
    // drop this whole change exists to remove.
    if (verdict === 'rejected') { if (!t.buried_at) refused.push(t); continue }

    if (!isOpen(t)) continue
    if (verdict === 'unjudged') { unjudged.push(t); continue }
    if (!verdict) { awaiting.push(t); continue }
    if (!dateIsLive(t, now)) continue

    if (verdict === 'take') take.push(t)
    else if (verdict === 'stretch') stretch.push(t)
  }

  take.sort(byStrength)
  stretch.sort(byStrength)
  refused.sort((a, b) => Date.parse(b.scored_at || b.updated_at) - Date.parse(a.scored_at || a.updated_at))

  return {
    take,
    stretch: stretch.slice(0, STRETCH_CAP),
    refused,
    unjudged,
    awaiting,
    neverRun: !judgedAny,
  }
}

/** The kind, in the words a reader uses. The raw `type` values are schema. */
export const KIND_LABEL: Record<string, string> = {
  cfp: 'Call for papers',
  conference: 'Conference',
  podcast: 'Podcast',
  newsletter: 'Newsletter',
  guest_appearance: 'Guest appearance',
  press_relationship: 'Press',
  speaking: 'Speaking',
  other: 'Opportunity',
}

export function kindLabel(type: string | null | undefined): string {
  return (type && KIND_LABEL[type]) || 'Opportunity'
}

/** Which of the two channels the appearance would feed, in title case. Long-form
 *  is the asset and an appearance is distribution for it, so a stage that feeds
 *  neither is a mark against it rather than a neutral fact. */
export function channelLabel(v: string | null | undefined): string | null {
  if (v === 'the money of ai') return 'The Money of AI'
  if (v === 'built with ai') return 'Built with AI'
  return null
}

export { VISIBILITY_STANDARD_VERSION }
