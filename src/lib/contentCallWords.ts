/**
 * How the Content tab says a day, a count and a piece's parts in words.
 *
 * The decisions themselves come from src/lib/contentModel.ts (todaysCalls,
 * weekSlots, pipeline). This file only turns their answers into the sentences
 * a call card prints, so the phone card and the desk's reading pane spell a
 * date, a due line and a prediction the same way.
 *
 * Every date here is a calendar day, YYYY-MM-DD in UTC, the same calendar the
 * engine's series days are kept on.
 */
import { callSectionOf, displayThesis, type IdeaInput } from './contentModel'
import { ladderVerdict } from './ladder'
import { clearsAtNextPurge, nextPurgeRun } from './purgeClock'

const DAY_MS = 86_400_000

function at(ymd: string): Date {
  return new Date(`${ymd}T00:00:00Z`)
}

/** Whole days from `from` to `to`, both YYYY-MM-DD. */
export function daysBetween(from: string, to: string): number {
  return Math.round((at(to).getTime() - at(from).getTime()) / DAY_MS)
}

/** "Monday 5 Oct". */
export function longDay(ymd: string): string {
  return at(ymd).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })
}

/** "Mon 5 Oct". */
export function shortDay(ymd: string): string {
  const d = at(ymd)
  const wd = d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })
  return `${wd} ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}`
}

/** "Monday". */
export function weekdayOf(ymd: string): string {
  return at(ymd).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })
}

/** "today", "tomorrow", "on Wednesday", "on Wednesday 14 Oct". */
export function whenWords(ymd: string, today: string): string {
  const n = daysBetween(today, ymd)
  if (n === 0) return 'today'
  if (n === 1) return 'tomorrow'
  if (n > 1 && n < 7) return `on ${weekdayOf(ymd)}`
  return `on ${longDay(ymd)}`
}

const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve']

/** "Six", or the figure past twelve. Capitalised: lower-case it mid-sentence. */
export function numberWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n)
}

/**
 * When the weekly clear-out next runs, in ms: Monday 14:00 UTC, the same
 * clock the purge itself runs on (src/lib/purgeClock.ts). On a Monday before
 * 14:00 it is this afternoon; from 14:00 it is the Monday after.
 */
export function clearOutEnd(now: Date | number): number {
  return nextPurgeRun(now).getTime()
}

/** Whether Monday's clear-out removes this piece if nobody picks it. */
export function clearsOutMonday(idea: Pick<IdeaInput, 'expires_at'>, now: Date | number): boolean {
  return clearsAtNextPurge(idea.expires_at, now)
}

const CONFIDENCE_LINE = /(How sure we are|\bConfidence):[^\n]*/gi

/**
 * The prediction a piece makes, as one plain paragraph, or null.
 *
 * Read from the same section the engine's publish check reads
 * (callSectionOf), with the "How sure we are" label taken out, since the card
 * asks for that number separately.
 */
export function predictionText(body: string | null | undefined): string | null {
  const section = callSectionOf(String(body ?? '').replace(/\r\n?/g, '\n'))
  if (section == null) return null
  const text = section
    .replace(CONFIDENCE_LINE, '')
    .replace(/^\*\*(The Call|Our prediction)\.?\*\*\s*/im, '')
    .replace(/\*\*|__|`/g, '')
    .split(/\n\s*\n/)
    .map(p => p.replace(/\s+/g, ' ').trim())
    .find(p => p.length > 0)
  return text || null
}

/** What a ready piece argues, whole or not at all: the stored thesis, or the
 *  angle the engine expanded it to when the thesis is missing or cut off. */
export function argumentOf(idea: Pick<IdeaInput, 'thesis' | 'meta'>): string | null {
  const thesis = displayThesis(idea)
  if (thesis) return thesis
  const angle = ladderVerdict(idea)?.expansion.angle
  return displayThesis({ thesis: angle ?? null })
}

/** The sites a piece's sources come from, for a quiet mono line. */
export function sourceDomains(idea: { meta?: Record<string, any> | null; source_url?: string | null }): string[] {
  const urls: unknown[] = [
    ...(Array.isArray(idea.meta?.sources) ? idea.meta!.sources : []),
    ...(idea.source_url ? [idea.source_url] : []),
  ]
  const out: string[] = []
  for (const u of urls) {
    if (typeof u !== 'string') continue
    try {
      const host = new URL(u).hostname.replace(/^www\./, '')
      if (host && !out.includes(host)) out.push(host)
    } catch { /* not a URL: left out rather than printed */ }
  }
  return out
}
