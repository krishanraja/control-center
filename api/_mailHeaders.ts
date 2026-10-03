// Pure helpers for the relationship sync, kept apart from anything that
// touches the network or the database so they can be tested directly.
//
// MAIL_HEADERS is the privacy promise in code: the sync asks Gmail for these
// headers and nothing else, with format=metadata, so no body, subject line or
// snippet is ever fetched or stored. tests/api/relationshipSync.test.ts fails
// if a Subject header or a fuller format ever appears.

/** Every address that is Krish. A message from one of these is outbound. */
export const SELF = new Set([
  'krish@mindmake.co', 'krish@themindmaker.ai', 'hello@krishraja.com', 'krishanraja@gmail.com',
])

/** The only headers ever requested. List-Unsubscribe and Precedence mark bulk
 *  mail, which says nothing about a relationship. */
export const MAIL_HEADERS = ['From', 'To', 'Cc', 'Date', 'List-Unsubscribe', 'Precedence', 'Auto-Submitted']

/** Machine senders. A reply from a notifications address is not a person. */
export const AUTOMATED = /(^|[._+-])(no-?reply|do-?not-?reply|notifications?|notify|mailer-daemon|postmaster|bounce|alerts?|calendar-notification|invitations?|billing|receipts?|newsletter|digest)([._+-]|@)/i

/** "Jane Doe <Jane@Acme.com>, bob@x.io" into [{ email, name }]. */
export function parseAddresses(header: string | undefined): { email: string; name?: string }[] {
  if (!header) return []
  const out: { email: string; name?: string }[] = []
  for (const part of header.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)) {
    const m = part.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/) || part.match(/^\s*()([^\s<>]+@[^\s<>]+)\s*$/)
    if (!m) continue
    const email = m[2].trim().toLowerCase()
    if (!email.includes('@')) continue
    const name = m[1].trim() || undefined
    out.push({ email, name })
  }
  return out
}

export function isAutomated(email: string): boolean {
  return AUTOMATED.test(email)
}

