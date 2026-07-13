import { describe, expect, it, vi } from "vitest";
import { validateKnowledgeEvent } from "../../ontology/src/contracts.js";
import {
  buildTriggerGateKey,
  canonicalTriggerIdentity,
  createEvidenceGapContradictionDescriptor,
  createWorkspaceRecoveryDescriptor,
  deriveAdmissionScope,
  evaluateResidentTrigger,
  verifiedRequestFields,
  type MountedTriggerAuthority,
  type MountedTriggerPolicy,
  type TriggerEvaluationInput
} from "../src/proactive-triggers.js";
import { buildTriggerRequestProjection } from "../src/trigger-projection.js";

const hash = (letter: string): `sha256:${string}` => `sha256:${letter.repeat(64)}`;

function descriptor(overrides: Record<string, unknown> = {}) {
  return {
    descriptorVersion: "resident-trigger-descriptor.v1",
    triggerId: "trigger_prr_monitor",
    triggerFamily: "prr-monitoring",
    descriptorRevision: "1",
    requestedRunType: "prr-negotiation",
    policyRef: { policyVersion: "1", policyArtifactHash: hash("c") },
    allowedSourceKinds: ["prr"],
    ...overrides
  };
}

function source(sequence = 4, contentHash = hash("e")) {
  return {
    sourceEventId: `evt_source_${sequence}`,
    sourceStreamId: "prr_trigger_stream",
    sourceSequence: sequence,
    sourceKind: "prr",
    contentHash,
    observedAt: "2026-07-13T00:00:00.000Z"
  };
}

function candidate(overrides: Record<string, unknown> = {}) {
  const sourceRefs = (overrides.sourceRefs as readonly ReturnType<typeof source>[] | undefined) ?? [source()];
  const high = sourceRefs[sourceRefs.length - 1]!;
  return {
    candidateVersion: "verified-trigger-candidate.v1",
    workspaceId: "ws_trigger_tests",
    residentAgentId: "agent_default",
    subjectRef: { kind: "prr-request", id: "prr_trigger_tests" },
    sourceRefs,
    sourceHighWaterMark: {
      workspaceId: "ws_trigger_tests",
      triggerId: "trigger_prr_monitor",
      policyVersion: "1",
      sourcePartition: "prr",
      sourceStreamId: high.sourceStreamId,
      sourceSequence: high.sourceSequence,
      sourceEventId: high.sourceEventId
    },
    workspaceIdentityEventId: "evt_workspace_identity",
    mountInstanceId: "mount_trigger_tests",
    mountHash: hash("f"),
    lockHash: hash("0"),
    causationId: high.sourceEventId,
    ...overrides
  };
}

function policy(overrides: Record<string, unknown> = {}): MountedTriggerPolicy {
  return {
    policyVersion: "1",
    policyArtifactHash: hash("c"),
    cooldownMs: 0,
    maxRequests: 8,
    budgetWindowMs: 86_400_000,
    subjectScope: "none",
    sourcePartition: "prr",
    cooldownScopeSelector: "workspace-trigger",
    budgetScopeSelector: "workspace-trigger",
    ...overrides
  } as MountedTriggerPolicy;
}

class MountedAuthorityFixture {
  readonly events: any[] = [];
  readonly appendGates: string[] = [];
  readonly snapshotsBySource = new Map<string, number>();
  private revision = 0;
  private reads = 0;
  private initialReaders = 0;
  private readonly sourceRecords = new Map<string, ReturnType<typeof source>>();
  private releasedInitialReads: (() => void) | undefined;
  private readonly initialReadBarrier: Promise<void>;
  private readonly options: Record<string, unknown>;

  constructor(options: Record<string, unknown> = {}) {
    this.options = options;
    for (const item of (options.sourceRecords as readonly ReturnType<typeof source>[] | undefined) ?? [source(4), source(5)]) {
      this.sourceRecords.set(item.sourceEventId, item);
    }
    this.initialReadBarrier = new Promise((resolve) => { this.releasedInitialReads = resolve; });
  }

  policy() {
    const overrides: Record<string, unknown> = { ...(this.options.policy as Record<string, unknown> | undefined) };
    for (const field of ["cooldownMs", "maxRequests", "budgetWindowMs"] as const) {
      if (this.options[field] !== undefined) overrides[field] = this.options[field];
    }
    return policy(overrides);
  }
  appendCount() { return this.events.length; }
  appendGateKeys() { return [...this.appendGates]; }
  freshReadCount() { return this.reads; }
  readSnapshotCountFor(sourceEventId: string) { return this.snapshotsBySource.get(sourceEventId) ?? 0; }

  async readSnapshot(input: any): Promise<any> {
    this.reads += 1;
    const sourceEventId = input.candidate.sourceRefs[0]?.sourceEventId;
    if (typeof sourceEventId === "string") {
      this.snapshotsBySource.set(sourceEventId, (this.snapshotsBySource.get(sourceEventId) ?? 0) + 1);
    }
    if (this.options.synchronizeInitialReads === true && this.reads <= 2) {
      this.initialReaders += 1;
      if (this.initialReaders === 2) this.releasedInitialReads?.();
      await this.initialReadBarrier;
    }
    return {
      revision: String(this.revision),
      authorityVersion: "mounted-trigger-authority.v1",
      workspaceId: this.options.workspaceId ?? "ws_trigger_tests",
      residentAgentId: this.options.residentAgentId ?? "agent_default",
      available: this.options.available ?? true,
      policy: this.options.policyUnreadable === true ? undefined : this.policy(),
      workspaceIdentityEventId: this.options.workspaceIdentityEventId ?? "evt_workspace_identity",
      mountInstanceId: this.options.mountInstanceId ?? "mount_trigger_tests",
      mountHash: this.options.mountHash ?? hash("f"),
      lockHash: this.options.lockHash ?? hash("0"),
      lockActive: this.options.lockActive ?? false,
      sourceRecords: [...this.sourceRecords.values()],
      requests: [...this.events]
    };
  }

  async appendRequestedIfCurrent(input: any): Promise<any> {
    this.appendGates.push(input.triggerGateKey);
    const sourceSequence = input.proposed.sourceRefs[0]?.sourceSequence;
    if (this.options.synchronizeInitialReads === true && sourceSequence !== this.options.winningSourceSequence) {
      while (this.events.length === 0) await new Promise((resolve) => setTimeout(resolve, 0));
      return { kind: "conflict" };
    }
    if (input.snapshotRevision !== String(this.revision)) return { kind: "conflict" };
    const duplicate = this.events.find((event) => event.payload.dedupeKey === input.proposed.dedupeKey);
    if (duplicate !== undefined) {
      return duplicate.payload.requestFingerprint === input.proposed.requestFingerprint
        ? { kind: "duplicate", eventId: duplicate.id }
        : { kind: "dedupe-conflict" };
    }
    const event = {
      id: `evt_trigger_${this.events.length + 1}`,
      type: "agent.trigger.requested.v1",
      version: 1,
      streamId: `agent_trigger_${input.proposed.workspaceId}_${input.proposed.triggerId}`,
      sequence: this.events.length + 1,
      context: {
        actor: { id: "agent_default", kind: "agent", label: "Resident" },
        occurredAt: input.attemptedAt,
        causationId: input.proposed.provenance.causationId,
        correlationId: input.proposed.provenance.correlationId,
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0", agent: "0.1.0" }
      },
      payload: input.proposed
    };
    this.events.push(event);
    this.revision += 1;
    return { kind: "appended", eventId: event.id };
  }

  async readEventById(input: { readonly eventId: string }): Promise<unknown> {
    const event = this.events.find((candidate) => candidate.id === input.eventId);
    const transform = this.options.readbackTransform;
    return typeof transform === "function"
      ? (transform as (value: unknown) => unknown)(JSON.parse(JSON.stringify(event)))
      : event;
  }

  seed(event: any) { this.events.push(event); this.revision += 1; }
}

function evaluation(overrides: Record<string, unknown> = {}): TriggerEvaluationInput {
  const authority = (overrides.authority as MountedAuthorityFixture | undefined) ?? new MountedAuthorityFixture();
  return {
    descriptor: descriptor(overrides.descriptor as Record<string, unknown> | undefined),
    candidate: candidate(overrides.candidate as Record<string, unknown> | undefined),
    authority: authority as unknown as MountedTriggerAuthority,
    attemptedAt: (overrides.attemptedAt as string | undefined) ?? "2026-07-13T00:00:00.000Z"
  } as TriggerEvaluationInput;
}

describe("resident proactive trigger evaluation", () => {
  it("creates evidence-gap and workspace-recovery descriptors from pre-verified metadata only", () => {
    const metadata = {
      triggerId: "trigger_preverified",
      descriptorRevision: "1",
      requestedRunType: "investigation-planner",
      policyRef: { policyVersion: "1", policyArtifactHash: hash("c") },
      allowedSourceKinds: ["projection"]
    };
    expect(createEvidenceGapContradictionDescriptor(metadata)).toMatchObject({
      descriptorVersion: "resident-trigger-descriptor.v1",
      triggerFamily: "evidence-gap-contradiction"
    });
    expect(createWorkspaceRecoveryDescriptor({ ...metadata, requestedRunType: "workspace-recovery" })).toMatchObject({
      descriptorVersion: "resident-trigger-descriptor.v1",
      triggerFamily: "workspace-recovery"
    });
    expect(() => createWorkspaceRecoveryDescriptor({ ...metadata, inputText: "unsafe" } as unknown as typeof metadata)).toThrow();
  });

  it("keeps fingerprint request ID and dedupe stable across append times", async () => {
    const authority = new MountedAuthorityFixture();
    const first = await evaluateResidentTrigger(evaluation({ authority, attemptedAt: "2026-07-13T00:00:00.000Z" }));
    const second = await evaluateResidentTrigger(evaluation({ authority, attemptedAt: "2026-07-13T00:01:00.000Z" }));
    expect(first).toMatchObject({ kind: "requested" });
    expect(second).toMatchObject({ kind: "duplicate", requestId: first.requestId, requestFingerprint: first.requestFingerprint });
    expect(authority.appendCount()).toBe(1);
  });

  it("persists the verified mounted policy partition instead of a source kind", async () => {
    const authority = new MountedAuthorityFixture({ policy: { sourcePartition: "mounted-prr-policy" } });
    const result = await evaluateResidentTrigger(evaluation({ authority }));
    expect(result.kind).toBe("requested");
    expect(authority.events[0]?.payload.sourceHighWaterMark.sourcePartition).toBe("mounted-prr-policy");
    expect(authority.events[0]?.payload.admissionScope.policySourcePartition).toBe("mounted-prr-policy");
  });

  it("preserves canonical first-source causation through multi-source append and replay", async () => {
    const authority = new MountedAuthorityFixture();
    const result = await evaluateResidentTrigger(evaluation({
      authority,
      candidate: candidate({ sourceRefs: [source(5), source(4)] })
    }));
    const event = authority.events[0];
    expect(result.kind).toBe("requested");
    expect(event.payload.sourceRefs.map((item: ReturnType<typeof source>) => item.sourceEventId)).toEqual(["evt_source_4", "evt_source_5"]);
    expect(event.payload.provenance.causationId).toBe("evt_source_4");
    expect(event.payload.sourceHighWaterMark.sourceEventId).toBe("evt_source_5");
    expect(validateKnowledgeEvent(event)).toMatchObject({ success: true });
    expect(buildTriggerRequestProjection([event], {
      readPolicy: () => authority.policy(),
      verifyAuthority: () => true,
      verifySource: () => true
    })).toMatchObject({ state: "ready", records: [{ eventId: event.id }] });
  });

  it("rejects persisted mount, lock, identity, and high-water swaps during exact readback", async () => {
    const transforms = [
      (event: any) => ({ ...event, payload: { ...event.payload, provenance: { ...event.payload.provenance, mountInstanceId: "mount_swapped" } } }),
      (event: any) => ({ ...event, payload: { ...event.payload, provenance: { ...event.payload.provenance, mountHash: hash("9") } } }),
      (event: any) => ({ ...event, payload: { ...event.payload, provenance: { ...event.payload.provenance, lockHash: hash("8") } } }),
      (event: any) => ({ ...event, payload: { ...event.payload, provenance: { ...event.payload.provenance, workspaceIdentityEventId: "evt_workspace_identity_swapped" } } }),
      (event: any) => ({
        ...event,
        payload: {
          ...event.payload,
          sourceHighWaterMark: { ...event.payload.sourceHighWaterMark, sourceEventId: "evt_source_swapped" }
        }
      })
    ];
    for (const readbackTransform of transforms) {
      const authority = new MountedAuthorityFixture({ readbackTransform });
      expect((await evaluateResidentTrigger(evaluation({ authority }))).kind).toBe("invalid-scope");
      expect(authority.appendCount()).toBe(1);
    }
  });

  it("canonicalizes reversed sourceRefs to one fingerprint, request ID, and dedupe key", () => {
    const authority = new MountedAuthorityFixture();
    const forward = canonicalTriggerIdentity(evaluation({ authority, candidate: candidate({ sourceRefs: [source(4), source(5)] }) }));
    const reversed = canonicalTriggerIdentity(evaluation({ authority, candidate: candidate({ sourceRefs: [source(5), source(4)] }) }));
    expect(reversed).toEqual(forward);
    expect(reversed).toMatchObject({
      requestFingerprint: forward.requestFingerprint,
      requestId: forward.requestId,
      dedupeKey: forward.dedupeKey
    });
  });

  it("derives one policy-only admission scope for equal scope and different high-water", () => {
    const authority = new MountedAuthorityFixture();
    const first = evaluation({ authority, candidate: candidate({ sourceRefs: [source(4)] }) });
    const second = evaluation({ authority, candidate: candidate({ sourceRefs: [source(5)] }) });
    const firstScope = deriveAdmissionScope(authority.policy(), verifiedRequestFields(first));
    const secondScope = deriveAdmissionScope(authority.policy(), verifiedRequestFields(second));
    expect(secondScope).toEqual(firstScope);
    expect(buildTriggerGateKey(secondScope)).toBe(buildTriggerGateKey(firstScope));
  });

  it("rejects invalid, missing, and mismatched mounted authority before append", async () => {
    for (const options of [
      { available: false },
      { workspaceId: "ws_other" },
      { residentAgentId: "agent_other" },
      { policyUnreadable: true },
      { mountHash: hash("9") }
    ]) {
      const authority = new MountedAuthorityFixture(options);
      const result = await evaluateResidentTrigger(evaluation({ authority }));
      expect(["workspace-unavailable", "invalid-scope"]).toContain(result.kind);
      expect(authority.appendCount()).toBe(0);
    }
  });

  it("rejects stale or swapped source, policy, mount, and lock facts without advancing demand", async () => {
    const stale = new MountedAuthorityFixture({ sourceRecords: [source(4, hash("9"))] });
    expect((await evaluateResidentTrigger(evaluation({ authority: stale }))).kind).toBe("stale-source");
    const policyMismatch = new MountedAuthorityFixture({ policy: { policyArtifactHash: hash("9") } });
    expect((await evaluateResidentTrigger(evaluation({ authority: policyMismatch }))).kind).toBe("invalid-scope");
    const mountMismatch = new MountedAuthorityFixture({ mountHash: hash("9") });
    expect((await evaluateResidentTrigger(evaluation({ authority: mountMismatch }))).kind).toBe("invalid-scope");
    const locked = new MountedAuthorityFixture({ lockActive: true, lockHash: hash("9") });
    expect((await evaluateResidentTrigger(evaluation({ authority: locked }))).kind).toBe("ineligible");
    expect(stale.appendCount() + policyMismatch.appendCount() + mountMismatch.appendCount() + locked.appendCount()).toBe(0);
  });

  it("returns cooldown and budget denials without append or high-water movement", async () => {
    const cooldown = new MountedAuthorityFixture({ policy: { cooldownMs: 60_000 } });
    const requested = await evaluateResidentTrigger(evaluation({ authority: cooldown }));
    const denied = await evaluateResidentTrigger(evaluation({
      authority: cooldown,
      candidate: candidate({ sourceRefs: [source(5)] }),
      attemptedAt: "2026-07-13T00:00:30.000Z"
    }));
    expect(requested.kind).toBe("requested");
    expect(denied).toMatchObject({ kind: "cooldown-active", notBefore: "2026-07-13T00:01:00.000Z" });
    expect(cooldown.appendCount()).toBe(1);

    const budget = new MountedAuthorityFixture({ policy: { maxRequests: 1 } });
    await evaluateResidentTrigger(evaluation({ authority: budget }));
    const exhausted = await evaluateResidentTrigger(evaluation({ authority: budget, candidate: candidate({ sourceRefs: [source(5)] }) }));
    expect(exhausted.kind).toBe("budget-exhausted");
    expect(budget.appendCount()).toBe(1);
  });

  it("fails closed on an identical dedupe key with a different fingerprint", async () => {
    const authority = new MountedAuthorityFixture();
    const original = await evaluateResidentTrigger(evaluation({ authority }));
    const stored = authority.events[0]!;
    stored.payload = { ...stored.payload, requestFingerprint: hash("9"), requestId: "trq_conflicting_fingerprint" };
    const result = await evaluateResidentTrigger(evaluation({ authority }));
    expect(original.kind).toBe("requested");
    expect(result.kind).toBe("dedupe-conflict");
    expect(authority.appendCount()).toBe(1);
  });

  it("awaits the original losing concurrent Promise rather than starting a retry", async () => {
    const authority = new MountedAuthorityFixture({ maxRequests: 1, synchronizeInitialReads: true, winningSourceSequence: 4 });
    const winningInput = evaluation({ authority, candidate: candidate({ sourceRefs: [source(4)] }) });
    const losingInput = evaluation({ authority, candidate: candidate({ sourceRefs: [source(5)] }) });
    const winningScope = deriveAdmissionScope(authority.policy(), verifiedRequestFields(winningInput));
    const losingScope = deriveAdmissionScope(authority.policy(), verifiedRequestFields(losingInput));
    const firstScope = winningScope;
    const secondScope = losingScope;
    expect(secondScope).toEqual(firstScope);
    expect(buildTriggerGateKey(secondScope)).toBe(buildTriggerGateKey(firstScope));
    const winningGateKey = buildTriggerGateKey(winningScope);
    const losingGateKey = buildTriggerGateKey(losingScope);
    expect(winningGateKey).toBe(losingGateKey);
    const winningPromise = evaluateResidentTrigger(winningInput);
    const losingPromise = evaluateResidentTrigger(losingInput);
    const [losingSource] = losingInput.candidate.sourceRefs;
    expect(losingSource).toBeDefined();
    const loser = await losingPromise;
    const winner = await winningPromise;
    expect(winner).toMatchObject({ kind: "requested" });
    expect(loser).toMatchObject({ kind: "budget-exhausted" });
    expect(authority.readSnapshotCountFor(losingSource!.sourceEventId)).toBe(2);
    expect(authority.freshReadCount()).toBe(3);
    expect(authority.appendGateKeys()).toEqual([winningGateKey, losingGateKey]);
    expect(authority.appendCount()).toBe(1);
  });

  it("rejects every forbidden input or effect shape before append or an effect sink", async () => {
    const authority = new MountedAuthorityFixture();
    const sink = vi.fn();
    const unsafeShapes = {
      inputText: "unsafe prompt",
      promptArtifact: { text: "unsafe prompt artifact" },
      promptResolver: { resolve: sink },
      promptArtifactResolver: { resolve: sink },
      provider: { invoke: sink },
      providerRequest: { execute: sink },
      model: { invoke: sink },
      modelMessages: [{ role: "user", content: "unsafe model message" }],
      modelInvocation: { invoke: sink },
      subscription: { authorize: sink },
      apiKey: "unsafe-api-key",
      credential: { reveal: sink },
      credentialRef: { resolve: sink },
      harness: { run: sink },
      specialist: { start: sink },
      domainService: { execute: sink },
      tool: { execute: sink },
      parser: { parse: sink },
      approval: { consume: sink },
      handoff: { append: sink },
      artifactStore: { put: sink },
      projection: { mutate: sink },
      graph: { accept: sink },
      task: { claim: sink },
      scheduler: { enqueue: sink },
      sourceBytes: new Uint8Array([1]),
      rawBytes: new Uint8Array([2])
    };
    for (const [field, value] of Object.entries(unsafeShapes)) {
      const result = await evaluateResidentTrigger({ ...evaluation({ authority }), [field]: value } as unknown as TriggerEvaluationInput);
      expect(result.kind).toBe("invalid-scope");
      expect(JSON.stringify(result)).not.toContain("unsafe");
    }
    expect(authority.appendCount()).toBe(0);
    expect(sink).not.toHaveBeenCalled();
  });
});
