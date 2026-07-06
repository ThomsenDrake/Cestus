/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.js";
import { createStaticIngestionWorkspaceAdapter } from "../src/ingestion/ingestion-adapter.js";
import { createTestRequestsAdapter } from "./request-test-utils.js";

describe("ingestion app integration", () => {
  it("exposes the ingestion workspace through an injected adapter without the placeholder review", async () => {
    render(
      <App
        requestsAdapter={createTestRequestsAdapter()}
        ingestionAdapter={createStaticIngestionWorkspaceAdapter({
          mounted: false,
          diagnostics: []
        })}
      />
    );

    fireEvent.click(screen.getByRole("link", { name: /Ingestion/ }));

    expect(await screen.findByRole("heading", { name: "Ingestion" })).toBeInTheDocument();
    expect(screen.queryByText("External investigation archive placeholder")).not.toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Workspace not mounted" })).toBeInTheDocument();
  });

  it("closes an open request builder when navigating to ingestion", async () => {
    render(
      <App
        requestsAdapter={createTestRequestsAdapter()}
        ingestionAdapter={createStaticIngestionWorkspaceAdapter({
          mounted: false,
          diagnostics: []
        })}
      />
    );

    fireEvent.click(screen.getByRole("link", { name: "Requests" }));
    fireEvent.click(await screen.findByRole("button", { name: "New request" }));
    expect(screen.getByRole("dialog", { name: "Guided request builder" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Ingestion", hidden: true }));
    expect(screen.getByRole("heading", { name: "Ingestion" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Guided request builder" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Requests" }));
    expect(await screen.findByRole("heading", { name: "Requests" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Guided request builder" })).not.toBeInTheDocument();
  });

  it("routes the ingestion new request action into Requests", async () => {
    render(
      <App
        requestsAdapter={createTestRequestsAdapter()}
        ingestionAdapter={createStaticIngestionWorkspaceAdapter({
          mounted: false,
          diagnostics: []
        })}
      />
    );

    fireEvent.click(screen.getByRole("link", { name: "Ingestion" }));
    expect(screen.getByRole("heading", { name: "Ingestion" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "New request" }));

    expect(await screen.findByRole("heading", { name: "Requests" })).toBeInTheDocument();
    expect(await screen.findByRole("dialog", { name: "Guided request builder" })).toBeInTheDocument();
  });
});
