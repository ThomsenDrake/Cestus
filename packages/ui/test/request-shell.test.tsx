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
    expect(screen.getByRole("searchbox", { name: "Requests search" })).toHaveAttribute(
      "placeholder",
      "Search requests, agencies, evidence, and correspondence"
    );
    expect(screen.getByRole("button", { name: "New request" })).toBeInTheDocument();
  });

  it("keeps Requests active when unsupported modules are selected", async () => {
    render(<App requestsAdapter={createTestRequestsAdapter()} />);

    fireEvent.click(screen.getByRole("link", { name: "Requests" }));
    fireEvent.click(screen.getByRole("link", { name: "Settings" }));

    expect(screen.getByRole("link", { name: "Requests" })).toHaveAttribute("aria-current", "page");
    expect(await screen.findByRole("heading", { name: "Requests" })).toBeInTheDocument();
  });
});
