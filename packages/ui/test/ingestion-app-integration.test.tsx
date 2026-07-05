/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.js";

describe("ingestion app integration", () => {
  it("exposes the ingestion workspace in the main app", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("link", { name: /Ingestion/ }));

    expect(screen.getByRole("heading", { name: "Ingestion" })).toBeInTheDocument();
    expect(screen.getByText("External investigation archive placeholder")).toBeInTheDocument();
  });
});
