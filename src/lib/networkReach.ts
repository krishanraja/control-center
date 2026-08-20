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

export type ChannelId = 'email' | 'linkedin_dm' | 'instagram_dm' | 'phone' | 'twitter'

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
}

export interface ReachInput {
  email?: string | null
  linkedin_url?: string | null
  twitter_handle?: string | null
  best_channel?: string | null
  reachable_via?: string[] | null
}

export interface Reach {
  /** Everything that can actually be acted on, best first. */
  options: ReachOption[]
  /** The one to put under the thumb. Null when there is nothing to act on. */
  best: ReachOption | null
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
const FALLBACK_ORDER: ChannelId[] = ['email', 'linkedin_dm', 'twitter']

function linkedinHref(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url.replace(/^\/+/, '')}`
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

  const tw = (p.twitter_handle || '').trim().replace(/^@/, '')
  if (tw) {
    options.push({
      channel: 'twitter', label: CHANNEL_LABEL.twitter, address: `@${tw}`,
      href: `https://x.com/${tw}`, external: true, recommended: false,
    })
  }

  // The recommendation orders the list; it never adds to it.
  options.sort((a, b) => {
    if (a.recommended !== b.recommended) return a.recommended ? -1 : 1
    return FALLBACK_ORDER.indexOf(a.channel) - FALLBACK_ORDER.indexOf(b.channel)
  })

  let note: string | null = null
  if (!options.length) {
    note = best
      ? `Best channel on file is ${CHANNEL_LABEL[best] || best}, but no address for it is recorded.`
      : 'No contact details on file for this person.'
  } else if (best && !options.some(o => o.recommended)) {
    // The interesting case: we CAN reach them, just not the recommended way.
    // Saying so is what stops the operator assuming the button in front of them
    // is the approach the intelligence layer endorsed.
    const why = NO_ADDRESS_COLUMN[best] || 'no address for it is recorded'
    note = `Best channel on file is ${CHANNEL_LABEL[best] || best}, but ${why}.`
  }

  return { options, best: options[0] || null, note }
}
