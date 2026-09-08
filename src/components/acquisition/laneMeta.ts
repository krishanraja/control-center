import type { AcquisitionLane } from '../../hooks/useAcquisition'

/** Shared presentational metadata for the Growth tab surfaces. */

/**
 * The three rungs, in the words Krish reads. L1, L2 and L3 stay as the short
 * badge because the routes and the audit log speak in them, but a badge is
 * not an explanation: "I don't know what autonomy ladder means" (2026-09-08).
 */
export const AUTONOMY_LABEL: Record<string, string> = {
  L1: 'You approve every send',
  L2: 'They send, you check 1 in 10',
  L3: 'They send, you only see exceptions',
}

export const AUTONOMY_EXPLAIN: Record<string, string> = {
  L1: 'Nothing goes out without your tap. The starting rung for every product.',
  L2: 'The agents send on their own. One in ten lands in your queue as a spot check.',
  L3: 'The agents send on their own. You only see the ones the rules flag.',
}

export const AUTONOMY_CHIP: Record<string, string> = {
  L1: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  L2: 'border-cyan-400/30 bg-cyan-400/10 text-cyan-300',
  L3: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
}

/** Send-ledger status to accent (mirrors the FleetFunnel health language). */
export const SEND_STATUS_TONE: Record<string, string> = {
  queued: 'text-amber-300',
  approved: 'text-cyan-300',
  sent: 'text-emerald-300',
  rejected: 'text-rose-300',
  suppressed: 'text-white/40',
  failed: 'text-rose-300',
}

export function laneDot(lane: AcquisitionLane): string {
  if (!lane.active) return 'bg-white/20'
  return lane.wired ? 'bg-emerald-400' : 'bg-amber-400'
}

export function laneDotTitle(lane: AcquisitionLane): string {
  if (!lane.active) return 'Parked'
  return lane.wired ? 'Pipeline wired' : 'Not wired yet, no capture or ledger activity'
}
