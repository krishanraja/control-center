import { useMemo, useState } from 'react'
import { Check, ArrowRight, Sparkles, CheckCircle2, Loader2, CalendarPlus, PenLine } from 'lucide-react'
import type { ContentIdeaRow } from '../../hooks/useRealtimeContentIdeas'
import { nextBestAction, type NextActionKind } from '../../lib/contentEngine'
import { useToast } from '../shared/Toast'
import { useHaptics } from '../../hooks/useHaptics'

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
      default: open(id)
    }
  }

  const todayYMD = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()

  const clear = next.kind === 'clear'
  const tone = clear
    ? 'border-emerald-500/20 bg-emerald-500/[0.04]'
    : next.kind === 'approve'
      ? 'border-emerald-500/30 bg-emerald-500/[0.06]'
      : 'border-violet-500/25 bg-violet-500/[0.06]'

  return (
    <section
      aria-label="Do this next"
      className={`rounded-2xl border ${tone} ${narrow ? 'p-3.5' : 'px-5 py-4'} flex items-center gap-3`}
    >
      <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center">
        {KIND_ICON[next.kind]}
      </div>
      <div className="min-w-0 flex-1">
        {!clear && (
          <p className="text-[10px] uppercase tracking-[0.16em] text-white/40 mb-0.5">Do this next</p>
        )}
        <p className={`${narrow ? 'text-[14px]' : 'text-[15px]'} font-semibold text-white leading-snug truncate`}>
          {next.headline}
        </p>
        <p className="text-[12px] text-white/55 leading-snug truncate">{next.sub}</p>
      </div>
      {!clear && next.idea && next.kind === 'schedule' && (
        // Inline date picker — pick a day right here, no detour (P-11 / P-22).
        <label
          className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-xl px-4 font-semibold transition-colors min-h-[44px] cursor-pointer bg-sky-500/20 border border-sky-400/40 text-sky-100 hover:bg-sky-500/30 text-[13px]"
          title="Pick a day to ship it"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <CalendarPlus size={14} />}
          Schedule
          <input
            type="date"
            min={todayYMD}
            disabled={busy}
            onChange={e => schedule((next.idea as ContentIdeaRow).id, e.target.value)}
            className="sr-only"
          />
        </label>
      )}
      {!clear && next.idea && next.kind !== 'schedule' && (
        <button
          type="button"
          onClick={onAct}
          disabled={busy}
          className={`flex-shrink-0 inline-flex items-center gap-1.5 rounded-xl px-4 font-semibold transition-colors disabled:opacity-50 min-h-[44px] ${
            next.kind === 'approve'
              ? 'bg-emerald-500/20 border border-emerald-400/40 text-emerald-100 hover:bg-emerald-500/30'
              : 'bg-violet-500/20 border border-violet-400/40 text-violet-100 hover:bg-violet-500/30'
          } ${narrow ? 'text-[13px]' : 'text-[13px]'}`}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : KIND_ICON[next.kind]}
          {next.actionLabel}
        </button>
      )}
    </section>
  )
}
