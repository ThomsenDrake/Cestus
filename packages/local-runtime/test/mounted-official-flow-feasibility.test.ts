import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createOfficialFlowAbsenceWitness,
  inspectOfficialFlowAbsenceWitness,
  type OfficialFlowAbsenceWitnessV1
} from "../../agent/src/official-flow-feasibility.js";
import {
  hashAgentTaskOrchestratorPromptBindingReceipt,
  type AppendableKnowledgeEvent,
  type KnowledgeEvent,
  type KnowledgeEventOf
} from "../../ontology/src/contracts.js";
import { ConcurrencyConflictError, type EventLedger } from "../../ontology/src/event-ledger.js";
import { createPortableWorkspace } from "../../workspace/src/index.js";
import {
  inspectMountedArtifactAuthorityOperationForMountedOfficialFlowFeasibility,
  issueMountedArtifactAuthorityOperationForFactory,
  registerMountedArtifactAuthorityIssuerForWakeRuntime,
  type MountedArtifactAuthorityOperation
} from "../src/mounted-artifact-authority-operation.js";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import { recordMountedOfficialFlowUnavailability } from "../src/mounted-official-flow-feasibility.js";
import {
  createPortableWorkspaceLifecyclePorts,
  type PortableWorkspaceLifecyclePorts
} from "../src/portable-workspace-lifecycle.js";
import { createSqlitePrrRuntime, type LocalRuntimeHandle } from "../src/runtime-factory.js";
import type {
  ActiveClaimReconciliationPort,
  DurableSupervisorLeasePort,
  SupervisorLeaseReadbackEvidence,
  WorkspaceAdmissionSnapshot
} from "../../agent/src/wake-supervisor.js";

const hashB = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const hashC = "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
const hashD = "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";
const attemptId = `attempt_${"a".repeat(64)}`;
const tempDirs: string[] = [];
const handles: LocalRuntimeHandle[] = [];

afterEach(() => {
  for (const handle of handles.splice(0)) handle.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("mounted official-flow feasibility", () => {
  it("records a Codex absence only after exact mounted source readback", async () => {
    const fixture = await feasibilityFixture();
    const result = await record(fixture);

    expect(result).toMatchObject({
      kind: "unavailable",
      category: "official-flow-unavailable",
      providerId: "provider_openai_codex_review",
      modelId: "codex-review",
      capabilityHash: hashB,
      safeDiagnosticCodes: ["official-flow-unavailable"]
    });
    expect((await fixture.handle.ledger.readStream(feasibilityStream())).filter((event) =>
      event.type === "agent.provider.feasibility.observed.v1"
    )).toHaveLength(1);
  });

  it("records an xAI absence through the same mounted authority", async () => {
    const fixture = await feasibilityFixture({ providerFamily: "xai" });
    expect(await record(fixture)).toMatchObject({
      kind: "unavailable",
      providerId: "provider_xai_review",
      modelId: "xai-review"
    });
  });

  it("rejects copied serialized fabricated and cross-family witness objects", async () => {
    const fixture = await feasibilityFixture();
    const copied = { ...fixture.witness };
    const serialized = JSON.parse(JSON.stringify(fixture.witness));
    const fabricated = { schemaVersion: "agent-official-flow-absence-witness.v1", providerFamily: "codex" };
    for (const witness of [copied, serialized, fabricated]) {
      expect(await record(fixture, { witness })).toMatchObject({
        kind: "blocked", category: "classification-witness-invalid", retry: "none"
      });
    }
    expect(await record(fixture, { witness: createOfficialFlowAbsenceWitness(xaiInput(fixture.sourceIds)) })).toMatchObject({
      kind: "blocked", category: "source-evidence-mismatch", retry: "after-source-repair"
    });
  });

  it("blocks when a classification source event does not exist", async () => {
    const fixture = await feasibilityFixture();
    const witness = createOfficialFlowAbsenceWitness(classificationInput({
      sourceEventIds: ["evt_missing", fixture.sourceIds.checkpoint],
      causationEventId: fixture.sourceIds.checkpoint
    }));
    expect(await record(fixture, { witness })).toMatchObject({
      kind: "blocked", category: "source-evidence-missing", retry: "after-source-repair"
    });
  });

  it("blocks mismatched or noncanonical checkpoint source evidence without appending", async () => {
    const fixture = await feasibilityFixture({ checkpointModelId: "codex-not-review" });
    expect(await record(fixture)).toMatchObject({
      kind: "blocked", category: "source-evidence-mismatch", retry: "after-source-repair"
    });

    const hostileFixture = await feasibilityFixture();
    const readAll = hostileFixture.handle.ledger.readAll.bind(hostileFixture.handle.ledger);
    Object.defineProperty(hostileFixture.handle.ledger, "readAll", {
      configurable: true,
      value: async () => (await readAll()).map((event) => event.id === hostileFixture.sourceIds.checkpoint
        ? { ...event, payload: { ...event.payload, untrustedLookalike: true } }
        : event)
    });
    expect(await record(hostileFixture)).toMatchObject({
      kind: "blocked", category: "persistence-unconfirmed", retry: "after-ledger-refresh"
    });
    expect((await hostileFixture.handle.ledger.readStream(feasibilityStream())).filter((event) =>
      event.type === "agent.provider.feasibility.observed.v1"
    )).toHaveLength(0);
  });

  it("blocks when the human approval does not match the exact preview hash", async () => {
    const fixture = await feasibilityFixture({ approvalHash: hashD });
    expect(await record(fixture)).toMatchObject({
      kind: "blocked", category: "source-evidence-mismatch", retry: "after-source-repair"
    });
  });

  it("reuses the exact committed record for an idempotent retry", async () => {
    const fixture = await feasibilityFixture();
    const first = await record(fixture);
    const second = await record(fixture);
    expect(first).toMatchObject({ kind: "unavailable" });
    expect(second).toEqual(first);
    expect((await fixture.handle.ledger.readStream(feasibilityStream())).filter((event) =>
      event.type === "agent.provider.feasibility.observed.v1"
    )).toHaveLength(1);
  });

  it("fails closed when duplicate idempotency keys disagree", async () => {
    const fixture = await feasibilityFixture();
    const first = await record(fixture);
    if (first.kind !== "unavailable") throw new Error("fixture must record feasibility evidence");
    const committed = (await fixture.handle.ledger.readStream(feasibilityStream()))
      .find((event): event is KnowledgeEventOf<"agent.provider.feasibility.observed.v1"> =>
        event.type === "agent.provider.feasibility.observed.v1"
      );
    if (committed === undefined) throw new Error("expected committed feasibility event");
    const conflict: AppendableKnowledgeEvent<"agent.provider.feasibility.observed.v1"> = {
      type: committed.type,
      version: committed.version,
      streamId: committed.streamId,
      context: committed.context,
      payload: { ...committed.payload, classificationHash: hashD }
    };
    await fixture.handle.ledger.append(conflict);
    expect(await record(fixture)).toMatchObject({ kind: "blocked", category: "record-conflict", retry: "none" });
  });

  it("recovers one exact concurrent record and rejects exact-plus-conflicting same-key records", async () => {
    const cleanFixture = await feasibilityFixture();
    const cleanLedger = cleanFixture.handle.ledger;
    const cleanAppend = cleanLedger.append.bind(cleanLedger);
    const cleanReadAll = cleanLedger.readAll.bind(cleanLedger);
    let cleanConflicted = false;
    let cleanAppendAttempts = 0;
    let cleanReadAllCalls = 0;
    Object.defineProperty(cleanLedger, "readAll", {
      configurable: true,
      value: async () => {
        cleanReadAllCalls += 1;
        return await cleanReadAll();
      }
    });
    Object.defineProperty(cleanLedger, "append", {
      configurable: true,
      value: async (event: AppendableKnowledgeEvent, options?: { expectedGlobalEventCount?: number }) => {
        if (!cleanConflicted && event.type === "agent.provider.feasibility.observed.v1") {
          cleanConflicted = true;
          cleanAppendAttempts += 1;
          await cleanAppend(event, options);
          throw new ConcurrencyConflictError("test conflict after exact durable append");
        }
        return await cleanAppend(event, options);
      }
    });
    expect(await record(cleanFixture)).toMatchObject({ kind: "unavailable" });
    expect(cleanConflicted).toBe(true);
    expect(cleanAppendAttempts).toBe(1);
    expect(cleanReadAllCalls).toBe(2);
    expect((await cleanFixture.handle.ledger.readStream(feasibilityStream())).filter((event) =>
      event.type === "agent.provider.feasibility.observed.v1"
    )).toHaveLength(1);

    const conflictFixture = await feasibilityFixture();
    const conflictLedger = conflictFixture.handle.ledger;
    const conflictAppend = conflictLedger.append.bind(conflictLedger);
    const conflictReadAll = conflictLedger.readAll.bind(conflictLedger);
    let conflictInjected = false;
    let conflictAppendAttempts = 0;
    let conflictReadAllCalls = 0;
    Object.defineProperty(conflictLedger, "readAll", {
      configurable: true,
      value: async () => {
        conflictReadAllCalls += 1;
        return await conflictReadAll();
      }
    });
    Object.defineProperty(conflictLedger, "append", {
      configurable: true,
      value: async (event: AppendableKnowledgeEvent, options?: { expectedGlobalEventCount?: number }) => {
        if (!conflictInjected && event.type === "agent.provider.feasibility.observed.v1") {
          conflictInjected = true;
          conflictAppendAttempts += 1;
          await conflictAppend(event, options);
          await conflictAppend({
            ...event,
            payload: { ...event.payload, classificationHash: hashD }
          });
          throw new ConcurrencyConflictError("test conflict after durable append");
        }
        return await conflictAppend(event, options);
      }
    });
    expect(await record(conflictFixture)).toMatchObject({ kind: "blocked", category: "record-conflict", retry: "none" });
    expect(conflictInjected).toBe(true);
    expect(conflictAppendAttempts).toBe(1);
    expect(conflictReadAllCalls).toBe(2);
    expect((await conflictFixture.handle.ledger.readStream(feasibilityStream())).filter((event) =>
      event.type === "agent.provider.feasibility.observed.v1"
    )).toHaveLength(2);
  });

  it("returns persistence-unconfirmed after an append readback failure and recovers on retry", async () => {
    const fixture = await feasibilityFixture();
    const ledger = fixture.handle.ledger;
    const readStream = ledger.readStream.bind(ledger);
    let failReadback = true;
    Object.defineProperty(ledger, "readStream", {
      configurable: true,
      value: async (streamId: string) => {
        if (failReadback && streamId === feasibilityStream()) {
          failReadback = false;
          throw new Error("temporary readback fault");
        }
        return await readStream(streamId);
      }
    });
    expect(await record(fixture)).toMatchObject({
      kind: "blocked", category: "persistence-unconfirmed", retry: "after-ledger-refresh"
    });
    expect(await record(fixture)).toMatchObject({ kind: "unavailable" });
  });

  it("rejects an event-shaped append result that lacks durable readback", async () => {
    const fixture = await feasibilityFixture();
    const ledger = fixture.handle.ledger;
    let appendAttempt = 0;
    let readAllCalls = 0;
    const readAll = ledger.readAll.bind(ledger);
    Object.defineProperty(ledger, "readAll", {
      configurable: true,
      value: async () => {
        readAllCalls += 1;
        return await readAll();
      }
    });
    Object.defineProperty(ledger, "append", {
      configurable: true,
      value: async (event: AppendableKnowledgeEvent) => {
        appendAttempt += 1;
        if (appendAttempt === 1) {
          return { ...event, id: "evt_fake_append", sequence: 1 } as unknown as KnowledgeEvent;
        }
        if (appendAttempt === 2) return undefined as unknown as KnowledgeEvent;
        if (appendAttempt === 3) {
          const accessor = { ...event, sequence: 1 } as Record<string, unknown>;
          Object.defineProperty(accessor, "id", { enumerable: true, get: () => { throw new Error("hostile append id"); } });
          return accessor as unknown as KnowledgeEvent;
        }
        if (appendAttempt === 4) {
          return new Proxy({ ...event, id: "evt_fake_proxy", sequence: 1 }, {
            getOwnPropertyDescriptor() { throw new Error("hostile append proxy"); }
          }) as unknown as KnowledgeEvent;
        }
        throw new Proxy({}, {
          getPrototypeOf() { throw new Error("hostile append rejection prototype"); }
        });
      }
    });
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expect(record(fixture)).resolves.toMatchObject({
        kind: "blocked", category: "persistence-unconfirmed", retry: "after-ledger-refresh"
      });
    }
    const readsBeforeHostileRejection = readAllCalls;
    await expect(record(fixture)).resolves.toMatchObject({
      kind: "blocked", category: "persistence-unconfirmed", retry: "after-ledger-refresh"
    });
    expect(appendAttempt).toBe(5);
    expect(readAllCalls).toBe(readsBeforeHostileRejection + 1);
  });

  it("rechecks current mounted authority after the source-ledger await", async () => {
    const expectStale = async (fixture: Awaited<ReturnType<typeof feasibilityFixture>>) => {
      await expect(record(fixture)).resolves.toMatchObject({
        kind: "blocked", category: "mounted-authority-stale", retry: "after-remount"
      });
    };

    const sourceFixture = await feasibilityFixture();
    const sourceReadAll = sourceFixture.handle.ledger.readAll.bind(sourceFixture.handle.ledger);
    Object.defineProperty(sourceFixture.handle.ledger, "readAll", {
      configurable: true,
      value: async () => {
        const events = await sourceReadAll();
        sourceFixture.ports.authority.invalidate!("shutdown");
        return events;
      }
    });
    await expectStale(sourceFixture);

    const failedSourceFixture = await feasibilityFixture();
    Object.defineProperty(failedSourceFixture.handle.ledger, "readAll", {
      configurable: true,
      value: async () => {
        failedSourceFixture.ports.authority.invalidate!("shutdown");
        throw new Error("source readback fault");
      }
    });
    await expectStale(failedSourceFixture);

    const failedAppendFixture = await feasibilityFixture();
    Object.defineProperty(failedAppendFixture.handle.ledger, "append", {
      configurable: true,
      value: async () => {
        failedAppendFixture.ports.authority.invalidate!("shutdown");
        throw new Error("append fault");
      }
    });
    await expectStale(failedAppendFixture);

    const failedRereadFixture = await feasibilityFixture();
    const failedRereadReadAll = failedRereadFixture.handle.ledger.readAll.bind(failedRereadFixture.handle.ledger);
    let failedRereadCalls = 0;
    let failedRereadAppends = 0;
    Object.defineProperty(failedRereadFixture.handle.ledger, "readAll", {
      configurable: true,
      value: async () => {
        failedRereadCalls += 1;
        if (failedRereadCalls === 2) {
          failedRereadFixture.ports.authority.invalidate!("shutdown");
          throw new Error("concurrent reread fault");
        }
        return await failedRereadReadAll();
      }
    });
    Object.defineProperty(failedRereadFixture.handle.ledger, "append", {
      configurable: true,
      value: async () => {
        failedRereadAppends += 1;
        throw new ConcurrencyConflictError("concurrency fault");
      }
    });
    await expectStale(failedRereadFixture);
    expect(failedRereadCalls).toBe(2);
    expect(failedRereadAppends).toBe(1);

    const conflictingRereadFixture = await feasibilityFixture();
    const conflictingReadAll = conflictingRereadFixture.handle.ledger.readAll.bind(conflictingRereadFixture.handle.ledger);
    const conflictingAppend = conflictingRereadFixture.handle.ledger.append.bind(conflictingRereadFixture.handle.ledger);
    let conflictingRereadCalls = 0;
    let conflictingRereadAppends = 0;
    Object.defineProperty(conflictingRereadFixture.handle.ledger, "readAll", {
      configurable: true,
      value: async () => {
        conflictingRereadCalls += 1;
        const events = await conflictingReadAll();
        if (conflictingRereadCalls === 2) conflictingRereadFixture.ports.authority.invalidate!("shutdown");
        return events;
      }
    });
    Object.defineProperty(conflictingRereadFixture.handle.ledger, "append", {
      configurable: true,
      value: async (event: AppendableKnowledgeEvent, options?: { expectedGlobalEventCount?: number }) => {
        conflictingRereadAppends += 1;
        if (event.type === "agent.provider.feasibility.observed.v1") {
          await conflictingAppend({ ...event, payload: { ...event.payload, classificationHash: hashD } }, options);
        }
        throw new ConcurrencyConflictError("conflicting concurrency fault");
      }
    });
    await expectStale(conflictingRereadFixture);
    expect(conflictingRereadCalls).toBe(2);
    expect(conflictingRereadAppends).toBe(1);

    const failedReadbackFixture = await feasibilityFixture();
    Object.defineProperty(failedReadbackFixture.handle.ledger, "readStream", {
      configurable: true,
      value: async (streamId: string) => {
        if (streamId === feasibilityStream()) {
          failedReadbackFixture.ports.authority.invalidate!("shutdown");
          throw new Error("stream readback fault");
        }
        return [];
      }
    });
    await expectStale(failedReadbackFixture);
  });

  it("rejects a closed mounted authority operation", async () => {
    const fixture = await feasibilityFixture();
    fixture.handle.close();
    expect(await record(fixture)).toMatchObject({
      kind: "blocked", category: "mounted-authority-stale", retry: "after-remount"
    });
  });

  it("rejects a copied mounted authority operation", async () => {
    const fixture = await feasibilityFixture();
    expect(await record(fixture, { operation: { ...fixture.operation } as MountedArtifactAuthorityOperation })).toMatchObject({
      kind: "blocked", category: "mounted-authority-stale", retry: "after-remount"
    });
  });

  it("rejects a cross-workspace classification", async () => {
    const fixture = await feasibilityFixture();
    expect(await record(fixture, { witness: createOfficialFlowAbsenceWitness(classificationInput({ workspaceId: "ws_other" })) })).toMatchObject({
      kind: "blocked", category: "classification-witness-invalid", retry: "none"
    });
  });

  it("rejects a cross-mount classification", async () => {
    const fixture = await feasibilityFixture();
    expect(await record(fixture, { witness: createOfficialFlowAbsenceWitness(classificationInput({ mountInstanceId: "mount_other" })) })).toMatchObject({
      kind: "blocked", category: "classification-witness-invalid", retry: "none"
    });
  });

  it("rejects a cross-policy classification", async () => {
    const fixture = await feasibilityFixture();
    expect(await record(fixture, { witness: createOfficialFlowAbsenceWitness(classificationInput({ policyVersion: "policy_other.v1" })) })).toMatchObject({
      kind: "blocked", category: "classification-witness-invalid", retry: "none"
    });
  });

  it("normalizes external invocation input and rejects secret or noncanonical correlation material", async () => {
    const fixture = await feasibilityFixture();
    const ledger = fixture.handle.ledger;
    const readAll = ledger.readAll.bind(ledger);
    const append = ledger.append.bind(ledger);
    let readAllCalls = 0;
    let appendCalls = 0;
    Object.defineProperty(ledger, "readAll", {
      configurable: true,
      value: async () => {
        readAllCalls += 1;
        return await readAll();
      }
    });
    Object.defineProperty(ledger, "append", {
      configurable: true,
      value: async (event: AppendableKnowledgeEvent, options?: { expectedGlobalEventCount?: number }) => {
        appendCalls += 1;
        return await append(event, options);
      }
    });
    const expectUnsafeInput = async (input: unknown) => {
      readAllCalls = 0;
      appendCalls = 0;
      const result = await recordMountedOfficialFlowUnavailability(input);
      expect.soft(result).toEqual({
        kind: "blocked",
        category: "unsafe-input",
        retry: "none",
        safeDiagnosticCodes: ["unsafe-input"]
      });
      expect.soft(readAllCalls).toBe(0);
      expect.soft(appendCalls).toBe(0);
    };
    const input = {} as Record<string, unknown>;
    Object.defineProperties(input, {
      operation: { enumerable: true, get: () => fixture.operation },
      witness: { enumerable: true, value: fixture.witness },
      occurredAt: { enumerable: true, value: "2026-07-16T00:00:00.000Z" },
      correlationId: { enumerable: true, value: "corr_feasibility" }
    });
    await expectUnsafeInput(input);
    await expectUnsafeInput(new Proxy({
      operation: fixture.operation,
      witness: fixture.witness,
      occurredAt: "2026-07-16T00:00:00.000Z",
      correlationId: "corr_feasibility"
    }, {
      getPrototypeOf() { throw new Error("hostile invocation prototype"); }
    }));
    for (const correlationId of ["Cookie: session=abc", "X-Cookie: raw", "X-Credential: raw", "oauth=raw", "agent_credref_sk_live_abc"]) {
      await expectUnsafeInput({
        operation: fixture.operation,
        witness: fixture.witness,
        occurredAt: "2026-07-16T00:00:00.000Z",
        correlationId
      });
    }
    expect(await record(fixture, { correlationId: "credential-migration" })).toMatchObject({ kind: "unavailable" });
    await expectUnsafeInput({
      operation: fixture.operation,
      witness: fixture.witness,
      occurredAt: "2026-07-16T00:00:00",
      correlationId: "corr_feasibility"
    });
  });

  it("never exposes raw errors or source material in a blocked result", async () => {
    const fixture = await feasibilityFixture({ checkpointModelId: "codex-unavailable" });
    const result = await record(fixture);
    expect(result).toEqual({
      kind: "blocked",
      category: "source-evidence-mismatch",
      retry: "after-source-repair",
      safeDiagnosticCodes: ["source-evidence-mismatch"]
    });
    expect(JSON.stringify(result)).not.toMatch(/bearer|secret|error/i);
  });

  it("reproduces the frozen mounted idempotency vector", async () => {
    const fixture = await feasibilityFixture();
    const result = await record(fixture);
    const classification = inspectOfficialFlowAbsenceWitness(fixture.witness);
    if (classification === undefined) throw new Error("fixture must issue an inspectable witness");
    const { snapshot } = inspectMountedArtifactAuthorityOperationForMountedOfficialFlowFeasibility(fixture.operation);
    const vector = {
      schemaVersion: "agent-provider-feasibility-idempotency.v1",
      classificationHash: "sha256:bdae51eff3aedbc86bdec0de666fde4019fc6f920ae23ba09ac06211fa9eb8b6",
      workspaceId: "ws_review",
      mountInstanceId: "mount_review",
      admissionGenerationId: "admission_review",
      workspaceIdentityEventId: "evt_workspace_review",
      mountEvidenceId: "mount_evidence_review",
      authorityEvidenceId: "authority_evidence_review",
      ledgerStoreEvidenceId: "ledger_store_evidence_review",
      policyVersion: "policy_review.v1",
      policyDigest: "sha256:policy_review",
      lockStateDigest: "sha256:lock_review",
      highWaterMark: "hwm_review",
      highWaterOrdinal: 7
    };
    expect(`sha256:${createHash("sha256").update(JSON.stringify(vector)).digest("hex")}`).toBe(
      "sha256:91c31db4ab3a77ef41b43b0f9237c53cf0614ca861349ca98669af6dc5abaaca"
    );
    const livePreimage = {
      schemaVersion: "agent-provider-feasibility-idempotency.v1",
      classificationHash: classification.classificationHash,
      workspaceId: classification.workspaceId,
      mountInstanceId: classification.mountInstanceId,
      admissionGenerationId: snapshot.admissionGenerationId,
      workspaceIdentityEventId: snapshot.workspaceIdentityEventId,
      mountEvidenceId: snapshot.mountEvidenceId,
      authorityEvidenceId: snapshot.authorityEvidenceId,
      ledgerStoreEvidenceId: snapshot.ledgerStoreEvidenceId,
      policyVersion: snapshot.policyVersion,
      policyDigest: snapshot.policyDigest,
      lockStateDigest: snapshot.lockStateDigest,
      highWaterMark: snapshot.highWaterMark,
      highWaterOrdinal: snapshot.highWaterOrdinal
    };
    const liveIdempotencyKey = `sha256:${createHash("sha256").update(JSON.stringify(livePreimage)).digest("hex")}`;
    expect(result).toMatchObject({ kind: "unavailable" });
    if (result.kind !== "unavailable") throw new Error("fixture must record feasibility evidence");
    expect(result.idempotencyKey).toBe(liveIdempotencyKey);
  });

  it("does not append when the witness was issued for another source set", async () => {
    const fixture = await feasibilityFixture();
    const witness = createOfficialFlowAbsenceWitness(classificationInput({
      sourceEventIds: [fixture.sourceIds.approval, "evt_extra"],
      causationEventId: fixture.sourceIds.approval
    }));
    expect(await record(fixture, { witness })).toMatchObject({
      kind: "blocked", category: "source-evidence-missing", retry: "after-source-repair"
    });
    expect((await fixture.handle.ledger.readStream(feasibilityStream()))).toHaveLength(0);
  });

  it("does not allow a non-mounted object to act as authority", async () => {
    const fixture = await feasibilityFixture();
    expect(await record(fixture, { operation: { schemaVersion: "mounted-artifact-authority-operation.v1" } as MountedArtifactAuthorityOperation })).toMatchObject({
      kind: "blocked", category: "mounted-authority-stale", retry: "after-remount"
    });
  });
});

async function feasibilityFixture(options: {
  readonly providerFamily?: "codex" | "xai";
  readonly checkpointModelId?: string;
  readonly approvalHash?: string;
} = {}): Promise<{
  readonly handle: LocalRuntimeHandle;
  readonly ports: PortableWorkspaceLifecyclePorts;
  readonly operation: MountedArtifactAuthorityOperation;
  readonly witness: OfficialFlowAbsenceWitnessV1;
  readonly sourceIds: { readonly approval: string; readonly checkpoint: string };
}> {
  const workspaceRoot = join(tempDir(), "ws_review");
  createPortableWorkspace({
    rootDir: workspaceRoot,
    workspaceId: "ws_review",
    label: "Mounted feasibility review",
    createdAt: "2026-07-16T00:00:00.000Z",
    createdBy: "mounted-official-flow-feasibility-test"
  });
  const config = resolveLocalRuntimeConfig({
    cwd: workspaceRoot,
    env: { CESTUS_LOCAL_STORAGE: "portable-workspace", CESTUS_WORKSPACE_ROOT: workspaceRoot }
  });
  const handle = track(createSqlitePrrRuntime({
    config,
    actor: { id: "actor_feasibility_owner", kind: "human", label: "Feasibility owner" }
  }));
  const ports = lifecyclePorts();
  const wakeRuntime = {};
  registerMountedArtifactAuthorityIssuerForWakeRuntime({ wakeRuntime, lifecyclePorts: ports, runtimeHandle: handle });
  await admit(ports);
  const operation = issueMountedArtifactAuthorityOperationForFactory(wakeRuntime);
  const approval = await appendApproval(handle.ledger, options.approvalHash ?? hashC);
  const providerFamily = options.providerFamily ?? "codex";
  const classificationSource = classificationInput({
    providerFamily,
    providerId: providerFamily === "codex" ? "provider_openai_codex_review" : "provider_xai_review",
    modelId: providerFamily === "codex" ? "codex-review" : "xai-review",
    officialFlowId: providerFamily === "codex" ? "codex-review" : "xai-review",
    credentialKind: providerFamily === "codex" ? "subscription-oauth" as const : "device-code-oauth" as const,
    sourceEventIds: [approval.id, "evt_pending_checkpoint"],
    causationEventId: "evt_pending_checkpoint"
  });
  const classificationPosture = classificationSource.configuredPosture as Record<string, unknown>;
  const checkpoint = await appendCheckpoint(handle.ledger, approval.id, {
    ...classificationPosture,
    modelId: options.checkpointModelId ?? classificationPosture.modelId
  });
  const sourceIds = { approval: approval.id, checkpoint: checkpoint.id };
  const witness = createOfficialFlowAbsenceWitness(classificationInput({
    ...classificationPosture,
    sourceEventIds: [approval.id, checkpoint.id],
    causationEventId: checkpoint.id
  }));
  return { handle, ports, operation, witness, sourceIds };
}

async function record(
  fixture: Awaited<ReturnType<typeof feasibilityFixture>>,
  patch: { readonly operation?: MountedArtifactAuthorityOperation; readonly witness?: unknown; readonly correlationId?: string } = {}
) {
  return await recordMountedOfficialFlowUnavailability({
    operation: patch.operation ?? fixture.operation,
    witness: patch.witness ?? fixture.witness,
    occurredAt: "2026-07-16T00:00:00.000Z",
    correlationId: patch.correlationId ?? "corr_feasibility_review"
  });
}

function classificationInput(patch: Record<string, unknown> = {}): Record<string, unknown> {
  const posture = {
    residentAgentId: "agent_default",
    workspaceId: "ws_review",
    mountInstanceId: "mount_review",
    taskId: "task_review",
    attemptId,
    runId: "run_review",
    providerFamily: "codex",
    providerId: "provider_openai_codex_review",
    modelId: "codex-review",
    capabilityHash: hashB,
    credentialRefId: "agent_credref_review",
    credentialKind: "subscription-oauth",
    capabilityScopes: ["harness-execution"],
    policyVersion: "policy_review.v1",
    officialFlowId: "codex-review",
    approvalClass: "provider-byte-transfer",
    approvalBindingHash: hashC,
    sourceEventIds: ["evt_approval_review", "evt_checkpoint_review"],
    causationEventId: "evt_checkpoint_review",
    ...patch
  };
  return { configuredPosture: posture, assessedPosture: { ...posture }, officialFlow: undefined };
}

function xaiInput(sourceIds: { readonly approval: string; readonly checkpoint: string }): Record<string, unknown> {
  return classificationInput({
    providerFamily: "xai",
    providerId: "provider_xai_review",
    modelId: "xai-review",
    officialFlowId: "xai-review",
    credentialKind: "device-code-oauth",
    sourceEventIds: [sourceIds.approval, sourceIds.checkpoint],
    causationEventId: sourceIds.checkpoint
  });
}

async function appendApproval(ledger: EventLedger, approvedPreviewHash: string): Promise<KnowledgeEventOf<"agent.tool.approved">> {
  const event: AppendableKnowledgeEvent<"agent.tool.approved"> = {
    type: "agent.tool.approved",
    version: 1,
    streamId: "agent_tool_request_toolreq_feasibility",
    context: humanContext(),
    payload: {
      toolRequestId: "toolreq_feasibility",
      approvedBy: "actor_feasibility_owner",
      approvedPreviewHash,
      approvalClass: "provider-byte-transfer",
      rationale: "Approved provider feasibility classification review.",
      approvedAt: "2026-07-16T00:00:00.000Z"
    }
  };
  return await ledger.append(event) as KnowledgeEventOf<"agent.tool.approved">;
}

async function appendCheckpoint(
  ledger: EventLedger,
  approvalEventId: string,
  posture: Record<string, unknown>
): Promise<KnowledgeEventOf<"agent.task.orchestration.checkpointed">> {
  const receiptMaterial = {
    schemaVersion: "agent-task-orchestrator.prompt-binding-receipt.v1" as const,
    taskId: "task_review",
    attemptId,
    runId: "run_review",
    sourceApprovedPromptArtifactHash: hashB,
    boundPromptArtifactHash: hashB,
    generatedAt: "2026-07-16T00:00:00.000Z",
    approvalEventId,
    providerPostureHash: hashC,
    exactRunBindingHash: hashB,
    workspaceId: "ws_review",
    mountInstanceId: "mount_review"
  };
  const event: AppendableKnowledgeEvent<"agent.task.orchestration.checkpointed"> = {
    type: "agent.task.orchestration.checkpointed",
    version: 1,
    streamId: "agent_task_orchestration_task_review_evidence-triage",
    context: { ...agentContext(), causationId: approvalEventId },
    payload: {
      taskId: "task_review",
      runType: "evidence-triage",
      attemptId,
      retryGeneration: 0,
      leaseClaimGeneration: 1,
      checkpointKind: "prompt-bound",
      checkpointedAt: receiptMaterial.generatedAt,
      runId: "run_review",
      resumeIdempotencyKey: "feasibility-review-resume",
      toolRequestIds: ["toolreq_feasibility"],
      approvalRequirement: {
        approvalClass: "provider-byte-transfer",
        previewHash: posture.approvalBindingHash as string,
        approvalRequestEventId: "evt_tool_request_feasibility"
      },
      providerPosture: {
        providerId: posture.providerId as string,
        modelFamily: posture.modelId as string,
        adapterVersion: "adapter_review.v1",
        capabilityIds: [
          posture.capabilityHash as string,
          posture.officialFlowId as string,
          ...(posture.capabilityScopes as string[]).map((scope) => `scope:${scope}`)
        ],
        credentialRefId: posture.credentialRefId as string,
        credentialKind: posture.credentialKind as "subscription-oauth" | "device-code-oauth",
        readinessState: "ready",
        approvalProfile: "provider-byte-transfer",
        dataHandlingPosture: "provider-approved",
        selectionPolicyVersion: posture.policyVersion as string,
        sensitivityClass: "provider-approved",
        requiredApprovalClass: "provider-byte-transfer"
      },
      contextBindings: [{
        contextPackId: "feasibility-review.v1",
        contentHash: hashB,
        sizeBytes: 1,
        schemaId: "feasibility-review.v1",
        provenanceEventIds: [approvalEventId]
      }],
      sourceEventIds: [approvalEventId],
      inputArtifactHashes: [hashB],
      promptArtifactHash: hashB,
      lockSnapshot: { activeLockIds: [], highWaterMark: 0 },
      promptBindingReceipt: {
        ...receiptMaterial,
        receiptHash: hashAgentTaskOrchestratorPromptBindingReceipt(receiptMaterial)
      },
      safeNextActions: ["record advisory feasibility evidence"]
    }
  };
  return await ledger.append(event) as KnowledgeEventOf<"agent.task.orchestration.checkpointed">;
}

function lifecyclePorts(): PortableWorkspaceLifecyclePorts {
  return createPortableWorkspaceLifecyclePorts({
    workspaceId: "ws_review",
    residentId: "agent_default",
    supervisorEpoch: "epoch_feasibility_review",
    mountedFacts: {
      async read() {
        return {
          ok: true as const,
          facts: {
            schemaVersion: "portable-workspace-mounted-facts.v1" as const,
            workspaceId: "ws_review",
            residentId: "agent_default" as const,
            workspaceIdentityEventId: "evt_workspace_review",
            mountInstanceId: "mount_review",
            mountEvidenceId: "mount_evidence_review",
            authorityEvidenceId: "authority_evidence_review",
            ledgerStoreEvidenceId: "ledger_store_evidence_review",
            artifactStoreEvidenceId: "artifact_store_review",
            derivativeStoreEvidenceId: "derivative_store_review",
            policyVersion: "policy_review.v1",
            policyDigest: "sha256:policy_review",
            lockStateDigest: "sha256:lock_review",
            policyAndLockReadbackEventId: "evt_policy_lock_review",
            highWaterMark: "hwm_review",
            highWaterReadbackEventId: "evt_high_water_review",
            highWaterOrdinal: 7
          }
        };
      }
    },
    supervisorLease: leasePort(),
    activeClaimReconciliation: {
      async readByIdempotencyKey() { return undefined; },
      async appendAndReadBack() { throw new Error("not used"); }
    },
    now: () => "2026-07-16T00:00:00.000Z",
    createSafeOutageObservationId: () => "outage_feasibility_review"
  });
}

async function admit(ports: PortableWorkspaceLifecyclePorts): Promise<WorkspaceAdmissionSnapshot> {
  const grant = await ports.authority.revalidate({
    operation: "wake",
    expectedWorkspaceId: "ws_review",
    requiredCapabilities: ["wake", "lifecycle"]
  });
  if (!grant.ok) throw new Error("expected mounted admission");
  const lease = await ports.supervisorLease.readOrAcquire({
    admission: grant.admission,
    residentId: "agent_default",
    supervisorEpoch: "epoch_feasibility_review",
    policyVersion: "policy_review.v1",
    policyDigest: "sha256:policy_review",
    lockStateDigest: "sha256:lock_review",
    causationId: "cause_feasibility_review",
    correlationId: "corr_feasibility_review"
  });
  if (lease.outcome !== "acquired-and-read-back") throw new Error("expected durable lease");
  return grant.admission;
}

function leasePort(): DurableSupervisorLeasePort {
  return {
    async readOrAcquire() {
      const readback: SupervisorLeaseReadbackEvidence = {
        schemaVersion: "resident-supervisor-lease-readback.v1",
        workspaceId: "ws_review",
        residentId: "agent_default",
        supervisorEpoch: "epoch_feasibility_review",
        workspaceIdentityEventId: "evt_workspace_review",
        mountEvidenceId: "mount_evidence_review",
        authorityEvidenceId: "authority_evidence_review",
        policyVersion: "policy_review.v1",
        policyDigest: "sha256:policy_review",
        lockStateDigest: "sha256:lock_review",
        highWaterMark: "hwm_review",
        leaseEventId: "evt_lease_review",
        readbackEventId: "evt_lease_readback_review",
        expiresAt: "2026-07-16T01:00:00.000Z",
        causation: { causationId: "cause_feasibility_review", correlationId: "corr_feasibility_review" },
        policyAndLock: {
          authorityEvidenceId: "authority_evidence_review",
          mountEvidenceId: "mount_evidence_review",
          leaseEventId: "evt_lease_review",
          leaseReadbackEventId: "evt_lease_readback_review",
          policyVersion: "policy_review.v1",
          policyDigest: "sha256:policy_review",
          lockStateDigest: "sha256:lock_review",
          readbackEventId: "evt_policy_lock_review"
        },
        highWater: {
          authorityEvidenceId: "authority_evidence_review",
          mountEvidenceId: "mount_evidence_review",
          leaseEventId: "evt_lease_review",
          leaseReadbackEventId: "evt_lease_readback_review",
          highWaterMark: "hwm_review",
          readbackEventId: "evt_high_water_review"
        }
      };
      return { outcome: "acquired-and-read-back" as const, readback };
    }
  };
}

function agentContext() {
  return {
    actor: { id: "agent_default", kind: "agent" as const, label: "Cestus Agent" },
    occurredAt: "2026-07-16T00:00:00.000Z",
    correlationId: "corr_feasibility_review",
    coreVersion: "0.1.0",
    packVersions: { core: "0.1.0", agent: "0.1.0" }
  };
}

function humanContext() {
  return {
    ...agentContext(),
    actor: { id: "actor_feasibility_owner", kind: "human" as const, label: "Feasibility owner" }
  };
}

function feasibilityStream(): string {
  return `agent_provider_feasibility_task_review_${attemptId}_run_review_provider_openai_codex_review`;
}

function tempDir(): string {
  const directory = mkdtempSync(join(tmpdir(), "cestus-mounted-feasibility-"));
  tempDirs.push(directory);
  return directory;
}

function track(handle: LocalRuntimeHandle): LocalRuntimeHandle {
  handles.push(handle);
  return handle;
}
