// The nine formats Krish actually writes in, and what the ranked slate says
// about each one.
//
// These came out of the ranker artifact of 27 Aug 2026: forty generated ideas,
// each assigned a format by the generator, each then ruled lead / yes / maybe /
// no by Krish. Until now the repo had no format vocabulary at all, so the only
// place a format existed was as free text inside that one HTML file.
//
// ---------------------------------------------------------------------------
// Form, not subject
//
// The anti-echo rule says a stated interest must never boost a candidate's
// rank, and seventeen approvals are the most concentrated statement of interest
// this system has. So the slate record lives HERE, on the shape of the piece,
// and deliberately not in scoreArc(). Which shape of piece Krish finishes is a
// fact about him as a writer. Which subject he approves of is exactly the thing
// the proposer is supposed to be able to surprise him about.
//
// The counts are small. Nine formats across forty items averages four items
// each, so treat conversion as a direction and not a measurement, which is why
// nothing here deletes a format for scoring badly.
// ---------------------------------------------------------------------------

/** Not to be confused with The Teardown advisory engagement in
 *  docs/MINDMAKER_OS_ARCHITECTURE.md. Same words, unrelated thing. */
export const FORMATS = [
  'Follow the Money',
  'The Receipt',
  'One Number',
  'The Lag',
  'How It Actually Works',
  "Nobody's Taken This",
  'The Threshold',
  'The Word For It',
  'The Teardown',
] as const

export type Format = typeof FORMATS[number]

export type SlateRecord = { lead: number; yes: number; maybe: number; no: number }

export type FormatSpec = {
  covers: string
  /** Every format in the slate ran to one outlet only, with no overlap. */
  outlet: 'Substack' | 'Shorts'
  /** True when the format may only present a beat inside a surfaced arc, and
   *  may never be the reason a proposal exists. */
  arcOnly?: boolean
  /** Nothing approved in the slate. Kept and flagged rather than deleted:
   *  deleting it would erase the finding, and four items is not a verdict. */
  underReview?: boolean
  /** Krish's rulings on the items the generator gave this format. */
  slate: SlateRecord
}

export const FORMAT_SPEC: Record<Format, FormatSpec> = {
  'Follow the Money': {
    covers: 'trace who pays whom and what the flow reveals about the position each side is in',
    outlet: 'Substack',
    slate: { lead: 1, yes: 2, maybe: 3, no: 1 },
  },
  'The Receipt': {
    covers: 'one disclosed number taken apart until it says something the discloser did not intend',
    outlet: 'Substack',
    slate: { lead: 0, yes: 1, maybe: 2, no: 2 },
  },
  'One Number': {
    covers: 'a single figure and the one thing it settles',
    outlet: 'Shorts',
    // The most useful single result in the slate. One Number ran 2 yes and 2 no,
    // and the split is not about the format:
    //
    //   M10, M13   yes   both beats of "The price of done", a seven-item arc
    //   M04, M07   no    both beats of "The unwritten bargain", where the
    //                    number stood on its own
    //
    // So the format survives when it presents a beat of an arc that is already
    // running, and dies when the number IS the proposal. That is the arc rule
    // arriving from Krish's own judgement rather than from the brief, which is
    // why the earlier note in 2026-08-27-arcs-and-beats.sql calling One Number
    // "retired" was too broad. Retired as a proposal, kept as a presentation.
    arcOnly: true,
    slate: { lead: 0, yes: 2, maybe: 1, no: 2 },
  },
  'The Lag': {
    covers: 'the gap between when something became true and when anyone priced it',
    outlet: 'Substack',
    // 0 of 4. The lowest of the nine, and the only one with no approval at all.
    // Two of the four (M09, M20) are single events wearing a time comparison,
    // which is the same failure One Number has without an arc.
    underReview: true,
    slate: { lead: 0, yes: 0, maybe: 2, no: 2 },
  },
  'How It Actually Works': {
    covers: 'the mechanism under something everyone refers to and nobody has opened',
    outlet: 'Shorts',
    slate: { lead: 0, yes: 2, maybe: 2, no: 0 },
  },
  "Nobody's Taken This": {
    covers: 'a position that is available, and what it would cost to take it',
    outlet: 'Shorts',
    slate: { lead: 0, yes: 1, maybe: 1, no: 1 },
  },
  'The Threshold': {
    covers: 'a cost or barrier that moved, and what became possible on the other side of it',
    outlet: 'Substack',
    slate: { lead: 0, yes: 3, maybe: 2, no: 0 },
  },
  'The Word For It': {
    covers: 'naming a thing people keep describing the long way round',
    outlet: 'Shorts',
    // 3 of 3, the only clean sweep. Small sample, but it is also the format
    // closest to what the brief calls the taxonomy being the product.
    slate: { lead: 0, yes: 3, maybe: 0, no: 0 },
  },
  'The Teardown': {
    covers: 'a system taken apart in public, including his own',
    outlet: 'Substack',
    slate: { lead: 0, yes: 2, maybe: 2, no: 0 },
  },
}

export const isFormat = (v: unknown): v is Format =>
  typeof v === 'string' && (FORMATS as readonly string[]).includes(v)

export const slateJudged = (r: SlateRecord): number => r.lead + r.yes + r.maybe + r.no

/** Share of judged items Krish would publish. Returns null when nothing in the
 *  slate carried this format, so an absent record is never read as a zero. */
export const slateConversion = (f: Format): number | null => {
  const r = FORMAT_SPEC[f].slate
  const n = slateJudged(r)
  return n === 0 ? null : (r.lead + r.yes) / n
}

/** What the slate says about the two dimensions the proposer chooses before it
 *  has a subject: which channel, and how many of each. Recorded rather than
 *  applied, because acting on it is a decision about the content plan and not
 *  a scoring rule.
 *
 *  The generator produced 24 Money items to 16 Built. Krish approved 7 of the
 *  Money and 10 of the Built, so the channel that got half as much attention
 *  converted at more than twice the rate. */
export const SLATE_CHANNEL_RECORD: Record<'built' | 'paid', { generated: number; approved: number }> = {
  built: { generated: 16, approved: 10 },
  paid: { generated: 24, approved: 7 },
}
