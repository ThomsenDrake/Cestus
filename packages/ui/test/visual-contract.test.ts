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
  it("defines dark-first Cestus design tokens", () => {
    const css = readFileSync("packages/ui/src/styles.css", "utf8");

    expect(css).toContain("--cestus-bg");
    expect(css).toContain("--cestus-panel");
    expect(css).toContain("--cestus-amber");
    expect(css).toContain("--cestus-red");
    expect(css).toContain("--cestus-green");
    expect(css).toContain("--cestus-cyan");
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
