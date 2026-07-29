// Pilot layer types. Mirrors public.pilot_checkins and public.ships
// (scripts/migrations/2026-07-27-pilot-layer.sql).

export type PilotMode = 'green' | 'red'
export type CheckinKind = 'morning' | 'evening'
export type ShipSource = 'manual' | 'webhook'

/** The fixed channel list. A ship left the machine through exactly one of these. */
export const SHIP_CHANNELS = ['email', 'publish', 'invoice', 'ask', 'campaign', 'other'] as const
export type ShipChannel = (typeof SHIP_CHANNELS)[number]

export interface PilotCheckin {
  id: string
  created_at: string
  kind: CheckinKind
  energy: number | null
  anxiety: number | null
  one_word: string | null
  mode: PilotMode | null
  shipped_today: string | null
  tomorrow_one: string | null
  tomorrow_one_url: string | null
  override_at: string | null
  checkin_date: string | null
  intent: string | null
}

export interface Ship {
  id: string
  created_at: string
  occurred_at: string
  source: ShipSource
  channel: string
  description: string
  external_ref: string | null
  dedup_key: string | null
}

/** What GET /api/pilot/ships returns. */
export interface ShipSummary {
  this_week: number
  /** Whole days since the most recent ship. Null when nothing has shipped yet. */
  days_since_last: number | null
  last_ten: Ship[]
  /** Median gap in days between consecutive ships over the trailing 60 days. */
  return_rate: number | null
}

/** What GET /api/pilot/checkin returns. */
export interface PilotState {
  /** Today's morning row, in the pilot zone. Null means the gate must render. */
  morning: PilotCheckin | null
  /** The most recent evening row, which carries today's ONE. */
  last_evening: PilotCheckin | null
  /** True once an evening row exists for today, so the shutdown stops prompting. */
  evening_done_today: boolean
  /** Newest morning row of any date, used to suppress the gate across a rollover. */
  last_morning_at: string | null
  today: string
}

export interface LogShipInput {
  channel: ShipChannel
  description: string
}
