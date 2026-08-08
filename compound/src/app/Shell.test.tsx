import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fixture } from "../test/snapshot-fixture";
import type { TabKey } from "../types";
import { Shell } from "./Shell";

/**
 * jsdom reports every media query as false, so these render the stack system.
 * `asSplit` flips the two queries the device hook reads, which is how the
 * desktop system gets covered without a browser.
 */
function asSplit() {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("min-width: 900px") || query.includes("min-width: 1400px"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

function renderShell(tab: TabKey = "now") {
  const onTab = vi.fn();
  const view = render(<Shell snapshot={fixture} config={{ mode: "demo" }} session={null} tab={tab} onTab={onTab} />);
  return { onTab, view };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Shell", () => {
  it("offers all five sections and reports the current one", () => {
    const { onTab } = renderShell();
    const nav = screen.getByRole("navigation", { name: "Sections" });
    for (const name of ["Today", "Trends", "Stocks", "Money", "Ask"]) {
      expect(within(nav).getByRole("button", { name })).toBeInTheDocument();
    }
    expect(within(nav).getByRole("button", { name: "Today" })).toHaveAttribute("aria-current", "page");

    fireEvent.click(within(nav).getByRole("button", { name: "Stocks" }));
    expect(onTab).toHaveBeenCalledWith("stocks");
  });

  it("leads with a forward claim and keeps the working folded away", () => {
    renderShell();
    expect(screen.getByRole("heading", { name: "Your AI Fund Strategist" })).toBeInTheDocument();

    const card = screen.getByRole("button", { name: /should be dying/ });
    expect(card).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(card);
    expect(card).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/Company accounts through FMP/)).toBeVisible();
  });

  it("splits stocks by whether the checks agree", () => {
    renderShell("stocks");
    expect(screen.getByRole("heading", { name: "Most checks agree" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Only the price says so" })).toBeInTheDocument();
    // Palantir has price, experts and news pointing the same way.
    expect(screen.getByRole("button", { name: /PLTR/ })).toBeInTheDocument();
  });

  it("opens a stock as a sheet with a way back, not a new route", () => {
    renderShell("stocks");
    fireEvent.click(screen.getByRole("button", { name: /PLTR/ }));
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
    expect(screen.getByText("What would change this")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("heading", { name: "Which ones have real backing." })).toBeInTheDocument();
  });

  it("hides an industry everywhere once it is switched off", () => {
    renderShell("stocks");
    const before = screen.getByText(/^\d+ companies/).textContent ?? "";

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    // Searching flattens the family rollup to the individual industries.
    fireEvent.change(screen.getByLabelText("Search industries"), { target: { value: "Software - Infrastructure" } });
    const toggle = screen.getByRole("switch", { name: /Software - Infrastructure/ });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "false");

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    const after = screen.getByText(/^\d+ companies/).textContent ?? "";
    expect(after).not.toBe(before);
    expect(after).toContain("1 industry hidden");
    expect(screen.queryByRole("button", { name: /PLTR/ })).not.toBeInTheDocument();
  });

  it("hides a whole list of industries at once", () => {
    renderShell("stocks");
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    // Narrow to what today actually carries, then hide all of it in one press.
    fireEvent.change(screen.getByLabelText("Search industries"), { target: { value: "software" } });
    const listed = screen.getAllByRole("switch");
    expect(listed.length).toBeGreaterThan(1);
    for (const toggle of listed) expect(toggle).toHaveAttribute("aria-checked", "true");

    fireEvent.click(screen.getByRole("button", { name: `Hide these ${listed.length}` }));
    for (const toggle of screen.getAllByRole("switch")) expect(toggle).toHaveAttribute("aria-checked", "false");

    fireEvent.click(screen.getByRole("button", { name: "Show everything again" }));
    for (const toggle of screen.getAllByRole("switch")) expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  it("lists only the industries carrying companies when asked", () => {
    renderShell("stocks");
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    const filter = screen.getByRole("group", { name: "Which industries to list" });
    fireEvent.click(within(filter).getByRole("button", { name: /Active/ }));
    const active = screen.getAllByRole("switch");
    expect(active.length).toBeGreaterThan(0);
    for (const toggle of active) expect(toggle).not.toHaveTextContent("nothing today");
  });

  it("rolls industries into families and drills into one", () => {
    renderShell("stocks");
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    // The resting view shows a family switch, not the industries inside it.
    expect(screen.getByRole("switch", { name: "Show Software" })).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: /Software - Infrastructure/ })).not.toBeInTheDocument();

    // Opening the family reveals its member industries.
    fireEvent.click(screen.getByRole("button", { name: /Software/ }));
    expect(screen.getByRole("switch", { name: /Software - Infrastructure/ })).toBeInTheDocument();

    // The family switch hides every industry under it in one tap.
    fireEvent.click(screen.getByRole("switch", { name: "Show Software" }));
    expect(screen.getByRole("switch", { name: /Software - Infrastructure/ })).toHaveAttribute("aria-checked", "false");
  });

  it("weaves cited real-world context into the Today cards", () => {
    renderShell();
    // Every insight fuses in its own cited world-context block, not a feed.
    expect(screen.getAllByText(/In the wider world/)).toHaveLength(3);
    // Open the AI-vs-IT-services insight; it cites Reuters and links open out.
    fireEvent.click(screen.getByRole("button", { name: /should be dying/ }));
    const cite = screen.getByRole("link", { name: /Reuters/ });
    expect(cite.getAttribute("href")).toContain("reuters.com");
    expect(cite).toHaveAttribute("target", "_blank");
  });

  it("hands a card's question to Ask and answers it", () => {
    const { onTab, view } = renderShell();
    fireEvent.click(screen.getByRole("button", { name: /should be dying/ }));
    fireEvent.click(screen.getAllByRole("button", { name: "Ask about this" })[0]);
    expect(onTab).toHaveBeenCalledWith("ask");

    // The parent owns the tab, so replay what it would do next.
    view.rerender(<Shell snapshot={fixture} config={{ mode: "demo" }} session={null} tab="ask" onTab={onTab} />);
    expect(screen.getByRole("heading", { name: "Ask." })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "What is my biggest risk?" }));
    expect(screen.getByText(/Having too much in one thing/)).toBeInTheDocument();
    expect(screen.getByText("Where this came from")).toBeInTheDocument();
  });

  it("drills from a trend into the companies on each side", () => {
    renderShell("shifts");
    expect(screen.getByRole("heading", { name: "The three forces." })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /AI chips against IT services/i }));
    fireEvent.click(screen.getAllByRole("button", { name: "See both sides" })[0]);
    expect(screen.getByText("the story says this side wins")).toBeInTheDocument();
    expect(screen.getByText("the story says this side loses")).toBeInTheDocument();
    expect(screen.getByText("CTSH")).toBeInTheDocument();
  });

  it("groups industries by direction first, never by a bounce", () => {
    renderShell("shifts");
    const group = screen.getByRole("group", { name: "Which group" });
    // The phone track is two across, so the names are short enough to fit one.
    expect(within(group).getByRole("button", { name: /Up, still cheap \(27\)/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(group).getByRole("button", { name: /Down, slowing \(17\)/ }));
    expect(screen.getByText(/Still down over three months/)).toBeInTheDocument();
  });
});

describe("device systems", () => {
  it("puts the tabs at the bottom and the detail over the screen on a phone", () => {
    renderShell("stocks");
    expect(document.querySelector(".shell.stack")).toBeInTheDocument();
    expect(document.querySelector(".botnav")).toBeInTheDocument();
    expect(document.querySelector(".sidenav")).not.toBeInTheDocument();
    // No column headings: a phone list has no columns to head.
    expect(document.querySelector(".dthead")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /PLTR/ }));
    expect(document.querySelector(".sheet")).toBeInTheDocument();
    expect(document.querySelector(".panel")).not.toBeInTheDocument();
  });

  it("puts the sections in a rail and the detail beside the list on a desktop", () => {
    asSplit();
    renderShell("stocks");
    expect(document.querySelector(".shell.split")).toBeInTheDocument();
    expect(document.querySelector(".sidenav")).toBeInTheDocument();
    expect(document.querySelector(".botnav")).not.toBeInTheDocument();
    // The rail has room for the long section names and what each one is for.
    const nav = screen.getByRole("navigation", { name: "Sections" });
    expect(within(nav).getByText("My money")).toBeInTheDocument();
    expect(within(nav).getByText("What you own and what it is doing")).toBeInTheDocument();
    expect(document.querySelector(".dthead")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /PLTR/ }));
    expect(document.querySelector(".panel")).toBeInTheDocument();
    expect(document.querySelector(".sheet")).not.toBeInTheDocument();
    // The list stays on screen next to the panel rather than being covered.
    expect(screen.getByRole("heading", { name: "Which ones have real backing." })).toBeInTheDocument();
  });

  it("spells the group names out where there is width for them", () => {
    asSplit();
    renderShell("shifts");
    const group = screen.getByRole("group", { name: "Which group" });
    expect(within(group).getByRole("button", { name: /Going up, still cheap/ })).toBeInTheDocument();
    expect(within(group).getByRole("button", { name: /Going down, but slowing/ })).toBeInTheDocument();
  });

  it("moves between sections with the number keys on a desktop", () => {
    asSplit();
    const { onTab } = renderShell();
    fireEvent.keyDown(window, { key: "3" });
    expect(onTab).toHaveBeenCalledWith("stocks");
  });

  it("leaves the number keys alone on a phone, where there is no keyboard", () => {
    const { onTab } = renderShell();
    fireEvent.keyDown(window, { key: "3" });
    expect(onTab).not.toHaveBeenCalled();
  });
});
