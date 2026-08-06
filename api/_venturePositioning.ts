// Per-venture "how we could work together" positioning used to ground outreach
// email drafts. The contacts draft-email endpoint injects the matching line into
// the prompt so Claude can write a specific collaboration angle instead of a
// generic intro.
//
// ─────────────────────────────────────────────────────────────────────────────
// FIRST-PASS COPY — EDIT ME.
// These one-liners were drafted from the architecture doc (§11 venture map) as a
// starting point. Krish to refine each to the real offer/value-prop. Keep them to
// a single sentence describing what working together looks like for the recipient.
// ─────────────────────────────────────────────────────────────────────────────

export interface VenturePositioning {
  /** Display label (kept in sync with the mobile/desktop venture chips). */
  label: string
  /** One-sentence "how we could work together" angle, written to the recipient. */
  offer: string
}

export const VENTURE_POSITIONING: Record<string, VenturePositioning> = {
  mindmaker: {
    label: 'Mindmaker',
    offer:
      'A Mindmaker AI consulting sprint (a Strategy Day) that takes their leadership team from AI noise to a shipped, in-production system in a matter of weeks.',
  },
  // AdFixus and Meliora were retired in July 2026 and are deliberately absent.
  // ventureOffer() returning null for them is what stops an outreach draft from
  // pitching a venture Krish no longer runs.
  signal_noise: {
    label: 'Signal & Noise',
    offer:
      'A guest spot on Signal & Noise, the podcast on AI in media (co-hosted with Rio Longacre and Brett House).',
  },
  builder_economy: {
    label: 'Builder Economy',
    offer:
      'A feature in The Builder Economy — candid conversations with the people actually building with AI.',
  },
  fractionl: {
    label: 'Fractionl',
    offer:
      'Fractionl\'s products for fractional operators and lean teams (the Circle community and Pulse).',
  },
  investor: {
    label: 'Investor',
    offer:
      'An investor conversation about the Mindmaker portfolio and where they might want to lean in.',
  },
}

/** Resolve the positioning line for a venture slug, with a safe generic fallback. */
export function ventureOffer(slug?: string | null): VenturePositioning | null {
  if (!slug) return null
  return VENTURE_POSITIONING[slug] ?? null
}
