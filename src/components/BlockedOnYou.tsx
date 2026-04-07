import React, { useState } from 'react'
import { UserCheck, Clock, ArrowRight, MessageCircle, CheckCircle, Send } from 'lucide-react'

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

interface FeedbackState {
  [taskId: string]: {
    text: string
    isExpanded: boolean
  }
}

const BLOCKED_ITEMS: BlockItem[] = [
  {
    id: 'b1',
    title: 'Drive Sync — Activate in N8N',
    description: 'Open workflow, confirm Google Docs credential, click Activate.',
    blockedBy: 'krish',
    type: 'input',
    urgency: 'medium',
    agent: 'Arlo',
    age: '2h'
  },
  {
    id: 'b2',
    title: 'Instantly API — Check Account Permissions',
    description: 'API returning 403. Check Settings → API in Instantly dashboard to confirm access is enabled.',
    blockedBy: 'krish',
    type: 'input',
    urgency: 'low',
    agent: 'Zara',
    age: '1h'
  },
  {
    id: 'b3',
    title: 'GSC API Credentials',
    description: 'Google Search Console is live for all 6 products. Wire GSC API access to Marketing Agent for real ranking data.',
    blockedBy: 'krish',
    type: 'input',
    urgency: 'medium',
    agent: 'Maya',
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
    agent: 'Leo',
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
  const [feedback, setFeedback] = useState<FeedbackState>({})
  const [submitting, setSubmitting] = useState<{ [taskId: string]: boolean }>({})

  const onKrish = BLOCKED_ITEMS.filter(i => i.blockedBy === 'krish')
  const onAgatha = BLOCKED_ITEMS.filter(i => i.blockedBy === 'agatha')

  const updateFeedback = (taskId: string, text: string) => {
    setFeedback(prev => ({
      ...prev,
      [taskId]: { ...prev[taskId], text }
    }))
  }

  const toggleFeedback = (taskId: string) => {
    setFeedback(prev => ({
      ...prev,
      [taskId]: { 
        text: prev[taskId]?.text || '',
        isExpanded: !prev[taskId]?.isExpanded 
      }
    }))
  }

  const submitFeedback = async (taskId: string, status: 'done' | 'feedback') => {
    setSubmitting(prev => ({ ...prev, [taskId]: true }))
    
    try {
      // Submit to N8N webhook — Agatha picks up and distributes
      const response = await fetch('https://krishraja10101.app.n8n.cloud/webhook/krish-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId,
          feedback: feedback[taskId]?.text || '',
          status,
          timestamp: new Date().toISOString(),
          submittedBy: 'krish',
          agent: BLOCKED_ITEMS.find(i => i.id === taskId)?.agent || 'unknown'
        })
      })
      
      if (response.ok) {
        // Clear feedback and show success
        setFeedback(prev => {
          const newState = { ...prev }
          delete newState[taskId]
          return newState
        })
        alert(`Task ${status === 'done' ? 'marked as done' : 'feedback submitted'}! Agatha will process this.`)
      }
    } catch (error) {
      console.error('Failed to submit feedback:', error)
      alert('Failed to submit. Please try again.')
    } finally {
      setSubmitting(prev => ({ ...prev, [taskId]: false }))
    }
  }

  const renderItem = (item: BlockItem) => {
    const itemFeedback = feedback[item.id]
    const isExpanded = itemFeedback?.isExpanded || false
    const isSubmitting = submitting[item.id] || false

    return (
      <div
        key={item.id}
        className="p-4 rounded-lg bg-command-card border border-command-border hover:border-command-accent/30 transition-colors"
      >
        <div className="flex items-start space-x-3">
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
                <span className="text-xs text-command-text/70">{item.age}</span>
              </div>
            </div>
            <p className="text-sm text-command-text/80 mb-2">{item.description}</p>
            <div className="flex items-center space-x-1 mb-3">
              <span className="text-xs text-command-text/70">from</span>
              <span className="text-xs text-command-text font-medium">{item.agent}</span>
              <ArrowRight className="w-3 h-3 text-command-text/70" />
              <span className="text-xs font-medium text-amber-400">{typeLabel[item.type]}</span>
            </div>

            {/* Action Buttons */}
            {item.blockedBy === 'krish' && (
              <div className="flex items-center space-x-2 mb-2">
                <button
                  onClick={() => toggleFeedback(item.id)}
                  className="flex items-center space-x-1 px-3 py-1 text-xs bg-command-bg/50 border border-command-border 
                    rounded hover:bg-command-bg text-command-text transition-colors"
                >
                  <MessageCircle className="w-3 h-3" />
                  <span>Add Feedback</span>
                </button>
                <button
                  onClick={() => submitFeedback(item.id, 'done')}
                  disabled={isSubmitting}
                  className="flex items-center space-x-1 px-3 py-1 text-xs bg-command-success/20 border border-command-success/30 
                    rounded hover:bg-command-success/30 text-command-success transition-colors disabled:opacity-50"
                >
                  <CheckCircle className="w-3 h-3" />
                  <span>{isSubmitting ? 'Submitting...' : 'Mark Done'}</span>
                </button>
              </div>
            )}

            {/* Feedback Input */}
            {isExpanded && (
              <div className="mt-2 space-y-2 p-3 bg-command-bg/30 border border-command-border/50 rounded">
                <textarea
                  value={itemFeedback?.text || ''}
                  onChange={(e) => updateFeedback(item.id, e.target.value)}
                  placeholder="Add your feedback, questions, or updates..."
                  className="w-full px-3 py-2 text-sm bg-command-bg border border-command-border rounded 
                    text-command-text placeholder-command-text/50 resize-none"
                  rows={2}
                />
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => submitFeedback(item.id, 'feedback')}
                    disabled={!itemFeedback?.text?.trim() || isSubmitting}
                    className="flex items-center space-x-1 px-3 py-1 text-xs bg-command-accent/20 border border-command-accent/30 
                      rounded hover:bg-command-accent/30 text-command-accent transition-colors disabled:opacity-50"
                  >
                    <Send className="w-3 h-3" />
                    <span>{isSubmitting ? 'Sending...' : 'Send Feedback'}</span>
                  </button>
                  <button
                    onClick={() => toggleFeedback(item.id)}
                    className="px-3 py-1 text-xs text-command-text/70 hover:text-command-text transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Blocked on Krish */}
      <div>
        <div className="flex items-center space-x-2 mb-4">
          <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <h2 className="text-lg font-semibold text-white">Blocked on You</h2>
          <span className="text-command-text/70 text-sm">({onKrish.length})</span>
        </div>
        <div className="space-y-3">
          {onKrish.length === 0
            ? <p className="text-command-text/70 text-sm italic p-4 bg-command-card border border-command-border rounded">
                Nothing waiting on you right now.
              </p>
            : onKrish.map(renderItem)
          }
        </div>
      </div>

      {/* Blocked on Agatha */}
      <div>
        <div className="flex items-center space-x-2 mb-4">
          <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          <h2 className="text-lg font-semibold text-white">Blocked on Agatha</h2>
          <span className="text-command-text/70 text-sm">({onAgatha.length})</span>
        </div>
        <div className="space-y-3">
          {onAgatha.length === 0
            ? <p className="text-command-text/70 text-sm italic p-4 bg-command-card border border-command-border rounded">
                Nothing in Agatha's queue right now.
              </p>
            : onAgatha.map(renderItem)
          }
        </div>
      </div>
    </div>
  )
}