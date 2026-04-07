import type { VercelRequest, VercelResponse } from '@vercel/node'

const today = new Date().toLocaleDateString('en-GB', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
})

const ITEMS = [
  {
    id: 't1',
    title: 'Confirm April recording availability for Nell',
    detail: 'Nell is blocked on podcast guest pitches until you confirm which weeks you can record.',
    owner: 'krish',
    status: 'pending',
    priority: 1,
    est: '2 min'
  },
  {
    id: 't2',
    title: 'Approve agent plans in dashboard',
    detail: '10 April agent plans are awaiting your review in the Agent Plans tab.',
    owner: 'krish',
    status: 'pending',
    priority: 2,
    est: '15 min'
  },
  {
    id: 't3',
    title: 'Activate Drive Sync workflow in N8N',
    detail: 'Open workflow PPfv8kHNBzSq7fm0, confirm Google Docs credential, click Activate.',
    owner: 'krish',
    status: 'pending',
    priority: 3,
    est: '5 min'
  },
  {
    id: 't4',
    title: 'Provide Fractionl Stripe API key',
    detail: 'Leo is blocked on revenue tracking until the Stripe key is in place.',
    owner: 'krish',
    status: 'pending',
    priority: 4,
    est: '5 min'
  },
  {
    id: 't5',
    title: 'Skyview proposal — Felix needs direction',
    detail: '$120K engagement in proposal stage. Felix is ready to move.',
    owner: 'krish',
    status: 'pending',
    priority: 5,
    est: '30 min'
  }
]

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'no-store')
  res.json({ date: today, items: ITEMS })
}
