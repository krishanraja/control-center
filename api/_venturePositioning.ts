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

// Ventures Krish no longer runs. This is the API-layer source of truth for
// retirement: a slug here must never be offered for NEW work (a network search
// ranked by it, a recommendation fetched for it, an outreach draft that pitches
// it). It deliberately does NOT stop a retired slug from RESOLVING — historical
// contacts tagged before a retirement still render their "(retired)" pill via
// the VENTURE_LABEL-style maps. AdFixus and Meliora were retired July 2026, MYMU
// alongside them. Add a slug here to retire it everywhere the guard is applied.
export const RETIRED_VENTURES = new Set<string>(['adfixus', 'meliora', 'mymu'])

/** True when a venture slug (or its alias) belongs to a venture Krish has retired. */
export function isRetiredVenture(slug?: string | null): boolean {
  const s = canonicalVenture(slug)
  return s != null && RETIRED_VENTURES.has(s)
}

// Slug drift, resolved rather than renamed. The contact venture pickers send
// `fractionl_pulse`; this map, `contacts.primary_venture` (19 rows) and
// `contacts.fit_scores` (414 rows) all say `fractionl`, and NO row anywhere uses
// `fractionl_pulse`. So ventureOffer('fractionl_pulse') returned null and the
// Fractionl angle silently never reached an outreach prompt.
//
// Aliased instead of renamed on purpose: `fractionl_pulse` is a real and
// correct slug in the acquisition-lane and customer-product namespaces
// (api/growth/council-run.ts, hooks/useCustomers.ts). Renaming it globally to
// fix a contacts bug would break those.
const VENTURE_ALIAS: Record<string, string> = {
  fractionl_pulse: 'fractionl',
  fractionl_circle: 'fractionl',
}

/** Canonical venture slug for a contact. */
export function canonicalVenture(slug?: string | null): string | null {
  if (!slug) return null
  return VENTURE_ALIAS[slug] ?? slug
}

/** Resolve the positioning line for a venture slug, with a safe generic fallback. */
export function ventureOffer(slug?: string | null): VenturePositioning | null {
  const s = canonicalVenture(slug)
  if (!s) return null
  return VENTURE_POSITIONING[s] ?? null
}
