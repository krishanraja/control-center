import { VercelRequest, VercelResponse } from '@vercel/node'
import { readFileSync } from 'fs'
import { join } from 'path'

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Access-Control-Allow-Origin', '*')

  try {
    const filePath = join(process.cwd(), 'public', 'data', 'jobs.json')
    const data = JSON.parse(readFileSync(filePath, 'utf-8'))
    return res.status(200).json(data)
  } catch {
    return res.status(200).json({
      updated_at: new Date().toISOString(),
      tracker_url: 'https://docs.google.com/spreadsheets/d/1gJHU37h8nSw8K2XA6fphpC1UiAukR_BTJ9e39os5oh8/edit',
      active_applications: []
    })
  }
}
