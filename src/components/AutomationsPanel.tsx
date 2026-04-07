import React, { useState } from 'react'
import { Zap, Clock, CheckCircle, XCircle, Pause, ChevronDown, ChevronRight } from 'lucide-react'

interface Workflow {
  id: string
  name: string
  category: string
  status: 'active' | 'inactive' | 'error'
  trigger: string
  lastRun?: string
  nextRun?: string
  agent: string
}

interface CronJob {
  id: string
  agent: string
  humanName: string
  schedule: string
  nextRun: string
  enabled: boolean
  phase: string
}

const WORKFLOWS: Workflow[] = [
  // Infrastructure
  { id: 'SVr96xVfOCupWpK7', name: 'Error Monitor', category: 'Infrastructure', status: 'active', trigger: 'On N8N error', agent: 'Arlo', lastRun: '2h ago' },
  { id: 'AzalV2S1SngVdVMp', name: 'Health Check (30min)', category: 'Infrastructure', status: 'active', trigger: 'Every 30 min', agent: 'Arlo', nextRun: '12 min' },
  // Revenue
  { id: 'eB5Si7OAIFO8QZ8J', name: 'Mindmaker Stripe Events', category: 'Revenue', status: 'active', trigger: 'Stripe webhook', agent: 'Leo' },
  { id: 'pyr9wurcs1M9utW3', name: 'Weekly Revenue Report', category: 'Revenue', status: 'error', trigger: 'Mon 9AM', agent: 'Leo', lastRun: 'Errored' },
  { id: 'XUiLRadMc0vvoM83', name: 'OnAlert Product Feedback', category: 'Revenue', status: 'active', trigger: 'Stripe/webhook', agent: 'Priya' },
  { id: 'yYku4wWh60Nps84u', name: 'Gutted Product Feedback', category: 'Revenue', status: 'active', trigger: 'Stripe/webhook', agent: 'Priya' },
  { id: 'TAAeeXv4KwGYG2eU', name: 'Merciless Product Feedback', category: 'Revenue', status: 'active', trigger: 'Stripe/webhook', agent: 'Priya' },
  { id: 'zjgOgd3puahqBwql', name: 'Fractionl Product Feedback', category: 'Revenue', status: 'active', trigger: 'Stripe/webhook', agent: 'Priya' },
  // Content
  { id: 'mDIL4cjEmIVYDUf8', name: 'Daily Morning Brief', category: 'Content', status: 'active', trigger: 'Daily 9AM', agent: 'Maya', nextRun: '9h' },
  { id: 'O6AUi9W6UxBxhH94', name: 'Content Distribution (LinkedIn)', category: 'Content', status: 'active', trigger: 'Webhook', agent: 'Nova' },
  { id: 'UL59ByPJJtOK7sBG', name: 'Content Draft On-Demand', category: 'Content', status: 'active', trigger: 'Webhook', agent: 'Maya' },
  { id: 'oNZc5BRIBRXSNtu3', name: 'Content Sweep', category: 'Content', status: 'active', trigger: 'Fri 6PM', agent: 'Maya', nextRun: 'Fri 6PM' },
  { id: 'nXnqdZTbEuk4CPzJ', name: 'Content Performance Log', category: 'Content', status: 'active', trigger: 'Webhook', agent: 'Maya' },
  // BD & Approval Loops
  { id: 'Uz8qzh6kuXkN2bc8', name: 'BD Draft On-Demand', category: 'BD', status: 'active', trigger: 'Webhook', agent: 'Zara' },
  { id: 'NgVcpJ7PO7sTYvm9', name: 'Content Angle Approval', category: 'BD', status: 'active', trigger: 'Webhook /content-angle-approval', agent: 'Maya' },
  { id: 'ZovvjMxZvkrBuMON', name: 'Apollo Contact Enrichment', category: 'BD', status: 'active', trigger: 'Webhook /apollo-enrich', agent: 'Zara' },
  { id: 'JAauFc4DyfkPaDOG', name: 'Product Proposal Review', category: 'Product', status: 'active', trigger: 'Webhook /product-proposal', agent: 'Priya' },
  { id: 'q0nmkbgk1DEBR1bs', name: 'Approved Proposal → GitHub', category: 'Product', status: 'active', trigger: 'Webhook /product-proposal-approved', agent: 'Priya' },
  { id: 'gnwpyTFbusBrZG7P', name: 'Opportunity Pipeline Tracker', category: 'BD', status: 'active', trigger: 'Webhook /opportunity-update', agent: 'Felix' },
  { id: 'PPfv8kHNBzSq7fm0', name: 'Drive Sync', category: 'Infrastructure', status: 'inactive', trigger: 'On report write', agent: 'Arlo', lastRun: 'Needs manual activate' },
  // Deactivated
  { id: 'MJ96Eii6sUeOi1gK', name: 'BD Weekly Contact Review', category: 'BD', status: 'inactive', trigger: 'Retired — Instantly strategy retired', agent: '—' },
  { id: 'WrPOAcDkrt3dPvF3', name: 'BD Approved → Instantly', category: 'BD', status: 'inactive', trigger: 'Retired — Instantly strategy retired', agent: '—' },
]

const CRON_JOBS: CronJob[] = [
  { id: 'bd-agent-daily-001', agent: 'bd-agent', humanName: 'Zara', schedule: 'Mon–Fri 10AM EST', nextRun: 'Tomorrow 10AM', enabled: true, phase: '2' },
  { id: 'visibility-agent-weekly-001', agent: 'visibility-agent', humanName: 'Nova', schedule: 'Tue/Fri 9AM EST', nextRun: 'Fri 9AM', enabled: true, phase: '2' },
  { id: 'product-agent-weekly-001', agent: 'product-agent', humanName: 'Priya', schedule: 'Mon 8AM EST', nextRun: 'Mon 8AM', enabled: true, phase: '2' },
  { id: 'enterprise-gigs-daily-001', agent: 'enterprise-gigs', humanName: 'Felix', schedule: 'Mon–Fri 11AM EST', nextRun: 'Tomorrow 11AM', enabled: true, phase: '2' },
  { id: 'revenue-finance-weekly-001', agent: 'revenue-agent', humanName: 'Leo', schedule: 'Mon 8AM EST', nextRun: 'Mon 8AM', enabled: true, phase: '2' },
  { id: 'vera-daily-001', agent: 'vera-daily', humanName: 'Vera', schedule: 'Daily 2AM EST', nextRun: 'Tomorrow 2AM', enabled: true, phase: '1' },
  { id: 'vera-weekly-001', agent: 'vera-weekly', humanName: 'Vera', schedule: 'Fri 6AM EST', nextRun: 'Fri 6AM', enabled: true, phase: '1' },
  { id: 'tools-agent-weekly-001', agent: 'tools-agent', humanName: 'Arlo', schedule: 'Sun 3AM EST', nextRun: 'Sun 3AM', enabled: true, phase: '1' },
  { id: 'marketing-agent-weekly-001', agent: 'marketing-agent', humanName: 'Maya', schedule: 'Wed 9AM EST', nextRun: 'Wed 9AM', enabled: true, phase: '2' },
  { id: 'weekly-synthesis-001', agent: 'weekly-synthesis', humanName: 'Marcus', schedule: 'Mon 7AM EST', nextRun: 'Mon 7AM', enabled: true, phase: '2' },
  { id: 'cost-agent-weekly-001', agent: 'cost-agent', humanName: 'CFO (Phase 3)', schedule: 'Mon 8:30AM EST', nextRun: 'Disabled', enabled: false, phase: '3' },
  { id: 'innovation-agent-weekly-001', agent: 'innovation-agent', humanName: 'CAIO (Phase 3)', schedule: 'Thu 8PM EST', nextRun: 'Disabled', enabled: false, phase: '3' },
]

const categoryColors: Record<string, string> = {
  Infrastructure: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
  Revenue: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  Content: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
  BD: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  Product: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
}

export function AutomationsPanel() {
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    Infrastructure: true, Revenue: true, Content: true, BD: false, Product: false
  })

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => ({ ...prev, [cat]: !prev[cat] }))
  }

  const activeCount = WORKFLOWS.filter(w => w.status === 'active').length
  const errorCount = WORKFLOWS.filter(w => w.status === 'error').length
  const enabledCrons = CRON_JOBS.filter(c => c.enabled).length

  const categories = Array.from(new Set(WORKFLOWS.map(w => w.category)))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Zap className="w-5 h-5 text-command-text/70" />
          <h2 className="text-xl font-semibold text-white">Automations</h2>
        </div>
        <div className="flex items-center space-x-4 text-sm">
          <span className="text-command-success">{activeCount} active</span>
          {errorCount > 0 && <span className="text-command-error">{errorCount} errored</span>}
          <span className="text-command-info">{enabledCrons} crons live</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* N8N Workflows */}
        <div className="bg-command-card border border-command-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-command-border flex items-center justify-between">
            <span className="font-semibold text-white">N8N Workflows</span>
            <span className="text-sm text-command-text/60">{WORKFLOWS.length} total</span>
          </div>
          <div className="divide-y divide-command-border/50">
            {categories.map(cat => {
              const workflows = WORKFLOWS.filter(w => w.category === cat)
              const isExpanded = expandedCategories[cat]
              return (
                <div key={cat}>
                  <button
                    onClick={() => toggleCategory(cat)}
                    className="w-full flex items-center justify-between px-4 py-2 hover:bg-command-bg/30 transition-colors"
                  >
                    <div className="flex items-center space-x-2">
                      {isExpanded ? <ChevronDown className="w-3 h-3 text-command-text/50" /> : <ChevronRight className="w-3 h-3 text-command-text/50" />}
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${categoryColors[cat] || 'text-gray-400 bg-gray-500/10 border-gray-500/20'}`}>
                        {cat}
                      </span>
                      <span className="text-xs text-command-text/60">{workflows.length}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <span className="text-xs text-command-success">{workflows.filter(w => w.status === 'active').length} ✓</span>
                      {workflows.some(w => w.status === 'error') && (
                        <span className="text-xs text-command-error ml-1">{workflows.filter(w => w.status === 'error').length} !</span>
                      )}
                    </div>
                  </button>
                  {isExpanded && workflows.map(wf => (
                    <div key={wf.id} className="flex items-center justify-between px-4 py-2 bg-command-bg/20 hover:bg-command-bg/30 transition-colors">
                      <div className="flex items-center space-x-2 min-w-0">
                        {wf.status === 'active' && <CheckCircle className="w-3 h-3 text-command-success flex-shrink-0" />}
                        {wf.status === 'inactive' && <Pause className="w-3 h-3 text-command-text/40 flex-shrink-0" />}
                        {wf.status === 'error' && <XCircle className="w-3 h-3 text-command-error flex-shrink-0" />}
                        <span className={`text-sm truncate ${wf.status === 'inactive' ? 'text-command-text/40' : 'text-command-text'}`}>
                          {wf.name}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2 flex-shrink-0 ml-2">
                        <span className="text-xs text-command-text/50 hidden md:block">{wf.agent}</span>
                        <span className="text-xs text-command-text/40 font-mono">{wf.trigger}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>

        {/* Agent Cron Jobs */}
        <div className="bg-command-card border border-command-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-command-border flex items-center justify-between">
            <span className="font-semibold text-white">Agent Cron Schedule</span>
            <span className="text-sm text-command-text/60">{enabledCrons}/{CRON_JOBS.length} enabled</span>
          </div>
          <div className="divide-y divide-command-border/50">
            {/* Phase 1 */}
            <div className="px-4 py-2 bg-command-bg/20">
              <span className="text-xs font-semibold text-command-text/50 uppercase tracking-wider">Phase 1 — Active</span>
            </div>
            {CRON_JOBS.filter(c => c.phase === '1').map(cron => (
              <div key={cron.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-command-bg/20 transition-colors">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-3 h-3 text-command-success flex-shrink-0" />
                  <div>
                    <span className="text-sm text-command-text font-medium">{cron.humanName}</span>
                    <span className="text-xs text-command-text/50 ml-2">{cron.schedule}</span>
                  </div>
                </div>
                <span className="text-xs text-command-info">{cron.nextRun}</span>
              </div>
            ))}
            {/* Phase 2 */}
            <div className="px-4 py-2 bg-command-bg/20">
              <span className="text-xs font-semibold text-command-text/50 uppercase tracking-wider">Phase 2 — Active</span>
            </div>
            {CRON_JOBS.filter(c => c.phase === '2').map(cron => (
              <div key={cron.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-command-bg/20 transition-colors">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-3 h-3 text-command-success flex-shrink-0" />
                  <div>
                    <span className="text-sm text-command-text font-medium">{cron.humanName}</span>
                    <span className="text-xs text-command-text/50 ml-2">{cron.schedule}</span>
                  </div>
                </div>
                <span className="text-xs text-command-info">{cron.nextRun}</span>
              </div>
            ))}
            {/* Phase 3 */}
            <div className="px-4 py-2 bg-command-bg/20">
              <span className="text-xs font-semibold text-command-text/50 uppercase tracking-wider">Phase 3 — Disabled (pending gate)</span>
            </div>
            {CRON_JOBS.filter(c => c.phase === '3').map(cron => (
              <div key={cron.id} className="flex items-center justify-between px-4 py-2.5 opacity-50">
                <div className="flex items-center space-x-2">
                  <Pause className="w-3 h-3 text-command-text/40 flex-shrink-0" />
                  <div>
                    <span className="text-sm text-command-text/60 font-medium">{cron.humanName}</span>
                    <span className="text-xs text-command-text/40 ml-2">{cron.schedule}</span>
                  </div>
                </div>
                <span className="text-xs text-command-text/40">{cron.nextRun}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}