import { useState } from 'react'
import { Check, ExternalLink, Inbox, Save, Sparkles, X } from '@/lib/icons'
import { useToast } from '../shared/Toast'
import { Working } from '../shared/Working'
import { Modal } from '../shared/Modal'
import { draftRoom, patchRoom, ROOM_STATE_LABEL } from '../../hooks/useRoom'
import type { RoomRow, RoomState } from '../../hooks/useRoom'

// One leader in the Room. The card carries who they are, why they fit the
// face, the live reason for writing now (or the honest line that there is
// none), the draft when there is one, and exactly one primary action for
// the state it is in.
//
// There is no send button here and there never will be one. "I sent it" is
// Krish telling the OS what he did in Gmail.

interface Props {
  target: RoomRow
  onChanged: () => void
}

/** The one primary action per state, and the state it moves to. */
const PRIMARY: Partial<Record<RoomState, { label: string; next: RoomState; done: string }>> = {
  drafted: { label: 'I sent it', next: 'sent', done: 'Marked sent. It counts on the scorecard.' },
  sent: { label: 'They replied', next: 'replied', done: 'Marked replied.' },
  replied: { label: 'Call booked', next: 'call_booked', done: 'Call booked.' },
  call_booked: { label: 'Call taken', next: 'call_taken', done: 'Call taken.' },
  call_taken: { label: 'Room booked', next: 'room_booked', done: 'Room booked. Well done.' },
}

const PRIMARY_CLASS =
  'flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-label font-semibold bg-amber-500/90 text-black hover:bg-amber-400 disabled:opacity-40 transition-colors'
const QUIET_CLASS =
  'flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-label font-medium border border-white/15 text-white/75 hover:bg-white/[0.06] disabled:opacity-40 transition-colors'

export function RoomCard({ target: t, onChanged }: Props) {
  const { toast } = useToast()
  const [busy, setBusy] = useState<null | 'primary' | 'quiet' | 'save' | 'draft'>(null)
  const [body, setBody] = useState(t.draft_body || '')
  const [payOpen, setPayOpen] = useState(false)
  const [cash, setCash] = useState('')

  const name = t.contact?.full_name || 'Unnamed contact'
  const personLine = [t.contact?.title, t.contact?.company].filter(Boolean).join(' at ')

  const move = async (next: RoomState, key: 'primary' | 'quiet', done: string, extra: { cash_gbp?: number } = {}) => {
    if (busy) return
    setBusy(key)
    try {
      await patchRoom(t.id, { state: next, ...extra })
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
      await draftRoom(t.id)
      toast('Drafted. It is in your Gmail drafts too. Nothing was sent.', 'success')
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

  const saveDraft = async () => {
    if (busy) return
    setBusy('save')
    try {
      await patchRoom(t.id, { draft_body: body })
      toast('Draft saved. Sending stays yours.', 'success')
      onChanged()
    } catch (err) {
      toast(`Could not save: ${(err as Error)?.message || 'try again'}`, 'error')
    } finally {
      setBusy(null)
    }
  }

  const confirmPaid = async () => {
    const n = Number(cash)
    if (!Number.isFinite(n) || n <= 0) {
      toast('Enter the amount in pounds first.', 'error')
      return
    }
    setPayOpen(false)
    await move('room_paid', 'primary', `Paid. ${n.toLocaleString('en-GB')} GBP on the scorecard.`, { cash_gbp: n })
  }

  const primary = PRIMARY[t.state]

  return (
    <article
      data-testid="room-card"
      className="rounded-xl border border-violet-500/20 bg-violet-500/[0.04] p-3.5 hover:border-violet-500/35 transition-colors"
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
          data-testid="room-state"
          className="shrink-0 text-micro px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-200"
        >
          {ROOM_STATE_LABEL[t.state]}
        </span>
      </div>

      <p className="text-label text-white/70 mt-2">{t.why_face}</p>

      {t.trigger_signal && t.trigger_source_url ? (
        <p className="text-label text-white/70 mt-1.5">
          Why now: {t.trigger_signal}
          <a
            href={t.trigger_source_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 ml-1.5 text-violet-300 hover:text-violet-200"
          >
            <ExternalLink size={11} />
            source
          </a>
        </p>
      ) : (
        <p className="text-label text-white/45 mt-1.5">No live trigger found</p>
      )}

      {t.state === 'drafted' && (
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
            {body !== (t.draft_body || '') && (
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
            {t.draft_url && (
              <a
                href={t.draft_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-label text-violet-300 hover:text-violet-200"
              >
                <Inbox size={12} />
                Open in Gmail
              </a>
            )}
          </div>
        </div>
      )}

      {t.state === 'room_paid' && typeof t.cash_gbp === 'number' && (
        <p className="text-label text-white/55 mt-2 tabular-nums">
          Invoiced {t.cash_gbp.toLocaleString('en-GB')} GBP.
        </p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:items-center sm:flex-wrap">
        {t.state === 'listed' && (
          <button
            type="button"
            data-testid="room-primary"
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
            data-testid="room-primary"
            onClick={() => move(primary.next, 'primary', primary.done)}
            disabled={busy !== null}
            className={PRIMARY_CLASS}
          >
            {busy === 'primary' ? <Working size={12} /> : <Check size={12} />}
            {primary.label}
          </button>
        )}
        {t.state === 'room_booked' && (
          <button
            type="button"
            data-testid="room-primary"
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
            data-testid="room-primary"
            onClick={() => move('listed', 'primary', 'Back on the list.')}
            disabled={busy !== null}
            className={PRIMARY_CLASS}
          >
            {busy === 'primary' ? <Working size={12} /> : <Check size={12} />}
            Back to the list
          </button>
        )}
        {t.state !== 'not_now' && t.state !== 'room_paid' && (
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
        title="Room paid"
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
