import React, { useState, useEffect } from 'react'
import { ListChecks, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react'

interface Kpi       { label: string; current: string | number; target: string | number }
interface Workstream {
  id: string; name: string; category: string; categoryLabel?: string
  owner: string; supporting?: string[]; status: string
  lastUpdate?: string; nextAction?: string
  kpi?: Kpi; actionLabel?: string; actionUrl?: string; briefUrl?: string
}

const STATUS_DOT: Record<string, string> = {
  active:    'bg-emerald-400',
  running:   'bg-emerald-400',
  needs_you: 'bg-amber-400',
  blocked:   'bg-red-400',
  waiting:   'bg-white/30',
  complete:  'bg-white/20',
  done:      'bg-white/20',
}
const STATUS_LABEL: Record<string, string> = {
  active:    'Active',
  running:   'Running',
  needs_you: 'Needs You',
  blocked:   'Blocked',
  waiting:   'Waiting',
  complete:  'Done',
  done:      'Done',
}
const STATUS_TEXT: Record<string, string> = {
  active:    'text-emerald-400',
  running:   'text-emerald-400',
  needs_you: 'text-amber-400',
  blocked:   'text-red-400',
  waiting:   'text-white/40',
  complete:  'text-white/25',
  done:      'text-white/25',
}

export function MobilePlans() {
  const [workstreams, setWorkstreams] = useState<Workstream[]>([])
  const [expanded,    setExpanded]    = useState<Set<string>>(new Set())

  const refresh = () => {
    fetch('/data/workstreams.json', { cache: 'no-cache' }).then(r => r.json())
      .then(d => setWorkstreams(d.workstreams || d.items || []))
      .catch(() => {})
  }

  useEffect(() => {
    refresh()
    const iv = setInterval(refresh, 30000)
    return () => clearInterval(iv)
  }, [])

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Group by category
  const grouped = workstreams.reduce<Record<string, Workstream[]>>((acc, ws) => {
    const cat = ws.categoryLabel ?? ws.category ?? 'Other'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(ws)
    return acc
  }, {})

  const needsYouCount = workstreams.filter(w => w.status === 'needs_you' || w.status === 'blocked').length

  return (
    <div className="space-y-3">

      {/* ── HEADER SUMMARY ───────────────────────────── */}
      <Card>
        <SectionLabel
          icon={<ListChecks className="w-3.5 h-3.5" />}
          color="text-violet-400"
          label={`Workstreams (${workstreams.length})`}
        />
        <div className="grid grid-cols-3 gap-2 mt-2.5">
          {[
            { label: 'Total',     value: workstreams.length,    color: 'text-white/60' },
            { label: 'Needs You', value: needsYouCount,         color: 'text-amber-400' },
            { label: 'Active',    value: workstreams.filter(w => w.status === 'active' || w.status === 'running').length, color: 'text-emerald-400' },
          ].map(s => (
            <div key={s.label} className="bg-white/[0.03] rounded-lg px-2 py-2 text-center">
              <p className={`text-[20px] font-bold font-mono ${s.color}`}>{s.value}</p>
              <p className="text-[9px] text-white/25 uppercase tracking-wide">{s.label}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* ── GROUPED WORKSTREAMS ───────────────────────── */}
      {Object.entries(grouped).map(([cat, items]) => (
        <Card key={cat}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-2.5">{cat}</p>
          <div className="space-y-1">
            {items.map(ws => {
              const isOpen = expanded.has(ws.id)
              return (
                <div key={ws.id}>
                  {/* Row */}
                  <button
                    onClick={() => toggle(ws.id)}
                    className="w-full flex items-center gap-2.5 py-2 text-left active:opacity-70 transition-opacity"
                  >
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[ws.status] ?? 'bg-white/20'}`} />
                    <span className="flex-1 text-[13px] font-medium text-white/85 leading-snug">{ws.name}</span>
                    <span className={`text-[10px] font-semibold flex-shrink-0 ${STATUS_TEXT[ws.status] ?? 'text-white/30'}`}>
                      {STATUS_LABEL[ws.status] ?? ws.status}
                    </span>
                    {isOpen
                      ? <ChevronDown className="w-3.5 h-3.5 text-white/25 flex-shrink-0" />
                      : <ChevronRight className="w-3.5 h-3.5 text-white/25 flex-shrink-0" />}
                  </button>

                  {/* Expanded detail */}
                  {isOpen && (
                    <div className="ml-4.5 pb-2 pl-2 border-l border-white/[0.06] space-y-2">
                      <p className="text-[10px] text-white/30">
                        Owner: <span className="text-white/55">{ws.owner}</span>
                        {ws.supporting && ws.supporting.length > 0 && (
                          <span> · {ws.supporting.join(', ')}</span>
                        )}
                      </p>

                      {ws.nextAction && (
                        <p className="text-[11px] text-white/50 leading-relaxed">{ws.nextAction}</p>
                      )}

                      {ws.kpi && (
                        <p className="text-[11px] text-white/40">
                          {ws.kpi.label}: <span className="text-white/60 font-mono">{ws.kpi.current}</span>
                          <span className="text-white/25"> / {ws.kpi.target}</span>
                        </p>
                      )}

                      <div className="flex gap-3 pt-0.5">
                        {ws.actionUrl && (
                          <a href={ws.actionUrl} target="_blank" rel="noreferrer"
                            className="flex items-center gap-1 text-[10px] text-violet-400/70 hover:text-violet-400">
                            <ExternalLink className="w-3 h-3" />
                            {ws.actionLabel ?? 'Open'}
                          </a>
                        )}
                        {ws.briefUrl && (
                          <a href={ws.briefUrl} target="_blank" rel="noreferrer"
                            className="flex items-center gap-1 text-[10px] text-white/30 hover:text-white/60">
                            <ExternalLink className="w-3 h-3" />
                            Brief
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Divider */}
                  {items.indexOf(ws) < items.length - 1 && (
                    <div className="border-t border-white/[0.04]" />
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      ))}

      {workstreams.length === 0 && (
        <Card>
          <p className="text-[12px] text-white/30">No workstreams loaded</p>
        </Card>
      )}

    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4 backdrop-blur-sm">
      {children}
    </div>
  )
}

function SectionLabel({ icon, color, label }: { icon: React.ReactNode; color: string; label: string }) {
  return (
    <div className={`flex items-center gap-2 ${color}`}>
      {icon}
      <span className="text-[11px] font-bold uppercase tracking-widest">{label}</span>
    </div>
  )
}
