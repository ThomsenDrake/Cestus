/** @vitest-environment jsdom */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalWorkspaceStatus } from "../src/workspace/LocalWorkspaceStatus.js";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const ready = { backend: "running", workspaceState: "ready", label: "Synthetic workspace", storageLocation: "/tmp/synthetic-workspace", operator: { label: "Test investigator" } };

describe("observed local workspace status", () => {
  it("clears prior workspace identity when storage or the authenticated session becomes unavailable", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json(ready))
      .mockResolvedValueOnce(Response.json({ backend: "running", workspaceState: "unavailable" }, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", fetcher);
    render(<LocalWorkspaceStatus />);
    expect(await screen.findByText("Storage: /tmp/synthetic-workspace")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh workspace status" }));
    expect(await screen.findByText(/Backend running · Workspace unavailable/)).toBeInTheDocument();
    expect(screen.queryByText(/Synthetic workspace|Test investigator|Storage:/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh workspace status" }));
    expect(await screen.findByText(/Local session required/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh workspace status" }));
    expect(await screen.findByText(/Backend unavailable/)).toBeInTheDocument();
  });

  it("polls the server and aborts pending observation on unmount", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValue(Response.json(ready));
    vi.stubGlobal("fetch", fetcher);
    const view = render(<LocalWorkspaceStatus />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    fetcher.mockImplementation(() => new Promise(() => undefined));
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const signal = fetcher.mock.calls[1]![1].signal as AbortSignal;
    expect(signal.aborted).toBe(false);
    view.unmount();
    expect(signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(30000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
