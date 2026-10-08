// Hunter's door-in cards in pilot_deals.
//
// Hunter writes a leader card as a listed row whose notes begin with this tag,
// and its draft_body is an opening line hunter has already checked against
// the company's own words. The Monday drafter used to take the five listed rows
// with the freshest trigger, and only hunter's cards carry a trigger, so it
// would have picked five of them, overwritten the checked line and moved them
// to drafted without Krish choosing that. The Monday run leaves them alone; the
// Draft button on a card is still his to press.

export const HUNTER_CARD_PREFIX = 'hunter door-in:'

export function isHunterCard(notes: string | null | undefined): boolean {
  return (notes || '').trim().toLowerCase().startsWith(HUNTER_CARD_PREFIX)
}

// PostgREST filter for "not a hunter card". A row with no notes must stay in:
// a bare `not ilike` would drop every NULL, which is most of his own list.
export const NOT_HUNTER_CARD_FILTER = `notes.is.null,notes.not.ilike.${HUNTER_CARD_PREFIX}*`
