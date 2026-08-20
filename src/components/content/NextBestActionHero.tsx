import { useMemo, useState } from 'react'
import { Check, ArrowRight, Sparkles, CheckCircle2, CalendarPlus, PenLine, Send } from 'lucide-react'
import type { ContentIdeaRow } from '../../hooks/useRealtimeContentIdeas'
import { nextBestAction, type NextActionKind } from '../../lib/contentEngine'
import { useToast } from '../shared/Toast'
import { useHaptics } from '../../hooks/useHaptics'
import { DoThisNextHero, type HeroTone } from '../shared/DoThisNextHero'
import { Working } from '../shared/Working'

/**
 * The "Do this next" hero — the single anti-confusion spine (P-13 / P-22).
 *
 * It looks across the WHOLE active pile and surfaces the one highest-priority
 * action, in plain language, with a one-tap primary button that is always
 * state-correct: Approve a ready draft, Schedule an approved piece, Continue a
 * draft, Develop a researched idea, or shape a seed. Krish never has to scan a
 * list to decide what to do — the action comes to him.
 *
 * Self-contained: Approve fires the guarded PATCH inline (realtime repaints the
 * pile); every other kind opens the Composer on that exact card so he lands
 * mid-flight. Scheduling lives on the calendar/Composer, so 'schedule' opens it
 * with a schedule-intent hash.
 */
const KIND_ICON: Record<NextActionKind, React.ReactNode> = {
  publish: <Send size={16} className="text-emerald-300" />,
  approve: <Check size={16} className="text-emerald-300" />,
  schedule: <CalendarPlus size={16} className="text-sky-300" />,
  draft: <PenLine size={16} className="text-violet-300" />,
  develop: <PenLine size={16} className="text-violet-300" />,
  seed: <Sparkles size={16} className="text-violet-300" />,
  triage: <ArrowRight size={16} className="text-violet-300" />,
  clear: <CheckCircle2 size={16} className="text-emerald-400/80" />,
}

interface Props {
  ideas: ContentIdeaRow[]
  /** Compact styling for the mobile surface. */
  narrow?: boolean
}

export function NextBestActionHero({ ideas, narrow }: Props) {
  const { toast } = useToast()
  const h = useHaptics()
  const [busy, setBusy] = useState(false)
  const [pubOpen, setPubOpen] = useState(false)
  const [pubUrl, setPubUrl] = useState('')
  const next = useMemo(() => nextBestAction(ideas), [ideas])

  const open = (id: string) => {
    h.tap()
    window.location.hash = `#/content?idea=${id}`
  }

  const schedule = async (id: string, date: string) => {
    if (!date) return
    h.heavy(); setBusy(true)
    try {
      const r = await fetch(`/api/content-ideas/${id}/schedule`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      })
      if (!r.ok) throw new Error(String(r.status))
      h.success(); toast('Scheduled.', 'success')
    } catch {
      h.error(); toast('Could not schedule — try again.', 'error')
    } finally { setBusy(false) }
  }

  // Close the loop: mark an approved+due piece live, logging the public URL onto
  // the row (calendar flips it to the "live" track, follow-up clears).
  const markPublished = async (id: string, url: string) => {
    h.heavy(); setBusy(true)
    try {
      const r = await fetch('/api/content-ideas', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, state: 'published', ...(url.trim() ? { published_url: url.trim() } : {}) }),
      })
      const body = await r.json().catch(() => ({} as any))
      if (!r.ok || body?.ok === false) throw new Error(String(r.status))
      h.success(); toast('Published. Logged it.', 'success')
      setPubOpen(false); setPubUrl('')
    } catch {
      h.error(); toast('Could not mark published — try again.', 'error')
    } finally { setBusy(false) }
  }

  const approve = async (id: string) => {
    h.heavy(); setBusy(true)
    try {
      const r = await fetch('/api/content-ideas', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, state: 'approved' }),
      })
      const body = await r.json().catch(() => ({} as any))
      if (!r.ok || body?.ok === false) {
        if (r.status === 409 && body?.reason === 'state_guard') {
          h.error(); toast(body.error || 'Develop it first.', 'error'); open(id); return
        }
        throw new Error(String(r.status))
      }
      h.success(); toast('Approved — ready to ship.', 'success')
    } catch {
      h.error(); toast('Could not approve — try again.', 'error')
    } finally { setBusy(false) }
  }

  const onAct = () => {
    if (!next.idea) return
    const id = (next.idea as ContentIdeaRow).id
    switch (next.kind) {
      case 'approve': void approve(id); break
      case 'schedule': break // handled by the inline date input
      case 'publish': setPubOpen(true); break // handled by the inline URL input
      default: open(id)
    }
  }

  const todayYMD = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()

  const clear = next.kind === 'clear'
  const TONE: Record<NextActionKind, HeroTone> = {
    publish: 'emerald', approve: 'emerald', schedule: 'sky', draft: 'violet', develop: 'violet',
    seed: 'violet', triage: 'violet', clear: 'neutral',
  }

  // Schedule uses an inline date picker as its action; everything else is a button.
  const scheduleSlot = next.kind === 'schedule' && next.idea ? (
    <label
      className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-xl px-4 font-semibold transition-colors min-h-[44px] cursor-pointer bg-sky-500/20 border border-sky-400/40 text-sky-100 hover:bg-sky-500/30 text-[13px]"
      title="Pick a day to ship it"
    >
      {busy ? <Working size={14} /> : <CalendarPlus size={14} />}
      Schedule
      <input
        type="date" min={todayYMD} disabled={busy}
        onChange={e => schedule((next.idea as ContentIdeaRow).id, e.target.value)}
        className="sr-only"
      />
    </label>
  ) : undefined

  // Publish uses an inline "mark live + log link" form as its action.
  const publishSlot = next.kind === 'publish' && next.idea ? (
    pubOpen ? (
      <div className="flex-shrink-0 flex items-center gap-1.5">
        <input
          type="url" autoFocus value={pubUrl}
          onChange={e => setPubUrl(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') markPublished((next.idea as ContentIdeaRow).id, pubUrl)
            if (e.key === 'Escape') { setPubOpen(false); setPubUrl('') }
          }}
          placeholder="Live URL (optional)"
          className="w-40 rounded-lg bg-black/40 border border-white/12 px-2.5 py-2 text-[12px] text-white placeholder:text-white/30 focus:outline-none focus:border-emerald-400/40"
        />
        <button
          type="button" disabled={busy}
          onClick={() => markPublished((next.idea as ContentIdeaRow).id, pubUrl)}
          title="Mark this piece live"
          className="inline-flex items-center gap-1.5 rounded-xl px-3 font-semibold transition-colors disabled:opacity-50 min-h-[44px] text-[13px] border bg-emerald-500/20 border-emerald-400/40 text-emerald-100 hover:bg-emerald-500/30"
        >
          {busy ? <Working size={14} /> : <Check size={14} />} Mark live
        </button>
      </div>
    ) : (
      <button
        type="button"
        onClick={() => { h.tap(); setPubOpen(true) }}
        className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-xl px-4 font-semibold transition-colors min-h-[44px] text-[13px] border bg-emerald-500/20 border-emerald-400/40 text-emerald-100 hover:bg-emerald-500/30"
      >
        <Send size={14} /> Mark published
      </button>
    )
  ) : undefined

  return (
    <DoThisNextHero
      descriptor={{
        headline: next.headline,
        sub: next.sub,
        actionLabel: clear ? undefined : next.actionLabel,
        icon: KIND_ICON[next.kind],
        tone: TONE[next.kind],
        clear,
      }}
      onAct={onAct}
      busy={busy}
      actionSlot={scheduleSlot || publishSlot}
      narrow={narrow}
    />
  )
}
