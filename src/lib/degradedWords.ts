/**
 * Plain words for the search stages that did not run.
 *
 * The Network banner printed the raw token at Krish: "Ranked with less data
 * than usual (planner:anthropic_401:API key is invalid.)". That string is
 * assembled from an upstream HTTP status and a vendor's error body, and it
 * tells the person reading it nothing they can act on. Pilots already had a
 * translator; it lived in DesktopPilots and the Network tab did not import it,
 * so one lane spoke English and the other leaked a stack detail.
 *
 * One translator, both lanes. Anything unrecognised degrades to the token with
 * its punctuation softened rather than being swallowed: an unknown stage
 * should still be readable, and silence would be worse than a rough word.
 */
export function degradedWords(stages: string[]): string {
  const words = stages.map(stage => {
    if (stage.startsWith('embedding')) return 'semantic matching'
    if (stage.startsWith('rerank')) return 'the reranker'
    if (stage.startsWith('planner')) return 'the query planner'
    return stage.replace(/[:_]/g, ' ')
  })
  return [...new Set(words)].join(' or ')
}

/** True when a degraded stage is an authentication failure rather than a
 *  transient one. Worth saying out loud: a key that is invalid will not fix
 *  itself, and every retry will fail the same way. */
export function isAuthFailure(stages: string[]): boolean {
  return stages.some(s => /_401|_403|invalid.*key|missing_anthropic_key|not configured/i.test(s))
}
