import React, { useEffect, useState } from 'react'
import { Sun, AlertOctagon, CheckCircle2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

interface DailyBrief {
  yesterday_mrr_delta_usd?: number
  one_bet?:               string
  one_customer?:          string
  one_anti_action?:       string
  body?:                  string
}

interface WeeklyRetro {
  what_worked?:   string[]
  what_flopped?:  string[]
  next_focus?:    string
  generated_at?:  string
}

/**
 * Pillar 4 surface. Renders the latest Marcus daily brief at the top of
 * Home. If a weekly retro exists and hasn't been acknowledged, the retro
 * takes priority (forced acknowledgment to dismiss).
 */
export function DailyBriefBanner() {
  const [brief, setBrief]         = useState<DailyBrief | null>(null)
  const [briefAt, setBriefAt]     = useState<string | null>(null)
  const [retro, setRetro]         = useState<WeeklyRetro | null>(null)
  const [retroAt, setRetroAt]     = useState<string | null>(null)
  const [retroAcked, setRetroAcked] = useState<string | null>(null)
  const [acking, setAcking]       = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const { data } = await supabase
        .from('home_intelligence')
        .select('daily_brief, daily_brief_at, weekly_retro, weekly_retro_at, weekly_retro_ack_at')
        .eq('id', 'current')
        .maybeSingle()
      if (cancelled) return
      setBrief(parseJson<DailyBrief>(data?.daily_brief))
      setBriefAt(data?.daily_brief_at ?? null)
      setRetro(parseJson<WeeklyRetro>(data?.weekly_retro))
      setRetroAt(data?.weekly_retro_at ?? null)
      setRetroAcked(data?.weekly_retro_ack_at ?? null)
    }
    load()
    const iv = setInterval(load, 60_000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [])

  const showRetro = retro != null && retroAt && (!retroAcked || retroAt > retroAcked)

  const ackRetro = async () => {
    setAcking(true)
    await supabase
      .from('home_intelligence')
      .update({ weekly_retro_ack_at: new Date().toISOString() })
      .eq('id', 'current')
    setRetroAcked(new Date().toISOString())
    setAcking(false)
  }

  if (showRetro && retro) {
    return (
      <section className="rounded-2xl border-2 border-amber-500/40 bg-gradient-to-br from-amber-500/[0.10] to-amber-500/[0.02] p-5">
        <header className="flex items-center gap-2 mb-3">
          <AlertOctagon size={14} className="text-amber-300" />
          <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-300">
            Friday retro — acknowledge to dismiss
          </h2>
        </header>
        {retro.what_worked && retro.what_worked.length > 0 && (
          <div className="mb-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-emerald-300/80 font-semibold mb-1">Worked</p>
            <ul className="text-[13px] text-white/85 space-y-0.5">
              {retro.what_worked.slice(0, 4).map((w, i) => <li key={i}>· {w}</li>)}
            </ul>
          </div>
        )}
        {retro.what_flopped && retro.what_flopped.length > 0 && (
          <div className="mb-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-red-300/80 font-semibold mb-1">Flopped</p>
            <ul className="text-[13px] text-white/85 space-y-0.5">
              {retro.what_flopped.slice(0, 4).map((w, i) => <li key={i}>· {w}</li>)}
            </ul>
          </div>
        )}
        {retro.next_focus && (
          <p className="text-[13px] text-amber-100 mt-3 font-medium">
            → Next week: {retro.next_focus}
          </p>
        )}
        <button
          type="button"
          onClick={ackRetro}
          disabled={acking}
          className="mt-3 px-3 py-1.5 rounded-md text-[12px] font-semibold bg-amber-500/25 border border-amber-500/40 text-amber-100 hover:bg-amber-500/35 disabled:opacity-40"
        >
          <CheckCircle2 size={12} className="inline mr-1" />
          {acking ? 'Saving…' : 'Acknowledged — dismiss'}
        </button>
      </section>
    )
  }

  if (!brief) return null

  const delta = brief.yesterday_mrr_delta_usd ?? 0
  const deltaColor = delta > 0 ? 'text-emerald-300' : delta < 0 ? 'text-red-300' : 'text-white/55'

  return (
    <section className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/[0.06] to-violet-500/[0.01] p-5">
      <header className="flex items-center gap-2 mb-3">
        <Sun size={14} className="text-violet-300" />
        <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-300">
          Today’s brief from Marcus
        </h2>
        {briefAt && (
          <span className="text-[10px] text-white/35 ml-auto">
            {humanAgo(briefAt)}
          </span>
        )}
      </header>

      {delta !== 0 && (
        <p className={`text-[14px] font-semibold mb-2 ${deltaColor}`}>
          Yesterday: {delta > 0 ? '+' : ''}${Math.round(delta).toLocaleString()} MRR
        </p>
      )}

      {brief.one_bet && (
        <p className="text-[13px] text-white/85 leading-snug mb-1.5">
          <span className="text-violet-300/80 font-semibold">Today’s bet · </span>{brief.one_bet}
        </p>
      )}
      {brief.one_customer && (
        <p className="text-[13px] text-white/85 leading-snug mb-1.5">
          <span className="text-emerald-300/80 font-semibold">Talk to · </span>{brief.one_customer}
        </p>
      )}
      {brief.one_anti_action && (
        <p className="text-[13px] text-white/85 leading-snug">
          <span className="text-red-300/80 font-semibold">Don’t · </span>{brief.one_anti_action}
        </p>
      )}
      {brief.body && !brief.one_bet && (
        <p className="text-[13px] text-white/75 leading-snug whitespace-pre-wrap">{brief.body}</p>
      )}
    </section>
  )
}

function parseJson<T>(raw: any): T | null {
  if (!raw) return null
  if (typeof raw === 'object') return raw as T
  try { return JSON.parse(raw) } catch { return null }
}

function humanAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms)) return ''
  const h = Math.floor(ms / 3_600_000)
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60_000))}m`
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}
