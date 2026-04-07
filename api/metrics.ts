import type { VercelRequest, VercelResponse } from '@vercel/node'
import { readFileSync } from 'fs'
import { join } from 'path'

function readJson(name: string) {
  try {
    return JSON.parse(readFileSync(join(process.cwd(), 'public', 'data', name), 'utf8'))
  } catch {
    return null
  }
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'no-store')
  const data = readJson('metrics.json')
  if (!data) return res.status(500).json({ error: 'metrics.json not found' })
  res.json(data)
}
