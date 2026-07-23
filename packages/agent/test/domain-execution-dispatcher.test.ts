import { type KnowledgeEvent, type KnowledgeEventOf } from "../../ontology/src/contracts.js";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import {
  createAcceptedGraphAssertionReviewAdapter
} from "../src/adapters/accepted-graph-review.js";
import {
  createBlockedCanonicalRepairAdapter,
  createWorkspaceProjectionRebuildAdapter
} from "../src/adapters/destructive-repair.js";
import {
  createExportGenerationAdapter,
  createReportGenerationAdapter
} from "../src/adapters/export-report.js";
import {
  createLegacyStagingApprovalAdapter,
  createLegacyStagingExecutionAdapter
} from "../src/adapters/legacy-staging.js";
import {
  createPrrFollowUpExecutionAdapter,
  createPrrInitialSendExecutionAdapter
} from "../src/adapters/prr-correspondence.js";
import {
  createProviderByteTransferAdapter,
  createProviderParseExecutionAdapter
} from "../src/adapters/provider-byte-transfer.js";
import { buildContextPackRef } from "../src/context-packs.js";
import { buildPromptArtifact, promptArtifactAuditMetadata } from "../src/prompt-artifacts.js";
import { createProviderCapabilityDescriptor } from "../src/provider-registry.js";
import * as domainExecutionDispatcherModule from "../src/domain-execution-dispatcher.js";
import {
  agentDomainExecutionFailure,
  createAgentDomainExecutionDispatcher,
  createAgentToolGateway,
  hashAgentToolPreview,
  toAgentApprovedToolExecutorDescriptor,
  type AgentApprovedToolExecutorDescriptor,
  type AgentDomainExecutionAdapter,
  type AgentDomainToolDescriptor,
  type AgentApprovalClass,
  type AgentToolPreview
} from "../src/index.js";

const agentActor = { id: "actor_cestus_agent", kind: "agent" as const, label: "Cestus Agent" };
const schedulerActor = { id: "actor_agent_scheduler", kind: "system" as const, label: "Agent Scheduler" };
const humanActor = { id: "actor_case_owner", kind: "human" as const, label: "Case Owner" };
const sourceEventId = "evt_source_review";
const inputArtifactHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const resultArtifactHash = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

describe("agent domain execution dispatcher", () => {
  it("fails closed through the scheduler when an approved request has no registered domain descriptor", async () => {
    const ledger = new InMemoryEventLedger();
    const preview = previewFor("toolreq_domain_missing_descriptor");
    await requestAndApprove(ledger, preview, "toolreq_domain_missing_descriptor");
    const dispatcher = createAgentDomainExecutionDispatcher({
      ledger,
      actor: schedulerActor,
      now: fixedNow,
      adapters: []
    });

    const result = await dispatcher.resumeApprovedDomainTools();
    const events = await ledger.readAll();

    expect(result.failedCount).toBe(1);
    expect(result.items[0]).toMatchObject({
      toolRequestId: "toolreq_domain_missing_descriptor",
      state: "failed",
      category: "permission-denied"
    });
    expect(events.filter((event) => event.type === "agent.tool.failed")).toHaveLength(1);
    expect(events.filter((event) => event.type === "agent.tool.execution.claimed")).toHaveLength(0);
    expect(events.filter((event) => event.type === "agent.tool.completed")).toHaveLength(0);
  });

  it("fails stale rebuilt previews before adapter execution", async () => {
    const ledger = new InMemoryEventLedger();
    const preview = previewFor("toolreq_domain_stale_preview");
    await requestAndApprove(ledger, preview, "toolreq_domain_stale_preview");
    let executions = 0;
    const dispatcher = createAgentDomainExecutionDispatcher({
      ledger,
      actor: schedulerActor,
      now: fixedNow,
      adapters: [adapterFor(preview, {
        async buildCurrentPreview() {
          return approvedPreviewResult({
            preview: {
              summary: "Changed accepted graph review preview.",
              relatedEventIds: [sourceEventId],
              artifactHashes: [inputArtifactHash]
            }
          });
        },
        async executeApproved() {
          executions += 1;
          throw new Error("stale previews must not execute");
        }
      })]
    });

    const result = await dispatcher.wake();
    const events = await ledger.readAll();

    expect(result.failedCount).toBe(1);
    expect(result.items[0]).toMatchObject({
      toolRequestId: "toolreq_domain_stale_preview",
      state: "failed",
      category: "approval-stale"
    });
    expect(executions).toBe(0);
    expect(events.filter((event) => event.type === "agent.tool.execution.claimed")).toHaveLength(0);
    expect(events.filter((event) => event.type === "agent.tool.completed")).toHaveLength(0);
  });

  it("preserves the landed legal-lock-active category for active lock failures", async () => {
    const lockCase = await wakeWithPreviewResult("toolreq_domain_lock_active", {
      activeLocks: [{
        lockId: "lock_export_review",
        category: "export",
        message: "Export review lock active."
      }]
    });

    expect(lockCase.result.failedCount).toBe(1);
    expect(lockCase.result.items[0]).toMatchObject({
      toolRequestId: "toolreq_domain_lock_active",
      state: "failed",
      category: "legal-lock-active"
    });
    expect(lockCase.executions).toBe(0);
    expect(lockCase.events.filter((event) => event.type === "agent.tool.execution.claimed")).toHaveLength(0);
    expect(lockCase.events.filter((event) => event.type === "agent.tool.completed")).toHaveLength(0);
  });

  it("preserves the landed provenance-missing category for missing provenance failures", async () => {
    const provenanceCase = await wakeWithPreviewResult("toolreq_domain_missing_provenance", {
      sourceEventIds: [],
      inputArtifactHashes: [],
      provenanceRefs: []
    });

    expect(provenanceCase.result.failedCount).toBe(1);
    expect(provenanceCase.result.items[0]).toMatchObject({
      toolRequestId: "toolreq_domain_missing_provenance",
      state: "failed",
      category: "provenance-missing"
    });
    expect(provenanceCase.executions).toBe(0);
    expect(provenanceCase.events.filter((event) => event.type === "agent.tool.execution.claimed")).toHaveLength(0);
    expect(provenanceCase.events.filter((event) => event.type === "agent.tool.completed")).toHaveLength(0);
  });

  it("records claims and maps successful domain adapter results through gateway completion", async () => {
    const ledger = new InMemoryEventLedger();
    const toolRequestId = "toolreq_domain_complete";
    const preview = previewFor(toolRequestId);
    const requested = await requestAndApprove(ledger, preview, toolRequestId);
    let executionInput: Parameters<AgentDomainExecutionAdapter["executeApproved"]>[0] | undefined;
    const dispatcher = createAgentDomainExecutionDispatcher({
      ledger,
      actor: schedulerActor,
      now: fixedNow,
      adapters: [adapterFor(preview, {
        async executeApproved(input) {
          executionInput = input;
          const domainResult = await appendDomainResult(ledger, input.toolRequestId);
          return {
            eventIds: [domainResult.id],
            artifactHashes: [resultArtifactHash],
            readModelChanges: [{
              projectionName: "accepted-graph",
              change: "accepted reviewed assertion",
              relatedIds: [domainResult.id]
            }],
            resultSummary: "Accepted graph review completed through domain service."
          };
        }
      })]
    });

    const result = await dispatcher.resumeApprovedDomainTools();
    const events = await ledger.readAll();
    const completed = eventOfType(events, "agent.tool.completed");

    expect(result).toMatchObject({
      examinedCount: 1,
      completedCount: 1,
      failedCount: 0
    });
    expect(result.items[0]).toMatchObject({
      toolRequestId,
      state: "completed",
      previewHash: requested.payload.previewHash,
      currentPreviewHash: requested.payload.previewHash
    });
    expect(result.items[0]?.eventIds).toHaveLength(2);
    expect(executionInput).toMatchObject({
      toolRequestId,
      toolId: domainDescriptor.toolId,
      toolVersion: domainDescriptor.toolVersion,
      sideEffectClass: domainDescriptor.sideEffectClass,
      approvalClass: domainDescriptor.requiredApprovalClass,
      approvedBy: humanActor.id,
      sourceEventIds: [sourceEventId],
      inputArtifactHashes: [inputArtifactHash],
      provenanceRefs: [sourceEventId, inputArtifactHash]
    });
    expect(events.filter((event) => event.type === "agent.tool.execution.claimed")).toHaveLength(1);
    expect(completed.payload).toMatchObject({
      toolRequestId,
      eventIds: [expect.stringMatching(/^evt_/)],
      artifactHashes: [resultArtifactHash],
      resultSummary: "Accepted graph review completed through domain service.",
      readModelChanges: [{
        projectionName: "accepted-graph",
        change: "accepted reviewed assertion",
        relatedIds: [expect.stringMatching(/^evt_/)]
      }]
    });
  });

  it("maps typed domain service rejections to secret-safe domain-gate-failed events after claim", async () => {
    const ledger = new InMemoryEventLedger();
    const toolRequestId = "toolreq_domain_gate_rejected";
    const preview = previewFor(toolRequestId);
    await requestAndApprove(ledger, preview, toolRequestId);
    const dispatcher = createAgentDomainExecutionDispatcher({
      ledger,
      actor: schedulerActor,
      now: fixedNow,
      adapters: [adapterFor(preview, {
        async executeApproved() {
          try {
            throw new Error("provider token should never be copied into diagnostics");
          } catch {
            throw agentDomainExecutionFailure({
              category: "domain-gate-failed",
              message: "Domain service rejected the approved request.",
              retryable: false,
              allowedActions: ["inspect domain service gate"]
            });
          }
        }
      })]
    });

    const result = await dispatcher.wake();
    const events = await ledger.readAll();
    const failed = eventOfType(events, "agent.tool.failed");
    const serializedResult = JSON.stringify(result);
    const serializedEvents = JSON.stringify(events);

    expect(result.failedCount).toBe(1);
    expect(result.completedCount).toBe(0);
    expect(result.items[0]).toMatchObject({
      toolRequestId,
      state: "failed",
      category: "domain-gate-failed",
      message: "Domain service rejected the approved request."
    });
    expect(failed.payload).toMatchObject({
      toolRequestId,
      category: "domain-gate-failed",
      message: "Domain service rejected the approved request.",
      retryable: false,
      allowedActions: ["inspect domain service gate"]
    });
    expect(events.filter((event) => event.type === "agent.tool.execution.claimed")).toHaveLength(1);
    expect(events.filter((event) => event.type === "agent.tool.completed")).toHaveLength(0);
    expect(serializedResult).not.toMatch(/provider token/i);
    expect(serializedEvents).not.toMatch(/provider token/i);
  });

  it("rejects domain adapter metadata that mismatches the descriptor family gate", () => {
    const invalidDescriptor = {
      ...domainDescriptor,
      family: "prr-correspondence"
    } as AgentDomainToolDescriptor;
    const invalidAdapter = adapterFor(previewFor("toolreq_invalid_domain_descriptor"), {
      descriptor: invalidDescriptor
    });

    expect(() => toAgentApprovedToolExecutorDescriptor(invalidAdapter)).toThrow(/approval class/i);
    expect(() => createAgentDomainExecutionDispatcher({
      ledger: new InMemoryEventLedger(),
      actor: schedulerActor,
      now: fixedNow,
      adapters: [invalidAdapter]
    })).toThrow(/approval class/i);
  });

  it("mints only closed-catalog package capabilities through the default API", async () => {
    const fixtures = residentFactoryFixtures();
    expect(fixtures.map(({ kind, ordinals }) => [kind, ordinals])).toEqual([
      ["provider-byte-transfer", [0, 1]],
      ["prr-correspondence", [2, 3]],
      ["accepted-graph-review", [4]],
      ["export-report", [5, 6]],
      ["destructive-repair", [7, 8]],
      ["legacy-staging", [9, 10]]
    ]);
    expect(fixtures.flatMap(constructFixtureAdapters).map((adapter) => adapter.descriptor.toolId))
      .toEqual(residentCatalogRows().map((row) => row.toolId));

    const api = residentDomainApi(domainExecutionDispatcherModule);
    const issued: Array<{ fixture: ResidentFactoryFixture; capability: unknown; port: unknown }> = [];
    for (const fixture of fixtures) {
      const capability = await api.create(fixture.binding);
      expect(capability, fixture.kind).toSatisfy(isFrozenOpaqueObject);
      const port = api.bind({
        capability,
        mountedLedger: fixture.ledger,
        workspaceId: fixture.workspaceId,
        residentAgentId: fixture.residentAgentId,
        taskId: fixture.taskId
      });
      expect(port, fixture.kind).toSatisfy(isFrozenOpaqueObject);
      expect(Reflect.get(port as object, "buildCurrentPreview"), fixture.kind).toBeUndefined();
      expect(Reflect.get(port as object, "executeApproved"), fixture.kind).toBeUndefined();
      expect(Reflect.get(port as object, "adapter"), fixture.kind).toBeUndefined();
      issued.push({ fixture, capability, port });
    }

    const accepted = fixtures[2]!;
    const acceptedCapability = issued[2]!.capability;
    const legacyStructuralDispatcher = createAgentDomainExecutionDispatcher({
      ledger: accepted.ledger,
      actor: schedulerActor,
      now: fixedNow,
      adapters: []
    });
    for (const capability of [
      {},
      Object.freeze({}),
      legacyStructuralDispatcher,
      { ...asDataRecord(acceptedCapability) }
    ]) {
      expect(() => api.bind({
        capability,
        mountedLedger: accepted.ledger,
        workspaceId: accepted.workspaceId,
        residentAgentId: accepted.residentAgentId,
        taskId: accepted.taskId
      })).toThrow(/capability|resident|package|authority/i);
    }
    for (const [field, value] of [
      ["mountedLedger", new InMemoryEventLedger()],
      ["workspaceId", "ws_dispatcher_other"],
      ["residentAgentId", "agent_dispatcher_other"],
      ["taskId", "task_dispatcher_other"]
    ] as const) {
      expect(() => api.bind({
        capability: acceptedCapability,
        mountedLedger: accepted.ledger,
        workspaceId: accepted.workspaceId,
        residentAgentId: accepted.residentAgentId,
        taskId: accepted.taskId,
        [field]: value
      })).toThrow(/ledger|workspace|resident|task|binding|capability/i);
    }

    const hostileBindings = [
      { ...accepted.binding, kind: "unknown-family" },
      { ...accepted.binding, adapter: adapterFor(previewFor("toolreq_structural_elevation")) },
      { ...accepted.binding, descriptor: domainDescriptor },
      { ...accepted.binding, executor: async () => undefined },
      { ...accepted.binding, factory: () => undefined },
      { ...accepted.binding, implementationRevision: "caller-owned.v1" },
      { ...accepted.binding, lookup: () => undefined },
      Object.assign(Object.create({ inherited: true }), accepted.binding),
      Object.defineProperty({ ...accepted.binding }, "kind", { enumerable: true, get: () => accepted.kind }),
      new Proxy({ ...accepted.binding }, {
        ownKeys() {
          throw new Error("hostile proxy");
        }
      })
    ];
    for (const binding of hostileBindings) {
      await expect(api.create(binding)).rejects.toThrow(
        /kind|unsupported|plain|data propert|accessor|proxy|adapter|descriptor|executor|factory|implementation|lookup|binding/i
      );
    }

    const destructive = fixtures[4]!;
    await expect(api.create({
      ...destructive.binding,
      canonicalRepairContext: {
        ...asDataRecord(Reflect.get(destructive.binding, "canonicalRepairContext")),
        ledger: new InMemoryEventLedger()
      }
    })).rejects.toThrow(/ledger|same|binding/i);

    const mutable = mutableResidentBinding(accepted.binding);
    const pendingCapability = api.create(mutable);
    mutable.workspaceId = "ws_dispatcher_mutated_after_call";
    mutable.residentAgentId = "agent_dispatcher_mutated_after_call";
    const copiedCapability = await pendingCapability;
    expect(() => api.bind({
      capability: copiedCapability,
      mountedLedger: accepted.ledger,
      workspaceId: accepted.workspaceId,
      residentAgentId: accepted.residentAgentId,
      taskId: accepted.taskId
    })).not.toThrow();
  });

  it("uses six literal static adapter modules and eleven constructors without initialization-order drift", async () => {
    const source = dispatcherSource();
    const sourceFile = ts.createSourceFile(
      "domain-execution-dispatcher.ts",
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    );
    const expectedImports = expectedResidentCatalogImports();
    const factoryFixture = residentFactoryFixtures()[2]!;
    const api = residentDomainApi(domainExecutionDispatcherModule);

    expect(staticNamedImports(sourceFile)).toEqual(expect.objectContaining(expectedImports));
    expect(dynamicLoaderNodes(sourceFile)).toEqual([]);
    const factory = sourceFile.statements.find(
      (statement): statement is ts.FunctionDeclaration =>
        ts.isFunctionDeclaration(statement) &&
        statement.name?.text === "createPackageOwnedResidentDomainExecutionCapability"
    );
    expect(factory).toBeDefined();
    const factoryText = factory!.getText(sourceFile);
    for (const { constructorName, descriptorName, implementationRevision } of residentCatalogRows()) {
      expect(factoryText, constructorName).toMatch(new RegExp(`\\b${constructorName}\\b`));
      expect(factoryText, descriptorName).toMatch(new RegExp(`\\b${descriptorName}\\b`));
      expect(factoryText, implementationRevision).toContain(`"${implementationRevision}"`);
    }
    expect(topLevelImportedCatalogReads(sourceFile)).toEqual([]);

    vi.resetModules();
    const barrelFirst = await import("../src/index.js");
    const adapterAfterBarrel = await import("../src/adapters/provider-byte-transfer.js");
    const dispatcherAfterBarrel = await import("../src/domain-execution-dispatcher.js");
    const barrelFirstApi = residentDomainApi(dispatcherAfterBarrel);
    const barrelFirstCapability = await barrelFirstApi.create(factoryFixture.binding);
    const barrelFirstPort = barrelFirstApi.bind({
      capability: barrelFirstCapability,
      mountedLedger: factoryFixture.ledger,
      workspaceId: factoryFixture.workspaceId,
      residentAgentId: factoryFixture.residentAgentId,
      taskId: factoryFixture.taskId
    });
    vi.resetModules();
    const adapterFirst = await import("../src/adapters/provider-byte-transfer.js");
    const barrelAfterAdapter = await import("../src/index.js");
    const dispatcherAfterAdapter = await import("../src/domain-execution-dispatcher.js");
    const adapterFirstApi = residentDomainApi(dispatcherAfterAdapter);
    const adapterFirstCapability = await adapterFirstApi.create(factoryFixture.binding);
    const adapterFirstPort = adapterFirstApi.bind({
      capability: adapterFirstCapability,
      mountedLedger: factoryFixture.ledger,
      workspaceId: factoryFixture.workspaceId,
      residentAgentId: factoryFixture.residentAgentId,
      taskId: factoryFixture.taskId
    });
    expect(adapterAfterBarrel.providerByteTransferDescriptor).toEqual(adapterFirst.providerByteTransferDescriptor);
    expect(barrelFirst.providerByteTransferDescriptor).toEqual(barrelAfterAdapter.providerByteTransferDescriptor);
    expect([barrelFirstCapability, adapterFirstCapability].every(isFrozenOpaqueObject)).toBe(true);
    expect([barrelFirstPort, adapterFirstPort].every(isFrozenOpaqueObject)).toBe(true);
    expect(() => adapterFirstApi.bind({
      capability: barrelFirstCapability,
      mountedLedger: factoryFixture.ledger,
      workspaceId: factoryFixture.workspaceId,
      residentAgentId: factoryFixture.residentAgentId,
      taskId: factoryFixture.taskId
    })).toThrow(/capability|resident|package|authority/i);
  });

  it("attests only the catalog-specific admissible domain outcome", async () => {
    const fixtures = residentFactoryFixtures();
    const api = residentDomainApi(domainExecutionDispatcherModule);
    const rows = residentCatalogRows();
    const fixtureByKind = new Map(fixtures.map((fixture) => [fixture.kind, fixture]));

    for (const row of rows) {
      const fixture = fixtureByKind.get(row.kind)!;
      const capability = await api.create(fixture.binding);
      const port = api.bind({
        capability,
        mountedLedger: fixture.ledger,
        workspaceId: fixture.workspaceId,
        residentAgentId: fixture.residentAgentId,
        taskId: fixture.taskId
      });
      const invokeAndAttest = requiredUnknownMethod(port, "invokeAndAttest");
      const before = await fixture.ledger.readAll();
      const invocation = residentInvocationFor(row, fixture);

      await expect(
        Promise.resolve().then(() => Reflect.apply(invokeAndAttest, port, [
          Object.freeze({ schemaVersion: "forged-resident-execution-permit.v1" }),
          invocation
        ]))
      ).rejects.toThrow(/permit|issued|capability|authority/i);
      expect(await fixture.ledger.readAll(), `ordinal ${row.ordinal}`).toEqual(before);
      expect(invocation.authorizationKind).toBe(row.ordinal === 10 ? "automatic-policy" : "human-approval");
    }
  });

  it("allows the ordinal-10 automatic compatibility bridge and no other ordinal", async () => {
    const fixtures = residentFactoryFixtures();
    const api = residentDomainApi(domainExecutionDispatcherModule);
    const automatic = residentCatalogRows()[10]!;
    const legacy = fixtures[5]!;
    const capability = await api.create(legacy.binding);
    const port = api.bind({
      capability,
      mountedLedger: legacy.ledger,
      workspaceId: legacy.workspaceId,
      residentAgentId: legacy.residentAgentId,
      taskId: legacy.taskId
    });
    const invokeAndAttest = requiredUnknownMethod(port, "invokeAndAttest");
    const before = await legacy.ledger.readAll();

    for (const row of residentCatalogRows().slice(0, 10)) {
      await expect(
        Promise.resolve().then(() => Reflect.apply(invokeAndAttest, port, [
          Object.freeze({ schemaVersion: "forged-resident-execution-permit.v1", catalogOrdinal: row.ordinal }),
          residentInvocationFor({ ...row, authorizationKind: "automatic-policy" }, legacy)
        ]))
      ).rejects.toThrow(/permit|issued|ordinal|automatic|approval|authority/i);
    }
    for (const mutation of [
      { authorizationKind: "human-approval", approvedBy: humanActor.id },
      { authorizationKind: "automatic-policy", approvedPreviewHash: hash("c") },
      { authorizationKind: "automatic-policy", approvedBy: "caller-supplied-actor" }
    ]) {
      await expect(
        Promise.resolve().then(() => Reflect.apply(invokeAndAttest, port, [
          Object.freeze({ schemaVersion: "forged-resident-execution-permit.v1", catalogOrdinal: 10 }),
          { ...residentInvocationFor(automatic, legacy), ...mutation }
        ]))
      ).rejects.toThrow(/permit|issued|automatic|approval|actor|authority/i);
    }
    expect(await legacy.ledger.readAll()).toEqual(before);
    expect(residentInvocationFor(automatic, legacy)).toMatchObject({
      authorizationKind: "automatic-policy"
    });
    expect(residentInvocationFor(automatic, legacy)).not.toHaveProperty("decisionEventId");
    expect(residentInvocationFor(automatic, legacy)).not.toHaveProperty("approvedBy");
    expect(residentInvocationFor(automatic, legacy)).not.toHaveProperty("approvedPreviewHash");
  });
});

type ResidentFactoryKind =
  | "provider-byte-transfer"
  | "prr-correspondence"
  | "accepted-graph-review"
  | "export-report"
  | "destructive-repair"
  | "legacy-staging";

interface ResidentFactoryFixture {
  readonly kind: ResidentFactoryKind;
  readonly ordinals: readonly number[];
  readonly binding: Record<string, unknown>;
  readonly ledger: InMemoryEventLedger;
  readonly workspaceId: string;
  readonly residentAgentId: string;
  readonly taskId: string;
}

interface UnknownResidentDomainApi {
  readonly create: (input: unknown) => Promise<unknown>;
  readonly bind: (input: unknown) => unknown;
}

interface ResidentCatalogRow {
  readonly kind: ResidentFactoryKind;
  readonly ordinal: number;
  readonly constructorName: string;
  readonly descriptorName: string;
  readonly implementationRevision: string;
  readonly toolId: string;
  readonly toolVersion: "0.1.0";
  readonly authorizationKind?: "automatic-policy" | "human-approval";
}

function residentDomainApi(module: object): UnknownResidentDomainApi {
  const candidate = Reflect.get(module, "default");
  if (typeof candidate !== "object" || candidate === null || !Object.isFrozen(candidate)) {
    throw new Error("Task12 resident dispatcher default API is absent.");
  }
  const create = Reflect.get(candidate, "createPackageOwnedResidentDomainExecutionCapability");
  const bind = Reflect.get(candidate, "bindPackageOwnedResidentDomainExecutionPort");
  if (typeof create !== "function" || typeof bind !== "function") {
    throw new Error("Task12 resident dispatcher issuer or binder is absent.");
  }
  return {
    create(input: unknown) {
      return Promise.resolve(Reflect.apply(create, candidate, [input]));
    },
    bind(input: unknown) {
      return Reflect.apply(bind, candidate, [input]);
    }
  };
}

function requiredUnknownMethod(target: unknown, methodName: string): (...args: readonly unknown[]) => unknown {
  if (typeof target !== "object" || target === null) {
    throw new Error(`Task12 resident dispatcher port is absent for ${methodName}.`);
  }
  const method = Reflect.get(target, methodName);
  if (typeof method !== "function") {
    throw new Error(`Task12 resident dispatcher port method ${methodName} is absent.`);
  }
  return method as (...args: readonly unknown[]) => unknown;
}

function isFrozenOpaqueObject(value: unknown): boolean {
  return typeof value === "object" && value !== null && Object.isFrozen(value);
}

function asDataRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : {};
}

function mutableResidentBinding(value: Record<string, unknown>): Record<string, unknown> {
  return { ...value };
}

function constructFixtureAdapters(fixture: ResidentFactoryFixture): readonly AgentDomainExecutionAdapter[] {
  const context = Reflect.get(fixture.binding, "context");
  switch (fixture.kind) {
    case "provider-byte-transfer":
      return [
        createProviderByteTransferAdapter(context as never),
        createProviderParseExecutionAdapter(context as never)
      ];
    case "prr-correspondence":
      return [
        createPrrInitialSendExecutionAdapter(context as never),
        createPrrFollowUpExecutionAdapter({
          ...asDataRecord(context),
          toolId: "prr.follow-up.execute",
          approvedMessage: {
            ...asDataRecord(Reflect.get(asDataRecord(context), "approvedMessage")),
            providerIdempotencyKey: "followup_prr_dispatcher_corr_dispatcher"
          }
        } as never)
      ];
    case "accepted-graph-review":
      return [createAcceptedGraphAssertionReviewAdapter(context as never)];
    case "export-report":
      return [
        createExportGenerationAdapter(context as never),
        createReportGenerationAdapter({
          ...asDataRecord(context),
          toolId: "governance.report.generate",
          artifactKind: "report",
          artifactId: "report_dispatcher_fixture"
        } as never)
      ];
    case "destructive-repair":
      return [
        createWorkspaceProjectionRebuildAdapter(Reflect.get(fixture.binding, "projectionContext") as never),
        createBlockedCanonicalRepairAdapter(Reflect.get(fixture.binding, "canonicalRepairContext") as never)
      ];
    case "legacy-staging":
      return [
        createLegacyStagingApprovalAdapter(context as never),
        createLegacyStagingExecutionAdapter(context as never)
      ];
  }
}

function residentFactoryFixtures(): readonly ResidentFactoryFixture[] {
  const workspaceId = "ws_dispatcher_catalog";
  const residentAgentId = "agent_dispatcher_catalog";
  const taskId = "task_dispatcher_catalog";
  const providerLedger = new InMemoryEventLedger();
  const prrLedger = new InMemoryEventLedger();
  const acceptedGraphLedger = new InMemoryEventLedger();
  const exportLedger = new InMemoryEventLedger();
  const destructiveLedger = new InMemoryEventLedger();
  const legacyLedger = new InMemoryEventLedger();
  const providerEvidenceHash = hash("1");
  const providerContextPack = buildContextPackRef({
    contextPackId: "provider-transfer.v1",
    version: 1,
    generatedAt: fixedNow(),
    payload: {
      evidenceId: "ev_dispatcher_provider",
      contentHash: providerEvidenceHash
    },
    safeSummary: "Dispatcher provider-transfer binding.",
    provenanceRefs: [
      "ev_dispatcher_provider",
      "evt_dispatcher_provider_evidence",
      providerEvidenceHash
    ],
    sourceEventIds: [
      "evt_dispatcher_provider_evidence",
      "evt_dispatcher_provider_link"
    ],
    artifactHashes: [providerEvidenceHash]
  });
  const basePromptAudit = promptArtifactAuditMetadata(buildPromptArtifact({
    promptTemplateId: "provider-document-parse",
    promptTemplateVersion: 1,
    generatedAt: fixedNow(),
    runType: "evidence-triage",
    safetyClass: "provider-approved",
    transferApprovalClass: "provider-byte-transfer",
    contextPackRefs: [providerContextPack],
    text: "Parse only the exact dispatcher fixture evidence.",
    safeSummary: "Dispatcher provider parsing instructions."
  }));
  const providerPromptAudit = {
    ...basePromptAudit,
    production: {
      schemaVersion: "agent-production-prompt-binding.v1" as const,
      rendererId: "evidence-triage.classify.renderer",
      rendererVersion: 1,
      rendererHash: hash("2"),
      renderedPromptHash: hash("3"),
      providerOutputSchemaId: "evidence-triage.classify-output.v1",
      providerOutputSchemaVersion: 1,
      handoffSchemaId: "evidence-triage-handoff.v1",
      handoffSchemaVersion: 1,
      scopeApplicabilityHash: hash("4"),
      evaluatedContextRequirements: [{
        contextPackId: "provider-transfer.v1",
        requirementMode: "always" as const,
        status: "applicable" as const,
        contentHash: providerContextPack.contentHash
      }, {
        contextPackId: "prr-read-model.v1",
        requirementMode: "when-scope-associated-prr" as const,
        status: "not-applicable" as const,
        omissionReason: "no-associated-prr"
      }],
      resolvedPayloadAudits: [{
        contextPackId: "provider-transfer.v1",
        contentHash: providerContextPack.contentHash,
        sizeBytes: 128,
        schemaId: "provider-transfer.v1"
      }]
    }
  };
  const providerCapability = createProviderCapabilityDescriptor({
    providerId: "provider_dispatcher_fixture",
    label: "Dispatcher fixture provider",
    adapterVersion: "dispatcher-provider.v1",
    backendKind: "custom-adapter",
    modelFamilies: ["dispatcher-fixture"],
    modalities: ["file"],
    toolSupport: "none",
    structuredOutputSupport: "schema-strict",
    contextLimits: { maxInputTokens: 4096, maxOutputTokens: 1024 },
    credentialRequirements: [{ credentialKind: "api-key-bearer", required: true }],
    dataHandlingNotes: "Selected fixture bytes are processed under the approved transfer policy.",
    costPolicy: "metered-api",
    workspaceScopes: ["workspace"],
    approvalProfile: "remote-byte-transfer-gated",
    diagnosticContract: ["requires-byte-transfer-approval"],
    fakeSupport: false
  });
  const providerReadiness = {
    providerId: providerCapability.providerId,
    label: "Dispatcher fixture provider",
    backendKind: "custom-adapter" as const,
    capabilitySummary: ["file", "no tools", "schema output"],
    credentialKindSummary: ["api-key-bearer"],
    state: "requires-byte-transfer-approval" as const,
    requiredApprovalClass: "provider-byte-transfer" as const,
    credentialHealth: "local-binding-healthy" as const,
    dataHandlingPosture: "remote-prompt-byte-transfer-gated" as const,
    credentialRefId: "agent_credref_dispatcher_fixture",
    safeActionIds: ["action_request_provider_byte_transfer_approval"]
  };
  const providerContext = {
    ledger: providerLedger,
    reviewer: humanActor,
    residentAgentId,
    taskId,
    providerJobId: "provider_dispatcher_job",
    sourceCollectionId: "src_dispatcher_provider",
    importBatchId: "imp_dispatcher_provider",
    providerId: providerCapability.providerId,
    approvalEventId: "evt_dispatcher_provider_approval",
    credentialRefId: providerReadiness.credentialRefId,
    evidenceBindings: [{
      evidenceId: "ev_dispatcher_provider",
      evidenceEventId: "evt_dispatcher_provider_evidence",
      linkEventId: "evt_dispatcher_provider_link",
      contentHash: providerEvidenceHash,
      byteCount: 128,
      mediaType: "application/pdf"
    }],
    approvedProviderCapability: providerCapability,
    approvedProviderReadiness: providerReadiness,
    approvedPromptArtifact: providerPromptAudit,
    excerptPolicy: "send-full-technically-eligible",
    providerRegistry: { require: () => providerCapability },
    readProviderReadiness: async () => ({
      schemaVersion: "agent-provider-readiness.v1",
      generatedAt: fixedNow(),
      cards: [providerReadiness],
      actions: [],
      diagnostics: []
    }),
    readPromptArtifactAudit: async () => providerPromptAudit
  };
  const prrMessage = {
    from: "investigator@example.org",
    to: ["records@example.gov"],
    cc: [],
    subject: "Dispatcher fixture request",
    subjectHash: hash("5"),
    bodyHash: hash("6"),
    renderedBodyHash: hash("7"),
    attachments: [],
    requiresLegalConfirmation: false,
    providerIdempotencyKey: "send_prr_dispatcher_corr_dispatcher"
  };
  const prrCapabilities = {
    provider: "gmail" as const,
    canSend: true,
    canSync: true,
    canFetchAttachments: true,
    credentialMode: "cestus-oauth" as const
  };
  const prrContext = {
    ledger: prrLedger,
    correspondenceService: {
      async sendInitialRequest() {
        throw new Error("dispatcher fixture does not execute PRR sends");
      },
      async sendFollowUp() {
        throw new Error("dispatcher fixture does not execute PRR sends");
      }
    },
    domainActor: humanActor,
    residentAgentId,
    taskId,
    toolId: "prr.initial-send.execute",
    prrRequestId: "prr_dispatcher",
    correspondenceId: "corr_dispatcher",
    provider: "gmail",
    messageSourceEventId: "evt_dispatcher_prr_created",
    approvedMessage: prrMessage,
    approvedRequestState: {
      requestCreatedEventId: "evt_dispatcher_prr_created",
      status: "draft",
      jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
      confirmedStalling: false
    },
    approvedProviderCapabilities: prrCapabilities,
    readCurrentMessage: async () => ({
      from: prrMessage.from,
      to: [...prrMessage.to],
      cc: [...prrMessage.cc],
      subject: prrMessage.subject,
      body: "Fixture body.",
      renderedBody: "Fixture body.",
      attachments: [],
      requiresLegalConfirmation: false
    }),
    readProviderCapabilities: async () => prrCapabilities
  };
  const acceptedGraphContext = {
    ledger: acceptedGraphLedger,
    assertionService: {
      async accept() {
        throw new Error("dispatcher fixture does not accept graph state");
      }
    },
    reviewer: humanActor,
    residentAgentId,
    taskId,
    assertionId: "as_dispatcher_fixture",
    proposalEventId: "evt_dispatcher_assertion_proposed",
    evidenceId: "ev_dispatcher_assertion",
    evidenceEventId: "evt_dispatcher_assertion_evidence",
    evidenceContentHash: hash("8"),
    reviewerRationaleDraft: "The fixture binds one reviewed assertion.",
    ontologyPackVersions: { core: "0.1.0" }
  };
  const exportContext = {
    ledger: exportLedger,
    governanceService: {
      async recordExportGenerated() {
        throw new Error("dispatcher fixture does not generate exports");
      },
      async recordReportGenerated() {
        throw new Error("dispatcher fixture does not generate reports");
      }
    },
    actor: humanActor,
    residentAgentId,
    taskId,
    toolId: "governance.export.generate",
    artifactKind: "export",
    artifactId: "exp_dispatcher_fixture",
    requestedEvidenceIds: ["ev_dispatcher_export"],
    includedEvidenceIds: ["ev_dispatcher_export"],
    includedContentHashes: [hash("8")],
    sensitiveOptIns: [],
    defaultPublicSafeOnly: true,
    policy: { policyId: "gov_policy_dispatcher", version: "0.1.0" },
    causationEventId: "evt_dispatcher_export_causation",
    outputArtifactHash: hash("9")
  };
  const repairAction = {
    actionId: "action_dispatcher_projection",
    kind: "rebuild-projection",
    title: "Rebuild the expendable dispatcher fixture projection.",
    severity: "warning",
    requiresHumanApproval: true,
    mutatesCanonicalState: false,
    allowedNextCommands: ["projection rebuild-readiness", "projection rebuild"]
  };
  const projectionContext = {
    ledger: destructiveLedger,
    domainActor: humanActor,
    residentAgentId,
    taskId,
    toolId: "workspace.projection-rebuild.execute",
    layout: {
      status: "ready",
      rootPath: "/workspace/dispatcher-fixture",
      workspace: {
        workspaceId,
        label: "Dispatcher fixture workspace",
        manifestVersion: 1,
        rootUri: "file:///workspace/dispatcher-fixture",
        layoutContractVersion: "portable-workspace-layout.v1"
      },
      layout: {
        rootPath: "/workspace/dispatcher-fixture",
        manifestPath: "/workspace/dispatcher-fixture/cestus-workspace.json"
      },
      diagnostics: []
    },
    workspaceFileSystem: {
      async exists() { return true; },
      async readText() { return "{}"; },
      async stat() { return { kind: "file", sizeBytes: 2 }; },
      async list() { return []; },
      async realpath(path: string) { return path; },
      async availableBytes() { return 1_000_000; }
    },
    projectionFileSystem: {
      async exists() { return true; },
      async writeText() {},
      async remove() {},
      async promoteDirectory() {},
      async availableBytes() { return 1_000_000; }
    },
    eventReader: { async readAll() { return []; } },
    builder: { projectionName: "graph", async build() { return { "projection.json": "{}" }; } },
    projectionName: "graph",
    rebuildId: "rb_dispatcher_graph",
    proposedAction: repairAction,
    dataLossRiskSummary: "Canonical state is not modified by this fixture.",
    readBackupManifest: async () => ({
      workspaceId,
      layoutContractVersion: "portable-workspace-layout.v1",
      ledgerHighWaterMark: 0,
      coveredCategories: [
        "manifest", "ledger", "blobs", "derivatives", "jobs", "projections", "cache", "config"
      ],
      exportedAt: fixedNow()
    })
  };
  const canonicalAction = {
    actionId: "repair_dispatcher_ledger",
    kind: "append-repair-event-required",
    title: "Record an append-only dispatcher fixture repair.",
    severity: "error",
    requiresHumanApproval: true,
    mutatesCanonicalState: true,
    allowedNextCommands: ["diagnostics inspect"]
  };
  const canonicalRepairContext = {
    ledger: destructiveLedger,
    domainActor: humanActor,
    residentAgentId,
    taskId,
    toolId: "workspace.canonical-repair.record",
    workspace: {
      workspaceId,
      label: "Dispatcher fixture workspace",
      manifestVersion: 1,
      rootUri: "file:///workspace/dispatcher-fixture",
      layoutContractVersion: "portable-workspace-layout.v1"
    },
    manifestHash: hash("a"),
    ledgerHighWaterMark: 0,
    backupManifestRef: {
      available: true,
      manifestHash: hash("b"),
      ledgerHighWaterMark: 0,
      stale: false
    },
    target: {
      kind: "canonical-root",
      root: "ledger",
      repairActionId: canonicalAction.actionId
    },
    proposedAction: canonicalAction,
    dataLossRiskSummary: "Canonical repair remains blocked without an append-only repair service.",
    readinessChecks: [{
      checkId: "append_only_repair_service_available",
      status: "fail",
      safeMessage: "Append-only workspace repair service is unavailable."
    }],
    readinessDiagnosticsHash: hash("c")
  };
  const legacyContext = {
    runtime: {
      async stagingPreview() {
        return {
          ok: true,
          command: "legacy staging-preview",
          sourceCollectionId: "src_dispatcher_legacy",
          legacyReportId: "legacy_report_dispatcher",
          reportHash: hash("d"),
          candidateSetHash: hash("e"),
          candidates: [{
            candidateId: "legacy_candidate_dispatcher",
            evidenceId: "ev_dispatcher_legacy",
            evidenceContentHash: hash("f"),
            sourcePath: "fixture.json"
          }],
          nextActions: []
        };
      },
      async approveStaging() {
        throw new Error("dispatcher fixture does not approve legacy staging");
      },
      async stageApproved() {
        throw new Error("dispatcher fixture does not execute legacy staging");
      }
    },
    ledger: legacyLedger,
    residentAgentId,
    sourceCollectionId: "src_dispatcher_legacy",
    scanBatchId: "scan_dispatcher_legacy",
    stagingBatchId: "stage_dispatcher_legacy",
    legacyReportId: "legacy_report_dispatcher",
    reportHash: hash("d"),
    candidateSetHash: hash("e"),
    selectedCandidateIds: ["legacy_candidate_dispatcher"]
  };

  return [
    fixture("provider-byte-transfer", [0, 1], providerLedger, {
      kind: "provider-byte-transfer",
      workspaceId,
      residentAgentId,
      taskId,
      context: providerContext
    }),
    fixture("prr-correspondence", [2, 3], prrLedger, {
      kind: "prr-correspondence",
      workspaceId,
      residentAgentId,
      taskId,
      context: prrContext
    }),
    fixture("accepted-graph-review", [4], acceptedGraphLedger, {
      kind: "accepted-graph-review",
      workspaceId,
      residentAgentId,
      taskId,
      context: acceptedGraphContext
    }),
    fixture("export-report", [5, 6], exportLedger, {
      kind: "export-report",
      workspaceId,
      residentAgentId,
      taskId,
      context: exportContext
    }),
    fixture("destructive-repair", [7, 8], destructiveLedger, {
      kind: "destructive-repair",
      workspaceId,
      residentAgentId,
      taskId,
      projectionContext,
      canonicalRepairContext
    }),
    fixture("legacy-staging", [9, 10], legacyLedger, {
      kind: "legacy-staging",
      workspaceId,
      residentAgentId,
      taskId,
      context: legacyContext
    })
  ];

  function fixture(
    kind: ResidentFactoryKind,
    ordinals: readonly number[],
    ledger: InMemoryEventLedger,
    binding: Record<string, unknown>
  ): ResidentFactoryFixture {
    return { kind, ordinals, ledger, binding, workspaceId, residentAgentId, taskId };
  }
}

function residentCatalogRows(): readonly ResidentCatalogRow[] {
  return [
    catalogRow("provider-byte-transfer", 0, "createProviderByteTransferAdapter",
      "providerByteTransferDescriptor", "provider-byte-transfer.adapter.v1", "provider.bytes.transfer"),
    catalogRow("provider-byte-transfer", 1, "createProviderParseExecutionAdapter",
      "providerParseExecuteDescriptor", "provider-parse-execution.adapter.v1", "ingestion.provider-parse.execute"),
    catalogRow("prr-correspondence", 2, "createPrrInitialSendExecutionAdapter",
      "prrInitialSendExecuteDescriptor", "prr-initial-send-execution.adapter.v1", "prr.initial-send.execute"),
    catalogRow("prr-correspondence", 3, "createPrrFollowUpExecutionAdapter",
      "prrFollowUpExecuteDescriptor", "prr-follow-up-execution.adapter.v1", "prr.follow-up.execute"),
    catalogRow("accepted-graph-review", 4, "createAcceptedGraphAssertionReviewAdapter",
      "acceptedGraphAssertionReviewDescriptor", "accepted-graph-assertion-review.adapter.v1",
      "ontology.assertion.accept"),
    catalogRow("export-report", 5, "createExportGenerationAdapter",
      "exportGenerateDescriptor", "export-generation.adapter.v1", "governance.export.generate"),
    catalogRow("export-report", 6, "createReportGenerationAdapter",
      "reportGenerateDescriptor", "report-generation.adapter.v1", "governance.report.generate"),
    catalogRow("destructive-repair", 7, "createWorkspaceProjectionRebuildAdapter",
      "workspaceProjectionRebuildDescriptor", "workspace-projection-rebuild.adapter.v1",
      "workspace.projection-rebuild.execute"),
    catalogRow("destructive-repair", 8, "createBlockedCanonicalRepairAdapter",
      "workspaceCanonicalRepairDescriptor", "blocked-canonical-repair.adapter.v1",
      "workspace.canonical-repair.record"),
    catalogRow("legacy-staging", 9, "createLegacyStagingApprovalAdapter",
      "legacyStagingApproveDescriptor", "legacy-staging-approval.adapter.v1",
      "legacy.staging.approve"),
    {
      ...catalogRow("legacy-staging", 10, "createLegacyStagingExecutionAdapter",
        "legacyStagingExecuteDescriptor", "legacy-staging-execution.adapter.v1",
        "legacy.staging.execute"),
      authorizationKind: "automatic-policy"
    }
  ];
}

function catalogRow(
  kind: ResidentFactoryKind,
  ordinal: number,
  constructorName: string,
  descriptorName: string,
  implementationRevision: string,
  toolId: string
): ResidentCatalogRow {
  return {
    kind,
    ordinal,
    constructorName,
    descriptorName,
    implementationRevision,
    toolId,
    toolVersion: "0.1.0",
    authorizationKind: "human-approval"
  };
}

function expectedResidentCatalogImports(): Readonly<Record<string, readonly string[]>> {
  return {
    "./adapters/provider-byte-transfer.js": [
      "createProviderByteTransferAdapter",
      "createProviderParseExecutionAdapter",
      "providerByteTransferDescriptor",
      "providerParseExecuteDescriptor"
    ],
    "./adapters/prr-correspondence.js": [
      "createPrrInitialSendExecutionAdapter",
      "createPrrFollowUpExecutionAdapter",
      "prrInitialSendExecuteDescriptor",
      "prrFollowUpExecuteDescriptor"
    ],
    "./adapters/accepted-graph-review.js": [
      "createAcceptedGraphAssertionReviewAdapter",
      "acceptedGraphAssertionReviewDescriptor"
    ],
    "./adapters/export-report.js": [
      "createExportGenerationAdapter",
      "createReportGenerationAdapter",
      "exportGenerateDescriptor",
      "reportGenerateDescriptor"
    ],
    "./adapters/destructive-repair.js": [
      "createWorkspaceProjectionRebuildAdapter",
      "createBlockedCanonicalRepairAdapter",
      "workspaceProjectionRebuildDescriptor",
      "workspaceCanonicalRepairDescriptor"
    ],
    "./adapters/legacy-staging.js": [
      "createLegacyStagingApprovalAdapter",
      "createLegacyStagingExecutionAdapter",
      "legacyStagingApproveDescriptor",
      "legacyStagingExecuteDescriptor"
    ]
  };
}

function staticNamedImports(sourceFile: ts.SourceFile): Record<string, readonly string[]> {
  return Object.fromEntries(sourceFile.statements.flatMap((statement) => {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.importClause?.namedBindings === undefined ||
      !ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      return [];
    }
    return [[
      statement.moduleSpecifier.text,
      statement.importClause.namedBindings.elements.map((element) => element.propertyName?.text ?? element.name.text)
    ]];
  }));
}

function dynamicLoaderNodes(sourceFile: ts.SourceFile): readonly string[] {
  const violations: string[] = [];
  visit(sourceFile);
  return violations;

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        violations.push("dynamic import");
      } else if (
        ts.isIdentifier(node.expression) &&
        ["require", "eval", "Function"].includes(node.expression.text)
      ) {
        violations.push(node.expression.text);
      }
    }
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Function") {
      violations.push("new Function");
    }
    ts.forEachChild(node, visit);
  }
}

function topLevelImportedCatalogReads(sourceFile: ts.SourceFile): readonly string[] {
  const importedNames = new Set(residentCatalogRows().flatMap((row) => [
    row.constructorName,
    row.descriptorName
  ]));
  const violations: string[] = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (declaration.initializer === undefined) continue;
      visit(declaration.initializer);
    }
  }
  return violations;

  function visit(node: ts.Node): void {
    if (ts.isIdentifier(node) && importedNames.has(node.text)) {
      violations.push(node.text);
    }
    ts.forEachChild(node, visit);
  }
}

function residentInvocationFor(
  row: ResidentCatalogRow,
  fixture: ResidentFactoryFixture
): Record<string, unknown> {
  const authorizationKind = row.authorizationKind ?? (row.ordinal === 10 ? "automatic-policy" : "human-approval");
  return {
    authorizationKind,
    logicalLocator: {
      workspaceId: fixture.workspaceId,
      residentAgentId: fixture.residentAgentId,
      taskId: fixture.taskId,
      attemptId: "attempt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      runId: "run_dispatcher_catalog",
      planId: "plan_dispatcher_catalog",
      planRevision: 1,
      stepOrdinal: row.ordinal,
      toolRequestId: `toolreq_dispatcher_${row.ordinal}`,
      toolId: row.toolId,
      toolVersion: row.toolVersion,
      executionCapabilityHash: hash("0")
    },
    requestEventId: `evt_dispatcher_request_${row.ordinal}`,
    executionClaimEventId: `evt_dispatcher_claim_${row.ordinal}`,
    previewHash: hash("1"),
    ...(authorizationKind === "human-approval"
      ? {
          decisionEventId: `evt_dispatcher_decision_${row.ordinal}`,
          approvedBy: humanActor.id,
          approvedPreviewHash: hash("1")
        }
      : {})
  };
}

function dispatcherSource(): string {
  return readFileSync(
    fileURLToPath(new URL("../src/domain-execution-dispatcher.ts", import.meta.url)),
    "utf8"
  );
}

function hash(fill: string): `sha256:${string}` {
  return `sha256:${fill.repeat(64).slice(0, 64)}`;
}

const domainDescriptor: AgentDomainToolDescriptor = Object.freeze({
  toolId: "ontology.assertion.accept",
  toolVersion: "0.1.0",
  family: "accepted-graph-review",
  sideEffectClass: "ledger-review",
  requiredApprovalClass: "ledger-review",
  inputSchemaId: "ontology-assertion-accept-input.v1",
  outputSchemaId: "agent-domain-result.v1",
  targetDomainService: "ontology.assertion-service",
  idempotencyKeyFields: ["assertionId", "reviewEventId"],
  forbiddenEffects: ["prr-send", "provider-byte-transfer", "export-report"]
});

function fixedNow(): string {
  return "2026-07-09T12:00:00.000Z";
}

function previewFor(toolRequestId: string): AgentToolPreview {
  return {
    summary: `Accept reviewed assertion for ${toolRequestId}.`,
    relatedEventIds: [sourceEventId],
    artifactHashes: [inputArtifactHash],
    scope: "Accepted graph review for one previously proposed assertion.",
    estimatedEffect: "Calls the ontology assertion review service after approval is consumed."
  };
}

function adapterFor(
  preview: AgentToolPreview,
  overrides: Partial<AgentDomainExecutionAdapter> = {}
): AgentDomainExecutionAdapter {
  return {
    descriptor: domainDescriptor,
    async buildCurrentPreview() {
      return approvedPreviewResult({ preview });
    },
    async executeApproved() {
      return {
        eventIds: ["evt_domain_assertion_accepted"],
        artifactHashes: [resultArtifactHash],
        readModelChanges: [{
          projectionName: "accepted-graph",
          change: "accepted reviewed assertion",
          relatedIds: ["assertion_accepted_001"]
        }],
        resultSummary: "Accepted graph review completed through domain service."
      };
    },
    ...overrides
  };
}

function approvedPreviewResult(
  overrides: Partial<Awaited<ReturnType<AgentApprovedToolExecutorDescriptor["buildCurrentPreview"]>>> = {}
): Awaited<ReturnType<AgentApprovedToolExecutorDescriptor["buildCurrentPreview"]>> {
  return {
    preview: previewFor("toolreq_default_domain_preview"),
    sourceEventIds: [sourceEventId],
    inputArtifactHashes: [inputArtifactHash],
    provenanceRefs: [sourceEventId, inputArtifactHash],
    activeLocks: [],
    freshnessChecks: [{
      name: "agent-projection",
      expected: "high-watermark:1",
      actual: "high-watermark:1",
      ok: true
    }],
    ...overrides
  };
}

async function requestAndApprove(
  ledger: InMemoryEventLedger,
  preview: AgentToolPreview,
  toolRequestId: string
) {
  const gateway = createAgentToolGateway({ ledger, actor: agentActor, now: fixedNow });
  const requested = await gateway.requestTool({
    toolRequestId,
    residentAgentId: "agent_default",
    taskId: "task_domain_dispatcher",
    runId: "run_domain_dispatcher",
    toolId: domainDescriptor.toolId,
    toolVersion: domainDescriptor.toolVersion,
    sideEffectClass: domainDescriptor.sideEffectClass,
    requiredApprovalClass: domainDescriptor.requiredApprovalClass as AgentApprovalClass,
    preview
  });
  expect(requested.payload.previewHash).toBe(hashAgentToolPreview(preview));
  await gateway.approveTool({
    toolRequestId,
    actor: humanActor,
    approvedPreviewHash: requested.payload.previewHash,
    rationale: "Human approved the exact domain execution preview."
  });
  return requested;
}

async function wakeWithPreviewResult(
  toolRequestId: string,
  previewPatch: Partial<Awaited<ReturnType<AgentApprovedToolExecutorDescriptor["buildCurrentPreview"]>>>
) {
  const ledger = new InMemoryEventLedger();
  const preview = previewFor(toolRequestId);
  await requestAndApprove(ledger, preview, toolRequestId);
  let executions = 0;
  const dispatcher = createAgentDomainExecutionDispatcher({
    ledger,
    actor: schedulerActor,
    now: fixedNow,
    adapters: [adapterFor(preview, {
      async buildCurrentPreview() {
        return approvedPreviewResult({ preview, ...previewPatch });
      },
      async executeApproved() {
        executions += 1;
        return {
          eventIds: ["evt_domain_assertion_accepted"],
          artifactHashes: [resultArtifactHash],
          readModelChanges: [{ projectionName: "accepted-graph", change: "accepted reviewed assertion" }],
          resultSummary: "Accepted graph review completed through domain service."
        };
      }
    })]
  });
  const result = await dispatcher.wake();
  return { result, executions, events: await ledger.readAll() };
}

function eventOfType<Type extends KnowledgeEvent["type"]>(
  events: readonly KnowledgeEvent[],
  type: Type
): Extract<KnowledgeEvent, { type: Type }> {
  const event = events.find((candidate): candidate is Extract<KnowledgeEvent, { type: Type }> =>
    candidate.type === type
  );
  if (event === undefined) {
    throw new Error(`Expected ${type} event`);
  }
  return event;
}

async function appendDomainResult(ledger: InMemoryEventLedger, toolRequestId: string) {
  const claim = (await ledger.readStream(`agent_tool_request_${toolRequestId}`)).find(
    (event) => event.type === "agent.tool.execution.claimed"
  );
  if (claim === undefined) throw new Error("domain result requires execution claim");
  return await ledger.append({
    type: "evidence.ingested",
    version: 1,
    streamId: "evidence_result_domain",
    context: {
      actor: schedulerActor,
      occurredAt: fixedNow(),
      causationId: claim.id,
      correlationId: `corr_${toolRequestId}_domain_result`,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", agent: "0.1.0" }
    },
    payload: {
      evidenceId: "ev_domain_result",
      source: { kind: "manual", label: "Domain execution result" },
      contentHash: resultArtifactHash,
      mediaType: "application/json",
      sizeBytes: 1
    }
  });
}
