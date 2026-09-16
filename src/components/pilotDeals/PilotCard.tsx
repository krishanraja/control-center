import { useEffect, useRef, useState } from 'react'
import { Check, ExternalLink, Inbox, Save, Sparkles, X } from '@/lib/icons'
import { useToast } from '../shared/Toast'
import { Working } from '../shared/Working'
import { Modal } from '../shared/Modal'
import { FocusedEditor } from '../shared/FocusedEditor'
import { ASK_LABEL, draftPilot, patchPilot, PILOT_STATE_LABEL } from '../../hooks/usePilots'
import { contactAction, copyText } from '../../lib/contactAction'
import type { PilotDealRow, PilotState } from '../../hooks/usePilots'

// One possible pilot customer. The card carries who they are, why they fit the
// face, the live reason for writing now (or the honest line that there is
// none), the draft when there is one, and exactly one primary action for
// the state it is in.
//
// There is no send button here and there never will be one. "I sent it" is
// Krish telling the OS what he did in Gmail.

interface Props {
  target: PilotDealRow
  onChanged: () => void
  /** A phone never edits text inside a dense layout (AGENTS.md). The draft
   *  body moves into a FocusedEditor sheet here; the desk keeps it inline,
   *  which is the right mechanics for a pointer and a wide row. */
  narrow?: boolean
}

/** The one primary action per state, and the state it moves to. */
const PRIMARY: Partial<Record<PilotState, { label: string; next: PilotState; done: string }>> = {
  drafted: { label: 'I sent it', next: 'sent', done: 'Marked sent. It counts on the scorecard.' },
  sent: { label: 'They replied', next: 'replied', done: 'Marked replied.' },
  replied: { label: 'Call booked', next: 'call_booked', done: 'Call booked.' },
  call_booked: { label: 'Call taken', next: 'call_taken', done: 'Call taken.' },
  call_taken: { label: 'Pilot booked', next: 'pilot_booked', done: 'Pilot booked. Well done.' },
}

const PRIMARY_CLASS =
  'flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-label font-semibold bg-amber-500/90 text-black hover:bg-amber-400 disabled:opacity-40 transition-colors'
const QUIET_CLASS =
  'flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-label font-medium border border-white/15 text-white/75 hover:bg-white/[0.06] disabled:opacity-40 transition-colors'

/**
 * The 90-day cliff public.intent_live_score applies, in the browser.
 *
 * Past it the ranker scores the person zero, so a quote it no longer counts
 * must not be shown here as a reason to write this week. Named once, pointed
 * at the SQL definition, and duplicated in api/_pilotDeals.ts for the server
 * side of the same rule.
 */
const INTENT_LIVE_DAYS = 90

/** Says out loud that nothing was found, rather than implying nothing exists.
 *  A deal listed before the intent pipeline ran has no stored quote and has
 *  not been drafted, which is not the same as a person with nothing to say. */
const NO_SIGNAL_LINE = 'No reason to write this week yet'

function whyNowFor(t: PilotDealRow): { signal: string; url: string; kind: 'researched' | 'published' } | null {
  // The researched trigger wins when present: it is the most recent read, and
  // it is what the draft in the row was actually written against.
  if (t.trigger_signal && t.trigger_source_url) {
    return { signal: t.trigger_signal, url: t.trigger_source_url, kind: 'researched' }
  }
  const quote = (t.intent_evidence || '').trim()
  const url = (t.intent_evidence_url || '').trim()
  if (!quote || !/^https?:\/\//i.test(url) || !t.last_post_at) return null
  const age = Date.now() - new Date(t.last_post_at).getTime()
  if (!Number.isFinite(age) || age > INTENT_LIVE_DAYS * 86_400_000) return null
  return { signal: quote, url, kind: 'published' }
}

export function PilotCard({ target: t, onChanged, narrow = false }: Props) {
  const { toast } = useToast()
  const [busy, setBusy] = useState<null | 'primary' | 'quiet' | 'save' | 'draft'>(null)
  // `body` is a local draft buffer over a row that refetches every 60s and
  // changes under us the moment "Draft it" lands. Seeding it once and never
  // resyncing meant a freshly generated draft rendered as an EMPTY box, which
  // then made "Save draft" appear (body !== draft_body) and write '' straight
  // over the draft the model had just produced. So: track what the server last
  // told us, and adopt a new server value whenever there is nothing unsaved to
  // lose.
  const [body, setBody] = useState(t.draft_body || '')
  const serverBody = useRef(t.draft_body || '')
  useEffect(() => {
    const next = t.draft_body || ''
    if (next === serverBody.current) return
    setBody(prev => (prev === serverBody.current ? next : prev))
    serverBody.current = next
  }, [t.draft_body])
  const [payOpen, setPayOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [cash, setCash] = useState('')

  const name = t.contact?.full_name || 'Unnamed contact'
  const personLine = [t.contact?.title, t.contact?.company].filter(Boolean).join(' at ')

  const move = async (next: PilotState, key: 'primary' | 'quiet', done: string, extra: { cash_gbp?: number } = {}) => {
    if (busy) return
    setBusy(key)
    try {
      await patchPilot(t.id, { state: next, ...extra })
      toast(done, 'success')
      onChanged()
    } catch (err) {
      toast(`Could not update: ${(err as Error)?.message || 'try again'}`, 'error')
    } finally {
      setBusy(null)
    }
  }

  const draftIt = async () => {
    if (busy) return
    setBusy('draft')
    try {
      const updated = await draftPilot(t.id)
      // Only claim Gmail when Gmail actually answered. The old toast said
      // "It is in your Gmail drafts too" unconditionally, including for a
      // contact with no email address, where createGmailDraft is never even
      // called and draft_url comes back null. The draft is still written and
      // still useful; it just lives here and on the clipboard.
      toast(
        updated?.draft_url
          ? 'Drafted, and it is in your Gmail drafts. Nothing was sent.'
          : 'Drafted. No Gmail draft for this one, so use the contact button. Nothing was sent.',
        'success',
      )
      onChanged()
    } catch (err) {
      const msg = (err as Error)?.message || ''
      toast(
        msg === 'google_not_configured'
          ? 'Google is not set up on the server, so no draft can be made yet.'
          : `Could not draft: ${msg || 'try again'}`,
        'error',
      )
    } finally {
      setBusy(null)
    }
  }

  /** The write itself, so the inline editor and the sheet share one path.
   *  Returns whether it landed, which is what FocusedEditor needs to decide
   *  whether to close. */
  const saveDraftText = async (text: string): Promise<boolean> => {
    try {
      await patchPilot(t.id, { draft_body: text })
      toast('Draft saved. Sending stays yours.', 'success')
      onChanged()
      return true
    } catch (err) {
      toast(`Could not save: ${(err as Error)?.message || 'try again'}`, 'error')
      return false
    }
  }

  const saveDraft = async () => {
    if (busy) return
    setBusy('save')
    await saveDraftText(body)
    setBusy(null)
  }

  const confirmPaid = async () => {
    const n = Number(cash)
    if (!Number.isFinite(n) || n <= 0) {
      toast('Enter the amount in pounds first.', 'error')
      return
    }
    setPayOpen(false)
    await move('pilot_paid', 'primary', `Paid. ${n.toLocaleString('en-GB')} GBP on the scorecard.`, { cash_gbp: n })
  }

  /**
   * The one way to act on a finished draft, whatever channel this person has.
   *
   * Before this the card rendered "Open in Gmail" only when draft_url existed,
   * and NOTHING otherwise. A contact with no email address - four of the ten
   * people currently eligible for this lane - got a written draft, an LLM call
   * spent on it, and no way to reach anyone. The draft sat in the row.
   *
   * Order of preference:
   *   1. A real Gmail draft, deep-linked to that draft (not the folder).
   *   2. contactAction(): mailto carrying the draft, or the LinkedIn profile
   *      with the draft on the clipboard, or the clipboard alone.
   *
   * contactAction is the PR #324 helper BridgeCard already uses; the click
   * shape below is copied from BridgeCard.contactNow so both lanes behave
   * identically.
   */
  const ContactButton = () => {
    if (t.draft_url) {
      return (
        <a
          href={t.draft_url}
          target="_blank"
          rel="noreferrer"
          data-testid="pilot-contact"
          onClick={e => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-label text-violet-300 hover:text-violet-200"
        >
          <Inbox size={12} />
          Open the draft in Gmail
        </a>
      )
    }
    const action = contactAction(
      { name: name, email: t.contact?.email ?? null, linkedin_url: t.contact?.linkedin_url ?? null },
      body,
      { role: t.contact?.title ?? null, company: t.contact?.company ?? null },
    )
    return (
      <button
        type="button"
        data-testid="pilot-contact"
        onClick={async e => {
          e.stopPropagation()
          if (action.copies) {
            const ok = await copyText(body)
            if (!ok) {
              toast('Could not reach the clipboard. Open the draft and copy it by hand.', 'error')
              return
            }
          }
          if (action.href) window.open(action.href, action.kind === 'email' ? '_self' : '_blank', 'noopener')
          toast(action.note, 'success')
        }}
        className="inline-flex items-center gap-1 text-label text-violet-300 hover:text-violet-200"
      >
        <Inbox size={12} />
        {action.label}
      </button>
    )
  }

  const primary = PRIMARY[t.state]
  const whyNow = whyNowFor(t)

  return (
    <article
      data-testid="pilot-card"
      className={`rounded-xl border border-violet-500/20 bg-violet-500/[0.04] hover:border-violet-500/35 transition-colors ${narrow ? 'p-3' : 'p-3.5'}`}
    >
      <div className="flex items-start justify-between gap-x-3 gap-y-1.5 flex-wrap">
        <div className="min-w-0 basis-40 grow">
          <h3 className="text-ui font-semibold text-white">
            {t.contact?.linkedin_url ? (
              <a
                href={t.contact.linkedin_url}
                target="_blank"
                rel="noreferrer"
                className="hover:text-violet-200 transition-colors"
                title="LinkedIn profile"
              >
                {name}
              </a>
            ) : name}
          </h3>
          {personLine && <p className="text-label text-white/55 mt-0.5">{personLine}</p>}
        </div>
        <span
          data-testid="pilot-state"
          className="shrink-0 text-micro px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-200"
        >
          {PILOT_STATE_LABEL[t.state]}
        </span>
      </div>

      {/* "Read first, rows second" (DESIGN_SYSTEM.md): the phone opens on the
          ask and the reason to write now, and folds the longer judgment under
          a disclosure. why_face runs to 600 characters and is the single
          tallest block on the card; on a 360 by 640 screen it alone pushed the
          card past the stage. The desk, which has the room, shows it open. */}
      {narrow ? (
        <details className="group mt-1.5">
          <summary className="flex cursor-pointer list-none items-baseline gap-2">
            <span className="text-label text-white/45 group-open:text-white/70">Why them</span>
            <span className="text-micro text-white/30 group-open:hidden">Show</span>
            <span className="hidden text-micro text-white/30 group-open:inline">Hide</span>
          </summary>
          <p className="text-label text-white/70 mt-1 leading-snug">{t.why_face}</p>
        </details>
      ) : (
        <p className="text-label text-white/70 mt-2">{t.why_face}</p>
      )}

      {/* What to ask THIS person. The lane ranked on warmth and never said what
          the ask was, so a close collaborator and a stranger read identically
          and neither card answered "what am I supposed to do with them". */}
      {t.ask_line && (
        <p data-testid="pilot-ask" className={`text-label text-white/80 ${narrow ? 'mt-1' : 'mt-1.5'}`}>
          {t.ask_kind && (
            <span className={`mr-1.5 text-micro px-1.5 py-0.5 rounded uppercase tracking-[0.14em] ${
              t.ask_kind === 'buyer'
                ? 'bg-emerald-500/15 text-emerald-200'
                : t.ask_kind === 'collaborator'
                  ? 'bg-amber-500/15 text-amber-200'
                  : 'bg-sky-500/15 text-sky-200'
            }`}>
              {ASK_LABEL[t.ask_kind]}
            </span>
          )}
          {t.ask_line}
        </p>
      )}

      {/* Why now, from whichever source actually has one.
          `trigger_signal` is written by the draft run, which researches the
          web. `intent_evidence` is a verbatim sentence the person published,
          checked against its source before storage by the intent pipeline and
          carried onto this deal when it was listed. Until 2026-09-16 the card
          read only the first, so a deal that had not been drafted yet said
          "No live trigger found" while a dated, cited quote sat in its own
          row. Both are cited-or-silent; neither is ever invented. */}
      {whyNow ? (
        <p data-testid="pilot-why-now" className="text-label text-white/70 mt-1.5">
          Why now: {whyNow.signal}
          <a
            href={whyNow.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 ml-1.5 text-violet-300 hover:text-violet-200"
          >
            <ExternalLink size={11} />
            {whyNow.kind === 'published' ? 'their post' : 'source'}
          </a>
        </p>
      ) : (
        <p className="text-label text-white/45 mt-1.5">{NO_SIGNAL_LINE}</p>
      )}

      {/* The draft, on a phone: the subject and one button, not a six row
          textarea. That textarea was the single biggest consumer of vertical
          space on this card and it already broke the house rule that a phone
          edits text in a sheet, above the keyboard, with one full-width Save.
          The desk keeps editing inline. */}
      {t.state === 'drafted' && narrow && (
        <div className="mt-2.5">
          {t.draft_subject && (
            <p className="text-label text-white/85 font-medium">{t.draft_subject}</p>
          )}
          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
            <button
              type="button"
              data-testid="pilot-edit-draft"
              onClick={() => setEditorOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-label font-medium border border-violet-500/30 text-violet-200 hover:bg-violet-500/10 transition-colors"
            >
              <Sparkles size={12} />
              Read the draft
            </button>
            <ContactButton />
          </div>
          <FocusedEditor
            open={editorOpen}
            onClose={() => setEditorOpen(false)}
            label={t.draft_subject || 'Draft email'}
            value={body}
            saveLabel="Save draft"
            onSave={async text => { setBody(text); return saveDraftText(text) }}
          />
        </div>
      )}

      {t.state === 'drafted' && !narrow && (
        <div className="mt-3">
          {t.draft_subject && (
            <p className="text-label text-white/85 font-medium mb-1">{t.draft_subject}</p>
          )}
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={6}
            aria-label="Draft body"
            className="w-full rounded-md border border-white/10 bg-white/[0.03] p-2 text-body text-white/85 focus:border-violet-500/40 focus:outline-none resize-y"
          />
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            {body !== (t.draft_body || '') && !(body.trim() === '' && (t.draft_body || '') !== '') && (
              <button
                type="button"
                onClick={saveDraft}
                disabled={busy !== null}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-label font-medium border border-violet-500/30 text-violet-200 hover:bg-violet-500/10 disabled:opacity-40 transition-colors"
              >
                {busy === 'save' ? <Working size={12} /> : <Save size={12} />}
                Save draft
              </button>
            )}
            <ContactButton />
          </div>
        </div>
      )}

      {t.state === 'pilot_paid' && typeof t.cash_gbp === 'number' && (
        <p className="text-label text-white/55 mt-2 tabular-nums">
          Invoiced {t.cash_gbp.toLocaleString('en-GB')} GBP.
        </p>
      )}

      <div className={`grid grid-cols-2 gap-2 sm:flex sm:items-center sm:flex-wrap ${narrow ? 'mt-2' : 'mt-3'}`}>
        {t.state === 'listed' && (
          <button
            type="button"
            data-testid="pilot-primary"
            onClick={draftIt}
            disabled={busy !== null}
            className={PRIMARY_CLASS}
            title="Finds a live signal, drafts the note in your voice, and puts it in your Gmail drafts. Nothing is sent."
          >
            {busy === 'draft' ? <Working size={12} /> : <Sparkles size={12} />}
            Draft it
          </button>
        )}
        {primary && (
          <button
            type="button"
            data-testid="pilot-primary"
            onClick={() => move(primary.next, 'primary', primary.done)}
            disabled={busy !== null}
            className={PRIMARY_CLASS}
          >
            {busy === 'primary' ? <Working size={12} /> : <Check size={12} />}
            {primary.label}
          </button>
        )}
        {t.state === 'pilot_booked' && (
          <button
            type="button"
            data-testid="pilot-primary"
            onClick={() => setPayOpen(true)}
            disabled={busy !== null}
            className={PRIMARY_CLASS}
          >
            {busy === 'primary' ? <Working size={12} /> : <Check size={12} />}
            Paid
          </button>
        )}
        {t.state === 'not_now' && (
          <button
            type="button"
            data-testid="pilot-primary"
            onClick={() => move('listed', 'primary', 'Back on the list.')}
            disabled={busy !== null}
            className={PRIMARY_CLASS}
          >
            {busy === 'primary' ? <Working size={12} /> : <Check size={12} />}
            Back to the list
          </button>
        )}
        {t.state !== 'not_now' && t.state !== 'pilot_paid' && (
          <button
            type="button"
            onClick={() => move('not_now', 'quiet', 'Parked. It can come back to the list later.')}
            disabled={busy !== null}
            className={QUIET_CLASS}
          >
            {busy === 'quiet' ? <Working size={12} /> : <X size={12} />}
            Not now
          </button>
        )}
      </div>

      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="Pilot paid"
        description="How much was invoiced, in pounds?"
        variant="center"
      >
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step={1}
          value={cash}
          onChange={e => setCash(e.target.value)}
          placeholder="15000"
          aria-label="Amount in GBP"
          className="w-full rounded-md border border-white/10 bg-white/[0.03] p-2 text-body text-white/85 focus:border-violet-500/40 focus:outline-none tabular-nums"
        />
        <div className="mt-3 flex items-center justify-end gap-2">
          <button type="button" onClick={() => setPayOpen(false)} className={QUIET_CLASS}>
            Cancel
          </button>
          <button type="button" onClick={confirmPaid} className={PRIMARY_CLASS}>
            <Check size={12} />
            Confirm paid
          </button>
        </div>
      </Modal>
    </article>
  )
}
