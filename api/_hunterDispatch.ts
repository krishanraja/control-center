// Waking hunter: one repository_dispatch to krishanraja/hunter.
//
// Hunter is a Python program that runs on GitHub Actions. Two callers wake it:
// the buttons on the hunter card (api/hunter/run.ts), which send a command id,
// and the hourly tick (api/hunter/tick.ts), which sends a bare drain. Both go
// through here so there is one place that knows the repository, the token and
// what a successful send looks like (GitHub answers 204 with no body).

const HUNTER_REPO = process.env.HUNTER_REPO || 'krishanraja/hunter'

export interface DispatchResult { sent: boolean; error?: string }

export async function dispatchHunter(
  eventType: string,
  clientPayload: Record<string, string> = {},
): Promise<DispatchResult> {
  const token = process.env.HUNTER_DISPATCH_TOKEN || process.env.GITHUB_TOKEN || ''
  if (!token) return refused('no dispatch token configured')
  try {
    const r = await fetch(`https://api.github.com/repos/${HUNTER_REPO}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ event_type: eventType, client_payload: clientPayload }),
    })
    if (r.status === 204) return { sent: true }
    const text = await r.text().catch(() => '')
    return refused(`github ${r.status}: ${text.slice(0, 120)}`)
  } catch (e: unknown) {
    return refused((e as Error)?.message?.slice(0, 120) || 'dispatch failed')
  }
}

// The runtime log is the only place a cron's refusal can be read afterwards:
// the first tick answered 502 and the log held the status line alone. GitHub's
// reply names the problem (a token that cannot see the repository answers 404)
// and never carries the token, so it is safe to print.
function refused(error: string): DispatchResult {
  console.error(`hunter dispatch refused: ${error}`)
  return { sent: false, error }
}
