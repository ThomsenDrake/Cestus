import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, expectTypeOf, it } from "vitest";
import * as agent from "../src/index.js";
import {
  bindApprovedProductionSpecialistPromptV2,
  buildContextPackRef,
  buildSpecialistHandoffMaterial,
  buildPromptArtifact,
  computeSpecialistHandoffId,
  createAgentRuntime,
  appendSpecialistFinalOutputStep,
  appendSpecialistFailure,
  expectedNextSequenceFromStream,
  finalizeSpecialistRunAfterHandoff,
  createContextPackRegistry,
  invokeSpecialistModel,
  prepareSpecialistRun,
  productionSpecialistPromptRegistrationFor,
  productionSpecialistPromptRegistrations,
  recordSpecialistHandoff,
  serializeSpecialistLocalArtifact,
  specialistWorkflowDescriptorFor,
  type AgentContextPackJsonValue,
  type ContextPackRegistry,
  type SpecialistRunnerBaseInput,
  writeSpecialistDerivativeArtifact
} from "../src/index.js";
import {
  recordAuthorityBoundSpecialistHandoff,
  type RecordAuthorityBoundSpecialistHandoffResult
} from "../src/specialist-runner-kernel.js";
import { issueMountedSpecialistHandoffAuthorityWitness } from "../src/specialist-handoff-authority.js";
import { registerContextPackPayloadParserAuthority } from "../src/context-packs.js";
import {
  createMountedProductionPromptReadbackAuthority,
  issueMountedProductionPromptReadback
} from "../src/production-prompt-readback.js";
import { serializePromptArtifactEnvelope } from "../src/prompt-artifacts.js";
import { ConcurrencyConflictError, InMemoryEventLedger, type EventLedger } from "../../ontology/src/event-ledger.js";
import type { KnowledgeEvent } from "../../ontology/src/contracts.js";
import { createPortableWorkspace } from "../../workspace/src/index.js";
import { resolveLocalRuntimeConfig } from "../../local-runtime/src/config.js";
import { createMountedPromptArtifactStore } from "../../local-runtime/src/mounted-prompt-artifact-store.js";
import { createSqlitePrrRuntime, type LocalRuntimeHandle } from "../../local-runtime/src/runtime-factory.js";

const mountedRunnerDirs: string[] = [];
const mountedRunnerHandles: LocalRuntimeHandle[] = [];

afterEach(() => {
  for (const handle of mountedRunnerHandles.splice(0)) handle.close();
  for (const dir of mountedRunnerDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("specialist runner artifact serialization", () => {
  it("rejects missing mounted context-ready prompt instead of rendering", async () => {
    const fixture = await runnerFixture({ includeWitness: false });

    await expect(prepareSpecialistRun(fixture.input, "evidence-triage"))
      .rejects.toThrow(/mounted.*prompt.*readback|required/i);
    expect(fixture.invocationCount()).toBe(0);
  });

  it("accepts the exact supplied context-ready v1 without another render", async () => {
    const fixture = await runnerFixture();
    const prepared = await prepareSpecialistRun(fixture.input, "evidence-triage");

    expect(prepared.promptArtifact.manifest.inputArtifactHash).toBe(fixture.rendered.manifest.inputArtifactHash);
    expect(fixture.invocationCount()).toBe(0);
  });

  it("rejects structurally valid v1 without mounted readback membership", async () => {
    const fixture = await runnerFixture();
    const rendered = await renderedRunnerPrompt(fixture.input);

    await expect(prepareSpecialistRun({ ...fixture.input, mountedPromptReadbackWitness: undefined, promptArtifact: rendered }, "evidence-triage"))
      .rejects.toThrow(/mounted.*prompt.*readback|required/i);
  });

  it("rejects copied swapped and reused mounted readback witness", async () => {
    const fixture = await runnerFixture();
    const witness = fixture.input.mountedPromptReadbackWitness;
    if (witness === undefined) throw new Error("Expected mounted witness.");
    const copied = { ...witness };

    await expect(prepareSpecialistRun({ ...fixture.input, mountedPromptReadbackWitness: copied }, "evidence-triage"))
      .rejects.toThrow(/mounted.*prompt.*readback|required/i);
    await expect(prepareSpecialistRun({ ...fixture.input, mountedPromptReadbackWitness: witness }, "evidence-triage"))
      .resolves.toMatchObject({ promptArtifact: { manifest: { inputArtifactHash: fixture.rendered.manifest.inputArtifactHash } } });
    await expect(prepareSpecialistRun({ ...fixture.input, mountedPromptReadbackWitness: witness }, "evidence-triage"))
      .rejects.toThrow(/consumed|mounted.*prompt.*readback/i);
  });

  it("consumes one exact post-mount-check v1 witness without rendering", async () => {
    const fixture = await runnerFixture();
    const witness = fixture.input.mountedPromptReadbackWitness;
    if (witness === undefined) throw new Error("Expected mounted witness.");

    await expect(prepareSpecialistRun({ ...fixture.input, mountedPromptReadbackWitness: witness }, "evidence-triage"))
      .resolves.toMatchObject({ promptArtifact: { manifest: { production: { schemaVersion: "agent-production-prompt-binding.v1" } } } });
  });

  it("concurrent mounted witness preparation yields at most one provider-preparable run", async () => {
    const fixture = await runnerFixture({ includeWitness: false });
    const canonical = Buffer.from(serializePromptArtifactEnvelope(fixture.rendered));
    const rereadStarted = deferred<void>();
    const rereadRelease = deferred<Uint8Array>();
    let deferConsumption = false;
    let rereadCount = 0;
    const authority = createMountedProductionPromptReadbackAuthority({
      currentMount: () => ({ workspaceId: "ws_runner_test", rootDir: "/runner", blobRoot: "/runner/blobs" })
    });
    const witness = await issueMountedProductionPromptReadback({
      serializedEnvelope: canonical,
      authoritativeResolvedContextPacks: fixture.rendered.resolvedContextPacks,
      authority,
      rereadCanonicalBytes: async () => {
        rereadCount += 1;
        if (!deferConsumption) return canonical;
        rereadStarted.resolve();
        return await rereadRelease.promise;
      }
    });
    const input = { ...fixture.input, mountedPromptReadbackWitness: witness };

    deferConsumption = true;
    const first = prepareSpecialistRun(input, "evidence-triage");
    const second = prepareSpecialistRun(input, "evidence-triage");
    await rereadStarted.promise;
    for (let microtask = 0; microtask < 20; microtask += 1) await Promise.resolve();

    expect(rereadCount).toBe(2);
    rereadRelease.resolve(canonical);
    await expect(first).resolves.toMatchObject({ promptArtifact: { manifest: { inputArtifactHash: fixture.rendered.manifest.inputArtifactHash } } });
    await expect(second).rejects.toThrow(/already consumed|mounted.*readback/i);
    expect(fixture.invocationCount()).toBe(0);
  });

  it("preserves the authoritative artifact timestamp across delayed approval resume", async () => {
    let resumedNow = "2026-07-11T08:00:00.000Z";
    const fixture = await runnerFixture({ now: () => resumedNow });
    resumedNow = "2026-07-12T09:30:00.000Z";

    await expect(prepareSpecialistRun(fixture.input, "evidence-triage"))
      .resolves.toMatchObject({ promptArtifact: { manifest: { generatedAt: "2026-07-11T08:00:00.000Z" } } });
  });
  it("serializes plain JSON deterministically with sorted object keys", () => {
    expect(serializeSpecialistLocalArtifact({
      beta: 2,
      alpha: ["x", { nested: true }]
    }).toString("utf8")).toBe('{"alpha":["x",{"nested":true}],"beta":2}');
  });

  it("rejects object and array accessors without invoking getters", () => {
    let objectGetterCalls = 0;
    const objectWithGetter = {};
    Object.defineProperty(objectWithGetter, "secret", {
      enumerable: true,
      get() {
        objectGetterCalls += 1;
        return "hidden";
      }
    });
    expect(() => serializeSpecialistLocalArtifact(objectWithGetter)).toThrow(/data properties/i);
    expect(objectGetterCalls).toBe(0);

    let arrayGetterCalls = 0;
    const arrayWithGetter: unknown[] = [];
    Object.defineProperty(arrayWithGetter, "0", {
      enumerable: true,
      get() {
        arrayGetterCalls += 1;
        return "hidden";
      }
    });
    expect(() => serializeSpecialistLocalArtifact(arrayWithGetter)).toThrow(/data properties/i);
    expect(arrayGetterCalls).toBe(0);
  });

  it("rejects sparse arrays and unsupported array properties", () => {
    const sparse: unknown[] = [];
    sparse.length = 2;
    sparse[1] = "value";
    expect(() => serializeSpecialistLocalArtifact(sparse)).toThrow(/sparse/i);

    const custom = ["value"] as string[] & { extra?: string };
    custom.extra = "unsupported";
    expect(() => serializeSpecialistLocalArtifact(custom)).toThrow(/unsupported array property/i);
  });

  it("rejects symbols, non-enumerable fields, unsafe keys, cycles, and non-finite numbers", () => {
    const symbolKey = Symbol("hidden");
    const withSymbol = { visible: true } as Record<PropertyKey, unknown>;
    withSymbol[symbolKey] = "hidden";
    expect(() => serializeSpecialistLocalArtifact(withSymbol)).toThrow(/symbol-keyed/i);

    const nonEnumerable = { visible: true };
    Object.defineProperty(nonEnumerable, "hidden", { enumerable: false, value: true });
    expect(() => serializeSpecialistLocalArtifact(nonEnumerable)).toThrow(/non-enumerable/i);

    const unsafe = {};
    Object.defineProperty(unsafe, "__proto__", { enumerable: true, value: "pollution" });
    expect(() => serializeSpecialistLocalArtifact(unsafe)).toThrow(/unsafe key/i);

    const cycle: { self?: unknown } = {};
    cycle.self = cycle;
    expect(() => serializeSpecialistLocalArtifact(cycle)).toThrow(/cycle/i);

    expect(() => serializeSpecialistLocalArtifact({ value: Number.NaN })).toThrow(/non-finite/i);
    expect(() => serializeSpecialistLocalArtifact({ value: Number.POSITIVE_INFINITY })).toThrow(/non-finite/i);
  });

  it("treats derivative store return values as exact plain data without invoking getters", async () => {
    let getterCalls = 0;
    const hostileResult = {};
    Object.defineProperty(hostileResult, "contentHash", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return hashBytes(serializeSpecialistLocalArtifact({ ok: true }));
      }
    });
    Object.defineProperty(hostileResult, "sizeBytes", {
      enumerable: true,
      value: serializeSpecialistLocalArtifact({ ok: true }).byteLength
    });

    await expect(writeSpecialistDerivativeArtifact({
      derivativeStore: { put: async () => hostileResult as { readonly contentHash: `sha256:${string}`; readonly sizeBytes: number } },
      artifactKind: "hostile-artifact",
      payload: { ok: true }
    })).rejects.toThrow(/data properties/i);
    expect(getterCalls).toBe(0);
  });

  it("rejects derivative store results with prototypes, extra fields, symbols, or stale values", async () => {
    const payload = { ok: true };
    const bytes = serializeSpecialistLocalArtifact(payload);
    const validResult = { contentHash: hashBytes(bytes), sizeBytes: bytes.byteLength };
    const prototypeResult = Object.assign(Object.create({ hidden: true }), validResult);
    await expect(writeSpecialistDerivativeArtifact({
      derivativeStore: { put: async () => prototypeResult },
      artifactKind: "prototype-artifact",
      payload
    })).rejects.toThrow(/plain JSON objects/i);

    await expect(writeSpecialistDerivativeArtifact({
      derivativeStore: { put: async () => ({ ...validResult, extra: "forged" }) },
      artifactKind: "extra-artifact",
      payload
    })).rejects.toThrow(/exactly contentHash and sizeBytes/i);

    const symbol = Symbol("hidden");
    const symbolResult = { ...validResult } as Record<PropertyKey, unknown>;
    symbolResult[symbol] = "forged";
    await expect(writeSpecialistDerivativeArtifact({
      derivativeStore: { put: async () => symbolResult as { readonly contentHash: `sha256:${string}`; readonly sizeBytes: number } },
      artifactKind: "symbol-artifact",
      payload
    })).rejects.toThrow(/symbol-keyed/i);

    await expect(writeSpecialistDerivativeArtifact({
      derivativeStore: { put: async () => ({ contentHash: hashBytes(Buffer.from("forged")), sizeBytes: bytes.byteLength }) },
      artifactKind: "stale-artifact",
      payload
    })).rejects.toThrow(/stale hash/i);
  });
});

describe("production specialist run preparation", () => {
  it("structurally valid v2 is blocked without factory authority", async () => {
    const fixture = await boundRunnerPromptFixture();
    const block = (agent as unknown as {
      readonly blockV2ProviderTransferUntilFactoryAuthority?: (input: unknown) => unknown;
    }).blockV2ProviderTransferUntilFactoryAuthority;
    const selected = (agent as unknown as {
      readonly assertSelectedSpecialistProviderByteTransferApproval?: (input: unknown) => Promise<unknown>;
    }).assertSelectedSpecialistProviderByteTransferApproval;

    expect(block).toBeTypeOf("function");
    const blocked = block!({
      approvedV1: fixture.approvedPromptArtifact,
      candidateV2: fixture.boundPromptArtifact
    });
    expect(blocked).toEqual(expect.objectContaining({
      schemaVersion: "agent-task133-v2-transfer-boundary.v1",
      status: "blocked",
      code: "authority-resolution-required",
      sourceApprovedPromptArtifactHash: fixture.approvedPromptArtifact.manifest.inputArtifactHash,
      boundPromptArtifactHash: fixture.boundPromptArtifact.manifest.inputArtifactHash
    }));
    expect(Object.isFrozen(blocked)).toBe(true);
    expect(selected).toBeTypeOf("function");
    const blockedSelection = v2BlockedSelectionInput(fixture, fixture.exactRun);
    await expect(selected!(blockedSelection.input)).resolves.toEqual(blocked);
    expect(blockedSelection.effects).toEqual([]);
    expect(fixture.invocationCount()).toBe(0);
  });

  it("rejects swapped source v1 and rerendered text", async () => {
    const fixture = await boundRunnerPromptFixture();
    const alternate = await boundRunnerPromptFixture({ runId: "run_runner_test_swapped", taskId: "task_runner_test_swapped" });
    const assertion = (agent as unknown as {
      readonly assertApprovedV1ToV2ArtifactInvariants?: (input: unknown) => void;
    }).assertApprovedV1ToV2ArtifactInvariants;

    expect(assertion).toBeTypeOf("function");
    expect(() => assertion!({
      approvedV1: alternate.approvedPromptArtifact,
      candidateV2: fixture.boundPromptArtifact
    })).toThrow(/approved|source|binding/i);
    expect(() => assertion!({
      approvedV1: fixture.approvedPromptArtifact,
      candidateV2: { ...fixture.boundPromptArtifact, text: `${fixture.boundPromptArtifact.text}\nRerendered.` }
    })).toThrow(/hash|text|approved|binding/i);
    expect(fixture.invocationCount()).toBe(0);
    expect(alternate.invocationCount()).toBe(0);
  });

  it("direct v2 proof and exact run cannot become transfer authority", async () => {
    const fixture = await boundRunnerPromptFixture();
    const selected = (agent as unknown as {
      readonly assertSelectedSpecialistProviderByteTransferApproval?: (input: unknown) => Promise<unknown>;
    }).assertSelectedSpecialistProviderByteTransferApproval;

    expect(selected).toBeTypeOf("function");
    const blockedSelection = v2BlockedSelectionInput(fixture, {
      ...fixture.exactRun,
      attemptId: "attempt_runner_test_direct_proof"
    });
    await expect(selected!(blockedSelection.input)).resolves.toEqual(expect.objectContaining({
      status: "blocked",
      code: "authority-resolution-required"
    }));
    expect(blockedSelection.effects).toEqual([]);
    expect(fixture.invocationCount()).toBe(0);
  });

  it("each missing current authority family remains zero effect", async () => {
    const fixture = await boundRunnerPromptFixture();
    const selected = (agent as unknown as {
      readonly assertSelectedSpecialistProviderByteTransferApproval?: (input: unknown) => Promise<unknown>;
    }).assertSelectedSpecialistProviderByteTransferApproval;

    expect(selected).toBeTypeOf("function");
    for (const exactRun of [
      { ...fixture.exactRun, attemptId: "attempt_runner_test_swapped" },
      { ...fixture.exactRun, approvedRunId: "run_runner_test_approved_swapped" },
      { ...fixture.exactRun, workspaceId: "ws_runner_test_swapped" },
      { ...fixture.exactRun, mountInstanceId: "mount_runner_test_swapped" },
      { ...fixture.exactRun, workflowDescriptor: specialistWorkflowDescriptorFor("prr-negotiation") },
      { ...fixture.exactRun, policyVersion: "runner-policy.swapped" },
      { ...fixture.exactRun, providerPosture: { ...fixture.exactRun.providerPosture, capabilityIds: ["capability_runner_swapped"] } },
      { ...fixture.exactRun, providerPosture: { ...fixture.exactRun.providerPosture, selectionPolicyVersion: "runner-selection.swapped" } },
      { ...fixture.exactRun, providerPosture: { ...fixture.exactRun.providerPosture, readinessState: "requires-byte-transfer-approval" as never } }
    ]) {
      const blockedSelection = v2BlockedSelectionInput(fixture, exactRun);
      await expect(selected!(blockedSelection.input)).resolves.toEqual(expect.objectContaining({
        status: "blocked",
        code: "authority-resolution-required"
      }));
      expect(blockedSelection.effects).toEqual([]);
    }
    expect(fixture.invocationCount()).toBe(0);
  });

  it("rejects a missing production registration before provider invocation", async () => {
    const fixture = await runnerFixture();

    await expect(prepareSpecialistRun({
      ...fixture.input,
      productionPromptRegistrations: []
    } as never, "evidence-triage")).rejects.toThrow(/production specialist prompt registration/i);
    expect(fixture.invocationCount()).toBe(0);
  });

  it("rejects missing payload resolution and payload hash mismatches before provider invocation", async () => {
    const missingPayload = await runnerFixture({ contextPacks: runnerContextPackRegistry({ mode: "missing-payload" }) });
    await expect(prepareSpecialistRun(missingPayload.input, "evidence-triage")).rejects.toThrow(/missing-payload/i);
    expect(missingPayload.invocationCount()).toBe(0);

    const mismatchedPayload = await runnerFixture({ contextPacks: runnerContextPackRegistry({ mode: "payload-hash-mismatch" }) });
    await expect(prepareSpecialistRun(mismatchedPayload.input, "evidence-triage")).rejects.toThrow(/payload-hash-mismatch/i);
    expect(mismatchedPayload.invocationCount()).toBe(0);
  });

  it("rejects invalid and forged resolved payload envelopes before provider invocation", async () => {
    const invalidPayload = await runnerFixture({ contextPacks: runnerContextPackRegistry({ mode: "invalid-payload" }) });
    await expect(prepareSpecialistRun(invalidPayload.input, "evidence-triage")).rejects.toThrow(/payload-schema-mismatch/i);
    expect(invalidPayload.invocationCount()).toBe(0);

    const genuineRegistry = runnerContextPackRegistry();
    const forgedRegistry: ContextPackRegistry = {
      ...genuineRegistry,
      buildResolved: async (contextPackId) => ({
        ref: await genuineRegistry.build(contextPackId),
        payload: { forged: true }
      }) as never
    };
    const forgedPayload = await runnerFixture({ contextPacks: forgedRegistry });
    await expect(prepareSpecialistRun(forgedPayload.input, "evidence-triage")).rejects.toThrow(/unverified-resolved-context-pack/i);
    expect(forgedPayload.invocationCount()).toBe(0);
  });

  it("records no-associated-prr for non-PRR evidence triage and rejects a supplied generic artifact", async () => {
    const fixture = await runnerFixture();
    const prepared = await prepareSpecialistRun(fixture.input, "evidence-triage");
    expect(prepared.promptArtifact.manifest.omissions).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: "no-associated-prr", sourceRef: "prr-read-model.v1" })
    ]));
    expect(prepared.contextPackRefs.map((ref) => ref.contextPackId)).not.toContain("prr-read-model.v1");

    const genericArtifact = buildPromptArtifact({
      promptTemplateId: prepared.promptArtifact.manifest.promptTemplateId,
      promptTemplateVersion: prepared.promptArtifact.manifest.promptTemplateVersion,
      generatedAt: "2026-07-11T08:00:00.000Z",
      runType: "evidence-triage",
      safetyClass: "provider-approved",
      transferApprovalClass: "provider-byte-transfer",
      contextPackRefs: prepared.contextPackRefs,
      text: "Test-only prompt artifact.",
      safeSummary: "Test-only prompt artifact."
    });
    await expect(prepareSpecialistRun({ ...fixture.input, promptArtifact: genericArtifact }, "evidence-triage"))
      .rejects.toThrow(/consumed|mounted.*prompt.*readback/i);
    expect(fixture.invocationCount()).toBe(0);
  });

  it("rejects a prepared prompt reused for a different run before provider invocation", async () => {
    const original = await runnerFixture();
    const prepared = await prepareSpecialistRun(original.input, "evidence-triage");
    const current = await runnerFixture({
      runId: "run_runner_test_002",
      taskId: "task_runner_test_002",
      workspaceId: "ws_runner_test_002"
    });

    await expect(invokeSpecialistModel(current.input, prepared, "inv_runner_test_002"))
      .rejects.toThrow(/does not belong to the current invocation input/i);
    expect(current.invocationCount()).toBe(0);
  });

  it("passes a runner-issued production invocation proof to the runtime after approval checks", async () => {
    const fixture = await runnerFixture();
    const calls: unknown[] = [];
    const input: SpecialistRunnerBaseInput = {
      ...fixture.input,
      runtime: {
        async invokeModel(command) {
          calls.push(command);
          return {
            ok: true,
            invocationId: command.invocationId,
            outputArtifactHash: runnerHash,
            eventIds: [],
            outputText: "Safe specialist output."
          };
        }
      }
    };
    const prepared = await prepareSpecialistRun(input, "evidence-triage");

    await expect(invokeSpecialistModel(input, prepared, "inv_runner_proof_001")).resolves.toMatchObject({
      outputArtifactHash: runnerHash
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(expect.objectContaining({ productionInvocationProof: expect.anything() }));
  });
});

describe("durable specialist handoff runner lifecycle", () => {
  it("rejects a structural V2 authority substitute before it can append handoff evidence", async () => {
    const fixture = await durableHandoffFixture();
    await appendSpecialistFinalOutputStep(finalOutputInput(fixture));
    const eventCount = (await fixture.ledger.readAll()).length;

    await expect(recordAuthorityBoundSpecialistHandoff({
      ...recordInput(fixture),
      handoffAuthorityWitness: { schemaVersion: "agent-mounted-specialist-handoff-authority.v1" } as never
    })).rejects.toThrow(/authority/i);

    expect((await fixture.ledger.readAll())).toHaveLength(eventCount);
  });

  it("records only matching V2 manifest and compact-event authority bindings from one witness", async () => {
    const fixture = await durableHandoffFixture({ runId: "run_authority_v2_001", taskId: "task_authority_v2_001" });
    await appendSpecialistFinalOutputStep(finalOutputInput(fixture));
    const authorityBinding = {
      workspaceIdentityHash: runnerHash,
      mountGeneration: "mount_generation_001",
      ledgerStoreIdentity: "ledger_store_001",
      artifactStoreIdentity: "artifact_store_001",
      ledgerHighWaterEventId: fixture.runStartedEventId,
      policyHash: runnerHash,
      activeLocksHash: runnerHash
    } as const;
    const witness = issueMountedSpecialistHandoffAuthorityWitness({
      authorityBinding,
      revalidateCurrent: async () => undefined
    });

    const recorded = await recordAuthorityBoundSpecialistHandoff({ ...recordInput(fixture), handoffAuthorityWitness: witness });

    expect(recorded.manifest).toMatchObject({
      schemaVersion: "agent-specialist-handoff-manifest.v2",
      authorityBinding
    });
    expect(recorded.prepared.payload).toMatchObject({
      manifestSchemaVersion: "agent-specialist-handoff-manifest.v2",
      authorityBinding
    });
    expect(recorded.recorded.payload).toMatchObject({
      manifestSchemaVersion: "agent-specialist-handoff-manifest.v2",
      authorityBinding,
      preparedEventId: recorded.prepared.id
    });
  });

  it("drives the authority-bound production record through terminal, task status, and complete replayed readback", async () => {
    const fixture = await durableHandoffFixture({ runId: "run_authority_v2_complete_001", taskId: "task_authority_v2_complete_001" });
    await appendSpecialistFinalOutputStep(finalOutputInput(fixture));
    const authorityBinding = handoffAuthorityBindingFor(fixture);
    const witness = issueMountedSpecialistHandoffAuthorityWitness({
      authorityBinding,
      revalidateCurrent: async () => undefined
    });

    const recorded = await recordAuthorityBoundSpecialistHandoff({ ...recordInput(fixture), handoffAuthorityWitness: witness });

    expect(recorded.terminal).toMatchObject({
      type: "agent.specialist-run.completed",
      context: { causationId: recorded.recorded.id },
      payload: { runId: fixture.runId }
    });
    expect(recorded.taskStatus).toMatchObject({
      type: "agent.task.status.changed",
      context: { causationId: recorded.terminal.id },
      payload: { taskId: fixture.taskId, runId: fixture.runId, status: "completed" }
    });
    expect(recorded.readback).toMatchObject({
      outcome: "verified",
      handoffId: recorded.handoff.handoffId,
      taskId: fixture.taskId,
      runId: fixture.runId,
      finalOutputEventId: recorded.manifest.finalOutputEventId,
      preparedEventId: recorded.prepared.id,
      recordedEventId: recorded.recorded.id,
      terminalRunEventId: recorded.terminal.id,
      taskStatusEventId: recorded.taskStatus.id,
      authorityBinding
    });
  });

  it("keeps strict V2 results out of the V1 finalizer and stops a remounted authority before task-status append", async () => {
    expectTypeOf<RecordAuthorityBoundSpecialistHandoffResult>()
      .not.toMatchTypeOf<Parameters<typeof finalizeSpecialistRunAfterHandoff>[0]["recorded"]>();

    const fixture = await durableHandoffFixture({ runId: "run_authority_v2_stale_001", taskId: "task_authority_v2_stale_001" });
    await appendSpecialistFinalOutputStep(finalOutputInput(fixture));
    let stale = false;
    const ledger = new StaleAfterEventLedger(fixture.ledger, "agent.specialist-run.completed", () => { stale = true; });
    const witness = issueMountedSpecialistHandoffAuthorityWitness({
      authorityBinding: handoffAuthorityBindingFor(fixture),
      revalidateCurrent: async () => {
        if (stale) throw new Error("mounted authority is stale");
      }
    });

    await expect(recordAuthorityBoundSpecialistHandoff({
      ...recordInput(fixture),
      ledger,
      handoffAuthorityWitness: witness
    })).rejects.toThrow(/authority|stale/i);

    expect((await fixture.ledger.readStream(`agent_task_${fixture.taskId}`)).filter((event) =>
      event.type === "agent.task.status.changed" &&
      event.payload.runId === fixture.runId &&
      event.payload.status !== "running"
    )).toEqual([]);
  });

  it("uses last stream sequence plus one for expected append sequencing", async () => {
    const eventA = lifecycleEvent("evt_sequence_a", 1);
    const eventB = lifecycleEvent("evt_sequence_b", 1);

    expect(expectedNextSequenceFromStream([
      { ...eventA, sequence: 2 },
      { ...eventB, sequence: 7 }
    ])).toBe(8);
  });

  it("records final-output, prepared, recorded, and terminal run without task status", async () => {
    const fixture = await durableHandoffFixture();
    const finalOutput = await appendSpecialistFinalOutputStep(finalOutputInput(fixture));
    const recorded = await recordSpecialistHandoff(recordInput(fixture));
    const finalized = await finalizeSpecialistRunAfterHandoff({
      ledger: fixture.ledger,
      actor: fixture.actor,
      now: fixture.clock.now,
      recorded
    });

    expect(finalized.taskStatus).toBeUndefined();
    expect((await fixture.ledger.readAll()).map((event) => event.type)).toEqual(expect.arrayContaining([
      "agent.specialist-run.step.recorded",
      "agent.specialist-handoff.prepared",
      "agent.specialist-handoff.recorded",
      "agent.specialist-run.completed"
    ]));
    const lifecycleEvents = (await fixture.ledger.readAll()).filter((event) =>
      event.type === "agent.specialist-run.step.recorded" ||
      event.type === "agent.specialist-handoff.prepared" ||
      event.type === "agent.specialist-handoff.recorded" ||
      event.type === "agent.specialist-run.completed"
    );
    expect(lifecycleEvents.map((event) => event.type)).toEqual([
      "agent.specialist-run.step.recorded",
      "agent.specialist-handoff.prepared",
      "agent.specialist-handoff.recorded",
      "agent.specialist-run.completed"
    ]);
    expect((await fixture.ledger.readAll()).some((event) =>
      event.type === "agent.task.status.changed" &&
      event.payload.runId === fixture.runId &&
      event.payload.status !== "running"
    )).toBe(false);
    expect(finalOutput.payload.stepKind).toBe("final-output");
    expect(finalOutput.payload.handoffMaterialArtifactHash).toBe(hashBytes(canonicalMaterialBytes(fixture)));
  });

  it("binds context-pack artifact hashes into the final-output input hash set", async () => {
    const fixture = await durableHandoffFixture({ runId: "run_context_artifacts_001", taskId: "task_context_artifacts_001" });
    const contextArtifactBytes = Buffer.from("context artifact source");
    const contextArtifactHash = hashBytes(contextArtifactBytes);
    fixture.manifestStore.seed(contextArtifactHash, contextArtifactBytes);
    const finalOutput = await appendSpecialistFinalOutputStep(finalOutputInput(fixture, {
      contextPackRefs: [{
        ...handoffMaterialInput(fixture).contextPackRefs[0]!,
        artifactHashes: [contextArtifactHash]
      }]
    }));

    expect(finalOutput.payload.inputArtifactHashes).toContain(contextArtifactHash);
    await expect(recordSpecialistHandoff(recordInput(fixture))).resolves.toMatchObject({
      handoff: expect.objectContaining({ runId: fixture.runId })
    });
  });

  it("rejects handoff material tool requests that belong to another run", async () => {
    const fixture = await durableHandoffFixture({ runId: "run_foreign_tool_001", taskId: "task_foreign_tool_001" });
    await fixture.ledger.append({
      type: "agent.tool.requested",
      version: 1,
      streamId: "agent_tool_request_toolreq_foreign_handoff",
      context: lifecycleContext(fixture, fixture.runStartedEventId),
      payload: {
        toolRequestId: "toolreq_foreign_handoff",
        runId: "run_other_handoff_001",
        toolId: "provider-byte-transfer",
        toolVersion: "1",
        requestedBy: "agent_default",
        sideEffectClass: "external-byte-transfer",
        requiredApprovalClass: "provider-byte-transfer",
        previewHash: runnerHash,
        scope: "Foreign run provider preview.",
        estimatedEffect: "Would transfer bytes for a different run."
      }
    });

    await expect(appendSpecialistFinalOutputStep(finalOutputInput(fixture, {
      toolRequestIds: ["toolreq_foreign_handoff"]
    }))).rejects.toThrow(/provenance|ledger-bound/i);
    expect((await fixture.ledger.readStream(`agent_run_${fixture.runId}`)).filter((event) =>
      event.type === "agent.specialist-run.step.recorded"
    )).toHaveLength(0);
  });

  it("rejects nested handoff material tool refs missing from the top-level same-run request set", async () => {
    const fixture = await durableHandoffFixture({ runId: "run_nested_tool_001", taskId: "task_nested_tool_001" });
    await expect(appendSpecialistFinalOutputStep(finalOutputInput(fixture, {
      approvalRequirements: [{
        approvalClass: "human-review",
        reason: "Nested approval tool is required.",
        toolRequestId: "toolreq_nested_missing"
      }],
      nextSafeActions: [{
        actionId: "action_nested_tool",
        label: "Review nested tool",
        kind: "review",
        effect: "request-approval",
        toolRequestId: "toolreq_nested_missing"
      }]
    }))).rejects.toThrow(/tool request|provenance|ledger-bound/i);
    expect((await fixture.ledger.readStream(`agent_run_${fixture.runId}`)).filter((event) =>
      event.type === "agent.specialist-run.step.recorded"
    )).toHaveLength(0);

    const failed = await durableHandoffFixture({
      runId: "run_nested_failure_tool_001",
      taskId: "task_nested_failure_tool_001",
      status: "failed"
    });
    await expect(appendSpecialistFinalOutputStep(finalOutputInput(failed, {
      failure: {
        category: "model-output-invalid",
        code: "model-output-invalid",
        safeSummary: "Nested failure tool request is missing.",
        retryable: true,
        toolRequestId: "toolreq_nested_failure_missing"
      }
    }))).rejects.toThrow(/tool request|provenance|ledger-bound/i);
  });

  it("rejects missing or hash-mismatched referenced artifacts before final-output append", async () => {
    const missing = await durableHandoffFixture({
      runId: "run_missing_handoff_artifact_001",
      taskId: "task_missing_handoff_artifact_001",
      seedReferencedArtifacts: false
    });
    await expect(appendSpecialistFinalOutputStep(finalOutputInput(missing)))
      .rejects.toThrow(/referenced artifact|content-addressed/i);
    expect((await missing.ledger.readStream(`agent_run_${missing.runId}`)).filter((event) =>
      event.type === "agent.specialist-run.step.recorded"
    )).toHaveLength(0);

    const mismatched = await durableHandoffFixture({
      runId: "run_mismatched_handoff_artifact_001",
      taskId: "task_mismatched_handoff_artifact_001",
      seedReferencedArtifacts: false
    });
    mismatched.manifestStore.seed(mismatched.outputArtifact.artifactHash, Buffer.from("wrong output bytes"));
    await expect(appendSpecialistFinalOutputStep(finalOutputInput(mismatched)))
      .rejects.toThrow(/referenced artifact|content-addressed/i);
  });

  it("reuses an exact recorded conflict with the original verifiedAt", async () => {
    const fixture = await durableHandoffFixture({ clockValues: ["2026-07-10T15:00:00.000Z", "2026-07-10T16:00:00.000Z"] });
    await appendSpecialistFinalOutputStep(finalOutputInput(fixture));
    const first = await recordSpecialistHandoff(recordInput(fixture));
    const result = await recordSpecialistHandoff(recordInput(fixture));

    expect(result.recorded.id).toBe(first.recorded.id);
    expect(result.recorded.payload.verifiedAt).toBe("2026-07-10T15:00:00.000Z");
    expect(fixture.clock.calls).toBe(1);
  });

  it("rejects duplicate run identities before persisting a handoff manifest", async () => {
    const fixture = await durableHandoffFixture({ runId: "run_duplicate_record_identity_001", taskId: "task_duplicate_record_identity_001" });
    await appendSpecialistFinalOutputStep(finalOutputInput(fixture));
    await fixture.ledger.append({
      type: "agent.specialist-run.started",
      version: 1,
      streamId: `agent_run_${fixture.runId}`,
      context: lifecycleContext(fixture, fixture.runStartedEventId),
      payload: {
        runId: fixture.runId,
        residentAgentId: "agent_default",
        runType: "evidence-triage",
        startedBy: fixture.actor.id,
        taskId: "task_duplicate_record_identity_other"
      }
    });

    await expect(recordSpecialistHandoff(recordInput(fixture))).rejects.toThrow(/one ledger-bound run identity/i);
    expect((await fixture.ledger.readStream(`agent_run_${fixture.runId}`)).some((event) =>
      event.type === "agent.specialist-handoff.prepared" ||
      event.type === "agent.specialist-handoff.recorded"
    )).toBe(false);
  });

  it("rejects restart recording from a final-output with forged idempotency", async () => {
    const fixture = await durableHandoffFixture({
      runId: "run_forged_final_output_idempotency_001",
      taskId: "task_forged_final_output_idempotency_001"
    });
    const materialBytes = canonicalMaterialBytes(fixture);
    const materialHash = hashBytes(materialBytes);
    fixture.manifestStore.seed(materialHash, materialBytes);
    await fixture.ledger.append({
      type: "agent.specialist-run.step.recorded",
      version: 1,
      streamId: `agent_run_${fixture.runId}`,
      context: lifecycleContext(fixture, fixture.runStartedEventId),
      payload: {
        runId: fixture.runId,
        stepId: `step_${fixture.runId}_final_output`,
        summary: "Forged final-output idempotency should not be recordable.",
        stepKind: "final-output",
        stepSchemaId: "evidence-triage-handoff.v1",
        idempotencyKey: "specialist-final-output:forged",
        handoffMaterialArtifactHash: materialHash,
        inputArtifactHashes: [fixture.contextPackContentHash, fixture.promptArtifactHash],
        outputArtifactHashes: [fixture.outputArtifact.artifactHash]
      }
    });

    await expect(recordSpecialistHandoff(recordInput(fixture))).rejects.toThrow(/idempotency|final-output/i);
    expect((await fixture.ledger.readStream(`agent_run_${fixture.runId}`)).some((event) =>
      event.type === "agent.specialist-handoff.prepared" ||
      event.type === "agent.specialist-handoff.recorded"
    )).toBe(false);
  });

  it("stops on conflicting final-output, prepared, recorded, or terminal run events", async () => {
    const fixture = await durableHandoffFixture();
    await appendSpecialistFinalOutputStep(finalOutputInput(fixture));
    const conflictingOutputBytes = Buffer.from("conflicting final output");
    const conflictingOutputHash = hashBytes(conflictingOutputBytes);
    fixture.manifestStore.seed(conflictingOutputHash, conflictingOutputBytes);
    await expect(appendSpecialistFinalOutputStep({
      ...finalOutputInput(fixture, { outputArtifacts: [{ ...fixture.outputArtifact, artifactHash: conflictingOutputHash }] })
    })).rejects.toThrow(/conflicting final-output/i);

    await fixture.ledger.append({
      ...preparedAppendable(fixture, hashBytes(Buffer.from("conflicting manifest"))),
      context: lifecycleContext(fixture, "evt_final_conflict")
    });
    await expect(recordSpecialistHandoff(recordInput(fixture))).rejects.toThrow(/conflicting prepared/i);

    const recordedFixture = await durableHandoffFixture({ runId: "run_conflicting_recorded_001", taskId: "task_conflicting_recorded_001" });
    await appendSpecialistFinalOutputStep(finalOutputInput(recordedFixture));
    const recorded = await recordSpecialistHandoff(recordInput(recordedFixture));
    await recordedFixture.ledger.append({
      ...recorded.recorded,
      id: "evt_handoff_recorded_conflict",
      payload: { ...recorded.recorded.payload, verifiedAt: "2026-07-10T15:30:00.000Z" },
      sequence: undefined
    } as never);
    await expect(finalizeSpecialistRunAfterHandoff({
      ledger: recordedFixture.ledger,
      actor: recordedFixture.actor,
      now: recordedFixture.clock.now,
      recorded
    })).rejects.toThrow(/conflicting[- ]recorded/i);

    const terminalFixture = await durableHandoffFixture({ runId: "run_conflicting_terminal_001", taskId: "task_conflicting_terminal_001" });
    await appendSpecialistFinalOutputStep(finalOutputInput(terminalFixture));
    const terminalRecorded = await recordSpecialistHandoff(recordInput(terminalFixture));
    await appendSpecialistCompletionForTest(terminalFixture, terminalRecorded.recorded.id);
    await expect(finalizeSpecialistRunAfterHandoff({
      ledger: terminalFixture.ledger,
      actor: terminalFixture.actor,
      now: terminalFixture.clock.now,
      recorded: terminalRecorded
    })).rejects.toThrow(/terminal/i);
  });

  it("does not append terminal success when manifest persistence fails after final-output", async () => {
    const fixture = await durableHandoffFixture({ manifestStore: new FailAfterMaterialStore() });
    await appendSpecialistFinalOutputStep(finalOutputInput(fixture));

    await expect(recordSpecialistHandoff(recordInput(fixture))).rejects.toThrow(/manifest persistence unavailable/i);
    expect((await fixture.ledger.readAll()).some((event) => event.type === "agent.specialist-run.completed")).toBe(false);
  });

  it("allows pre-output infrastructure failure to terminally fail without a handoff", async () => {
    const fixture = await durableHandoffFixture();

    await appendSpecialistFailure({
      ledger: fixture.ledger,
      actor: fixture.actor,
      now: fixture.clock.now,
      runId: fixture.runId,
      category: "provider-unavailable",
      message: "Provider infrastructure was unavailable before output persistence.",
      retryable: true,
      allowedActions: ["retry-provider"]
    });
    expect((await fixture.ledger.readAll()).map((event) => event.type)).not.toContain("agent.specialist-handoff.recorded");
  });

  it("requires a verified failed handoff before terminal run failure for a specialist failed result", async () => {
    const fixture = await durableHandoffFixture({ status: "failed" });
    await appendSpecialistFinalOutputStep(finalOutputInput(fixture));
    await expect(finalizeSpecialistRunAfterHandoff({
      ledger: fixture.ledger,
      actor: fixture.actor,
      now: fixture.clock.now,
      recorded: { recorded: undefined } as never
    })).rejects.toThrow(/verified failed handoff/i);

    const recorded = await recordSpecialistHandoff(recordInput(fixture));
    const finalized = await finalizeSpecialistRunAfterHandoff({ ledger: fixture.ledger, actor: fixture.actor, now: fixture.clock.now, recorded });
    expect(finalized.terminal.type).toBe("agent.specialist-run.failed");
  });

  it("maps ready-for-review, waiting-for-approval, blocked, and failed handoffs to exact run terminals", async () => {
    const expected = {
      "ready-for-review": "agent.specialist-run.completed",
      "waiting-for-approval": "agent.specialist-run.completed",
      blocked: "agent.specialist-run.completed",
      failed: "agent.specialist-run.failed"
    } as const;
    for (const [status, terminalType] of Object.entries(expected)) {
      const fixture = await durableHandoffFixture({
        runId: `run_transition_${status.replaceAll("-", "_")}`,
        taskId: `task_transition_${status.replaceAll("-", "_")}`,
        status: status as keyof typeof expected
      });
      await appendSpecialistFinalOutputStep(finalOutputInput(fixture));
      const recorded = await recordSpecialistHandoff(recordInput(fixture));
      const finalized = await finalizeSpecialistRunAfterHandoff({ ledger: fixture.ledger, actor: fixture.actor, now: fixture.clock.now, recorded });
      expect(finalized.terminal.type).toBe(terminalType);
      expect(finalized.taskStatus).toBeUndefined();
    }
  });

  it("rejects a forged recorded result whose canonical manifest or handoff differs from ledger readback", async () => {
    const fixture = await durableHandoffFixture();
    await appendSpecialistFinalOutputStep(finalOutputInput(fixture));
    const recorded = await recordSpecialistHandoff(recordInput(fixture));
    const forged = {
      ...recorded,
      manifest: { ...recorded.manifest, safeSummary: "Forged durable handoff summary." },
      handoff: { ...recorded.handoff, safeSummary: "Forged durable handoff summary." }
    };

    await expect(finalizeSpecialistRunAfterHandoff({
      ledger: fixture.ledger,
      actor: fixture.actor,
      now: fixture.clock.now,
      recorded: forged
    })).rejects.toThrow(/ledger readback|canonical/i);
  });

  it("snapshots handoff values before awaits and rejects accessor-backed arrays and objects without invoking getters", async () => {
    const fixture = await durableHandoffFixture();
    const materialInput = handoffMaterialInput(fixture);
    const outputArtifacts = materialInput.outputArtifacts.map((item) => ({ ...item }));
    const mutatingLedger = new MutatingReadLedger(fixture.ledger, () => { outputArtifacts[0]!.safeSummary = "Late mutation."; });

    const finalOutput = await appendSpecialistFinalOutputStep({
      ...finalOutputInput(fixture),
      ledger: mutatingLedger,
      handoffMaterial: { ...buildSpecialistHandoffMaterial(materialInput), outputArtifacts } as never
    });
    expect(finalOutput.payload.outputArtifactHashes).toEqual([fixture.outputArtifact.artifactHash]);
    const recorded = await recordSpecialistHandoff(recordInput(fixture));
    expect(recorded.manifest.outputArtifacts[0]?.safeSummary).toBe(fixture.outputArtifact.safeSummary);

    let getterCalls = 0;
    const accessorArray: unknown[] = [];
    Object.defineProperty(accessorArray, "0", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return runnerHash;
      }
    });
    accessorArray.length = 1;
    await expect(appendSpecialistFinalOutputStep({
      ...finalOutputInput(await durableHandoffFixture({ runId: "run_accessor_handoff_001", taskId: "task_accessor_handoff_001" })),
      handoffMaterial: { ...buildSpecialistHandoffMaterial(handoffMaterialInput(await durableHandoffFixture({ runId: "run_accessor_handoff_002", taskId: "task_accessor_handoff_002" }))), contextPackRefs: accessorArray } as never
    })).rejects.toThrow(/data properties/i);
    expect(getterCalls).toBe(0);

    const objectFixture = await durableHandoffFixture({ runId: "run_accessor_object_001", taskId: "task_accessor_object_001" });
    let objectGetterCalls = 0;
    const accessorArtifact = { ...objectFixture.outputArtifact } as Record<string, unknown>;
    Object.defineProperty(accessorArtifact, "safeSummary", {
      enumerable: true,
      get() {
        objectGetterCalls += 1;
        return objectFixture.outputArtifact.safeSummary;
      }
    });
    await expect(appendSpecialistFinalOutputStep({
      ...finalOutputInput(objectFixture),
      handoffMaterial: { ...buildSpecialistHandoffMaterial(handoffMaterialInput(objectFixture)), outputArtifacts: [accessorArtifact] } as never
    })).rejects.toThrow(/data properties|DTO-safe/i);
    expect(objectGetterCalls).toBe(0);
  });

  it("derives final-output schema authority before writing and records ontology bootstrap through the same handoff lifecycle", async () => {
    const fixture = await durableHandoffFixture();
    const appended = await appendSpecialistFinalOutputStep({
      ...finalOutputInput(fixture),
      stepSchemaId: "caller-controlled-schema.v1"
    } as never);
    expect(appended.payload.stepSchemaId).toBe("evidence-triage-handoff.v1");

    const bootstrap = await durableHandoffFixture({
      runId: "run_ontology_authority_001",
      taskId: "task_ontology_authority_001",
      runType: "ontology-bootstrap"
    });
    const bootstrapFinalOutput = await appendSpecialistFinalOutputStep(finalOutputInput(bootstrap));
    expect(bootstrapFinalOutput.payload.stepSchemaId).toBe("ontology-bootstrap-handoff.v1");

    const recorded = await recordSpecialistHandoff(recordInput(bootstrap));
    await finalizeSpecialistRunAfterHandoff({
      ledger: bootstrap.ledger,
      actor: bootstrap.actor,
      now: bootstrap.clock.now,
      recorded
    });
    expect((await bootstrap.ledger.readStream(`agent_run_${bootstrap.runId}`)).map((event) => event.type)).toEqual(expect.arrayContaining([
      "agent.specialist-run.step.recorded",
      "agent.specialist-handoff.prepared",
      "agent.specialist-handoff.recorded",
      "agent.specialist-run.completed"
    ]));
  });

  it("rereads and reuses an exact final-output event after an append-time concurrency conflict", async () => {
    const fixture = await durableHandoffFixture();
    const racingLedger = new ExactAppendRaceLedger(fixture.ledger);

    const finalOutput = await appendSpecialistFinalOutputStep({ ...finalOutputInput(fixture), ledger: racingLedger });
    expect(finalOutput.payload.stepKind).toBe("final-output");
    expect((await fixture.ledger.readStream(`agent_run_${fixture.runId}`)).filter((event) => event.type === "agent.specialist-run.step.recorded")).toHaveLength(1);
  });

  it("fails closed when a final-output race reread contains an exact event and a conflicting companion", async () => {
    const fixture = await durableHandoffFixture();
    const racingLedger = new CompanionRaceLedger(fixture.ledger, (event) => ({
      ...event,
      payload: { ...(event.payload as any), outputArtifactHashes: [hashBytes(Buffer.from("conflicting race output"))] } as any
    }));

    await expect(appendSpecialistFinalOutputStep({ ...finalOutputInput(fixture), ledger: racingLedger }))
      .rejects.toThrow(/conflicting final-output/i);
  });

  it("fails closed when final-output retry or race sees a different material companion", async () => {
    const fixture = await durableHandoffFixture({
      runId: "run_final_output_material_conflict_001",
      taskId: "task_final_output_material_conflict_001"
    });
    const exact = await appendSpecialistFinalOutputStep(finalOutputInput(fixture));
    await fixture.ledger.append({
      ...exact,
      id: "evt_final_output_material_conflict",
      payload: {
        ...exact.payload,
        idempotencyKey: `${exact.payload.idempotencyKey}:conflicting-material`,
        handoffMaterialArtifactHash: hashBytes(Buffer.from("different handoff material"))
      },
      sequence: undefined
    } as never);
    await expect(appendSpecialistFinalOutputStep(finalOutputInput(fixture)))
      .rejects.toThrow(/conflicting final-output/i);

    const raceFixture = await durableHandoffFixture({
      runId: "run_final_output_material_race_001",
      taskId: "task_final_output_material_race_001"
    });
    const racingLedger = new CompanionRaceLedger(raceFixture.ledger, (event) => ({
      ...event,
      payload: {
        ...(event.payload as any),
        idempotencyKey: `${(event.payload as any).idempotencyKey}:conflicting-material`,
        handoffMaterialArtifactHash: hashBytes(Buffer.from("raced different handoff material"))
      } as any
    }));
    await expect(appendSpecialistFinalOutputStep({ ...finalOutputInput(raceFixture), ledger: racingLedger }))
      .rejects.toThrow(/conflicting final-output/i);
  });

  it("fails closed when supersession prior final-output companion has a forged idempotency", async () => {
    const fixture = await durableHandoffFixture({
      runId: "run_supersession_prior_idempotency_001",
      taskId: "task_supersession_prior_idempotency_001"
    });
    const firstFinalOutput = await appendSpecialistFinalOutputStep(finalOutputInput(fixture));
    const first = await recordSpecialistHandoff(recordInput(fixture));
    await fixture.ledger.append({
      ...firstFinalOutput,
      id: "evt_forged_prior_final_output_idempotency",
      payload: {
        ...firstFinalOutput.payload,
        idempotencyKey: `${firstFinalOutput.payload.idempotencyKey}:forged`
      },
      sequence: undefined
    } as never);

    await expect(appendSpecialistFinalOutputStep(finalOutputInput(fixture, {
      safeSummary: "Corrected durable specialist handoff is available for review.",
      supersedesHandoffId: first.handoff.handoffId,
      supersedesEventId: first.recorded.id
    }))).rejects.toThrow(/conflicting final-output/i);
  });

  it("fails closed when a terminal race reread contains an exact event and a conflicting companion", async () => {
    const fixture = await durableHandoffFixture();
    await appendSpecialistFinalOutputStep(finalOutputInput(fixture));
    const recorded = await recordSpecialistHandoff(recordInput(fixture));
    const racingLedger = new CompanionRaceLedger(fixture.ledger, (event) => ({
      ...event,
      payload: { ...(event.payload as any), summary: "Conflicting terminal race summary." } as any
    }));

    await expect(finalizeSpecialistRunAfterHandoff({ ledger: racingLedger, actor: fixture.actor, now: fixture.clock.now, recorded }))
      .rejects.toThrow(/conflicting terminal/i);
  });

  it("fails closed on prepared and recorded exact-plus-conflicting race companions", async () => {
    const preparedFixture = await durableHandoffFixture({ runId: "run_prepared_race_001", taskId: "task_prepared_race_001" });
    await appendSpecialistFinalOutputStep(finalOutputInput(preparedFixture));
    await expect(recordSpecialistHandoff({
      ...recordInput(preparedFixture),
      ledger: new TargetedCompanionRaceLedger(preparedFixture.ledger, "agent.specialist-handoff.prepared", (event) => ({
        ...event, payload: { ...(event.payload as any), safeSummary: "Conflicting prepared race." } as any
      }))
    })).rejects.toThrow(/prepared/i);

    const recordedFixture = await durableHandoffFixture({ runId: "run_recorded_race_001", taskId: "task_recorded_race_001" });
    await appendSpecialistFinalOutputStep(finalOutputInput(recordedFixture));
    await expect(recordSpecialistHandoff({
      ...recordInput(recordedFixture),
      ledger: new TargetedCompanionRaceLedger(recordedFixture.ledger, "agent.specialist-handoff.recorded", (event) => ({
        ...event, payload: { ...(event.payload as any), verifiedAt: "2026-07-10T15:30:00.000Z" } as any
      }))
    })).rejects.toThrow(/conflicting[- ]recorded/i);
  });

  it("does not treat existing task terminal statuses as runner finalization authority", async () => {
    const fixture = await durableHandoffFixture();
    await appendSpecialistFinalOutputStep(finalOutputInput(fixture));
    const recorded = await recordSpecialistHandoff(recordInput(fixture));
    await fixture.ledger.append({
      type: "agent.task.status.changed",
      version: 1,
      streamId: `agent_task_${fixture.taskId}`,
      context: lifecycleContext(fixture, "evt_unverified_task_status"),
      payload: {
        taskId: fixture.taskId,
        status: "blocked",
        changedBy: fixture.actor.id,
        reason: "Preexisting task status does not authorize runner finalization.",
        runId: fixture.runId
      }
    });

    const finalized = await finalizeSpecialistRunAfterHandoff({
      ledger: fixture.ledger,
      actor: fixture.actor,
      now: fixture.clock.now,
      recorded
    });

    expect(finalized.taskStatus).toBeUndefined();
    expect(finalized.terminal.context.causationId).toBe(recorded.recorded.id);
  });

  it("appends a revision-two supersession with prepared causation bound to the prior recorded handoff", async () => {
    const fixture = await durableHandoffFixture({
      clockValues: [
        "2026-07-10T15:00:00.000Z",
        "2026-07-10T16:00:00.000Z",
        "2026-07-10T17:00:00.000Z"
      ]
    });
    await appendSpecialistFinalOutputStep(finalOutputInput(fixture));
    const first = await recordSpecialistHandoff(recordInput(fixture));
    await appendSpecialistFinalOutputStep(finalOutputInput(fixture, {
      safeSummary: "Corrected durable specialist handoff is available for review.",
      supersedesHandoffId: first.handoff.handoffId,
      supersedesEventId: first.recorded.id
    }));
    const second = await recordSpecialistHandoff(recordInput(fixture));
    const retry = await recordSpecialistHandoff(recordInput(fixture));

    expect(second.handoff.handoffId).not.toBe(first.handoff.handoffId);
    expect(second.prepared.context.causationId).toBe(first.recorded.id);
    expect(second.recorded.context.causationId).toBe(second.prepared.id);
    expect(retry.handoff.handoffRevision).toBe(2);
    expect(retry.recorded.id).toBe(second.recorded.id);
    expect(retry.recorded.payload.verifiedAt).toBe(second.recorded.payload.verifiedAt);
    expect(fixture.clock.calls).toBe(2);
  });

  it("rejects supersession material that changes non-presentation anchors", async () => {
    const fixture = await durableHandoffFixture({ runId: "run_supersession_anchor_001", taskId: "task_supersession_anchor_001" });
    await appendSpecialistFinalOutputStep(finalOutputInput(fixture));
    const first = await recordSpecialistHandoff(recordInput(fixture));

    await expect(appendSpecialistFinalOutputStep(finalOutputInput(fixture, {
      safeSummary: "Corrected durable specialist handoff is available for review.",
      approvalRequirements: [{ approvalClass: "ledger-review", reason: "Changed approval contract." }],
      supersedesHandoffId: first.handoff.handoffId,
      supersedesEventId: first.recorded.id
    }))).rejects.toThrow(/supersession.*anchor/i);
    expect((await fixture.ledger.readStream(`agent_run_${fixture.runId}`)).filter((event) =>
      event.type === "agent.specialist-run.step.recorded"
    )).toHaveLength(1);
  });
});

type DurableHandoffStatus = "ready-for-review" | "waiting-for-approval" | "blocked" | "failed";

interface DurableHandoffFixture {
  readonly ledger: InMemoryEventLedger;
  readonly actor: { readonly id: string; readonly kind: "agent"; readonly label: string };
  readonly clock: { readonly now: () => string; readonly calls: number };
  readonly runId: string;
  readonly taskId: string;
  readonly status: DurableHandoffStatus;
  readonly runStartedEventId: string;
  readonly manifestStore: MemoryManifestStore;
  readonly contextPackContentHash: `sha256:${string}`;
  readonly promptArtifactHash: `sha256:${string}`;
  readonly outputArtifact: {
    readonly artifactId: string;
    readonly artifactKind: string;
    readonly schemaId: string;
    readonly artifactHash: `sha256:${string}`;
    readonly safeSummary: string;
  };
}

async function durableHandoffFixture(options: {
  readonly runId?: string;
  readonly taskId?: string;
  readonly runType?: "evidence-triage" | "ontology-bootstrap";
  readonly status?: DurableHandoffStatus;
  readonly clockValues?: readonly string[];
  readonly manifestStore?: MemoryManifestStore;
  readonly seedReferencedArtifacts?: boolean;
} = {}): Promise<DurableHandoffFixture> {
  const ledger = new InMemoryEventLedger();
  const actor = { id: "actor_durable_handoff", kind: "agent" as const, label: "Durable Handoff Test" };
  const runId = options.runId ?? "run_durable_handoff_001";
  const taskId = options.taskId ?? "task_durable_handoff_001";
  const status = options.status ?? "ready-for-review";
  const clock = steppedClock(options.clockValues ?? ["2026-07-10T15:00:00.000Z"]);
  const lifecycle = createAgentRuntime({ ledger, actor, now: () => "2026-07-10T14:00:00.000Z", providers: [] });
  await lifecycle.initializeDefaultIdentity({ workspaceId: "ws_durable_handoff" });
  await lifecycle.createTask({ taskId, title: "Record durable handoff", requestedBy: actor.id, priority: "normal" });
  const started = await lifecycle.startRun({
    runId,
    taskId,
    runType: options.runType ?? "evidence-triage",
    scope: { kind: "workspace", refs: ["ws_durable_handoff"] }
  });
  if (!started.ok) throw new Error("Unable to start durable handoff fixture run.");
  const manifestStore = options.manifestStore ?? new MemoryManifestStore();
  const contextBytes = Buffer.from(`durable context pack ${runId}`);
  const promptBytes = Buffer.from(`durable prompt artifact ${runId}`);
  const outputBytes = Buffer.from(`durable output ${runId}`);
  const contextPackContentHash = hashBytes(contextBytes);
  const promptArtifactHash = hashBytes(promptBytes);
  const outputArtifactHash = hashBytes(outputBytes);
  if (options.seedReferencedArtifacts !== false) {
    manifestStore.seed(contextPackContentHash, contextBytes);
    manifestStore.seed(promptArtifactHash, promptBytes);
    manifestStore.seed(outputArtifactHash, outputBytes);
  }
  return {
    ledger,
    actor,
    clock,
    runId,
    taskId,
    status,
    runStartedEventId: started.eventIds[0]!,
    manifestStore,
    contextPackContentHash,
    promptArtifactHash,
    outputArtifact: {
      artifactId: `artifact_${runId}`,
      artifactKind: "specialist-output",
      schemaId: "evidence-triage-output.v1",
      artifactHash: outputArtifactHash,
      safeSummary: "Durable specialist output is available for review."
    }
  };
}

function finalOutputInput(fixture: DurableHandoffFixture, materialPatch: Record<string, unknown> = {}) {
  const material = buildSpecialistHandoffMaterial({
    ...handoffMaterialInput(fixture),
    ...materialPatch
  } as never);
  return {
    ledger: fixture.ledger,
    materialStore: fixture.manifestStore,
    actor: fixture.actor,
    now: () => "2026-07-10T14:30:00.000Z",
    runId: fixture.runId,
    taskId: fixture.taskId,
    handoffMaterial: material
  };
}

function recordInput(fixture: DurableHandoffFixture) {
  return {
    ledger: fixture.ledger,
    manifestStore: fixture.manifestStore,
    actor: fixture.actor,
    now: fixture.clock.now,
    runId: fixture.runId,
    taskId: fixture.taskId,
  };
}

function handoffAuthorityBindingFor(fixture: DurableHandoffFixture) {
  return {
    workspaceIdentityHash: runnerHash,
    mountGeneration: "mount_generation_001",
    ledgerStoreIdentity: "ledger_store_001",
    artifactStoreIdentity: "artifact_store_001",
    ledgerHighWaterEventId: fixture.runStartedEventId,
    policyHash: runnerHash,
    activeLocksHash: runnerHash
  } as const;
}

function handoffMaterialInput(fixture: DurableHandoffFixture) {
  return {
    status: fixture.status,
    safeSummary: fixture.status === "failed"
      ? "Specialist output failed validation and is available for retry review."
      : "Durable specialist handoff is available for review.",
    contextPackRefs: [{
      contextPackId: "durable-handoff-test-pack.v1",
      version: 1,
      contentHash: fixture.contextPackContentHash,
      sizeBytes: 1,
      generatedAt: "2026-07-10T14:00:00.000Z",
      safeSummary: "Durable handoff test context.",
      provenanceRefs: [fixture.runStartedEventId],
      sourceEventIds: [fixture.runStartedEventId]
    }],
    promptArtifactHash: fixture.promptArtifactHash,
    outputArtifacts: [fixture.outputArtifact],
    toolRequestIds: [],
    approvalRequirements: fixture.status === "waiting-for-approval"
      ? [{ approvalClass: "human-review" as const, reason: "Human review is required before continuation." }]
      : [],
    nextSafeActions: [{
      actionId: "review-durable-handoff",
      label: "Review durable handoff",
      kind: "review" as const,
      effect: fixture.status === "waiting-for-approval" ? "request-approval" as const : "none" as const,
      artifactId: fixture.outputArtifact.artifactId
    }],
    ...(fixture.status === "failed" ? {
      failure: {
        category: "model-output-invalid" as const,
        code: "model-output-invalid",
        safeSummary: "Specialist output failed validation and can be retried.",
        retryable: true
      }
    } : {}),
    sourceEventIds: [fixture.runStartedEventId],
    relatedEventIds: [fixture.runStartedEventId]
  };
}

function canonicalMaterialBytes(fixture: DurableHandoffFixture): Buffer {
  return serializeSpecialistLocalArtifact(buildSpecialistHandoffMaterial(handoffMaterialInput(fixture)));
}

function lifecycleEvent(id: string, sequence: number): KnowledgeEvent {
  return {
    id,
    type: "agent.specialist-run.step.recorded",
    version: 1,
    streamId: "agent_run_sequence_fixture",
    sequence,
    context: {
      actor: { id: "actor_durable_handoff", kind: "agent", label: "Durable Handoff Test" },
      occurredAt: "2026-07-10T14:00:00.000Z",
      correlationId: "corr_sequence_fixture",
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", agent: "0.1.0" }
    },
    payload: {
      runId: "run_sequence_fixture",
      stepId: "step_sequence_fixture",
      summary: "Sequence fixture specialist step."
    }
  } as KnowledgeEvent;
}

function lifecycleContext(fixture: DurableHandoffFixture, causationId: string) {
  return {
    actor: fixture.actor,
    occurredAt: "2026-07-10T15:00:00.000Z",
    causationId,
    correlationId: `corr_${fixture.runId}_handoff`,
    coreVersion: "0.1.0",
    packVersions: { core: "0.1.0", agent: "0.1.0" }
  };
}

function preparedAppendable(fixture: DurableHandoffFixture, handoffManifestHash: `sha256:${string}`) {
  const finalOutputEventId = "evt_final_conflict";
  const handoffId = computeSpecialistHandoffId({
    runId: fixture.runId,
    taskId: fixture.taskId,
    runType: "evidence-triage",
    status: fixture.status,
    finalOutputEventId,
    outputArtifactHashes: [fixture.outputArtifact.artifactHash],
    handoffRevision: 1
  });
  return {
    type: "agent.specialist-handoff.prepared" as const,
    version: 1 as const,
    streamId: `agent_run_${fixture.runId}`,
    context: lifecycleContext(fixture, finalOutputEventId),
    payload: {
      handoffId,
      handoffRevision: 1,
      idempotencyKey: `specialist-handoff:${fixture.runId}:${fixture.taskId}:evidence-triage:${fixture.status}:${handoffManifestHash}`,
      handoffManifestHash,
      handoffDtoHash: runnerHash,
      handoffMaterialArtifactHash: runnerHash,
      runId: fixture.runId,
      taskId: fixture.taskId,
      runType: "evidence-triage" as const,
      residentAgentId: "agent_default" as const,
      status: fixture.status,
      safeSummary: "Conflicting prepared handoff binding.",
      finalOutputStepId: `step_${fixture.runId}_final_output`,
      finalOutputEventId,
      contextPackHashes: [runnerHash],
      promptArtifactHash: runnerHash,
      outputArtifactHashes: [fixture.outputArtifact.artifactHash],
      toolRequestIds: [],
      sourceEventIds: ["evt_source_001"],
      relatedEventIds: ["evt_source_001"]
    }
  };
}

async function appendSpecialistCompletionForTest(
  fixture: DurableHandoffFixture,
  causationId: string,
  summary = "Terminal run was appended for conflict testing."
): Promise<KnowledgeEvent> {
  return await fixture.ledger.append({
    type: "agent.specialist-run.completed",
    version: 1,
    streamId: `agent_run_${fixture.runId}`,
    context: lifecycleContext(fixture, causationId),
    payload: {
      runId: fixture.runId,
      completedAt: "2026-07-10T15:00:00.000Z",
      outputArtifactHashes: [fixture.outputArtifact.artifactHash],
      relatedEventIds: [causationId],
      summary
    }
  });
}

function taskStatusAppendable(
  fixture: DurableHandoffFixture,
  status: "blocked" | "completed" | "failed" | "waiting-for-approval",
  causationId: string
) {
  return {
    type: "agent.task.status.changed" as const,
    version: 1 as const,
    streamId: `agent_task_${fixture.taskId}`,
    context: lifecycleContext(fixture, causationId),
    payload: {
      taskId: fixture.taskId,
      status,
      changedBy: fixture.actor.id,
      reason: `Task status moved to ${status} for conflict testing.`,
      runId: fixture.runId
    }
  };
}

function steppedClock(values: readonly string[]) {
  let calls = 0;
  return {
    now: () => values[calls++] ?? values.at(-1)!,
    get calls() { return calls; }
  };
}

class MutatingReadLedger implements EventLedger {
  constructor(
    private readonly delegate: EventLedger,
    private readonly mutate: () => void
  ) {}

  async append(event: Parameters<EventLedger["append"]>[0], options?: Parameters<EventLedger["append"]>[1]) {
    return await this.delegate.append(event, options);
  }

  async readStream(streamId: string) {
    const events = await this.delegate.readStream(streamId);
    this.mutate();
    return events;
  }

  async readAll() {
    return await this.delegate.readAll();
  }
}

class StaleAfterEventLedger implements EventLedger {
  constructor(
    private readonly delegate: EventLedger,
    private readonly eventType: KnowledgeEvent["type"],
    private readonly markStale: () => void
  ) {}

  async append(event: Parameters<EventLedger["append"]>[0], options?: Parameters<EventLedger["append"]>[1]) {
    const appended = await this.delegate.append(event, options);
    if (event.type === this.eventType) this.markStale();
    return appended;
  }

  async readStream(streamId: string) { return await this.delegate.readStream(streamId); }
  async readAll() { return await this.delegate.readAll(); }
}

class ExactAppendRaceLedger implements EventLedger {
  private injected = false;

  constructor(private readonly delegate: EventLedger) {}

  async append(event: Parameters<EventLedger["append"]>[0], options?: Parameters<EventLedger["append"]>[1]) {
    if (!this.injected) {
      this.injected = true;
      await this.delegate.append(event);
      throw new ConcurrencyConflictError("Injected exact append race.");
    }
    return await this.delegate.append(event, options);
  }

  async readStream(streamId: string) {
    return await this.delegate.readStream(streamId);
  }

  async readAll() {
    return await this.delegate.readAll();
  }
}

class CompanionRaceLedger implements EventLedger {
  private injected = false;

  constructor(
    private readonly delegate: EventLedger,
    private readonly companion: (event: Parameters<EventLedger["append"]>[0]) => Parameters<EventLedger["append"]>[0]
  ) {}

  async append(event: Parameters<EventLedger["append"]>[0], options?: Parameters<EventLedger["append"]>[1]) {
    if (!this.injected) {
      this.injected = true;
      await this.delegate.append(event);
      await this.delegate.append(this.companion(event));
      throw new ConcurrencyConflictError("Injected exact and conflicting append race.");
    }
    return await this.delegate.append(event, options);
  }

  async readStream(streamId: string) { return await this.delegate.readStream(streamId); }
  async readAll() { return await this.delegate.readAll(); }
}

class TargetedCompanionRaceLedger implements EventLedger {
  private injected = false;
  constructor(private readonly delegate: EventLedger, private readonly type: string, private readonly companion: (event: Parameters<EventLedger["append"]>[0]) => Parameters<EventLedger["append"]>[0]) {}
  async append(event: Parameters<EventLedger["append"]>[0], options?: Parameters<EventLedger["append"]>[1]) {
    if (!this.injected && event.type === this.type) {
      this.injected = true;
      await this.delegate.append(event);
      await this.delegate.append(this.companion(event));
      throw new ConcurrencyConflictError("Injected targeted companion race.");
    }
    return await this.delegate.append(event, options);
  }
  async readStream(streamId: string) { return await this.delegate.readStream(streamId); }
  async readAll() { return await this.delegate.readAll(); }
}

class MemoryManifestStore {
  private readonly contents = new Map<`sha256:${string}`, Buffer>();

  seed(contentHash: `sha256:${string}`, content: Buffer): void {
    this.contents.set(contentHash, Buffer.from(content));
  }

  async put(content: Buffer): Promise<{ readonly contentHash: `sha256:${string}`; readonly sizeBytes: number }> {
    const contentHash = hashBytes(content);
    this.contents.set(contentHash, Buffer.from(content));
    return { contentHash, sizeBytes: content.byteLength };
  }

  async get(contentHash: `sha256:${string}`): Promise<Buffer> {
    const content = this.contents.get(contentHash);
    if (content === undefined) throw new Error(`Manifest ${contentHash} is unavailable.`);
    return Buffer.from(content);
  }
}

class FailAfterMaterialStore extends MemoryManifestStore {
  private writes = 0;

  override async put(content: Buffer) {
    this.writes += 1;
    if (this.writes > 1) throw new Error("manifest persistence unavailable");
    return await super.put(content);
  }
}

const runnerContextPackIds = [
  "accepted-graph-projection.v1",
  "evidence-summary.v1",
  "timeline-draft-summary.v1",
  "contradiction-candidate-summary.v1",
  "governance-locks.v1",
  "agent-memory-summary.v1",
  "task-run-history.v1",
  "workspace-runtime-status.v1",
  "prr-read-model.v1",
  "jurisdiction-pack-summary.v1"
] as const;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

async function runnerFixture(patch: {
  readonly contextPacks?: ContextPackRegistry;
  readonly runId?: string;
  readonly taskId?: string;
  readonly workspaceId?: string;
  readonly includeWitness?: boolean;
  readonly now?: () => string;
} = {}) {
  const runId = patch.runId ?? "run_runner_test_001";
  const taskId = patch.taskId ?? "task_runner_test_001";
  const workspaceId = patch.workspaceId ?? "ws_runner_test";
  const ledger = new InMemoryEventLedger();
  const actor = { id: "actor_runner_test", kind: "agent" as const, label: "Runner Test" };
  const now = patch.now ?? (() => "2026-07-11T08:00:00.000Z");
  const lifecycle = createAgentRuntime({ ledger, actor, now, providers: [] });
  await lifecycle.initializeDefaultIdentity({ workspaceId });
  await lifecycle.createTask({
    taskId,
    title: "Prepare specialist run",
    requestedBy: "actor_runner_test",
    priority: "normal"
  });
  await lifecycle.startRun({
    runId,
    taskId,
    runType: "evidence-triage",
    scope: { kind: "workspace", refs: [workspaceId] }
  });

  let invocations = 0;
  const baseInput: SpecialistRunnerBaseInput = {
      ledger,
      actor,
      now,
      contextPacks: patch.contextPacks ?? runnerContextPackRegistry(),
      scope: { kind: "imported-evidence", refs: ["ev_imported_001"] },
      productionPromptRegistrations: productionSpecialistPromptRegistrations,
      runId,
      taskId,
      providerId: "provider_local_test",
      modelFamily: "local-test",
      credentialRef: { credentialRefId: "agent_credref_local_test", providerId: "provider_local_test", kind: "local-no-secret" as const },
      runtime: {
        async invokeModel() {
          invocations += 1;
          throw new Error("Model invocation must not occur during preparation.");
        }
      },
      providerReadiness: {
        cards: [{
          providerId: "provider_local_test",
          label: "Local test provider",
          backendKind: "local-engine" as const,
          capabilitySummary: ["text"],
          credentialKindSummary: ["local-no-secret"],
          state: "works-locally" as const,
          requiredApprovalClass: "none" as const,
          credentialHealth: "not-required" as const,
          dataHandlingPosture: "local-only" as const,
          safeActionIds: []
        }]
      }
  };
  const rendered = await renderedRunnerPrompt({ ...baseInput, contextPacks: runnerContextPackRegistry() });
  const handle = mountedRunnerHandle(workspaceId);
  const store = await createMountedPromptArtifactStore({ handle });
  await store.put(rendered);
  const readback = await store.read({
    inputArtifactHash: rendered.manifest.inputArtifactHash as `sha256:${string}`,
    authoritativeResolvedContextPacks: rendered.resolvedContextPacks
  });
  if (readback.witness === undefined) throw new Error("Expected mounted V1 prompt witness.");
  const witness = readback.witness;
  const input: SpecialistRunnerBaseInput = patch.includeWitness === false
    ? baseInput
    : { ...baseInput, mountedPromptReadbackWitness: witness };
  return {
    input,
    rendered,
    invocationCount: () => invocations
  };
}

async function renderedRunnerPrompt(input: SpecialistRunnerBaseInput) {
  const runType = "evidence-triage" as const;
  const scope = input.scope ?? { kind: "task" as const, refs: [input.taskId] };
  const registration = productionSpecialistPromptRegistrationFor(runType);
  const resolvedContextPacks = await Promise.all(registration.contextRequirements
    .filter((requirement) => requirement.requirementMode === "always" || scope.associatedPrrRequestId !== undefined)
    .map(async (requirement) => await input.contextPacks.buildResolved(requirement.contextPackId)));
  return agent.renderProductionSpecialistPrompt({
    taskId: input.taskId,
    runId: input.runId,
    runType,
    generatedAt: input.now(),
    scope,
    resolvedContextPacks
  });
}

function mountedRunnerHandle(workspaceId: string): LocalRuntimeHandle {
  const root = mkdtempSync(join(tmpdir(), "cestus-runner-mounted-"));
  const cwd = mkdtempSync(join(tmpdir(), "cestus-runner-mounted-cwd-"));
  mountedRunnerDirs.push(root, cwd);
  createPortableWorkspace({
    rootDir: root,
    workspaceId,
    label: "Runner mounted prompt fixture",
    createdAt: "2026-07-11T08:00:00.000Z",
    createdBy: "actor_runner_test"
  });
  const handle = createSqlitePrrRuntime({
    config: {
      ...resolveLocalRuntimeConfig({ cwd, env: {} }),
      storage: {
        strategy: "portable-workspace",
        workspaceRoot: root,
        expectedWorkspaceId: workspaceId,
        sqlitePath: join(root, "ledger", "ontology.sqlite")
      }
    },
    actor: { id: "actor_runner_test", kind: "system", label: "Runner Test" },
    now: () => "2026-07-11T08:00:00.000Z"
  });
  mountedRunnerHandles.push(handle);
  return handle;
}

async function boundRunnerPromptFixture(patch: {
  readonly runId?: string;
  readonly taskId?: string;
} = {}) {
  const fixture = await runnerFixture(patch);
  const prepared = await prepareSpecialistRun(fixture.input, "evidence-triage");
  const approvedPromptArtifact = prepared.promptArtifact;
  const resolvedContextPacks = approvedPromptArtifact.resolvedContextPacks;
  if (resolvedContextPacks === undefined) {
    throw new Error("Expected canonical v1 prompt artifact to retain verified context packs.");
  }
  const exactRun = {
    taskId: fixture.input.taskId,
    attemptId: `attempt_${fixture.input.runId}`,
    approvedRunId: fixture.input.runId,
    runId: fixture.input.runId,
    runType: "evidence-triage" as const,
    residentAgentId: "agent_default" as const,
    workspaceId: "ws_runner_test",
    mountInstanceId: "mount_runner_test",
    workflowDescriptor: specialistWorkflowDescriptorFor("evidence-triage"),
    policyVersion: "runner-policy.v1",
    providerPosture: {
      providerId: fixture.input.providerId,
      modelId: fixture.input.modelFamily,
      capabilityIds: ["capability_runner_local_test"],
      selectionPolicyVersion: "runner-selection.v1",
      readinessState: "ready" as const,
      approvalRequirementId: `toolreq_${fixture.input.runId}`
    }
  };
  const boundPromptArtifact = bindApprovedProductionSpecialistPromptV2({
    approvedPromptArtifact,
    generatedAt: approvedPromptArtifact.manifest.generatedAt,
    scope: fixture.input.scope ?? { kind: "task", refs: [fixture.input.taskId] },
    resolvedContextPacks,
    exactRun
  });
  return { ...fixture, approvedPromptArtifact, boundPromptArtifact, exactRun };
}

function v2InvocationFacts(fixture: Awaited<ReturnType<typeof boundRunnerPromptFixture>>) {
  return {
    taskId: fixture.input.taskId,
    runId: fixture.input.runId,
    runType: "evidence-triage" as const,
    residentAgentId: "agent_default" as const,
    providerId: fixture.input.providerId,
    modelId: fixture.input.modelFamily,
    approvalRequirementId: fixture.exactRun.providerPosture.approvalRequirementId
  };
}

function v2BlockedSelectionInput(
  fixture: Awaited<ReturnType<typeof boundRunnerPromptFixture>>,
  exactRun: ReturnType<typeof boundRunnerPromptFixture> extends Promise<infer Result>
    ? Result extends { readonly exactRun: infer ExactRun } ? ExactRun : never
    : never
) {
  const effects: string[] = [];
  const forbidden = (name: string) => new Proxy({}, {
    get() {
      effects.push(name);
      throw new Error(`Unexpected ${name} access while v2 authority is blocked.`);
    }
  });
  const proof = {
    approvedPromptArtifact: fixture.approvedPromptArtifact,
    get exactRun() {
      effects.push("proof.exactRun");
      return exactRun;
    },
    get v2InvocationFacts() {
      effects.push("proof.v2InvocationFacts");
      return v2InvocationFacts(fixture);
    },
    get currentPreviewInput() {
      effects.push("proof.currentPreviewInput");
      throw new Error("Current preview must not be read while v2 authority is blocked.");
    }
  };
  return {
    effects,
    input: {
      ledger: forbidden("ledger") as EventLedger,
      runId: fixture.input.runId,
      taskId: fixture.input.taskId,
      providerId: fixture.input.providerId,
      modelFamily: fixture.input.modelFamily,
      credentialRef: forbidden("credential") as SpecialistRunnerBaseInput["credentialRef"],
      providerReadiness: forbidden("provider-readiness") as SpecialistRunnerBaseInput["providerReadiness"],
      providerTransferApproval: proof,
      promptArtifact: fixture.boundPromptArtifact
    }
  };
}

function runnerContextPackRegistry(options: {
  readonly mode?: "valid" | "missing-payload" | "payload-hash-mismatch" | "invalid-payload";
} = {}): ContextPackRegistry {
  const mode = options.mode ?? "valid";
  const registry = createContextPackRegistry({
    ...(mode === "payload-hash-mismatch" ? {
      payloadResolver: () => ({ mismatched: true })
    } : {})
  });
  for (const contextPackId of runnerContextPackIds) {
    const parser = (payload: AgentContextPackJsonValue) => {
      if (mode === "invalid-payload" && contextPackId === "evidence-summary.v1") {
        throw new Error("invalid production payload");
      }
      return payload;
    };
    Object.defineProperty(parser, "cestusContextPackParserId", {
      value: runnerParserIdentity(contextPackId), enumerable: false, writable: false, configurable: false
    });
    registerContextPackPayloadParserAuthority(parser);
    registry.register({
      descriptor: {
        contextPackId,
        version: 1,
        label: `Runner ${contextPackId}`,
        maxBytes: 16_384,
        requiredProvenanceKinds: ["event-id"],
        redactionPolicy: "safe-summary",
        sourceProjection: "agent.projection"
      },
      parsePayload: parser,
      build: () => {
        const payload = runnerPayload(contextPackId);
        if (mode === "missing-payload" || mode === "payload-hash-mismatch") {
          return buildContextPackRef({
            contextPackId,
            version: 1,
            generatedAt: "2026-07-11T08:00:00.000Z",
            payload,
            safeSummary: `Runner ${contextPackId} summary.`,
            provenanceRefs: ["evt_runner_context_001"]
          });
        }
        return {
          contextPackId,
          version: 1,
          generatedAt: "2026-07-11T08:00:00.000Z",
          payload,
          safeSummary: `Runner ${contextPackId} summary.`,
          provenanceRefs: ["evt_runner_context_001"]
        };
      }
    });
  }
  return registry;
}

function runnerParserIdentity(contextPackId: typeof runnerContextPackIds[number]): string {
  return contextPackId;
}

const runnerHash: `sha256:${string}` = "sha256:1111111111111111111111111111111111111111111111111111111111111111";

function runnerPayload(contextPackId: typeof runnerContextPackIds[number]): Record<string, unknown> {
  switch (contextPackId) {
    case "evidence-summary.v1":
      return { items: [{ evidenceId: "ev_imported_001", ingestionEventId: "evt_ingested_001", contentHash: runnerHash, occurrenceIds: ["occurrence_001"], parseJobs: [], governanceTags: [], safeNarrative: "Verified evidence is available." }] };
    case "accepted-graph-projection.v1":
      return { items: { assertions: [{ assertionId: "assertion_001", evidenceId: "ev_imported_001", evidenceContentHash: runnerHash, proposedByEventId: "evt_proposed_001", acceptedByEventId: "evt_accepted_001", sourceEventIds: ["evt_proposed_001"], rowHash: runnerHash, safeStatement: "Verified graph statement." }], entities: [], relationships: [] } };
    case "governance-locks.v1":
      return { items: { activeLocks: [{ lockId: "lock_001", lockKind: "review", safeReason: "Review required.", activatedBy: "agent_001", activatedAt: "2026-07-11T08:00:00.000Z", relatedEventIds: ["evt_lock_001"], projectionEventIds: ["evt_lock_001"] }], governanceRestrictions: [] } };
    case "agent-memory-summary.v1":
      return { memory: { activeMemory: ["Verified memory."], aggregateCounts: { active: 1 }, sourceEventIds: ["evt_memory_001"], artifactHashes: [] } };
    case "task-run-history.v1":
      return { history: { projectionHighWaterMark: 1, projectionSourceRef: "agent.projection.task-run-history", tasks: [{ taskId: "task_001", status: "queued", statusReasonCode: "Verified task history." }], runs: [], modelInvocations: [], toolRequests: [], aggregateCounts: { tasks: 1 }, sourceEventIds: ["evt_task_001"], artifactHashes: [], window: { order: "created-at", limit: 1, hasMore: false, totalCount: 1, omissionCodes: [] } } };
    case "workspace-runtime-status.v1":
      return { runtime: { runtimeHighWaterMark: 1, workspaceMounted: true, storageStrategy: "local", bindPosture: "bound", authPosture: "none", providerStates: [], diagnostics: [], projectionHighWaterMarks: { agent: 1 }, omissionCodes: [] } };
    case "timeline-draft-summary.v1":
      return { items: [{ itemId: "timeline_001", summary: "Verified timeline item." }], omissions: [] };
    case "contradiction-candidate-summary.v1":
      return { items: [{ candidateId: "contradiction_001", rationale: "Verified candidate." }], omissions: [] };
    case "prr-read-model.v1":
      return { lifecycle: { status: "draft", agencyName: "Agency", jurisdictionPack: { name: "pack", version: "1" } }, requestStream: { requestCreatedEventId: "evt_prr_001", streamHeadEventId: "evt_prr_001", streamHighWaterMark: 1, sourceEventIds: ["evt_prr_001"] }, deadline: null, fee: null, narrowing: null, correspondence: [], production: {}, diagnostics: [], gates: [], sourceRefs: {}, omissions: [] };
    case "jurisdiction-pack-summary.v1":
      return { packName: "pack", packVersion: "1", jurisdiction: "test", citedRules: [], advisoryPosture: { summary: "Advisory only." }, omissions: [] };
  }
}

function hashBytes(bytes: Buffer): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
