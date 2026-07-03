/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.js";

describe("Cestus UI bootstrap", () => {
  it("renders the Command workspace entry point", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Command" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New request" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Requests" }));
    expect(screen.getByRole("heading", { name: "Requests" })).toBeInTheDocument();
  });
});
