import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sourceFiles = [
  "index.html",
  "packages/ui/src/App.tsx",
  "packages/ui/src/workspace/workspace-nav.ts",
  "packages/ui/src/workspace/OpsShell.tsx",
  "packages/ui/src/workspace/ModuleRail.tsx",
  "packages/ui/src/workspace/CommandDashboard.tsx",
  "packages/ui/src/workspace/SignalStrip.tsx",
  "packages/ui/src/workspace/PriorityQueue.tsx",
  "packages/ui/src/workspace/DecisionRail.tsx",
  "packages/ui/src/requests/RequestWorkspace.tsx",
  "packages/ui/src/requests/request-adapter.ts",
  "packages/ui/src/requests/RequestBoard.tsx",
  "packages/ui/src/requests/RequestDetailSections.tsx",
  "packages/ui/src/requests/RequestDetailModal.tsx",
  "packages/ui/src/requests/RequestDetailRail.tsx",
  "packages/ui/src/requests/RequestWorkspaceIntelligenceRail.tsx",
  "packages/ui/src/requests/RequestSignalMap.tsx",
  "packages/ui/src/requests/RequestBuilder.tsx"
];

describe("ui picker cleanup", () => {
  it("removes old comparison scaffolding after the tactical direction is approved", () => {
    const source = sourceFiles.map((file) => readFileSync(file, "utf8")).join("\n");

    expect(source).not.toContain("ui-picker.js");
    expect(source).not.toContain("data-uidotsh-pick");
    expect(source).not.toContain("data-uidotsh-option");
  });

  it("keeps Requests and Ingestion as first-class shell workspaces", () => {
    const appSource = readFileSync("packages/ui/src/App.tsx", "utf8");
    const navSource = readFileSync("packages/ui/src/workspace/workspace-nav.ts", "utf8");
    const shellSource = [
      appSource,
      navSource,
      readFileSync("packages/ui/src/workspace/OpsShell.tsx", "utf8"),
      readFileSync("packages/ui/src/workspace/ModuleRail.tsx", "utf8")
    ].join("\n");

    expect(navSource).toContain('{ id: "requests", label: "Requests", href: "#requests", preview: false }');
    expect(navSource).toContain('{ id: "ingestion", label: "Ingestion", href: "#ingestion", preview: false }');
    expect(appSource).toContain('implementedModuleIds = new Set(["command", "requests"])');
    expect(appSource).toContain('implementedModuleIds.add("ingestion")');
    expect(appSource).toContain('ingestionActive ? "Ingestion" : commandOrRequestsModeLabel');
    expect(appSource).toContain("<RequestWorkspace");
    expect(appSource).toContain("<IngestionWorkspace");
    expect(shellSource).toContain(
      'mainLabel={ingestionActive ? "Ingestion workspace" : requestsActive ? "Requests workspace" : "Command workspace"}'
    );
    expect(shellSource).not.toMatch(/Requests\s+Preview/);
    expect(shellSource).not.toMatch(/Ingestion\s+Preview/);
  });
});
