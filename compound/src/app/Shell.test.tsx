import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fixture } from "../test/snapshot-fixture";
import type { TabKey } from "../types";
import { Shell } from "./Shell";

function renderShell(tab: TabKey = "now") {
  const onTab = vi.fn();
  const view = render(<Shell snapshot={fixture} config={{ mode: "demo" }} session={null} tab={tab} onTab={onTab} />);
  return { onTab, view };
}

describe("Shell", () => {
  it("offers all five sections and reports the current one", () => {
    const { onTab } = renderShell();
    const nav = screen.getByRole("navigation", { name: "Sections" });
    for (const name of ["Now", "Shifts", "Stocks", "Mine", "Ask"]) {
      expect(within(nav).getByRole("button", { name })).toBeInTheDocument();
    }
    expect(within(nav).getByRole("button", { name: "Now" })).toHaveAttribute("aria-current", "page");

    fireEvent.click(within(nav).getByRole("button", { name: "Stocks" }));
    expect(onTab).toHaveBeenCalledWith("stocks");
  });

  it("leads with a forward claim and keeps the working collapsed", () => {
    renderShell();
    expect(screen.getByRole("heading", { name: "Three things that could matter next." })).toBeInTheDocument();

    const card = screen.getByRole("button", { name: /should be dying/ });
    expect(card).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(card);
    expect(card).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/FMP income statements/)).toBeVisible();
  });

  it("splits stocks by whether independent sources agree", () => {
    renderShell("stocks");
    expect(screen.getByRole("heading", { name: "Sources agree" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Price is on its own" })).toBeInTheDocument();
    // Palantir has price, analysts and news pointing the same way.
    expect(screen.getByRole("button", { name: /PLTR/ })).toBeInTheDocument();
  });

  it("opens a stock as a sheet with a way back, not a new route", () => {
    renderShell("stocks");
    fireEvent.click(screen.getByRole("button", { name: /PLTR/ }));
    expect(screen.getByRole("button", { name: "← Back" })).toBeInTheDocument();
    expect(screen.getByText("What it would take")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "← Back" }));
    expect(screen.getByRole("heading", { name: "What looks worth the work." })).toBeInTheDocument();
  });

  it("hides an industry everywhere once it is switched off", () => {
    renderShell("stocks");
    const before = screen.getByText(/^\d+ names/).textContent ?? "";

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const toggle = screen.getByRole("switch", { name: /Software - Infrastructure/ });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "false");

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    const after = screen.getByText(/^\d+ names/).textContent ?? "";
    expect(after).not.toBe(before);
    expect(after).toContain("1 industry hidden");
    expect(screen.queryByRole("button", { name: /PLTR/ })).not.toBeInTheDocument();
  });

  it("hands a card's question to Ask and answers it", () => {
    const { onTab, view } = renderShell();
    fireEvent.click(screen.getByRole("button", { name: /should be dying/ }));
    fireEvent.click(screen.getAllByRole("button", { name: "Ask about this →" })[0]);
    expect(onTab).toHaveBeenCalledWith("ask");

    // The parent owns the tab, so replay what it would do next.
    view.rerender(<Shell snapshot={fixture} config={{ mode: "demo" }} session={null} tab="ask" onTab={onTab} />);
    expect(screen.getByRole("heading", { name: "Ask." })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "What is my biggest risk?" }));
    expect(screen.getByText(/Concentration/)).toBeInTheDocument();
    expect(screen.getByText("What this used")).toBeInTheDocument();
  });

  it("drills from a theme into the companies on each side", () => {
    renderShell("shifts");
    expect(screen.getByRole("heading", { name: "The forces." })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /AI chips against it services/i }));
    fireEvent.click(screen.getAllByRole("button", { name: "See both sides →" })[0]);
    expect(screen.getByText("story says wins")).toBeInTheDocument();
    expect(screen.getByText("story says loses")).toBeInTheDocument();
    expect(screen.getByText("CTSH")).toBeInTheDocument();
  });

  it("groups industries by direction first, never by a bounce", () => {
    renderShell("shifts");
    const group = screen.getByRole("group", { name: "Industry group" });
    expect(within(group).getByRole("button", { name: /Rising, still cheap 27/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(group).getByRole("button", { name: /Falling, pace easing 17/ }));
    expect(screen.getByText(/Still down over three months/)).toBeInTheDocument();
  });
});
