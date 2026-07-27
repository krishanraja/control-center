// Client-side shapes for the worry compiler. Mirrors the four states the
// server validates in api/_worry-prompt.ts.
//
// Note what is NOT here: any type or helper for listing worries. The compiler
// is an intake and a closer, not a journal. The only rows the client ever sees
// are tests due today and the open tests blocking a capped save.

export type WorryState = 'test' | 'action' | 'relitigation' | 'weather'
export type TestOutcome = 'confirmed' | 'disconfirmed' | 'partial'
export type ActionDisposition = 'done_now' | 'tomorrow_one'

export interface Compilation {
  state: WorryState
  reasoning: string
  belief?: string
  prediction?: string
  test_plan?: string
  test_due_date?: string
  action_text?: string
  original_decision?: string
  evidence_question?: string
  label?: string
}

export interface OpenTest {
  id: string
  prediction: string
  test_due_date: string
}

export interface DueTest extends OpenTest {
  test_plan: string
}

export interface Calibration {
  total_closed: number
  pct_confirmed: number
  pct_disconfirmed: number
  pct_partial: number
}

export interface DueResponse {
  due: DueTest[]
  calibration: Calibration
  open_test_count: number
  cap: number
  today: string
}

/** Calibration only shows once there is enough history to mean anything. */
export const CALIBRATION_MIN_CLOSED = 5

export const OUTCOME_LABEL: Record<TestOutcome, string> = {
  confirmed: 'Came true',
  disconfirmed: 'Did not',
  partial: 'Partly',
}

export function formatDue(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })
    .format(new Date(Date.UTC(y, m - 1, d, 12)))
}
