/**
 * Growth: "Check now" for the four sites. POST /api/growth/web-insights
 * { action: 'refresh' }, allowed once per 10 minutes (a 429 carries how long
 * to wait). The answer is said on the button's own line, never in a toast.
 */
import { useState } from 'react'
import { RefreshCw } from '@/lib/icons'
import { Button } from '../ui/button'
import { Working } from '../shared/Working'
import { useWork } from '../../lib/loadingVoice'
import { relativeTime } from '../../lib/ageHelpers'
import type { GrowthTabModel } from './useGrowthTab'

export function SiteCheck({ m, compact = false, header = false }: { m: GrowthTabModel; compact?: boolean; header?: boolean }) {
  const [busy, setBusy] = useState(false)
  const [line, setLine] = useState<string | null>(null)
  const work = useWork('web.refresh')
  const last = m.web.data?.last_run?.run_at ?? null

  const press = async () => {
    setBusy(true)
    setLine(null)
    try {
      const r = await m.checkSites()
      if (r.result === 'too_soon') {
        const mins = Math.max(1, Math.ceil((r.retryAfterS ?? 600) / 60))
        setLine(`Checked a moment ago. You can check again in ${mins} ${mins === 1 ? 'minute' : 'minutes'}.`)
      } else if (r.result === 'failed') {
        setLine(r.message ?? 'Could not check the sites.')
      } else {
        setLine('Checked just now.')
      }
    } finally {
      setBusy(false)
    }
  }

  const status = line ?? (header ? `Sites checked ${relativeTime(last) ?? 'never'}` : `Last checked ${relativeTime(last) ?? 'never'}. It runs by itself once a day.`)

  if (header) {
    return (
      <div className="flex items-center gap-2 text-right" data-testid="growth-site-check">
        <p role="status" aria-live="polite" className="max-w-[240px] text-micro text-ink-muted">{status}</p>
        <Button variant="ghost" size="sm" className="tap-44" onClick={() => void press()} aria-busy={busy || undefined} data-testid="growth-site-check-button">
          {busy ? <Working size={14} /> : <RefreshCw size={14} aria-hidden />}
          {busy ? work.label : 'Check now'}
        </Button>
      </div>
    )
  }

  return (
    <div className={`flex ${compact ? 'flex-col items-start gap-1' : 'flex-wrap items-center gap-x-3 gap-y-1'}`} data-testid="growth-site-check">
      <Button variant="outline" size="default" className="tap-44" onClick={() => void press()} aria-busy={busy || undefined} data-testid="growth-site-check-button">
        {busy ? <Working size={14} /> : <RefreshCw size={16} aria-hidden />}
        {busy ? work.label : 'Check the sites now'}
      </Button>
      <p role="status" aria-live="polite" className="text-micro text-ink-muted">{status}</p>
    </div>
  )
}
