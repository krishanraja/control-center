import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guard } from '../../_auth.js'
import { supabase } from '../../_supabase.js'
import { googleConfigured, createGmailDraft } from '../../_google.js'

// Put a bridge's draft in Krish's own Gmail drafts, written to the contact and
// addressed to them, ready for him to read, edit and send himself.
//
// This route creates a Gmail DRAFT and nothing else. It deliberately does not
// import sendGmail, so there is no code path here that can put a message in
// front of another human: the draft sits in his drafts folder until he presses
// send in Gmail. That is the whole contract of this system, and it is enforced
// by what this file can reach rather than by intent.
//
// Krish's ruling 2026-09-03: the draft is addressed to the person, and the
// subject and body are written to them, not to him. When no email is on record
// the To line is left blank and the response says so, rather than guessing.

export const config = { maxDuration: 30 }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function firstName(full: string | null | undefined, first: string | null | undefined): string {
  if (first && first.trim()) return first.trim()
  return String(full || '').trim().split(/\s+/)[0] || ''
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // guard returns true when it has already answered the request.
  if (guard(req, res, ['POST'])) return

  const id = typeof req.query.id === 'string' ? req.query.id : ''
  if (!UUID.test(id)) return res.status(400).json({ ok: false, error: 'invalid_id' })

  if (!googleConfigured()) {
    return res.status(503).json({
      ok: false,
      error: 'Google is not configured on the server, so no draft can be created',
    })
  }

  const { data: bridge, error } = await supabase
    .from('bridge_candidates')
    .select('bridge_id, job_id, contact_key, draft_ask, path_tier')
    .eq('bridge_id', id)
    .maybeSingle()
  if (error) return res.status(500).json({ ok: false, error: error.message.slice(0, 200) })
  if (!bridge) return res.status(404).json({ ok: false, error: 'bridge not found' })

  const draft = String(bridge.draft_ask || '').trim()
  if (!draft) {
    return res.status(400).json({ ok: false, error: 'this bridge has no draft to send' })
  }

  const isPerson = !!bridge.contact_key && !bridge.contact_key.includes(':')
  const [{ data: contact }, { data: role }] = await Promise.all([
    isPerson
      ? supabase.from('network_contacts')
          .select('full_name, first_name, email, contact_id, current_company')
          .eq('contact_key', bridge.contact_key).maybeSingle()
      : Promise.resolve({ data: null }),
    bridge.job_id
      ? supabase.from('hunter_seen_roles')
          .select('company, title').eq('job_id', bridge.job_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  // The LinkedIn export rarely carries an address. The contacts table, joined
  // by contact_id, is the second place to look before giving up.
  let email: string | null = contact?.email ? String(contact.email).trim() : null
  if (!email && contact?.contact_id) {
    const { data: linked } = await supabase
      .from('contacts').select('email').eq('id', contact.contact_id).maybeSingle()
    if (linked?.email) email = String(linked.email).trim()
  }

  const name = contact?.full_name ? String(contact.full_name) : ''
  const greeting = firstName(name, contact?.first_name)
  const subject = role ? `${role.title} at ${role.company}` : 'A quick steer'

  // Exactly what the person will read: a greeting, the ask, his name. No
  // notes to Krish in the body; those go back to the screen instead.
  const body = [greeting ? `${greeting},` : '', greeting ? '' : null, draft, '', 'Krish']
    .filter(line => line !== null)
    .join('\n')

  const created = await createGmailDraft({ to: email || '', subject, body })
  if (!created) {
    return res.status(502).json({
      ok: false,
      error: 'Gmail refused the draft; check the gmail.compose scope',
    })
  }
  return res.status(200).json({ ok: true, draft: created, to: email, name: name || null })
}
