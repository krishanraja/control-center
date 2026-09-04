import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PropertyTab } from "./PropertyTab";

afterEach(cleanup);

describe("Property tab", () => {
  it("renders the demo unit with value, rent, costs and ranking sections", () => {
    const onAsk = vi.fn();
    render(<PropertyTab config={{ mode: "demo" }} session={null} onAsk={onAsk} />);
    expect(screen.getByRole("heading", { name: /Worth about A\$/ })).toBeInTheDocument();
    expect(screen.getByText("Worth now")).toBeInTheDocument();
    expect(screen.getByText("You own outright")).toBeInTheDocument();
    expect(screen.getByText("Loan left")).toBeInTheDocument();
    expect(screen.getByText("Rent received")).toBeInTheDocument();
    expect(screen.getByText("Loan paydown")).toBeInTheDocument();
    expect(screen.getByText("Net out of pocket")).toBeInTheDocument();
    expect(screen.getAllByRole("img").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/Highgate Hill/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Listings data powered by Domain/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /See how we worked it out|Show the working/ })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: /Ask about this/ })[0]);
    expect(onAsk).toHaveBeenCalledWith(expect.stringMatching(/value of my unit/));
  });

  it("opens a ranking row to show the working", () => {
    render(<PropertyTab config={{ mode: "demo" }} session={null} onAsk={() => {}} />);
    const first = screen.getAllByRole("button", { expanded: false }).find((button) => button.className === "rank-head");
    expect(first).toBeDefined();
    fireEvent.click(first!);
    expect(screen.getByText(/Rent return .* from A\$/)).toBeInTheDocument();
  });

  it("says when no unit is set up in live mode", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({ message: "No property is set up yet." }), { status: 404 }))));
    render(<PropertyTab config={{ mode: "live", supabaseUrl: "https://x.supabase.co", supabasePublishableKey: "k" }} session={{ access_token: "t" } as never} onAsk={() => {}} />);
    expect(await screen.findByRole("heading", { name: "No unit is set up yet." })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
