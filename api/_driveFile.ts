import { googleAccessToken } from './_google.js'

// Read a file out of Krish's Drive, as its owner.
//
// Shared by the LinkedIn export importers so the export can stay where it
// already is rather than being copied somewhere the app owns. Needs
// drive.readonly on the service account's domain-wide delegation, added
// 2026-10-03 beside gmail.readonly and calendar.readonly.

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly'

export async function readDriveText(fileId: string): Promise<string> {
  let lastErr = ''
  const token = await googleAccessToken([DRIVE_SCOPE], {
    subject: process.env.GOOGLE_DRIVE_OWNER || 'krish@mindmake.co',
    onError: (e: string) => { lastErr = e },
  })
  if (!token) throw new Error(`drive: ${lastErr || 'no token'}`)

  const r = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!r.ok) throw new Error(`drive ${r.status}: ${(await r.text()).slice(0, 300)}`)
  return r.text()
}
