import { handleWhisper, config as whisperConfig } from '../_whisper.js'

// POST /api/content-ideas/voice — transcribe a spoken content idea.
//
// The same pass-through the other four voice routes are (daily-focus, tasks-
// inbox, pilot, and the two interpreting ones). Content was the gap: the
// mobile speed dial offered a mic on "Task" and not on "Idea", which is the
// wrong way round for a phone, and _whisper.ts already biases decoding toward
// house vocabulary including the format names ("Built, Paid, Teardown").
export default handleWhisper
export const config = whisperConfig
