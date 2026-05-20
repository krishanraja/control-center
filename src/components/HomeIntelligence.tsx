import React, { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp, AlertTriangle, Compass } from 'lucide-react'
import { AgentAvatar } from './shared/AgentAvatar'
import { StatusPill } from './shared/StatusPill'

// Marcus's prompt sometimes folds empty system-health rows into the
// "Top blockers" sentence ("…Top blockers: Health alert: 0 down, 0 stale…").
// We strip those tokens client-side so they don't render as actionable noise.
// The Marcus prompt patch is the source-side fix; this is defence in depth.
const BODY_NOISE_PATTERNS: RegExp[] = [
  /Top blockers:\s*Health alert:\s*0\s*down,\s*0\s*stale[^.]*\.?/gi,
  /Health alert:\s*0\s*down,\s*0\s*stale[^,.]*[,.]?\s*/gi,
]

function scrubBody(body: string): string {
  let out = body
  for (const re of BODY_NOISE_PATTERNS) out = out.replace(re, '')
  return out.replace(/\s{2,}/g, ' ').trim()
}

// ── Schema v1 ────────────────────────────────────────────────────────────
interface Metric {
  id: string
  label: string
  value: string
  target: string
  progress_pct: number
  interpretation: string
  status: string
}

interface ExternalSignal {
  signal: string
  source: string
  relevance: string
  recommended_action: string | null
}

interface V1Data {
  generated_at: string
  strategic_assessment: {
    headline: string
    body: string
    recommended_focus: string
  }
  metrics: Metric[]
  external_signals: ExternalSignal[]
}

// ── Schema v2 ────────────────────────────────────────────────────────────
interface TopAction {
  id: string
  title: string
  owner: string
  status: string
}

interface V2Data {
  generated_at: string
  executive_summary: string
  top_3_actions: TopAction[]
  agent_health: {
    total_agents: number
    brief_files: number
    all_have_mcf: boolean
  }
  system_health: {
    contradictions: number
    workspace_clean: boolean
    control_center_synced: boolean
  }
}

const statusBar: Record<string, string> = {
  blocked:     'bg-red-400',
  at_risk:     'bg-amber-400',
  on_track:    'bg-violet-400',
  in_progress: 'bg-blue-400',
  waiting:     'bg-white/30',
  ahead:       'bg-emerald-400',
  done:        'bg-emerald-400',
}

const statusDot: Record<string, string> = {
  blocked:     'text-red-400',
  at_risk:     'text-amber-400',
  on_track:    'text-white/30',
  in_progress: 'text-blue-400',
  waiting:     'text-white/30',
  ahead:       'text-emerald-400',
  done:        'text-emerald-400',
}

const statusLabel: Record<string, string> = {
  blocked:     'Blocked',
  at_risk:     'At risk',
  on_track:    'On track',
  in_progress: 'In progress',
  waiting:     'Waiting',
  ahead:       'Ahead',
  done:        'Done',
}

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(ms)) return ''
  const h = Math.floor(ms / 3_600_000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function truncate(text: string, words: number) {
  const parts = text.split(/\s+/)
  if (parts.length <= words) return { text, truncated: false }
  return { text: parts.slice(0, words).join(' ') + '…', truncated: true }
}

function isV1(d: any): d is V1Data {
  return d && typeof d === 'object' && d.strategic_assessment && typeof d.strategic_assessment.body === 'string'
}

function isV2(d: any): d is V2Data {
  return d && typeof d === 'object' && typeof d.executive_summary === 'string'
}

// ── V1 View ──────────────────────────────────────────────────────────────
function V1View({ data }: { data: V1Data }) {
  const [expanded, setExpanded] = useState(false)
  const { strategic_assessment: sa, metrics = [], external_signals = [], generated_at } = data
  const body = scrubBody((sa.body ?? '').replace(/\n\n/g, ' '))
  const bodyResult = truncate(body, 55)

  return (
    <div className="space-y-5">
      {/* Lead with structured action cards — one per external signal. These
          already have signal/relevance/recommended_action fields; previously
          rendered as small bulleted text. Now they're the headline. */}
      {external_signals.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <AlertTriangle size={12} className="text-amber-300" />
            <p className="text-[10px] font-bold text-amber-300 uppercase tracking-widest">
              What needs you · {external_signals.length}
            </p>
          </div>
          <div className="space-y-2">
            {external_signals.map((sig, i) => (
              <IntelligenceActionCard key={i} signal={sig} />
            ))}
          </div>
        </div>
      )}

      {metrics.length > 0 && (
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <div className="flex gap-3 min-w-max md:min-w-0 md:grid md:grid-cols-5">
            {metrics.map(m => {
              const dot = statusDot[m.status] ?? 'text-white/20'
              const bar = statusBar[m.status] ?? 'bg-white/20'
              return (
                <div key={m.id} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 w-36 md:w-auto flex-shrink-0">
                  <p className={`text-[9px] font-bold uppercase tracking-widest mb-1.5 ${dot}`}>{m.label}</p>
                  <div className="flex items-baseline gap-1 mb-1.5">
                    <span className="text-[17px] font-bold text-white leading-none">{m.value}</span>
                    <span className="text-[11px] text-white/30">/ {m.target}</span>
                  </div>
                  <div className="h-0.5 bg-white/[0.07] rounded-full overflow-hidden">
                    <div className={`h-full ${bar} rounded-full`} style={{ width: `${Math.min(m.progress_pct, 100)}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
        <p className="text-[10px] font-bold text-white/25 uppercase tracking-widest mb-3">
          Marcus context{generated_at ? ` · ${timeAgo(generated_at)}` : ''}
        </p>
        {sa.headline && (
          <p className="text-[15px] font-semibold text-white leading-snug mb-3">{sa.headline}</p>
        )}
        {body && (
          <>
            <p className="text-[13px] text-white/50 leading-relaxed">
              {expanded ? body : bodyResult.text}
            </p>
            {bodyResult.truncated && (
              <button
                onClick={() => setExpanded(e => !e)}
                className="flex items-center gap-1 mt-2 text-[12px] text-white/25 hover:text-white/50 transition-colors"
              >
                {expanded ? <><ChevronUp className="w-3 h-3" />Less</> : <><ChevronDown className="w-3 h-3" />Read more</>}
              </button>
            )}
          </>
        )}
        {sa.recommended_focus && (
          <div className="mt-4 pt-4 border-t border-white/[0.05] flex items-start gap-2">
            <Compass size={11} className="text-amber-400/70 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-[10px] font-bold text-amber-400/60 uppercase tracking-widest mb-1.5">Focus this week</p>
              <p className="text-[13px] text-amber-200/70 leading-relaxed">{sa.recommended_focus}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function IntelligenceActionCard({ signal: sig }: { signal: ExternalSignal }) {
  return (
    <article className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4">
      <p className="text-[13px] font-semibold text-white leading-snug">{sig.signal}</p>
      {sig.relevance && (
        <p className="text-[12px] text-white/65 leading-snug mt-2">
          <span className="text-white/35">Why it matters: </span>
          {sig.relevance}
        </p>
      )}
      {sig.recommended_action && (
        <p className="text-[12px] text-amber-200/85 leading-snug mt-2">
          <span className="text-amber-300/55">Move: </span>
          {sig.recommended_action}
        </p>
      )}
      {sig.source && (
        <p className="text-[10px] text-white/35 mt-2 truncate">{sig.source}</p>
      )}
    </article>
  )
}

// ── V2 View ──────────────────────────────────────────────────────────────
function V2View({ data }: { data: V2Data }) {
  const actions = data.top_3_actions ?? []
  const agentHealth = data.agent_health
  const sysHealth = data.system_health
  const sysOk =
    sysHealth &&
    sysHealth.contradictions === 0 &&
    sysHealth.workspace_clean &&
    sysHealth.control_center_synced

  return (
    <div className="space-y-5">
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
        <p className="text-[10px] font-bold text-white/25 uppercase tracking-widest mb-3">
          Executive Summary{data.generated_at ? ` · ${timeAgo(data.generated_at)}` : ''}
        </p>
        <p className="text-[15px] font-semibold text-white leading-snug">
          {data.executive_summary}
        </p>
      </div>

      {actions.length > 0 && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden">
          <div className="px-5 pt-4 pb-3 border-b border-white/[0.05] flex items-center justify-between">
            <p className="text-[10px] font-bold text-white/25 uppercase tracking-widest">
              Top {actions.length} Actions
            </p>
            <span className="text-[10px] text-white/20">{actions.length}</span>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {actions.map(a => (
              <div key={a.id} className="px-5 py-3 flex items-start gap-3">
                <AgentAvatar agent={a.owner} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-white/85 leading-snug">{a.title}</p>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="text-[11px] font-medium text-white/55">{a.owner}</span>
                    <StatusPill status={a.status} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {agentHealth && (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
            <p className="text-[10px] font-bold text-white/25 uppercase tracking-widest mb-2">Agent Health</p>
            <div className="flex items-baseline gap-2">
              <span className="text-[20px] font-bold text-white leading-none">{agentHealth.brief_files}</span>
              <span className="text-[12px] text-white/30">/ {agentHealth.total_agents} briefs</span>
            </div>
            <p className={`text-[11px] mt-2 ${agentHealth.all_have_mcf ? 'text-emerald-400/80' : 'text-amber-300/80'}`}>
              {agentHealth.all_have_mcf ? 'All agents standardized with MCF' : 'MCF coverage incomplete'}
            </p>
          </div>
        )}
        {sysHealth && (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
            <p className="text-[10px] font-bold text-white/25 uppercase tracking-widest mb-2">System Health</p>
            <span className={`text-[20px] font-bold leading-none ${sysOk ? 'text-emerald-400' : 'text-amber-300'}`}>
              {sysOk ? 'Healthy' : 'Attention'}
            </span>
            <div className="mt-2 space-y-1">
              <p className="text-[11px] text-white/40">
                Contradictions: <span className={sysHealth.contradictions === 0 ? 'text-emerald-400/80' : 'text-red-400/80'}>{sysHealth.contradictions}</span>
              </p>
              <p className="text-[11px] text-white/40">
                Workspace: <span className={sysHealth.workspace_clean ? 'text-emerald-400/80' : 'text-amber-300/80'}>{sysHealth.workspace_clean ? 'clean' : 'dirty'}</span>
              </p>
              <p className="text-[11px] text-white/40">
                CC sync: <span className={sysHealth.control_center_synced ? 'text-emerald-400/80' : 'text-amber-300/80'}>{sysHealth.control_center_synced ? 'live' : 'stale'}</span>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Root ─────────────────────────────────────────────────────────────────
export function HomeIntelligence() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const { supabase } = await import('../lib/supabase')
        const { data: hi } = await supabase.from('home_intelligence').select('*').eq('id', 'current').single()
        if (hi) {
          // Reconstruct the shape the UI expects
          const parsed: any = {
            generated_at: hi.generated_at || hi.updated_at,
            version: hi.version,
          }
          if (hi.version === 2 || hi.summary) {
            try {
              const summary = typeof hi.summary === 'string' ? JSON.parse(hi.summary) : hi.summary
              Object.assign(parsed, summary)
            } catch { parsed.executive_summary = hi.assessment || hi.summary }
          }
          if (hi.assessment && !parsed.strategic_assessment) {
            parsed.strategic_assessment = { headline: '', body: hi.assessment, recommended_focus: '' }
          }
          if (hi.metrics) {
            try { parsed.metrics = typeof hi.metrics === 'string' ? JSON.parse(hi.metrics) : hi.metrics } catch {}
          }
          if (hi.external_signals) {
            try { parsed.external_signals = typeof hi.external_signals === 'string' ? JSON.parse(hi.external_signals) : hi.external_signals } catch {}
          }

          // Enrich agent_health.brief_files from Supabase agents table
          // instead of relying on static JSON file counts
          if (parsed.agent_health) {
            try {
              const { data: agentRows } = await supabase
                .from('agents')
                .select('id,brief_content,brief_updated_at')
                .eq('active', true)
              if (agentRows) {
                const withBriefs = agentRows.filter((a: any) => a.brief_content && a.brief_content.length > 0)
                parsed.agent_health.brief_files = withBriefs.length
                parsed.agent_health.total_agents = agentRows.length
              }
            } catch { /* keep existing values */ }
          }

          setData(parsed)
        }
      } catch (e) { console.error('HomeIntelligence load error:', e) }
      setLoading(false)
    }
    load()
    const iv = setInterval(load, 30_000) // 30s instead of 5min
    return () => clearInterval(iv)
  }, [])

  if (loading) return <div className="py-16 text-center text-[13px] text-white/30">Loading…</div>
  if (!data) return <div className="py-16 text-center text-[13px] text-white/30">No intelligence yet</div>

  if (isV1(data)) return <V1View data={data} />
  if (isV2(data)) return <V2View data={data} />
  return <div className="py-16 text-center text-[13px] text-white/30">No intelligence yet</div>
}
