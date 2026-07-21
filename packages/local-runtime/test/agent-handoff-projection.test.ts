import { describe, expect, it, vi } from "vitest";
import {
  validateKnowledgeEvent,
  type KnowledgeEvent,
  type KnowledgeEventOf
} from "../../ontology/src/contracts.js";
import {
  buildAuthorityBoundSpecialistHandoffManifest,
  buildSpecialistHandoffManifest,
  buildSpecialistHandoffMaterial,
  canonicalSpecialistHandoffJson,
  canonicalSpecialistHandoffMaterialBytes,
  computeSpecialistHandoffId,
  hashSpecialistHandoffManifest,
  hashSpecialistHandoffMaterial,
  type AuthorityBoundSpecialistHandoffManifest,
  type BuildSpecialistHandoffManifestInput,
  type SpecialistHandoffManifest,
  type SpecialistHandoffMaterial
} from "../../agent/src/specialist-handoff-manifest.js";
import type { HandoffAuthorityBinding } from "../../agent/src/specialist-handoff-authority.js";
import { isAgentSecretSafeText } from "../../agent/src/secret-safety.js";
import { buildResidentHandoffDto } from "../src/agent-handoff-projection.js";

type ContentHash = `sha256:${string}`;

const hash111 = "sha256:1111111111111111111111111111111111111111111111111111111111111111";
const hash222 = "sha256:2222222222222222222222222222222222222222222222222222222222222222";
const hash333 = "sha256:3333333333333333333333333333333333333333333333333333333333333333";
const hash444 = "sha256:4444444444444444444444444444444444444444444444444444444444444444";

describe("buildResidentHandoffDto", () => {
  it("rebuilds a frozen browser-safe V2 DTO after restart using exact role-bound reads and no effects", async () => {
    const fixture = handoffFixture();
    const eventsBefore = JSON.parse(JSON.stringify(fixture.completeEvents)) as unknown;
    const firstStores = storesFor(fixture);
    const secondStores = storesFor(fixture);
    const append = vi.fn();
    const invokeProvider = vi.fn();

    const first = await project(fixture, fixture.completeEvents, firstStores);
    const restarted = await project(fixture, fixture.completeEvents, secondStores);

    expect(restarted).toEqual(first);
    expect(restarted).toMatchObject({
      schemaVersion: "resident-handoff.v1",
      runId: fixture.runId,
      taskId: fixture.taskId,
      runType: "ontology-bootstrap",
      handoffId: fixture.manifest.handoffId,
      revision: 1,
      lifecycle: "task-completed",
      status: "ready-for-review",
      stateKind: "completed",
      safeSummary: "Ontology bootstrap proposal bundle is ready for review.",
      provenance: {
        manifestSchemaVersion: "agent-specialist-handoff-manifest.v2",
        handoffManifestHash: fixture.manifestHash,
        finalOutputStepId: fixture.finalOutputStepId,
        finalOutputEventId: fixture.finalOutputEventId,
        preparedEventId: fixture.prepared.id,
        recordedEventId: fixture.recorded.id,
        terminalRunEventId: fixture.terminal.id,
        taskStatusEventId: fixture.taskStatus.id
      }
    });
    expect(restarted.artifactRefs).toEqual(fixture.manifest.outputArtifacts);
    expect(restarted.sourceEventIds).toEqual(fixture.manifest.sourceEventIds);
    expect(restarted.relatedEventIds).toEqual(fixture.manifest.relatedEventIds);
    expect(restarted.approvalRequirements).toEqual([]);
    expect(restarted.nextSafeActions).toEqual([
      { kind: "review", effect: "none", label: "Review proposal bundle" }
    ]);
    expect(restarted.diagnostics).toEqual([]);
    expect(Object.isFrozen(restarted)).toBe(true);
    expect(Object.isFrozen(restarted.artifactRefs)).toBe(true);
    expect(Object.isFrozen(restarted.artifactRefs[0])).toBe(true);
    expect(JSON.parse(JSON.stringify(fixture.completeEvents))).toEqual(eventsBefore);

    for (const stores of [firstStores, secondStores]) {
      expect(stores.materialStore.get.mock.calls.every(([hash]) => hash === fixture.materialHash)).toBe(true);
      expect(stores.manifestStore.get.mock.calls.every(([hash]) => hash === fixture.manifestHash)).toBe(true);
      expect(stores.materialStore.put).not.toHaveBeenCalled();
      expect(stores.manifestStore.put).not.toHaveBeenCalled();
    }
    expect(append).not.toHaveBeenCalled();
    expect(invokeProvider).not.toHaveBeenCalled();
    expect(JSON.stringify(restarted)).not.toMatch(/manifestBytes|rawArtifact|storeKind|registry|stack|\/home\/|credential|providerPayload/i);
  });

  it("projects recorded-only V2 lifecycle after restart without synthesizing terminal provenance", async () => {
    const fixture = handoffFixture();
    const events = fixture.recordedEvents;

    const first = await project(fixture, events, storesFor(fixture));
    const restarted = await project(fixture, events, storesFor(fixture));

    expect(restarted).toEqual(first);
    expect(restarted.lifecycle).toBe("handoff-recorded");
    expect(restarted.status).toBe("ready-for-review");
    expect(restarted.provenance).toBeUndefined();
    expect(restarted.diagnostics).toEqual([]);
  });

  it("keeps output-persisted and handoff-pending resumable and non-executable", async () => {
    const fixture = handoffFixture();
    const outputPersisted = await project(
      fixture,
      fixture.recordedEvents.slice(0, 2),
      storesFor(fixture)
    );
    const handoffPending = await project(
      fixture,
      fixture.recordedEvents.slice(0, 3),
      storesFor(fixture)
    );

    expect(outputPersisted.lifecycle).toBe("output-persisted");
    expect(outputPersisted.provenance).toBeUndefined();
    expect(outputPersisted.nextSafeActions.every((action) => action.effect === "none")).toBe(true);
    expect(handoffPending.lifecycle).toBe("handoff-pending");
    expect(handoffPending.provenance).toBeUndefined();
    expect(handoffPending.nextSafeActions.every((action) => action.effect === "none")).toBe(true);
  });

  it.each([
    ["waiting-for-approval", "resumable"],
    ["blocked", "resumable"]
  ] as const)("keeps %s handoffs resumable and never task-completed", async (status, stateKind) => {
    const fixture = handoffFixture({ status });
    const dto = await project(
      fixture,
      [...fixture.recordedEvents, fixture.terminal],
      storesFor(fixture)
    );

    expect(dto.lifecycle).not.toBe("task-completed");
    expect(dto.status).toBe(status);
    expect(dto.stateKind).toBe(stateKind);
    expect(dto.provenance).toBeUndefined();
    expect(dto.nextSafeActions.length).toBeGreaterThan(0);
    expect(dto.nextSafeActions.every((action) => action.effect === "none")).toBe(true);
  });

  it("maps an exact failed terminal chain to failed terminal-consistent, never task-completed", async () => {
    const fixture = handoffFixture({ status: "failed" });

    const dto = await project(fixture, fixture.completeEvents, storesFor(fixture));

    expect(dto.lifecycle).toBe("terminal-consistent");
    expect(dto.status).toBe("failed");
    expect(dto.stateKind).toBe("failed");
    expect(dto.nextSafeActions.length).toBeGreaterThan(0);
    expect(dto.nextSafeActions.every((action) => action.effect === "none")).toBe(true);
    expect(dto.lifecycle).not.toBe("task-completed");
  });

  it.each([
    ["ready-for-review", "completed"],
    ["failed", "failed"]
  ] as const)("maps an exact terminal-only %s chain to terminal-consistent without task completion", async (status, stateKind) => {
    const fixture = handoffFixture({ status });

    const dto = await project(
      fixture,
      [...fixture.recordedEvents, fixture.terminal],
      storesFor(fixture)
    );

    expect(dto.lifecycle).toBe("terminal-consistent");
    expect(dto.lifecycle).not.toBe("task-completed");
    expect(dto.status).toBe(status);
    expect(dto.stateKind).toBe(stateKind);
    expect(dto.provenance).toBeUndefined();
    expect(dto.nextSafeActions.every((action) => action.effect === "none")).toBe(true);
  });

  it("keeps historical V1 replay legacy-unbound with no provenance or executable action", async () => {
    const fixture = handoffFixture({ legacy: true });

    const dto = await project(fixture, fixture.recordedEvents, storesFor(fixture));

    expect(dto.lifecycle).toBe("legacy-unbound");
    expect(dto.provenance).toBeUndefined();
    expect(dto.artifactRefs).toEqual([]);
    expect(dto.sourceEventIds).toEqual([]);
    expect(dto.relatedEventIds).toEqual([]);
    expect(dto.approvalRequirements).toEqual([]);
    expect(dto.nextSafeActions).toEqual([
      { kind: "repair", effect: "none", label: "Migrate the legacy handoff after authority review" }
    ]);
    expect(dto.diagnostics).toEqual([
      expect.objectContaining({
        category: "legacy-manifest-unbound",
        retry: "after-review"
      })
    ]);
  });

  it.each([
    ["missing manifest", "manifest-missing"],
    ["missing material", "artifact-missing"],
    ["swapped stores", "artifact-hash-mismatch"],
    ["corrupt manifest", "manifest-content-mismatch"]
  ] as const)("fails closed for %s", async (mode, category) => {
    const fixture = handoffFixture();
    const stores = storesFor(fixture, mode);

    const dto = await project(fixture, fixture.completeEvents, stores);

    expectClosed(dto, "inconsistent", category);
    expect(stores.materialStore.put).not.toHaveBeenCalled();
    expect(stores.manifestStore.put).not.toHaveBeenCalled();
  });

  it("rejects cross-run identity and source bindings without arbitrary selection", async () => {
    const fixture = handoffFixture();
    const duplicateStarted = {
      ...fixture.started,
      id: "evt_started_duplicate_cross_run",
      payload: {
        ...fixture.started.payload,
        taskId: "task_other",
        runType: "prr-negotiation"
      }
    } as KnowledgeEvent;
    const duplicateDto = await project(
      fixture,
      [fixture.started, duplicateStarted, ...fixture.completeEvents.slice(1)],
      storesFor(fixture)
    );
    expectClosed(duplicateDto, "inconsistent", "provenance-cross-run");

    const foreign = handoffFixture({ runId: "run_foreign_source", taskId: "task_foreign_source" });
    const sourceSwapped = handoffFixture({ sourceEventId: foreign.started.id });
    const swappedDto = await project(
      sourceSwapped,
      [...sourceSwapped.completeEvents, foreign.started],
      storesFor(sourceSwapped)
    );
    expectClosed(swappedDto, "inconsistent", "source-swapped");
  });

  it("rejects missing source provenance before exposing verified lifecycle state", async () => {
    const fixture = handoffFixture({ sourceEventId: "evt_missing_projection_source" });

    const dto = await project(fixture, fixture.completeEvents, storesFor(fixture));

    expectClosed(dto, "inconsistent", "source-missing");
  });

  it("rejects a stale current authority binding and omits replay provenance", async () => {
    const fixture = handoffFixture();
    const stale = {
      ...fixture.authorityBinding,
      mountGeneration: "mount_generation_stale"
    };

    const dto = await buildResidentHandoffDto({
      runId: fixture.runId,
      events: fixture.completeEvents,
      materialStore: storesFor(fixture).materialStore,
      manifestStore: storesFor(fixture).manifestStore,
      authorityBinding: stale
    });

    expectClosed(dto, "inconsistent", "mount-authority-stale");
  });

  it("maps a portable mounted-authority read failure to bounded unavailable state", async () => {
    const fixture = handoffFixture();
    const stores = storesFor(fixture);
    stores.materialStore.failure = new Error("portable-mounted-handoff-authority-invalid");

    const dto = await project(fixture, fixture.completeEvents, stores);

    expectClosed(dto, "unavailable", "workspace-unavailable");
    expect(dto.diagnostics[0]).toMatchObject({ retry: "after-remount" });
    expect(JSON.stringify(dto)).not.toContain("portable-mounted-handoff-authority-invalid");
    expect(stores.materialStore.put).not.toHaveBeenCalled();
    expect(stores.manifestStore.put).not.toHaveBeenCalled();
  });

  it("uses a fixed safe identity for invalid top-level input without retaining hostile runId text", async () => {
    const fixture = handoffFixture();
    const stores = storesFor(fixture);
    const hostileRunId = "raw-provider-secret-run-identity";

    const dto = await buildResidentHandoffDto({
      runId: hostileRunId,
      events: [],
      materialStore: stores.materialStore,
      manifestStore: stores.manifestStore,
      authorityBinding: fixture.authorityBinding
    });

    expectClosed(dto, "inconsistent", "run-identity-missing");
    expect(dto.runId).toBe("unavailable-run");
    expect(JSON.stringify(dto)).not.toContain(hostileRunId);
    expect(stores.materialStore.get).not.toHaveBeenCalled();
    expect(stores.manifestStore.get).not.toHaveBeenCalled();
  });

  it.each([
    ["runId", "run-private-key"],
    ["taskId", "task-private-key"]
  ] as const)("rejects a matching started-event %s unless it is secret-safe", async (field, unsafeIdentity) => {
    const fixture = handoffFixture();
    const stores = storesFor(fixture);
    const started = {
      ...fixture.started,
      ...(field === "runId" ? { streamId: `agent_run_${unsafeIdentity}` } : {}),
      payload: {
        ...fixture.started.payload,
        [field]: unsafeIdentity
      }
    } as KnowledgeEvent;

    expect(isAgentSecretSafeText(unsafeIdentity)).toBe(false);

    const dto = await buildResidentHandoffDto({
      runId: field === "runId" ? unsafeIdentity : fixture.runId,
      events: [started],
      materialStore: stores.materialStore,
      manifestStore: stores.manifestStore,
      authorityBinding: fixture.authorityBinding
    });

    expectClosed(dto, "inconsistent", "secret-safety-rejection");
    expect(dto.runId).toBe("unavailable-run");
    expect(dto.taskId).toBeUndefined();
    expect(JSON.stringify(dto)).not.toContain(unsafeIdentity);
    expect(stores.materialStore.get).not.toHaveBeenCalled();
    expect(stores.manifestStore.get).not.toHaveBeenCalled();
  });

  it.each([
    ["payload", (fixture: ProjectionFixture) => ({
      ...fixture.prepared,
      id: "evt_task138_malformed_payload",
      payload: null
    })],
    ["context", (fixture: ProjectionFixture) => ({
      ...fixture.started,
      id: "evt_task138_malformed_context",
      streamId: "agent_run_run_task138_malformed_context",
      context: null,
      payload: {
        ...fixture.started.payload,
        runId: "run_task138_malformed_context"
      }
    })],
    ["type", (fixture: ProjectionFixture) => ({
      ...fixture.started,
      id: "evt_task138_malformed_type",
      type: "agent.task138.unknown",
      streamId: "agent_run_run_task138_malformed_type",
      payload: {
        ...fixture.started.payload,
        runId: "run_task138_malformed_type"
      }
    })]
  ] as const)("contains a normalized plain-own event with schema-malformed %s data", async (_field, malformedEvent) => {
    const fixture = handoffFixture();
    const stores = storesFor(fixture);
    const malformed = malformedEvent(fixture);

    expect(validateKnowledgeEvent(malformed).success).toBe(false);

    const dto = await buildResidentHandoffDto({
      runId: fixture.runId,
      events: [fixture.started, malformed as KnowledgeEvent],
      materialStore: stores.materialStore,
      manifestStore: stores.manifestStore,
      authorityBinding: fixture.authorityBinding
    });

    expectClosed(dto, "inconsistent", "dto-invalid");
    expect(isAgentSecretSafeText(JSON.stringify(dto))).toBe(true);
    expect(stores.materialStore.get).not.toHaveBeenCalled();
    expect(stores.manifestStore.get).not.toHaveBeenCalled();
  });

  it.each(["descriptor", "prototype"] as const)(
    "contains hostile Proxy %s traps inside the bounded async boundary",
    async (trap) => {
      const fixture = handoffFixture();
      const stores = storesFor(fixture);
      const hostileText = `raw-provider-secret-${trap}-trap`;
      const input = trap === "descriptor"
        ? new Proxy({}, {
          getOwnPropertyDescriptor() {
            throw new Error(hostileText);
          }
        })
        : {
          runId: fixture.runId,
          events: new Proxy([], {
            getPrototypeOf() {
              throw new Error(hostileText);
            }
          }),
          materialStore: stores.materialStore,
          manifestStore: stores.manifestStore,
          authorityBinding: fixture.authorityBinding
        };

      const dto = await buildResidentHandoffDto(input as never);

      expectClosed(dto, "inconsistent", "unsafe-boundary-value");
      expect(dto.runId).toBe("unavailable-run");
      expect(JSON.stringify(dto)).not.toContain(hostileText);
      expect(stores.materialStore.get).not.toHaveBeenCalled();
      expect(stores.manifestStore.get).not.toHaveBeenCalled();
    }
  );

  it("preserves only safe upstream diagnostic event IDs and hashes without copying raw messages", async () => {
    const fixture = handoffFixture();

    const dto = await project(
      fixture,
      fixture.completeEvents,
      storesFor(fixture, "corrupt manifest")
    );

    expectClosed(dto, "inconsistent", "manifest-content-mismatch");
    expect(dto.diagnostics[0]).toMatchObject({
      eventIds: [fixture.prepared.id],
      artifactHashes: expect.arrayContaining([fixture.manifestHash])
    });
    expect(dto.diagnostics[0]?.artifactHashes).toHaveLength(2);
    expect(dto.diagnostics[0]?.artifactHashes.every((hash) => /^sha256:[a-f0-9]{64}$/.test(hash))).toBe(true);
    expect(JSON.stringify(dto)).not.toContain("Recorded handoff manifest bytes are not parseable canonical JSON.");
  });

  it("drops unsafe upstream diagnostic IDs and hashes while retaining safe related event evidence", async () => {
    const fixture = handoffFixture();
    if (fixture.terminal.type !== "agent.specialist-run.completed") {
      throw new Error("ready-for-review fixture must have a completed terminal");
    }
    const hostileEventId = "raw-provider-secret-event-id";
    const hostileArtifactHash = "raw-provider-secret-artifact-hash";
    const hostileTerminal = {
      ...fixture.terminal,
      id: hostileEventId,
      payload: {
        ...fixture.terminal.payload,
        outputArtifactHashes: [hostileArtifactHash]
      }
    } as unknown as KnowledgeEvent;

    const dto = await project(
      fixture,
      [...fixture.recordedEvents, hostileTerminal],
      storesFor(fixture)
    );

    expectClosed(dto, "inconsistent", "terminal-status-conflict");
    expect(dto.diagnostics[0]).toMatchObject({
      eventIds: [fixture.recorded.id],
      artifactHashes: []
    });
    expect(JSON.stringify(dto)).not.toMatch(/raw-provider-secret|Terminal run state must agree|Completed run output hashes disagree/);
  });

  it("drops syntax-valid secret-unsafe diagnostic event IDs while retaining safe evidence", async () => {
    const fixture = handoffFixture();
    if (fixture.terminal.type !== "agent.specialist-run.completed") {
      throw new Error("ready-for-review fixture must have a completed terminal");
    }
    const unsafeEventId = "evt_sk_live_task138unsafe";
    const terminal = {
      ...fixture.terminal,
      id: unsafeEventId,
      payload: {
        ...fixture.terminal.payload,
        outputArtifactHashes: [hash111]
      }
    } as KnowledgeEvent;

    expect(/^evt_[a-zA-Z0-9_-]+$/.test(unsafeEventId)).toBe(true);
    expect(validateKnowledgeEvent(terminal).success).toBe(true);
    expect(isAgentSecretSafeText(unsafeEventId)).toBe(false);

    const dto = await project(
      fixture,
      [...fixture.recordedEvents, terminal],
      storesFor(fixture)
    );

    expectClosed(dto, "inconsistent", "terminal-status-conflict");
    expect(dto.diagnostics[0]?.eventIds).toEqual([fixture.recorded.id]);
    expect(JSON.stringify(dto)).not.toContain(unsafeEventId);
  });

  it.each([
    ["ready-for-review", "completed"],
    ["failed", "failed"]
  ] as const)("uses the released authoritative record for an exact %s recorded retry terminal", async (status, stateKind) => {
    const fixture = handoffFixture({ status });
    const exactRetry = {
      ...fixture.recorded,
      id: `evt_handoff_recorded_exact_retry_${status.replace(/-/g, "_")}`
    } as KnowledgeEvent;

    expect(validateKnowledgeEvent(exactRetry).success).toBe(true);
    expect(fixture.terminal.context.causationId).toBe(fixture.recorded.id);
    expect(fixture.terminal.context.causationId).not.toBe(exactRetry.id);

    const dto = await project(
      fixture,
      [...fixture.recordedEvents, exactRetry, fixture.terminal],
      storesFor(fixture)
    );

    expect(dto.lifecycle).toBe("terminal-consistent");
    expect(dto.status).toBe(status);
    expect(dto.stateKind).toBe(stateKind);
    expect(dto.provenance).toBeUndefined();
    expect(dto.nextSafeActions.every((action) => action.effect === "none")).toBe(true);
  });

  it("rejects hostile accessors before observation or store IO and retains no hostile value", async () => {
    const fixture = handoffFixture();
    const stores = storesFor(fixture);
    const getter = vi.fn(() => {
      throw new Error("/home/investigator/.secrets/provider-token");
    });
    const hostileEvents = [...fixture.completeEvents] as KnowledgeEvent[];
    Object.defineProperty(hostileEvents, "0", {
      configurable: true,
      enumerable: true,
      get: getter
    });

    const dto = await buildResidentHandoffDto({
      runId: fixture.runId,
      events: hostileEvents,
      materialStore: stores.materialStore,
      manifestStore: stores.manifestStore,
      authorityBinding: fixture.authorityBinding
    });

    expectClosed(dto, "inconsistent", "unsafe-boundary-value");
    expect(getter).not.toHaveBeenCalled();
    expect(stores.materialStore.get).not.toHaveBeenCalled();
    expect(stores.manifestStore.get).not.toHaveBeenCalled();
    expect(JSON.stringify(dto)).not.toMatch(/investigator|provider-token|\.secrets|\/home\//i);
  });

  it("rejects secret-shaped unknown event data without retaining it", async () => {
    const fixture = handoffFixture();
    const events = fixture.completeEvents.map((event, index) => index === 0
      ? {
        ...event,
        payload: { ...event.payload, credentialValue: "sk-hostile-raw-provider-secret" }
      } as unknown as KnowledgeEvent
      : event);
    const stores = storesFor(fixture);

    const dto = await project(fixture, events, stores);

    expectClosed(dto, "inconsistent", "secret-safety-rejection");
    expect(stores.materialStore.get).not.toHaveBeenCalled();
    expect(stores.manifestStore.get).not.toHaveBeenCalled();
    expect(JSON.stringify(dto)).not.toMatch(/sk-hostile|credentialValue|provider-secret/i);
  });
});

interface ProjectionFixture {
  readonly runId: string;
  readonly taskId: string;
  readonly authorityBinding: HandoffAuthorityBinding;
  readonly material: SpecialistHandoffMaterial;
  readonly materialHash: ContentHash;
  readonly manifest: SpecialistHandoffManifest | AuthorityBoundSpecialistHandoffManifest;
  readonly manifestHash: ContentHash;
  readonly finalOutputStepId: string;
  readonly finalOutputEventId: string;
  readonly started: KnowledgeEventOf<"agent.specialist-run.started">;
  readonly prepared: KnowledgeEventOf<"agent.specialist-handoff.prepared">;
  readonly recorded: KnowledgeEventOf<"agent.specialist-handoff.recorded">;
  readonly terminal:
    | KnowledgeEventOf<"agent.specialist-run.completed">
    | KnowledgeEventOf<"agent.specialist-run.failed">;
  readonly taskStatus: KnowledgeEventOf<"agent.task.status.changed">;
  readonly recordedEvents: readonly KnowledgeEvent[];
  readonly completeEvents: readonly KnowledgeEvent[];
}

class ReadStore {
  readonly get = vi.fn(async (hash: ContentHash): Promise<Buffer> => {
    if (this.failure !== undefined) throw this.failure;
    const bytes = this.bytes.get(hash);
    if (bytes === undefined) throw new Error("Mounted handoff artifact store operation failed.");
    return Buffer.from(bytes);
  });
  readonly put = vi.fn(async () => {
    throw new Error("read-only projection must not write");
  });
  failure: Error | undefined;

  constructor(private readonly bytes: ReadonlyMap<ContentHash, Buffer>) {}
}

interface FixtureStores {
  readonly materialStore: ReadStore;
  readonly manifestStore: ReadStore;
}

function storesFor(
  fixture: ProjectionFixture,
  mode?: "missing manifest" | "missing material" | "swapped stores" | "corrupt manifest"
): FixtureStores {
  const materialBytes = canonicalSpecialistHandoffMaterialBytes(fixture.material);
  const manifestBytes = canonicalSpecialistHandoffJson(fixture.manifest);
  const material = new Map<ContentHash, Buffer>();
  const manifest = new Map<ContentHash, Buffer>();
  if (mode === "swapped stores") {
    material.set(fixture.materialHash, manifestBytes);
    manifest.set(fixture.manifestHash, materialBytes);
  } else {
    if (mode !== "missing material") material.set(fixture.materialHash, materialBytes);
    if (mode !== "missing manifest") {
      manifest.set(
        fixture.manifestHash,
        mode === "corrupt manifest" ? Buffer.from("{not-canonical-json", "utf8") : manifestBytes
      );
    }
  }
  return {
    materialStore: new ReadStore(material),
    manifestStore: new ReadStore(manifest)
  };
}

async function project(
  fixture: ProjectionFixture,
  events: readonly KnowledgeEvent[],
  stores: FixtureStores
) {
  return await buildResidentHandoffDto({
    runId: fixture.runId,
    events,
    materialStore: stores.materialStore,
    manifestStore: stores.manifestStore,
    authorityBinding: fixture.authorityBinding
  });
}

function expectClosed(
  dto: Awaited<ReturnType<typeof buildResidentHandoffDto>>,
  lifecycle: "unavailable" | "inconsistent",
  category: string
): void {
  expect(dto.lifecycle).toBe(lifecycle);
  expect(dto.provenance).toBeUndefined();
  expect(dto.artifactRefs).toEqual([]);
  expect(dto.sourceEventIds).toEqual([]);
  expect(dto.relatedEventIds).toEqual([]);
  expect(dto.approvalRequirements).toEqual([]);
  expect(dto.nextSafeActions.length).toBeGreaterThan(0);
  expect(dto.nextSafeActions.every((action) => action.effect === "none")).toBe(true);
  expect(dto.diagnostics).toContainEqual(expect.objectContaining({ category }));
}

function handoffFixture(options: {
  readonly legacy?: boolean;
  readonly runId?: string;
  readonly taskId?: string;
  readonly sourceEventId?: string;
  readonly status?: BuildSpecialistHandoffManifestInput["status"];
} = {}): ProjectionFixture {
  const runId = options.runId ?? "run_task138_projection_001";
  const taskId = options.taskId ?? "task_task138_projection_001";
  const status = options.status ?? "ready-for-review";
  const sourceEventId = options.sourceEventId ?? `evt_started_${runId}`;
  const finalOutputEventId = `evt_final_output_${runId}`;
  const finalOutputStepId = `step_final_output_${runId}`;
  const outputArtifact = {
    artifactId: "artifact_ontology_proposal_bundle",
    artifactKind: "ontology-proposal-bundle",
    schemaId: "ontology-bootstrap-handoff.v1",
    artifactHash: hash222,
    safeSummary: "Evidence-bound ontology proposals are ready for review."
  } as const;
  const contextPack = {
    contextPackId: "ontology-bootstrap-context.v1",
    version: 1,
    contentHash: hash333,
    sizeBytes: 256,
    generatedAt: "2026-07-21T14:00:00.000Z",
    safeSummary: "Canonical staged-report context.",
    provenanceRefs: [sourceEventId],
    sourceEventIds: [sourceEventId],
    artifactHashes: [hash444]
  } as const;
  const material = buildSpecialistHandoffMaterial({
    status,
    safeSummary: safeSummaryFor(status),
    contextPackRefs: [contextPack],
    promptArtifactHash: hash111,
    outputArtifacts: [outputArtifact],
    toolRequestIds: [],
    approvalRequirements: status === "waiting-for-approval"
      ? [{ approvalClass: "human-review", reason: "Independent review is required." }]
      : [],
    nextSafeActions: [{
      actionId: status === "waiting-for-approval" ? "action_request_review" : "action_review_proposals",
      label: status === "waiting-for-approval" ? "Request proposal review" : status === "blocked" || status === "failed" ? "Repair proposal handoff" : "Review proposal bundle",
      kind: status === "waiting-for-approval" ? "request-approval" : status === "blocked" || status === "failed" ? "retry" : "review",
      effect: status === "waiting-for-approval" ? "request-approval" : "none",
      artifactId: outputArtifact.artifactId
    }],
    ...(status === "failed" ? {
      failure: {
        category: "model-output-invalid",
        code: "model-output-invalid",
        safeSummary: "Proposal output could not be verified.",
        retryable: true
      }
    } : {}),
    sourceEventIds: [sourceEventId],
    relatedEventIds: [sourceEventId]
  });
  const materialHash = hashSpecialistHandoffMaterial(material);
  const handoffId = computeSpecialistHandoffId({
    runId,
    taskId,
    runType: "ontology-bootstrap",
    status,
    finalOutputEventId,
    outputArtifactHashes: [outputArtifact.artifactHash],
    handoffRevision: 1
  });
  const authorityBinding = Object.freeze({
    workspaceIdentityHash: hash111,
    mountGeneration: "mount_generation_task138_001",
    ledgerStoreIdentity: "ledger_store_task138_001",
    artifactStoreIdentity: "artifact_store_task138_001",
    ledgerHighWaterEventId: `evt_started_${runId}`,
    policyHash: hash222,
    activeLocksHash: hash333
  }) satisfies HandoffAuthorityBinding;
  const manifestInput: BuildSpecialistHandoffManifestInput = {
    handoffId,
    handoffRevision: 1,
    runId,
    taskId,
    runType: "ontology-bootstrap",
    residentAgentId: "agent_default",
    generatedAt: "2026-07-21T14:01:00.000Z",
    status,
    safeSummary: safeSummaryFor(status),
    stateKind: status === "failed" ? "failed" : status === "ready-for-review" ? "completed" : "resumable",
    finalOutputStepId,
    finalOutputEventId,
    handoffMaterialArtifactHash: materialHash,
    contextPackRefs: [contextPack],
    promptArtifactHash: hash111,
    outputArtifacts: [outputArtifact],
    toolRequestIds: [],
    approvalRequirements: status === "waiting-for-approval"
      ? [{ approvalClass: "human-review", reason: "Independent review is required." }]
      : [],
    nextSafeActions: [{
      actionId: status === "waiting-for-approval" ? "action_request_review" : "action_review_proposals",
      label: status === "waiting-for-approval" ? "Request proposal review" : status === "blocked" || status === "failed" ? "Repair proposal handoff" : "Review proposal bundle",
      kind: status === "waiting-for-approval" ? "request-approval" : status === "blocked" || status === "failed" ? "retry" : "review",
      effect: status === "waiting-for-approval" ? "request-approval" : "none",
      artifactId: outputArtifact.artifactId
    }],
    ...(status === "failed" ? {
      failure: {
        category: "model-output-invalid",
        code: "model-output-invalid",
        safeSummary: "Proposal output could not be verified.",
        retryable: true
      }
    } : {}),
    sourceEventIds: [sourceEventId],
    relatedEventIds: [sourceEventId]
  };
  const manifest = options.legacy === true
    ? buildSpecialistHandoffManifest(manifestInput)
    : buildAuthorityBoundSpecialistHandoffManifest({ ...manifestInput, authorityBinding });
  const manifestHash = hashSpecialistHandoffManifest(manifest);
  const started = agentEvent("agent.specialist-run.started", `evt_started_${runId}`, {
    runId,
    residentAgentId: "agent_default",
    runType: "ontology-bootstrap",
    startedBy: "actor_cestus_agent",
    taskId,
    sourceEventIds: ["evt_source_task138"],
    inputArtifactHashes: [hash111]
  });
  const finalOutput = agentEvent("agent.specialist-run.step.recorded", finalOutputEventId, {
    runId,
    stepId: finalOutputStepId,
    summary: "Final proposal bundle material is durably persisted.",
    stepKind: "final-output",
    stepSchemaId: "ontology-bootstrap-handoff.v1",
    idempotencyKey: `specialist-final-output:${runId}:${taskId}:ontology-bootstrap:${status}:${materialHash}`,
    handoffMaterialArtifactHash: materialHash,
    inputArtifactHashes: [hash333, hash444, hash111],
    outputArtifactHashes: [hash222]
  });
  const compact = compactBinding(manifest, manifestHash);
  const preparedPayload = manifest.schemaVersion === "agent-specialist-handoff-manifest.v2"
    ? { ...compact, manifestSchemaVersion: manifest.schemaVersion, authorityBinding }
    : compact;
  const prepared = agentEvent(
    "agent.specialist-handoff.prepared",
    `evt_handoff_prepared_${runId}`,
    preparedPayload,
    { causationId: finalOutput.id }
  );
  const recorded = agentEvent("agent.specialist-handoff.recorded", `evt_handoff_recorded_${runId}`, {
    ...preparedPayload,
    preparedEventId: prepared.id,
    verifiedAt: "2026-07-21T14:02:00.000Z"
  }, { causationId: prepared.id });
  const terminal = status === "failed"
    ? agentEvent("agent.specialist-run.failed", `evt_run_failed_${runId}`, {
      runId,
      failedAt: "2026-07-21T14:03:00.000Z",
      category: "model-output-invalid",
      message: "Proposal output failed safe verification.",
      retryable: true,
      allowedActions: ["inspect-retry"],
      relatedEventIds: [recorded.id]
    }, { causationId: recorded.id })
    : agentEvent("agent.specialist-run.completed", `evt_run_completed_${runId}`, {
      runId,
      completedAt: "2026-07-21T14:03:00.000Z",
      outputArtifactHashes: [hash222],
      relatedEventIds: [finalOutput.id],
      summary: "Authority-bound ontology bootstrap reached terminal local state."
    }, { causationId: recorded.id });
  const orchestration = {
    ...agentEvent("agent.task.orchestration.completed", `evt_orchestration_completed_${runId}`, {
      taskId,
      runType: "ontology-bootstrap",
      attemptId: `attempt_${runId}`,
      retryGeneration: 0,
      runId,
      completedAt: "2026-07-21T14:04:00.000Z",
      specialistRunCompletedEventId: terminal.id,
      finalOutputStepEventId: finalOutput.id,
      handoffPreparedEventId: prepared.id,
      handoffRecordedEventId: recorded.id,
      handoffReadback: {
        handoffId: manifest.handoffId,
        handoffManifestHash: manifestHash,
        handoffRecordedEventId: recorded.id,
        verifiedAt: recorded.payload.verifiedAt
      }
    }, { causationId: terminal.id }),
    streamId: `agent_task_orchestration_${taskId}_ontology-bootstrap`
  };
  const taskStatus = agentEvent("agent.task.status.changed", `evt_task_completed_${runId}`, {
    taskId,
    status: status === "failed" ? "failed" : "completed",
    changedBy: "actor_cestus_agent",
    reason: "Task completed after exact durable handoff readback.",
    runId
  }, { causationId: orchestration.id });
  const recordedEvents = Object.freeze([started, finalOutput, prepared, recorded]);
  const completeEvents = Object.freeze([...recordedEvents, terminal, orchestration, taskStatus]);

  return Object.freeze({
    runId,
    taskId,
    authorityBinding,
    material,
    materialHash,
    manifest,
    manifestHash,
    finalOutputStepId,
    finalOutputEventId,
    started,
    prepared,
    recorded,
    terminal,
    taskStatus,
    recordedEvents,
    completeEvents
  });
}

function safeSummaryFor(status: BuildSpecialistHandoffManifestInput["status"]): string {
  switch (status) {
    case "waiting-for-approval":
      return "Ontology bootstrap proposal bundle is waiting for independent review.";
    case "blocked":
      return "Ontology bootstrap proposal bundle is blocked pending safe repair.";
    case "failed":
      return "Ontology bootstrap proposal bundle records a failed result.";
    default:
      return "Ontology bootstrap proposal bundle is ready for review.";
  }
}

function compactBinding(
  manifest: SpecialistHandoffManifest | AuthorityBoundSpecialistHandoffManifest,
  manifestHash: ContentHash
): KnowledgeEventOf<"agent.specialist-handoff.prepared">["payload"] {
  return {
    handoffId: manifest.handoffId,
    handoffRevision: manifest.handoffRevision,
    idempotencyKey: `specialist-handoff:${manifest.runId}:${manifest.taskId ?? "none"}:${manifest.runType}:${manifest.status}:${manifestHash}`,
    handoffManifestHash: manifestHash,
    handoffMaterialArtifactHash: manifest.handoffMaterialArtifactHash,
    handoffDtoHash: manifest.handoffDtoHash,
    runId: manifest.runId,
    ...(manifest.taskId === undefined ? {} : { taskId: manifest.taskId }),
    runType: "ontology-bootstrap",
    residentAgentId: "agent_default",
    status: manifest.status,
    safeSummary: manifest.safeSummary,
    finalOutputStepId: manifest.finalOutputStepId,
    finalOutputEventId: manifest.finalOutputEventId,
    contextPackHashes: manifest.contextPackRefs.map((ref) => ref.contentHash),
    ...(manifest.promptArtifactHash === undefined ? {} : { promptArtifactHash: manifest.promptArtifactHash }),
    outputArtifactHashes: manifest.outputArtifacts.map((artifact) => artifact.artifactHash),
    toolRequestIds: [...manifest.toolRequestIds],
    sourceEventIds: [...manifest.sourceEventIds],
    relatedEventIds: [...manifest.relatedEventIds]
  };
}

function agentEvent<Type extends KnowledgeEvent["type"]>(
  type: Type,
  id: string,
  payload: KnowledgeEventOf<Type>["payload"],
  options: { readonly causationId?: string } = {}
): KnowledgeEventOf<Type> {
  const payloadRecord = payload as Record<string, unknown>;
  return {
    id,
    type,
    version: 1,
    streamId: type.startsWith("agent.task.")
      ? `agent_task_${String(payloadRecord.taskId)}`
      : `agent_run_${String(payloadRecord.runId)}`,
    sequence: 1,
    context: {
      actor: { id: "actor_cestus_agent", kind: "agent", label: "Cestus Agent" },
      occurredAt: "2026-07-21T14:00:00.000Z",
      correlationId: "corr_task138_projection",
      ...(options.causationId === undefined ? {} : { causationId: options.causationId }),
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", agent: "0.1.0" }
    },
    payload
  } as unknown as KnowledgeEventOf<Type>;
}
