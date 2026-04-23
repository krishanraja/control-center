import React, { useState, useEffect } from 'react'
import { User, Clock, ChevronUp, Plus, CheckCircle, Play, AlertCircle } from 'lucide-react'

interface TodayItem {
  id: string
  title: string
  detail?: string
  owner: 'krish' | 'agatha'
  agentName?: string
  priority: number
  status: 'pending' | 'in-progress' | 'done'
  est?: string
  venture?: string
  link?: string
  weekly_goal_id?: string | null
}

interface TodayData {
  date: string
  items: TodayItem[]
}

const ownerStyle = {
  krish: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
  agatha: 'bg-blue-500/10 border-blue-500/30 text-blue-400'
}

const statusIcon = {
  pending: <Clock size={12} className="text-gray-400" />,
  'in-progress': <Play size={12} className="text-blue-400" />,
  done: <CheckCircle size={12} className="text-green-400" />
}

export function TodayPanel() {
  const [data, setData] = useState<TodayData>({ date: '', items: [] })
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newItemText, setNewItemText] = useState('')

  const fetchToday = async () => {
    try {
      const res = await fetch('/api/today', { cache: 'no-cache' })
      const result = await res.json()
      setData({ date: result.date || '', items: result.items || [] })
    } catch (e) {
      console.error('Failed to load today:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchToday()
    const iv = setInterval(fetchToday, 60000) // refresh every minute
    return () => clearInterval(iv)
  }, [])

  const bumpToTop = async (itemId: string) => {
    const item = data.items.find(i => i.id === itemId)
    if (!item) return
    
    const reordered = [
      { ...item, priority: 1 },
      ...data.items.filter(i => i.id !== itemId).map((i, idx) => ({ ...i, priority: idx + 2 }))
    ]
    
    try {
      await fetch('/api/today', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reorder', items: reordered })
      })
      setData({ ...data, items: reordered })
    } catch (e) {
      console.error('Failed to reorder:', e)
    }
  }

  const markStatus = async (itemId: string, status: 'pending' | 'in-progress' | 'done') => {
    try {
      await fetch('/api/today', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', id: itemId, status })
      })
      setData({
        ...data,
        items: data.items.map(i => i.id === itemId ? { ...i, status } : i)
      })
    } catch (e) {
      console.error('Failed to update status:', e)
    }
  }

  const addUrgentItem = async () => {
    if (!newItemText.trim()) return
    try {
      const newItem = {
        title: newItemText.trim(),
        owner: 'krish' as const,
        status: 'pending' as const,
        venture: 'urgent'
      }
      await fetch('/api/today', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', item: newItem })
      })
      setNewItemText('')
      setShowAddForm(false)
      await fetchToday()
    } catch (e) {
      console.error('Failed to add item:', e)
    }
  }

  const krishItems = data.items.filter(i => i.owner === 'krish')
  const agentItems = data.items.filter(i => i.owner === 'agatha')

  if (loading) return <div className="p-6 text-center text-gray-500 text-sm">Loading today's plan...</div>

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">Today's Queue</h1>
          <p className="text-sm text-gray-400">{data.date || 'No date set'}</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20"
        >
          <AlertCircle size={12} />
          Add Urgent
        </button>
      </div>

      {showAddForm && (
        <div className="bg-red-950/20 border border-red-800/30 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-medium text-red-400">Add Urgent Task</h3>
          <input
            type="text"
            placeholder="What needs to be done urgently?"
            value={newItemText}
            onChange={e => setNewItemText(e.target.value)}
            className="w-full bg-gray-900/50 border border-gray-600/50 rounded-lg p-2.5 text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:border-red-500/50"
            onKeyPress={e => e.key === 'Enter' && addUrgentItem()}
          />
          <div className="flex gap-2">
            <button
              onClick={addUrgentItem}
              disabled={!newItemText.trim()}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 disabled:opacity-50"
            >
              <Plus size={12} />
              Add to Top
            </button>
            <button
              onClick={() => { setShowAddForm(false); setNewItemText('') }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-700/50 border border-gray-600/50 text-gray-300 hover:bg-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {data.items.map((item, idx) => (
          <div
            key={item.id}
            className={`bg-gray-800/40 border border-gray-700/50 rounded-xl p-4 space-y-2 ${
              item.status === 'done' ? 'opacity-60' : ''
            }`}
          >
            <div className="flex items-start gap-3 justify-between">
              <div className="flex items-start gap-3 flex-1">
                <div className="text-sm font-medium text-gray-400 mt-0.5 w-6 text-center">
                  #{idx + 1}
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex items-start gap-2 flex-wrap">
                    {statusIcon[item.status]}
                    <span className={`text-sm font-medium ${item.status === 'done' ? 'line-through text-gray-500' : 'text-white'}`}>
                      {item.title}
                    </span>
                    {!item.weekly_goal_id && <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium uppercase tracking-wide flex-shrink-0">Drift</span>}
                    <span className={`text-xs px-2 py-0.5 rounded border ${ownerStyle[item.owner]}`}>
                      {item.owner === 'krish' ? 'You' : item.agentName || 'Agatha'}
                    </span>
                    {item.est && (
                      <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">
                        {item.est}
                      </span>
                    )}
                  </div>
                  {item.detail && (
                    <p className="text-xs text-gray-400 leading-relaxed pl-5">
                      {item.detail}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex gap-1">
                {item.status !== 'done' && item.owner === 'krish' && idx > 0 && (
                  <button
                    onClick={() => bumpToTop(item.id)}
                    className="p-1.5 rounded text-xs text-amber-400 hover:bg-amber-500/10 border border-transparent hover:border-amber-500/30"
                    title="Move to top"
                  >
                    <ChevronUp size={12} />
                  </button>
                )}
                {item.status !== 'done' && (
                  <button
                    onClick={() => markStatus(item.id, item.status === 'pending' ? 'in-progress' : 'done')}
                    className={`p-1.5 rounded text-xs ${
                      item.status === 'pending' 
                        ? 'text-blue-400 hover:bg-blue-500/10 border border-transparent hover:border-blue-500/30'
                        : 'text-green-400 hover:bg-green-500/10 border border-transparent hover:border-green-500/30'
                    }`}
                    title={item.status === 'pending' ? 'Start' : 'Mark done'}
                  >
                    {item.status === 'pending' ? <Play size={12} /> : <CheckCircle size={12} />}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {data.items.length === 0 && (
        <div className="text-center py-8 text-gray-500 text-sm">
          No items planned for today.
        </div>
      )}

      <div className="text-xs text-gray-500 space-y-1">
        <div className="flex items-center gap-4">
          <span>🟡 Your tasks: {krishItems.filter(i => i.status !== 'done').length}</span>
          <span>🔵 Agent tasks: {agentItems.filter(i => i.status !== 'done').length}</span>
          <span>✅ Completed: {data.items.filter(i => i.status === 'done').length}</span>
        </div>
      </div>
    </div>
  )
}