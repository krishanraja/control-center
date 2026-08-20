// The contract a prompt experiment implements.

export interface GenResult {
  output: string
  ms: number
  usd: number
}

export interface Variant<C> {
  name: string
  /** One line on what this arm changes, printed in the report header. */
  note?: string
  run(c: C): Promise<GenResult>
  /** Assemble the prompt without calling anything. Powers `--dry`. */
  preview?(c: C): { system: string; user: string }
}

export interface Judgement {
  /** The headline number. Higher is better, on whatever scale the suite uses. */
  score: number
  detail?: Record<string, unknown>
}

export interface Suite<C extends { id: string }> {
  name: string
  describe: string
  /** The scale the score lives on, for the report header (e.g. "1-5 mean"). */
  scale: string
  loadCases(opts: { fixture: string | null; limit: number }): Promise<C[]>
  /** Optional subgroup label, so the report can break a result out by slice.
   *  An overall win that is really one slice winning and another losing is a
   *  different finding from a uniform win, and only the breakdown shows it. */
  groupOf?(c: C): string
  variants: Variant<C>[]
  judge(c: C, output: string): Promise<Judgement>
}
