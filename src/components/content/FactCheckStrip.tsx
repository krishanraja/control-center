import { useCallback, useEffect, useState } from 'react'

/**
 * The fact gate, where Krish approves.
 *
 * Since 2026-09-25 the engine refuses to move a piece in one of the three
 * sections to review, approval or publication until every checkable claim in
 * its exact text has been checked twice: against the source's own words, and
 * by an independent checker on the web (content-engine api/_factGate.ts).
 * Krish asked for it: "we cannot afford even a chance of factual errors
 * slipping in." Until this strip, only an agent session could run a check, so
 * the refusal named a step he had no button for.
 *
 * Plain words throughout (Krish, 2026-09-25: no words "someone needs to
 * interpret"): each claim still to fix says what is wrong in a sentence.
 *
 * Below the facts sits the rest of the checklist his house rules make
 * mechanical (content-engine api/_publishChecks.ts): no em dashes or
 * exclamation marks, no "Not X, Y", reading age 12, and a dated prediction
 * with a confidence. The engine refuses approval until the blocking ones pass.
 */

type Claim = {
  sentence: string
  claim: string
  verdict: 'verified' | 'verified_on_file' | 'verified_web' | 'contradicted' | 'unverified'
  on_file?: { verdict?: string; note?: string | null }
  independent?: { verdict?: string; evidence?: string | null; url?: string | null; correct_value?: string | null }
}
type FactCheck = { ran_at: string; claims: Claim[]; blocking: number; passed: boolean; set_aside?: unknown[] }
type Gate = { ok: boolean; reason: string | null }
type Check = { id: string; name: string; ok: boolean; blocking: boolean; detail: string }

const LIVE = new Set(['follow_the_money', 'mind_the_gap', 'under_the_hood'])
const PASSING = new Set(['verified', 'verified_on_file', 'verified_web'])

export function isGatedSection(laneSlot: string | null | undefined): boolean {
  return LIVE.has(String(laneSlot || ''))
}

/** What is wrong with a claim, in one plain sentence. */
export function whyNot(c: Claim): string {
  if (c.verdict === 'contradicted') {
    const said = c.independent?.correct_value || c.on_file?.note
    return said ? `The sources say otherwise: ${said}` : 'The sources say otherwise.'
  }
  return 'Not found in the sources on file, and the web check could not confirm it.'
}

export function FactCheckStrip({ ideaId }: { ideaId: string }) {
  const [gate, setGate] = useState<Gate | null>(null)
  const [check, setCheck] = useState<FactCheck | null>(null)
  const [rules, setRules] = useState<Check[]>([])
  const [ready, setReady] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/content-ideas/${ideaId}/fact-check`)
      const j = await r.json().catch(() => ({}))
      if (r.ok && j?.ok) {
        setGate(j.gate || null); setCheck(j.fact_check || null)
        setRules(Array.isArray(j.checks) ? j.checks : []); setReady(j.ready === true)
      }
    } catch { /* the strip still offers the button */ }
  }, [ideaId])

  useEffect(() => { void load() }, [load])

  const run = async () => {
    setRunning(true); setError(null)
    try {
      const r = await fetch(`/api/content-ideas/${ideaId}/fact-check`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || j?.ok === false) throw new Error(j?.error || `The check could not run (HTTP ${r.status}).`)
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally { setRunning(false) }
  }

  const failing = (check?.claims || []).filter(c => !PASSING.has(c.verdict))
  const checked = check?.claims?.length || 0
  const status = running ? 'Checking' : gate?.ok ? 'Passed' : check ? (failing.length ? `${failing.length} to fix` : 'Out of date') : 'Not checked'
  const tone = gate?.ok ? 'border-emerald-700/25 bg-emerald-600/[0.07]' : 'border-amber-700/20 bg-amber-600/[0.07]'

  return (
    <section aria-label="Fact check" data-testid="fact-check-strip" className={`mt-3 rounded-xl border p-3 ${tone}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-micro font-semibold uppercase tracking-[0.14em] text-[#102017]/60">Fact check</span>
        <span data-testid="fact-check-status" className="rounded-full bg-[#102017] px-2.5 py-1 text-micro font-semibold text-[#f4f1e6]">{status}</span>
      </div>
      <p className="mt-2 text-label leading-relaxed text-[#102017]/72">
        {running
          ? 'Checking every fact twice: against the sources on file, and on the web. This takes a minute or two.'
          : gate?.ok
            ? (checked === 1 ? 'The one fact in this exact version passed.' : `All ${checked} facts in this exact version passed.`)
            : gate?.reason || 'Every fact must be checked before this can go to review or be approved.'}
      </p>
      {failing.length && !running ? (
        <ul className="mt-2 space-y-2" aria-label="Facts to fix">
          {failing.map((c, i) => (
            <li key={i} className="rounded-lg border border-[#102017]/12 bg-white/45 p-2.5 text-label leading-relaxed text-[#102017]/80">
              <span className="block font-semibold text-[#102017]">"{c.sentence}"</span>
              <span className="block">{whyNot(c)}</span>
              {c.independent?.url ? <a className="block break-all underline decoration-[#102017]/30 underline-offset-2" href={c.independent.url} target="_blank" rel="noreferrer noopener">Source the web check used</a> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {rules.length ? (
        <div className="mt-3 border-t border-[#102017]/12 pt-2.5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-micro font-semibold uppercase tracking-[0.14em] text-[#102017]/60">Before it can be approved</span>
            <span data-testid="house-rules-status" className="text-micro font-semibold text-[#102017]/70">{ready ? 'Ready' : `${rules.filter(c => c.blocking && !c.ok).length} to go`}</span>
          </div>
          <ul className="mt-1.5 space-y-1" aria-label="House rules checklist">
            {rules.map(c => (
              <li key={c.id} className="flex gap-2 text-label leading-snug text-[#102017]/80">
                <span aria-hidden="true" className={`mt-0.5 inline-block h-3.5 w-3.5 shrink-0 rounded-full border-2 ${c.ok ? 'border-emerald-700 bg-emerald-600' : c.blocking ? 'border-[#102017]/60 bg-transparent' : 'border-amber-700 bg-amber-400'}`} />
                <span><strong className="font-semibold text-[#102017]">{c.name}.</strong> <span className="sr-only">{c.ok ? 'Passes.' : c.blocking ? 'Not yet.' : 'Check.'}</span>{c.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {error ? <p role="alert" className="mt-2 text-label text-red-800">{error}</p> : null}
      {!gate?.ok ? (
        <button
          type="button"
          disabled={running}
          onClick={run}
          className="mt-2 min-h-[44px] w-full rounded-xl border-2 border-[#102017] bg-[#f4f1e6] px-4 text-label font-bold text-[#102017] disabled:opacity-45"
        >{running ? 'Checking the facts' : 'Check the facts'}</button>
      ) : null}
    </section>
  )
}
