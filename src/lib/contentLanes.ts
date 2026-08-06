import type { ContentIdeaRow, ContentLane } from '../hooks/useRealtimeContentIdeas'

// ─── Content lanes (brand destinations) ───────────────────────────────────────
// The Content tab toggles across these commitments. Each carries a cadence
// (how often Krish has committed to publish) and a voice gear (krish-voice).
// Pillars remain the orthogonal *theme* layer.
//
// Techonomic was retired as a brand on 2026-08-06 and folded into Mindmaker
// LIVE: fewer brands, and the investigative register belongs where the offer
// lives. It is not a lane any more. Rows that still carry the old value (or the
// 'mindmaker_live' value they were re-laned to) read as Mindmaker via
// normalizeLane, so nothing disappears from the board.

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

export const LANES: LaneDef[] = [
  {
    slug: 'signal_noise',
    label: 'Signal & Noise',
    short: 'S&N',
    accent: 'text-sky-300',
    activeBg: 'bg-sky-500/20 border-sky-400/50 text-sky-100',
    cadenceLabel: '1 every ~2 weeks',
    targetPerWeek: 0.5,
    voice: 'Gear A · open-web monetization in media/adtech/martech',
  },
  {
    slug: 'mindmaker',
    label: 'Mindmaker',
    short: 'MM',
    accent: 'text-violet-300',
    activeBg: 'bg-violet-500/20 border-violet-400/50 text-violet-100',
    cadenceLabel: '2 / week',
    targetPerWeek: 2,
    voice: 'Gear A roundup + Gear B field-learning',
  },
  {
    slug: 'builder_economy_ig',
    label: 'Builder Economy',
    short: 'BE · IG',
    accent: 'text-emerald-300',
    activeBg: 'bg-emerald-500/20 border-emerald-400/50 text-emerald-100',
    cadenceLabel: 'daily',
    targetPerWeek: 7,
    voice: 'Gear B · upbeat, what people built with AI',
  },
]

export const LANE_BY_SLUG: Record<ContentLane, LaneDef> = Object.fromEntries(
  LANES.map(l => [l.slug, l]),
) as Record<ContentLane, LaneDef>

/**
 * Stored lane value -> the lane it displays under. Legacy values map instead of
 * throwing: 'techonomic' is the retired brand and 'mindmaker_live' is where its
 * rows were re-laned, and both belong to Mindmaker now. Anything unrecognised
 * returns null so callers can treat it as unlaned rather than crash.
 */
const LEGACY_LANE_ALIAS: Record<string, ContentLane> = {
  techonomic: 'mindmaker',
  mindmaker_live: 'mindmaker',
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
