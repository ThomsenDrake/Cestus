import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildContextPackRef,
  buildPromptArtifact,
  createAgentRuntime,
  createContextPackRegistry,
  prepareSpecialistRun,
  productionSpecialistPromptRegistrationFor,
  productionSpecialistPromptRegistrations,
  serializeSpecialistLocalArtifact,
  type AgentContextPackJsonValue,
  type ContextPackRegistry,
  type SpecialistRunnerBaseInput,
  writeSpecialistDerivativeArtifact
} from "../src/index.js";
import { registerContextPackPayloadParserAuthority } from "../src/context-packs.js";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";

describe("specialist runner artifact serialization", () => {
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
      .rejects.toThrow(/production binding|production specialist prompt artifact/i);
    expect(fixture.invocationCount()).toBe(0);
  });
});

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

async function runnerFixture(patch: { readonly contextPacks?: ContextPackRegistry } = {}) {
  const ledger = new InMemoryEventLedger();
  const actor = { id: "actor_runner_test", kind: "agent" as const, label: "Runner Test" };
  const now = () => "2026-07-11T08:00:00.000Z";
  const lifecycle = createAgentRuntime({ ledger, actor, now, providers: [] });
  await lifecycle.initializeDefaultIdentity({ workspaceId: "ws_runner_test" });
  await lifecycle.createTask({
    taskId: "task_runner_test_001",
    title: "Prepare specialist run",
    requestedBy: "actor_runner_test",
    priority: "normal"
  });
  await lifecycle.startRun({
    runId: "run_runner_test_001",
    taskId: "task_runner_test_001",
    runType: "evidence-triage",
    scope: { kind: "workspace", refs: ["ws_runner_test"] }
  });

  let invocations = 0;
  const input: SpecialistRunnerBaseInput = {
      ledger,
      actor,
      now,
      contextPacks: patch.contextPacks ?? runnerContextPackRegistry(),
      scope: { kind: "imported-evidence", refs: ["ev_imported_001"] },
      productionPromptRegistrations: productionSpecialistPromptRegistrations,
      runId: "run_runner_test_001",
      taskId: "task_runner_test_001",
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
  return {
    input,
    invocationCount: () => invocations
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
  if (contextPackId === "timeline-draft-summary.v1") return "timeline-draft-summary.production-test-parser.v1";
  if (contextPackId === "contradiction-candidate-summary.v1") return "contradiction-candidate-summary.production-test-parser.v1";
  return contextPackId;
}

const runnerHash = "sha256:1111111111111111111111111111111111111111111111111111111111111111";

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
