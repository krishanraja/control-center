import React, { useState, useEffect } from 'react'
import { UserCheck, Clock, ArrowRight, MessageCircle, CheckCircle, Send } from 'lucide-react'

interface BlockItem {
  id: string
  title: string
  description?: string
  nextStep?: string
  blockedBy: 'krish' | 'agatha'
  urgency?: 'high' | 'medium' | 'low'
  priority?: string
  agent?: string
  age?: string
  daysOld?: number
}

interface FeedbackState {
  [taskId: string]: { text: string; isExpanded: boolean }
}

const urgencyFromPriority = (p?: string): 'high' | 'medium' | 'low' => {
  if (p === 'pri-0' || p === 'outstanding') return 'high'
  if (p === 'pri-1') return 'medium'
  return 'low'
}

const urgencyStyle = {
  high: 'bg-red-500/10 border-red-500/30 text-red-400',
  medium: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
  low: 'bg-blue-500/10 border-blue-500/30 text-blue-400'
}

const ageLabel = (daysOld?: number) => {
  if (daysOld === undefined || daysOld === null) return ''
  if (daysOld === 0) return 'today'
  if (daysOld === 1) return '1d'
  return `${daysOld}d`
}

export function BlockedOnYou() {
  const [items, setItems] = useState<BlockItem[]>([])
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState<FeedbackState>({})
  const [submitting, setSubmitting] = useState<{ [id: string]: boolean }>({})

  const fetchItems = async () => {
    try {
      const res = await fetch('/api/data', { cache: 'no-cache' })
      const data = await res.json()
      setItems((data.tasks || []).filter((t: any) => t.blockedBy))
    } catch (e) {
      console.error('BlockedOnYou fetch error:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchItems()
    const iv = setInterval(fetchItems, 30000)
    return () => clearInterval(iv)
  }, [])

  const submitFeedback = async (taskId: string, status: 'done' | 'feedback') => {
    setSubmitting(prev => ({ ...prev, [taskId]: true }))
    try {
      const item = items.find(i => i.id === taskId)
      const n8nRes = await fetch('https://krishraja10101.app.n8n.cloud/webhook/krish-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId,
          feedback: feedback[taskId]?.text || '',
          status,
          timestamp: new Date().toISOString(),
          submittedBy: 'krish',
          agent: item?.agent || 'unknown'
        })
      })
      if (n8nRes.ok) {
        // Move task off the blocked list
        await fetch('/api/task', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: taskId, status: status === 'done' ? 'done' : 'active', owner: 'agatha' })
        })
        setFeedback(prev => { const s = { ...prev }; delete s[taskId]; return s })
        await fetchItems()
        alert(`Task ${status === 'done' ? 'marked done' : 'feedback sent'} — Agatha has it.`)
      }
    } catch (e) {
      console.error('submitFeedback error:', e)
      alert('Failed to submit. Try again.')
    } finally {
      setSubmitting(prev => ({ ...prev, [taskId]: false }))
    }
  }

  const krishItems = items.filter(i => i.blockedBy === 'krish')
  const agathaItems = items.filter(i => i.blockedBy === 'agatha')

  if (loading) return <div className="p-6 text-center text-gray-500 text-sm">Loading...</div>

  return (
    <div className="p-4 space-y-6">
      {/* Blocked on Krish */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-2 rounded-full bg-amber-400" />
          <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wider">
            Blocked on You {krishItems.length > 0 && `(${krishItems.length})`}
          </h2>
        </div>
        {krishItems.length === 0 ? (
          <div className="text-center py-6 text-gray-500 text-sm border border-dashed border-gray-700 rounded-xl">
            Nothing waiting on you right now.
          </div>
        ) : (
          <div className="space-y-3">
            {krishItems.map(item => {
              const urgency = item.urgency || urgencyFromPriority(item.priority)
              const fbState = feedback[item.id]
              return (
                <div key={item.id} className="bg-gray-800/40 border border-gray-700/50 rounded-xl p-4 space-y-3">
                  <div className="flex items-start gap-2 flex-wrap">
                    <UserCheck size={14} className="text-amber-400 shrink-0 mt-0.5" />
                    <span className="text-sm font-medium text-white">{item.title}</span>
                    <span className={`text-xs px-2 py-0.5 rounded border ${urgencyStyle[urgency]}`}>{urgency}</span>
                    {(item.daysOld !== undefined || item.age) && (
                      <span className="text-xs text-gray-500">{item.age || ageLabel(item.daysOld)}</span>
                    )}
                  </div>
                  {(item.description || item.nextStep) && (
                    <p className="text-xs text-gray-400 leading-relaxed">{item.description || item.nextStep}</p>
                  )}
                  {item.agent && (
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <span>from</span>
                      <span className="font-medium text-gray-400">{item.agent}</span>
                      <ArrowRight size={10} />
                      <span className="text-amber-400">Review</span>
                    </div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-700/50 border border-gray-600/50 text-gray-300 hover:bg-gray-700 transition-colors"
                      onClick={() => setFeedback(prev => ({
                        ...prev,
                        [item.id]: { text: prev[item.id]?.text || '', isExpanded: !prev[item.id]?.isExpanded }
                      }))}
                    >
                      <MessageCircle size={12} /> Add Feedback
                    </button>
                    <button
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                      onClick={() => submitFeedback(item.id, 'done')}
                      disabled={submitting[item.id]}
                    >
                      <CheckCircle size={12} /> Mark Done
                    </button>
                  </div>
                  {fbState?.isExpanded && (
                    <div className="space-y-2 pt-1">
                      <textarea
                        className="w-full bg-gray-900/50 border border-gray-600/50 rounded-lg p-2.5 text-xs text-gray-300 placeholder-gray-600 resize-none focus:outline-none focus:border-amber-500/50"
                        rows={3}
                        placeholder="Add your feedback, questions, or updates..."
                        value={fbState.text}
                        onChange={e => setFeedback(prev => ({ ...prev, [item.id]: { ...prev[item.id], text: e.target.value } }))}
                      />
                      <button
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                        onClick={() => submitFeedback(item.id, 'feedback')}
                        disabled={submitting[item.id] || !fbState.text?.trim()}
                      >
                        <Send size={12} /> {submitting[item.id] ? 'Sending...' : 'Send to Agatha'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Blocked on Agatha */}
      {agathaItems.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-blue-400" />
            <h2 className="text-sm font-semibold text-blue-400 uppercase tracking-wider">
              Blocked on Agatha ({agathaItems.length})
            </h2>
          </div>
          <div className="space-y-3">
            {agathaItems.map(item => {
              const urgency = item.urgency || urgencyFromPriority(item.priority)
              return (
                <div key={item.id} className="bg-gray-800/40 border border-gray-700/50 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Clock size={14} className="text-blue-400 shrink-0" />
                    <span className="text-sm font-medium text-white">{item.title}</span>
                    <span className={`text-xs px-2 py-0.5 rounded border ${urgencyStyle[urgency]}`}>{urgency}</span>
                    {(item.daysOld !== undefined || item.age) && (
                      <span className="text-xs text-gray-500">{item.age || ageLabel(item.daysOld)}</span>
                    )}
                  </div>
                  {(item.description || item.nextStep) && (
                    <p className="text-xs text-gray-400 leading-relaxed">{item.description || item.nextStep}</p>
                  )}
                  {item.agent && (
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <span>from</span>
                      <span className="font-medium text-gray-400">{item.agent}</span>
                      <ArrowRight size={10} />
                      <span className="text-blue-400">In progress</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {items.length === 0 && (
        <div className="text-center py-8 text-gray-500 text-sm">All clear.</div>
      )}
    </div>
  )
}
