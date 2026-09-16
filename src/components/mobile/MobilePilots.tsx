import { useState } from 'react'
import { MobileShell } from './MobileShell'
import { TabHeader } from './primitives'
import { PilotsBody, PILOT_SUBTITLE } from '../desktop/DesktopPilots'

// Same shell as MobileBridges: PeopleTab puts every narrow lane inside a
// `flex-1 min-h-0` column and expects the lane to bring its own scroll
// container, which MobileShell provides along with the BottomNav clearance.
//
// While the swipe deck is up the shell switches to `scroll="none"`, the way
// MobileGuests does it. The deck used to sit in a fixed 540px box inside the
// page scroller, so a swipe and a scroll competed for the same drag and the
// page moved under the cards. A card deck is a stage, not a list.

export function MobilePilots() {
  const [deck, setDeck] = useState(false)

  return (
    <MobileShell
      scroll={deck ? 'none' : 'auto'}
      header={
        <TabHeader
          title="Pilots"
          subtitle={deck ? 'Keep the ones worth asking' : PILOT_SUBTITLE}
        />
      }
    >
      <PilotsBody narrow onDeckActive={setDeck} />
    </MobileShell>
  )
}
