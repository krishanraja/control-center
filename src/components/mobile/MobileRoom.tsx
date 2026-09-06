import { MobileShell } from './MobileShell'
import { TabHeader } from './primitives'
import { RoomBody } from '../desktop/DesktopRoom'

// Same shell as MobileBridges: PeopleTab puts every narrow lane inside a
// `flex-1 min-h-0` column and expects the lane to bring its own scroll
// container, which MobileShell provides along with the BottomNav clearance.

export function MobileRoom() {
  return (
    <MobileShell
      header={<TabHeader title="The Room" subtitle="The OS drafts, you send" />}
    >
      <RoomBody narrow />
    </MobileShell>
  )
}
