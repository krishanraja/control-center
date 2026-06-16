import type { ContactRow } from '../hooks/useRealtimeContacts'

// Shared "why is this contact worth my time?" signal extraction. Used by both the
// LeadSheet detail and the Network swipe deck so the rationale you judge on is
// identical in both places. None of this spends a credit — it reads what's already
// known (fit scores + any dossier already on file).

export const VENTURE_LABEL: Record<string, string> = {
  mindmaker: 'Mindmaker', meliora: 'Meliora', adfixus: 'AdFixus', signal_noise: 'Signal & Noise',
  builder_economy: 'Builder Economy', fractionl: 'Fractionl', investor: 'Investor',
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

export function contactDisplayName(c: ContactRow): string {
  return c.full_name || c.company || (c.email ? c.email.split('@')[0] : '—')
}
