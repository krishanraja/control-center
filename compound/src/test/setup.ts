import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// vitest runs without `globals: true`, so Testing Library's automatic teardown
// never registers itself. Without this, one test's DOM leaks into the next.
afterEach(cleanup);

// Hidden industries are written to local storage, and jsdom keeps that between
// tests in a file. One test switching an industry off used to hide it from
// every test that ran after it.
afterEach(() => localStorage.clear());

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
});
