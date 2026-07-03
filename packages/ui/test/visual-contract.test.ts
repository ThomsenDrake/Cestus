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
  "packages/ui/src/requests/RequestDetailRail.tsx",
  "packages/ui/src/requests/RequestSignalMap.tsx",
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
});
