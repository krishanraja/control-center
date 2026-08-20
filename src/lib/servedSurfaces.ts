// One registry for everything this system serves Krish.
//
// The problem it solves is not that the parts were missing. It is that there
// were three of them and they disagreed. The reject vocabulary lived in
// api/feedback.ts (REASON_OPTIONS, 64 codes), in src/lib/triageReasons.ts
// (46 codes) and again inside FeedbackButton.tsx (45 codes). Eighteen codes
// the UI could emit were absent from the API list, so every rejection of a
// task, bet, customer, opportunity or correction wrote through as an unknown
// code and Vera clustered it as 'other'. Measured against live data on
// 2026-08-20: 114 of 328 rejections carry no usable reason, and the second
// largest cluster in the whole corpus is `lead_other` x59 -- fifty-nine times
// the list did not hold what he meant.
//
// So the vocabulary becomes singular. This file is the source of truth; the
// API's REASON_OPTIONS is a mirror, and scripts/check-served-surfaces.mts
// fails the build when the two drift. `ServedTable` being a closed union means
// a new surface cannot be added to SURFACES without also declaring its reasons
// and its why -- the type checker refuses a partial record, which is the whole
// point: consistency that a future PR cannot quietly forget.
//
// Codes are append-only. 389 feedback rows already reference the existing
// ones; renaming a code silently orphans its history.

/** Every table `/api/feedback` accepts. Must equal ALLOWED_TABLES in api/feedback.ts. */
export type ServedTable =
  | 'tasks'
  | 'leads'
  | 'contacts'
  | 'guests'
  | 'visibility_targets'
  | 'nova_target_conferences'
  | 'content_ideas'
  | 'content_decisions'
  | 'goals'
  | 'milestones'
  | 'weekly_slate'
  | 'home_intelligence'
  | 'customers'
  | 'bets'
  | 'opportunities'
  | 'corrections'

export interface ReasonChip { code: string; label: string }

/** One line of the breakdown behind a why. `strength` (0-1) draws a bar. */
export interface WhyFactor {
  label: string
  value?: string
  strength?: number
}

/**
 * Why this item is in front of Krish. `recorded: false` is a first-class
 * answer, not a failure: it means the generator wrote no reason, and the badge
 * says so rather than inventing one. Those are counted, because a surface that
 * cannot explain itself is a bug in the generator, not in the badge.
 */
export interface Why {
  /** A few words. The whole point is that it reads at a glance. */
  headline: string
  recorded: boolean
  factors?: WhyFactor[]
  agent?: string | null
  sourceLabel?: string | null
  sourceUrl?: string | null
  at?: string | null
  /** 0-100 where the surface genuinely ranks. Drives the badge's score face. */
  score?: number | null
  /** A closing caveat the factors cannot express, e.g. a demoting multiplier. */
  footnote?: string | null
}

export interface SurfaceContract {
  /** Singular, human. Used in the badge header and the reject prompt. */
  label: string
  reasons: ReasonChip[]
  /** Emitted when Krish skips the chips, so a -1 still carries a code. */
  defaultReason: string
  why: (row: Record<string, any>) => Why
}

// ── helpers ────────────────────────────────────────────────────────────────

const NO_REASON = 'No reason recorded'

function firstText(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

/** Clip to a glanceable length without cutting mid-word. */
export function clip(s: string, max = 96): string {
  const t = s.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  const sp = cut.lastIndexOf(' ')
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut) + '…'
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) ? n : null
}

/** A /10 score as a 0-1 bar. */
function outOfTen(label: string, v: unknown): WhyFactor | null {
  const n = num(v)
  return n == null ? null : { label, value: `${n}/10`, strength: Math.max(0, Math.min(1, n / 10)) }
}

function pct(label: string, v: unknown): WhyFactor | null {
  const n = num(v)
  if (n == null) return null
  const f = n > 1 ? n / 100 : n
  return { label, value: `${Math.round(f * 100)}%`, strength: Math.max(0, Math.min(1, f)) }
}

function plain(label: string, v: unknown): WhyFactor | null {
  return typeof v === 'string' && v.trim() ? { label, value: v.trim() } : null
}

function factors(...f: Array<WhyFactor | null>): WhyFactor[] | undefined {
  const out = f.filter(Boolean) as WhyFactor[]
  return out.length ? out : undefined
}

/**
 * The shape every resolver returns. Keeping construction in one place is what
 * stops "no reason" from being rendered five different ways.
 */
function why(headline: string | null, rest: Omit<Why, 'headline' | 'recorded'> = {}): Why {
  return headline
    ? { headline: clip(headline), recorded: true, ...rest }
    : { headline: NO_REASON, recorded: false, ...rest }
}

// ── the registry ───────────────────────────────────────────────────────────
// A Record over the closed union: omit a surface and `tsc --noEmit` fails.

export const SURFACES: Record<ServedTable, SurfaceContract> = {
  tasks: {
    label: 'task',
    defaultReason: 'task_other',
    reasons: [
      { code: 'task_not_a_priority',   label: 'Not a real priority' },
      { code: 'task_wrong_framing',    label: 'Wrong framing of the job' },
      { code: 'task_outdated_context', label: 'Context is outdated' },
      { code: 'task_already_done',     label: 'Already done elsewhere' },
      { code: 'task_not_mine',         label: 'Not mine to do' },
      { code: 'task_too_small',        label: 'Too small to surface' },
      { code: 'task_other',            label: 'Other' },
    ],
    why: r => why(firstText(r.description, r.evidence), {
      agent: r.assignee_agent || r.agent || null,
      at: r.updated_at || r.created || r.created_at || null,
      sourceUrl: r.link_secondary || null,
      sourceLabel: r.source || r.origin || null,
      factors: factors(
        outOfTen('Lever', r.lever_score),
        plain('Tier', r.tier),
        plain('Workstream', r.workstream),
        plain('Priority', r.priority),
      ),
    }),
  },

  leads: {
    label: 'lead',
    defaultReason: 'lead_other',
    reasons: [
      { code: 'lead_wrong_seniority',    label: 'Wrong seniority' },
      { code: 'lead_wrong_company_size', label: 'Wrong size' },
      { code: 'lead_no_budget_signal',   label: 'No budget signal' },
      { code: 'lead_already_contacted',  label: 'Already contacted' },
      { code: 'lead_wrong_venture_tag',  label: 'Wrong venture tag' },
      { code: 'lead_too_technical',      label: 'Too technical' },
      { code: 'lead_off_vertical',       label: 'Off-vertical' },
      { code: 'lead_no_warm_path',       label: 'No warm path in' },
      { code: 'lead_other',              label: 'Other' },
    ],
    why: r => why(firstText(r.why_relevant, r.primary_tension, r.next_step), {
      agent: r.assignee_agent || 'felix',
      at: r.updated_at || r.created_at || null,
      score: num(r.fit_score) != null ? num(r.fit_score)! * 10 : null,
      sourceLabel: r.origin || null,
      factors: factors(
        outOfTen('Fit', r.fit_score),
        outOfTen('ICP', r.icp_score),
        outOfTen('Attainability', r.attainability_score),
        plain('Tier', r.tier),
        plain('Quality', r.quality_score),
      ),
    }),
  },

  contacts: {
    label: 'contact',
    defaultReason: 'contact_other',
    reasons: [
      { code: 'contact_already_engaged',  label: 'Already engaged' },
      { code: 'contact_not_a_fit',        label: 'Not a fit' },
      { code: 'contact_wrong_venture',    label: 'Wrong venture' },
      { code: 'contact_no_budget_signal', label: 'No budget signal' },
      { code: 'contact_bad_timing',       label: 'Bad timing' },
      { code: 'contact_too_technical',    label: 'Too technical' },
      { code: 'contact_off_vertical',     label: 'Off-vertical' },
      { code: 'contact_wrong_seniority',  label: 'Wrong seniority' },
      { code: 'contact_cold',             label: 'No warm path / cold' },
      { code: 'contact_other',            label: 'Other' },
    ],
    why: r => why(firstText(r.why_them, r.hook, r.who), {
      agent: r.scouted_by || 'nell',
      at: r.updated_at || r.created_at || null,
      sourceLabel: r.intel_method || r.source || null,
      factors: factors(
        pct('Confidence', r.confidence),
        plain('Tier', r.network_tier),
        r.source_count != null ? { label: 'Sources', value: String(r.source_count) } : null,
        plain('Risk', r.risk),
      ),
    }),
  },

  guests: {
    label: 'guest',
    defaultReason: 'guest_other',
    reasons: [
      { code: 'guest_wrong_show',          label: 'Wrong show' },
      { code: 'guest_too_inside_baseball', label: 'Too inside-baseball' },
      { code: 'guest_not_a_builder',       label: 'Not a builder/operator' },
      { code: 'guest_too_high_profile',    label: 'Too high-profile' },
      { code: 'guest_too_technical',       label: 'Too technical' },
      { code: 'guest_off_vertical',        label: 'Off-vertical' },
      { code: 'guest_wrong_profile',       label: 'Wrong profile' },
      { code: 'guest_recently_appeared',   label: 'Recently appeared' },
      { code: 'guest_low_reach',           label: 'Low reach' },
      { code: 'guest_no_hook',             label: 'No clear hook' },
      { code: 'guest_other',               label: 'Other' },
    ],
    why: r => {
      const angle = Array.isArray(r.suggested_angles) && r.suggested_angles.length
        ? firstText(r.suggested_angles[0]?.why_now, r.suggested_angles[0]?.hook, r.suggested_angles[0]?.title)
        : null
      return why(firstText(r.why_fit, r.one_liner, angle), {
        agent: 'nell',
        at: r.updated_at || r.created_at || null,
        sourceLabel: r.discovery_source || null,
        factors: factors(
          outOfTen('Brand fit', r.brand_fit_score),
          outOfTen('Attainability', r.attainability_score),
          plain('Format', r.format),
          r.in_network ? { label: 'Network', value: 'In network' } : null,
        ),
      })
    },
  },

  visibility_targets: {
    label: 'visibility target',
    defaultReason: 'visibility_other',
    reasons: [
      { code: 'visibility_wrong_audience',    label: 'Wrong audience' },
      { code: 'visibility_bad_timing',        label: 'Bad timing' },
      { code: 'visibility_already_pitched',   label: 'Already pitched' },
      { code: 'visibility_too_low_tier',      label: 'Too low tier' },
      { code: 'visibility_wrong_location',    label: 'Wrong location' },
      { code: 'visibility_unlikely_accepted', label: 'Unlikely to be accepted' },
      { code: 'visibility_pay_to_play',       label: 'Pay-to-play' },
      { code: 'visibility_no_relevant_talk',  label: 'No relevant talk' },
      { code: 'visibility_too_technical',     label: 'Too technical' },
      { code: 'visibility_off_vertical',      label: 'Off-vertical' },
      { code: 'visibility_other',             label: 'Other' },
    ],
    why: r => why(firstText(r.why_relevant, r.suggested_angle, r.angle, r.strategic_value), {
      agent: 'nova',
      at: r.updated_at || r.created_at || null,
      score: num(r.relevance_score) != null ? num(r.relevance_score)! * 10 : null,
      factors: factors(
        outOfTen('Relevance', r.relevance_score),
        outOfTen('Fit', r.fit_score),
        plain('Quality', r.quality_score),
        plain('Organiser', r.organizer_reputation),
      ),
    }),
  },

  // Same vocabulary as visibility_targets on purpose: it is the same judgment
  // about the same kind of object, and splitting the codes would split the
  // history Vera clusters on.
  nova_target_conferences: {
    label: 'conference',
    defaultReason: 'visibility_other',
    reasons: [
      { code: 'visibility_wrong_audience',  label: 'Wrong audience' },
      { code: 'visibility_bad_timing',      label: 'Bad timing' },
      { code: 'visibility_already_pitched', label: 'Already pitched' },
      { code: 'visibility_too_low_tier',    label: 'Too low tier' },
      { code: 'visibility_wrong_location',  label: 'Wrong location' },
      { code: 'visibility_pay_to_play',     label: 'Pay-to-play' },
      { code: 'visibility_off_vertical',    label: 'Off-vertical' },
      { code: 'visibility_other',           label: 'Other' },
    ],
    why: r => why(firstText(r.why_relevant, r.notes, r.description), {
      agent: 'nova',
      at: r.updated_at || r.created_at || null,
      factors: factors(outOfTen('Relevance', r.relevance_score), plain('Location', r.location)),
    }),
  },

  content_ideas: {
    label: 'idea',
    defaultReason: 'content_other',
    reasons: [
      { code: 'content_thin',            label: 'Thin / not enough to say' },
      { code: 'content_too_generic',     label: 'Too generic' },
      { code: 'content_not_my_voice',    label: 'Not my voice' },
      { code: 'content_old_news',        label: 'Old news' },
      { code: 'content_already_covered', label: 'Already covered' },
      { code: 'content_too_negative',    label: 'Too negative' },
      { code: 'content_too_technical',   label: 'Too technical' },
      { code: 'content_too_promotional', label: 'Too promotional' },
      { code: 'content_off_vertical',    label: 'Off-vertical' },
      { code: 'content_wrong_venture',   label: 'Wrong venture' },
      { code: 'content_other',           label: 'Other' },
    ],
    why: r => why(firstText(r.thesis, r.source_snippet, r.angle), {
      agent: r.assignee_agent || 'cleo',
      at: r.updated_at || r.created_at || null,
      sourceLabel: r.source_type || r.origin || null,
      sourceUrl: r.source_url || null,
      factors: factors(
        pct('Confidence', r.confidence),
        outOfTen('Brand fit', r.brand_fit_score),
        plain('Quality', r.quality_score),
        plain('Horizon', r.horizon),
      ),
    }),
  },

  content_decisions: {
    label: 'card',
    defaultReason: 'content_other',
    reasons: [
      { code: 'content_wrong_topic',     label: 'Wrong topic for me' },
      { code: 'content_wrong_angle',     label: 'Wrong angle' },
      { code: 'content_already_covered', label: 'Already covered' },
      { code: 'content_old_news',        label: 'Old news' },
      { code: 'content_too_generic',     label: 'Too generic' },
      { code: 'content_not_my_voice',    label: 'Not my voice' },
      { code: 'content_bad_timing',      label: 'Bad timing' },
      { code: 'content_other',           label: 'Other' },
    ],
    why: r => {
      const p = (r.payload || {}) as Record<string, any>
      const sources = Array.isArray(p.sources) ? p.sources.length : null
      return why(firstText(p.summary, p.implication, p.thesis, p.why), {
        agent: 'cleo',
        at: r.created_at || null,
        factors: factors(
          plain('Kind', r.kind),
          p.day_span != null ? { label: 'Day span', value: String(p.day_span) } : null,
          sources != null ? { label: 'Sources', value: String(sources) } : null,
          p.nearest?.similarity != null ? pct('Nearest match', p.nearest.similarity) : null,
        ),
      })
    },
  },

  goals: {
    label: 'objective',
    defaultReason: 'goal_other',
    reasons: [
      { code: 'marcus_objective_nomination_rejected', label: 'Wrong objective' },
      { code: 'marcus_objective_amended',             label: 'Right idea, wrong shape' },
      { code: 'marcus_objective_releveled',           label: 'Wrong level' },
      { code: 'goal_bad_timing',                      label: 'Bad timing' },
      { code: 'goal_not_measurable',                  label: 'Not measurable' },
      { code: 'goal_other',                           label: 'Other' },
    ],
    why: r => why(firstText(r.why_now, r.definition_of_done), {
      agent: r.created_by || 'marcus',
      at: r.updated_at || r.created_at || null,
      sourceLabel: r.source || null,
      factors: factors(plain('KPI', r.primary_kpi), plain('Horizon', r.horizon)),
    }),
  },

  milestones: {
    label: 'milestone',
    defaultReason: 'milestone_other',
    reasons: [
      { code: 'marcus_milestone_override', label: 'Right work, wrong chunk' },
      { code: 'milestone_bad_timing',      label: 'Bad timing' },
      { code: 'milestone_too_big',         label: 'Too big for a week' },
      { code: 'milestone_not_mine',        label: 'Not mine to do' },
      { code: 'milestone_other',           label: 'Other' },
    ],
    why: r => why(firstText(r.marcus_reasoning, r.description), {
      agent: 'marcus',
      at: r.updated_at || r.created_at || null,
      sourceLabel: r.source || null,
      factors: factors(
        r.est_deep_work_hours != null ? { label: 'Deep work', value: `${r.est_deep_work_hours}h` } : null,
      ),
    }),
  },

  weekly_slate: {
    label: 'weekly move',
    defaultReason: 'marcus_weekly_slate_override',
    reasons: [
      { code: 'marcus_weekly_slate_override', label: 'Not this week' },
      { code: 'weekly_wrong_altitude',        label: 'Wrong altitude' },
      { code: 'weekly_already_moving',        label: 'Already moving on it' },
      { code: 'weekly_other',                 label: 'Other' },
    ],
    why: r => why(firstText(r.marcus_reasoning, r.rationale, r.description), {
      agent: 'marcus',
      at: r.updated_at || r.created_at || null,
    }),
  },

  home_intelligence: {
    label: 'priority',
    defaultReason: 'marcus_priority_override',
    reasons: [
      { code: 'marcus_priority_override',    label: 'Wrong priority today' },
      { code: 'marcus_suggestion_unsuitable', label: 'Not suitable' },
      { code: 'priority_bad_timing',         label: 'Bad timing' },
      { code: 'priority_already_done',       label: 'Already handled' },
      { code: 'priority_other',              label: 'Other' },
    ],
    why: r => why(firstText(r.why_now, r.reasoning, r.top_three_reasoning), {
      agent: 'marcus',
      at: r.generated_at || r.created_at || null,
      factors: factors(outOfTen('Leverage', r.leverage_score)),
    }),
  },

  customers: {
    label: 'customer',
    defaultReason: 'customer_other',
    reasons: [
      { code: 'customer_wrong_segment',   label: 'Wrong segment' },
      { code: 'customer_missing_context', label: 'Missing context' },
      { code: 'customer_stale_signal',    label: 'Signal is stale' },
      { code: 'customer_other',           label: 'Other' },
    ],
    why: r => why(firstText(r.signal, r.notes, r.summary), {
      agent: r.owner_agent || 'maya',
      at: r.updated_at || r.created_at || null,
      factors: factors(plain('Segment', r.segment), plain('Health', r.health)),
    }),
  },

  bets: {
    label: 'bet',
    defaultReason: 'bet_other',
    reasons: [
      { code: 'bet_not_falsifiable',  label: 'Not falsifiable' },
      { code: 'bet_wrong_hypothesis', label: 'Wrong hypothesis' },
      { code: 'bet_wrong_size',       label: 'Wrong size' },
      { code: 'bet_bad_timing',       label: 'Bad timing' },
      { code: 'bet_other',            label: 'Other' },
    ],
    why: r => why(firstText(r.hypothesis, r.rationale), {
      agent: r.owner_agent || null,
      at: r.updated_at || r.created_at || null,
      factors: factors(
        r.est_mrr_impact_usd != null ? { label: 'Est. MRR', value: `$${r.est_mrr_impact_usd}` } : null,
      ),
    }),
  },

  opportunities: {
    label: 'opportunity',
    defaultReason: 'opp_other',
    reasons: [
      { code: 'opp_no_revenue_path', label: 'No clear revenue path' },
      { code: 'opp_wrong_ICP',       label: 'Wrong ICP' },
      { code: 'opp_too_low_signal',  label: 'Signal too low' },
      { code: 'opp_bad_timing',      label: 'Bad timing' },
      { code: 'opp_other',           label: 'Other' },
    ],
    why: r => why(firstText(r.why_relevant, r.rationale, r.notes), {
      agent: r.owner_agent || null,
      at: r.updated_at || r.created_at || null,
      factors: factors(outOfTen('Fit', r.fit_score)),
    }),
  },

  // Rejecting a correction is feedback about the learning loop itself. It has
  // to be codeable for the same reason everything else does, or the loop
  // cannot learn that it is mislearning.
  corrections: {
    label: 'correction',
    defaultReason: 'correction_other',
    reasons: [
      { code: 'correction_no_action',     label: 'No action needed' },
      { code: 'correction_wrong_pattern', label: 'Pattern is wrong' },
      { code: 'correction_too_broad',     label: 'Too broad a rule' },
      { code: 'correction_already_fixed', label: 'Already fixed' },
      { code: 'correction_other',         label: 'Other' },
    ],
    why: r => why(firstText(r.correction_instruction, r.pattern_extracted, r.proposed_brief_edit), {
      agent: r.agent_id || 'vera',
      at: r.detected_at || r.created_at || null,
      sourceLabel: r.detection_source || null,
      factors: factors(
        plain('Confidence', r.confidence),
        plain('Pattern', r.pattern_reason_code),
        Array.isArray(r.consumed_feedback_ids)
          ? { label: 'Built from', value: `${r.consumed_feedback_ids.length} rejections` }
          : null,
      ),
    }),
  },
}

// ── lookups ────────────────────────────────────────────────────────────────

export const SERVED_TABLES = Object.keys(SURFACES) as ServedTable[]

export function isServedTable(t: string): t is ServedTable {
  return Object.prototype.hasOwnProperty.call(SURFACES, t)
}

export function surfaceFor(table: string): SurfaceContract | null {
  return isServedTable(table) ? SURFACES[table] : null
}

export function reasonsFor(table: string): ReasonChip[] {
  return surfaceFor(table)?.reasons ?? []
}

export function defaultReasonFor(table: string): string | undefined {
  return surfaceFor(table)?.defaultReason
}

/**
 * The why for a row, or a recorded:false Why. Never null: a caller that has to
 * branch on "is there a why" is a caller that will render the empty case in
 * its own private way, which is the drift this file exists to end.
 */
export function whyFor(table: string, row: Record<string, any> | null | undefined): Why {
  const s = surfaceFor(table)
  if (!s || !row) return { headline: NO_REASON, recorded: false }
  try {
    return s.why(row)
  } catch {
    // A malformed row must not take a card down over a tooltip.
    return { headline: NO_REASON, recorded: false }
  }
}

/**
 * A `decisions_waiting` row, explained.
 *
 * The view has already done the normalising: its `description` column IS the
 * surface's own reason (leads.why_relevant, guests.why_fit, content_ideas.thesis,
 * content_decisions.payload->>summary), unioned into one slot so Home never has
 * to know which table a row came from. So this reads the view's shape directly
 * rather than routing back through a per-table resolver that would be looking
 * for columns the view has already renamed.
 */
export function whyForDecision(d: {
  description?: string | null
  agent?: string | null
  sort_at?: string | null
  url?: string | null
  source_table?: string | null
  meta?: Record<string, any> | null
}): Why {
  const m = (d.meta && typeof d.meta === 'object' ? d.meta : {}) as Record<string, any>
  return why(d.description || null, {
    agent: d.agent || null,
    at: d.sort_at || null,
    sourceUrl: d.url || null,
    sourceLabel: d.source_table || null,
    factors: factors(
      outOfTen('Fit', m.fit_score),
      outOfTen('Relevance', m.relevance_score),
      outOfTen('Lever', m.lever_score),
      pct('Confidence', typeof m.confidence === 'number' ? m.confidence : undefined),
      plain('Confidence', typeof m.confidence === 'string' ? m.confidence : undefined),
      plain('Quality', m.quality_score),
      plain('Tier', m.tier),
    ),
  })
}

/** Every code in the registry, deduped. The API mirror is checked against this. */
export const ALL_REASON_CODES: string[] = [
  ...new Set(SERVED_TABLES.flatMap(t => SURFACES[t].reasons.map(r => r.code))),
].sort()

const LABEL_BY_CODE: Record<string, string> = (() => {
  const m: Record<string, string> = {}
  for (const t of SERVED_TABLES) for (const r of SURFACES[t].reasons) m[r.code] ??= r.label
  return m
})()

/**
 * Human label for any code, including one outside the surface's own set --
 * the reason predictor draws on the whole history and can return a code this
 * surface does not itself offer.
 */
export function labelForReason(code: string): string {
  return LABEL_BY_CODE[code]
    || code.replace(/^[a-z]+_/, '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())
}
