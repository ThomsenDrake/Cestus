/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.js";
import { createTestRequestsAdapter } from "./request-test-utils.js";

describe("requests workspace shell", () => {
  it("routes to the interim Requests workspace shell", async () => {
    render(<App requestsAdapter={createTestRequestsAdapter()} />);

    fireEvent.click(screen.getByRole("link", { name: "Requests" }));

    expect(await screen.findByRole("heading", { name: "Requests" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Requests" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("searchbox", { name: "Requests search" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New request" })).toBeInTheDocument();
  });

  it("omits unsupported module controls", async () => {
    render(<App requestsAdapter={createTestRequestsAdapter()} />);

    fireEvent.click(screen.getByRole("link", { name: "Requests" }));
    expect(screen.queryByRole("link", { name: "Settings" })).not.toBeInTheDocument();

    expect(screen.getByRole("link", { name: "Requests" })).toHaveAttribute("aria-current", "page");
    expect(await screen.findByRole("heading", { name: "Requests" })).toBeInTheDocument();
  });
});
