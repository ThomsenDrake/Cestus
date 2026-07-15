import { describe, expect, it } from "vitest";
import * as factorySurface from "../src/agent-runtime-factory.js";

describe("factory-held context registrar boundary", () => {
  it("blocks default empty factory composition before it can expose a context capability", () => {
    expect(() => factorySurface.defaultLocalAgentRuntimeFactory({
      handle: { config: { cwd: process.cwd() } },
      actor: { kind: "system", id: "actor_factory_test" },
      now: () => "2026-07-15T02:20:00.000Z"
    } as never)).toThrow("blocked.factory-context-attestation-required");
  });
});
