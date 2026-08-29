import type { ContentIdeaRow, ContentLane } from '../hooks/useRealtimeContentIdeas'

// ─── Content lanes (brand destinations) ───────────────────────────────────────
// The Content tab toggles across these commitments. Each carries a cadence
// (how often Krish has committed to publish) and a voice gear (krish-voice).
// Pillars remain the orthogonal *theme* layer.
//
// REFOCUS 2026-08-11. There is now ONE content venture, Publication, the
// content arm of the Mindmake advisory. Techonomic's investigative register
// ships as the Paid format and the Builder Economy thesis ships as Built.
// MYMU is no longer a content brand at all: "Make Your Mind Up" is the lead
// magnet and URL into the CTRL app. Signal & Noise is a distribution channel.
// Every retired value still reads as Publication via normalizeLane, so
// nothing disappears from the board.

export interface LaneDef {
  slug: ContentLane
  label: string
  short: string
  /** Tailwind text colour for the lane accent. */
  accent: string
  /** Tailwind bg for the active chip. */
  activeBg: string
  cadenceLabel: string
  /** Target publishes per week — drives the on-pace math. */
  targetPerWeek: number
  /** krish-voice gear + posture hint shown in the lane header. */
  voice: string
}

// The board's top-level toggle is now the VENTURE picker: "what am I working
// on", chosen before any work happens (Krish 2026-08-06). It used to be a lane,
// which fused this with "where does it go" and put Instagram (a channel) in the
// same list as two ventures.
export const LANES: LaneDef[] = [
  {
    slug: 'publication',
    label: 'Publication',
    short: 'Live',
    accent: 'text-violet-300',
    activeBg: 'bg-violet-500/20 border-violet-400/50 text-violet-100',
    cadenceLabel: '1.5 / week',
    targetPerWeek: 1.5,
    voice: 'Paid (Gear A) and Built (Gear B)',
  },
]

export const LANE_BY_SLUG: Record<ContentLane, LaneDef> = Object.fromEntries(
  LANES.map(l => [l.slug, l]),
) as Record<ContentLane, LaneDef>

/**
 * Stored lane value -> the lane it displays under. Legacy values map instead of
 * throwing, so a historical row always keeps a home on the board. Anything
 * unrecognised returns null so callers can treat it as unlaned rather than
 * crash. Every content venture the OS has ever had now folds into Mindmake
 * Live, which is the only one left.
 */
const LEGACY_LANE_ALIAS: Record<string, ContentLane> = {
  techonomic: 'publication',
  makeyourmindup: 'publication',
  mymu: 'publication',
  mindmake: 'publication',
  // Instagram was a channel wearing a venture's clothes.
  builder_economy_ig: 'publication',
  // Retired 2026-08-11. Builder Economy is gone entirely; Signal & Noise is a
  // distribution channel now, so a row commissioned "for" it is a Live piece.
  builder_economy: 'publication',
  signal_noise: 'publication',
}

export function normalizeLane(lane?: string | null): ContentLane | null {
  if (!lane) return null
  if (lane in LANE_BY_SLUG) return lane as ContentLane
  return LEGACY_LANE_ALIAS[lane] ?? null
}

export type CadenceStatus = 'on_pace' | 'due_soon' | 'overdue' | 'no_data'

export interface LaneCadence {
  lane: ContentLane
  lastPublishedAt: Date | null
  nextDueAt: Date | null
  status: CadenceStatus
  daysSinceLast: number | null
  daysUntilDue: number | null
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Compute a lane's cadence status client-side from its published ideas, so the
 * CadenceBar is live before the nightly recompute job exists. Interval is derived
 * from the lane's target-per-week. "due_soon" fires inside the last ~25% of the
 * interval; "overdue" once the next-due date has passed.
 */
export function computeLaneCadence(lane: ContentLane, ideas: ContentIdeaRow[], now: number): LaneCadence {
  const def = LANE_BY_SLUG[lane]
  const intervalDays = def && def.targetPerWeek > 0 ? 7 / def.targetPerWeek : 14
  const published = ideas
    .filter(i => normalizeLane(i.lane) === lane && i.state === 'published' && i.published_at)
    .map(i => new Date(i.published_at as string).getTime())
    .filter(t => Number.isFinite(t))
  if (published.length === 0) {
    return { lane, lastPublishedAt: null, nextDueAt: null, status: 'no_data', daysSinceLast: null, daysUntilDue: null }
  }
  const last = Math.max(...published)
  const nextDue = last + intervalDays * DAY_MS
  const daysSinceLast = Math.floor((now - last) / DAY_MS)
  const daysUntilDue = Math.ceil((nextDue - now) / DAY_MS)
  let status: CadenceStatus = 'on_pace'
  if (now >= nextDue) status = 'overdue'
  else if (nextDue - now <= intervalDays * DAY_MS * 0.25) status = 'due_soon'
  return {
    lane,
    lastPublishedAt: new Date(last),
    nextDueAt: new Date(nextDue),
    status,
    daysSinceLast,
    daysUntilDue,
  }
}

export const STATUS_DOT: Record<CadenceStatus, string> = {
  on_pace: 'bg-emerald-400',
  due_soon: 'bg-amber-400',
  overdue: 'bg-rose-400',
  no_data: 'bg-white/25',
}
