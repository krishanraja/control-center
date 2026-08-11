import type { ContactRow } from '../hooks/useRealtimeContacts'

// Shared "why is this contact worth my time?" signal extraction. Used by both the
// LeadSheet detail and the Network swipe deck so the rationale you judge on is
// identical in both places. None of this spends a credit — it reads what's already
// known (fit scores + any dossier already on file).

// meliora and adfixus were retired in July 2026. Their labels stay so contacts
// tagged before then still render a name instead of a blank chip; they are absent
// from every venture picker, so nothing new can be filed against them.
export const VENTURE_LABEL: Record<string, string> = {
  mindmaker: 'Mindmaker', meliora: 'Meliora (retired)', adfixus: 'AdFixus (retired)', signal_noise: 'Signal & Noise',
  builder_economy: 'Builder Economy', investor: 'Investor',
  // Both spellings. `fractionl` is what the database holds (19 primary_venture
  // rows, 414 fit_scores keys); `fractionl_pulse` is what the pickers have been
  // sending. Labelling only one left the other rendering a raw slug.
  fractionl: 'Fractionl', fractionl_pulse: 'Fractionl Pulse',
}

export function ventureLabel(v?: string | null): string | null {
  if (!v) return null
  return VENTURE_LABEL[v] || v.replace(/_/g, ' ')
}

/** Highest per-venture fit score + which venture it's for. */
export function topFit(fit?: Record<string, number> | null): { venture: string; score: number } | null {
  if (!fit || typeof fit !== 'object') return null
  let best: { venture: string; score: number } | null = null
  for (const [k, v] of Object.entries(fit)) {
    if (typeof v === 'number' && (!best || v > best.score)) best = { venture: k, score: v }
  }
  return best
}

/** First couple of sentences of the dossier's "who they are", for at-a-glance judging. */
export function dossierGist(dossier: any, max = 320): string | null {
  if (!dossier || typeof dossier !== 'object') return null
  const who = dossier?.pass5_meeting_weapon?.who_they_are
  if (typeof who === 'string' && who.trim()) {
    const s = who.trim()
    return s.length > max ? s.slice(0, max).trimEnd() + '…' : s
  }
  return null
}

/** The dossier's single recommended move — the "do this" line. */
export function dossierMove(dossier: any, max = 240): string | null {
  const m = dossier?.pass5_meeting_weapon?.the_one_move
  if (typeof m === 'string' && m.trim()) {
    const s = m.trim()
    return s.length > max ? s.slice(0, max).trimEnd() + '…' : s
  }
  return null
}

// ── Lighter rationale, for contacts that have SOME enrichment but not the heavy
// pass5 meeting-weapon. These pull the next-best "why them" the dossier worked out,
// so an unresearched-but-partially-enriched warm contact still reads as a case to
// keep rather than a bare name. Order of richness: pass4 angle → pass2 voice → pass1 fact.

function strv(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}
function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}
function clip(s: string, max: number): string {
  return s.length > max ? s.slice(0, max).trimEnd() + '…' : s
}

/** Per-venture "why this person" (or opening wedge) from pass4, matched to a venture. */
export function dossierVentureAngle(dossier: any, ventureSlug?: string | null, max = 260): string | null {
  const angles = dossier?.pass4_cross_venture?.per_venture_angle
  if (!Array.isArray(angles) || angles.length === 0) return null
  const label = ventureSlug ? (VENTURE_LABEL[ventureSlug] || ventureSlug) : null
  let match: any = null
  if (label) {
    const key = label.toLowerCase().split(' ')[0]
    match = angles.find((a: any) => String(a?.venture || '').toLowerCase().includes(key))
  }
  const a = match || angles[0]
  const why = strv(a?.why_this_person) || strv(a?.opening_wedge)
  return why ? clip(stripTags(why), max) : null
}

/** What they care about publicly, from pass2. */
export function dossierPublicVoice(dossier: any, max = 240): string | null {
  const v = dossier?.pass2_public_voice
  const s = strv(v) || strv((v as any)?.summary) || strv((v as any)?.tldr)
  return s ? clip(stripTags(s), max) : null
}

/** A single resolved fact (title: description) from pass1. */
export function dossierFact(dossier: any, max = 180): string | null {
  const r = dossier?.pass1_resolve
  if (!Array.isArray(r) || r.length === 0) return null
  const f = r[0]
  const text = [strv(f?.title), strv(f?.description)].filter(Boolean).map(stripTags as any).join(': ')
  return text ? clip(text, max) : null
}

export interface ContactRationale { label: string; text: string }

/**
 * The best available "why is this contact worth my time?" line, degrading from the
 * heavy pass5 gist down through the lighter passes to tags. Returns null only when
 * the contact carries no descriptive signal at all (caller shows heat/fit/source).
 */
export function contactRationale(c: ContactRow): ContactRationale | null {
  const d = c.dossier
  const who = dossierGist(d)
  if (who) return { label: 'Who', text: who }
  const angle = dossierVentureAngle(d, c.primary_venture)
  if (angle) return { label: 'Why them', text: angle }
  const voice = dossierPublicVoice(d)
  if (voice) return { label: 'Cares about', text: voice }
  const fact = dossierFact(d)
  if (fact) return { label: 'Note', text: fact }
  const tags = Array.isArray(c.tags) ? c.tags.filter(Boolean).slice(0, 5) : []
  if (tags.length) return { label: 'Tags', text: tags.join(' · ') }
  return null
}

export function contactDisplayName(c: ContactRow): string {
  return c.full_name || c.company || (c.email ? c.email.split('@')[0] : '—')
}

// ── Suggested next move ───────────────────────────────────────────────────

export type SuggestedMoveTone = 'act' | 'due' | 'info'
export interface SuggestedMove { label: string; tone: SuggestedMoveTone }

const DAY_MS = 24 * 60 * 60 * 1000
const QUIET_DAYS = 45
const ENRICH_HEAT_FLOOR = 75

/** Whole days since the timestamp. Null when absent or unparseable; negative = future. */
function daysSince(iso?: string | null): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return null
  return Math.floor((Date.now() - t) / DAY_MS)
}

/**
 * The single suggested next move for a contact, judged purely from what is
 * already on the row (zero fetches, zero credits). Precedence: the dossier's
 * researched move, then an overdue follow-up, then re-warming a quiet warm
 * contact, then filling gaps (enrich, find a channel). Null = nothing to push.
 */
export function suggestedMove(c: ContactRow): SuggestedMove | null {
  const move = dossierMove(c.dossier, 60)
  if (move) return { label: move, tone: 'act' }

  const overdue = daysSince(c.next_touch_due_at)
  if (overdue !== null && overdue >= 0) {
    return { label: overdue >= 1 ? `Follow up, ${overdue}d overdue` : 'Follow up, due today', tone: 'due' }
  }

  const isWarm = c.consent_tier === 'warm' || c.consent_tier === 'customer'
  const quiet = daysSince(c.last_touch_at)
  if (isWarm && quiet !== null && quiet > QUIET_DAYS) {
    return { label: `Re-warm, quiet ${quiet}d`, tone: 'due' }
  }

  if (!c.deep_enriched_at && (c.heat_score ?? 0) >= ENRICH_HEAT_FLOOR) {
    return { label: 'Enrich first', tone: 'info' }
  }

  if (!c.email && !c.linkedin_url) {
    return { label: 'No channel, find one', tone: 'info' }
  }

  return null
}
