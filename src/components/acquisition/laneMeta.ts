import type { AcquisitionLane } from '../../hooks/useAcquisition'

/** Shared presentational metadata for the Growth tab surfaces. */

export const AUTONOMY_LABEL: Record<string, string> = {
  L1: 'L1 · every send approved',
  L2: 'L2 · 1-in-10 sampled',
  L3: 'L3 · exception only',
}

export const AUTONOMY_CHIP: Record<string, string> = {
  L1: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  L2: 'border-cyan-400/30 bg-cyan-400/10 text-cyan-300',
  L3: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
}

/** Send-ledger status → accent (mirrors the FleetFunnel health language). */
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
  return lane.wired ? 'Pipeline wired' : 'Not wired yet — no capture/ledger activity'
}
