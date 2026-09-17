// "Where do I know this person from?"
//
// The answer was always in the database and never on the screen. Every one of
// the 10,768 contacts carries origin_channel and first_met_context, so the
// coverage looked total — and reading the actual values shows why coverage was
// never the problem:
//
//   8,295 people    origin_channel 'network_intelligence'  a pipeline name, not a memory
//     639 people    first_met_context is a 200-character enrichment blob
//                   ("✓ MX verified — domain accepts email. Pattern guess; recommend
//                    NeverBounce or single-send delivery test... | Why fit (Master
//                    rationale): Creative agency founder with...")
//
// Neither tells Krish anything. So this is not a formatter over a column; it is
// a decision about which of several competing columns actually answers the
// question, plus a refusal to print the ones that don't.
//
// Three rules, in order:
//
//   1. A NAMED CAMPAIGN WINS — but only when it is a NAME. "AI Circle",
//      "Cannes 2026 Outreach", "Pavilion GTM Dinner" are rooms he was in, and
//      that is the memory cue. "network_intelligence_2026_08" is a pipeline run
//      identifier, and it sits on 8,297 people — 77% of the network. A rule that
//      prefers the campaign unconditionally would print that under three
//      quarters of the names in the tab, which is the exact failure this file
//      exists to prevent. See looksLikeARoom.
//   2. OTHERWISE THE CHANNEL, in human words. 'linkedin_outbound' is not a
//      sentence; "LinkedIn outreach" is.
//   3. OTHERWISE SAY SO. "Unknown source" is a fact. Inventing a plausible
//      origin for someone he is about to message is the one unrecoverable error
//      here: he opens with a shared room that never existed.
//
// first_met_context becomes the secondary detail ONLY when it reads like a note
// rather than a machine artifact. See looksLikeANote.

export interface ProvenanceInput {
  origin_channel?: string | null
  origin_campaign?: string | null
  first_met_context?: string | null
}

export interface Provenance {
  /** The chip. Short enough to sit beside a name on a phone, so possibly
   *  trimmed — put `full` in the title attribute, never this. */
  label: string
  /** The same thing untrimmed, for the tooltip. */
  full: string
  /** The second line, when there is a human one. Usually null. */
  detail: string | null
  /** Tailwind border/bg/text triple, matching ContactSourcePill's vocabulary. */
  tone: string
  /** False when nothing real is known. The chip still renders — silence reads
   *  as "I know them from somewhere", which is worse than "I don't know". */
  known: boolean
}

// Channel → how Krish would say it out loud. Anything not listed falls through
// to a de-slugged version of itself rather than being dropped, so a channel
// invented by a future importer still renders as words.
const CHANNEL_LABEL: Record<string, string> = {
  community: 'Community',
  network_intelligence: 'LinkedIn network',
  linkedin_outbound: 'LinkedIn outreach',
  warm_dm: 'Warm DM',
  twitter_dm: 'X DM',
  podcast_pipeline: 'Podcast pipeline',
  podcast_guest: 'Podcast guest',
  event_cannes: 'Cannes',
  event_navigator: 'Navigator',
  apollo: 'Apollo',
  apollo_cold: 'Apollo (cold)',
  cold_outbound: 'Cold outbound',
  instantly_campaign: 'Instantly campaign',
  networking: 'Networking',
  feedback: 'Feedback call',
  prospect: 'Prospect',
  crm: 'CRM',
  'krish-direct': 'Named by you',
}

// Campaign slug → the room's real name. Only for campaigns that ARRIVE as
// slugs and name a real room; free-text campaign names (most of them) are
// already readable and pass through untouched. A slug not in here is treated as
// a machine artifact, which is the safe default — see looksLikeARoom.
const CAMPAIGN_LABEL: Record<string, string> = {
  ai_circle: 'AI Circle',
  press_publish_la: 'Press Publish LA',
  founders_common: 'Founders Common',
  podcast_signal_noise: 'Signal & Noise',
}

/**
 * Does this campaign value name a room, or a pipeline run?
 *
 * Measured on the corpus, the distinction is clean and mechanical: rooms were
 * typed by a person and carry spaces ("Cannes 2026 Outreach", "NYC Networking
 * Tracker 2026", "Feedback 30 Final"), pipelines were emitted by code and carry
 * underscores ("network_intelligence_2026_08", "podcast_signal_noise").
 *
 * So an all-lowercase snake_case value is rejected unless CAMPAIGN_LABEL knows
 * what room it means. Being wrong in this direction costs a slightly less
 * specific chip; being wrong the other way puts a run identifier under 8,297
 * people's names.
 */
function looksLikeARoom(campaign: string): boolean {
  return !/^[a-z0-9]+(?:[_-][a-z0-9]+)+$/.test(campaign)
}

/** The chip sits beside a name on a phone. "Mindmaker — Leaders — Make Your
 *  Nervous Decision" is a real campaign in this corpus and does not fit; the
 *  full value stays available as the element's title. */
function forChip(label: string): string {
  return label.length > 30 ? `${label.slice(0, 29).trimEnd()}…` : label
}

// Warm channels get warm chips. The tone is doing real work: it is how a
// community member and an Apollo scrape stop looking identical in a list.
const WARM = 'text-rose-300 bg-rose-500/12 border-rose-500/25'
const COMMUNITY = 'text-violet-300 bg-violet-500/10 border-violet-500/20'
const NETWORK = 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20'
const COLD = 'text-ink-faint bg-white/[0.05] border-white/10'
const UNKNOWN = 'text-ink-faint bg-white/[0.03] border-white/[0.08]'

const CHANNEL_TONE: Record<string, string> = {
  community: COMMUNITY,
  warm_dm: WARM,
  feedback: WARM,
  'krish-direct': WARM,
  podcast_guest: WARM,
  podcast_pipeline: NETWORK,
  network_intelligence: NETWORK,
  networking: NETWORK,
  event_cannes: NETWORK,
  event_navigator: NETWORK,
  linkedin_outbound: COLD,
  twitter_dm: COLD,
  apollo: COLD,
  apollo_cold: COLD,
  cold_outbound: COLD,
  instantly_campaign: COLD,
  prospect: COLD,
  crm: COLD,
}

/** A slug becomes words. 'event_cannes' → 'Event cannes'. Last resort only. */
function deslug(s: string): string {
  const t = s.replace(/[_-]+/g, ' ').trim()
  return t ? t[0].toUpperCase() + t.slice(1) : t
}

/**
 * Is this a note a person wrote, or a machine artifact that happens to live in
 * a note-shaped column?
 *
 * The test is deliberately crude and deliberately strict, because the failure
 * modes are asymmetric: dropping a real note costs a line of context, while
 * printing an enrichment blob puts "✓ MX verified — domain accepts email" under
 * someone's name and makes the whole surface look broken.
 *
 * Every one of these rejects a real value measured in the corpus:
 *   length      the 639 Cannes blobs run 200+ chars
 *   '|'         the blob's own field separator
 *   '✓'         verification status markers
 *   http        a bare URL is a link, not a memory
 *   newline     multi-line means it was assembled, not typed
 */
function looksLikeANote(s: string): boolean {
  if (s.length > 90) return false
  if (/[|✓]/.test(s)) return false
  if (/https?:\/\//i.test(s)) return false
  if (/[\r\n]/.test(s)) return false
  return true
}

export function contactProvenance(c: ProvenanceInput): Provenance {
  const channel = (c.origin_channel || '').trim()
  const campaign = (c.origin_campaign || '').trim()
  const context = (c.first_met_context || '').trim()

  const detail = context && looksLikeANote(context) ? context : null
  const tone = CHANNEL_TONE[channel] || (channel ? COLD : UNKNOWN)

  // 1. The room he was in.
  const known = CAMPAIGN_LABEL[campaign]
  if (campaign && (known || looksLikeARoom(campaign))) {
    const label = known || campaign
    // Don't repeat the campaign back as its own detail. It happens: several
    // importers wrote the same string into both columns.
    return { label: forChip(label), full: label, detail: detail === label ? null : detail, tone, known: true }
  }

  // 2. The channel, in words.
  if (channel) {
    const label = CHANNEL_LABEL[channel] || deslug(channel)
    return { label: forChip(label), full: label, detail, tone, known: true }
  }

  // 3. Nothing. Say nothing, loudly.
  return { label: 'Unknown source', full: 'Unknown source', detail, tone: UNKNOWN, known: false }
}
