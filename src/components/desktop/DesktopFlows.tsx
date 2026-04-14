import React, { useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Check, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'

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

export function DesktopFlows() {
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
      setRuns((r.data as any) || [])
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
    loadProposals()
  }

  const grouped = Object.values(runs.reduce((acc: any, r) => {
    const k = r.workflow_id
    if (!acc[k]) acc[k] = { ...r, errorCount: 0, runCount: 0, lastRun: r.run_at }
    acc[k].runCount += 1
    if (r.status === 'error') acc[k].errorCount += 1
    if (new Date(r.run_at) > new Date(acc[k].lastRun)) {
      acc[k].lastRun = r.run_at
      acc[k].status = r.status
    }
    return acc
  }, {} as any)) as any[]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold text-white">Flows</h1>
        <p className="text-[13px] text-white/35">N8N workflows & proposals</p>
      </div>

      <section className="space-y-2">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-white/50">Workflows ({grouped.length})</h2>
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.015] overflow-hidden">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-white/[0.06] text-left text-white/40">
                <th className="px-3 py-2 font-medium">Workflow</th>
                <th className="px-3 py-2 font-medium">Agent</th>
                <th className="px-3 py-2 font-medium">Last Run</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Runs</th>
                <th className="px-3 py-2 font-medium">Errors</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {loading && <tr><td colSpan={6} className="px-3 py-6 text-center text-white/30">Loading…</td></tr>}
              {!loading && grouped.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-white/30">No workflow runs</td></tr>}
              {grouped.map(w => (
                <tr key={w.workflow_id} className="hover:bg-white/[0.02]">
                  <td className="px-3 py-2 text-white/80">{w.workflow_name}</td>
                  <td className="px-3 py-2 text-white/55">{w.agent_id || '—'}</td>
                  <td className="px-3 py-2 text-white/45">{formatDistanceToNow(new Date(w.lastRun), { addSuffix: true })}</td>
                  <td className={`px-3 py-2 ${w.status === 'success' ? 'text-emerald-400' : w.status === 'error' ? 'text-rose-400' : 'text-white/50'}`}>{w.status}</td>
                  <td className="px-3 py-2 text-white/50">{w.runCount}</td>
                  <td className={`px-3 py-2 ${w.errorCount > 0 ? 'text-rose-400' : 'text-white/30'}`}>{w.errorCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-white/50">Pending Proposals ({proposals.length})</h2>
        {proposals.length === 0 ? (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-6 text-center text-[12px] text-white/30">
            No pending proposals
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {proposals.map(p => (
              <div key={p.id} className="rounded-xl border border-violet-500/20 bg-violet-500/[0.04] p-4 space-y-3">
                <div>
                  <p className="text-[13px] font-semibold text-white">{p.title}</p>
                  {p.proposal_type && <span className="inline-block text-[10px] text-violet-300 bg-violet-500/15 border border-violet-500/25 rounded px-1.5 py-0.5 mt-1">{p.proposal_type}</span>}
                </div>
                {p.description && <p className="text-[11px] text-white/55 leading-relaxed line-clamp-4">{p.description}</p>}
                <div className="flex items-center gap-3 text-[11px]">
                  {typeof p.estimated_savings_monthly === 'number' && <span className="text-emerald-400">+${p.estimated_savings_monthly}/mo saved</span>}
                  {typeof p.estimated_cost_monthly === 'number' && <span className="text-rose-400">${p.estimated_cost_monthly}/mo cost</span>}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => decideProposal(p.id, 'approved')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/10 text-[11px] font-medium">
                    <Check size={12} /> Approve
                  </button>
                  <button onClick={() => decideProposal(p.id, 'rejected')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-500/25 text-rose-400 hover:bg-rose-500/10 text-[11px] font-medium">
                    <X size={12} /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
