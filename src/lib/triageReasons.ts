// One place for "why are you dropping this?" reason chips, keyed by the Supabase
// source_table the row came from. Shared by every swipe deck's left-swipe reason
// bar and by the TriagePanel reject popover so the two never drift. Codes match
// REASON_OPTIONS in api/feedback.ts (Vera clusters −1 feedback by reason_code).

export interface ReasonChip { code: string; label: string }

export const REJECT_REASONS: Record<string, ReasonChip[]> = {
  content_ideas: [
    { code: 'content_too_generic',  label: 'Too generic' },
    { code: 'content_not_my_voice', label: 'Not my voice' },
    { code: 'content_old_news',     label: 'Old news' },
    { code: 'content_wrong_venture', label: 'Wrong venture' },
    { code: 'content_other',        label: 'Other' },
  ],
  leads: [
    { code: 'lead_wrong_seniority',    label: 'Wrong seniority' },
    { code: 'lead_wrong_company_size', label: 'Wrong size' },
    { code: 'lead_no_budget_signal',   label: 'No budget signal' },
    { code: 'lead_already_contacted',  label: 'Already contacted' },
    { code: 'lead_other',              label: 'Other' },
  ],
  visibility_targets: [
    { code: 'visibility_wrong_audience',  label: 'Wrong audience' },
    { code: 'visibility_bad_timing',      label: 'Bad timing' },
    { code: 'visibility_already_pitched', label: 'Already pitched' },
    { code: 'visibility_too_low_tier',    label: 'Too low tier' },
    { code: 'visibility_other',           label: 'Other' },
  ],
  guests: [
    { code: 'guest_wrong_show',         label: 'Wrong show' },
    { code: 'guest_too_inside_baseball', label: 'Too inside-baseball' },
    { code: 'guest_not_a_builder',      label: 'Not a builder' },
    { code: 'guest_recently_appeared',  label: 'Recently appeared' },
    { code: 'guest_other',              label: 'Other' },
  ],
  contacts: [
    { code: 'contact_already_engaged',  label: 'Already engaged' },
    { code: 'contact_not_a_fit',        label: 'Not a fit' },
    { code: 'contact_wrong_venture',    label: 'Wrong venture' },
    { code: 'contact_no_budget_signal', label: 'No budget signal' },
    { code: 'contact_bad_timing',       label: 'Bad timing' },
    { code: 'contact_other',            label: 'Other' },
  ],
}

/** Fallback reason a "Skip" (no chip picked) emits, so the −1 still carries a code. */
export const DEFAULT_REASON: Record<string, string> = {
  content_ideas: 'content_other',
  leads: 'lead_other',
  visibility_targets: 'visibility_other',
  guests: 'guest_other',
  contacts: 'contact_other',
}

export function reasonsFor(table: string): ReasonChip[] {
  return REJECT_REASONS[table] || []
}
