/**
 * The venture options offered when tagging a contact, lead or import.
 *
 * ONE list, imported by every picker. It used to be copy-pasted into
 * ContactImportDropzone, DesktopLeadsRE and MobileLeadsRE, so a portfolio
 * change had to be made in three places and never was: all three were still
 * offering Signal & Noise and Builder Economy as ventures after both were
 * retired.
 *
 * Mirrors `venture_registry` where active=true. Every slug here must exist in
 * that table, because `leads.primary_venture` carries a foreign key to it and
 * an unknown slug fails the write rather than degrading.
 *
 * Retired slugs are deliberately absent rather than deleted from the codebase:
 * VENTURE_LABEL-style lookups elsewhere still resolve historical rows, so a
 * contact tagged with a retired venture keeps its pill. What must never happen
 * is a retired venture being offered as a choice for NEW work.
 */
// Ruling (Krish, 2026-09-17): the short names are the real ones. "Fractionl
// Circle" and "Fractionl Pulse" are Circle and Pulse, Mindmake is Advisory and
// Publication is Media. The SLUGS do not move — `leads.primary_venture` carries
// a foreign key to `venture_registry` and the registry keys are what the
// database holds. Only the words change, and they change in one place.
export const VENTURE_OPTIONS: Array<{ slug: string; label: string }> = [
  { slug: 'mindmake', label: 'Advisory' },
  { slug: 'publication', label: 'Media' },
  { slug: 'mm_ctrl', label: 'CTRL' },
  { slug: 'fractionl_circle', label: 'Circle' },
  { slug: 'fractionl_pulse', label: 'Pulse' },
  { slug: 'full_time', label: 'Full Time' },
  { slug: 'investor', label: 'Investor' },
]

/**
 * Slug → label, for rendering a venture anywhere that is not a picker.
 *
 * ONE spelling per venture. Before this, the label lived in five places and
 * three of them disagreed with the registry: the morning check-in called
 * `publication` "Live", `fractionl_circle` "Circle" and `fractionl_pulse`
 * "Pulse", while every other surface used the registry names. Krish answered
 * "What is today for? On what?" against one vocabulary at 7am and searched his
 * network against a different one a minute later, for the same six ventures.
 * AGENTS.md is explicit that this must not happen: "One vocabulary per concept
 * — never rename a canon term on one surface while the others keep it."
 *
 * Retired slugs resolve too, so a historical row keeps its pill rather than
 * rendering a raw slug. What they must never do is appear as a CHOICE, which
 * is why VENTURE_OPTIONS above stays the shorter, active-only list.
 */
export const VENTURE_LABELS: Record<string, string> = {
  ...Object.fromEntries(VENTURE_OPTIONS.map(v => [v.slug, v.label])),
  // Retired, kept renderable (see docs/GLOSSARY.md, "Venture Registry").
  mymu: 'MYMU (retired)',
  builder_economy: 'Builder Economy (retired)',
  signal_noise: 'Signal & Noise (retired as a venture)',
  legibility: 'Legibility (retired)',
  adfixus: 'AdFixus (retired)',
  meliora: 'Meliora (retired)',
  // The database holds a bare `fractionl` on 19 primary_venture rows and 414
  // fit_scores keys, predating the circle/pulse split. Labelling only the split
  // slugs left this one rendering as raw text.
  fractionl: 'Fractionl',
  // Pre-split rows, before Circle and Pulse were separate ventures.
}

/**
 * The same venture arrives under more than one slug spelling, because three
 * table families grew their own. `venture_registry` says `mm_ctrl`,
 * `fractionl_circle`, `fractionl_pulse`; the growth tables say `ctrl`,
 * `circle`, `pulse`, `full-time`; `customers` says `mm_ctrl` but its own enum.
 * Normalising here is what lets every surface call one function, so a rename
 * lands on all of them at once instead of on whichever file someone remembered.
 *
 * The slugs themselves are NOT unified: they are foreign keys and enum values
 * in a live database. Only the words are.
 */
const SLUG_ALIASES: Record<string, string> = {
  ctrl: 'mm_ctrl',
  circle: 'fractionl_circle',
  pulse: 'fractionl_pulse',
  'full-time': 'full_time',
}

/** The one way to turn a venture slug into words. */
export function ventureLabel(slug?: string | null): string | null {
  if (!slug) return null
  const key = SLUG_ALIASES[slug] ?? slug
  return VENTURE_LABELS[key] ?? key.replace(/_/g, ' ')
}
