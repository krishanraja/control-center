import React from 'react'
import { UserCheck, Clock, AlertTriangle, ArrowRight } from 'lucide-react'

interface BlockItem {
  id: string
  title: string
  description: string
  blockedBy: 'krish' | 'agatha'
  type: 'approval' | 'decision' | 'input' | 'review'
  urgency: 'high' | 'medium' | 'low'
  agent: string
  age: string
}

const BLOCKED_ITEMS: BlockItem[] = [
  {
    id: 'b1',
    title: 'Drive Sync — Activate in N8N',
    description: 'Open workflow, confirm Google Docs credential, click Activate.',
    blockedBy: 'krish',
    type: 'input',
    urgency: 'medium',
    agent: 'Tools Agent',
    age: '2h'
  },
  {
    id: 'b2',
    title: 'Instantly API — Check Account Permissions',
    description: 'API returning 403. Check Settings → API in Instantly dashboard to confirm access is enabled.',
    blockedBy: 'krish',
    type: 'input',
    urgency: 'low',
    agent: 'BD Agent',
    age: '1h'
  },
  {
    id: 'b3',
    title: 'GSC API Credentials',
    description: 'Google Search Console is live for all 6 products. Wire GSC API access to Marketing Agent for real ranking data.',
    blockedBy: 'krish',
    type: 'input',
    urgency: 'medium',
    agent: 'Marketing Agent',
    age: 'new'
  },
  {
    id: 'b4',
    title: 'Architecture v2.1 Review',
    description: 'Updated architecture doc awaiting your review before full Phase 2 sign-off.',
    blockedBy: 'krish',
    type: 'review',
    urgency: 'low',
    agent: 'Agatha',
    age: '3d'
  },
  {
    id: 'b5',
    title: 'Deploy Mission Control Dashboard',
    description: 'Dashboard is built. Awaiting Vercel deployment + controlcenter.krishraja.com DNS update.',
    blockedBy: 'agatha',
    type: 'approval',
    urgency: 'high',
    agent: 'Agatha',
    age: 'now'
  },
  {
    id: 'b6',
    title: 'Weekly Revenue Report Re-run',
    description: 'First run errored (Fractionl key missing). Now fixed. Needs manual re-trigger to recover this week\'s data.',
    blockedBy: 'agatha',
    type: 'approval',
    urgency: 'high',
    agent: 'Revenue Finance',
    age: '4h'
  }
]

const urgencyStyle = {
  high: 'bg-red-500/10 border-red-500/30 text-red-400',
  medium: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
  low: 'bg-blue-500/10 border-blue-500/30 text-blue-400'
}

const typeLabel = {
  approval: 'Approval',
  decision: 'Decision',
  input: 'Input needed',
  review: 'Review'
}

export function BlockedOnYou() {
  const onKrish = BLOCKED_ITEMS.filter(i => i.blockedBy === 'krish')
  const onAgatha = BLOCKED_ITEMS.filter(i => i.blockedBy === 'agatha')

  const renderItem = (item: BlockItem) => (
    <div
      key={item.id}
      className="flex items-start space-x-3 p-3 rounded-lg bg-[#1a1a1d] border border-[#3a3a3d] hover:border-[#4a4a4d] transition-colors"
    >
      <div className="flex-shrink-0 mt-0.5">
        {item.blockedBy === 'krish'
          ? <UserCheck className="w-4 h-4 text-amber-400" />
          : <Clock className="w-4 h-4 text-blue-400" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="font-medium text-white text-sm">{item.title}</span>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`text-xs px-2 py-0.5 rounded border ${urgencyStyle[item.urgency]}`}>
              {item.urgency}
            </span>
            <span className="text-xs text-[#6b7280]">{item.age}</span>
          </div>
        </div>
        <p className="text-sm text-[#9ca3af]">{item.description}</p>
        <div className="flex items-center space-x-1 mt-1.5">
          <span className="text-xs text-[#6b7280]">from</span>
          <span className="text-xs text-[#9ca3af] font-medium">{item.agent}</span>
          <ArrowRight className="w-3 h-3 text-[#6b7280]" />
          <span className="text-xs font-medium text-amber-400">{typeLabel[item.type]}</span>
        </div>
      </div>
    </div>
  )

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Blocked on Krish */}
      <div>
        <div className="flex items-center space-x-2 mb-4">
          <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <h2 className="text-lg font-semibold text-white">Blocked on You</h2>
          <span className="text-[#6b7280] text-sm">({onKrish.length})</span>
        </div>
        <div className="space-y-2">
          {onKrish.length === 0
            ? <p className="text-[#6b7280] text-sm italic p-3">Nothing waiting on you right now.</p>
            : onKrish.map(renderItem)
          }
        </div>
      </div>

      {/* Blocked on Agatha */}
      <div>
        <div className="flex items-center space-x-2 mb-4">
          <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          <h2 className="text-lg font-semibold text-white">Blocked on Agatha</h2>
          <span className="text-[#6b7280] text-sm">({onAgatha.length})</span>
        </div>
        <div className="space-y-2">
          {onAgatha.length === 0
            ? <p className="text-[#6b7280] text-sm italic p-3">Nothing in Agatha's queue right now.</p>
            : onAgatha.map(renderItem)
          }
        </div>
      </div>
    </div>
  )
}
