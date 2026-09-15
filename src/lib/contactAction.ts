// One click to contact a suggested person, whoever they are.
//
// Krish 2026-09-15: "every network suggestion in controlcenter should be oneclick
// to contact them." Before this, a suggestion offered "Draft in Gmail", which is a
// server round trip that produces nothing at all when there is no email on record,
// and the LinkedIn profile was a link on the person's name that carried none of the
// draft with it. Two half-channels, neither of them one click.
//
// So the channel is decided from what is actually known about the person, the draft
// travels with the click every time, and the button says which channel it will use
// before it is pressed. Nothing here sends: mailto opens his own client with the
// message waiting, and LinkedIn opens the profile with the draft on his clipboard.

export type ContactKind = 'email' | 'linkedin' | 'clipboard'

export interface ContactTarget {
  name?: string | null
  email?: string | null
  linkedin_url?: string | null
}

export interface ContactAction {
  kind: ContactKind
  label: string
  /** What the click opens, empty for clipboard only. */
  href: string
  /** Put the draft on the clipboard as well as opening href. */
  copies: boolean
  /** Said in the toast after the click, so nothing about it is a surprise. */
  note: string
}

function firstName(name?: string | null): string {
  return (name || '').trim().split(/\s+/)[0] || 'them'
}

/** A subject a human would write, not "Opportunity". */
export function subjectFor(role?: string | null, company?: string | null): string {
  if (role && company) return `${role} at ${company}`
  if (company) return `${company}`
  return 'Quick question'
}

export function contactAction(
  person: ContactTarget,
  draft: string,
  opts: { role?: string | null; company?: string | null } = {},
): ContactAction {
  const who = firstName(person.name)
  const email = (person.email || '').trim()
  if (email) {
    const subject = encodeURIComponent(subjectFor(opts.role, opts.company))
    const body = encodeURIComponent(draft || '')
    return {
      kind: 'email',
      label: `Email ${who}`,
      href: `mailto:${email}?subject=${subject}&body=${body}`,
      copies: false,
      note: `Opening your mail client to ${email}, message ready. Nothing sent.`,
    }
  }
  const li = (person.linkedin_url || '').trim()
  if (li.startsWith('http')) {
    return {
      kind: 'linkedin',
      // Named so he knows the message is not already in the box: LinkedIn has no
      // prefill, so the honest promise is profile open, draft copied.
      label: `LinkedIn ${who}`,
      href: li,
      copies: true,
      note: 'Draft copied and the profile is open. Paste it into the message box.',
    }
  }
  return {
    kind: 'clipboard',
    label: 'Copy the draft',
    href: '',
    copies: true,
    note: `Draft copied. No email or profile on record for ${who}, so this one needs finding first.`,
  }
}

/** Clipboard write that degrades instead of throwing on an insecure origin. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
