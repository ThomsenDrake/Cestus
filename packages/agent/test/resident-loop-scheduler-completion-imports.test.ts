import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

const schedulerPath = fileURLToPath(new URL("../src/scheduler.ts", import.meta.url));
const completionAdapterPath = fileURLToPath(new URL("../src/resident-loop-scheduler-completion.ts", import.meta.url));
const residentLoopGatewayPath = fileURLToPath(new URL("../src/resident-loop-tool-gateway.ts", import.meta.url));
const gatewayPath = fileURLToPath(new URL("../src/tool-gateway.ts", import.meta.url));
const executionLoopPath = fileURLToPath(new URL("../src/execution-loop.ts", import.meta.url));

describe("resident-loop scheduler completion import boundary", () => {
  it("routes scheduler completion through the private adapter instead of generic caller-result completion", () => {
    expect(existsSync(completionAdapterPath)).toBe(true);
    const scheduler = readFileSync(schedulerPath, "utf8");

    expect(scheduler).toContain("resident-loop-scheduler-completion.js");
    expect(scheduler).not.toMatch(/gateway\.completeTool\s*\(/);
    expect(readFileSync(gatewayPath, "utf8")).toContain("const { completeTool: _structuralCompletion, ...publicGateway }");
    expect(readFileSync(executionLoopPath, "utf8")).not.toMatch(/gateway\.completeTool\s*\(/);

    expect(existsSync(residentLoopGatewayPath)).toBe(true);
    const residentLoopGateway = readFileSync(residentLoopGatewayPath, "utf8");
    expect(residentLoopGateway).toContain("createAgentToolGateway");
    expect(residentLoopGateway).toContain("completeToolFromSchedulerEvidence");
    expect(residentLoopGateway).not.toMatch(/\.completeTool\s*\(/);
    expect(residentLoopGateway).not.toContain("completeTool:");
    expect(residentLoopGateway).not.toContain("readonly gateway:");
    expect(residentLoopGateway).not.toContain("input.gateway");
  });

  it("keeps the resident permit consumer default private to the dispatcher", async () => {
    vi.resetModules();
    const barrelFirst = await import("../src/index.js");
    const adapterAfterBarrel = await import("../src/adapters/accepted-graph-review.js");
    vi.resetModules();
    const adapterFirst = await import("../src/adapters/accepted-graph-review.js");
    const barrelAfterAdapter = await import("../src/index.js");

    expect(adapterAfterBarrel.acceptedGraphAssertionReviewDescriptor)
      .toEqual(adapterFirst.acceptedGraphAssertionReviewDescriptor);
    expect(barrelFirst.acceptedGraphAssertionReviewDescriptor)
      .toEqual(barrelAfterAdapter.acceptedGraphAssertionReviewDescriptor);

    const dispatcherPath = fileURLToPath(new URL("../src/domain-execution-dispatcher.ts", import.meta.url));
    const indexPath = fileURLToPath(new URL("../src/index.ts", import.meta.url));
    const dispatcher = readFileSync(dispatcherPath, "utf8");
    const gateway = readFileSync(residentLoopGatewayPath, "utf8");
    const barrel = readFileSync(indexPath, "utf8");
    const exactDispatcherDefaultImport =
      /import\s+[A-Za-z_$][A-Za-z0-9_$]*\s+from\s+["']\.\/resident-loop-tool-gateway\.js["'];?/;

    expect(dispatcher).toMatch(exactDispatcherDefaultImport);
    expect(gateway).toMatch(/export\s+default\s+[A-Za-z_$][A-Za-z0-9_$]*\s*;/);
    expect(gateway).not.toMatch(/export\s+(?:const|function|class)\s+\w*(?:Permit|Consumer)\w*/);
    expect(barrel).not.toMatch(/\b(?:consumeResidentDomainExecutionPermit|ResidentDomainExecutionPermit|residentDomainExecutionPermitConsumer)\b/);

    const prohibitedLoaderTable = [
      ["literal dynamic import", /import\s*\(\s*["'][^"']+["']\s*\)/],
      ["computed dynamic import", /import\s*\(\s*(?!["'])/],
      ["require", /\brequire\s*\(/],
      ["evaluator", /\b(?:eval|Function)\s*\(/],
      ["loader exemption", /loader[-_ ]?(?:exception|exemption)|allowDynamicImport/i],
      ["named resident permit import", /import\s*\{[^}]*\b(?:consumeResidentDomainExecutionPermit|ResidentDomainExecutionPermit)\b[^}]*\}/s],
      ["namespace gateway import", /import\s+\*\s+as\s+\w+\s+from\s+["']\.\/resident-loop-tool-gateway\.js["']/],
      ["star resident re-export", /export\s+\*\s+from\s+["']\.\/resident-loop-tool-gateway\.js["']/],
      ["barrel resident import", /from\s+["']\.\/index\.js["']/]
    ] as const;
    for (const [label, pattern] of prohibitedLoaderTable) {
      expect(`${dispatcher}\n${gateway}`, label).not.toMatch(pattern);
    }

    const alternateTransferTable = [
      "named permit issuer",
      "namespace permit consumer",
      "star resident export",
      "barrel resident export",
      "alternate permit binder",
      "raw dispatcher port transfer",
      "raw adapter transfer",
      "executor function transfer",
      "agent barrel resident symbol"
    ] as const;
    expect(alternateTransferTable).toHaveLength(9);
  });
});
