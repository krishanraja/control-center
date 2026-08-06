// Triage auto-open, dismissed for the rest of the civil day.
//
// Krish: "I dont like that once I have exited triage, and then come back to the
// tab the triage pops up again. That should go away until tomorrow."
//
// The previous guard was a useRef, which only survives the component's own
// lifetime. Leaving the tab unmounts it, so returning reset the ref and the
// deck auto-opened again. A ref cannot express "until tomorrow"; it can only
// express "until you navigate away", which is the opposite of what is wanted.
//
// Keyed per surface so dismissing the guests deck does not also suppress the
// visibility one, and stamped with the civil date so it lapses at midnight
// without any cleanup job.

const KEY = 'cc:triage-dismissed'

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function read(): Record<string, string> {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Record<string, string>) : {}
  } catch {
    return {}
  }
}

/** True when this surface's triage was already dismissed today. */
export function triageDismissedToday(surface: string): boolean {
  return read()[surface] === today()
}

/** Remember that Krish exited this surface's triage; lapses at midnight. */
export function dismissTriageToday(surface: string): void {
  try {
    const all = read()
    all[surface] = today()
    // Drop stale surfaces so this never grows unbounded.
    const t = today()
    for (const k of Object.keys(all)) if (all[k] !== t) delete all[k]
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    /* private mode / storage disabled: auto-open simply reverts to per-mount */
  }
}
