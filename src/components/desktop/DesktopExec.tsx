import React, { useEffect, useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Brain, Radio, Zap, ExternalLink } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { AgentAvatar } from '../shared/AgentAvatar'

interface ZaraSignal {
  id: string
  signal_type: string | null
  venture: string | null
  company_name: string | null
  description: string | null
  source_url: string | null
  signal_score: number | null
  status: string | null
  surfaced_at: string | null
  summary: string | null
}

interface ExternalSignal {
  signal: string
  source: string
  relevance: string
  recommended_action: string
}

interface MarcusSynthesis {
  id: string
  week_of: string
  insights: string[]
  cleo_recommendations: string | null
  org_focus: string | null
  generated_at: string | null
}

type VentureFilter = 'all' | 'mindmaker' | 'adfixus' | 'personal-brand'

type LoadState = 'loading' | 'ok' | 'error'

export function DesktopExec() {
  const [assessment, setAssessment] = useState<string | null>(null)
  const [externalSignals, setExternalSignals] = useState<ExternalSignal[]>([])
  const [synthesis, setSynthesis] = useState<MarcusSynthesis | null>(null)
  const [signals, setSignals] = useState<ZaraSignal[]>([])
  const [ventureFilter, setVentureFilter] = useState<VentureFilter>('all')
  const [intelState, setIntelState] = useState<LoadState>('loading')
  const [intelError, setIntelError] = useState<string | null>(null)
  const [synthState, setSynthState] = useState<LoadState>('loading')
  const [signalsState, setSignalsState] = useState<LoadState>('loading')
  const [signalsError, setSignalsError] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('home_intelligence').select('assessment,external_signals').eq('id', 'current').maybeSingle().then(({ data, error }) => {
      if (error) { setIntelState('error'); setIntelError(error.message); return }
      if (data) {
        setAssessment((data as any).assessment || null)
        setExternalSignals(Array.isArray((data as any).external_signals) ? (data as any).external_signals : [])
      }
      setIntelState('ok')
    })

    supabase.from('marcus_synthesis').select('*').order('generated_at', { ascending: false, nullsFirst: false }).limit(1).maybeSingle().then(({ data, error }) => {
      if (error) {
        // marcus_synthesis may be empty or missing — log but don't surface; it's a minor section.
        console.warn('marcus_synthesis load failed:', error.message)
      }
      setSynthesis((data as any) || null)
      setSynthState('ok')
    })

    supabase.from('zara_signals').select('*').order('surfaced_at', { ascending: false }).limit(30).then(({ data, error }) => {
      if (error) { setSignalsState('error'); setSignalsError(error.message); return }
      setSignals((data as ZaraSignal[]) || [])
      setSignalsState('ok')
    })
  }, [])

  const filteredSignals = useMemo(() => {
    if (ventureFilter === 'all') return signals
    return signals.filter(s => (s.venture || '').toLowerCase() === ventureFilter)
  }, [signals, ventureFilter])

  return (
    <div className="space-y-5 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl xl:text-[26px] font-semibold text-white tracking-tight">Intelligence</h1>
        <p className="text-xs md:text-[12px] text-white/40 mt-1">Strategic assessment, market signals, and external intelligence.</p>
      </div>

      <div className="grid grid-cols-12 gap-4 md:gap-5">

        <section className="col-span-12 xl:col-span-5 space-y-4">

          <SectionHeader icon={<Brain size={13} className="text-violet-400" />} label="Strategic Assessment" />
          {intelState === 'loading' ? (
            <LoadingTile />
          ) : intelState === 'error' ? (
            <ErrorTile message={intelError} />
          ) : assessment ? (
            <div className="rounded-xl border border-violet-500/15 bg-violet-500/[0.03] p-4 space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <AgentAvatar agent="marcus" size="sm" />
                <span className="text-[11px] text-white/50">Marcus — Cross-Domain Synthesis</span>
              </div>
              <p className="text-[13px] text-white/75 leading-relaxed whitespace-pre-wrap">{assessment}</p>
            </div>
          ) : (
            <EmptyTile title="No assessment yet" subtitle="Marcus will generate this during his next synthesis run." />
          )}

          {synthState === 'ok' && synthesis && Array.isArray(synthesis.insights) && synthesis.insights.length > 0 && (
            <>
              <SectionHeader icon={<Zap size={13} className="text-amber-400" />} label={`Weekly Insights — ${synthesis.week_of}`} />
              <div className="space-y-2">
                {synthesis.insights.map((insight, i) => (
                  <div key={i} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                    <p className="text-[12px] text-white/65 leading-relaxed">{insight}</p>
                  </div>
                ))}
                {synthesis.org_focus && (
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-400/70 mb-1">Org Focus</p>
                    <p className="text-[12px] text-amber-200/70 leading-relaxed">{synthesis.org_focus}</p>
                  </div>
                )}
                {synthesis.cleo_recommendations && (
                  <div className="rounded-lg border border-blue-500/20 bg-blue-500/[0.04] p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-400/70 mb-1">Content Recommendation</p>
                    <p className="text-[12px] text-blue-200/70 leading-relaxed">{synthesis.cleo_recommendations}</p>
                  </div>
                )}
              </div>
            </>
          )}

          {externalSignals.length > 0 && (
            <>
              <SectionHeader icon={<Radio size={13} className="text-emerald-400" />} label="External Signals" />
              <div className="space-y-2">
                {externalSignals.map((es, i) => (
                  <div key={i} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                    <div className="flex items-start gap-2">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded border font-semibold uppercase tracking-wider flex-shrink-0 mt-0.5 ${
                        es.relevance === 'Critical' ? 'text-rose-300 border-rose-500/25 bg-rose-500/10' :
                        es.relevance === 'High' ? 'text-amber-300 border-amber-500/25 bg-amber-500/10' :
                        'text-white/40 border-white/10 bg-white/[0.04]'
                      }`}>{es.relevance}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] text-white/70 leading-snug">{es.signal}</p>
                        <p className="text-[10px] text-white/30 mt-1">Source: {es.source}</p>
                        {es.recommended_action && (
                          <p className="text-[11px] text-emerald-300/60 mt-1.5 leading-snug">→ {es.recommended_action}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="col-span-12 xl:col-span-7 space-y-4">
          <div className="flex items-center gap-3">
            <SectionHeader icon={<Zap size={13} className="text-rose-400" />} label="Zara Signal Feed" />
            <div className="flex gap-1.5 ml-auto">
              {(['all', 'mindmaker', 'adfixus', 'personal-brand'] as VentureFilter[]).map(v => (
                <button
                  key={v}
                  onClick={() => setVentureFilter(v)}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-medium border transition-all ${
                    ventureFilter === v
                      ? 'bg-violet-500/15 border-violet-500/35 text-white'
                      : 'border-white/[0.08] text-white/40 hover:text-white/70'
                  }`}
                >{v === 'all' ? 'All' : v === 'personal-brand' ? 'Brand' : v.charAt(0).toUpperCase() + v.slice(1)}</button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] xl:max-h-[calc(100vh-12rem)] xl:overflow-y-auto">
            {signalsState === 'loading' ? (
              <div className="p-10 text-center">
                <p className="text-[12px] text-white/35">Loading signals…</p>
              </div>
            ) : signalsState === 'error' ? (
              <div className="p-10 text-center">
                <p className="text-[13px] text-rose-300 font-medium">Couldn't load signals.</p>
                <p className="text-[11px] text-rose-300/60 mt-1 font-mono">{signalsError}</p>
              </div>
            ) : filteredSignals.length === 0 ? (
              <div className="p-10 text-center">
                <Radio size={20} className="text-white/20 mx-auto mb-3" />
                <p className="text-[13px] text-white/45 font-medium">No signals yet.</p>
                <p className="text-[11px] text-white/25 mt-1">Zara will surface market signals on her next sweep.</p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {filteredSignals.map(s => (
                  <div key={s.id} className="p-3.5 hover:bg-white/[0.015] transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-0.5">
                        {s.signal_score !== null && s.signal_score !== undefined && s.signal_score > 0 ? (
                          <span className={`text-[11px] font-mono font-bold ${
                            s.signal_score >= 8 ? 'text-emerald-400' : s.signal_score >= 5 ? 'text-amber-400' : 'text-white/40'
                          }`}>{s.signal_score}</span>
                        ) : (
                          <span className="text-[11px] text-white/20">—</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          {s.venture && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded border border-white/10 bg-white/[0.04] text-white/40 uppercase tracking-wider font-medium">{s.venture}</span>
                          )}
                          {s.signal_type && (
                            <span className="text-[9px] text-white/25">{s.signal_type}</span>
                          )}
                          {s.status && (
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                              s.status === 'actioned' ? 'text-emerald-300 bg-emerald-500/10' :
                              s.status === 'received' ? 'text-blue-300 bg-blue-500/10' :
                              s.status === 'expired' ? 'text-white/25 bg-white/[0.03]' :
                              'text-white/30 bg-white/[0.04]'
                            }`}>{s.status}</span>
                          )}
                        </div>
                        <p className="text-[12.5px] text-white/75 leading-snug">{s.description}</p>
                        {s.company_name && <p className="text-[11px] text-white/40 mt-1">{s.company_name}</p>}
                        <div className="flex items-center gap-3 mt-2 text-[10px] text-white/25">
                          {s.surfaced_at && <span>{formatDistanceToNow(new Date(s.surfaced_at), { addSuffix: true })}</span>}
                          {s.source_url && s.source_url !== 'https://example.com/test-podcast' && (
                            <a href={s.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-violet-400/50 hover:text-violet-400">
                              <ExternalLink size={10} /> Source
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 h-5">
      {icon}
      <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45 flex-1">{label}</h2>
    </div>
  )
}

function EmptyTile({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-8 text-center">
      <p className="text-[13px] text-white/45 font-medium">{title}</p>
      {subtitle && <p className="text-[12px] text-white/25 mt-1">{subtitle}</p>}
    </div>
  )
}

function LoadingTile() {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-8 text-center">
      <p className="text-[12px] text-white/35">Loading…</p>
    </div>
  )
}

function ErrorTile({ message }: { message?: string | null }) {
  return (
    <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.04] p-6 text-center">
      <p className="text-[13px] text-rose-300 font-medium">Couldn't load.</p>
      {message && <p className="text-[11px] text-rose-300/60 mt-1 font-mono">{message}</p>}
    </div>
  )
}
