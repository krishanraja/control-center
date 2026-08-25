import React from 'react'
import { DetailSheet } from '../mobile/DetailSheet'
import { useHaptics } from '../../hooks/useHaptics'
import { useToast } from '../shared/Toast'
import type { ExternalSignal, SignalUrgency } from '../../hooks/useHomeIntelligence'

/**
 * One signal, opened: why it matters, the recommended move, and the two ways
 * to act on it (a task, or a bet). The Business Intelligence tab and the
 * Home intel drawer open this exact same sheet — one signal presentation,
 * one pair of actions, everywhere.
 */

export const URGENCY_DOT: Record<SignalUrgency, string> = {
  critical: 'bg-red-500',
  high:     'bg-red-400',
  medium:   'bg-amber-400',
  low:      'bg-violet-400',
}

export const URGENCY_ACCENT: Record<SignalUrgency, 'red' | 'amber' | 'violet'> = {
  critical: 'red',
  high:     'red',
  medium:   'amber',
  low:      'violet',
}

export function urgencyChip(u?: SignalUrgency | null, days?: number | null): string | undefined {
  if (!u && (days == null || !Number.isFinite(days))) return undefined
  const label = u ? u.toUpperCase() : ''
  const dayPart = (days != null && Number.isFinite(days))
    ? (days <= 0 ? 'past' : `${days}d`)
    : ''
  return [label, dayPart].filter(Boolean).join(' · ')
}

export function SignalSheet({ signal, onClose }: {
  signal: ExternalSignal | null
  onClose: () => void
}) {
  const h = useHaptics()
  const { toast } = useToast()

  return (
    <DetailSheet
      open={signal != null}
      onClose={onClose}
      eyebrow={
        urgencyChip(signal?.urgency, signal?.days_until) ||
        signal?.source ||
        'Marcus signal'
      }
      title={signal?.signal || ''}
      body={
        signal
          ? [
              signal.relevance ? `Why it matters: ${signal.relevance}` : null,
              signal.recommended_action ? `Recommended move: ${signal.recommended_action}` : null,
              signal.source ? `Source: ${signal.source}` : null,
            ].filter(Boolean).join('\n\n')
          : undefined
      }
      agent="marcus"
      docUrl={signal?.source_url || undefined}
      actions={signal ? [
        {
          label: 'Create task',
          variant: 'primary',
          onClick: async () => {
            h.heavy()
            try {
              // The route owns everything but the words: it inserts with
              // service-role credentials (tasks has no anon INSERT) as
              // active / pre-reviewed / marcus-attributed.
              const r = await fetch('/api/task', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  title: signal.recommended_action || signal.signal,
                  description: [signal.signal, signal.relevance, signal.source_url].filter(Boolean).join('\n\n'),
                  priority: signal.urgency === 'critical' || signal.urgency === 'high' ? 'high' : 'medium',
                }),
              })
              if (!r.ok) throw new Error(`HTTP ${r.status}`)
              h.success()
              toast('Task created — it is live in OS → Queue.', 'success')
              onClose()
            } catch (e: any) {
              h.error()
              toast(`Could not create task: ${e?.message || 'try again'}`, 'error')
            }
          },
        },
        {
          label: 'Add to bets',
          variant: 'secondary',
          onClick: async () => {
            h.heavy()
            try {
              // /api/bets requires hypothesis + success_criterion; the old
              // payload sent wins_if / measure_by_days and 400ed every time.
              const r = await fetch('/api/bets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  hypothesis: signal.signal,
                  success_criterion: signal.recommended_action || 'Krish acts on this signal within the time box.',
                  kind: 'other',
                  time_box_days: 14,
                  agent_owner: 'krish',
                }),
              })
              if (!r.ok) throw new Error(`HTTP ${r.status}`)
              h.success()
              toast('Added to bets — the clock starts now.', 'success')
              onClose()
            } catch (e: any) {
              h.error()
              toast(`Could not add: ${e?.message || 'try again'}`, 'error')
            }
          },
        },
      ] : []}
    />
  )
}
