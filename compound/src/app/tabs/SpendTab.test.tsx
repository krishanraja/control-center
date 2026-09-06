import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import demo from "../../demo/spend.json";
import { RUNWAY_EMPTY, runwayFacts, runwaySentence } from "../../lib/spend/runway";
import { parseSpendDay } from "../../lib/spend/schema";
import { SpendTab } from "./SpendTab";

afterEach(cleanup);

const LIVE = { mode: "live", supabaseUrl: "https://x.supabase.co", supabasePublishableKey: "k" } as const;

describe("Spend tab runway", () => {
  it("puts the one honest money line above the headline in demo mode", () => {
    render(<SpendTab config={{ mode: "demo" }} session={null} onAsk={() => {}} />);
    const day = parseSpendDay(demo);
    const expected = runwaySentence(runwayFacts(day.items, day.generatedAt.slice(0, 10), day.cash!));
    const line = screen.getByTestId("spend-runway");
    expect(line).toHaveTextContent(expected);
    expect(line).toHaveTextContent(/^Cash on hand \$42,000 as of 3 September\. About \$[\d,]+ goes out a month\. That is about \d+(?:\.\d)? months\.$/);
    expect(line).not.toHaveClass("empty");
    expect(line.compareDocumentPosition(screen.getByRole("heading", { name: /out so far in September 2026/ })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("points at Settings when no balance has been entered", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({ ...demo, cash: null }), { status: 200 }))));
    render(<SpendTab config={LIVE} session={{ access_token: "t" } as never} onAsk={() => {}} />);
    const line = await screen.findByTestId("spend-runway");
    expect(line).toHaveTextContent(RUNWAY_EMPTY);
    expect(line).toHaveClass("empty");
    vi.unstubAllGlobals();
  });

  it("uses a balance saved this session when it is newer than the one the API carried", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify(demo), { status: 200 }))));
    render(<SpendTab config={LIVE} session={{ access_token: "t" } as never} onAsk={() => {}} cash={{ asOf: "2026-09-04", amountUsd: 60000 }} />);
    const line = await screen.findByTestId("spend-runway");
    expect(line).toHaveTextContent(/^Cash on hand \$60,000 as of 4 September\./);
    vi.unstubAllGlobals();
  });
});

describe("Spend tab", () => {
  it("renders the demo month with three scopes, a chart, the meter check and the itemised list", () => {
    const onAsk = vi.fn();
    render(<SpendTab config={{ mode: "demo" }} session={null} onAsk={onAsk} />);
    expect(screen.getByRole("heading", { name: /out so far in September 2026/ })).toBeInTheDocument();
    expect(screen.getByText("Personal", { selector: ".tile .lbl" })).toBeInTheDocument();
    expect(screen.getByText("Operating system", { selector: ".tile .lbl" })).toBeInTheDocument();
    expect(screen.getByText("Property", { selector: ".tile .lbl" })).toBeInTheDocument();
    expect(screen.getAllByRole("img").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Bills say \$/)).toBeInTheDocument();
    expect(screen.getByText(/Scrapewell plan covers/)).toBeInTheDocument();
    expect(screen.getByText("Streamflix", { selector: ".spend-sub strong" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "September 2026" })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /See how we worked it out|Show the working/ })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: /Ask about this/ })[0]);
    expect(onAsk).toHaveBeenCalledWith(expect.stringMatching(/spending this month/));
  });

  it("narrows the list by scope and by search", () => {
    render(<SpendTab config={{ mode: "demo" }} session={null} onAsk={() => {}} />);
    const before = document.querySelectorAll(".spend-row").length;
    fireEvent.click(screen.getByRole("button", { name: /^Property$/ }));
    const property = document.querySelectorAll(".spend-row").length;
    expect(property).toBeGreaterThan(0);
    expect(property).toBeLessThan(before);
    expect(screen.queryByText("Streamflix", { selector: ".spend-row strong" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search items" }), { target: { value: "skyhop" } });
    expect(document.querySelectorAll(".spend-row")).toHaveLength(2);
    expect(screen.getAllByText("Skyhop Airlines")).toHaveLength(2);
  });

  it("hides inbox copies until asked", () => {
    render(<SpendTab config={{ mode: "demo" }} session={null} onAsk={() => {}} />);
    expect(document.querySelectorAll(".spend-superseded")).toHaveLength(0);
    fireEvent.click(screen.getByRole("checkbox", { name: /inbox receipts also on the sheet/ }));
    expect(document.querySelectorAll(".spend-superseded")).toHaveLength(1);
  });

  it("says when nothing has been synced in live mode", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({ message: "No spend has been synced yet." }), { status: 404 }))));
    render(<SpendTab config={{ mode: "live", supabaseUrl: "https://x.supabase.co", supabasePublishableKey: "k" }} session={{ access_token: "t" } as never} onAsk={() => {}} />);
    expect(await screen.findByRole("heading", { name: "No spend has been synced yet." })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
