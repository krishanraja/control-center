/**
 * Growth tab: shared types, labels and small pure helpers.
 *
 * The tab reads five tables in the OS database (growth_touchpoints,
 * growth_creative_queue, growth_council_reviews, growth_geo_probes,
 * growth_social_accounts). Every label map here is keyed off the exact values
 * the CHECK constraints allow, so the UI can never offer a value the database
 * will reject.
 */

export type ProductSlug = 'ctrl' | 'circle' | 'pulse' | 'full-time' | 'mindmake'
export type Channel =
  | 'seo' | 'geo' | 'social_organic' | 'social_paid' | 'substack'
  | 'partner' | 'community' | 'product' | 'podcast' | 'maven'
export type Coverage = 'unaddressed' | 'in_progress' | 'covered' | 'retired'
export type Stage = 'brief' | 'script' | 'producing' | 'produced' | 'posted' | 'dropped'
export type Engine = 'chatgpt' | 'perplexity' | 'claude' | 'google_aio' | 'grok'

export interface TouchpointRow {
  id: string
  product_slug: ProductSlug
  icp_trigger: string
  channel: Channel
  watering_hole: string | null
  cost_efficiency_score: number | null
  coverage_status: Coverage
  owner_agent: string | null
  rationale: string | null
  evidence: Record<string, unknown> | null
  assumption_flag: string | null
  created_at: string
  updated_at: string
}

export interface CreativeCardRow {
  id: string
  product_slug: ProductSlug
  touchpoint_id: string | null
  title: string
  stage: Stage
  brief: string | null
  script: string | null
  shot_notes: string | null
  magic_sentence: string | null
  target_account: string | null
  asset_url: string | null
  posted_url: string | null
  batch_week: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface CouncilReviewRow {
  id: string
  week_start: string
  product_slug: ProductSlug
  findings: unknown
  kill_list: unknown
  double_down: unknown
  krish_decision: string | null
  decided_at: string | null
  created_at: string
}

export interface GeoProbeRow {
  id: string
  product_slug: ProductSlug
  question: string
  engine: Engine
  answer_snapshot: string | null
  we_cited: boolean
  competitors_cited: unknown
  touchpoint_id: string | null
  run_at: string
}

export interface SocialAccountRow {
  id: string
  product_slug: ProductSlug
  platform: string
  handle: string | null
  profile_url: string | null
  status: 'planned' | 'live' | 'retired'
  notes: string | null
}

export const PRODUCTS: ProductSlug[] = ['ctrl', 'circle', 'pulse', 'full-time', 'mindmake']

export const PRODUCT_LABEL: Record<ProductSlug, string> = {
  ctrl: 'mm-ctrl',
  circle: 'Fractionl Circle',
  pulse: 'Fractionl Pulse',
  'full-time': 'Full Time',
  mindmake: 'Mindmake',
}

// Hue family matches the Subscriptions tab so one product wears one colour
// across the OS. Literal class strings so the Tailwind scanner sees them.
export const PRODUCT_TONE: Record<ProductSlug, string> = {
  ctrl: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
  circle: 'text-violet-300 bg-violet-500/10 border-violet-500/20',
  pulse: 'text-sky-300 bg-sky-500/10 border-sky-500/20',
  'full-time': 'text-orange-300 bg-orange-500/10 border-orange-500/20',
  mindmake: 'text-amber-300 bg-amber-500/10 border-amber-500/20',
}

export const CHANNELS: Channel[] = [
  'seo', 'geo', 'social_organic', 'social_paid', 'substack',
  'partner', 'community', 'product', 'podcast', 'maven',
]

export const CHANNEL_LABEL: Record<Channel, string> = {
  seo: 'SEO',
  geo: 'GEO',
  social_organic: 'Social organic',
  social_paid: 'Social paid',
  substack: 'Substack',
  partner: 'Partner',
  community: 'Community',
  product: 'Product',
  podcast: 'Podcast',
  maven: 'Maven',
}

export const COVERAGES: Coverage[] = ['unaddressed', 'in_progress', 'covered', 'retired']

export const COVERAGE_LABEL: Record<Coverage, string> = {
  unaddressed: 'Unaddressed',
  in_progress: 'In progress',
  covered: 'Covered',
  retired: 'Retired',
}

export const COVERAGE_TONE: Record<Coverage, string> = {
  unaddressed: 'text-white/55 border-white/12',
  in_progress: 'text-sky-300 border-sky-500/30',
  covered: 'text-emerald-300 border-emerald-500/30',
  retired: 'text-white/30 border-white/[0.08]',
}

/** Board columns, in the order the work actually moves. `dropped` is not a column. */
export const BOARD_STAGES: Stage[] = ['brief', 'script', 'producing', 'produced', 'posted']

export const STAGE_LABEL: Record<Stage, string> = {
  brief: 'Brief',
  script: 'Script',
  producing: 'Producing',
  produced: 'Produced',
  posted: 'Posted',
  dropped: 'Dropped',
}

export const ENGINE_LABEL: Record<Engine, string> = {
  chatgpt: 'ChatGPT',
  perplexity: 'Perplexity',
  claude: 'Claude',
  google_aio: 'Google AIO',
  grok: 'Grok',
}

/** The agreed weekly creative batch: never fewer than 3, never more than 5. */
export const BATCH_MIN = 3
export const BATCH_MAX = 5

/** ISO date (yyyy-mm-dd) of the Monday that owns a given day. */
export function mondayOf(d: Date): string {
  const day = d.getDay()
  const back = day === 0 ? 6 : day - 1
  const m = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() - back))
  return m.toISOString().slice(0, 10)
}

/** "Mon 4 Aug" from an ISO date, for the batch header. */
export function shortDate(iso?: string | null): string {
  if (!iso) return 'no week set'
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
}

/** "4 Aug" from a timestamptz, for row meta. */
export function dayLabel(ts?: string | null): string {
  if (!ts) return ''
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/** Share of probes where an answer engine cited us. Null when there are none. */
export function citationRate(probes: Array<{ we_cited: boolean }>): number | null {
  if (!probes.length) return null
  return probes.filter(p => p.we_cited).length / probes.length
}

export function pct(rate: number | null): string {
  return rate == null ? 'no data' : `${Math.round(rate * 100)}%`
}

/** Coerce a jsonb column that should be a list of strings into one. */
export function asList(v: unknown): string[] {
  if (!v) return []
  const arr = Array.isArray(v) ? v : [v]
  return arr
    .map(item => {
      if (item == null) return ''
      if (typeof item === 'string') return item
      if (typeof item === 'object') {
        const o = item as Record<string, unknown>
        const label = o.label ?? o.name ?? o.title ?? o.touchpoint ?? o.channel
        const why = o.why ?? o.reason ?? o.rationale
        if (label) return why ? `${String(label)}: ${String(why)}` : String(label)
      }
      return JSON.stringify(item)
    })
    .filter(Boolean)
}

/** Flatten a findings jsonb blob into readable label/value pairs. */
export function asPairs(v: unknown): Array<{ key: string; value: string }> {
  if (!v || typeof v !== 'object') return []
  if (Array.isArray(v)) return asList(v).map((value, i) => ({ key: `#${i + 1}`, value }))
  return Object.entries(v as Record<string, unknown>).map(([key, value]) => ({
    key,
    value: typeof value === 'object' && value !== null ? asList(value).join(' · ') || JSON.stringify(value) : String(value),
  }))
}
