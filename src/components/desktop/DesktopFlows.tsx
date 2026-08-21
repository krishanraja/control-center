import React, { useEffect, useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Check, X, Workflow as WorkflowIcon, AlertCircle, Wand2 } from '@/lib/icons'
import { supabase, logKrishAction } from '../../lib/supabase'
import { humanize } from '../shared/tokens'
import { AgentAvatar } from '../shared/AgentAvatar'
import { SkillForge } from '../flows/SkillForge'
import { BoardSkeleton } from '../shared/Skeleton'

interface Run {
  id: string
  workflow_id: string
  workflow_name: string
  agent_id?: string
  run_at: string
  duration_ms?: number
  status: string
  outcome?: string
  error_message?: string
  cost_usd?: number
  quality_score?: number
}

interface Proposal {
  id: string
  title: string
  description?: string
  status: string
  proposal_type?: string
  estimated_savings_monthly?: number
  estimated_cost_monthly?: number
  quality_impact?: string
  agent_id?: string
  current_workflow_id?: string
  created_at: string
}

interface GroupedRun {
  workflow_id: string
  workflow_name: string
  agent_id?: string
  status: string
  lastRun: string
  runCount: number
  errorCount: number
}

const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

type FlowsView = 'workflows' | 'skill-forge'

export function DesktopFlows() {
  const [view, setView] = useState<FlowsView>('workflows')
  const [runs, setRuns] = useState<Run[]>([])
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [loading, setLoading] = useState(true)

  const loadProposals = async () => {
    const { data } = await supabase.from('workflow_proposals').select('*').eq('status', 'pending').order('created_at', { ascending: false })
    setProposals((data as any) || [])
  }

  useEffect(() => {
    const load = async () => {
      const [r, p] = await Promise.all([
        supabase.from('workflow_runs').select('*').order('run_at', { ascending: false }).limit(50),
        supabase.from('workflow_proposals').select('*').eq('status', 'pending').order('created_at', { ascending: false }),
      ])
      // Legacy rows may carry the owner on `agent` instead of `agent_id`.
      // Backfill in the client so workflow→agent attribution is not lost.
      const normalizedRuns = ((r.data as any[]) || []).map((row) => ({
        ...row,
        agent_id: row.agent_id || row.agent || null,
      })) as Run[]
      setRuns(normalizedRuns)
      setProposals((p.data as any) || [])
      setLoading(false)
    }
    load()
  }, [])

  const decideProposal = async (id: string, status: 'approved' | 'rejected') => {
    await supabase.from('workflow_proposals').update({
      status,
      approved_by: 'krish',
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    await logKrishAction(id, status, 'system', 'Workflow proposal ' + status)
    loadProposals()
  }

  const grouped: GroupedRun[] = useMemo(() => (
    Object.values(runs.reduce((acc: any, r) => {
      const k = r.workflow_id
      if (!acc[k]) acc[k] = { workflow_id: r.workflow_id, workflow_name: r.workflow_name, agent_id: r.agent_id, status: r.status, lastRun: r.run_at, runCount: 0, errorCount: 0 }
      acc[k].runCount += 1
      if (r.status === 'error') acc[k].errorCount += 1
      if (new Date(r.run_at) > new Date(acc[k].lastRun)) {
        acc[k].lastRun = r.run_at
        acc[k].status = r.status
      }
      return acc
    }, {} as any))
  ) as GroupedRun[], [runs])

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl xl:text-heading font-semibold text-white tracking-tight">Flows</h1>
          <p className="text-xs md:text-body text-white/50 mt-0.5">
            {view === 'workflows' ? 'N8N workflows & proposals.' : 'Forge custom Agent Skills for clients.'}
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-white/[0.07] bg-white/[0.015] p-0.5">
          <button
            onClick={() => setView('workflows')}
            className={`inline-flex items-center gap-1.5 px-3 h-7 rounded-md text-label font-medium transition-colors ${
              view === 'workflows' ? 'bg-white/[0.07] text-white' : 'text-white/50 hover:text-white/80'
            }`}
          >
            <WorkflowIcon size={11} /> Workflows
          </button>
          <button
            onClick={() => setView('skill-forge')}
            className={`inline-flex items-center gap-1.5 px-3 h-7 rounded-md text-label font-medium transition-colors ${
              view === 'skill-forge' ? 'bg-white/[0.07] text-white' : 'text-white/50 hover:text-white/80'
            }`}
          >
            <Wand2 size={11} /> Skill Forge
          </button>
        </div>
      </div>

      {view === 'skill-forge' ? (
        <SkillForge />
      ) : (
      <>
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <WorkflowIcon size={13} className="text-blue-400" />
          <h2 className="text-micro md:text-micro font-semibold uppercase tracking-[0.14em] text-white/50 flex-1">
            Workflows
            <span className="ml-2 normal-case tracking-normal font-normal text-white/30">runs on its own; anything that needs you shows up on Home</span>
          </h2>
          <span className="text-micro text-white/30 font-mono tabular-nums">{grouped.length}</span>
        </div>

        {loading ? (
          <BoardSkeleton lanes={1} cardsPerLane={5} hero={false} />
        ) : grouped.length === 0 ? (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-10 md:p-12 text-center">
            <WorkflowIcon size={20} className="text-white/20 mx-auto mb-3" />
            <p className="text-sm md:text-body text-white/50 font-medium">No workflows yet.</p>
            <p className="text-xs md:text-label text-white/30 mt-1">Runs will appear here once N8N starts firing.</p>
          </div>
        ) : (
          <>
            {/* Mobile: card grid. Desktop: dense table. */}
            <div className="md:hidden grid grid-cols-1 gap-2">
              {grouped.map(w => <WorkflowCard key={w.workflow_id} w={w} />)}
            </div>
            <div className="hidden md:block rounded-xl border border-white/[0.07] bg-white/[0.015] overflow-hidden">
              <table className="w-full text-label">
                <thead>
                  <tr className="text-left text-white/45 border-b border-white/[0.06] bg-white/[0.02]">
                    <th className="px-4 py-2.5 font-semibold uppercase tracking-[0.14em] text-micro">Workflow</th>
                    <th className="px-4 py-2.5 font-semibold uppercase tracking-[0.14em] text-micro">Agent</th>
                    <th className="px-4 py-2.5 font-semibold uppercase tracking-[0.14em] text-micro">Last Run</th>
                    <th className="px-4 py-2.5 font-semibold uppercase tracking-[0.14em] text-micro">Status</th>
                    <th className="px-4 py-2.5 font-semibold uppercase tracking-[0.14em] text-micro text-right">Runs</th>
                    <th className="px-4 py-2.5 font-semibold uppercase tracking-[0.14em] text-micro text-right">Errors</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {grouped.map(w => (
                    <tr key={w.workflow_id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-2.5 text-white/85 font-medium truncate max-w-[260px]">{humanize(w.workflow_name) || w.workflow_name}</td>
                      <td className="px-4 py-2.5">
                        {w.agent_id ? (
                          <span className="inline-flex items-center gap-1.5">
                            <AgentAvatar agent={w.agent_id} size="sm" />
                            <span className="text-white/65">{humanize(w.agent_id)}</span>
                          </span>
                        ) : (
                          <span className="text-white/25">System</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-white/50 tabular-nums">{formatDistanceToNow(new Date(w.lastRun), { addSuffix: true })}</td>
                      <td className="px-4 py-2.5"><StatusChip status={w.status} /></td>
                      <td className="px-4 py-2.5 text-right text-white/60 font-mono tabular-nums">{w.runCount}</td>
                      <td className={`px-4 py-2.5 text-right font-mono tabular-nums ${w.errorCount > 0 ? 'text-rose-400 font-semibold' : 'text-white/25'}`}>{w.errorCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <AlertCircle size={13} className="text-violet-400" />
          <h2 className="text-micro md:text-micro font-semibold uppercase tracking-[0.14em] text-white/50 flex-1">Pending Proposals</h2>
          <span className="text-micro text-white/30 font-mono tabular-nums">{proposals.length}</span>
        </div>

        {proposals.length === 0 ? (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-10 md:p-12 text-center">
            <p className="text-sm md:text-body text-white/50 font-medium">No pending proposals.</p>
            <p className="text-xs md:text-label text-white/30 mt-1">Agents will surface improvement suggestions here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {proposals.map(p => (
              <article key={p.id} className="rounded-xl border border-violet-500/25 bg-gradient-to-br from-violet-500/[0.06] via-violet-500/[0.02] to-transparent p-4 md:p-5 space-y-3">
                <header>
                  <p className="text-sm md:text-ui font-semibold text-white leading-snug">{p.title}</p>
                  {p.proposal_type && (
                    <span className="inline-block mt-1.5 text-micro text-violet-300 bg-violet-500/15 border border-violet-500/25 rounded-full px-2 py-0.5 font-medium">
                      {humanize(p.proposal_type)}
                    </span>
                  )}
                </header>
                {p.description && <p className="text-xs md:text-label text-white/55 leading-relaxed line-clamp-4">{p.description}</p>}
                {(typeof p.estimated_savings_monthly === 'number' || typeof p.estimated_cost_monthly === 'number') && (
                  <div className="flex items-center gap-3 text-micro md:text-label tabular-nums pt-1">
                    {typeof p.estimated_savings_monthly === 'number' && (
                      <span className="text-emerald-400 font-medium">+{usd0.format(p.estimated_savings_monthly)}/mo saved</span>
                    )}
                    {typeof p.estimated_cost_monthly === 'number' && (
                      <span className="text-rose-400 font-medium">{usd0.format(p.estimated_cost_monthly)}/mo cost</span>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => decideProposal(p.id, 'approved')}
                    className="flex-1 md:flex-none flex items-center justify-center gap-1.5 min-h-[36px] px-3 rounded-lg border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10 text-label font-semibold transition-colors"
                  >
                    <Check size={13} /> Approve
                  </button>
                  <button
                    onClick={() => decideProposal(p.id, 'rejected')}
                    className="flex-1 md:flex-none flex items-center justify-center gap-1.5 min-h-[36px] px-3 rounded-lg border border-rose-500/30 text-rose-300 hover:bg-rose-500/10 text-label font-semibold transition-colors"
                  >
                    <X size={13} /> Reject
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      </>
      )}
    </div>
  )
}

function WorkflowCard({ w }: { w: GroupedRun }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-body text-white font-medium leading-snug truncate">{humanize(w.workflow_name) || w.workflow_name}</p>
          <div className="flex items-center gap-1.5 mt-1">
            {w.agent_id ? (
              <>
                <AgentAvatar agent={w.agent_id} size="sm" />
                <span className="text-micro text-white/55">{humanize(w.agent_id)}</span>
              </>
            ) : (
              <span className="text-micro text-white/30">System</span>
            )}
            <span className="text-white/20 mx-0.5">·</span>
            <span className="text-micro text-white/45 tabular-nums">{formatDistanceToNow(new Date(w.lastRun), { addSuffix: true })}</span>
          </div>
        </div>
        <StatusChip status={w.status} />
      </div>
      <div className="flex items-center gap-3 mt-2 pt-2 border-t border-white/[0.04] text-micro font-mono tabular-nums">
        <span className="text-white/50">{w.runCount} <span className="text-white/30">runs</span></span>
        {w.errorCount > 0 && <span className="text-rose-400 font-semibold">{w.errorCount} errors</span>}
        <button
          onClick={async () => {
            const r = await fetch(`/api/automations/${w.workflow_id}/rerun`, { method: 'POST' })
            const body = await r.json().catch(() => ({}))
            if (!r.ok) alert(`Rerun failed: ${body?.error || r.status}`)
          }}
          className="ml-auto text-micro px-2 py-0.5 rounded border border-white/15 text-white/60 hover:text-white hover:border-white/35 transition-colors"
          title="Trigger a manual run of this workflow"
        >
          Rerun
        </button>
      </div>
    </div>
  )
}

function StatusChip({ status }: { status: string }) {
  const cls =
    status === 'success' ? 'text-emerald-300 border-emerald-500/25 bg-emerald-500/10' :
    status === 'error'   ? 'text-rose-300 border-rose-500/25 bg-rose-500/10' :
    status === 'running' ? 'text-blue-300 border-blue-500/25 bg-blue-500/10' :
                           'text-white/55 border-white/10 bg-white/[0.03]'
  return (
    <span className={`inline-flex items-center text-micro font-semibold uppercase tracking-[0.14em] px-2 py-0.5 rounded-full border ${cls}`}>
      {humanize(status) || status}
    </span>
  )
}
