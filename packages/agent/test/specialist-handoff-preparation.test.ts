import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildSpecialistHandoffMaterial,
  hashSpecialistHandoffMaterial
} from "../src/specialist-handoff-manifest.js";
import {
  hashMountedSpecialistHandoffPreparationReadback,
  hashUntrustedSpecialistHandoffPreparation,
  parseMountedSpecialistHandoffPreparationReadback,
  parseUntrustedSpecialistHandoffPreparation,
  type UntrustedSpecialistHandoffPreparationV1
} from "../src/specialist-handoff-preparation.js";

describe("specialist handoff preparation codec", () => {
  it("rejects a local JSON hash that diverges from the canonical preparation hash", () => {
    const preparation = preparationFor();
    const unsigned = withoutPreparationHash(preparation);
    const localHash = `sha256:${createHash("sha256").update(JSON.stringify(unsigned)).digest("hex")}` as const;

    expect(localHash).not.toBe(preparation.preparationHash);
    expect(() => parseUntrustedSpecialistHandoffPreparation({
      ...unsigned,
      preparationHash: localHash
    })).toThrow(/preparation hash/i);
  });

  it("rejects a mismatched mounted readback hash", () => {
    const preparation = preparationFor();
    const unsigned = {
      schemaVersion: "agent-specialist-handoff-preparation-readback.v1" as const,
      preparationHash: preparation.preparationHash,
      workspaceId: "ws_preparation",
      mountInstanceId: "mount_preparation",
      materialStoreBindingHash: hash("c"),
      manifestStoreBindingHash: hash("d")
    };
    const readback = {
      ...unsigned,
      readbackHash: hashMountedSpecialistHandoffPreparationReadback(unsigned)
    };

    expect(parseMountedSpecialistHandoffPreparationReadback(readback)).toEqual(readback);
    expect(() => parseMountedSpecialistHandoffPreparationReadback({
      ...readback,
      readbackHash: hash("e")
    })).toThrow(/readback hash/i);
  });

  it("rejects accessor-backed preparation fields without invoking their getter", () => {
    const preparation = { ...preparationFor() } as Record<string, unknown>;
    let getterCalls = 0;
    Object.defineProperty(preparation, "taskId", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "task_accessor";
      }
    });

    expect(() => parseUntrustedSpecialistHandoffPreparation(preparation)).toThrow(/plain own-data/i);
    expect(getterCalls).toBe(0);
  });

  it("rejects prototype, symbol, and sparse preparation shapes", () => {
    const preparation = preparationFor();
    const prototypeBacked = Object.assign(Object.create({ inherited: true }), preparation);
    const symbolBacked = { ...preparation } as Record<PropertyKey, unknown>;
    symbolBacked[Symbol("forged")] = true;
    const sparse: unknown[] = [];
    sparse.length = 1;
    const sparseMaterial = { ...preparation.handoffMaterial, outputArtifacts: sparse };

    expect(() => parseUntrustedSpecialistHandoffPreparation(prototypeBacked)).toThrow(/plain own-data/i);
    expect(() => parseUntrustedSpecialistHandoffPreparation(symbolBacked)).toThrow(/plain own-data/i);
    expect(() => parseUntrustedSpecialistHandoffPreparation({
      ...preparation,
      handoffMaterial: sparseMaterial
    })).toThrow(/JSON DTO-safe/i);
  });
});

function preparationFor(): UntrustedSpecialistHandoffPreparationV1 {
  const handoffMaterial = buildSpecialistHandoffMaterial({
    status: "ready-for-review",
    safeSummary: "A bounded nonterminal preparation.",
    contextPackRefs: [Object.freeze({
      contextPackId: "workspace-overview.v1",
      version: 1,
      contentHash: hash("a"),
      sizeBytes: 1,
      generatedAt: "2026-07-15T00:00:00.000Z",
      safeSummary: "Workspace overview.",
      provenanceRefs: Object.freeze(["evt_source_codec"])
    })],
    outputArtifacts: [],
    toolRequestIds: [],
    approvalRequirements: [],
    nextSafeActions: [],
    sourceEventIds: ["evt_source_codec"],
    relatedEventIds: ["evt_related_codec"]
  });
  const unsigned = {
    schemaVersion: "agent-specialist-handoff-preparation.v1" as const,
    taskId: "task_codec",
    attemptId: "attempt_codec",
    approvedRunId: "run_codec",
    runType: "evidence-triage",
    handoffMaterial,
    handoffMaterialHash: hashSpecialistHandoffMaterial(handoffMaterial)
  };
  return Object.freeze({
    ...unsigned,
    preparationHash: hashUntrustedSpecialistHandoffPreparation(unsigned)
  });
}

function withoutPreparationHash(value: UntrustedSpecialistHandoffPreparationV1) {
  const { preparationHash: _preparationHash, ...unsigned } = value;
  return unsigned;
}

function hash(character: string): `sha256:${string}` {
  return `sha256:${character.repeat(64)}`;
}
