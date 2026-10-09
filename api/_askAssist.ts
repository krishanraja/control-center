import type { StrategistRead, AskSection, AskPerson } from '../src/types/strategist.js'
import type { ContactDetails } from './_strategistGrounding.js'

// The ask at assist (ADR-030, phase 5).
//
// The strategist's ask surface (`strategist_ask`) sits on the autonomy ladder
// at `propose`: it suggests the words and does nothing else. Once Krish has
// accepted the weekly review's proposal to move it to `assist` (phase 4), the
// same read also makes the Gmail draft, addressed to the person, in his own
// drafts folder, at the moment the read is written. The ask then arrives at
// the send wall already prepared: the link sits beside it, and his press in
// Gmail is the only thing that sends.
//
// Bounds, in one line: at assist it may create a Gmail draft addressed to the
// contact; it never sends, never fills his prediction, and never makes the
// ask today's ask. Any rung other than `assist` drafts nothing, so a rung set
// by hand to a word this surface has no meaning for changes nothing here.
//
// The words are the read's own: the strategist wrote the message in the
// request formula and Krish reviews it. No second writer rewrites it on the
// way to the draft (ADR-026: never a second coach).

export const ASK_SURFACE = 'strategist_ask'
export const ASSIST = 'assist'

/** One draft to make: the person's address and the ask's own words. */
export interface AskDraftInput {
  index: number
  to: string
  /** The ask in one line, at most twelve words. */
  subject: string
  /** The full message, as written. */
  body: string
  suggestion_id: string | null
}

export interface AskAssistDeps {
  /** The surface's rung, null when the ladder cannot be read (reads as propose). */
  rung: () => Promise<string | null>
  /** Make one Gmail draft. Null when Google is not configured or the draft failed. */
  draft: (d: { to: string; subject: string; body: string }) => Promise<{ url: string } | null>
  /** Record that the ask was drafted, with the link, when the outcome ledger exists. */
  record?: (suggestion_id: string, url: string) => Promise<void>
}

export interface AskAssistResult {
  read: StrategistRead
  rung: string | null
  /** How many drafts were made. */
  drafted: number
  /** Why an ask was not drafted, one note per skipped ask, never a person's details. */
  notes: string[]
}

/** The person a draft would reach: the named one, or the one who makes the intro. */
function reachable(a: AskSection): AskPerson | null {
  if (a.to.kind === 'named') return a.to.person
  return a.to.via.kind === 'contact' ? a.to.via.person : null
}

/** Pure: the asks a draft can be made for, in read order. A person with no
 *  email on record is skipped; nothing is guessed. */
export function draftableAsks(read: StrategistRead, details: ContactDetails): AskDraftInput[] {
  const out: AskDraftInput[] = []
  read.asks.forEach((a, index) => {
    const p = reachable(a)
    if (!p) return
    const email = (p.email ?? details[p.contact_id]?.email ?? '').trim()
    if (!email) return
    const subject = (a.line || '').trim()
    const body = (a.message || '').trim()
    if (!body) return
    out.push({ index, to: email, subject, body, suggestion_id: a.suggestion_id ?? null })
  })
  return out
}

/** Pure: the read with a draft link on each drafted ask. Only an https link
 *  is kept, the same rule the daily move applies to a deal's draft. */
export function withAskDrafts(read: StrategistRead, urls: Record<number, string>): StrategistRead {
  return {
    ...read,
    asks: read.asks.map((a, i) => {
      const u = urls[i]
      return u && /^https:\/\//i.test(u) ? { ...a, draft_url: u } : a
    }),
  }
}

/**
 * At assist, make the drafts and attach their links; at any other rung,
 * return the read untouched. A draft that fails leaves its ask as it was and
 * says so in the notes, never in the read.
 */
export async function prepareAskDrafts(read: StrategistRead, details: ContactDetails, deps: AskAssistDeps): Promise<AskAssistResult> {
  let rung: string | null = null
  try { rung = await deps.rung() } catch { rung = null }
  if (rung !== ASSIST) return { read, rung, drafted: 0, notes: [] }
  const urls: Record<number, string> = {}
  const notes: string[] = []
  for (const d of draftableAsks(read, details)) {
    let made: { url: string } | null = null
    try { made = await deps.draft({ to: d.to, subject: d.subject, body: d.body }) } catch { made = null }
    if (!made?.url) { notes.push(`ask_${d.index}_not_drafted`); continue }
    urls[d.index] = made.url
    if (d.suggestion_id && deps.record) {
      try { await deps.record(d.suggestion_id, made.url) } catch { notes.push(`ask_${d.index}_outcome_not_recorded`) }
    }
  }
  return { read: withAskDrafts(read, urls), rung, drafted: Object.keys(urls).length, notes }
}

// ── Live wiring ─────────────────────────────────────────────────────────────

/** The surface's rung from the ladder. Missing table, missing row or an error
 *  all read as null, which drafts nothing. */
export async function readAskRung(db: { from: (t: string) => any }): Promise<string | null> {
  const { data, error } = await db.from('autonomy_ladder').select('rung').eq('surface', ASK_SURFACE).maybeSingle()
  if (error || !data) return null
  const rung = (data as { rung?: unknown }).rung
  return typeof rung === 'string' ? rung : null
}

/** The live dependencies: the ladder, Gmail through the service account, and
 *  the outcome ledger when the repository carries it. */
export function liveAskAssist(): AskAssistDeps {
  return {
    rung: async () => {
      const { supabase } = await import('./_supabase.js')
      return readAskRung(supabase)
    },
    draft: async (d) => {
      const { googleConfigured, createGmailDraft } = await import('./_google.js')
      if (!googleConfigured()) return null
      const gd = await createGmailDraft({ to: d.to, subject: d.subject, body: d.body })
      return gd ? { url: gd.url } : null
    },
    record: async (suggestion_id, url) => {
      // walkthrough_steps gains recordStepOutcome with the loop-closing change
      // (phase 2). Until it is there, the draft link lives on the read alone.
      const mod = await import('./_walkthrough.js') as unknown as {
        recordStepOutcome?: (i: { suggestion_id: string; title: string; outcome: string; note?: string; artifact?: string }) => Promise<unknown>
      }
      if (typeof mod.recordStepOutcome !== 'function') return
      await mod.recordStepOutcome({ suggestion_id, title: 'The ask', outcome: 'drafted', note: 'Drafted in Gmail at read time', artifact: url })
    },
  }
}
