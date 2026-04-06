import React from 'react'
import { Bell, AlertTriangle, Clock, CheckCircle } from 'lucide-react'

export function NeedsAttention() {
  const items = [
    {
      id: '1',
      type: 'approval',
      title: 'Product Proposal: OnAlert Dashboard Redesign',
      description: 'Agatha approved proposal needs final sign-off before GitHub issue creation',
      priority: 'high',
      age: '2h ago'
    },
    {
      id: '2', 
      type: 'blocked',
      title: 'Revenue Finance Agent Blocked',
      description: 'Fractionl Stripe integration needs manual configuration',
      priority: 'medium',
      age: '6h ago'
    },
    {
      id: '3',
      type: 'info',
      title: 'Marketing Agent Analysis Complete',
      description: '47 content briefs ready for Content Engine review',
      priority: 'low',
      age: '18h ago'
    }
  ]

  const getIcon = (type: string) => {
    switch (type) {
      case 'approval': return <Clock className="w-4 h-4 text-command-warning" />
      case 'blocked': return <AlertTriangle className="w-4 h-4 text-command-error" />
      case 'info': return <CheckCircle className="w-4 h-4 text-command-success" />
      default: return <Bell className="w-4 h-4 text-command-info" />
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'border-l-command-error'
      case 'medium': return 'border-l-command-warning'
      case 'low': return 'border-l-command-success'
      default: return 'border-l-command-info'
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2">
        <Bell className="w-5 h-5 text-command-text/70" />
        <h2 className="text-xl font-semibold text-white">Needs Attention</h2>
        <span className="text-command-text/70">({items.length})</span>
      </div>

      <div className="space-y-3">
        {items.map(item => (
          <div
            key={item.id}
            className={`border border-command-border rounded-lg p-4 bg-command-card border-l-4 ${getPriorityColor(item.priority)}`}
          >
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0 mt-0.5">
                {getIcon(item.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-white truncate">{item.title}</h3>
                  <span className="text-xs text-command-text/50 ml-2">{item.age}</span>
                </div>
                <p className="text-sm text-command-text/80 mt-1">{item.description}</p>
              </div>
            </div>
          </div>
        ))}

        {items.length === 0 && (
          <div className="text-center py-8 text-command-text/50">
            <CheckCircle className="w-8 h-8 mx-auto mb-2" />
            <p>All clear! No items need attention.</p>
          </div>
        )}
      </div>
    </div>
  )
}
