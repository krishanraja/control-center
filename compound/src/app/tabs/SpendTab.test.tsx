import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SpendTab } from "./SpendTab";

afterEach(cleanup);

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
