import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildSpecialistHandoffMaterial,
  hashSpecialistHandoffMaterial
} from "../../agent/src/specialist-handoff-manifest.js";
import {
  hashUntrustedSpecialistHandoffPreparation,
  type UntrustedSpecialistHandoffPreparationV1
} from "../../agent/src/specialist-handoff-preparation.js";
import {
  createMountedSpecialistHandoffPreparationBinder,
  type MountedAgentArtifactStores,
  type MountedPreparationAuthority,
  type MountedSpecialistHandoffPreparationBinder
} from "../src/mounted-agent-artifact-stores.js";

const dispatch = Object.freeze({
  taskId: "task_mounted_preparation",
  attemptId: "attempt_mounted_preparation",
  approvedRunId: "run_mounted_preparation",
  runType: "evidence-triage"
});

describe("mounted preparation stores", () => {
  it("returns only canonical data-only readback and never invokes captured material or manifest stores", () => {
    const stores = storesFor();
    const binder = binderFor(stores);

    const readback = binder.prepare(preparationFor());

    expect(readback).toMatchObject({
      schemaVersion: "agent-specialist-handoff-preparation-readback.v1",
      preparationHash: preparationFor().preparationHash,
      workspaceId: "workspace_mounted_preparation",
      mountInstanceId: "mount_mounted_preparation"
    });
    expect(readback.materialStoreBindingHash).not.toBe(readback.manifestStoreBindingHash);
    expect(Object.isFrozen(readback)).toBe(true);
    expect(stores.calls).toEqual({ materialPut: 0, materialGet: 0, manifestPut: 0, manifestGet: 0 });
  });

  it("rejects a delegate wrapper and a terminal-looking substitute before any store activity", () => {
    const stores = storesFor();
    const binder = binderFor(stores);
    const preparation = preparationFor();

    expect(() => binder.prepare({ preparation } as never)).toThrow(/binding-invalid/i);
    expect(() => binder.prepare({
      ...preparation,
      terminalRunEventId: "evt_terminal_forged"
    } as never)).toThrow(/binding-invalid/i);
    expect(stores.calls).toEqual({ materialPut: 0, materialGet: 0, manifestPut: 0, manifestGet: 0 });
  });

  it("rejects agent-codec divergence before any store activity", () => {
    const stores = storesFor();
    const binder = binderFor(stores);
    const preparation = preparationFor();
    const { preparationHash: _preparationHash, ...unsigned } = preparation;
    const divergentHash = `sha256:${createHash("sha256").update(JSON.stringify(unsigned)).digest("hex")}` as const;

    expect(divergentHash).not.toBe(preparation.preparationHash);
    expect(() => binder.prepare({ ...unsigned, preparationHash: divergentHash })).toThrow(/binding-invalid/i);
    expect(stores.calls).toEqual({ materialPut: 0, materialGet: 0, manifestPut: 0, manifestGet: 0 });
  });

  it.each([
    ["taskId", "task_mounted_preparation_swapped"],
    ["attemptId", "attempt_mounted_preparation_swapped"],
    ["approvedRunId", "run_mounted_preparation_swapped"],
    ["runType", "investigation-planner"]
  ] as const)("rejects a captured preparation %s mismatch before any store activity", (field, value) => {
    const stores = storesFor();
    const binder = binderFor(stores);
    const preparation = preparationFor();
    const { preparationHash: _preparationHash, ...unsigned } = preparation;
    const mismatchedUnsigned = { ...unsigned, [field]: value };
    const mismatched = {
      ...mismatchedUnsigned,
      preparationHash: hashUntrustedSpecialistHandoffPreparation(mismatchedUnsigned)
    };

    expect(() => binder.prepare(mismatched)).toThrow(/binding-invalid/i);
    expect(stores.calls).toEqual({ materialPut: 0, materialGet: 0, manifestPut: 0, manifestGet: 0 });
  });

  it("rejects a structural binder lookalike before it can bind preparation", () => {
    const stores = storesFor();
    const binder = binderFor(stores);
    const lookalike = { prepare: binder.prepare } as MountedSpecialistHandoffPreparationBinder;

    expect(() => lookalike.prepare(preparationFor())).toThrow(/binding-invalid/i);
    expect(stores.calls).toEqual({ materialPut: 0, materialGet: 0, manifestPut: 0, manifestGet: 0 });
  });

  it.each([
    ["workspaceId", "workspace_swapped_after_capture"],
    ["mountInstanceId", "mount_swapped_after_capture"],
    ["workspaceIdentityEventId", "evt_workspace_identity_swapped"],
    ["policyVersion", "policy.v2"],
    ["sourceHighWaterMark", 43]
  ] as const)("rejects a changed captured authority %s before it binds preparation", (field, value) => {
    const stores = storesFor();
    const authority = authorityFor();
    const binder = binderFor(stores, authority);

    authority[field] = value as never;

    expect(() => binder.prepare(preparationFor())).toThrow(/binding-invalid/i);
    expect(stores.calls).toEqual({ materialPut: 0, materialGet: 0, manifestPut: 0, manifestGet: 0 });
  });

  it.each(mountedStoreMutations)("rejects a changed captured artifactStores %s before any store activity", (field, replacementFor) => {
    const stores = storesFor();
    const binder = binderFor(stores);

    stores.stores[field] = replacementFor(stores) as never;

    expect(() => binder.prepare(preparationFor())).toThrow(/binding-invalid/i);
    expect(stores.calls).toEqual({ materialPut: 0, materialGet: 0, manifestPut: 0, manifestGet: 0 });
    expect(stores.replacementCalls).toEqual({ materialPut: 0, materialGet: 0, manifestPut: 0, manifestGet: 0 });
  });

  it("rejects mismatched stores before it creates a binder", () => {
    const stores = storesFor();
    expect(() => createMountedSpecialistHandoffPreparationBinder({
      authority: authorityFor(),
      artifactStores: {
        ...stores.stores,
        workspaceId: "workspace_mismatched_stores"
      },
      ...dispatch
    })).toThrow(/binding-invalid/i);
    expect(stores.calls).toEqual({ materialPut: 0, materialGet: 0, manifestPut: 0, manifestGet: 0 });
  });
});

function binderFor(
  stores: ReturnType<typeof storesFor>,
  authority = authorityFor()
): MountedSpecialistHandoffPreparationBinder {
  return createMountedSpecialistHandoffPreparationBinder({
    authority,
    artifactStores: stores.stores,
    ...dispatch
  });
}

function authorityFor(): MutableMountedPreparationAuthority {
  return {
    authorityVersion: "mounted-workspace-runtime-authority.v1",
    workspaceId: "workspace_mounted_preparation",
    mountInstanceId: "mount_mounted_preparation",
    workspaceIdentityEventId: "evt_workspace_identity_mounted_preparation",
    policyVersion: "policy.v1",
    sourceHighWaterMark: 42
  };
}

type MutableMountedPreparationAuthority = Omit<MountedPreparationAuthority,
  "workspaceId" | "mountInstanceId" | "workspaceIdentityEventId" | "policyVersion" | "sourceHighWaterMark"> & {
  workspaceId: string;
  mountInstanceId: string;
  workspaceIdentityEventId: string;
  policyVersion: string;
  sourceHighWaterMark: number;
};

type StoreCalls = { materialPut: number; materialGet: number; manifestPut: number; manifestGet: number };

type MutableMountedAgentArtifactStores = Omit<MountedAgentArtifactStores,
  "workspaceId" | "mountInstanceId" | "materialStore" | "manifestStore"> & {
  workspaceId: string;
  mountInstanceId: string;
  materialStore: MountedAgentArtifactStores["materialStore"];
  manifestStore: MountedAgentArtifactStores["manifestStore"];
};

function storesFor(): {
  readonly stores: MutableMountedAgentArtifactStores;
  readonly calls: StoreCalls;
  readonly replacementCalls: StoreCalls;
} {
  const calls = { materialPut: 0, materialGet: 0, manifestPut: 0, manifestGet: 0 };
  const replacementCalls = { materialPut: 0, materialGet: 0, manifestPut: 0, manifestGet: 0 };
  return {
    calls,
    replacementCalls,
    stores: {
      storesVersion: "mounted-agent-artifact-stores.v1",
      workspaceId: "workspace_mounted_preparation",
      mountInstanceId: "mount_mounted_preparation",
      materialStore: {
        async put() {
          calls.materialPut += 1;
          return { contentHash: hash("m"), sizeBytes: 1 };
        },
        async get() {
          calls.materialGet += 1;
          return Buffer.from("material");
        }
      },
      manifestStore: {
        async put() {
          calls.manifestPut += 1;
          return { contentHash: hash("n"), sizeBytes: 1 };
        },
        async get() {
          calls.manifestGet += 1;
          return Buffer.from("manifest");
        }
      }
    }
  };
}

const mountedStoreMutations: readonly (readonly [
  "workspaceId" | "mountInstanceId" | "materialStore" | "manifestStore",
  (stores: ReturnType<typeof storesFor>) => unknown
])[] = [
  ["workspaceId", () => "workspace_swapped_after_capture"],
  ["mountInstanceId", () => "mount_swapped_after_capture"],
  ["materialStore", (stores) => replacementStoreFor(stores.replacementCalls, "material")],
  ["manifestStore", (stores) => replacementStoreFor(stores.replacementCalls, "manifest")]
];

function replacementStoreFor(
  calls: StoreCalls,
  role: "material" | "manifest"
): MountedAgentArtifactStores["materialStore"] {
  return {
    async put() {
      if (role === "material") {
        calls.materialPut += 1;
      } else {
        calls.manifestPut += 1;
      }
      return { contentHash: hash(role === "material" ? "x" : "y"), sizeBytes: 1 };
    },
    async get() {
      if (role === "material") {
        calls.materialGet += 1;
      } else {
        calls.manifestGet += 1;
      }
      return Buffer.from(role);
    }
  };
}

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
      provenanceRefs: Object.freeze(["evt_source_mounted_preparation"])
    })],
    outputArtifacts: [],
    toolRequestIds: [],
    approvalRequirements: [],
    nextSafeActions: [],
    sourceEventIds: ["evt_source_mounted_preparation"],
    relatedEventIds: ["evt_related_mounted_preparation"]
  });
  const unsigned = {
    schemaVersion: "agent-specialist-handoff-preparation.v1" as const,
    ...dispatch,
    handoffMaterial,
    handoffMaterialHash: hashSpecialistHandoffMaterial(handoffMaterial)
  };
  return Object.freeze({
    ...unsigned,
    preparationHash: hashUntrustedSpecialistHandoffPreparation(unsigned)
  });
}

function hash(character: string): `sha256:${string}` {
  return `sha256:${character.repeat(64)}`;
}
