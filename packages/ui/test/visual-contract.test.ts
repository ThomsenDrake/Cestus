import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const uiTsxFiles = [
  "packages/ui/src/App.tsx",
  "packages/ui/src/workspace/OpsShell.tsx",
  "packages/ui/src/workspace/LeftRail.tsx",
  "packages/ui/src/workspace/TopStatusBar.tsx",
  "packages/ui/src/workspace/CommandDashboard.tsx",
  "packages/ui/src/workspace/StatusStrip.tsx",
  "packages/ui/src/workspace/QueueFilters.tsx",
  "packages/ui/src/workspace/PriorityQueue.tsx",
  "packages/ui/src/workspace/TacticalPanel.tsx",
  "packages/ui/src/workspace/RightContextRail.tsx"
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
  });
});
