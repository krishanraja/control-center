import { describe, expect, it } from "vitest";
import { readConfig } from "./env";

describe("readConfig", () => {
  it("keeps demo mode explicit", () => {
    expect(readConfig({ VITE_COMPOUND_DEMO_MODE: "true" } as ImportMetaEnv)).toEqual({ mode: "demo" });
  });

  it("fails closed when live public settings are missing", () => {
    const config = readConfig({ VITE_COMPOUND_DEMO_MODE: "false" } as ImportMetaEnv);
    expect(config.mode).toBe("live");
    expect(config.error).toMatch(/not connected/i);
  });
});
