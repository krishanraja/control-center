import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AskPage } from "./AskPage";

describe("AskPage", () => {
  it("answers on its own route and returns to the dashboard", async () => {
    const navigate = vi.fn();
    render(<AskPage config={{ mode: "demo" }} session={null} search="?horizon=3m&state=partial" navigate={navigate} />);

    fireEvent.click(screen.getByRole("button", { name: "What changed today?" }));
    expect(screen.getByLabelText("Ask another question")).toHaveValue("What changed today?");
    fireEvent.click(screen.getByRole("button", { name: /^Ask$/ }));

    await waitFor(() => expect(screen.getByText(/Don't buy more Solana yet/i)).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Used for this answer" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to today" }));
    expect(navigate).toHaveBeenCalledWith("/?horizon=3m&state=partial");
  });
});
