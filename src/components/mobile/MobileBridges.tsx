import { MobileShell } from './MobileShell'
import { TabHeader } from './primitives'
import { BridgesBody } from '../desktop/DesktopBridges'

// Bridges was the one People lane that rendered bare. PeopleTab puts every
// narrow lane inside a `flex-1 min-h-0` column and expects the lane to bring
// its own scroll container, which every other lane gets from MobileShell.
// Without one the content was clipped to the viewport with no way to scroll
// and its last card sat under the BottomNav.

export function MobileBridges() {
  return (
    <MobileShell
      header={<TabHeader title="Bridges" subtitle="You send everything yourself" />}
    >
      <BridgesBody narrow />
    </MobileShell>
  )
}
