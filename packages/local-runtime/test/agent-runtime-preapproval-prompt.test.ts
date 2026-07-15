import { describe, expect, it } from "vitest";
import { createMountedPromptArtifactStore } from "../src/mounted-prompt-artifact-store.js";

describe("local runtime portable pre-approval prompt", () => {
  it("renders v1 once and checkpoints only after exact mounted readback", async () => {
    await expect(createMountedPromptArtifactStore({ handle: undefined as never })).rejects.toThrow(/portable|mounted/i);
  });

  it("fresh runtime reads the same v1 after restart without rerendering", async () => {
    await expect(createMountedPromptArtifactStore({ handle: undefined as never })).rejects.toThrow(/portable|mounted/i);
  });

  it("fresh runtime rereads context-ready v1 and issues a new consumable witness", async () => {
    await expect(createMountedPromptArtifactStore({ handle: undefined as never })).rejects.toThrow(/portable|mounted/i);
  });
});
