import { useState } from 'react'
import { MobileShell } from './MobileShell'
import { MindmakeIdentity } from '../shared/MindmakeIdentity'
import { PilotsBody } from '../desktop/DesktopPilots'

/**
 * Pilots on a phone: one fixed screen, never a page.
 *
 * This used to be `MobileShell scroll="auto"` with a full `TabHeader` on top,
 * and it was the lane Krish screenshotted to say the no-scroll contract was
 * not being kept. The shell was only half of it. The header was a 28px title
 * beside a 40px logomark with its own subtitle row, all of it magnified by the
 * 1.2 zoom root, and underneath it the lane stacked a purpose paragraph, a
 * disclosure, a counts row, a button row, a chip row and then a list of tall
 * cards. Nothing about that fits 844 points.
 *
 * So the shell is `scroll="none"` always, not only while the proposals deck is
 * up, and the header is one compact line: the identity mark beside the name
 * and the count, the way MobileHome composes its own. Everything else moved
 * into the lane, which owns the frame and the bands inside it.
 */
export function MobilePilots() {
  const [deck, setDeck] = useState(false)

  return (
    <MobileShell
      scroll="none"
      header={
        <div className="flex items-center gap-2.5">
          <MindmakeIdentity size={28} />
          <div className="min-w-0">
            <h1 className="text-title font-bold leading-none tracking-tight text-white">Pilots</h1>
            {/* Only while the deck is up. The old subtitle read "25 leaders you
                already know" on every visit, which was both a row of chrome
                the counts line immediately repeated and a number the list did
                not have: it said 25 with two people on it. */}
            {deck && <p className="text-label text-white/50 mt-0.5">Keep the ones worth asking</p>}
          </div>
        </div>
      }
    >
      <PilotsBody narrow onDeckActive={setDeck} />
    </MobileShell>
  )
}
