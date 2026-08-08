import { useEffect, useState } from "react";

/**
 * COMPOUND ships two design systems, not one layout that stretches.
 *
 *   stack  phones and portrait tablets. Thumb reach, one thing per row, full
 *          screen sheets, a bottom tab bar.
 *   split  laptops, desktops and landscape tablets. A rail, a multi column
 *          grid, real tables, and a detail panel that keeps the list in view.
 *
 * `layout` picks the system and `input` picks the hit target size inside it,
 * because a landscape iPad runs the split system with touch sized controls.
 */

export type Layout = "stack" | "split";
export type Input = "touch" | "pointer";

export interface Device {
  layout: Layout;
  input: Input;
  /** How many content columns the split system may use. Always 1 on stack. */
  columns: 1 | 2 | 3;
  /**
   * CSS pixels per design pixel, for the stack system.
   *
   * Normally 1. Some Android browsers, and any browser in desktop site mode,
   * report a 980 pixel viewport on a 412 pixel screen and then squeeze the
   * rendered page back down to fit the glass. Phone sized type drawn into that
   * viewport arrives at under half the size it should be. Scaling by the same
   * ratio the browser is about to shrink by cancels it out.
   */
  scale: number;
}

const SPLIT = "(min-width: 900px)";
const THREE_UP = "(min-width: 1400px)";
const COARSE = "(pointer: coarse)";
// Some Android in-app browsers report a 980 pixel viewport on a 390 pixel
// phone. The physical screen is the honest signal, so a small screen stays on
// the stack system no matter what the viewport claims.
const HANDHELD = "(pointer: coarse) and (max-device-width: 820px)";

function matches(query: string): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(query).matches;
}

/** How much wider the viewport is than the screen it has to fit onto. */
function designPixel(layout: Layout): number {
  if (layout !== "stack" || typeof window === "undefined") return 1;
  const viewport = window.innerWidth;
  const screen = window.screen?.width ?? viewport;
  if (!viewport || !screen) return 1;
  const ratio = viewport / screen;
  // Below 1.2 the two agree closely enough to leave alone. Above 3 something
  // is reporting nonsense and scaling further would do more harm than good.
  if (ratio < 1.2) return 1;
  return Math.round(Math.min(ratio, 3) * 100) / 100;
}

function read(): Device {
  const coarse = matches(COARSE);
  const layout: Layout = matches(SPLIT) && !matches(HANDHELD) ? "split" : "stack";
  const columns = layout === "stack" ? 1 : matches(THREE_UP) ? 3 : 2;
  return { layout, input: coarse ? "touch" : "pointer", columns, scale: designPixel(layout) };
}

function same(a: Device, b: Device): boolean {
  return a.layout === b.layout && a.input === b.input && a.columns === b.columns && a.scale === b.scale;
}

export function useDevice(): Device {
  const [device, setDevice] = useState<Device>(read);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const lists = [SPLIT, THREE_UP, COARSE, HANDHELD].map((query) => window.matchMedia(query));
    const update = () => setDevice((current) => {
      const next = read();
      return same(current, next) ? current : next;
    });
    update();
    for (const list of lists) list.addEventListener?.("change", update);
    // The viewport to screen ratio changes on rotation, and no media query
    // fires for it, so the resize event is the only signal.
    window.addEventListener("resize", update);
    return () => {
      for (const list of lists) list.removeEventListener?.("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return device;
}
