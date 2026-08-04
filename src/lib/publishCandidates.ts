import { supabase } from './supabase'

// The publish queue, read the way red mode needs it: one ready artifact at a
// time, strongest first. "Publish" is the one starter verb where the system
// already holds real inventory (content_ideas), and echoing the operator's
// vague words back on a low-capacity day hands him the hardest remaining
// decision, which thing specifically, at the worst possible moment.
//
// The readiness bar is deterministic, no LLM: approved beats review, a draft
// must exist, red quality never surfaces. A wrong-but-confident candidate
// costs trust on exactly the days trust matters most, so when nothing clears
// the bar the caller says so instead of guessing.

export interface PublishCandidate {
  id: string
  idea: string
  state: 'approved' | 'review'
  lane: string | null
  quality: 'green' | 'amber' | null
  /** External draft link only. In-app routes are useless from red mode: the
   *  gate owns the screen, so only a URL that opens outside it can be lived. */
  url: string | null
  dueAt: string | null
}

/** Display names for the brand lanes, kept local so the pilot layer does not
 *  pull the whole content engine into its bundle. Unknown lanes pass through. */
const LANE_LABELS: Record<string, string> = {
  signal_noise: 'Signal & Noise',
  mindmaker: 'Mindmaker',
  techonomic: 'Techonomic',
  builder_economy_ig: 'Builder Economy (IG)',
}

export function laneLabel(lane: string | null): string | null {
  if (!lane) return null
  return LANE_LABELS[lane] ?? lane
}

/** The text that becomes tomorrow's ONE when a candidate is accepted. Always
 *  contains a concrete verb, so it passes validateConcreteness by shape. */
export function candidateActionText(c: PublishCandidate): string {
  const lane = laneLabel(c.lane)
  const verb = c.state === 'review' ? 'Finish and publish' : 'Publish'
  const base = `${verb} "${c.idea}"`
  return lane ? `${base} to ${lane}` : base
}

interface CandidateRow {
  id: string
  idea: string
  state: string
  lane: string | null
  quality_score: 'green' | 'amber' | 'red' | null
  draft_link: string | null
  cadence_due_at: string | null
}

const stateRank = (s: string) => (s === 'approved' ? 0 : 1)
const qualityRank = (q: CandidateRow['quality_score']) =>
  q === 'green' ? 0 : q === 'amber' ? 1 : 2

/** Most-ready first: approved before review, green before amber before
 *  unscored, an openable draft before a body-only one, then most overdue by
 *  cadence with undated rows last. */
function byReadiness(a: PublishCandidate, b: PublishCandidate): number {
  if (stateRank(a.state) !== stateRank(b.state)) return stateRank(a.state) - stateRank(b.state)
  if (qualityRank(a.quality) !== qualityRank(b.quality)) return qualityRank(a.quality) - qualityRank(b.quality)
  const aUrl = a.url ? 0 : 1
  const bUrl = b.url ? 0 : 1
  if (aUrl !== bUrl) return aUrl - bUrl
  if (a.dueAt && b.dueAt) return a.dueAt.localeCompare(b.dueAt)
  if (a.dueAt) return -1
  if (b.dueAt) return 1
  return 0
}

/**
 * Fetch the ready-to-publish shortlist. Never throws: red mode must degrade to
 * the manual path on any failure, not dead-end behind a network error. An
 * empty result is meaningful (nothing clears the bar) and the caller should
 * say that honestly rather than silently falling through.
 */
export async function fetchPublishCandidates(limit = 5): Promise<PublishCandidate[]> {
  try {
    const { data, error } = await supabase
      .from('content_ideas')
      .select('id, idea, state, lane, quality_score, draft_link, cadence_due_at')
      .in('state', ['approved', 'review'])
      .or('body.not.is.null,draft_link.not.is.null')
      .order('cadence_due_at', { ascending: true, nullsFirst: false })
      .limit(60)
    if (error || !data) return []
    return (data as CandidateRow[])
      .filter(r => r.quality_score !== 'red' && r.idea && r.idea.trim())
      .map<PublishCandidate>(r => ({
        id: r.id,
        idea: r.idea.trim(),
        state: r.state === 'approved' ? 'approved' : 'review',
        lane: r.lane,
        quality: r.quality_score === 'red' ? null : r.quality_score,
        url: r.draft_link || null,
        dueAt: r.cadence_due_at,
      }))
      .sort(byReadiness)
      .slice(0, limit)
  } catch {
    return []
  }
}
