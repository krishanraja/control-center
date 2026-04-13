import React, { useState, useEffect } from 'react'

export default function App() {
  const [systemStatus, setSystemStatus] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(data => {
        setSystemStatus(data)
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to load health:', err)
        setLoading(false)
      })
  }, [])

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-white">
      {/* Header */}
      <header className="border-b border-white/10 px-6 py-4">
        <h1 className="text-3xl font-bold">Mission Control</h1>
        <p className="text-white/60 text-sm">Autonomous OS v3</p>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        {loading ? (
          <div className="text-center py-12">
            <div className="text-white/60">Loading system status...</div>
          </div>
        ) : systemStatus ? (
          <div className="space-y-6">
            {/* System Status */}
            <div className="bg-white/5 border border-white/10 rounded-lg p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-3 h-3 rounded-full ${systemStatus.status === 'healthy' ? 'bg-green-500' : systemStatus.status === 'degraded' ? 'bg-yellow-500' : 'bg-red-500'}`}></div>
                <h2 className="text-xl font-semibold">System Status: {systemStatus.status.toUpperCase()}</h2>
              </div>
              <p className="text-white/60 text-sm">Last update: {new Date(systemStatus.timestamp).toLocaleString()}</p>
            </div>

            {/* Components Health */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(systemStatus.components || {}).map(([name, data]: any) => (
                <div key={name} className="bg-white/5 border border-white/10 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold capitalize">{name.replace(/-/g, ' ')}</h3>
                    <div className={`w-2 h-2 rounded-full ${data.status === 'healthy' ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
                  </div>
                  <p className="text-white/60 text-xs">{data.message || data.status}</p>
                  <p className="text-white/40 text-xs mt-1">Last: {new Date(data.last_check).toLocaleTimeString()}</p>
                </div>
              ))}
            </div>

            {/* Alerts */}
            {systemStatus.alerts && systemStatus.alerts.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-semibold">Alerts</h3>
                {systemStatus.alerts.map((alert: any, i: number) => (
                  <div key={i} className={`p-3 rounded border ${alert.severity === 'critical' ? 'bg-red-500/10 border-red-500/30' : alert.severity === 'warning' ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-blue-500/10 border-blue-500/30'}`}>
                    <p className="text-sm">{alert.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center text-red-400">Failed to load system status</div>
        )}
      </main>
    </div>
  )
}
