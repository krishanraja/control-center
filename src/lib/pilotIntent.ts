// What the day is for, chosen at check-in.
//
// The point is not categorisation, it is removing the second choice. v1 dropped
// the operator on Home after the gate, where picking where to go is its own
// small act of deciding, which is the exact blocker this layer exists to
// remove. Picking an intent routes the dashboard straight to the surface that
// serves it.
//
// `tab` values must exist in App.tsx's VALID_TABS.
export interface Intent {
  key: string
  label: string
  tab: string
  /** Shown once chosen, so the choice reads as a commitment not a filter. */
  blurb: string
}

// Which nomination kinds each intent favours lives in pilotCapacity.INTENT_KINDS,
// keyed by `key` below, so the ranking rule sits next to the capacity rules
// rather than being split across two files.

export const INTENTS: Intent[] = [
  { key: 'content',  label: 'Publish something', tab: 'content',     blurb: 'Today is for getting something out.' },
  { key: 'outreach', label: 'Talk to people',    tab: 'relationships', blurb: 'Today is for reaching humans.' },
  { key: 'money',    label: 'Chase revenue',     tab: 'customers',   blurb: 'Today is for money that already exists.' },
  { key: 'growth',   label: 'Work the funnel',   tab: 'acquisition', blurb: 'Today is for the top of the funnel.' },
  { key: 'build',    label: 'Build the thing',   tab: 'today',       blurb: 'Today is for the work itself.' },
  { key: 'clear',    label: 'Clear the decks',   tab: 'today',       blurb: 'Today is for closing open loops.' },
]

export function intentByKey(key: string | null | undefined): Intent | null {
  if (!key) return null
  return INTENTS.find(i => i.key === key) || null
}
