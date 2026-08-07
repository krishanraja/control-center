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
  it("shows the code fallback only after the mail endpoint accepts the send", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Email sent. Check your inbox and spam folder." }), {
      status: 202,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(<SignInPage config={config} />);

    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "hello@krishraja.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }));

    await screen.findByRole("heading", { name: "Check your email." });
    expect(screen.getByLabelText("8-digit code")).toHaveAttribute("autocomplete", "one-time-code");
    expect(screen.getByRole("status")).toHaveTextContent("Email sent");
    expect(fetchMock).toHaveBeenCalledWith("/api/compound-login", expect.objectContaining({ method: "POST" }));
  });

  it("keeps the email form visible when delivery fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Email is unavailable right now. Try again shortly." }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    })));
    render(<SignInPage config={config} />);

    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "hello@krishraja.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Email is unavailable"));
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
    expect(screen.queryByLabelText("8-digit code")).not.toBeInTheDocument();
  });

  it("opens the Supabase session with the 8-digit fallback code", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Email sent." }), {
      status: 202,
      headers: { "Content-Type": "application/json" },
    })));
    verifyOtp.mockResolvedValue({ error: null });
    render(<SignInPage config={config} />);

    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "hello@krishraja.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }));
    const code = await screen.findByLabelText("8-digit code");
    fireEvent.change(code, { target: { value: "12345678" } });
    fireEvent.click(screen.getByRole("button", { name: "Open COMPOUND" }));

    await waitFor(() => expect(verifyOtp).toHaveBeenCalledWith({ email: "hello@krishraja.com", token: "12345678", type: "email" }));
  });
});
