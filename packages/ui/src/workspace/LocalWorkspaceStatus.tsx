import { useEffect, useState } from "react";
import { safeCommandText } from "./command-safety.js";

type WorkspaceStatus = {
  state: "checking" | "ready" | "unmounted" | "unavailable" | "unreachable" | "unauthenticated";
  label?: string;
  storageLocation?: string;
  operatorLabel?: string;
};

/** This status comes from the serving process, never from saved configuration. */
export function LocalWorkspaceStatus() {
  const [status, setStatus] = useState<WorkspaceStatus>({ state: "checking" });
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function refresh() {
      try {
        const response = await fetch("/api/workspace-status", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]) });
        if (controller.signal.aborted) return;
        if (response.status === 401) {
          setStatus({ state: "unauthenticated" });
          return;
        }
        const body = await response.json();
        if (controller.signal.aborted) return;
        if (body.backend !== "running") throw new Error("Unexpected backend response");
        setStatus({
          state: !response.ok ? "unavailable" : body.workspaceState === "ready" ? "ready" : "unmounted",
          ...(typeof body.label === "string" ? { label: safeCommandText(body.label) } : {}),
          ...(typeof body.storageLocation === "string" ? { storageLocation: body.storageLocation } : {}),
          ...(typeof body.operator?.label === "string" ? { operatorLabel: safeCommandText(body.operator.label) } : {})
        });
      } catch {
        if (!controller.signal.aborted) setStatus({ state: "unreachable" });
      }
    }
    void refresh();
    const interval = setInterval(() => { void refresh(); }, 15000);
    return () => { controller.abort(); clearInterval(interval); };
  }, [reload]);
  const message = {
    checking: "Checking the running backend…",
    ready: "Backend running · Workspace ready",
    unmounted: "Backend running · No portable workspace mounted. Configure a portable workspace and restart Cestus.",
    unavailable: "Backend running · Workspace unavailable. Reconnect storage or restore a backup, then restart Cestus. No fallback workspace was opened.",
    unreachable: "Backend unavailable. Start Cestus and check its configured address.",
    unauthenticated: "Local session required. Open the session URL printed by Cestus. If it has expired or was already used, restart Cestus for a new link."
  }[status.state];
  return (
    <section aria-label="Local workspace status" className="border-b border-[var(--console-line)] bg-[var(--console-void)] px-4 py-3 text-sm text-[var(--paper-light)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status">{message}</p>
        <button type="button" onClick={() => setReload(value => value + 1)} className="min-h-9 px-2 text-[var(--signal-cyan)]">Refresh workspace status</button>
      </div>
      {status.label ? <p className="break-words">{status.label} · {status.operatorLabel}</p> : null}
      {status.storageLocation ? <p className="break-all font-mono">Storage: {status.storageLocation}</p> : null}
    </section>
  );
}
