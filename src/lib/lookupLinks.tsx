import { Linkedin, Search, Youtube } from 'lucide-react'
import type { QuickLink } from '../components/shared/QuickLinkRow'

// Scouted guests usually have no stored profile URLs, but the user still needs to
// "check the person out" — especially to *hear them talk* before pitching. These
// always-available lookups (built from name + company) cover that: LinkedIn to
// see who they are, Google for the broad picture, YouTube for talks/interviews.
export function buildLookupLinks(name?: string | null, company?: string | null): QuickLink[] {
  const q = [name, company].filter(Boolean).join(' ').trim()
  if (!q) return []
  const e = encodeURIComponent(q)
  return [
    { label: 'LinkedIn', href: `https://www.linkedin.com/search/results/people/?keywords=${e}`, icon: <Linkedin size={11} /> },
    { label: 'Google', href: `https://www.google.com/search?q=${e}`, icon: <Search size={11} /> },
    { label: 'YouTube', href: `https://www.youtube.com/results?search_query=${e}`, icon: <Youtube size={11} /> },
  ]
}
