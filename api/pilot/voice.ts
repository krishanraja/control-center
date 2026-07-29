// POST /api/pilot/voice
//
// Whisper transcription for the pilot layer's spoken inputs. A one-line
// re-export of the shared handler, exactly as api/daily-focus/voice.ts and
// api/tasks-inbox/voice.ts already do. Server-side key, audio in, { ok, text }
// out, and a { ok:false, fallback:'text' } body when Whisper is unavailable so
// the UI can fall back to typing without guessing.
export { handleWhisper as default, config } from '../_whisper.js'
