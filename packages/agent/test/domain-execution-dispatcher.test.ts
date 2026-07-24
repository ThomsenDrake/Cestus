import {
  type AppendableKnowledgeEvent,
  type KnowledgeEvent,
  type KnowledgeEventOf
} from "../../ontology/src/contracts.js";
import { AssertionService } from "../../ontology/src/assertion-service.js";
import { GovernanceService } from "../../ontology/src/governance-service.js";
import {
  type AppendOptions,
  type EventLedger,
  InMemoryEventLedger
} from "../../ontology/src/event-ledger.js";
import { goldenGovernanceLedgerEvents } from "../../ontology/test/fixtures/golden-governance-ledger.js";
import type {
  AdapterCapabilities,
  ApprovedMessageInput,
  CorrespondenceAdapter,
  SentMessageResult,
  SyncResult
} from "../../prr/src/correspondence-adapter.js";
import { PrrCorrespondenceService } from "../../prr/src/correspondence-service.js";
import { PrrLifecycleService } from "../../prr/src/lifecycle.js";
import type { WorkspaceStats } from "../../workspace-ops/src/filesystem.js";
import { resolveWorkspaceLayout } from "../../workspace-ops/src/layout.js";
import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
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
  createPrrInitialSendExecutionAdapter,
  type PrrCorrespondenceAdapterContext,
  type PrrCorrespondenceCurrentMessage
} from "../src/adapters/prr-correspondence.js";
import {
  createProviderByteTransferAdapter,
  createProviderParseExecutionAdapter
} from "../src/adapters/provider-byte-transfer.js";
import { buildContextPackRef } from "../src/context-packs.js";
import { buildPromptArtifact, promptArtifactAuditMetadata } from "../src/prompt-artifacts.js";
import { createProviderCapabilityDescriptor } from "../src/provider-registry.js";
import * as domainExecutionDispatcherModule from "../src/domain-execution-dispatcher.js";
import { createResidentLoopToolGateway } from "../src/resident-loop-tool-gateway.js";
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
    const fixtures = await residentFactoryFixtures();
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
    await proveReleasedResidentFixtureEvidence(fixtures);

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

    const prr = fixtures[1]!;
    const initialContext = requiredBindingContext(prr, "initialContext");
    const followUpContext = requiredBindingContext(prr, "followUpContext");
    expect(initialContext).not.toBe(followUpContext);
    expect(Reflect.get(initialContext, "ledger")).toBe(Reflect.get(followUpContext, "ledger"));
    for (const binding of [
      {
        ...prr.binding,
        initialContext: followUpContext,
        followUpContext: initialContext
      },
      {
        ...prr.binding,
        followUpContext: {
          ...followUpContext,
          ledger: new InMemoryEventLedger()
        }
      },
      {
        ...prr.binding,
        followUpContext: {
          ...followUpContext,
          taskId: "task_dispatcher_cross_used"
        }
      }
    ]) {
      await expect(api.create(binding)).rejects.toThrow(
        /context|tool|ledger|same|resident|task|binding/i
      );
    }

    const exportReport = fixtures[3]!;
    const exportContext = requiredBindingContext(exportReport, "exportContext");
    const reportContext = requiredBindingContext(exportReport, "reportContext");
    expect(exportContext).not.toBe(reportContext);
    expect(Reflect.get(exportContext, "ledger")).toBe(Reflect.get(reportContext, "ledger"));
    for (const binding of [
      {
        ...exportReport.binding,
        exportContext: reportContext,
        reportContext: exportContext
      },
      {
        ...exportReport.binding,
        reportContext: {
          ...reportContext,
          ledger: new InMemoryEventLedger()
        }
      },
      {
        ...exportReport.binding,
        reportContext: {
          ...reportContext,
          residentAgentId: "agent_dispatcher_cross_used"
        }
      }
    ]) {
      await expect(api.create(binding)).rejects.toThrow(
        /context|tool|artifact|ledger|same|resident|task|binding/i
      );
    }

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
    const factoryFixture = (await residentFactoryFixtures())[2]!;
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
    const fixtures = await residentFactoryFixtures();
    const rows = residentCatalogRows();
    const fixtureByKind = new Map(fixtures.map((fixture) => [fixture.kind, fixture]));

    for (const row of rows) {
      const fixture = fixtureByKind.get(row.kind)!;
      if ([0, 1, 8].includes(row.ordinal)) {
        const before = await fixture.ledger.readAll();
        let successfulAttestation: ResidentCatalogExecutionEvidence | undefined;
        let rejection: unknown;
        try {
          successfulAttestation = await executeResidentCatalogRow(
            fixture,
            row,
            `closed-${row.ordinal}`
          );
        } catch (error) {
          rejection = error;
          // The exact package-owned adapter rejection is the admissible path.
        }
        expect(rejection).toBeDefined();
        expect(successfulAttestation).toBeUndefined();
        const after = await fixture.ledger.readAll();
        expect(successfulResidentEventsForTool(after, row.toolId)).toEqual([]);
        expect(successfulResidentEventsForTool([
          ...after,
          {
            type: "agent.resident-domain.completed.v1",
            payload: { logicalLocator: { toolId: row.toolId } }
          }
        ], row.toolId)).toEqual([
          "agent.resident-domain.completed.v1"
        ]);
        expect(after.length).toBeGreaterThanOrEqual(before.length);
        continue;
      }

      const first = await executeResidentCatalogRow(
        fixture,
        row,
        `new-${row.ordinal}`
      );
      expect(first.receipt.payload).toMatchObject({
        catalogOrdinal: row.ordinal,
        implementationRevision: row.implementationRevision,
        evidenceMode: row.ordinal === 7
          ? "nonledger-projection-artifacts"
          : "new-ledger-events"
      });
      expect(first.completed.payload.authorization).toMatchObject({
        authorizationKind:
          row.ordinal === 10 ? "automatic-policy" : "human-approval"
      });

      if (row.ordinal !== 7) {
        const second = await executeResidentCatalogRow(
          fixture,
          row,
          `existing-${row.ordinal}`
        );
        expect(second.receipt.payload).toMatchObject({
          catalogOrdinal: row.ordinal,
          implementationRevision: row.implementationRevision,
          evidenceMode: "idempotent-existing-ledger-events"
        });
        expect(second.receipt.payload.domainEventIds)
          .toEqual(first.receipt.payload.domainEventIds);
      }
    }
  });

  it("allows the ordinal-10 automatic compatibility bridge and no other ordinal", async () => {
    const fixtures = await residentFactoryFixtures();
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
  readonly ledger: EventLedger;
  readonly workspaceId: string;
  readonly residentAgentId: "agent_default";
  readonly taskId: string;
}

interface UnknownResidentDomainApi {
  readonly create: (input: unknown) => Promise<unknown>;
  readonly bind: (input: unknown) => unknown;
}

type ResidentRequestedAppend = Extract<
  AppendableKnowledgeEvent,
  { readonly type: "agent.resident-domain.requested.v1" }
>;
type ResidentLogicalLocator =
  ResidentRequestedAppend["payload"]["logicalLocator"];
type ResidentBudget = ResidentRequestedAppend["payload"]["budget"];

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
        createPrrInitialSendExecutionAdapter(
          Reflect.get(fixture.binding, "initialContext") as never
        ),
        createPrrFollowUpExecutionAdapter(
          Reflect.get(fixture.binding, "followUpContext") as never
        )
      ];
    case "accepted-graph-review":
      return [createAcceptedGraphAssertionReviewAdapter(context as never)];
    case "export-report":
      return [
        createExportGenerationAdapter(
          Reflect.get(fixture.binding, "exportContext") as never
        ),
        createReportGenerationAdapter(
          Reflect.get(fixture.binding, "reportContext") as never
        )
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

async function proveReleasedResidentFixtureEvidence(
  fixtures: readonly ResidentFactoryFixture[]
): Promise<void> {
  const rows = residentCatalogRows();
  const fixtureByKind = new Map(fixtures.map((fixture) => [fixture.kind, fixture]));
  const adapterByOrdinal = new Map<number, AgentDomainExecutionAdapter>();
  for (const fixture of fixtures) {
    const adapters = constructFixtureAdapters(fixture);
    expect(adapters).toHaveLength(fixture.ordinals.length);
    for (const [index, ordinal] of fixture.ordinals.entries()) {
      adapterByOrdinal.set(ordinal, adapters[index]!);
    }
  }
  const expectedEventType = new Map<number, KnowledgeEvent["type"]>([
    [2, "prr.request.sent"],
    [3, "prr.followup.sent"],
    [4, "assertion.accepted"],
    [5, "export.generated"],
    [6, "report.generated"],
    [9, "legacy.ontology.staging.approved"],
    [10, "assertion.proposed"]
  ]);

  for (const row of rows) {
    const fixture = fixtureByKind.get(row.kind)!;
    const adapter = adapterByOrdinal.get(row.ordinal)!;
    const previewInput = {
      toolRequestId: `toolreq_dispatcher_preflight_${row.ordinal}`,
      toolId: row.toolId,
      toolVersion: row.toolVersion,
      runId: `run_dispatcher_preflight_${row.ordinal}`,
      taskId: fixture.taskId,
      requestedPreviewHash: hash("0")
    };
    const before = await fixture.ledger.readAll();
    if ([0, 1].includes(row.ordinal)) {
      await expect(
        Promise.resolve(adapter.buildCurrentPreview(previewInput))
      ).rejects.toBeDefined();
      expect(await fixture.ledger.readAll()).toEqual(before);
      continue;
    }
    const current = await adapter.buildCurrentPreview(previewInput);
    const previewHash = hashAgentToolPreview(current.preview);
    const execution = {
      toolRequestId: previewInput.toolRequestId,
      toolId: previewInput.toolId,
      toolVersion: previewInput.toolVersion,
      runId: previewInput.runId,
      taskId: previewInput.taskId,
      sideEffectClass: adapter.descriptor.sideEffectClass,
      approvalClass: adapter.descriptor.requiredApprovalClass,
      previewHash,
      approvedPreviewHash: previewHash,
      approvedBy: humanActor.id,
      sourceEventIds: current.sourceEventIds,
      inputArtifactHashes: current.inputArtifactHashes,
      provenanceRefs: current.provenanceRefs
    };
    if (row.ordinal === 8) {
      await expect(adapter.executeApproved(execution)).rejects.toMatchObject({
        category: expect.stringMatching(
          row.ordinal === 8 ? /data-loss-risk/i : /domain-gate-failed/i
        )
      });
      expect(await fixture.ledger.readAll()).toEqual(before);
      continue;
    }

    const first = await adapter.executeApproved(execution);
    const afterFirst = await fixture.ledger.readAll();
    if (row.ordinal === 7) {
      expect(first.eventIds).toEqual([]);
      expect(first.artifactHashes.length).toBeGreaterThan(0);
      expect(first.readModelChanges).toEqual([
        expect.objectContaining({
          projectionName: "workspace-projection-artifacts"
        })
      ]);
      expect(afterFirst).toEqual(before);
      continue;
    }

    const eventType = expectedEventType.get(row.ordinal);
    expect(eventType).toBeDefined();
    expect(first.eventIds.length).toBeGreaterThan(0);
    const newEvents = afterFirst.filter(
      (event) => !before.some((candidate) => candidate.id === event.id)
    );
    expect(newEvents.map((event) => event.id)).toEqual(first.eventIds);
    expect(newEvents.every((event) => event.type === eventType)).toBe(true);

    const second = await adapter.executeApproved(execution);
    expect(second.eventIds).toEqual(first.eventIds);
    expect(await fixture.ledger.readAll()).toEqual(afterFirst);
  }
}

interface ResidentCatalogExecutionEvidence {
  readonly receipt: KnowledgeEventOf<"agent.resident-domain.outcome-observed.v1">;
  readonly completed: KnowledgeEventOf<"agent.resident-domain.completed.v1">;
}

function successfulResidentEventsForTool(
  events: readonly unknown[],
  toolId: string
): readonly string[] {
  return events.flatMap((value) => {
    if (typeof value !== "object" || value === null) {
      return [];
    }
    const type = Reflect.get(value, "type");
    if (
      type !== "agent.resident-domain.outcome-observed.v1" &&
      type !== "agent.resident-domain.completed.v1"
    ) {
      return [];
    }
    const payload = Reflect.get(value, "payload");
    const locator = typeof payload === "object" && payload !== null
      ? Reflect.get(payload, "logicalLocator")
      : undefined;
    return typeof locator === "object" &&
      locator !== null &&
      Reflect.get(locator, "toolId") === toolId
      ? [type]
      : [];
  });
}

async function executeResidentCatalogRow(
  fixture: ResidentFactoryFixture,
  row: ResidentCatalogRow,
  suffix: string
): Promise<ResidentCatalogExecutionEvidence> {
  const residentApi = residentDomainApi(domainExecutionDispatcherModule);
  const capability = await residentApi.create(fixture.binding);
  const port = residentApi.bind({
    capability,
    mountedLedger: fixture.ledger,
    workspaceId: fixture.workspaceId,
    residentAgentId: fixture.residentAgentId,
    taskId: fixture.taskId
  });
  const gateway = Reflect.apply(createResidentLoopToolGateway, undefined, [{
    ledger: fixture.ledger,
    now: fixedNow,
    residentDomainExecutionPort: port,
    async reverifyBeforeEffect() {
      return Object.freeze({ kind: "current" });
    },
    async reverifyAfterEffect() {
      return Object.freeze({ kind: "current" });
    },
    createTrustedToolRequestId() {
      return `toolreq_dispatcher_${suffix}`;
    }
  }]);
  if (typeof gateway !== "object" || gateway === null) {
    throw new Error("Task12 resident G constructor returned no object.");
  }
  const prepare = requiredUnknownMethod(gateway, "preparePlannedStepBindings");
  const planId = `plan_dispatcher_${suffix}`;
  const attemptId =
    "attempt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const runId = `run_dispatcher_${suffix}`;
  const prepared = await Reflect.apply(prepare, gateway, [{
    workspaceId: fixture.workspaceId,
    residentAgentId: fixture.residentAgentId,
    taskId: fixture.taskId,
    attemptId,
    runId,
    planId,
    planRevision: 0,
    steps: [{
      ordinal: 1,
      toolId: row.toolId,
      toolVersion: row.toolVersion
    }]
  }]);
  if (!Array.isArray(prepared) || prepared.length !== 1) {
    throw new Error("Task12 resident G did not prepare exactly one binding.");
  }
  const preparedBinding = asDataRecord(prepared[0]);
  const toolRequestId = Reflect.get(preparedBinding, "toolRequestId");
  const executionCapabilityHash = Reflect.get(
    preparedBinding,
    "executionCapabilityHash"
  );
  if (
    typeof toolRequestId !== "string" ||
    typeof executionCapabilityHash !== "string" ||
    !/^sha256:[a-f0-9]{64}$/.test(executionCapabilityHash)
  ) {
    throw new Error("Task12 resident G returned a malformed prepared binding.");
  }
  const events = await fixture.ledger.readAll();
  const source = events[0];
  if (source === undefined) {
    throw new Error("Resident catalog fixture lacks durable plan provenance.");
  }
  const locator: ResidentLogicalLocator = Object.freeze({
    workspaceId: fixture.workspaceId,
    residentAgentId: fixture.residentAgentId,
    taskId: fixture.taskId,
    attemptId,
    runId,
    planId,
    planRevision: 0,
    stepOrdinal: 1,
    toolRequestId,
    toolId: row.toolId,
    toolVersion: row.toolVersion,
    executionCapabilityHash: executionCapabilityHash as `sha256:${string}`
  });
  const plan = await appendResidentCatalogPlan(
    fixture.ledger,
    source,
    locator,
    suffix
  );
  const requestFresh = requiredUnknownMethod(
    gateway,
    "requestFreshAuthorized"
  );
  const requested = await Reflect.apply(requestFresh, gateway, [locator]);
  let executable = requested;
  if (row.ordinal !== 10) {
    await appendResidentCatalogHumanApproval(
      fixture.ledger,
      locator,
      plan,
      suffix
    );
    const readFreshHumanDecision = requiredUnknownMethod(
      gateway,
      "readFreshHumanDecision"
    );
    executable = await Reflect.apply(
      readFreshHumanDecision,
      gateway,
      [requested]
    );
  }
  const execute = requiredUnknownMethod(gateway, "executeFreshAuthorized");
  await Reflect.apply(execute, gateway, [executable]);
  const stream = await fixture.ledger.readStream(
    residentCatalogStreamId(locator)
  );
  const receipt = stream.find(
    (event): event is KnowledgeEventOf<"agent.resident-domain.outcome-observed.v1"> =>
      event.type === "agent.resident-domain.outcome-observed.v1"
  );
  const completed = stream.find(
    (event): event is KnowledgeEventOf<"agent.resident-domain.completed.v1"> =>
      event.type === "agent.resident-domain.completed.v1"
  );
  if (receipt === undefined || completed === undefined) {
    throw new Error("Task12 resident G returned without durable receipt and completion.");
  }
  return { receipt, completed };
}

async function appendResidentCatalogPlan(
  ledger: EventLedger,
  source: KnowledgeEvent,
  locator: ResidentLogicalLocator,
  suffix: string
): Promise<KnowledgeEvent> {
  const budget = residentCatalogBudget();
  const planInput: Extract<
    AppendableKnowledgeEvent,
    { readonly type: "agent.resident-plan.recorded.v2" }
  > = {
    type: "agent.resident-plan.recorded.v2",
    version: 1,
    streamId:
      `agent_resident_loop_${locator.taskId}_${locator.attemptId}_${locator.runId}`,
    context: {
      actor: schedulerActor,
      occurredAt: fixedNow(),
      causationId: source.id,
      correlationId: `corr_dispatcher_${suffix}`,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", agent: "0.1.0" }
    },
    payload: {
      schemaVersion: "resident-plan-record.v2",
      residentAgentId: locator.residentAgentId,
      workspaceId: locator.workspaceId,
      taskId: locator.taskId,
      attemptId: locator.attemptId,
      runId: locator.runId,
      runMode: "evidence-triage",
      workflowDescriptor: {
        workflowDescriptorId: "workflow_evidence_triage",
        workflowDescriptorVersion: "v1",
        workflowDescriptorHash: hash("8")
      },
      policy: {
        policyId: "agent_policy_dispatcher",
        policyVersion: "policy_dispatcher_v1",
        policyHash: hash("e")
      },
      authority: {
        workspaceIdentityHash: hash("1"),
        mountGeneration: "mount_dispatcher",
        ledgerStoreIdentity: "ledger_dispatcher",
        artifactStoreIdentity: "artifact_dispatcher",
        ledgerHighWaterEventId: source.id,
        policyHash: hash("e"),
        activeLocksHash: hash("2")
      },
      sourceEventIds: [source.id],
      contextPackRefs: [{
        contextPackId: "context_pack_dispatcher",
        contentHash: hash("d")
      }],
      budget,
      causationId: source.id,
      correlationId: `corr_dispatcher_${suffix}`,
      planId: locator.planId,
      planRevision: locator.planRevision,
      priorPlanReadback: null,
      replanObservationReadback: null,
      steps: [{
        ordinal: locator.stepOrdinal,
        purpose: "Execute one exact package-owned resident catalog row.",
        toolId: locator.toolId,
        toolVersion: locator.toolVersion,
        allowlistEntryHash: hash("c"),
        expectedSafeOutputClass: "proposal",
        prerequisiteStepOrdinals: [],
        toolRequestId: locator.toolRequestId,
        executionCapabilityHash: locator.executionCapabilityHash
      }]
    }
  };
  return ledger.append(planInput);
}

async function appendResidentCatalogHumanApproval(
  ledger: EventLedger,
  locator: ResidentLogicalLocator,
  _plan: KnowledgeEvent,
  suffix: string
): Promise<void> {
  const streamId = residentCatalogStreamId(locator);
  const stream = await ledger.readStream(streamId);
  const requested = stream.find(
    (event): event is KnowledgeEventOf<"agent.resident-domain.requested.v1"> =>
      event.type === "agent.resident-domain.requested.v1"
  );
  if (requested === undefined) {
    throw new Error("Task12 resident G failed to append the fresh request.");
  }
  const approvalInput: Extract<
    AppendableKnowledgeEvent,
    { readonly type: "agent.resident-domain.human-approved.v1" }
  > = {
    type: "agent.resident-domain.human-approved.v1",
    version: 1,
    streamId,
    context: {
      actor: humanActor,
      occurredAt: fixedNow(),
      causationId: requested.id,
      correlationId: requested.payload.correlationId,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", agent: "0.1.0" }
    },
    payload: {
      schemaVersion: "resident-domain-human-approved.v1",
      logicalLocator: locator,
      executionCapabilityHash: locator.executionCapabilityHash,
      causationId: requested.id,
      correlationId: requested.payload.correlationId,
      authorizationKind: "human-approval",
      requestEventId: requested.id,
      decisionEventId: `evt_dispatcher_independent_decision_${suffix}`,
      approvedBy: humanActor.id,
      approvedPreviewHash: requested.payload.previewHash
    }
  };
  await ledger.append(approvalInput, { expectedNextSequence: 2 });
}

function residentCatalogStreamId(
  locator: ResidentLogicalLocator
): string {
  return `agent_resident_domain_${createHash("sha256")
    .update(canonicalResidentJson(locator))
    .digest("hex")}`;
}

function canonicalResidentJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalResidentJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalResidentJson(Reflect.get(value, key))}`
    ).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function residentCatalogBudget(): ResidentBudget {
  const ceilings = {
    planRevisions: 3,
    observationRecords: 16,
    toolSteps: 12,
    providerInvocations: 3,
    providerRequestBytes: 1048576,
    providerResponseBytes: 1048576,
    contextBytes: 1048576,
    derivativeArtifactBytes: 16777216,
    activeExecutionMs: 900000,
    approvalSuspensionMs: 86400000
  };
  const zeroes = {
    planRevisions: 0,
    observationRecords: 0,
    toolSteps: 0,
    providerInvocations: 0,
    providerRequestBytes: 0,
    providerResponseBytes: 0,
    contextBytes: 0,
    derivativeArtifactBytes: 0,
    activeExecutionMs: 0,
    approvalSuspensionMs: 0
  };
  return {
    ceilings,
    consumed: { ...zeroes, contextBytes: 1 },
    remaining: { ...ceilings, contextBytes: ceilings.contextBytes - 1 },
    actionConsumption: { ...zeroes, contextBytes: 1 }
  };
}

async function residentFactoryFixtures(): Promise<readonly ResidentFactoryFixture[]> {
  const workspaceId = "ws_dispatcher_catalog";
  const residentAgentId = "agent_default";
  const taskId = "task_dispatcher_catalog";
  const providerLedger = new InMemoryEventLedger();
  const prrLedger = new InMemoryEventLedger();
  const acceptedGraphLedger = new InMemoryEventLedger();
  const exportLedger = new SeededLedger(goldenGovernanceLedgerEvents);
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
  const { initialContext, followUpContext } =
    await prepareDispatcherPrrContexts(prrLedger, residentAgentId, taskId);
  const acceptedGraphContext =
    await prepareDispatcherAcceptedGraphContext(
      acceptedGraphLedger,
      residentAgentId,
      taskId
    );
  const { exportContext, reportContext } =
    prepareDispatcherGovernanceContexts(
      exportLedger,
      residentAgentId,
      taskId
    );
  const repairAction = {
    actionId: "action_dispatcher_projection",
    kind: "rebuild-projection",
    title: "Rebuild the expendable dispatcher fixture projection.",
    severity: "warning",
    requiresHumanApproval: true,
    mutatesCanonicalState: false,
    allowedNextCommands: ["projection rebuild-readiness", "projection rebuild"]
  };
  const projectionFileSystem = new DispatcherProjectionFileSystem(
    "/workspace/dispatcher-fixture",
    workspaceId
  );
  const projectionLayout = await resolveWorkspaceLayout({
    rootPath: "/workspace/dispatcher-fixture",
    expectedWorkspaceId: workspaceId
  }, projectionFileSystem);
  const projectionContext = {
    ledger: destructiveLedger,
    domainActor: humanActor,
    residentAgentId,
    taskId,
    toolId: "workspace.projection-rebuild.execute",
    layout: projectionLayout,
    workspaceFileSystem: projectionFileSystem,
    projectionFileSystem,
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
  let legacyApproval: KnowledgeEvent | undefined;
  let legacyProposal: KnowledgeEvent | undefined;
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
        legacyApproval ??= await legacyLedger.append({
          type: "legacy.ontology.staging.approved",
          version: 1,
          streamId:
            "legacy_staging_src_dispatcher_legacy_scan_dispatcher_legacy_legacy_stage_dispatcher_legacy",
          context: {
            actor: humanActor,
            occurredAt: fixedNow(),
            correlationId: "corr_dispatcher_legacy_approval",
            coreVersion: "0.1.0",
            packVersions: { core: "0.1.0", ingestion: "0.1.0" }
          },
          payload: {
            stagingBatchId: "legacy_stage_dispatcher_legacy",
            legacyReportId: "legacy_report_dispatcher",
            sourceCollectionId: "src_dispatcher_legacy",
            scanBatchId: "scan_dispatcher_legacy",
            reportHash: hash("d"),
            candidateSetHash: hash("e"),
            approvedBy: humanActor.id,
            approvedAt: fixedNow(),
            approvedAssertionCandidateIds: ["legacy_candidate_dispatcher"]
          }
        });
        return {
          ok: true as const,
          command: "legacy approve-staging",
          sourceCollectionId: "src_dispatcher_legacy",
          scanBatchId: "scan_dispatcher_legacy",
          eventIds: [legacyApproval.id],
          nextActions: [],
          legacyReportId: "legacy_report_dispatcher",
          stagingBatchId: "legacy_stage_dispatcher_legacy",
          reportHash: hash("d"),
          candidateSetHash: hash("e"),
          approvedAssertionCandidateIds: ["legacy_candidate_dispatcher"]
        };
      },
      async stageApproved() {
        legacyProposal ??= await legacyLedger.append({
          type: "assertion.proposed",
          version: 1,
          streamId: "assertion_as_dispatcher_legacy",
          context: {
            actor: schedulerActor,
            occurredAt: fixedNow(),
            correlationId: "corr_dispatcher_legacy_proposal",
            coreVersion: "0.1.0",
            packVersions: { core: "0.1.0", ingestion: "0.1.0" }
          },
          payload: {
            assertionId: "as_dispatcher_legacy",
            evidenceId: "ev_dispatcher_legacy",
            predicate: "legacy.dispatcher.fixture",
            object: "legacy_candidate_dispatcher",
            confidence: 0.8,
            reviewState: "proposed"
          }
        });
        return {
          ok: true as const,
          command: "legacy stage",
          sourceCollectionId: "src_dispatcher_legacy",
          scanBatchId: "scan_dispatcher_legacy",
          eventIds: [legacyProposal.id],
          nextActions: [],
          legacyReportId: "legacy_report_dispatcher",
          stagingBatchId: "legacy_stage_dispatcher_legacy",
          proposedAssertionIds: ["as_dispatcher_legacy"]
        };
      }
    },
    ledger: legacyLedger,
    residentAgentId,
    sourceCollectionId: "src_dispatcher_legacy",
    scanBatchId: "scan_dispatcher_legacy",
    stagingBatchId: "legacy_stage_dispatcher_legacy",
    legacyReportId: "legacy_report_dispatcher",
    reportHash: hash("d"),
    candidateSetHash: hash("e"),
    selectedCandidateIds: ["legacy_candidate_dispatcher"]
  };
  for (const [label, ledger] of [
    ["destructive", destructiveLedger],
    ["legacy", legacyLedger]
  ] as const) {
    if ((await ledger.readAll()).length === 0) {
      await ledger.append({
        type: "evidence.ingested",
        version: 1,
        streamId: `evidence_ev_dispatcher_${label}_source`,
        context: {
          actor: schedulerActor,
          occurredAt: fixedNow(),
          correlationId: `corr_dispatcher_${label}_source`,
          coreVersion: "0.1.0",
          packVersions: { core: "0.1.0" }
        },
        payload: {
          evidenceId: `ev_dispatcher_${label}_source`,
          source: { kind: "file", label: `${label}-source.txt` },
          contentHash: label === "destructive" ? hash("b") : hash("c"),
          mediaType: "text/plain",
          sizeBytes: 1
        }
      });
    }
  }

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
      initialContext,
      followUpContext
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
      exportContext,
      reportContext
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
    ledger: EventLedger,
    binding: Record<string, unknown>
  ): ResidentFactoryFixture {
    return { kind, ordinals, ledger, binding, workspaceId, residentAgentId, taskId };
  }
}

function requiredBindingContext(
  fixture: ResidentFactoryFixture,
  key: string
): Record<string, unknown> {
  const value = Reflect.get(fixture.binding, key);
  if (typeof value !== "object" || value === null) {
    throw new Error(`Resident fixture ${fixture.kind} is missing ${key}.`);
  }
  return value as Record<string, unknown>;
}

async function prepareDispatcherPrrContexts(
  ledger: InMemoryEventLedger,
  residentAgentId: string,
  taskId: string
): Promise<{
  readonly initialContext: PrrCorrespondenceAdapterContext;
  readonly followUpContext: PrrCorrespondenceAdapterContext;
}> {
  const lifecycle = new PrrLifecycleService({ ledger, actor: humanActor });
  const transport = new DispatcherCorrespondenceAdapter();
  const service = new PrrCorrespondenceService({
    ledger,
    actor: humanActor,
    adapters: { gmail: transport }
  });
  const initialCreated = await lifecycle.createRequest({
    prrRequestId: "prr_dispatcher_initial",
    jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
    agency: { name: "Initial Agency", email: "records@example.gov" },
    requester: { name: "Investigator", email: "investigator@example.org" },
    requestText: "Provide the initial dispatcher fixture records."
  });
  const followCreated = await lifecycle.createRequest({
    prrRequestId: "prr_dispatcher_followup",
    jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
    agency: { name: "Follow-up Agency", email: "records@example.gov" },
    requester: { name: "Investigator", email: "investigator@example.org" },
    requestText: "Provide the follow-up dispatcher fixture records."
  });
  const followInitial = await service.sendInitialRequest({
    prrRequestId: "prr_dispatcher_followup",
    correspondenceId: "corr_dispatcher_followup_initial",
    provider: "gmail",
    from: "investigator@example.org",
    to: ["records@example.gov"],
    subject: "Dispatcher fixture request",
    body: "Provide the follow-up dispatcher fixture records.",
    approvedBy: humanActor.id
  });
  const followSubject = "Follow-up on dispatcher fixture request";
  const followBody = "Please provide a status update for the dispatcher fixture records.";
  const followDraft = await ledger.append({
    type: "prr.followup.drafted",
    version: 1,
    streamId: "prr_dispatcher_followup",
    context: {
      actor: humanActor,
      occurredAt: fixedNow(),
      causationId: followInitial.id,
      correlationId: followInitial.context.correlationId,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0" }
    },
    payload: {
      prrRequestId: "prr_dispatcher_followup",
      correspondenceId: "corr_dispatcher_followup",
      subject: followSubject,
      bodyHash: hashText(followBody),
      citedRules: []
    }
  });
  const capabilities: AdapterCapabilities = {
    provider: "gmail",
    canSend: true,
    canSync: true,
    canFetchAttachments: true,
    credentialMode: "cestus-oauth"
  };
  return {
    initialContext: contextFor({
      toolId: "prr.initial-send.execute",
      prrRequestId: "prr_dispatcher_initial",
      correspondenceId: "corr_dispatcher_initial",
      sourceEventId: initialCreated.id,
      requestCreatedEventId: initialCreated.id,
      status: "draft",
      subject: "Dispatcher fixture request",
      body: "Provide the initial dispatcher fixture records.",
      providerIdempotencyKey:
        "send_prr_dispatcher_initial_corr_dispatcher_initial"
    }),
    followUpContext: contextFor({
      toolId: "prr.follow-up.execute",
      prrRequestId: "prr_dispatcher_followup",
      correspondenceId: "corr_dispatcher_followup",
      sourceEventId: followDraft.id,
      requestCreatedEventId: followCreated.id,
      status: "sent",
      initialSentEventId: followInitial.id,
      subject: followSubject,
      body: followBody,
      providerIdempotencyKey:
        "followup_prr_dispatcher_followup_corr_dispatcher_followup"
    })
  };

  function contextFor(input: {
    readonly toolId: "prr.initial-send.execute" | "prr.follow-up.execute";
    readonly prrRequestId: string;
    readonly correspondenceId: string;
    readonly sourceEventId: string;
    readonly requestCreatedEventId: string;
    readonly status: "draft" | "sent";
    readonly initialSentEventId?: string;
    readonly subject: string;
    readonly body: string;
    readonly providerIdempotencyKey: string;
  }): PrrCorrespondenceAdapterContext {
    const message: PrrCorrespondenceCurrentMessage = {
      from: "investigator@example.org",
      to: ["records@example.gov"],
      cc: [],
      subject: input.subject,
      body: input.body,
      renderedBody: input.body,
      attachments: [],
      requiresLegalConfirmation: false
    };
    return {
      ledger,
      correspondenceService: service,
      domainActor: humanActor,
      residentAgentId,
      taskId,
      toolId: input.toolId,
      prrRequestId: input.prrRequestId,
      correspondenceId: input.correspondenceId,
      provider: "gmail",
      messageSourceEventId: input.sourceEventId,
      approvedMessage: {
        from: message.from,
        to: [...message.to],
        cc: [...message.cc],
        subject: message.subject,
        subjectHash: hashText(message.subject),
        bodyHash: hashText(message.body),
        renderedBodyHash: hashText(message.renderedBody),
        attachments: [],
        requiresLegalConfirmation: false,
        providerIdempotencyKey: input.providerIdempotencyKey
      },
      approvedRequestState: {
        requestCreatedEventId: input.requestCreatedEventId,
        status: input.status,
        jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
        confirmedStalling: false,
        ...(input.initialSentEventId === undefined
          ? {}
          : { initialSentEventId: input.initialSentEventId })
      },
      approvedProviderCapabilities: capabilities,
      readCurrentMessage: async () => message,
      readProviderCapabilities: async () => capabilities
    };
  }
}

async function prepareDispatcherAcceptedGraphContext(
  ledger: InMemoryEventLedger,
  residentAgentId: string,
  taskId: string
): Promise<Record<string, unknown>> {
  const service = new AssertionService({ ledger });
  const evidence = await ledger.append({
    type: "evidence.ingested",
    version: 1,
    streamId: "evidence_ev_dispatcher_assertion",
    context: {
      actor: schedulerActor,
      occurredAt: fixedNow(),
      correlationId: "corr_dispatcher_assertion",
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0" }
    },
    payload: {
      evidenceId: "ev_dispatcher_assertion",
      source: { kind: "file", label: "dispatcher-assertion.pdf" },
      contentHash: hash("8"),
      mediaType: "application/pdf",
      sizeBytes: 128
    }
  });
  const proposal = await service.propose({
    assertionId: "as_dispatcher_fixture",
    evidenceId: "ev_dispatcher_assertion",
    subjectRef: "ent_dispatcher_agency",
    predicate: "agency.name",
    object: "Dispatcher Fixture Agency",
    confidence: 0.95,
    actor: schedulerActor
  });
  return {
    ledger,
    assertionService: service,
    reviewer: humanActor,
    residentAgentId,
    taskId,
    assertionId: "as_dispatcher_fixture",
    proposalEventId: proposal.id,
    evidenceId: "ev_dispatcher_assertion",
    evidenceEventId: evidence.id,
    evidenceContentHash: hash("8"),
    reviewerRationaleDraft: "The fixture binds one reviewed assertion.",
    ontologyPackVersions: { core: "0.1.0" }
  };
}

function prepareDispatcherGovernanceContexts(
  ledger: SeededLedger,
  residentAgentId: string,
  taskId: string
): {
  readonly exportContext: Record<string, unknown>;
  readonly reportContext: Record<string, unknown>;
} {
  const governanceService = new GovernanceService({ ledger, actor: humanActor });
  const common = {
    ledger,
    governanceService,
    actor: humanActor,
    residentAgentId,
    taskId,
    requestedEvidenceIds: ["ev_source_public"],
    includedEvidenceIds: ["ev_source_public"],
    includedContentHashes: [hash("1")],
    sensitiveOptIns: [],
    defaultPublicSafeOnly: true,
    policy: { policyId: "gov_policy_default", version: "0.2.0" },
    causationEventId: "evt_review_governance_public"
  };
  return {
    exportContext: {
      ...common,
      toolId: "governance.export.generate",
      artifactKind: "export",
      artifactId: "exp_dispatcher_fixture",
      outputArtifactHash: hash("9")
    },
    reportContext: {
      ...common,
      toolId: "governance.report.generate",
      artifactKind: "report",
      artifactId: "report_dispatcher_fixture",
      outputArtifactHash: hash("a")
    }
  };
}

class DispatcherCorrespondenceAdapter implements CorrespondenceAdapter {
  private readonly sentByIdempotency = new Map<string, SentMessageResult>();

  async capabilities(): Promise<AdapterCapabilities> {
    return {
      provider: "gmail",
      canSend: true,
      canSync: true,
      canFetchAttachments: true,
      credentialMode: "cestus-oauth"
    };
  }

  async sendApprovedMessage(input: ApprovedMessageInput): Promise<SentMessageResult> {
    const existing = this.sentByIdempotency.get(input.idempotencyKey);
    if (existing !== undefined) return existing;
    const digest = createHash("sha256").update(input.idempotencyKey).digest("hex");
    const result: SentMessageResult = {
      provider: "gmail",
      providerMessageId: `msg_${digest.slice(0, 24)}`,
      providerThreadId: `thread_${digest.slice(0, 24)}`,
      sentAt: fixedNow(),
      rawMetadata: { transport: "dispatcher-fixture" }
    };
    this.sentByIdempotency.set(input.idempotencyKey, result);
    return result;
  }

  async syncSince(): Promise<SyncResult> {
    return { checkpoint: "dispatcher-fixture", messages: [] };
  }
}

class SeededLedger implements EventLedger {
  private readonly appended = new InMemoryEventLedger();
  private readonly seeded: KnowledgeEvent[];

  constructor(events: readonly KnowledgeEvent[]) {
    this.seeded = structuredClone([...events]);
  }

  append(
    event: AppendableKnowledgeEvent,
    options?: AppendOptions
  ): Promise<KnowledgeEvent> {
    return this.appended.append(event, options);
  }

  async readStream(streamId: string): Promise<KnowledgeEvent[]> {
    return [
      ...structuredClone(this.seeded.filter((event) => event.streamId === streamId)),
      ...await this.appended.readStream(streamId)
    ];
  }

  async readAll(): Promise<KnowledgeEvent[]> {
    return [...structuredClone(this.seeded), ...await this.appended.readAll()];
  }
}

class DispatcherProjectionFileSystem {
  private readonly files = new Map<string, string>();
  private readonly directories = new Set<string>();

  constructor(rootPath: string, workspaceId: string) {
    this.directories.add(rootPath);
    this.files.set(`${rootPath}/cestus-workspace.json`, JSON.stringify({
      version: 1,
      layoutVersion: 1,
      workspaceId,
      label: "Dispatcher fixture workspace",
      createdAt: fixedNow(),
      createdBy: "dispatcher-fixture",
      coreVersion: "0.1.0"
    }));
    this.directories.add(`${rootPath}/ledger`);
    this.files.set(`${rootPath}/ledger/ontology.sqlite`, "sqlite");
    for (const directory of [
      "blobs",
      "derivatives",
      "jobs",
      "projections",
      "cache",
      "config"
    ]) {
      this.directories.add(`${rootPath}/${directory}`);
    }
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.directories.has(path);
  }

  async readText(path: string): Promise<string> {
    const value = this.files.get(path);
    if (value === undefined) throw new Error("Missing dispatcher fixture file.");
    return value;
  }

  async stat(path: string): Promise<WorkspaceStats> {
    if (this.directories.has(path)) return { kind: "directory", sizeBytes: 0 };
    const value = this.files.get(path);
    if (value !== undefined) {
      return { kind: "file", sizeBytes: Buffer.byteLength(value) };
    }
    throw new Error("Missing dispatcher fixture path.");
  }

  async lstat(path: string): Promise<WorkspaceStats> {
    return this.stat(path);
  }

  async list(): Promise<readonly string[]> {
    return [];
  }

  async realpath(path: string): Promise<string> {
    return path;
  }

  async availableBytes(): Promise<number> {
    return 1_000_000;
  }

  async writeText(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  async remove(path: string): Promise<void> {
    this.files.delete(path);
    this.directories.delete(path);
  }

  async promoteDirectory(from: string, to: string): Promise<void> {
    this.directories.add(to);
    for (const [path, content] of [...this.files.entries()]) {
      if (path.startsWith(`${from}/`)) {
        this.files.set(`${to}${path.slice(from.length)}`, content);
      }
    }
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

function hashText(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
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
