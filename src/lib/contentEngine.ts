// contentEngine — shared config for the Content Engine layer on the Content tab.
//
// The engine is additive: it layers transform-axes, enrich/challenge, channel
// variants, the Five Standards gate, and Push-to-Cleo on top of the existing
// read-only-ish ContentIdeaCard. Everything new is gated behind
// VITE_CONTENT_ENGINE_ENABLED so the inbox UI is untouched when off.

export function contentEngineEnabled(): boolean {
  // Default OFF — opt in per environment (Vite build-time var).
  return String(import.meta.env.VITE_CONTENT_ENGINE_ENABLED) === 'true'
}

// ── Transform axes (Phase 1) ─────────────────────────────────────────────
// One-click rewrites of the CURRENT draft. These never invent a new channel;
// they bend tone, length, or angle on the text in front of you.

export type ReviseMode = 'tone' | 'length' | 'zoom' | 'feedback'

export interface AxisOption {
  value: string
  label: string
  /** Steer text handed to the model, in Krish's register. */
  hint: string
}

export const TONE_PRESETS: AxisOption[] = [
  { value: 'punchier', label: 'Punchier', hint: 'Compress. Shorter declaratives, harder verb choices, uneven rhythm. Cut every word that the reader already understands.' },
  { value: 'contrarian', label: 'More contrarian', hint: 'Sharpen the antagonist. Discard the lazy version of the take out loud ("Not X, Y") then commit to the spikier read. Spike points at the idea, never the reader.' },
  { value: 'warmer', label: 'Warmer', hint: 'More human, more generous. Touch the feeling once and move. Keep the teeth on the ideas, not the people.' },
  { value: 'formal', label: 'More formal', hint: 'Exec-to-exec, Gear A. Unbothered authority, commercially grounded, zero flattery. Still no corporate hedging.' },
]

export const LENGTH_PRESETS: AxisOption[] = [
  { value: 'short', label: 'Short (LinkedIn)', hint: 'Cut to 150-250 words. Scroll-stopping claim or scene first. No hook-line-gap-explanation pattern.' },
  { value: 'mid', label: 'Mid (Mindmaker Live)', hint: 'Tighten to ~400-700 words. Teaching voice, every paragraph advances the argument, each item carries a so-what.' },
  { value: 'long', label: 'Full (Techonomic)', hint: 'Expand to a 600-1000 word essay. Slower structural open earns the depth; investigate, hold a counterpoint, end on a verdict.' },
]

export const ZOOM_DEFAULT_HINT =
  'Zoom into the single sharpest angle inside this idea and expand only that. Discard the rest. One arguable claim, earned with a specific artifact, ending on a hard verdict.'

// Quick-iterate chips (Phase 5) — feedback-mode revisions.
export const ITERATE_CHIPS: AxisOption[] = [
  { value: 'shorter', label: 'Shorter', hint: 'Cut at least a third. Keep the sharpest sentences, lose the connective tissue.' },
  { value: 'sharper-hook', label: 'Sharper hook', hint: 'Rewrite only the opening so the first sentence makes the reader feel mid-argument. No context-setting.' },
  { value: 'more-data', label: 'More data', hint: 'Ground more claims in specific numbers, named companies, dated events. Never invent — flag gaps instead.' },
  { value: 'harder-verdict', label: 'Harder ending', hint: 'Replace the ending with a hard, forward-looking verdict. No summary, no question, no CTA.' },
]

// ── Channels & lanes (Phase 3 + 7) ───────────────────────────────────────
// Two taxonomies in the OS:
//  - LANES: how variants are GENERATED (system_config.content_lane_* voice configs)
//  - FACTORY_CHANNELS: what the Omnichannel Content Factory accepts for final polish
// They overlap but are not identical, so we map lane -> factory channel.

export interface LaneDef {
  /** lane key as stored on content_ideas.lane and in system_config */
  lane: string
  /** optional slot for lanes that have one (mindmaker) */
  slot?: string
  label: string
  gear: 'A' | 'B'
  /** the content-factory target_channel this lane polishes into */
  factoryChannel: FactoryChannel
}

export type FactoryChannel =
  | 'techonomic' | 'signal_noise' | 'mindmaker_live' | 'linkedin'
  | 'builder_economy' | 'vertical_video' | 'dynamic'

export const FACTORY_CHANNELS: { value: FactoryChannel; label: string }[] = [
  { value: 'techonomic', label: 'Techonomic' },
  { value: 'signal_noise', label: 'Signal & Noise' },
  { value: 'mindmaker_live', label: 'Mindmaker Live' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'builder_economy', label: 'Builder Economy' },
  { value: 'vertical_video', label: 'Vertical Video' },
]

// Every lane the user can toggle for variant generation (decision 2026-06-11:
// expose ALL lanes as per-idea toggles). mindmaker has two slots.
export const LANES: LaneDef[] = [
  { lane: 'techonomic', label: 'Techonomic', gear: 'A', factoryChannel: 'techonomic' },
  { lane: 'signal_noise', label: 'Signal & Noise', gear: 'A', factoryChannel: 'signal_noise' },
  { lane: 'mindmaker', slot: 'roundup', label: 'Mindmaker — roundup', gear: 'A', factoryChannel: 'mindmaker_live' },
  { lane: 'mindmaker', slot: 'field_learning', label: 'Mindmaker — field learning', gear: 'B', factoryChannel: 'linkedin' },
  { lane: 'builder_economy_ig', label: 'Builder Economy (IG)', gear: 'B', factoryChannel: 'builder_economy' },
]

/** Map a generated variant's lane (+slot) onto a content-factory channel. */
export function laneToFactoryChannel(lane?: string | null, slot?: string | null): FactoryChannel {
  const hit = LANES.find(l => l.lane === lane && (l.slot || null) === (slot || null))
    || LANES.find(l => l.lane === lane)
  return hit?.factoryChannel || 'dynamic'
}

// ── The Five Standards (Phase 6) ─────────────────────────────────────────
// From content-corpus. Scored 1-5 server-side; surfaced as a gate that WARNS
// but never blocks Push-to-Cleo (decision 2026-06-11).

export const FIVE_STANDARDS = [
  { key: 'unique', label: 'Undeniably unique', watch: true },
  { key: 'researched', label: 'Well-researched', watch: false },
  { key: 'thoughtful', label: 'Thoughtful', watch: false },
  { key: 'kind', label: 'Kind', watch: true },
  { key: 'helpful', label: 'Helpful', watch: false },
] as const

export type StandardKey = typeof FIVE_STANDARDS[number]['key']

export interface StandardsScore {
  scores: Record<StandardKey, number>      // 1-5 each
  failing: StandardKey[]                    // < 3
  notes?: Partial<Record<StandardKey, string>>
  scored_at: string
}

/** A piece "passes the gate" if neither of the two watch standards fails.
 *  Accepts any object carrying a `scores` map (the row's meta.standards shape). */
export function gatePasses(s?: { scores?: Record<string, number> } | null): boolean {
  if (!s || !s.scores) return true
  return !FIVE_STANDARDS.some(st => st.watch && (s.scores?.[st.key] ?? 5) < 3)
}
