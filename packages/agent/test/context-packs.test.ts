import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  assertResolvedContextPacksForExecution,
  buildContextPackRef,
  buildResolvedContextPack,
  contextPackDescriptorSchema,
  contextPackRefSchema,
  createContextPackRegistry,
  hashAgentContextPack,
  serializeContextPackPayload,
  type AgentContextPackJsonValue,
  verifyResolvedContextPack
} from "../src/context-packs.js";
import { buildAgentMemorySummaryContextPack } from "../src/memory.js";
import { buildAgentProjection } from "../src/projection.js";
import { goldenAgentLedgerEvents } from "./fixtures/golden-agent-ledger.js";
import { resolvedContextPackSentinelInput } from "./fixtures/resolved-context-pack-sentinel.js";

describe("agent context packs", () => {
  it("builds a frozen resolved envelope and preserves ref-only hash compatibility", () => {
    const resolved = buildResolvedContextPack(resolvedContextPackSentinelInput);
    const ref = buildContextPackRef(resolvedContextPackSentinelInput);

    expect(resolved.ref).toEqual(ref);
    expect(resolved.payload).toEqual(resolvedContextPackSentinelInput.payload);
    expect(resolved.ref.contentHash).toBe(hashAgentContextPack(resolved.payload));
    const payloadBytes = serializeContextPackPayload(resolved.payload);
    expect(Buffer.from(payloadBytes).toString("utf8")).toBe('{"fact":"payload_sentinel_case_budget_review_window_42"}');
    expect(resolved.ref.sizeBytes).toBe(payloadBytes.byteLength);
    expect(resolved.ref.contentHash).toBe(`sha256:${createHash("sha256").update(payloadBytes).digest("hex")}`);
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(resolved.ref.safeSummary).not.toContain("payload_sentinel_case_budget_review_window_42");
  });

  it("requires hash, size, identity, DTO, and exact parser validation before execution", () => {
    const resolved = buildResolvedContextPack(resolvedContextPackSentinelInput);
    const parser = (payload: AgentContextPackJsonValue): AgentContextPackJsonValue => {
      if (typeof payload !== "object" || payload === null || (payload as { fact?: unknown }).fact !== "payload_sentinel_case_budget_review_window_42") {
        throw new Error("invalid task-run-history payload");
      }
      return payload;
    };

    expect(verifyResolvedContextPack(resolved, parser)).toEqual(resolved);
    expect(() => verifyResolvedContextPack({ ...resolved, ref: { ...resolved.ref, contentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111" } }, parser)).toThrow(/hash/i);
    expect(() => verifyResolvedContextPack({ ...resolved, ref: { ...resolved.ref, sizeBytes: 1 } }, parser)).toThrow(/size/i);
    expect(() => verifyResolvedContextPack({ ...resolved, ref: { ...resolved.ref, version: 2 } }, parser)).toThrow(/version|identity/i);
    expect(() => verifyResolvedContextPack({ ...resolved, payload: { wrong: "shape" }, parserVerification: "ok", verified: true }, parser)).toThrow(/hash|invalid/i);
    expect(() => verifyResolvedContextPack(buildResolvedContextPack({ ...resolvedContextPackSentinelInput, payload: { wrong: "shape" } }), parser)).toThrow(/invalid/i);
  });

  it("keeps registry build ref-only and requires exact resolver/parser capabilities for resolved builds", async () => {
    const legacyRef = buildContextPackRef(resolvedContextPackSentinelInput);
    let resolverCalls = 0;
    const registry = createContextPackRegistry({
      payloadResolver: async (ref) => {
        resolverCalls += 1;
        expect(ref).toEqual(legacyRef);
        return resolvedContextPackSentinelInput.payload;
      }
    });
    registry.register({
      descriptor: {
        contextPackId: "task-run-history.v1",
        version: 1,
        label: "Task history",
        maxBytes: 16_384,
        requiredProvenanceKinds: ["event-id"],
        redactionPolicy: "safe-summary",
        sourceProjection: "agent.projection"
      },
      build: () => legacyRef,
      parsePayload(payload) {
        if (typeof payload !== "object" || payload === null || (payload as { fact?: unknown }).fact !== "payload_sentinel_case_budget_review_window_42") {
          throw new Error("invalid task-run-history payload");
        }
        return payload;
      }
    });

    await expect(registry.build("task-run-history.v1")).resolves.toEqual(legacyRef);
    expect(resolverCalls).toBe(0);
    await expect(registry.buildResolved("task-run-history.v1")).resolves.toMatchObject({ ref: legacyRef });
    expect(resolverCalls).toBe(1);
  });

  it("blocks resolved builds without payloads or exact parsers and never serializes parser functions", async () => {
    const legacyRef = buildContextPackRef(resolvedContextPackSentinelInput);
    const missingPayloadRegistry = createContextPackRegistry();
    missingPayloadRegistry.register({
      descriptor: { contextPackId: "task-run-history.v1", version: 1, label: "Task history", maxBytes: 16_384, requiredProvenanceKinds: ["event-id"], redactionPolicy: "safe-summary", sourceProjection: "agent.projection" },
      build: () => legacyRef,
      parsePayload: (payload) => payload
    });
    await expect(missingPayloadRegistry.buildResolved("task-run-history.v1")).rejects.toThrow("blocked.missing-payload");

    const missingParserRegistry = createContextPackRegistry();
    missingParserRegistry.register({
      descriptor: { contextPackId: "workspace-runtime-status.v1", version: 1, label: "Runtime status", maxBytes: 16_384, requiredProvenanceKinds: ["event-id"], redactionPolicy: "safe-summary", sourceProjection: "runtime.status" },
      build: () => ({ ...resolvedContextPackSentinelInput, contextPackId: "workspace-runtime-status.v1" })
    });
    await expect(missingParserRegistry.buildResolved("workspace-runtime-status.v1")).rejects.toThrow("blocked.missing-payload-parser");
    expect(JSON.stringify(missingPayloadRegistry.snapshot())).not.toContain("parsePayload");
  });

  it("only permits verified resolved payloads that exactly cover requested refs for execution", () => {
    const resolved = buildResolvedContextPack(resolvedContextPackSentinelInput);
    const verified = verifyResolvedContextPack(resolved, (payload) => payload);
    const executionPacks = assertResolvedContextPacksForExecution([resolved.ref], [verified]);

    expect(executionPacks[0]?.payload).toEqual(resolvedContextPackSentinelInput.payload);
    expect(() => assertResolvedContextPacksForExecution([resolved.ref], [resolved])).toThrow(/verified/i);
    expect(() => assertResolvedContextPacksForExecution([resolved.ref], [])).toThrow(/missing/i);
    expect(() => assertResolvedContextPacksForExecution([], [verified])).toThrow(/extra/i);
  });

  it("does not mint execution authority without a parser", () => {
    const resolved = buildResolvedContextPack(resolvedContextPackSentinelInput);
    const unparsed = verifyResolvedContextPack(resolved);

    expect(() => assertResolvedContextPacksForExecution([resolved.ref], [unparsed])).toThrow(/verified/i);
  });

  it("uses parser-normalized payloads only when their canonical bytes still match the ref", () => {
    const resolved = buildResolvedContextPack({
      ...resolvedContextPackSentinelInput,
      payload: { fact: "payload_sentinel_case_budget_review_window_42", unknown: "strip-this" }
    });
    const normalized = verifyResolvedContextPack(resolved, (payload) => ({
      unknown: (payload as { unknown: string }).unknown,
      fact: (payload as { fact: string }).fact
    }));

    expect(normalized.payload).toEqual(resolved.payload);
    expect(() => verifyResolvedContextPack(resolved, (payload) => ({ fact: (payload as { fact: string }).fact }))).toThrow("blocked.payload-hash-mismatch");
    expect(() => verifyResolvedContextPack(resolved, () => ({ fact: "changed" }))).toThrow("blocked.payload-hash-mismatch");
  });

  it("uses blocked codes for unsafe envelopes and missing resolver payloads", async () => {
    const resolved = buildResolvedContextPack(resolvedContextPackSentinelInput);
    const unsafe = { ...resolved, payload: ["safe"] as string[] & { extra?: string } };
    unsafe.payload.extra = "unsafe";
    expect(() => verifyResolvedContextPack(unsafe, (payload) => payload)).toThrow("blocked.invalid-payload-shape");

    const registerLegacyBuilder = (registry: ReturnType<typeof createContextPackRegistry>) => registry.register({
      descriptor: { contextPackId: "task-run-history.v1", version: 1, label: "Task history", maxBytes: 16_384, requiredProvenanceKinds: ["event-id"], redactionPolicy: "safe-summary", sourceProjection: "agent.projection" },
      build: () => resolved.ref,
      parsePayload: (payload) => payload
    });
    const undefinedRegistry = createContextPackRegistry({ payloadResolver: async () => undefined as never });
    registerLegacyBuilder(undefinedRegistry);
    await expect(undefinedRegistry.buildResolved("task-run-history.v1")).rejects.toThrow("blocked.missing-payload");

    const nullRegistry = createContextPackRegistry({ payloadResolver: async () => null as never });
    registerLegacyBuilder(nullRegistry);
    await expect(nullRegistry.buildResolved("task-run-history.v1")).rejects.toThrow("blocked.missing-payload");
  });
  it("validates descriptor metadata for explicit context assembly", () => {
    const descriptor = contextPackDescriptorSchema.parse({
      contextPackId: "accepted-graph-projection.v1",
      version: 1,
      label: "Accepted graph projection",
      maxBytes: 32_768,
      requiredProvenanceKinds: ["event-id", "content-hash"],
      redactionPolicy: "safe-summary",
      sourceProjection: "ontology.graph"
    });

    expect(descriptor.contextPackId).toBe("accepted-graph-projection.v1");
  });

  it("rejects context pack IDs whose version suffix does not match version", () => {
    expect(() =>
      contextPackDescriptorSchema.parse({
        contextPackId: "task-run-history.v2",
        version: 1,
        label: "Task and run history",
        maxBytes: 16_384,
        requiredProvenanceKinds: ["event-id"],
        redactionPolicy: "safe-summary",
        sourceProjection: "agent.projection"
      })
    ).toThrow(/version/i);

    expect(() =>
      contextPackRefSchema.parse({
        contextPackId: "task-run-history.v2",
        version: 1,
        contentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
        sizeBytes: 2,
        generatedAt: "2026-07-07T22:00:00.000Z",
        safeSummary: "One prior task event.",
        provenanceRefs: ["evt_agent_task"]
      })
    ).toThrow(/version/i);

    expect(() =>
      buildContextPackRef({
        contextPackId: "task-run-history.v2",
        version: 1,
        generatedAt: "2026-07-07T22:00:00.000Z",
        payload: { events: ["evt_agent_task"] },
        safeSummary: "One prior task event.",
        provenanceRefs: ["evt_agent_task"]
      })
    ).toThrow(/version/i);
  });

  it("builds stable context pack hashes from sorted JSON", () => {
    const left = hashAgentContextPack({ b: 2, a: 1 });
    const right = hashAgentContextPack({ a: 1, b: 2 });

    expect(left).toBe(right);
    expect(left).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("carries source events, artifact hashes, policy scope, budget, and staleness metadata", () => {
    const artifactHash = "sha256:2222222222222222222222222222222222222222222222222222222222222222";
    const ref = buildContextPackRef({
      contextPackId: "task-run-history.v1",
      version: 1,
      generatedAt: "2026-07-08T12:00:00.000Z",
      payload: { events: ["evt_agent_task_created"], artifacts: [artifactHash] },
      safeSummary: "One resident-agent task event.",
      provenanceRefs: ["evt_agent_task_created", artifactHash],
      sourceEventIds: ["evt_agent_task_created"],
      artifactHashes: [artifactHash],
      policyVersion: "agent-policy-v1",
      scope: { kind: "workspace", id: "ws_case_001" },
      sizeBudgetBytes: 16_384,
      stalenessInputs: [{
        kind: "projection-high-water-mark",
        ref: "agent.projection",
        value: "42"
      }]
    });

    expect(ref.sourceEventIds).toEqual(["evt_agent_task_created"]);
    expect(ref.artifactHashes).toEqual([artifactHash]);
    expect(ref.policyVersion).toBe("agent-policy-v1");
    expect(ref.scope).toEqual({ kind: "workspace", id: "ws_case_001" });
    expect(ref.sizeBudgetBytes).toBe(16_384);
    expect(ref.stalenessInputs).toEqual([{
      kind: "projection-high-water-mark",
      ref: "agent.projection",
      value: "42"
    }]);
    expect(Object.isFrozen(ref)).toBe(true);
    expect(Object.isFrozen(ref.sourceEventIds)).toBe(true);
    expect(Object.isFrozen(ref.artifactHashes)).toBe(true);
    expect(Object.isFrozen(ref.scope)).toBe(true);
    expect(Object.isFrozen(ref.stalenessInputs)).toBe(true);
    expect(Object.isFrozen(ref.stalenessInputs?.[0])).toBe(true);
  });

  it("parses richer context pack refs returned from durable artifact manifests", () => {
    const ref = contextPackRefSchema.parse({
      contextPackId: "task-run-history.v1",
      version: 1,
      contentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      sizeBytes: 512,
      generatedAt: "2026-07-08T12:00:00.000Z",
      safeSummary: "One resident-agent task event.",
      provenanceRefs: ["evt_agent_task_created"],
      projectionHighWaterMark: 42,
      sourceEventIds: ["evt_agent_task_created"],
      artifactHashes: ["sha256:2222222222222222222222222222222222222222222222222222222222222222"],
      policyVersion: "agent-policy-v1",
      scope: { kind: "workspace", id: "ws_case_001" },
      sizeBudgetBytes: 16_384,
      stalenessInputs: [{
        kind: "projection-high-water-mark",
        ref: "agent.projection",
        value: "42"
      }]
    });

    expect(ref.projectionHighWaterMark).toBe(42);
    expect(ref.sourceEventIds).toEqual(["evt_agent_task_created"]);
    expect(ref.artifactHashes).toEqual(["sha256:2222222222222222222222222222222222222222222222222222222222222222"]);
    expect(ref.stalenessInputs?.[0]).toEqual({
      kind: "projection-high-water-mark",
      ref: "agent.projection",
      value: "42"
    });
  });

  it("rejects size budgets smaller than the derived context pack payload", () => {
    expect(() =>
      buildContextPackRef({
        contextPackId: "task-run-history.v1",
        version: 1,
        generatedAt: "2026-07-08T12:00:00.000Z",
        payload: { events: ["evt_agent_task_created"], summary: "This payload is larger than one byte." },
        safeSummary: "One resident-agent task event.",
        provenanceRefs: ["evt_agent_task_created"],
        sizeBudgetBytes: 1
      })
    ).toThrow(/sizeBudgetBytes must be at least the derived context pack size/i);
  });

  it("builds an agent-memory summary context pack with scope, policy, and provenance", () => {
    const projection = buildAgentProjection(goldenAgentLedgerEvents);
    const ref = buildAgentMemorySummaryContextPack({
      projection,
      generatedAt: "2026-07-09T12:30:00.000Z",
      policyVersion: "agent-policy-v1",
      scope: { kind: "workspace", id: "ws_case_001" },
      sizeBudgetBytes: 16_384
    });

    expect(ref).toMatchObject({
      contextPackId: "agent-memory-summary.v1",
      version: 1,
      policyVersion: "agent-policy-v1",
      scope: { kind: "workspace", id: "ws_case_001" }
    });
    expect(ref.sourceEventIds).toEqual(["evt_agent_policy_installed_default"]);
    expect(ref.provenanceRefs).toEqual(expect.arrayContaining(["evt_agent_memory_recorded_workspace_policy"]));
    expect(ref.provenanceRefs).toEqual(expect.arrayContaining(["evt_agent_policy_installed_default"]));
    expect(ref.safeSummary).toMatch(/working memory/i);
  });

  it("rejects arrays with custom enumerable string properties", () => {
    const payload = ["ok"] as string[] & { extra?: string };
    payload.extra = "api key sk-live-value";

    expect(() => hashAgentContextPack(payload)).toThrow(/JSON DTO-safe|secret/i);
  });

  it("rejects arrays with symbol keys", () => {
    const payload = ["ok"];
    Object.defineProperty(payload, Symbol("context"), {
      value: "ok",
      enumerable: true
    });

    expect(() => hashAgentContextPack(payload)).toThrow(/JSON DTO-safe/i);
  });

  it("rejects accessor-backed array entries without invoking the getter", () => {
    let getterInvoked = false;
    const payload: string[] = [];
    Object.defineProperty(payload, "0", {
      enumerable: true,
      get() {
        getterInvoked = true;
        return "ok";
      }
    });

    let thrown: unknown;
    try {
      hashAgentContextPack(payload);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(/JSON DTO-safe/i);
    expect(getterInvoked).toBe(false);
  });

  it("rejects secret-shaped summaries and refs", () => {
    expect(() =>
      contextPackRefSchema.parse({
        contextPackId: "evidence-summary.v1",
        version: 1,
        contentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
        generatedAt: "2026-07-07T22:00:00.000Z",
        safeSummary: "api key sk-live-value",
        provenanceRefs: []
      })
    ).toThrow(/secret/i);
  });

  it("rejects accessor-backed context pack ref summaries without invoking the getter", () => {
    let getterInvoked = false;
    const ref = {
      contextPackId: "evidence-summary.v1",
      version: 1,
      contentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      generatedAt: "2026-07-07T22:00:00.000Z",
      provenanceRefs: []
    };
    Object.defineProperty(ref, "safeSummary", {
      enumerable: true,
      get() {
        getterInvoked = true;
        return "Safe summary.";
      }
    });

    let thrown: unknown;
    try {
      contextPackRefSchema.parse(ref);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(/JSON DTO-safe/i);
    expect(getterInvoked).toBe(false);
  });

  it("rejects accessor-backed provenance refs without invoking the getter", () => {
    let getterInvoked = false;
    const provenanceRefs: string[] = [];
    Object.defineProperty(provenanceRefs, "0", {
      enumerable: true,
      get() {
        getterInvoked = true;
        return "evt_agent_task";
      }
    });

    let thrown: unknown;
    try {
      contextPackRefSchema.parse({
        contextPackId: "evidence-summary.v1",
        version: 1,
        contentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
        generatedAt: "2026-07-07T22:00:00.000Z",
        safeSummary: "Safe summary.",
        provenanceRefs
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(/JSON DTO-safe/i);
    expect(getterInvoked).toBe(false);
  });

  it("rejects provenance ref arrays with custom properties and symbol keys", () => {
    const customProps = ["evt_agent_task"] as string[] & { extra?: string };
    customProps.extra = "extra context";
    const symbolKeyed = ["evt_agent_task"];
    Object.defineProperty(symbolKeyed, Symbol("context"), {
      value: "extra context",
      enumerable: true
    });

    for (const provenanceRefs of [customProps, symbolKeyed]) {
      expect(() =>
        contextPackRefSchema.parse({
          contextPackId: "evidence-summary.v1",
          version: 1,
          contentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
          generatedAt: "2026-07-07T22:00:00.000Z",
          safeSummary: "Safe summary.",
          provenanceRefs
        })
      ).toThrow(/JSON DTO-safe/i);
    }
  });

  it("rejects build refs with provenance arrays that have secret-shaped custom properties", () => {
    const provenanceRefs = ["evt_agent_task"] as string[] & { extra?: string };
    provenanceRefs.extra = "api key sk-live-value";

    expect(() =>
      buildContextPackRef({
        contextPackId: "task-run-history.v1",
        version: 1,
        generatedAt: "2026-07-07T22:00:00.000Z",
        payload: { events: ["evt_agent_task"] },
        safeSummary: "One prior task event.",
        provenanceRefs
      })
    ).toThrow(/JSON DTO-safe|secret/i);
  });

  it("rejects build refs with provenance arrays that have symbol keys", () => {
    const provenanceRefs = ["evt_agent_task"];
    Object.defineProperty(provenanceRefs, Symbol("context"), {
      value: "extra context",
      enumerable: true
    });

    expect(() =>
      buildContextPackRef({
        contextPackId: "task-run-history.v1",
        version: 1,
        generatedAt: "2026-07-07T22:00:00.000Z",
        payload: { events: ["evt_agent_task"] },
        safeSummary: "One prior task event.",
        provenanceRefs
      })
    ).toThrow(/JSON DTO-safe/i);
  });

  it("rejects build refs with accessor-backed provenance entries without invoking the getter", () => {
    let getterInvoked = false;
    const provenanceRefs: string[] = [];
    Object.defineProperty(provenanceRefs, "0", {
      enumerable: true,
      get() {
        getterInvoked = true;
        return "evt_agent_task";
      }
    });

    let thrown: unknown;
    try {
      buildContextPackRef({
        contextPackId: "task-run-history.v1",
        version: 1,
        generatedAt: "2026-07-07T22:00:00.000Z",
        payload: { events: ["evt_agent_task"] },
        safeSummary: "One prior task event.",
        provenanceRefs
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(/JSON DTO-safe/i);
    expect(getterInvoked).toBe(false);
  });

  it("rejects build refs without provenance refs", () => {
    expect(() =>
      buildContextPackRef({
        contextPackId: "task-run-history.v1",
        version: 1,
        generatedAt: "2026-07-07T22:00:00.000Z",
        payload: { events: [] },
        safeSummary: "No prior task events.",
        provenanceRefs: []
      })
    ).toThrow(/provenanceRefs/i);
  });

  it("rejects accessor-backed descriptor fields and arrays without invoking getters", () => {
    let labelGetterInvoked = false;
    const descriptor = {
      contextPackId: "accepted-graph-projection.v1",
      version: 1,
      maxBytes: 32_768,
      requiredProvenanceKinds: ["event-id"],
      redactionPolicy: "safe-summary",
      sourceProjection: "ontology.graph"
    };
    Object.defineProperty(descriptor, "label", {
      enumerable: true,
      get() {
        labelGetterInvoked = true;
        return "Accepted graph projection";
      }
    });

    let descriptorThrown: unknown;
    try {
      contextPackDescriptorSchema.parse(descriptor);
    } catch (error) {
      descriptorThrown = error;
    }

    expect(descriptorThrown).toBeInstanceOf(Error);
    expect((descriptorThrown as Error).message).toMatch(/JSON DTO-safe/i);
    expect(labelGetterInvoked).toBe(false);

    let arrayGetterInvoked = false;
    const requiredProvenanceKinds: string[] = [];
    Object.defineProperty(requiredProvenanceKinds, "0", {
      enumerable: true,
      get() {
        arrayGetterInvoked = true;
        return "event-id";
      }
    });

    let arrayThrown: unknown;
    try {
      contextPackDescriptorSchema.parse({
        contextPackId: "accepted-graph-projection.v1",
        version: 1,
        label: "Accepted graph projection",
        maxBytes: 32_768,
        requiredProvenanceKinds,
        redactionPolicy: "safe-summary",
        sourceProjection: "ontology.graph"
      });
    } catch (error) {
      arrayThrown = error;
    }

    expect(arrayThrown).toBeInstanceOf(Error);
    expect((arrayThrown as Error).message).toMatch(/JSON DTO-safe/i);
    expect(arrayGetterInvoked).toBe(false);

    const requiredKindsWithCustomProp = ["event-id"] as string[] & { extra?: string };
    requiredKindsWithCustomProp.extra = "extra context";
    expect(() =>
      contextPackDescriptorSchema.parse({
        contextPackId: "accepted-graph-projection.v1",
        version: 1,
        label: "Accepted graph projection",
        maxBytes: 32_768,
        requiredProvenanceKinds: requiredKindsWithCustomProp,
        redactionPolicy: "safe-summary",
        sourceProjection: "ontology.graph"
      })
    ).toThrow(/JSON DTO-safe/i);
  });

  it("registers fake context builders by stable id", async () => {
    const registry = createContextPackRegistry();
    registry.register({
      descriptor: {
        contextPackId: "task-run-history.v1",
        version: 1,
        label: "Task and run history",
        maxBytes: 16_384,
        requiredProvenanceKinds: ["event-id"],
        redactionPolicy: "safe-summary",
        sourceProjection: "agent.projection"
      },
      async build() {
        return buildContextPackRef({
          contextPackId: "task-run-history.v1",
          version: 1,
          generatedAt: "2026-07-07T22:00:00.000Z",
          payload: { events: ["evt_agent_task"] },
          safeSummary: "One prior task event.",
          provenanceRefs: ["evt_agent_task"]
        });
      }
    });

    await expect(registry.build("task-run-history.v1")).resolves.toMatchObject({
      contextPackId: "task-run-history.v1",
      provenanceRefs: ["evt_agent_task"],
      sizeBytes: expect.any(Number)
    });
  });

  it("rejects registered builder refs without provenance refs", async () => {
    const registry = createContextPackRegistry();
    registry.register({
      descriptor: {
        contextPackId: "task-run-history.v1",
        version: 1,
        label: "Task and run history",
        maxBytes: 16_384,
        requiredProvenanceKinds: ["event-id"],
        redactionPolicy: "safe-summary",
        sourceProjection: "agent.projection"
      },
      async build() {
        return {
          contextPackId: "task-run-history.v1",
          version: 1,
          generatedAt: "2026-07-07T22:00:00.000Z",
          payload: { events: [] },
          safeSummary: "No provenance.",
          provenanceRefs: []
        };
      }
    });

    await expect(registry.build("task-run-history.v1")).rejects.toThrow(/provenanceRefs/i);
  });

  it("rejects registered builder refs that exceed the descriptor byte budget", async () => {
    const registry = createContextPackRegistry();
    registry.register({
      descriptor: {
        contextPackId: "task-run-history.v1",
        version: 1,
        label: "Task and run history",
        maxBytes: 8,
        requiredProvenanceKinds: ["event-id"],
        redactionPolicy: "safe-summary",
        sourceProjection: "agent.projection"
      },
      async build() {
        return buildContextPackRef({
          contextPackId: "task-run-history.v1",
          version: 1,
          generatedAt: "2026-07-07T22:00:00.000Z",
          payload: { events: ["evt_agent_task", "evt_agent_task_two"] },
          safeSummary: "Two prior task events.",
          provenanceRefs: ["evt_agent_task"]
        });
      }
    });

    await expect(registry.build("task-run-history.v1")).rejects.toThrow(/maxBytes|budget|exceeds/i);
  });

  it("enforces required provenance kinds on registry build refs", async () => {
    const contentHashRef = "sha256:2222222222222222222222222222222222222222222222222222222222222222";
    const missingHashRegistry = createContextPackRegistry();
    missingHashRegistry.register({
      descriptor: {
        contextPackId: "task-run-history.v1",
        version: 1,
        label: "Task and run history",
        maxBytes: 16_384,
        requiredProvenanceKinds: ["event-id", "content-hash"],
        redactionPolicy: "safe-summary",
        sourceProjection: "agent.projection"
      },
      async build() {
        return buildContextPackRef({
          contextPackId: "task-run-history.v1",
          version: 1,
          generatedAt: "2026-07-07T22:00:00.000Z",
          payload: { events: ["evt_agent_task"] },
          safeSummary: "One prior task event.",
          provenanceRefs: ["evt_agent_task"]
        });
      }
    });

    await expect(missingHashRegistry.build("task-run-history.v1")).rejects.toThrow(/task-run-history\.v1.*content-hash|content-hash.*task-run-history\.v1/i);

    const completeRegistry = createContextPackRegistry();
    completeRegistry.register({
      descriptor: {
        contextPackId: "task-run-history.v1",
        version: 1,
        label: "Task and run history",
        maxBytes: 16_384,
        requiredProvenanceKinds: ["event-id", "content-hash"],
        redactionPolicy: "safe-summary",
        sourceProjection: "agent.projection"
      },
      async build() {
        return buildContextPackRef({
          contextPackId: "task-run-history.v1",
          version: 1,
          generatedAt: "2026-07-07T22:00:00.000Z",
          payload: { events: ["evt_agent_task"], contentHash: contentHashRef },
          safeSummary: "One prior task event with content hash.",
          provenanceRefs: ["evt_agent_task", contentHashRef]
        });
      }
    });

    await expect(completeRegistry.build("task-run-history.v1")).resolves.toMatchObject({
      provenanceRefs: ["evt_agent_task", contentHashRef]
    });
  });

  it("rejects hand-rolled refs that under-report derived size bytes", async () => {
    const registry = createContextPackRegistry();
    registry.register({
      descriptor: {
        contextPackId: "task-run-history.v1",
        version: 1,
        label: "Task and run history",
        maxBytes: 8,
        requiredProvenanceKinds: ["event-id"],
        redactionPolicy: "safe-summary",
        sourceProjection: "agent.projection"
      },
      async build() {
        return {
          contextPackId: "task-run-history.v1",
          version: 1,
          contentHash: hashAgentContextPack({ events: ["evt_agent_task", "evt_agent_task_two"] }),
          sizeBytes: 1,
          generatedAt: "2026-07-07T22:00:00.000Z",
          safeSummary: "Forged tiny ref.",
          provenanceRefs: ["evt_agent_task"]
        } as ReturnType<typeof buildContextPackRef>;
      }
    });

    await expect(registry.build("task-run-history.v1")).rejects.toThrow(/buildContextPackRef|untrusted/i);
  });

  it("reports the exact missing builder error", async () => {
    const registry = createContextPackRegistry();

    await expect(registry.build("missing-pack.v1")).rejects.toThrow("Context pack missing-pack.v1 is not registered");
  });

  it("rejects malformed registry lookup ids before treating them as missing", async () => {
    const registry = createContextPackRegistry();

    await expect(registry.build("bad id with spaces")).rejects.toThrow(/valid context pack ID/i);
    expect(() => registry.getDescriptor("bad id with spaces")).toThrow(/valid context pack ID/i);
    await expect(registry.build("missing-pack.v1")).rejects.toThrow("Context pack missing-pack.v1 is not registered");
  });

  it("captures the registered builder function", async () => {
    const registry = createContextPackRegistry();
    const builder = {
      descriptor: {
        contextPackId: "task-run-history.v1",
        version: 1,
        label: "Task and run history",
        maxBytes: 16_384,
        requiredProvenanceKinds: ["event-id"],
        redactionPolicy: "safe-summary",
        sourceProjection: "agent.projection"
      },
      async build() {
        return buildContextPackRef({
          contextPackId: "task-run-history.v1",
          version: 1,
          generatedAt: "2026-07-07T22:00:00.000Z",
          payload: { events: ["evt_agent_task"] },
          safeSummary: "Original registered builder.",
          provenanceRefs: ["evt_agent_task"]
        });
      }
    };

    registry.register(builder);
    builder.build = async () =>
      buildContextPackRef({
        contextPackId: "task-run-history.v1",
        version: 1,
        generatedAt: "2026-07-07T22:00:00.000Z",
        payload: { events: ["evt_agent_task_mutated"] },
        safeSummary: "Mutated builder.",
        provenanceRefs: ["evt_agent_task_mutated"]
      });

    await expect(registry.build("task-run-history.v1")).resolves.toMatchObject({
      safeSummary: "Original registered builder.",
      provenanceRefs: ["evt_agent_task"]
    });
  });

  it("checks duplicate registration before touching duplicate build properties", () => {
    const registry = createContextPackRegistry();
    const descriptor = {
      contextPackId: "task-run-history.v1",
      version: 1,
      label: "Task and run history",
      maxBytes: 16_384,
      requiredProvenanceKinds: ["event-id"],
      redactionPolicy: "safe-summary",
      sourceProjection: "agent.projection"
    };
    registry.register({
      descriptor,
      async build() {
        return buildContextPackRef({
          contextPackId: "task-run-history.v1",
          version: 1,
          generatedAt: "2026-07-07T22:00:00.000Z",
          payload: { events: ["evt_agent_task"] },
          safeSummary: "Original registered builder.",
          provenanceRefs: ["evt_agent_task"]
        });
      }
    });

    let getterInvoked = false;
    const duplicateBuilder = { descriptor } as unknown as {
      descriptor: typeof descriptor;
      build(): ReturnType<typeof buildContextPackRef>;
    };
    Object.defineProperty(duplicateBuilder, "build", {
      enumerable: true,
      get() {
        getterInvoked = true;
        throw new Error("duplicate build getter invoked");
      }
    });

    expect(() => registry.register(duplicateBuilder)).toThrow("Context pack task-run-history.v1 is already registered");
    expect(getterInvoked).toBe(false);
  });

  it("checks duplicate registration before validating unrelated duplicate descriptor fields", () => {
    const registry = createContextPackRegistry();
    registry.register({
      descriptor: {
        contextPackId: "task-run-history.v1",
        version: 1,
        label: "Task and run history",
        maxBytes: 16_384,
        requiredProvenanceKinds: ["event-id"],
        redactionPolicy: "safe-summary",
        sourceProjection: "agent.projection"
      },
      async build() {
        return buildContextPackRef({
          contextPackId: "task-run-history.v1",
          version: 1,
          generatedAt: "2026-07-07T22:00:00.000Z",
          payload: { events: ["evt_agent_task"] },
          safeSummary: "Original registered builder.",
          provenanceRefs: ["evt_agent_task"]
        });
      }
    });

    let labelGetterInvoked = false;
    let buildGetterInvoked = false;
    const duplicateDescriptor = {
      contextPackId: "task-run-history.v1",
      version: 1,
      maxBytes: 0,
      requiredProvenanceKinds: ["event-id"],
      redactionPolicy: "api key sk-live-value",
      sourceProjection: "agent.projection"
    };
    Object.defineProperty(duplicateDescriptor, "label", {
      enumerable: true,
      get() {
        labelGetterInvoked = true;
        throw new Error("duplicate label getter invoked");
      }
    });
    const duplicateBuilder = { descriptor: duplicateDescriptor } as unknown as {
      descriptor: typeof duplicateDescriptor & { label: string };
      build(): ReturnType<typeof buildContextPackRef>;
    };
    Object.defineProperty(duplicateBuilder, "build", {
      enumerable: true,
      get() {
        buildGetterInvoked = true;
        throw new Error("duplicate build getter invoked");
      }
    });

    expect(() => registry.register(duplicateBuilder)).toThrow("Context pack task-run-history.v1 is already registered");
    expect(labelGetterInvoked).toBe(false);
    expect(buildGetterInvoked).toBe(false);
  });

  it("rejects non-primitive registry lookup ids without invoking coercion hooks", async () => {
    const registry = createContextPackRegistry();
    let coercionInvoked = false;
    const nonPrimitive = {
      [Symbol.toPrimitive]() {
        coercionInvoked = true;
        return "task-run-history.v1";
      },
      toString() {
        coercionInvoked = true;
        return "task-run-history.v1";
      }
    };

    let thrown: unknown;
    try {
      await registry.build(nonPrimitive as unknown as string);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(/contextPackId/i);
    expect(coercionInvoked).toBe(false);
  });

  it("rejects non-primitive descriptor lookups without invoking coercion hooks", () => {
    const registry = createContextPackRegistry();
    let coercionInvoked = false;
    const nonPrimitive = {
      [Symbol.toPrimitive]() {
        coercionInvoked = true;
        return "task-run-history.v1";
      },
      toString() {
        coercionInvoked = true;
        return "task-run-history.v1";
      }
    };

    let thrown: unknown;
    try {
      registry.getDescriptor(nonPrimitive as unknown as string);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(/contextPackId/i);
    expect(coercionInvoked).toBe(false);
  });

  it("rejects secret-shaped descriptor lookup ids", () => {
    const registry = createContextPackRegistry();

    expect(() => registry.getDescriptor("api key sk-live-value")).toThrow(/secret/i);
  });

  it("freezes built refs and registry descriptor snapshots", () => {
    const ref = buildContextPackRef({
      contextPackId: "task-run-history.v1",
      version: 1,
      generatedAt: "2026-07-07T22:00:00.000Z",
      payload: { events: ["evt_agent_task"] },
      safeSummary: "One prior task event.",
      provenanceRefs: ["evt_agent_task"]
    });
    expect(Object.isFrozen(ref)).toBe(true);
    expect(Object.isFrozen(ref.provenanceRefs)).toBe(true);
    expect(ref.sizeBytes).toBeGreaterThan(0);

    const registry = createContextPackRegistry();
    registry.register({
      descriptor: {
        contextPackId: "task-run-history.v1",
        version: 1,
        label: "Task and run history",
        maxBytes: 16_384,
        requiredProvenanceKinds: ["event-id"],
        redactionPolicy: "safe-summary",
        sourceProjection: "agent.projection"
      },
      async build() {
        return ref;
      }
    });

    const descriptors = registry.listDescriptors();
    const snapshot = registry.snapshot();

    expect(Object.isFrozen(descriptors)).toBe(true);
    expect(Object.isFrozen(descriptors[0])).toBe(true);
    expect(Object.isFrozen(descriptors[0]?.requiredProvenanceKinds)).toBe(true);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.contextPackIds)).toBe(true);
    expect(Object.isFrozen(snapshot.descriptors)).toBe(true);
  });
});
