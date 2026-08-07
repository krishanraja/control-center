import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DashboardPage } from "./DashboardPage";

describe("DashboardPage", () => {
  it("keeps the full dashboard and opens Ask as an additive route", () => {
    const navigate = vi.fn();
    render(<DashboardPage config={{ mode: "demo" }} session={null} search="" navigate={navigate} />);

    expect(screen.getByRole("heading", { name: "Your money at a glance" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "How each investment looks" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Where money is moving" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ask COMPOUND" }));
    expect(navigate).toHaveBeenCalledWith("/ask?horizon=3m&state=partial");
  });
});
