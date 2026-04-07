import type { VercelRequest, VercelResponse } from '@vercel/node'

// Static task data — update this file to change what shows in the dashboard
// blockedBy: 'krish' = shows in "Blocked on You"
// blockedBy: 'agatha' = shows in "Blocked on Agatha"
const TASKS = [
  {
    id: 'b1',
    venture: 'ops',
    title: 'Drive Sync — Activate in N8N',
    description: 'Open workflow PPfv8kHNBzSq7fm0, confirm Google Docs credential, click Activate.',
    status: 'waiting',
    blockedBy: 'krish',
    urgency: 'medium',
    priority: 'pri-1',
    agent: 'Arlo',
    daysOld: 2,
    nextStep: 'Open N8N → workflow PPfv8kHNBzSq7fm0 → activate'
  },
  {
    id: 'b2',
    venture: 'ops',
    title: 'Instantly API — Check Account Permissions',
    description: 'API returning 403. Check Settings → API in Instantly dashboard to confirm access is enabled.',
    status: 'waiting',
    blockedBy: 'krish',
    urgency: 'low',
    priority: 'pri-1',
    agent: 'Zara',
    daysOld: 2,
    nextStep: 'Instantly Settings → API → confirm API access is enabled'
  },
  {
    id: 'b4',
    venture: 'growth',
    title: 'Scout (Nell) — Confirm April Recording Availability',
    description: 'Nell cannot send podcast guest pitches with dates until you confirm which weeks you are available to record in April.',
    status: 'waiting',
    blockedBy: 'krish',
    urgency: 'high',
    priority: 'pri-0',
    agent: 'Nell',
    daysOld: 0,
    nextStep: 'Reply with your available recording weeks in April'
  },
  {
    id: 'b5',
    venture: 'revenue',
    title: 'Leo — Fractionl Stripe API Key',
    description: 'Weekly Revenue Report errored on first run. Fractionl Stripe integration needs a valid API key.',
    status: 'waiting',
    blockedBy: 'krish',
    urgency: 'high',
    priority: 'pri-0',
    agent: 'Leo',
    daysOld: 0,
    nextStep: 'Provide Fractionl Stripe restricted API key to Agatha'
  }
]

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'no-store')
  res.json({ tasks: TASKS })
}
