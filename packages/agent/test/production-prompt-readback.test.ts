import { describe, expect, it } from "vitest";
import { consumeMountedProductionPromptReadbackWitness } from "../src/production-prompt-readback.js";

describe("mounted production prompt readback authority", () => {
  it("rejects structural or copied values without mounted-store membership", async () => {
    const structural = {
      schemaVersion: "agent-mounted-production-prompt-readback.v1",
      inputArtifactHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      workspaceId: "ws_readback_test",
      mountInstanceId: "process_readback_test"
    } as const;

    await expect(consumeMountedProductionPromptReadbackWitness(structural))
      .rejects.toThrow(/mounted.*prompt.*readback|required/i);
    await expect(consumeMountedProductionPromptReadbackWitness({ ...structural }))
      .rejects.toThrow(/mounted.*prompt.*readback|required/i);
  });
});
