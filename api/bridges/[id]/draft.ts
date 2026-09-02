import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guard } from '../../_auth.js'
import { supabase } from '../../_supabase.js'
import { googleConfigured, createGmailDraft } from '../../_google.js'

// Put a bridge's draft in Krish's own mailbox, ready for him to read, edit and
// send himself.
//
// This route creates a Gmail DRAFT and nothing else. It deliberately does not
// import sendGmail, so there is no code path here that can put a message in
// front of another human: the draft sits in his drafts folder until he presses
// send in Gmail. That is the whole contract of this system, and it is enforced
// by what this file can reach rather than by intent.

export const config = { maxDuration: 30 }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

  const [{ data: contact }, { data: role }] = await Promise.all([
    bridge.contact_key
      ? supabase.from('network_contacts')
          .select('full_name, email, current_company')
          .eq('contact_key', bridge.contact_key).maybeSingle()
      : Promise.resolve({ data: null }),
    bridge.job_id
      ? supabase.from('hunter_seen_roles')
          .select('company, title, url').eq('job_id', bridge.job_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const who = contact?.full_name || 'the contact'
  const roleLine = role ? `${role.title} at ${role.company}` : 'a role'
  const subject = contact?.full_name
    ? `Intro ask: ${who} re ${roleLine}`
    : `Draft ask re ${roleLine}`

  // The draft carries the context Krish needs to judge it before sending: who
  // it is for, which role it is about, and the posting.
  const body = [
    draft,
    '',
    '---',
    `For: ${who}${contact?.current_company ? ` at ${contact.current_company}` : ''}`,
    `Role: ${roleLine}`,
    role?.url ? `Posting: ${role.url}` : '',
    contact?.email
      ? `Their address: ${contact.email} (not filled in above on purpose)`
      : 'No email on file for them.',
    '',
    'Drafted by hunter. Nothing has been sent.',
  ].filter(Boolean).join('\n')

  // Addressed to Krish, never to the contact. He decides who receives it and
  // types the address himself, so a mis-click in Gmail cannot reach them.
  const to = process.env.OPERATOR_EMAIL || 'krishanraja@gmail.com'
  const created = await createGmailDraft({ to, subject, body })
  if (!created) {
    return res.status(502).json({
      ok: false,
      error: 'Gmail refused the draft; check the gmail.compose scope',
    })
  }
  return res.status(200).json({ ok: true, draft: created })
}
