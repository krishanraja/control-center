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
export const VENTURE_OPTIONS: Array<{ slug: string; label: string }> = [
  { slug: 'mindmake', label: 'Mindmake' },
  { slug: 'publication', label: 'Publication' },
  { slug: 'mm_ctrl', label: 'CTRL' },
  { slug: 'fractionl_circle', label: 'Fractionl Circle' },
  { slug: 'fractionl_pulse', label: 'Fractionl Pulse' },
  { slug: 'full_time', label: 'Full Time' },
  { slug: 'investor', label: 'Investor' },
]
