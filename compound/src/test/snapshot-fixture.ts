import latest from "../../public/latest.json";
import { parseSnapshot } from "../lib/snapshot";
import type { Snapshot } from "../types";

/**
 * Tests run against the file the app actually reads, so a pipeline change that
 * breaks the contract fails here rather than in the browser.
 */
export function loadFixture(): Snapshot {
  return parseSnapshot(latest as unknown);
}

export const fixture = loadFixture();
