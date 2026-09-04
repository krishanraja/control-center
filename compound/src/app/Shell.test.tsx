import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDemoDay } from "../lib/brief";
import { fixture } from "../test/snapshot-fixture";
import type { CompoundDay, TabKey } from "../types";
import { Shell } from "./Shell";

function asSplit() {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("min-width: 900px") || query.includes("min-width: 1400px"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

function renderShell(tab: TabKey = "brief", day: CompoundDay = buildDemoDay(fixture)) {
  const onTab = vi.fn();
  const view = render(<Shell day={day} config={{ mode: "demo" }} session={null} tab={tab} onTab={onTab} />);
  return { onTab, view, day };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("calm brief", () => {
  it("offers six destinations and keeps the Brief market-wide", () => {
    const { onTab } = renderShell();
    const nav = screen.getByRole("navigation", { name: "Sections" });
    for (const name of ["Brief", "Markets", "Portfolio", "Property", "Spend", "Ask"]) {
      expect(within(nav).getByRole("button", { name })).toBeInTheDocument();
    }
    expect(within(nav).getByRole("button", { name: "Brief" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { name: "Markets are calm, but money is still expensive." })).toBeInTheDocument();
    expect(screen.queryByText(/Everything you own:/)).not.toBeInTheDocument();
    fireEvent.click(within(nav).getByRole("button", { name: "Markets" }));
    expect(onTab).toHaveBeenCalledWith("markets");
  });

  it("keeps all 123 industries explorable when a partial capture has no industry moves", () => {
    const day = buildDemoDay(fixture, "partial");
    delete day.legacy;
    day.archive.payload.evidence = { ...day.archive.payload.evidence, industries: [] };
    renderShell("markets", day);
    expect(document.querySelectorAll(".sector-row")).toHaveLength(11);
    expect(screen.getByText("123")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByText("11 sectors. Open a sector to choose individual industries.")).toBeInTheDocument();
  });

  it("shows exactly three icon-led positions and an honest stale status", () => {
    renderShell();
    expect(screen.getAllByRole("button", { name: /Open signal:|IT services are|Crypto is moving/ })).toHaveLength(3);
    expect(screen.getByRole("status")).toHaveTextContent(/Update delayed/);
    expect(document.querySelectorAll(".domain-glyph svg")).toHaveLength(3);
    expect(screen.getByText("Wider world · 1 citation")).toBeInTheDocument();
    expect(screen.getAllByText("Wider world · 2 citations")).toHaveLength(2);
  });

  it("renders a quiet day without inventing weak stories", () => {
    renderShell("brief", buildDemoDay(fixture, "quiet"));
    expect(screen.getByRole("heading", { name: "Nothing needs action" })).toBeInTheDocument();
    expect(screen.getByText("IT services growth held its recent pace.")).toBeInTheDocument();
    expect(screen.getByText("High-yield spreads stayed contained.")).toBeInTheDocument();
    expect(screen.queryByText("2.41%")).not.toBeInTheDocument();
  });

  it("opens full evidence and cited world context from the card face", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: /IT services are outrunning/ }));
    expect(screen.getByRole("dialog", { name: /IT services are outrunning/ })).toBeInTheDocument();
    expect(screen.getByText("In the wider world")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Reuters/ })).toHaveAttribute("target", "_blank");
    expect(screen.getByText("What would change this")).toBeInTheDocument();
  });

  it("opens history from the dated control", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: /Open history for/ }));
    expect(screen.getByRole("heading", { name: "Market history" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Aug 06, 2026/ })).toHaveTextContent("captured");
  });
});

describe("Markets, Portfolio and Ask", () => {
  it("keeps the exhaustive taxonomy behind 11 sector rows", () => {
    renderShell("markets");
    expect(screen.getByRole("heading", { name: "Opportunities first." })).toBeInTheDocument();
    expect(document.querySelectorAll(".sector-row")).toHaveLength(11);
    fireEvent.click(screen.getByRole("button", { name: /Technology/ }));
    expect(screen.getByRole("heading", { name: "Technology" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /Software - Infrastructure/ })).toBeInTheDocument();
  });

  it("keeps flat industry settings and the all/some/none sector state", () => {
    renderShell("markets");
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getAllByRole("checkbox")).toHaveLength(11);
    expect(screen.queryAllByRole("switch")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: /Technology/ }));
    const member = screen.getByRole("switch", { name: /Software - Infrastructure/ });
    fireEvent.click(member);
    expect(screen.getByRole("checkbox", { name: "Show Technology industries" })).toHaveAttribute("aria-checked", "mixed");
  });

  it("makes portfolio analysis visibly separate from Brief ranking", () => {
    renderShell("portfolio");
    expect(screen.getByRole("heading", { name: "Exposure before performance." })).toBeInTheDocument();
    expect(screen.getByText("This is where your holdings matter. They never choose the Brief.")).toBeInTheDocument();
    expect(screen.getByText("Available capacity")).toBeInTheDocument();
    expect(screen.getByText("Correlated exposure")).toBeInTheDocument();
  });

  it("starts Ask with the current brief and supports historical scopes", () => {
    renderShell("ask");
    expect(screen.getByRole("heading", { name: "Ask COMPOUND." })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Compare" }));
    expect(screen.getByLabelText("From")).toHaveAttribute("type", "date");
    fireEvent.click(screen.getByRole("button", { name: /What would change the call/ }));
    expect(screen.getByText(/Choose an earlier start date/)).toBeInTheDocument();
  });
});

describe("device systems", () => {
  it("uses a full-screen story sheet on stack", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: /Open signal:/ }));
    expect(document.querySelector(".sheet")).toBeInTheDocument();
    expect(document.querySelector(".panel")).not.toBeInTheDocument();
  });

  it("uses a right-side story panel on split", () => {
    asSplit();
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: /Open signal:/ }));
    expect(document.querySelector(".panel")).toBeInTheDocument();
    expect(document.querySelector(".workspace.with-panel")).toBeInTheDocument();
    expect(document.querySelector(".sheet")).not.toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "Markets are calm, but money is still expensive." })).toHaveLength(2);
  });

  it("maps number keys to the six destinations only on split", () => {
    asSplit();
    const { onTab } = renderShell();
    fireEvent.keyDown(window, { key: "3" });
    expect(onTab).toHaveBeenCalledWith("portfolio");
    fireEvent.keyDown(window, { key: "4" });
    expect(onTab).toHaveBeenCalledWith("property");
    fireEvent.keyDown(window, { key: "5" });
    expect(onTab).toHaveBeenCalledWith("spend");
    fireEvent.keyDown(window, { key: "6" });
    expect(onTab).toHaveBeenCalledWith("ask");
  });
});
