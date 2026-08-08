import { createContext, useContext, type ReactNode } from "react";
import type { Device } from "../lib/device";

/**
 * Every component asks which system it is rendering into rather than taking a
 * prop through six layers. A leaf that reads `layout` is allowed to render a
 * different tree, not just a different class name, which is the whole point.
 */
const DeviceContext = createContext<Device>({ layout: "stack", input: "touch", columns: 1, scale: 1 });

export function DeviceProvider({ device, children }: { device: Device; children: ReactNode }) {
  return <DeviceContext.Provider value={device}>{children}</DeviceContext.Provider>;
}

export function useDeviceContext(): Device {
  return useContext(DeviceContext);
}

/** True when the desktop system is rendering. Reads well at the call site. */
export function useSplit(): boolean {
  return useContext(DeviceContext).layout === "split";
}
