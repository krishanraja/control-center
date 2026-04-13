import type { VercelRequest, VercelResponse } from '@vercel/node'

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')

  // Return empty approvals array
  return res.json({
    items: [],
    total: 0
  })
}
