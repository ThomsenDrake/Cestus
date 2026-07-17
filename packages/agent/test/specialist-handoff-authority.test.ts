import { describe, expect, it } from "vitest";
import {
  consumeMountedSpecialistHandoffAuthorityWitness,
  issueMountedSpecialistHandoffAuthorityWitness,
  type MountedSpecialistHandoffAuthorityWitness
} from "../src/specialist-handoff-authority.js";

const binding = {
  workspaceIdentityHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
  mountGeneration: "mount_generation_001",
  ledgerStoreIdentity: "ledger_store_001",
  artifactStoreIdentity: "artifact_store_001",
  ledgerHighWaterEventId: "evt_ledger_high_water_001",
  policyHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
  activeLocksHash: "sha256:3333333333333333333333333333333333333333333333333333333333333333"
} as const;

describe("specialist handoff authority witness", () => {
  it("rejects structural copied and consumed witnesses while returning a frozen exact binding", async () => {
    let current = true;
    const witness = issueMountedSpecialistHandoffAuthorityWitness({
      authorityBinding: binding,
      revalidateCurrent: async () => {
        if (!current) throw new Error("stale mounted authority");
      }
    });
    const copied = { ...witness } as MountedSpecialistHandoffAuthorityWitness;

    await expect(consumeMountedSpecialistHandoffAuthorityWitness(copied)).rejects.toThrow(/authority/i);
    const consumed = await consumeMountedSpecialistHandoffAuthorityWitness(witness);
    expect(Object.isFrozen(consumed.binding)).toBe(true);
    expect(consumed.binding).toEqual(binding);
    current = false;
    await expect(consumed.revalidateCurrent()).rejects.toThrow(/authority/i);
    await expect(consumeMountedSpecialistHandoffAuthorityWitness(witness)).rejects.toThrow(/consumed|authority/i);
  });
});
