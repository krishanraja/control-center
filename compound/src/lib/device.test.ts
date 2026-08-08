import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDevice } from "./device";

/**
 * The device hook reads three things the test environment has to fake: the
 * media queries, the viewport width, and the physical screen width. The last
 * two are what separate a real phone from a browser reporting a 980 pixel
 * viewport on a 412 pixel screen.
 */
function device({ width, screen, split = false, coarse = true, handheld = true }: {
  width: number;
  screen: number;
  split?: boolean;
  coarse?: boolean;
  handheld?: boolean;
}) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("max-device-width")
      ? handheld
      : query.includes("pointer: coarse")
        ? coarse
        : query.includes("min-width: 1400px")
          ? false
          : query.includes("min-width: 900px")
            ? split
            : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal("innerWidth", width);
  vi.stubGlobal("screen", { width: screen, height: 900 });
  return renderHook(() => useDevice()).result.current;
}

afterEach(() => vi.unstubAllGlobals());

describe("which system runs", () => {
  it("puts a phone on the stack system", () => {
    expect(device({ width: 390, screen: 390 })).toMatchObject({ layout: "stack", input: "touch" });
  });

  it("puts a desktop on the split system", () => {
    expect(device({ width: 1440, screen: 1440, split: true, coarse: false, handheld: false }))
      .toMatchObject({ layout: "split", input: "pointer" });
  });

  it("keeps a small screen on the stack system however wide it claims to be", () => {
    // The viewport says desktop. The glass says phone. The glass wins.
    expect(device({ width: 980, screen: 412 }).layout).toBe("stack");
  });

  it("gives a landscape tablet the desktop layout with touch sizing", () => {
    expect(device({ width: 1180, screen: 1180, split: true, coarse: true, handheld: false }))
      .toMatchObject({ layout: "split", input: "touch" });
  });
});

describe("the design pixel", () => {
  it("stays at one when the viewport matches the screen", () => {
    expect(device({ width: 390, screen: 390 }).scale).toBe(1);
    expect(device({ width: 768, screen: 768 }).scale).toBe(1);
  });

  it("cancels the squeeze when the viewport is wider than the screen", () => {
    // 980 into 412 is a 2.38 times shrink, so everything is drawn 2.38 bigger.
    expect(device({ width: 980, screen: 412 }).scale).toBeCloseTo(2.38, 2);
  });

  it("ignores a difference small enough not to matter", () => {
    expect(device({ width: 430, screen: 412 }).scale).toBe(1);
  });

  it("refuses to scale past three, whatever a browser claims", () => {
    expect(device({ width: 4000, screen: 320 }).scale).toBe(3);
  });

  it("never scales the desktop system, which has real pixels to work with", () => {
    expect(device({ width: 1600, screen: 1000, split: true, coarse: false, handheld: false }).scale).toBe(1);
  });
});
