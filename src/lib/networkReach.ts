// How to actually reach someone, as opposed to how the intelligence layer says
// they should be approached.
//
// Those are not the same thing, and the gap is large enough to break a feature
// built on the wrong one. Measured against the corpus:
//
//   368 people carry best_channel 'phone'        no phone number is stored anywhere
//   198 people carry best_channel 'instagram_dm' no handle is stored anywhere
//   ~1,200 carry best_channel 'email'            with no email address on the row
//
// `best_channel` and `reachable_via` are a JUDGMENT about the right way in.
// They were never a promise that an address exists. So a "contact them" button
// driven straight off best_channel would be dead for several thousand people,
// and dead in the least visible way: the button renders, the tap does nothing.
//
// This resolves the other way round. Start from the addresses actually on the
// record, then let best_channel ORDER them. What comes back is only ever
// something a tap can complete, and when the recommended channel is not one of
// them that fact is returned rather than hidden.

export type ChannelId =
  | 'email' | 'linkedin_dm' | 'instagram_dm' | 'phone' | 'twitter'
  /** Not an address. A pre-filled LinkedIn people-search for someone we hold no
   *  profile URL for. See linkedinSearchHref. */
  | 'linkedin_search'

export interface ReachOption {
  channel: ChannelId
  /** Button text. "Email", "LinkedIn", "X". */
  label: string
  /** The address itself, shown so it can be read and copied, not just fired. */
  address: string
  href: string
  /** Opens a new tab rather than handing off to a native app. */
  external: boolean
  /** This is the channel the intelligence layer recommends. */
  recommended: boolean
  /** True when this lands on a SEARCH for the person rather than on the person.
   *  Rendered differently, and never counted as a verified identity. */
  speculative?: boolean
  /** Set when the address exists but nobody has confirmed it answers — a
   *  pattern guess from a company domain. The tap still works; the label says
   *  what it is. */
  unverified?: boolean
}

export interface ReachInput {
  email?: string | null
  linkedin_url?: string | null
  twitter_handle?: string | null
  best_channel?: string | null
  reachable_via?: string[] | null
  /** Name and company, used ONLY to build the LinkedIn search fallback. Without
   *  them there is no fallback: a people-search with no keywords is a link to
   *  nothing, which is precisely the dead button this module exists to prevent. */
  full_name?: string | null
  company?: string | null
  /** A pattern-guessed address (company domain + name convention). Never
   *  promoted to `email`, never written to email_normalized, and therefore
   *  structurally invisible to every bulk-send path. Surfaced here as a
   *  one-tap-and-labelled option, which is Krish's call: 150 of these came in
   *  with the Circle rosters and a guess he can see is worth more than an
   *  address he cannot. */
  guessed_email?: string | null
}

export interface Reach {
  /** Everything that can actually be acted on, best first. */
  options: ReachOption[]
  /** The one to put under the thumb. Never the search fallback: a speculative
   *  link must not be the primary action on a person we can genuinely email.
   *  Null when there is nothing real to act on. */
  best: ReachOption | null
  /** The LinkedIn route, whichever kind it is — the profile when we hold one,
   *  the people-search when we do not. This is what makes the LinkedIn button
   *  unconditional at the call site instead of every caller re-deriving it.
   *  Null only when there is neither a URL nor a name to search on. */
  linkedin: ReachOption | null
  /** Why the recommended channel is not in `options`, when it is not. Rendered
   *  as a note, because "we think phone, we have no number" is useful and a
   *  silently different button is not. */
  note: string | null
}

const CHANNEL_LABEL: Record<string, string> = {
  email: 'Email',
  linkedin_dm: 'LinkedIn',
  instagram_dm: 'Instagram',
  phone: 'Phone',
  twitter: 'X',
  linkedin_search: 'Find on LinkedIn',
}

/** Channels the intelligence layer can recommend but this database has nowhere
 *  to store an address for. Named explicitly so the note can say which. */
const NO_ADDRESS_COLUMN: Record<string, string> = {
  phone: 'no number is recorded',
  instagram_dm: 'no handle is recorded',
}

/** Preference order when nothing is recommended, or when the recommendation is
 *  not actionable. Email first: it is the only channel that can carry a real
 *  message rather than a connection request. */
const FALLBACK_ORDER: ChannelId[] = ['email', 'linkedin_dm', 'twitter', 'linkedin_search']

function linkedinHref(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url.replace(/^\/+/, '')}`
}

/**
 * The LinkedIn button that can never be missing.
 *
 * 5,827 of 10,768 contacts hold no LinkedIn URL, and no amount of enrichment
 * will ever make that number zero. "One click to their LinkedIn, mandatory" is
 * therefore not a data problem to be finished — it is a rendering decision, and
 * there are only two honest options: show nothing for more than half the
 * network, or hand over the search that gets there in one tap.
 *
 * This is the second. It is marked `speculative` and labelled "Find on
 * LinkedIn" everywhere it renders, because the failure it must not cause is
 * Krish believing a profile was verified when it was guessed at by name.
 *
 * Name plus company, because name alone is ambiguous at this scale and the
 * company is what makes the first result the right one.
 */
export function linkedinSearchHref(name?: string | null, company?: string | null): string | null {
  const keywords = [name, company].map(v => (v || '').trim()).filter(Boolean).join(' ')
  if (!keywords) return null
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keywords)}`
}

/** Strip the scheme and any trailing slash so a LinkedIn URL reads as an
 *  identity rather than as a link. */
function prettyUrl(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '')
}

export function resolveReach(p: ReachInput): Reach {
  const options: ReachOption[] = []
  const best = (p.best_channel || '').trim()

  const email = (p.email || '').trim()
  if (email) {
    options.push({
      channel: 'email', label: CHANNEL_LABEL.email, address: email,
      href: `mailto:${email}`, external: false, recommended: best === 'email',
    })
  }

  const li = (p.linkedin_url || '').trim()
  if (li) {
    options.push({
      channel: 'linkedin_dm', label: CHANNEL_LABEL.linkedin_dm, address: prettyUrl(li),
      href: linkedinHref(li), external: true, recommended: best === 'linkedin_dm',
    })
  }

  // A guessed address is only offered when no verified one exists. Showing both
  // would present a choice where one option is strictly worse and neither is
  // labelled at the point of the tap.
  if (!email) {
    const guess = (p.guessed_email || '').trim()
    if (guess) {
      options.push({
        channel: 'email', label: CHANNEL_LABEL.email, address: guess,
        href: `mailto:${guess}`, external: false, recommended: false, unverified: true,
      })
    }
  }

  const tw = (p.twitter_handle || '').trim().replace(/^@/, '')
  if (tw) {
    options.push({
      channel: 'twitter', label: CHANNEL_LABEL.twitter, address: `@${tw}`,
      href: `https://x.com/${tw}`, external: true, recommended: false,
    })
  }

  // The search fallback, and only when there is no real profile to link. It is
  // appended AFTER everything real, and sorts last, so it can never displace an
  // address as the primary action.
  if (!li) {
    const search = linkedinSearchHref(p.full_name, p.company)
    if (search) {
      options.push({
        channel: 'linkedin_search', label: CHANNEL_LABEL.linkedin_search,
        address: [p.full_name, p.company].filter(Boolean).join(' · '),
        href: search, external: true, recommended: false, speculative: true,
      })
    }
  }

  // The recommendation orders the list; it never adds to it.
  //
  // Certainty outranks channel preference. Email is the preferred channel and a
  // pattern-guessed address is still an email, so without this rule a guess
  // would be promoted over a verified LinkedIn profile and become the primary
  // button — the highlighted one, the one tapped without reading. Confidence in
  // what we hold comes first; only then does the channel order apply.
  const rank = (o: ReachOption) => (o.speculative ? 2 : o.unverified ? 1 : 0)
  options.sort((a, b) => {
    if (a.recommended !== b.recommended) return a.recommended ? -1 : 1
    if (rank(a) !== rank(b)) return rank(a) - rank(b)
    return FALLBACK_ORDER.indexOf(a.channel) - FALLBACK_ORDER.indexOf(b.channel)
  })

  // A list containing nothing but the search fallback is, for the purposes of
  // "can I actually reach this person", still empty — and the note has to say
  // so rather than let a speculative link pass as contact details.
  const actionable = options.filter(o => !o.speculative)

  let note: string | null = null
  if (!actionable.length) {
    note = best
      ? `Best channel on file is ${CHANNEL_LABEL[best] || best}, but no address for it is recorded.`
      : 'No contact details on file for this person.'
  } else if (best && !actionable.some(o => o.recommended)) {
    // The interesting case: we CAN reach them, just not the recommended way.
    // Saying so is what stops the operator assuming the button in front of them
    // is the approach the intelligence layer endorsed.
    const why = NO_ADDRESS_COLUMN[best] || 'no address for it is recorded'
    note = `Best channel on file is ${CHANNEL_LABEL[best] || best}, but ${why}.`
  }

  return {
    options,
    best: actionable[0] || null,
    linkedin: options.find(o => o.channel === 'linkedin_dm' || o.channel === 'linkedin_search') || null,
    note,
  }
}
