// _beat — the MYMU: Teardown beat gate (G0).
//
// Krish, 2026-08-06, defining the beat: "NOT technical news or things about
// governance, enterprise pilots and boring crap like that, but what are the
// second order effects of AI on pricing, positioning, corporate strategy, unit
// economics, the human labor, leaders etc."
//
// Enforced in code, not in a prompt, for the same reason the vendor-number rule
// is: a prompt instruction loses to a high-scoring candidate every time. The
// interestingness score selects hardest on asymmetry, and capability
// announcements score beautifully on asymmetry while being precisely the beat
// Krish excluded.
//
// The rule is NOT "never mention a model release". It is "the event is never the
// story, the second-order economic effect is the story". An off-beat headline
// therefore survives when the load-bearing sentence is about money or labour:
//   "GPT-5.5 launch quietly repriced the whole agent market"  -> ON beat
//   "OpenAI launches GPT-5.5 with a 2M token context window"  -> OFF beat
//
// Deliberately dependency-free so it can be checked without booting Supabase
// (see scripts/check-teardown-beat.mts).

/** Event-shaped stories that are not, by themselves, the beat. */
export const OFF_BEAT =
  /\b(launch(es|ed)?|releases?|unveil(s|ed)?|announc(e|es|ed|ement)|introduc(e|es|ing)|debuts?|benchmark|leaderboard|state of the art|SOTA|outperform|beats? (GPT|Claude|Gemini|Llama)|model card|context window|parameters?|open.?sourc|regulat(e|ion|ory)|governance|compliance|EU AI Act|executive order|policy|guardrails?|pilot programme?|pilot program|proof of concept|POC|partnership|integrat(es|ion) with|funding round|raises? \$|Series [A-F]\b)/i

/** Second-order economic substance: the thing that makes a story a Teardown. */
export const ON_BEAT =
  /\b(pricing?|priced?|price|margin|unit econom|cost per|cost to serve|revenue|monetis|monetiz|subsidy|subsidis|subsidiz|charge[sd]?|billing|seat|per.seat|contract value|churn|retention|headcount|layoff|redundanc|hiring|labou?r|job(s)?|role(s)?|wage|salary|procurement|budget|spend|capex|opex|P&L|gross margin|take rate|commission|positioning|competitive|market share|business model)/i

/**
 * True when a candidate belongs on the MYMU: Teardown beat.
 * Economic substance anywhere wins; otherwise a pure event story is rejected.
 */
export function onTeardownBeat(headline: string, numberSentence?: string | null): boolean {
  const text = `${headline} ${numberSentence || ''}`
  if (ON_BEAT.test(text)) return true
  return !OFF_BEAT.test(headline)
}
