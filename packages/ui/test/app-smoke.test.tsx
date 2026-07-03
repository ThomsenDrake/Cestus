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
    expect(screen.getByRole("region", { name: "Signal operations board" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Signal map" }));
    expect(screen.getByRole("region", { name: "PRR signal map" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "New request" }));
    expect(screen.getByRole("dialog", { name: "Guided request builder" })).toBeInTheDocument();
  });
});
