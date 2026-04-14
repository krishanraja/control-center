import React, { useState, useEffect, useCallback } from 'react'
import { Zap, TrendingDown, DollarSign, GitBranch, RefreshCw, CheckCircle2, XCircle, Clock, Play, RotateCcw, AlertTriangle } from 'lucide-react'

// ---- Types ----

interface WorkflowProposal {
  id: string
  title: string
  agent: string
  proposal_type: string
  estimated_savings: number | null
  estimated_cost: number | null
  status: string
  created_at: string
  metadata?: string | Record<string, unknown>
}

interface WorkflowRun {
  id: string
  workflow_name: string
  agent: string
  duration_ms: number | null
  cost: number | null
  quality_score: number | null
  status: string
  created_at: string
  metadata?: string | Record<string, unknown>
}

interface AgentCapability {
  id: string
  agent: string
  monthly_spend: number | null
  monthly_budget: number | null
  capability: string | null
  metadata?: string | Record<string, unknown>
}

// ---- Helpers ----

function timeAgo(iso: string | null): string {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  proposed:    { bg: 'bg-violet-500/15', text: 'text-violet-300' },
  approved:    { bg: 'bg-emerald-500/15', text: 'text-emerald-300' },
  rejected:    { bg: 'bg-rose-500/15', text: 'text-rose-300' },
  executing:   { bg: 'bg-amber-500/15', text: 'text-amber-300' },
  completed:   { bg: 'bg-emerald-500/15', text: 'text-emerald-300' },
  rolled_back: { bg: 'bg-rose-500/15', text: 'text-rose-300' },
}

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] || { bg: 'bg-white/[0.06]', text: 'text-white/50' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${style.bg} ${style.text}`}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

function qualityColor(score: number | null): string {
  if (score === null || score === undefined) return 'text-white/30'
  if (score > 0.8) return 'text-emerald-400'
  if (score >= 0.5) return 'text-amber-400'
  return 'text-rose-400'
}

function qualityBg(score: number | null): string {
  if (score === null || score === undefined) return 'bg-white/[0.04]'
  if (score > 0.8) return 'bg-emerald-500/10'
  if (score >= 0.5) return 'bg-amber-500/10'
  return 'bg-rose-500/10'
}

// ---- Sub-sections ----

function ActiveProposals({
  proposals,
  loading,
  onAction,
}: {
  proposals: WorkflowProposal[]
  loading: boolean
  onAction: (id: string, action: 'approved' | 'rejected') => void
}) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-6">
        <div className="flex items-center gap-2 text-white/30 text-[13px]">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading proposals...
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] overflow-hidden">
      <div className="px-5 py-4 border-b border-white/[0.05] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-violet-400" />
          <h2 className="text-[13px] font-bold text-white/90">Active Proposals</h2>
        </div>
        <span className="text-[11px] text-white/30">{proposals.length} total</span>
      </div>

      {proposals.length === 0 ? (
        <div className="px-5 py-8 text-center text-[12px] text-white/25">No workflow proposals yet</div>
      ) : (
        <div className="divide-y divide-white/[0.04]">
          {proposals.map((p) => (
            <div key={p.id} className="px-5 py-3.5 hover:bg-white/[0.02] transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-white/90 truncate">{p.title}</p>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-[11px] text-white/40 capitalize">{p.agent}</span>
                    <span className="text-[11px] text-white/25">|</span>
                    <span className="text-[11px] text-white/40">{p.proposal_type || 'general'}</span>
                    {p.estimated_savings != null && (
                      <>
                        <span className="text-[11px] text-white/25">|</span>
                        <span className="text-[11px] text-emerald-400 flex items-center gap-0.5">
                          <TrendingDown className="w-3 h-3" />
                          Saves ${p.estimated_savings.toFixed(2)}
                        </span>
                      </>
                    )}
                    {p.estimated_cost != null && (
                      <>
                        <span className="text-[11px] text-white/25">|</span>
                        <span className="text-[11px] text-amber-400 flex items-center gap-0.5">
                          <DollarSign className="w-3 h-3" />
                          Cost ${p.estimated_cost.toFixed(2)}
                        </span>
                      </>
                    )}
                    <span className="text-[11px] text-white/25">|</span>
                    <span className="text-[10px] text-white/20 font-mono">{timeAgo(p.created_at)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <StatusBadge status={p.status} />
                  {p.status === 'proposed' && (
                    <div className="flex items-center gap-1 ml-2">
                      <button
                        onClick={() => onAction(p.id, 'approved')}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[11px] font-medium transition-colors"
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        Approve
                      </button>
                      <button
                        onClick={() => onAction(p.id, 'rejected')}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[11px] font-medium transition-colors"
                      >
                        <XCircle className="w-3 h-3" />
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RecentRuns({ runs, loading }: { runs: WorkflowRun[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-6">
        <div className="flex items-center gap-2 text-white/30 text-[13px]">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading runs...
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] overflow-hidden">
      <div className="px-5 py-4 border-b border-white/[0.05] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Play className="w-4 h-4 text-emerald-400" />
          <h2 className="text-[13px] font-bold text-white/90">Recent Workflow Runs</h2>
        </div>
        <span className="text-[11px] text-white/30">{runs.length} shown</span>
      </div>

      {runs.length === 0 ? (
        <div className="px-5 py-8 text-center text-[12px] text-white/25">No workflow runs recorded</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/[0.05]">
                <th className="px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest text-white/30">Workflow</th>
                <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-white/30">Agent</th>
                <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-white/30">Status</th>
                <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-white/30">Duration</th>
                <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-white/30">Cost</th>
                <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-white/30">Quality</th>
                <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-white/30">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.03]">
              {runs.map((r) => (
                <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-5 py-2.5 text-[12px] text-white/80 max-w-[220px] truncate">{r.workflow_name}</td>
                  <td className="px-3 py-2.5 text-[12px] text-white/50 capitalize">{r.agent}</td>
                  <td className="px-3 py-2.5"><StatusBadge status={r.status} /></td>
                  <td className="px-3 py-2.5 text-[12px] text-white/50 font-mono">
                    {r.duration_ms != null ? `${(r.duration_ms / 1000).toFixed(1)}s` : '-'}
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-white/50 font-mono">
                    {r.cost != null ? `$${r.cost.toFixed(3)}` : '-'}
                  </td>
                  <td className="px-3 py-2.5">
                    {r.quality_score != null ? (
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${qualityBg(r.quality_score)} ${qualityColor(r.quality_score)}`}>
                        {(r.quality_score * 100).toFixed(0)}%
                      </span>
                    ) : (
                      <span className="text-[11px] text-white/20">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-[10px] text-white/25 font-mono">{timeAgo(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function CostDashboard({ capabilities, loading }: { capabilities: AgentCapability[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-6">
        <div className="flex items-center gap-2 text-white/30 text-[13px]">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading cost data...
        </div>
      </div>
    )
  }

  const totalSpend = capabilities.reduce((sum, c) => sum + (c.monthly_spend || 0), 0)
  const totalBudget = capabilities.reduce((sum, c) => sum + (c.monthly_budget || 0), 0)

  return (
    <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] overflow-hidden">
      <div className="px-5 py-4 border-b border-white/[0.05] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-amber-400" />
          <h2 className="text-[13px] font-bold text-white/90">Cost Dashboard</h2>
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <span className="text-white/40">Total: <span className="text-white/70 font-mono">${totalSpend.toFixed(2)}</span></span>
          {totalBudget > 0 && (
            <span className="text-white/30">of <span className="text-white/50 font-mono">${totalBudget.toFixed(2)}</span></span>
          )}
        </div>
      </div>

      {capabilities.length === 0 ? (
        <div className="px-5 py-8 text-center text-[12px] text-white/25">No agent cost data available</div>
      ) : (
        <div className="divide-y divide-white/[0.04]">
          {capabilities.map((c) => {
            const spend = c.monthly_spend || 0
            const budget = c.monthly_budget || 1
            const pct = Math.min((spend / budget) * 100, 100)
            const overBudget = spend > budget
            const barColor = overBudget ? 'bg-rose-400' : pct > 75 ? 'bg-amber-400' : 'bg-emerald-400'
            const barGlow = overBudget ? 'shadow-rose-400/30' : pct > 75 ? 'shadow-amber-400/30' : 'shadow-emerald-400/30'

            return (
              <div key={c.id} className="px-5 py-3.5 hover:bg-white/[0.02] transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-white/80 capitalize">{c.agent}</span>
                    {c.capability && (
                      <span className="text-[10px] text-white/25">{c.capability}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className={overBudget ? 'text-rose-400 font-semibold' : 'text-white/50'}>
                      ${spend.toFixed(2)}
                    </span>
                    <span className="text-white/20">/</span>
                    <span className="text-white/30">${budget.toFixed(2)}</span>
                    {overBudget && (
                      <AlertTriangle className="w-3 h-3 text-rose-400" />
                    )}
                  </div>
                </div>
                <div className="w-full h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className={`h-full rounded-full ${barColor} shadow-sm ${barGlow} transition-all duration-500`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {totalBudget > 0 && (
        <div className="px-5 py-3 border-t border-white/[0.05]">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold text-white/50">System Total</span>
            <span className="text-[11px] text-white/40 font-mono">
              {((totalSpend / totalBudget) * 100).toFixed(0)}% utilized
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                totalSpend > totalBudget
                  ? 'bg-rose-400 shadow-rose-400/30'
                  : (totalSpend / totalBudget) > 0.75
                    ? 'bg-amber-400 shadow-amber-400/30'
                    : 'bg-emerald-400 shadow-emerald-400/30'
              } shadow-sm`}
              style={{ width: `${Math.min((totalSpend / totalBudget) * 100, 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ---- Main Component ----

export function WorkflowImprovements() {
  const [proposals, setProposals] = useState<WorkflowProposal[]>([])
  const [runs, setRuns] = useState<WorkflowRun[]>([])
  const [capabilities, setCapabilities] = useState<AgentCapability[]>([])
  const [loadingProposals, setLoadingProposals] = useState(true)
  const [loadingRuns, setLoadingRuns] = useState(true)
  const [loadingCosts, setLoadingCosts] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)

  const loadAll = useCallback(() => {
    setLoadingProposals(true)
    setLoadingRuns(true)
    setLoadingCosts(true)
    setError(null)

    import('../lib/supabase').then(({ supabase }) => {
      // Fetch proposals
      supabase
        .from('workflow_proposals')
        .select('*')
        .order('created_at', { ascending: false })
        .then(({ data, error: err }) => {
          if (err) setError(prev => prev ? `${prev}; proposals: ${err.message}` : `proposals: ${err.message}`)
          setProposals((data as WorkflowProposal[]) || [])
          setLoadingProposals(false)
        })

      // Fetch runs
      supabase
        .from('workflow_runs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20)
        .then(({ data, error: err }) => {
          if (err) setError(prev => prev ? `${prev}; runs: ${err.message}` : `runs: ${err.message}`)
          setRuns((data as WorkflowRun[]) || [])
          setLoadingRuns(false)
        })

      // Fetch agent capabilities for cost data
      supabase
        .from('agent_capabilities')
        .select('*')
        .then(({ data, error: err }) => {
          if (err) setError(prev => prev ? `${prev}; costs: ${err.message}` : `costs: ${err.message}`)
          setCapabilities((data as AgentCapability[]) || [])
          setLoadingCosts(false)
        })

      setLastRefreshed(new Date())
    }).catch(e => {
      setError(e.message)
      setLoadingProposals(false)
      setLoadingRuns(false)
      setLoadingCosts(false)
    })
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const handleProposalAction = useCallback((id: string, action: 'approved' | 'rejected') => {
    import('../lib/supabase').then(({ supabase }) => {
      supabase
        .from('workflow_proposals')
        .update({ status: action })
        .eq('id', id)
        .then(({ error: err }) => {
          if (err) {
            setError(`Failed to update proposal: ${err.message}`)
            return
          }
          setProposals(prev =>
            prev.map(p => p.id === id ? { ...p, status: action } : p)
          )
        })
    })
  }, [])

  const allLoading = loadingProposals && loadingRuns && loadingCosts

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-white">Workflows</h1>
          <p className="text-[13px] text-white/30 mt-0.5">Pipeline runs, improvement proposals, and cost tracking</p>
        </div>
        <button
          onClick={loadAll}
          disabled={allLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.08] disabled:opacity-40 text-white/40 hover:text-white/60 text-[11px] transition-colors"
        >
          <RefreshCw className={`w-3 h-3 ${allLoading ? 'animate-spin' : ''}`} />
          {allLoading ? 'Refreshing...' : lastRefreshed ? `Refreshed ${timeAgo(lastRefreshed.toISOString())}` : 'Refresh'}
        </button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-violet-500/15 bg-violet-500/[0.04] px-4 py-3 flex items-center gap-3">
          <GitBranch className="w-5 h-5 text-violet-400 flex-shrink-0" />
          <div>
            <p className="text-[18px] font-bold text-white">{proposals.filter(p => p.status === 'proposed').length}</p>
            <p className="text-[10px] text-white/35 uppercase tracking-wider font-semibold">Pending Proposals</p>
          </div>
        </div>
        <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.04] px-4 py-3 flex items-center gap-3">
          <Zap className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <div>
            <p className="text-[18px] font-bold text-white">{runs.filter(r => r.status === 'completed').length}</p>
            <p className="text-[10px] text-white/35 uppercase tracking-wider font-semibold">Completed Runs</p>
          </div>
        </div>
        <div className="rounded-xl border border-amber-500/15 bg-amber-500/[0.04] px-4 py-3 flex items-center gap-3">
          <DollarSign className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <div>
            <p className="text-[18px] font-bold text-white">
              ${capabilities.reduce((sum, c) => sum + (c.monthly_spend || 0), 0).toFixed(2)}
            </p>
            <p className="text-[10px] text-white/35 uppercase tracking-wider font-semibold">Monthly Spend</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-4 py-3">
          <p className="text-[11px] text-amber-300/70">
            <strong className="text-amber-300/90">Note:</strong> Some data may not be available yet. {error}
          </p>
        </div>
      )}

      {/* Active Proposals */}
      <ActiveProposals proposals={proposals} loading={loadingProposals} onAction={handleProposalAction} />

      {/* Recent Runs */}
      <RecentRuns runs={runs} loading={loadingRuns} />

      {/* Cost Dashboard */}
      <CostDashboard capabilities={capabilities} loading={loadingCosts} />

      {/* Pipeline info */}
      <div className="rounded-xl border border-violet-500/10 bg-violet-500/[0.03] px-4 py-3">
        <p className="text-[11px] text-violet-300/50 leading-relaxed">
          <strong className="text-violet-300/70">Content Pipeline</strong> runs daily at 8 AM UTC:
          Zara fetches signals, Cleo generates content briefs, Maya schedules social posts, and Felix queues newsletter items.
          Results are logged to <code className="text-[10px] bg-white/[0.05] px-1 py-0.5 rounded">workflow_runs</code> and
          notifications sent via Telegram.
        </p>
      </div>
    </div>
  )
}
