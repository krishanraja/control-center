import React, { useState, useEffect } from 'react'
import { ExternalLink, Copy, Check, ChevronDown, ChevronRight, Mic, Mail, Instagram, Video, Cpu, TrendingUp, Users, Zap, AlertTriangle, Clock, CheckCircle2, ArrowUpRight } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface KPI {
  label: string
  current: number | string
  target: number | string
}

interface Workstream {
  id: string
  name: string
  category: 'content' | 'product' | 'revenue' | 'outreach' | 'infrastructure'
  categoryLabel: string
  owner: string
  supporting?: string[]
  status: 'needs_you' | 'active' | 'pending' | 'blocked'
  lastUpdate?: string
  nextAction: string
  blockedTaskId?: string | null
  kpi?: KPI | null
  actionLabel?: string | null
  actionUrl?: string | null
  briefUrl?: string | null
}

interface WorkstreamData {
  updated_at: string
  total: number
  workstreams: Workstream[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  content:        <Mic className="w-3.5 h-3.5" />,
  product:        <Cpu className="w-3.5 h-3.5" />,
  revenue:        <TrendingUp className="w-3.5 h-3.5" />,
  outreach:       <Users className="w-3.5 h-3.5" />,
  infrastructure: <Zap className="w-3.5 h-3.5" />,
}

const CATEGORY_COLORS: Record<string, string> = {
  content:        'bg-violet-500/10 text-violet-400 border-violet-500/20',
  product:        'bg-blue-500/10 text-blue-400 border-blue-500/20',
  revenue:        'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  outreach:       'bg-amber-500/10 text-amber-400 border-amber-500/20',
  infrastructure: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
}

const STATUS_CONFIG = {
  needs_you: {
    dot:   'bg-amber-400 animate-pulse',
    label: 'Your Move',
    text:  'text-amber-400',
    badge: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
  },
  active: {
    dot:   'bg-emerald-400',
    label: 'Active',
    text:  'text-emerald-400',
    badge: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
  },
  pending: {
    dot:   'bg-white/20',
    label: 'Pending',
    text:  'text-white/40',
    badge: 'bg-white/5 border-white/10 text-white/40',
  },
  blocked: {
    dot:   'bg-rose-400',
    label: 'Blocked',
    text:  'text-rose-400',
    badge: 'bg-rose-500/10 border-rose-500/30 text-rose-400',
  },
}

// ─── Copy-to-Agatha button (Q2 fix: reliable feedback routing) ────────────────

function CopyFeedback({ workstream, onCopy }: { workstream: Workstream; onCopy: () => void }) {
  const [copied, setCopied] = useState(false)
  const text = `DECISION | ${workstream.id} | ${workstream.owner} | — paste your decision here — | ${new Date().toISOString()}`
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      onCopy()
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button
      onClick={copy}
      title="Copy structured decision → paste to Agatha in Telegram"
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] bg-white/[0.04] border border-white/[0.08] text-white/40 hover:text-white/70 hover:border-white/20 transition-all"
    >
      {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
      {copied ? 'Copied!' : 'Copy to Agatha'}
    </button>
  )
}

// ─── Workstream Row ───────────────────────────────────────────────────────────

function WorkstreamRow({ ws, showCopyHint }: { ws: Workstream; showCopyHint: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const [copyFlash, setCopyFlash] = useState(false)
  const cfg = STATUS_CONFIG[ws.status]
  const catColor = CATEGORY_COLORS[ws.category] || CATEGORY_COLORS.content

  return (
    <div className={`rounded-xl border transition-all duration-200 overflow-hidden
      ${ws.status === 'needs_you'
        ? 'border-amber-500/20 bg-amber-500/[0.03] hover:border-amber-500/35'
        : ws.status === 'blocked'
        ? 'border-rose-500/15 bg-rose-500/[0.02] hover:border-rose-500/25'
        : 'border-white/[0.06] bg-white/[0.015] hover:border-white/[0.10]'
      }`}
    >
      {/* Main row */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        {/* Status dot */}
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />

        {/* Name + category */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-white truncate">{ws.name}</span>
            <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border ${catColor}`}>
              {CATEGORY_ICONS[ws.category]}
              {ws.categoryLabel}
            </span>
          </div>
          {/* Next action — always visible */}
          <p className={`text-[11px] mt-0.5 leading-snug truncate ${ws.status === 'needs_you' ? 'text-amber-300/70' : 'text-white/35'}`}>
            {ws.nextAction}
          </p>
        </div>

        {/* Owner + supporters */}
        <div className="hidden sm:flex items-center gap-1 flex-shrink-0">
          <span className="text-[11px] text-white/40 font-medium">{ws.owner}</span>
          {ws.supporting && ws.supporting.length > 0 && (
            <span className="text-[10px] text-white/25">+{ws.supporting.join(', ')}</span>
          )}
        </div>

        {/* KPI pill */}
        {ws.kpi && (
          <div className="hidden md:flex flex-col items-end flex-shrink-0 min-w-[70px]">
            <span className="text-[12px] font-mono font-semibold text-white/70">{ws.kpi.current}</span>
            <span className="text-[10px] text-white/25">/ {ws.kpi.target}</span>
          </div>
        )}

        {/* Status badge */}
        <span className={`hidden sm:inline-flex flex-shrink-0 text-[10px] px-2 py-0.5 rounded border font-medium ${cfg.badge}`}>
          {cfg.label}
        </span>

        {/* Chevron */}
        <div className="text-white/20 flex-shrink-0">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-white/[0.05] space-y-3">
          {/* Full action text */}
          <p className="text-[12px] text-white/50 leading-relaxed">{ws.nextAction}</p>

          {/* KPI bar if numeric */}
          {ws.kpi && typeof ws.kpi.current === 'number' && typeof ws.kpi.target === 'number' && (
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-white/30">
                <span>{ws.kpi.label}</span>
                <span>{ws.kpi.current} / {ws.kpi.target}</span>
              </div>
              <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-violet-500 transition-all duration-500"
                  style={{ width: `${Math.min(100, (ws.kpi.current as number / (ws.kpi.target as number)) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {ws.actionUrl && ws.actionLabel && (
              <a
                href={ws.actionUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all
                  ${ws.status === 'needs_you'
                    ? 'bg-amber-500/15 border border-amber-500/30 text-amber-400 hover:bg-amber-500/25'
                    : 'bg-white/[0.06] border border-white/[0.12] text-white/60 hover:text-white/90'
                  }`}
              >
                {ws.actionLabel}
                <ArrowUpRight size={11} />
              </a>
            )}
            {ws.briefUrl && (
              <a
                href={ws.briefUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] border border-white/[0.08] text-white/35 hover:text-white/60 transition-colors"
              >
                Agent Brief <ExternalLink size={10} />
              </a>
            )}
            {/* Q2 fix: reliable feedback via Agatha */}
            {ws.status === 'needs_you' && (
              <CopyFeedback workstream={ws} onCopy={() => setCopyFlash(true)} />
            )}
          </div>

          {copyFlash && (
            <p className="text-[10px] text-white/30 italic">
              Paste that message to Agatha in Telegram → she'll update the task and notify {ws.owner} on the next sync.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Section ─────────────────────────────────────────────────────────────────

function Section({
  title, icon, count, children, defaultOpen = true, accent
}: {
  title: string
  icon: React.ReactNode
  count: number
  children: React.ReactNode
  defaultOpen?: boolean
  accent?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  if (count === 0) return null
  return (
    <div className="space-y-2">
      <button
        className="flex items-center gap-2 w-full text-left"
        onClick={() => setOpen(o => !o)}
      >
        <span className={accent ?? 'text-white/50'}>{icon}</span>
        <span className={`text-[11px] font-bold uppercase tracking-widest ${accent ?? 'text-white/50'}`}>{title}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded border text-center min-w-[20px] ${accent === 'text-amber-400' ? 'bg-amber-500/10 border-amber-500/25 text-amber-400' : accent === 'text-emerald-400' ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400' : 'bg-white/5 border-white/10 text-white/40'}`}>{count}</span>
        <div className="flex-1 h-px bg-white/[0.04]" />
        {open ? <ChevronDown size={12} className="text-white/20" /> : <ChevronRight size={12} className="text-white/20" />}
      </button>
      {open && <div className="space-y-2">{children}</div>}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function WorkstreamBoard() {
  const [data, setData] = useState<WorkstreamData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/data/workstreams.json', { cache: 'no-cache' })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center gap-2 text-white/30 py-12 justify-center text-[13px]">
      <div className="w-4 h-4 border border-white/20 border-t-white/60 rounded-full animate-spin" />
      Loading workstreams…
    </div>
  )

  if (!data) return (
    <div className="text-center py-12 text-white/25 text-[13px]">No workstream data. Sync pending.</div>
  )

  const needsYou = data.workstreams.filter(w => w.status === 'needs_you')
  const active   = data.workstreams.filter(w => w.status === 'active')
  const pending  = data.workstreams.filter(w => w.status === 'pending')
  const blocked  = data.workstreams.filter(w => w.status === 'blocked')

  return (
    <div className="space-y-8 max-w-[900px]">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold text-white">Workstreams</h1>
          <p className="text-[13px] text-white/35 mt-0.5">
            {data.workstreams.length} active workstreams · {needsYou.length > 0 ? `${needsYou.length} need your input` : 'nothing waiting on you'}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-[10px] text-white/25 font-mono">syncs every 5 min</p>
          <p className="text-[10px] text-white/20">{new Date(data.updated_at).toLocaleTimeString()}</p>
        </div>
      </div>

      {/* Your Move — highest urgency */}
      <Section
        title="Your Move"
        icon={<AlertTriangle className="w-3.5 h-3.5" />}
        count={needsYou.length}
        accent="text-amber-400"
        defaultOpen={true}
      >
        {needsYou.map(ws => <WorkstreamRow key={ws.id} ws={ws} showCopyHint={false} />)}
      </Section>

      {/* Active */}
      <Section
        title="Active"
        icon={<CheckCircle2 className="w-3.5 h-3.5" />}
        count={active.length}
        accent="text-emerald-400"
        defaultOpen={true}
      >
        {active.map(ws => <WorkstreamRow key={ws.id} ws={ws} showCopyHint={false} />)}
      </Section>

      {/* Pending — collapsed by default */}
      <Section
        title="Pending"
        icon={<Clock className="w-3.5 h-3.5" />}
        count={pending.length + blocked.length}
        accent="text-white/40"
        defaultOpen={false}
      >
        {blocked.map(ws => <WorkstreamRow key={ws.id} ws={ws} showCopyHint={false} />)}
        {pending.map(ws => <WorkstreamRow key={ws.id} ws={ws} showCopyHint={false} />)}
      </Section>

    </div>
  )
}
