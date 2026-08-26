// The step that was missing: an arc gets a lens and, where one honestly fits,
// a folder.
//
// Until 26 Aug this did not exist in any form. The six lenses, the eleven
// folders and the scorer were all built and all correct, and every one of the
// 54 live arcs carried lens null and theme_id null, so nothing downstream could
// run. The schema was a parallel universe beside the system that was actually
// serving the queue.
//
// ---------------------------------------------------------------------------
// Null is an answer, and it is the most important one
//
// The old vocabulary had nine areas that between them covered everything, so
// nothing was ever rejected at the classification step and the queue filled
// with governance and org stories nobody wanted. The six lenses deliberately do
// not cover everything. An arc that fits none is DISCARDED.
//
// The prompt below says that three times, because a model asked to pick from a
// list will pick from the list. Measured on the 54-arc backfill: 26 classified,
// 28 discarded, which is 52 percent. The brief's rule is that a discard rate
// above roughly 60 percent is signal about the corpus rather than permission to
// widen the ontology, so this sits just inside it and is worth watching.
//
// ---------------------------------------------------------------------------
// Why folder matching cannot become a ranking input
//
// Folders are Krish's stated interests. Matching an arc to one is a filing
// decision and is safe. Preferring an arc BECAUSE it matched is the anti-echo
// violation, and it is why the scorer reserves two of seven slots for arcs that
// matched nothing. Nothing in this file returns a score, and the prompt never
// asks which arcs are more interesting.
import { LENSES, LENS_SPEC, CHANNELS, isLens, isChannel, type Lens, type Channel } from './_lenses.js'

export interface ClassifiableArc {
  id: string
  title: string
  summary?: string | null
  implication?: string | null
  /** Recent beats, so the classifier reads what actually happened rather than
   *  only the arc's own headline, which is often the oldest framing of it. */
  beats?: string[]
}

export interface FolderRef {
  id: string
  slug: string
  question: string
  channel: Channel
}

export interface Classification {
  id: string
  lens: Lens | null
  channel: Channel | null
  theme_slug: string | null
  /** True only when the arc fits no existing folder AND names a question
   *  durable enough to run for a year. Judged on the arc, never on how much it
   *  resembles the folders that already exist. */
  plausible_new_theme: boolean
  reason: string
}

export function buildClassifyPrompt(arcs: ClassifiableArc[], folders: FolderRef[]) {
  const lensLines = LENSES.map(l =>
    `  ${l} — ${LENS_SPEC[l].covers} (usually ${LENS_SPEC[l].channel})`).join('\n')
  const folderLines = folders.map(f => `  ${f.slug} [${f.channel}] — ${f.question}`).join('\n')

  const system = [
    'You file editorial arcs. An arc is a running story with several independent pieces of evidence behind it.',
    '',
    'Give each arc exactly one lens from this closed list:',
    lensLines,
    '',
    'THE LIST DOES NOT COVER EVERYTHING, AND THAT IS DELIBERATE.',
    'Return lens null for any arc that does not clearly fit one. Null means discarded, and it is the correct answer for a large share of input. Do not stretch a lens to fit.',
    'Specifically: regulation, compliance, board oversight, safety incidents, model releases, benchmark results, funding rounds, adoption statistics, workforce displacement and "enterprises are piloting X" all return null. They were the previous vocabulary and they select for the wrong stories.',
    'Expect to return null for roughly half. Returning a lens for everything is a failure, not thoroughness.',
    '',
    'Then, only if it genuinely belongs, file the arc under one of these tracked questions:',
    folderLines,
    '',
    'Return theme_slug null when none fits. Null is common and carries no penalty: an arc that matches no tracked question is not worse, it is unfamiliar, and unfamiliar arcs have reserved space downstream. Never pick the nearest folder to avoid a null.',
    'Set plausible_new_theme true only when the arc matches no folder AND names a question specific enough to still be running in a year. "AI is changing things" is not one.',
    '',
    'Return JSON only: {"items":[{"id":"...","lens":null,"channel":null,"theme_slug":null,"plausible_new_theme":false,"reason":"one short sentence"}]}',
    'reason must say why, and for a null lens it must name what kind of story it is instead.',
  ].join('\n')

  const user = arcs.map(a => [
    `id: ${a.id}`,
    `title: ${a.title}`,
    a.summary ? `summary: ${a.summary}` : null,
    a.implication ? `implication: ${a.implication}` : null,
    a.beats?.length ? `recent beats:\n${a.beats.slice(0, 6).map(b => `  - ${b}`).join('\n')}` : null,
  ].filter(Boolean).join('\n')).join('\n\n---\n\n')

  return { system, user }
}

/** Coerces model output to the closed vocabularies. Anything unrecognised
 *  becomes null rather than being passed through, because a bad lens reaches
 *  Postgres as a CHECK violation inside a cron with no obvious cause. */
export function parseClassification(raw: unknown, known: Set<string>): Classification[] {
  const items = (raw as any)?.items
  if (!Array.isArray(items)) return []
  const out: Classification[] = []
  for (const it of items) {
    const id = typeof it?.id === 'string' ? it.id : null
    if (!id) continue
    const lens = isLens(it?.lens) ? it.lens : null
    // Channel follows the lens when the lens pins one, which most do. Only
    // category_positioning is 'either', and there the model's read is used.
    let channel: Channel | null = null
    if (lens) {
      const pinned = LENS_SPEC[lens].channel
      channel = pinned === 'either'
        ? (isChannel(it?.channel) ? it.channel : null)
        : pinned
    }
    const slug = typeof it?.theme_slug === 'string' && known.has(it.theme_slug) ? it.theme_slug : null
    out.push({
      id,
      lens,
      channel,
      // A folder on a discarded arc is meaningless: it was never going to surface.
      theme_slug: lens ? slug : null,
      plausible_new_theme: Boolean(lens) && !slug && it?.plausible_new_theme === true,
      reason: typeof it?.reason === 'string' ? it.reason.slice(0, 400) : '',
    })
  }
  return out
}

/** Share of arcs the classifier threw away. Above roughly 0.6 the corpus is
 *  wrong, not the ontology, and the sources are what should change. */
export const DISCARD_ALARM = 0.6
export const discardRate = (c: Classification[]): number =>
  c.length === 0 ? 0 : c.filter(x => x.lens === null).length / c.length

export { LENSES, CHANNELS }
