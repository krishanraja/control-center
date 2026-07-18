import { useEffect, useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Lock, PencilLine, Eye, RotateCcw, Check } from 'lucide-react'
import { useToast } from '../shared/Toast'
import { laneAction, type LaneDetail, type LaneDirection } from '../../hooks/useLaneDetail'

/**
 * Direction Studio — the top of the control model. Krish authors and LOCKS a
 * lane's direction (positioning, messaging pillars, offers, ICP, voice,
 * never-say, channels); the system propagates it into every touchpoint. One
 * locked version per lane; locking supersedes the prior and cascades (stale
 * queued sends flag for regeneration). Preview renders the direction into a
 * sample prompt before committing. Product-brand only — the lock refuses any
 * direction that references a personal brand.
 */

type Draft = {
  positioning: string
  icp: string
  voice: string
  pillars: string        // one "pillar :: proof" per line
  offers: string         // one "name :: price :: url" per line
  never_say: string      // comma-separated
  channels: string       // comma-separated
  sender: string
}

function toDraft(d: LaneDirection | null): Draft {
  return {
    positioning: d?.positioning || '',
    icp: d?.icp || '',
    voice: d?.voice || '',
    pillars: (d?.messaging_pillars || []).map(p => `${p.pillar || ''}${p.proof ? ` :: ${p.proof}` : ''}`).join('\n'),
    offers: (d?.offers || []).map(o => [o.name, o.price, o.url].filter(Boolean).join(' :: ')).join('\n'),
    never_say: (d?.never_say || []).join(', '),
    channels: (d?.channel_priorities || []).join(', '),
    sender: d?.creative_direction?.sender || '',
  }
}

function fromDraft(d: Draft) {
  return {
    positioning: d.positioning.trim() || null,
    icp: d.icp.trim() || null,
    voice: d.voice.trim() || null,
    messaging_pillars: d.pillars.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const [pillar, proof] = l.split('::').map(s => s.trim())
      return { pillar, ...(proof ? { proof } : {}) }
    }),
    offers: d.offers.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const [name, price, url] = l.split('::').map(s => s.trim())
      return { name, ...(price ? { price } : {}), ...(url ? { url } : {}) }
    }),
    never_say: d.never_say.split(',').map(s => s.trim()).filter(Boolean),
    channel_priorities: d.channels.split(',').map(s => s.trim()).filter(Boolean),
    creative_direction: { sender: d.sender.trim() || undefined },
  }
}

export function DirectionStudio({
  lane,
  detail,
  onChanged,
}: {
  lane: string
  detail?: LaneDetail | null
  onChanged?: () => void
}) {
  const { toast } = useToast()
  const locked = detail?.direction_locked || null
  const serverDraft = detail?.direction_draft || null
  const history = detail?.direction_history || []

  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<Draft>(() => toDraft(serverDraft || locked))
  const [preview, setPreview] = useState<string | null>(null)

  // Reset the editor when the lane changes (detail arrives async, so we seed
  // the form at edit-open time below rather than depending on load order).
  useEffect(() => { setEditing(false); setPreview(null) }, [lane])

  // Open Edit pre-filled from the CURRENT locked/draft direction (seed now,
  // when detail is present), so the form is never empty and never falsely dirty.
  const openEdit = () => {
    setDraft(toDraft(serverDraft || locked))
    setEditing(true)
  }

  const dirty = useMemo(
    () => JSON.stringify(toDraft(serverDraft || locked)) !== JSON.stringify(draft),
    [draft, serverDraft, locked],
  )

  const act = async (payload: Record<string, unknown>) => {
    setBusy(true)
    try {
      const { status, body } = await laneAction(lane, payload)
      if (status >= 400) throw new Error(body?.error || `HTTP ${status}`)
      onChanged?.()
      return body
    } catch (e: any) {
      toast(e?.message || 'Action failed', 'error')
      throw e
    } finally {
      setBusy(false)
    }
  }

  const saveDraft = async () => {
    await act({ action: 'direction_draft', direction: fromDraft(draft) })
    toast('Draft saved.', 'success')
  }

  const doPreview = async () => {
    if (dirty) await saveDraft()
    try {
      const body = await act({ action: 'direction_preview', context: 'a short nurture email' })
      setPreview(body?.system_prompt || '(no preview)')
    } catch { /* toast already fired */ }
  }

  const lock = async () => {
    if (dirty) await saveDraft()
    try {
      const body = await act({ action: 'direction_lock' })
      toast(`Direction v${body.version} locked. ${body.stale_sends || 0} send(s) flagged for regeneration.`, 'success')
      setEditing(false); setPreview(null)
    } catch { /* toast already fired */ }
  }

  const rollback = async (version: number) => {
    await act({ action: 'direction_rollback', version })
    toast(`Rolled back to v${version}.`, 'success')
  }

  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setDraft(d => ({ ...d, [k]: e.target.value }))

  return (
    <section className="rounded-xl border border-violet-400/20 bg-violet-500/[0.03] overflow-hidden">
      <header className="px-4 py-3 flex items-center gap-2 border-b border-white/[0.06]">
        <Lock size={13} className="text-violet-400" />
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
          Direction studio
        </h2>
        <span className="ml-auto flex items-center gap-2">
          {locked && (
            <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
              v{locked.version} locked
            </span>
          )}
          <button
            type="button"
            onClick={() => (editing ? setEditing(false) : openEdit())}
            className="text-[10px] font-medium text-white/40 hover:text-white/80 transition-colors"
          >
            {editing ? 'Cancel' : 'Edit'}
          </button>
        </span>
      </header>

      {editing ? (
        <div className="px-4 py-3 space-y-2.5">
          {([
            ['Positioning', 'positioning', 2],
            ['ICP', 'icp', 2],
            ['Voice', 'voice', 2],
          ] as const).map(([label, key, rows]) => (
            <label key={key} className="block">
              <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-white/30">{label}</span>
              <textarea value={draft[key]} onChange={set(key)} rows={rows}
                className="mt-0.5 w-full rounded-md bg-white/[0.04] border border-white/[0.08] px-2.5 py-1.5 text-[11.5px] text-white/85 leading-snug focus:outline-none focus:border-violet-400/50 resize-y" />
            </label>
          ))}
          <label className="block">
            <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-white/30">Messaging pillars — one per line, "pillar :: proof"</span>
            <textarea value={draft.pillars} onChange={set('pillars')} rows={3}
              className="mt-0.5 w-full rounded-md bg-white/[0.04] border border-white/[0.08] px-2.5 py-1.5 text-[11.5px] text-white/85 leading-snug focus:outline-none focus:border-violet-400/50 resize-y" />
          </label>
          <label className="block">
            <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-white/30">Offers — one per line, "name :: price :: url"</span>
            <textarea value={draft.offers} onChange={set('offers')} rows={2}
              className="mt-0.5 w-full rounded-md bg-white/[0.04] border border-white/[0.08] px-2.5 py-1.5 text-[11.5px] text-white/85 leading-snug focus:outline-none focus:border-violet-400/50 resize-y" />
          </label>
          {([
            ['Never say (comma-separated)', 'never_say'],
            ['Channel priorities (comma-separated)', 'channels'],
            ['Sender identity', 'sender'],
          ] as const).map(([label, key]) => (
            <label key={key} className="block">
              <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-white/30">{label}</span>
              <input value={draft[key]} onChange={set(key)}
                className="mt-0.5 w-full rounded-md bg-white/[0.04] border border-white/[0.08] px-2.5 py-1.5 text-[11.5px] text-white/85 focus:outline-none focus:border-violet-400/50" />
            </label>
          ))}

          <div className="flex items-center gap-2 pt-1">
            <button type="button" disabled={busy || !dirty} onClick={saveDraft}
              className="rounded-lg border border-white/[0.1] px-2.5 py-1 text-[11px] font-medium text-white/70 hover:text-white transition-colors disabled:opacity-40 flex items-center gap-1">
              <PencilLine size={10} /> Save draft
            </button>
            <button type="button" disabled={busy} onClick={doPreview}
              className="rounded-lg border border-cyan-400/25 px-2.5 py-1 text-[11px] font-medium text-cyan-300 hover:bg-cyan-500/10 transition-colors disabled:opacity-40 flex items-center gap-1">
              <Eye size={10} /> Preview
            </button>
            <button type="button" disabled={busy} onClick={lock}
              className="ml-auto rounded-lg bg-violet-500/15 border border-violet-400/30 px-3 py-1 text-[11px] font-semibold text-violet-200 hover:bg-violet-500/25 transition-colors disabled:opacity-40 flex items-center gap-1">
              <Lock size={10} /> {dirty ? 'Save & lock' : 'Lock this'}
            </button>
          </div>

          {preview && (
            <div className="rounded-lg border border-cyan-400/20 bg-cyan-500/[0.04] p-3">
              <p className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-cyan-300/80 mb-1">Propagation preview — what every touchpoint will read</p>
              <pre className="text-[10.5px] text-white/70 whitespace-pre-wrap leading-snug max-h-52 overflow-y-auto">{preview}</pre>
            </div>
          )}
        </div>
      ) : (
        <div className="px-4 py-3 space-y-2">
          {locked ? (
            <>
              {locked.positioning && <Field label="Positioning" value={locked.positioning} />}
              {locked.icp && <Field label="ICP" value={locked.icp} />}
              {locked.voice && <Field label="Voice" value={locked.voice} />}
              {(locked.messaging_pillars || []).length > 0 && (
                <div>
                  <p className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-white/30">Pillars</p>
                  <ul className="mt-0.5 space-y-0.5">
                    {locked.messaging_pillars.map((p, i) => (
                      <li key={i} className="text-[11.5px] text-white/70 leading-snug">• {p.pillar}{p.proof ? <span className="text-white/35"> — {p.proof}</span> : null}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {(locked.channel_priorities || []).map(c => (
                  <span key={c} className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] text-white/55">{c.replace(/_/g, ' ')}</span>
                ))}
              </div>
              {locked.never_say?.length > 0 && <p className="text-[10px] text-white/30">Never: {locked.never_say.join(' · ')}</p>}
              {locked.locked_at && (
                <p className="text-[10px] text-white/25">
                  Locked {formatDistanceToNow(new Date(locked.locked_at), { addSuffix: true })} by {locked.locked_by || 'krish'}
                  {serverDraft ? ' · a draft is in progress' : ''}
                </p>
              )}
            </>
          ) : (
            <p className="text-[11.5px] text-white/35">No direction locked yet. Edit to author and lock v1.</p>
          )}

          {history.filter(h => h.status === 'superseded').length > 0 && (
            <div className="border-t border-white/[0.06] pt-2 mt-1 space-y-1">
              {history.filter(h => h.status === 'superseded').slice(0, 3).map(h => (
                <div key={h.id} className="flex items-center gap-2 text-[10.5px]">
                  <span className="text-white/40">v{h.version} superseded</span>
                  <button type="button" disabled={busy} onClick={() => rollback(h.version)}
                    className="ml-auto text-white/40 hover:text-white/80 transition-colors flex items-center gap-1">
                    <RotateCcw size={9} /> roll back
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-white/30">{label}</p>
      <p className="text-[11.5px] text-white/70 leading-snug">{value}</p>
    </div>
  )
}
