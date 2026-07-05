import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const uiTsxFiles = [
  "packages/ui/src/App.tsx",
  "packages/ui/src/workspace/OpsShell.tsx",
  "packages/ui/src/workspace/CommandBand.tsx",
  "packages/ui/src/workspace/ModuleRail.tsx",
  "packages/ui/src/workspace/CommandDashboard.tsx",
  "packages/ui/src/workspace/SignalStrip.tsx",
  "packages/ui/src/workspace/QueueFilters.tsx",
  "packages/ui/src/workspace/PriorityQueue.tsx",
  "packages/ui/src/workspace/TacticalPanel.tsx",
  "packages/ui/src/workspace/DecisionRail.tsx",
  "packages/ui/src/requests/RequestWorkspace.tsx",
  "packages/ui/src/requests/request-adapter.ts",
  "packages/ui/src/requests/RequestCommandBar.tsx",
  "packages/ui/src/requests/RequestBoard.tsx",
  "packages/ui/src/requests/RequestLane.tsx",
  "packages/ui/src/requests/RequestCard.tsx",
  "packages/ui/src/requests/RequestDetailSections.tsx",
  "packages/ui/src/requests/RequestDetailModal.tsx",
  "packages/ui/src/requests/RequestDetailRail.tsx",
  "packages/ui/src/requests/RequestWorkspaceIntelligenceRail.tsx",
  "packages/ui/src/requests/RequestSignalMap.tsx",
  "packages/ui/src/requests/RequestBuilder.tsx"
];

const finalRequestsContractFiles = [
  "packages/ui/src/requests/request-adapter.ts",
  "packages/ui/src/requests/RequestWorkspace.tsx",
  "packages/ui/src/requests/RequestDetailSections.tsx",
  "packages/ui/src/requests/RequestDetailModal.tsx",
  "packages/ui/src/requests/RequestWorkspaceIntelligenceRail.tsx",
  "packages/ui/src/requests/RequestBuilder.tsx"
];

describe("visual system contract", () => {
  it("defines tactical command console design tokens", () => {
    const css = readFileSync("packages/ui/src/styles.css", "utf8");

    for (const token of [
      "--command-black",
      "--console-void",
      "--signal-red",
      "--signal-orange",
      "--signal-amber",
      "--signal-green",
      "--signal-cyan",
      "--paper-light",
      "--muted-amber"
    ]) {
      expect(css).toContain(token);
    }

    expect(css).toContain(".cestus-scan-layer");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain(
      "--cestus-muted-strong: color-mix(in srgb, var(--muted-amber) 72%, var(--paper-light));"
    );
    expect(css).toContain(
      "--cestus-muted-soft: color-mix(in srgb, var(--muted-amber) 42%, var(--paper-light));"
    );
  });

  it("keeps UI copy and utility usage aligned with the Cestus visual rules", () => {
    const joined = uiTsxFiles.map((file) => readFileSync(file, "utf8")).join("\n");

    expect(joined).not.toMatch(new RegExp(`text-${"xs"}`));
    expect(joined).not.toMatch(new RegExp(["NE" + "RV", "SEE" + "LE", "MA" + "GI", "Evan" + "gelion"].join("|"), "i"));
    expect(joined).not.toMatch(new RegExp(`sha${"dow"}-(sm|md|lg|xl|2xl)`));
    expect(joined).not.toMatch(new RegExp(`track${"ing"}-`));
    expect(joined).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(joined).not.toContain("data-uidotsh-pick");
    expect(joined).not.toContain("data-uidotsh-option");
    expect(joined).not.toMatch(/var\(--cestus-/);
    expect(joined).toContain("var(--signal-orange)");
    expect(joined).toContain("var(--signal-red)");
    expect(joined).toContain("var(--signal-green)");
    expect(joined).toContain("var(--console-line)");
    expect(joined).toContain("Signal operations board");
    expect(joined).toContain("Legal escalation locked");
    expect(joined).toContain("Guided request builder");
  });

  it("keeps final Requests workspace contracts dimensioned, sparse, and multi-signal", () => {
    const adapterSource = readFileSync("packages/ui/src/requests/request-adapter.ts", "utf8");
    const workspaceSource = readFileSync("packages/ui/src/requests/RequestWorkspace.tsx", "utf8");
    const builderSource = readFileSync("packages/ui/src/requests/RequestBuilder.tsx", "utf8");
    const requestSurfaceSource = finalRequestsContractFiles
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");

    expect(adapterSource).toContain("createHttpRequestsAdapter");
    expect(adapterSource).toContain("httpRequestsAdapter");
    expect(adapterSource).toContain("createLocalReplayRequestsAdapter");
    expect(adapterSource).toContain("buildPrrWorkspaceDto(buildPrrProjection(events)");
    expect(adapterSource).toContain("Object.freeze");
    expect(adapterSource).not.toContain("className=");

    expect(workspaceSource).toContain("min-h-10");
    expect(workspaceSource).toContain("w-fit");
    expect(builderSource).toContain("min-h-[calc(100dvh-2rem)]");
    expect(builderSource).toContain("max-w-6xl");
    expect(builderSource).toContain("lg:grid-cols-[22rem_minmax(0,1fr)]");
    expect(builderSource).toContain("min-h-11");
    expect(builderSource).toContain("min-h-32");

    expect(requestSurfaceSource).not.toMatch(/rounded-(?:sm|md|lg|xl|2xl|3xl|full)/);
    expect(requestSurfaceSource).not.toMatch(/bg-gradient|from-\[|via-\[|to-\[/);
    expect(requestSurfaceSource).not.toMatch(/shadow-(?:sm|md|lg|xl|2xl)/);

    const signalPalette = new Set(
      [...requestSurfaceSource.matchAll(/var\(--(signal-[a-z]+)\)/g)].map((match) => match[1])
    );
    expect([...signalPalette]).toEqual(
      expect.arrayContaining(["signal-amber", "signal-cyan", "signal-green", "signal-red"])
    );
    expect(signalPalette.size).toBeGreaterThanOrEqual(4);

    for (const neutralToken of ["command-black", "console-line", "console-panel", "console-void", "paper-light"]) {
      expect(requestSurfaceSource).toContain(`var(--${neutralToken})`);
    }
  });

  it("keeps page-scale Requests surfaces from becoming nested card-like wrappers", () => {
    const workspaceSource = readFileSync("packages/ui/src/requests/RequestWorkspace.tsx", "utf8");
    const builderSource = readFileSync("packages/ui/src/requests/RequestBuilder.tsx", "utf8");
    const guardedWrappers = [
      openingTagContaining(workspaceSource, 'aria-label="Requests workspace"'),
      openingTagContaining(builderSource, 'role="dialog"'),
      openingTagContaining(builderSource, 'className="mx-auto grid min-h-[calc(100dvh-2rem)]'),
      openingTagContaining(builderSource, 'className="min-w-0 space-y-5"'),
      openingTagContaining(builderSource, 'aria-label="Draft request fields"'),
      openingTagContaining(builderSource, 'aria-label="Active builder step"')
    ];

    for (const wrapper of guardedWrappers) {
      expect(wrapper).toBeDefined();
      expect(isCardLikeSurface(wrapper ?? "")).toBe(false);
    }
  });

  it("keeps request detail modal floating over the workspace", () => {
    const modalSource = readFileSync("packages/ui/src/requests/RequestDetailModal.tsx", "utf8");

    expect(modalSource).toContain("fixed inset-0");
    expect(modalSource).toContain("bg-[var(--command-black)]/58");
    expect(modalSource).toContain("p-3");
    expect(modalSource).toContain("sm:p-5");
    expect(modalSource).toContain("lg:p-8");
    expect(modalSource).toContain("max-h-[calc(100dvh-1.5rem)]");
    expect(modalSource).toContain("sm:max-h-[calc(100dvh-2.5rem)]");
    expect(modalSource).toContain("lg:max-h-[calc(100dvh-4rem)]");
    expect(modalSource).toContain("overflow-hidden");
    expect(modalSource).toContain('data-request-detail-modal-body="true"');
    expect(modalSource).toContain("overflow-y-auto");
    expect(modalSource).toContain("shadow-[0_24px_80px_rgba(0,0,0,0.72)]");
    expect(modalSource).toContain('role="dialog"');
    expect(modalSource).toContain('aria-modal="true"');
    expect(modalSource).not.toContain("min-h-[calc(100dvh-2rem)]");
    expect(modalSource).not.toMatch(/rounded-(?:sm|md|lg|xl|2xl|3xl|full)/);
    expect(modalSource).not.toMatch(/shadow-(?:sm|md|lg|xl|2xl)/);
  });
});

function openingTagContaining(source: string, marker: string): string | undefined {
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) {
    return undefined;
  }

  const openIndex = source.lastIndexOf("<", markerIndex);
  const closeIndex = source.indexOf(">", markerIndex);
  if (openIndex === -1 || closeIndex === -1) {
    return undefined;
  }

  return source.slice(openIndex, closeIndex + 1);
}

function isCardLikeSurface(openingTag: string): boolean {
  return (
    /\bborder\b/.test(openingTag) &&
    /bg-\[var\(--(?:console-panel|console-void|console-panel-raised)\)\]/.test(openingTag)
  );
}
