// One place for "why are you dropping this?" reason chips, keyed by the Supabase
// source_table the row came from. Shared by every swipe deck's left-swipe reason
// bar and by the TriagePanel reject popover so the two never drift. Codes match
// REASON_OPTIONS in api/feedback.ts (Vera clusters −1 feedback by reason_code).

export interface ReasonChip { code: string; label: string }

export const REJECT_REASONS: Record<string, ReasonChip[]> = {
  content_ideas: [
    { code: 'content_too_negative',    label: 'Too negative' },
    { code: 'content_too_technical',   label: 'Too technical' },
    { code: 'content_off_vertical',    label: 'Off-vertical' },
    { code: 'content_too_generic',     label: 'Too generic' },
    { code: 'content_not_my_voice',    label: 'Not my voice' },
    { code: 'content_old_news',        label: 'Old news' },
    { code: 'content_already_covered', label: 'Already covered' },
    { code: 'content_too_promotional', label: 'Too promotional' },
    { code: 'content_thin',            label: 'Thin / not enough to say' },
    { code: 'content_other',           label: 'Other' },
  ],
  leads: [
    { code: 'lead_too_technical',      label: 'Too technical' },
    { code: 'lead_off_vertical',       label: 'Off-vertical' },
    { code: 'lead_wrong_seniority',    label: 'Wrong seniority' },
    { code: 'lead_wrong_company_size', label: 'Wrong size' },
    { code: 'lead_no_budget_signal',   label: 'No budget signal' },
    { code: 'lead_already_contacted',  label: 'Already contacted' },
    { code: 'lead_other',              label: 'Other' },
  ],
  visibility_targets: [
    { code: 'visibility_too_technical',     label: 'Too technical' },
    { code: 'visibility_off_vertical',      label: 'Off-vertical' },
    { code: 'visibility_wrong_location',    label: 'Wrong location' },
    { code: 'visibility_wrong_audience',    label: 'Wrong audience' },
    { code: 'visibility_unlikely_accepted', label: 'Unlikely to be accepted' },
    { code: 'visibility_too_low_tier',      label: 'Too low tier' },
    { code: 'visibility_bad_timing',        label: 'Bad timing' },
    { code: 'visibility_pay_to_play',       label: 'Pay-to-play' },
    { code: 'visibility_no_relevant_talk',  label: 'No relevant talk' },
    { code: 'visibility_other',             label: 'Other' },
  ],
  guests: [
    { code: 'guest_too_high_profile',  label: 'Too high-profile' },
    { code: 'guest_too_technical',     label: 'Too technical' },
    { code: 'guest_off_vertical',      label: 'Off-vertical' },
    { code: 'guest_wrong_profile',     label: 'Wrong profile' },
    { code: 'guest_recently_appeared', label: 'Recently appeared' },
    { code: 'guest_low_reach',         label: 'Low reach' },
    { code: 'guest_no_hook',           label: 'No clear hook' },
    { code: 'guest_other',             label: 'Other' },
  ],
  contacts: [
    { code: 'contact_too_technical',    label: 'Too technical' },
    { code: 'contact_off_vertical',     label: 'Off-vertical' },
    { code: 'contact_not_a_fit',        label: 'Not a fit' },
    { code: 'contact_already_engaged',  label: 'Already engaged' },
    { code: 'contact_wrong_seniority',  label: 'Wrong seniority' },
    { code: 'contact_no_budget_signal', label: 'No budget signal' },
    { code: 'contact_cold',             label: 'No warm path / cold' },
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
