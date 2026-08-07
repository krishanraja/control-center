import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SignInPage } from "./SignInPage";

const { verifyOtp } = vi.hoisted(() => ({ verifyOtp: vi.fn() }));

vi.mock("../lib/supabase", () => ({
  getSupabase: () => ({ auth: { verifyOtp } }),
}));

const config = {
  mode: "live" as const,
  supabaseUrl: "https://example.supabase.co",
  supabasePublishableKey: "publishable-test-key",
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  verifyOtp.mockReset();
});

describe("SignInPage", () => {
  it("exchanges the magic word for a private Supabase session", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Opening COMPOUND.", tokenHash: "one-time-token-hash" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    verifyOtp.mockResolvedValue({ error: null });
    render(<SignInPage config={config} />);

    const input = screen.getByLabelText("Magic word");
    fireEvent.change(input, { target: { value: "private phrase" } });
    fireEvent.click(screen.getByRole("button", { name: "Open COMPOUND" }));

    await waitFor(() => expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "one-time-token-hash", type: "email" }));
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveAttribute("autocomplete", "current-password");
    expect(fetchMock).toHaveBeenCalledWith("/api/compound-login", expect.objectContaining({ method: "POST" }));
  });

  it("keeps the form open when the magic word is wrong", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "That magic word did not work." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })));
    render(<SignInPage config={config} />);

    fireEvent.change(screen.getByLabelText("Magic word"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Open COMPOUND" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("That magic word did not work"));
    expect(screen.getByLabelText("Magic word")).toBeInTheDocument();
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("shows a friendly error when the one-time session cannot be opened", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ tokenHash: "bad-token-hash" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));
    verifyOtp.mockResolvedValue({ error: new Error("expired") });
    render(<SignInPage config={config} />);

    fireEvent.change(screen.getByLabelText("Magic word"), { target: { value: "private phrase" } });
    fireEvent.click(screen.getByRole("button", { name: "Open COMPOUND" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("COMPOUND could not open"));
  });
});
