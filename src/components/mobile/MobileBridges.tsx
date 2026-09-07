import { MobileShell } from './MobileShell'
import { TabHeader } from './primitives'
import { BridgesBody } from '../desktop/DesktopBridges'

// The Hunt lane on a phone. PeopleTab puts every narrow lane inside a
// `flex-1 min-h-0` column and expects the lane to bring its own scroll
// container, which every other lane gets from MobileShell.

export function MobileBridges() {
  return (
    <MobileShell
      header={<TabHeader title="Hunt" subtitle="Roles you said Yes to, and who gets you in" />}
    >
      <BridgesBody narrow />
    </MobileShell>
  )
}
