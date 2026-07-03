import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sourceFiles = [
  "index.html",
  "packages/ui/src/workspace/CommandDashboard.tsx",
  "packages/ui/src/workspace/SignalStrip.tsx",
  "packages/ui/src/workspace/PriorityQueue.tsx",
  "packages/ui/src/workspace/DecisionRail.tsx",
  "packages/ui/src/requests/RequestWorkspace.tsx",
  "packages/ui/src/requests/request-adapter.ts",
  "packages/ui/src/requests/RequestBoard.tsx",
  "packages/ui/src/requests/RequestDetailRail.tsx",
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
});
