import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";
import type { ActorRef } from "../../ontology/src/contracts.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";
import {
  createProviderByteTransferAdapter,
  createProviderParseExecutionAdapter,
  providerByteTransferDescriptor,
  providerParseExecuteDescriptor
} from "./adapters/provider-byte-transfer.js";
import {
  createPrrInitialSendExecutionAdapter,
  createPrrFollowUpExecutionAdapter,
  prrInitialSendExecuteDescriptor,
  prrFollowUpExecuteDescriptor
} from "./adapters/prr-correspondence.js";
import {
  createAcceptedGraphAssertionReviewAdapter,
  acceptedGraphAssertionReviewDescriptor
} from "./adapters/accepted-graph-review.js";
import {
  createExportGenerationAdapter,
  createReportGenerationAdapter,
  exportGenerateDescriptor,
  reportGenerateDescriptor
} from "./adapters/export-report.js";
import {
  createWorkspaceProjectionRebuildAdapter,
  createBlockedCanonicalRepairAdapter,
  workspaceProjectionRebuildDescriptor,
  workspaceCanonicalRepairDescriptor
} from "./adapters/destructive-repair.js";
import {
  createLegacyStagingApprovalAdapter,
  createLegacyStagingExecutionAdapter,
  legacyStagingApproveDescriptor,
  legacyStagingExecuteDescriptor
} from "./adapters/legacy-staging.js";
import gatewayDefault from "./resident-loop-tool-gateway.js";
import {
  createAgentDomainToolRegistry,
  type AgentDomainExecutionFailure,
  type AgentDomainExecutionResult,
  type AgentDomainToolDescriptor
} from "./domain-execution-descriptors.js";
import { createAgentScheduler } from "./scheduler.js";
import {
  agentApprovedToolExecutionFailure,
  type AgentApprovedToolExecutionFailure,
  type AgentApprovedToolExecutionInput,
  type AgentApprovedToolExecutorDescriptor,
  type AgentApprovedToolPreviewInput,
  type AgentApprovedToolPreviewResult,
  type AgentSchedulerWakeResultDto
} from "./scheduler-types.js";

export interface AgentDomainExecutionAdapter {
  readonly descriptor: AgentDomainToolDescriptor;
  buildCurrentPreview(
    input: AgentApprovedToolPreviewInput
  ): AgentApprovedToolPreviewResult | Promise<AgentApprovedToolPreviewResult>;
  executeApproved(
    input: AgentApprovedToolExecutionInput
  ): AgentDomainExecutionResult | Promise<AgentDomainExecutionResult>;
}

export interface CreateAgentDomainExecutionDispatcherInput {
  readonly ledger: EventLedger;
  readonly actor: ActorRef;
  readonly now: () => string;
  readonly adapters: readonly AgentDomainExecutionAdapter[];
}

export interface AgentDomainExecutionDispatcher {
  wake(): Promise<AgentSchedulerWakeResultDto>;
  resumeApprovedDomainTools(): Promise<AgentSchedulerWakeResultDto>;
}

export function toAgentApprovedToolExecutorDescriptor(
  adapter: AgentDomainExecutionAdapter
): AgentApprovedToolExecutorDescriptor {
  const descriptor = validatedDomainDescriptor(adapter.descriptor);
  return Object.freeze({
    toolId: descriptor.toolId,
    toolVersion: descriptor.toolVersion,
    sideEffectClass: descriptor.sideEffectClass,
    approvalClass: descriptor.requiredApprovalClass,
    buildCurrentPreview(input: AgentApprovedToolPreviewInput) {
      return adapter.buildCurrentPreview(input);
    },
    executeApproved(input: AgentApprovedToolExecutionInput) {
      return adapter.executeApproved(input);
    }
  });
}

export function createAgentDomainExecutionDispatcher(
  input: CreateAgentDomainExecutionDispatcherInput
): AgentDomainExecutionDispatcher {
  createAgentDomainToolRegistry(input.adapters.map((adapter) => adapter.descriptor));
  const scheduler = createAgentScheduler({
    ledger: input.ledger,
    actor: input.actor,
    now: input.now,
    descriptors: input.adapters.map(toAgentApprovedToolExecutorDescriptor)
  });

  return Object.freeze({
    wake() {
      return scheduler.wake();
    },
    resumeApprovedDomainTools() {
      return scheduler.wake();
    }
  });
}

export function agentDomainExecutionFailure(
  input: AgentDomainExecutionFailure
): AgentApprovedToolExecutionFailure {
  return agentApprovedToolExecutionFailure(input);
}

function validatedDomainDescriptor(descriptor: AgentDomainToolDescriptor): AgentDomainToolDescriptor {
  const registry = createAgentDomainToolRegistry([descriptor]);
  return registry.require(descriptor.toolId, descriptor.toolVersion);
}

type ResidentFactoryKind =
  | "provider-byte-transfer"
  | "prr-correspondence"
  | "accepted-graph-review"
  | "export-report"
  | "destructive-repair"
  | "legacy-staging";

interface ResidentCatalogEntry {
  readonly ordinal: number;
  readonly kind: ResidentFactoryKind;
  readonly implementationRevision: string;
  readonly descriptor: AgentDomainToolDescriptor;
  readonly adapter: AgentDomainExecutionAdapter;
}

interface ResidentCapabilityState {
  readonly workspaceId: string;
  readonly residentAgentId: string;
  readonly taskId: string;
  readonly ledger: EventLedger;
  readonly capabilityHash: `sha256:${string}`;
  readonly entries: readonly ResidentCatalogEntry[];
}

interface ResidentPortCommand {
  readonly phase: "binding" | "preview";
  readonly toolId?: string;
  readonly toolVersion?: string;
  readonly logicalLocator?: Readonly<Record<string, unknown>>;
}

interface ResidentInvocation {
  readonly authorizationKind: "automatic-policy" | "human-approval";
  readonly logicalLocator: Readonly<Record<string, unknown>>;
  readonly requestEventId: string;
  readonly executionClaimEventId: string;
  readonly authorization: Readonly<Record<string, unknown>>;
  readonly previewHash: string;
  readonly approvedPreviewHash?: string;
  readonly approvedBy?: string;
  readonly currentPreview: AgentApprovedToolPreviewResult;
}

interface ResidentPermitBinding {
  readonly port: object;
  readonly input: object;
  readonly catalogOrdinal: number;
  issueResidentDomainInvocationAttestation(attestation: object): object;
}

const packageResidentCapabilities = new WeakMap<object, ResidentCapabilityState>();

async function createPackageOwnedResidentDomainExecutionCapability(input: unknown): Promise<object> {
  const binding = residentDataRecord(input, "resident package capability binding");
  const kind = residentString(binding.kind, "resident package capability kind") as ResidentFactoryKind;
  const workspaceId = residentString(binding.workspaceId, "resident workspace ID");
  const residentAgentId = residentString(binding.residentAgentId, "resident agent ID");
  const taskId = residentString(binding.taskId, "resident task ID");

  const catalog = [
    {
      ordinal: 0,
      kind: "provider-byte-transfer",
      constructor: createProviderByteTransferAdapter,
      descriptor: providerByteTransferDescriptor,
      implementationRevision: "provider-byte-transfer.adapter.v1"
    },
    {
      ordinal: 1,
      kind: "provider-byte-transfer",
      constructor: createProviderParseExecutionAdapter,
      descriptor: providerParseExecuteDescriptor,
      implementationRevision: "provider-parse-execution.adapter.v1"
    },
    {
      ordinal: 2,
      kind: "prr-correspondence",
      constructor: createPrrInitialSendExecutionAdapter,
      descriptor: prrInitialSendExecuteDescriptor,
      implementationRevision: "prr-initial-send-execution.adapter.v1"
    },
    {
      ordinal: 3,
      kind: "prr-correspondence",
      constructor: createPrrFollowUpExecutionAdapter,
      descriptor: prrFollowUpExecuteDescriptor,
      implementationRevision: "prr-follow-up-execution.adapter.v1"
    },
    {
      ordinal: 4,
      kind: "accepted-graph-review",
      constructor: createAcceptedGraphAssertionReviewAdapter,
      descriptor: acceptedGraphAssertionReviewDescriptor,
      implementationRevision: "accepted-graph-assertion-review.adapter.v1"
    },
    {
      ordinal: 5,
      kind: "export-report",
      constructor: createExportGenerationAdapter,
      descriptor: exportGenerateDescriptor,
      implementationRevision: "export-generation.adapter.v1"
    },
    {
      ordinal: 6,
      kind: "export-report",
      constructor: createReportGenerationAdapter,
      descriptor: reportGenerateDescriptor,
      implementationRevision: "report-generation.adapter.v1"
    },
    {
      ordinal: 7,
      kind: "destructive-repair",
      constructor: createWorkspaceProjectionRebuildAdapter,
      descriptor: workspaceProjectionRebuildDescriptor,
      implementationRevision: "workspace-projection-rebuild.adapter.v1"
    },
    {
      ordinal: 8,
      kind: "destructive-repair",
      constructor: createBlockedCanonicalRepairAdapter,
      descriptor: workspaceCanonicalRepairDescriptor,
      implementationRevision: "blocked-canonical-repair.adapter.v1"
    },
    {
      ordinal: 9,
      kind: "legacy-staging",
      constructor: createLegacyStagingApprovalAdapter,
      descriptor: legacyStagingApproveDescriptor,
      implementationRevision: "legacy-staging-approval.adapter.v1"
    },
    {
      ordinal: 10,
      kind: "legacy-staging",
      constructor: createLegacyStagingExecutionAdapter,
      descriptor: legacyStagingExecuteDescriptor,
      implementationRevision: "legacy-staging-execution.adapter.v1"
    }
  ] as const;
  const allowedKeysByKind: Record<ResidentFactoryKind, readonly string[]> = {
    "provider-byte-transfer": ["kind", "workspaceId", "residentAgentId", "taskId", "context"],
    "prr-correspondence": ["kind", "workspaceId", "residentAgentId", "taskId", "initialContext", "followUpContext"],
    "accepted-graph-review": ["kind", "workspaceId", "residentAgentId", "taskId", "context"],
    "export-report": ["kind", "workspaceId", "residentAgentId", "taskId", "exportContext", "reportContext"],
    "destructive-repair": ["kind", "workspaceId", "residentAgentId", "taskId", "projectionContext", "canonicalRepairContext"],
    "legacy-staging": ["kind", "workspaceId", "residentAgentId", "taskId", "context"]
  };
  const allowedKeys = allowedKeysByKind[kind];
  if (allowedKeys === undefined) {
    throw new Error("Resident package capability kind is unsupported.");
  }
  rejectResidentUnknown(binding, allowedKeys, "resident package capability binding");

  const contexts = residentContextsForKind(binding, kind);
  const ledger = requireResidentContextLedger(
    contexts,
    workspaceId,
    residentAgentId,
    taskId
  );
  const selectedCatalog = catalog.filter((entry) => entry.kind === kind);
  const adapters = selectedCatalog.map((entry, index) => {
    const context = contexts.length === 1 ? contexts[0] : contexts[index];
    if (context === undefined) {
      throw new Error("Resident package capability context binding is incomplete.");
    }
    const contextToolId = Reflect.get(context, "toolId");
    if (contextToolId !== undefined && contextToolId !== entry.descriptor.toolId) {
      throw new Error("Resident package capability context is cross-used for another tool.");
    }
    return entry.constructor(context as never);
  });
  createAgentDomainToolRegistry(catalog.map((entry) => entry.descriptor));
  const capabilityHash = residentHash({
    abiVersion: "resident-domain-execution-dispatcher.v1",
    entries: catalog.map((entry) => ({
      ordinal: entry.ordinal,
      descriptor: entry.descriptor,
      implementationRevision: entry.implementationRevision
    }))
  });
  const entries = Object.freeze(selectedCatalog.map((entry, index) => Object.freeze({
    ordinal: entry.ordinal,
    kind: entry.kind,
    implementationRevision: entry.implementationRevision,
    descriptor: entry.descriptor,
    adapter: adapters[index]!
  })));
  const capability = Object.freeze({});
  packageResidentCapabilities.set(capability, Object.freeze({
    workspaceId,
    residentAgentId,
    taskId,
    ledger,
    capabilityHash,
    entries
  }));
  return capability;
}

function bindPackageOwnedResidentDomainExecutionPort(input: unknown): object {
  const binding = residentDataRecord(input, "resident package execution port binding");
  rejectResidentUnknown(
    binding,
    ["capability", "mountedLedger", "workspaceId", "residentAgentId", "taskId"],
    "resident package execution port binding"
  );
  const capability = residentObject(binding.capability, "resident package capability");
  const state = packageResidentCapabilities.get(capability);
  if (state === undefined) {
    throw new Error("Resident package capability authority was not issued by this module instance.");
  }
  if (
    binding.mountedLedger !== state.ledger ||
    residentString(binding.workspaceId, "resident workspace ID") !== state.workspaceId ||
    residentString(binding.residentAgentId, "resident agent ID") !== state.residentAgentId ||
    residentString(binding.taskId, "resident task ID") !== state.taskId
  ) {
    throw new Error("Resident package execution port binding does not match capability ledger or identity.");
  }

  const residentDomainExecutionPort = Object.freeze({
    async prepareResidentDomainExecution(command: ResidentPortCommand) {
      const copied = residentDataRecord(command, "resident execution port command");
      const phase = residentString(copied.phase, "resident execution port phase");
      if (phase === "binding") {
        rejectResidentUnknown(copied, ["phase", "toolId", "toolVersion"], "resident binding command");
        const entry = requireResidentCatalogEntry(
          state,
          residentString(copied.toolId, "resident tool ID"),
          residentString(copied.toolVersion, "resident tool version")
        );
        return Object.freeze({
          catalogOrdinal: entry.ordinal,
          executionCapabilityHash: state.capabilityHash,
          descriptor: entry.descriptor
        });
      }
      if (phase !== "preview") {
        throw new Error("Resident execution port phase is unsupported.");
      }
      rejectResidentUnknown(copied, ["phase", "logicalLocator"], "resident preview command");
      const locator = requireResidentLocator(copied.logicalLocator, state);
      const entry = requireResidentCatalogEntry(
        state,
        residentString(locator.toolId, "resident tool ID"),
        residentString(locator.toolVersion, "resident tool version")
      );
      const currentPreview = await entry.adapter.buildCurrentPreview({
        toolRequestId: residentString(locator.toolRequestId, "resident tool request ID"),
        toolId: entry.descriptor.toolId,
        toolVersion: entry.descriptor.toolVersion,
        runId: residentString(locator.runId, "resident run ID"),
        taskId: state.taskId,
        requestedPreviewHash: residentHash(locator)
      });
      return Object.freeze({
        catalogOrdinal: entry.ordinal,
        executionCapabilityHash: state.capabilityHash,
        implementationRevision: entry.implementationRevision,
        descriptor: entry.descriptor,
        currentPreview
      });
    },
    async invokeAndAttest(
      permit: unknown,
      canonicalResidentInvocationInput: unknown
    ) {
      const permitBinding = gatewayDefault.consumeResidentDomainExecutionPermit(
        permit,
        residentDomainExecutionPort,
        canonicalResidentInvocationInput
      ) as ResidentPermitBinding;
      if (
        permitBinding.port !== residentDomainExecutionPort ||
        permitBinding.input !== canonicalResidentInvocationInput
      ) {
        throw new Error("Resident execution permit binding does not match this port and invocation.");
      }
      const invocation = canonicalResidentInvocationInput as ResidentInvocation;
      const locator = requireResidentLocator(invocation.logicalLocator, state);
      const entry = requireResidentCatalogEntry(
        state,
        residentString(locator.toolId, "resident tool ID"),
        residentString(locator.toolVersion, "resident tool version")
      );
      if (permitBinding.catalogOrdinal !== entry.ordinal) {
        throw new Error("Resident execution permit catalog ordinal does not match the selected tool.");
      }
      const authorization = residentDataRecord(
        invocation.authorization,
        "resident invocation authorization"
      );
      const automatic = invocation.authorizationKind === "automatic-policy";
      const expectedInvocationKeys = automatic
        ? [
            "authorizationKind",
            "logicalLocator",
            "requestEventId",
            "executionClaimEventId",
            "authorization",
            "previewHash",
            "currentPreview"
          ]
        : [
            "authorizationKind",
            "logicalLocator",
            "requestEventId",
            "executionClaimEventId",
            "authorization",
            "previewHash",
            "approvedPreviewHash",
            "approvedBy",
            "currentPreview"
          ];
      const invocationRecord = residentDataRecord(
        canonicalResidentInvocationInput,
        "canonical resident invocation input"
      );
      rejectResidentUnknown(
        invocationRecord,
        expectedInvocationKeys,
        "canonical resident invocation input"
      );
      if (
        Object.keys(invocationRecord).length !== expectedInvocationKeys.length ||
        invocation.authorizationKind !== authorization.authorizationKind
      ) {
        throw new Error("Canonical resident invocation input does not match its authorization branch.");
      }
      if (automatic !== (entry.ordinal === 10)) {
        throw new Error("Resident execution authorization does not match the catalog approval boundary.");
      }
      if (
        automatic
          ? Object.keys(authorization).length !== 1
          : (
              Object.keys(authorization).length !== 4 ||
              invocation.approvedBy !== authorization.approvedBy ||
              invocation.approvedPreviewHash !== authorization.approvedPreviewHash
            )
      ) {
        throw new Error("Resident execution authorization does not contain the exact durable approval tuple.");
      }
      const adapterPreview = await normalizeResidentIdempotentPreview(
        entry,
        invocation.currentPreview,
        state.ledger
      );
      const adapterPreviewHash =
        entry.ordinal === 4 &&
        Reflect.get(invocation.currentPreview.preview, "currentReviewState") === "accepted"
          ? residentHash(adapterPreview.preview)
          : residentString(invocation.previewHash, "resident preview hash");
      const approvedPreviewHash = automatic
        ? adapterPreviewHash
        : residentString(
            entry.ordinal === 4 ? adapterPreviewHash : invocation.approvedPreviewHash,
            "resident approved preview hash"
          );
      const approvedBy = automatic
        ? "resident-automatic-policy"
        : residentString(invocation.approvedBy, "resident approver");
      const beforeEvents = await state.ledger.readAll();
      const result = await entry.adapter.executeApproved({
        toolRequestId: residentString(locator.toolRequestId, "resident tool request ID"),
        toolId: entry.descriptor.toolId,
        toolVersion: entry.descriptor.toolVersion,
        runId: residentString(locator.runId, "resident run ID"),
        taskId: state.taskId,
        sideEffectClass: entry.descriptor.sideEffectClass,
        approvalClass: entry.descriptor.requiredApprovalClass,
        previewHash: approvedPreviewHash,
        approvedPreviewHash,
        approvedBy,
        sourceEventIds: adapterPreview.sourceEventIds,
        inputArtifactHashes: adapterPreview.inputArtifactHashes,
        provenanceRefs: adapterPreview.provenanceRefs
      });
      const afterEvents = await state.ledger.readAll();
      const attestation = attestResidentDomainResult(
        entry,
        invocation,
        result,
        beforeEvents,
        afterEvents
      );
      return permitBinding.issueResidentDomainInvocationAttestation(attestation);
    }
  });
  return residentDomainExecutionPort;
}

function residentContextsForKind(
  binding: Record<string, unknown>,
  kind: ResidentFactoryKind
): readonly Record<string, unknown>[] {
  const keys = kind === "prr-correspondence"
    ? ["initialContext", "followUpContext"]
    : kind === "export-report"
      ? ["exportContext", "reportContext"]
      : kind === "destructive-repair"
        ? ["projectionContext", "canonicalRepairContext"]
        : ["context"];
  const contexts = keys.map((key) =>
    residentPlainObject(binding[key], `resident ${key}`)
  );
  if (contexts.length === 2 && contexts[0] === contexts[1]) {
    throw new Error("Resident paired contexts must remain distinct.");
  }
  return contexts;
}

function requireResidentContextLedger(
  contexts: readonly Record<string, unknown>[],
  workspaceId: string,
  residentAgentId: string,
  taskId: string
): EventLedger {
  let ledger: unknown;
  for (const context of contexts) {
    const currentLedger = Reflect.get(context, "ledger");
    if (
      currentLedger === null ||
      typeof currentLedger !== "object" ||
      typeof Reflect.get(currentLedger, "readAll") !== "function" ||
      typeof Reflect.get(currentLedger, "readStream") !== "function" ||
      typeof Reflect.get(currentLedger, "append") !== "function"
    ) {
      throw new Error("Resident context ledger binding is unavailable.");
    }
    ledger ??= currentLedger;
    if (ledger !== currentLedger) {
      throw new Error("Resident paired contexts must retain the same exact ledger.");
    }
    for (const [key, expected] of [
      ["workspaceId", workspaceId],
      ["residentAgentId", residentAgentId],
      ["taskId", taskId]
    ] as const) {
      const actual = Reflect.get(context, key);
      if (actual !== undefined && actual !== expected) {
        throw new Error(`Resident context ${key} does not match the package binding.`);
      }
    }
  }
  return ledger as EventLedger;
}

function requireResidentCatalogEntry(
  state: ResidentCapabilityState,
  toolId: string,
  toolVersion: string
): ResidentCatalogEntry {
  const matches = state.entries.filter((entry) =>
    entry.descriptor.toolId === toolId &&
    entry.descriptor.toolVersion === toolVersion
  );
  if (matches.length !== 1) {
    throw new Error("Resident package capability does not authorize the selected catalog tool.");
  }
  return matches[0]!;
}

function requireResidentLocator(
  value: unknown,
  state: ResidentCapabilityState
): Record<string, unknown> {
  const locator = residentDataRecord(value, "resident logical locator");
  rejectResidentUnknown(locator, [
    "workspaceId",
    "residentAgentId",
    "taskId",
    "attemptId",
    "runId",
    "planId",
    "planRevision",
    "stepOrdinal",
    "toolRequestId",
    "toolId",
    "toolVersion",
    "executionCapabilityHash"
  ], "resident logical locator");
  if (
    locator.workspaceId !== state.workspaceId ||
    locator.residentAgentId !== state.residentAgentId ||
    locator.taskId !== state.taskId ||
    locator.executionCapabilityHash !== state.capabilityHash
  ) {
    throw new Error("Resident logical locator does not match the bound package capability.");
  }
  return locator;
}

function attestResidentDomainResult(
  entry: ResidentCatalogEntry,
  invocation: ResidentInvocation,
  result: AgentDomainExecutionResult,
  beforeEvents: readonly unknown[],
  afterEvents: readonly unknown[]
): Readonly<Record<string, unknown>> {
  if ([0, 1, 8].includes(entry.ordinal)) {
    throw new Error("Resident catalog ordinal cannot produce a successful invocation attestation.");
  }
  const copiedResult = copyResidentDomainResult(result);
  const eventIds = copiedResult.eventIds;
  const artifactHashes = copiedResult.artifactHashes;
  const addedEvents = afterEvents.filter((event) =>
    !beforeEvents.some((candidate) =>
      Reflect.get(candidate as object, "id") === Reflect.get(event as object, "id")
    )
  );
  let evidenceMode: "new-ledger-events" | "idempotent-existing-ledger-events" | "nonledger-projection-artifacts";
  if (entry.ordinal === 7) {
    const preview = residentDataRecord(
      invocation.currentPreview.preview,
      "resident projection approved preview"
    );
    const expectedOutputs = residentArray(
      preview.expectedArtifactOutputs,
      "resident projection approved artifact outputs"
    );
    const expectedArtifactHashes = expectedOutputs.map((output) =>
      residentString(
        residentDataRecord(
          output,
          "resident projection approved artifact output"
        ).artifactHash,
        "resident projection approved artifact hash"
      )
    );
    if (
      eventIds.length !== 0 ||
      addedEvents.length !== 0 ||
      artifactHashes.length === 0 ||
      !residentSameStrings(artifactHashes, expectedArtifactHashes) ||
      copiedResult.readModelChanges.length !== 1 ||
      copiedResult.readModelChanges[0]?.projectionName !== "workspace-projection-artifacts"
    ) {
      throw new Error("Resident projection execution returned inadmissible non-ledger evidence.");
    }
    evidenceMode = "nonledger-projection-artifacts";
  } else {
    const expectedCount = entry.ordinal === 10 ? undefined : 1;
    if (
      eventIds.length === 0 ||
      (expectedCount !== undefined && eventIds.length !== expectedCount)
    ) {
      throw new Error("Resident domain execution returned the wrong catalog event count.");
    }
    const selectedEvents = eventIds.map((eventId) =>
      afterEvents.find((event) =>
        Reflect.get(event as object, "id") === eventId
      )
    );
    if (selectedEvents.some((event) => event === undefined)) {
      throw new Error("Resident domain execution event evidence is absent from the mounted ledger.");
    }
    const expectedType = residentExpectedEventType(entry.ordinal);
    if (
      expectedType !== undefined &&
      selectedEvents.some((event) => Reflect.get(event as object, "type") !== expectedType)
    ) {
      throw new Error("Resident domain execution returned evidence outside its catalog event family.");
    }
    if (entry.ordinal === 10) {
      const selectedCandidateIds = residentArray(
        Reflect.get(invocation.currentPreview.preview, "selectedCandidateIds"),
        "resident legacy selected candidates"
      ).map((candidateId) =>
        residentString(candidateId, "resident legacy selected candidate ID")
      );
      const proposedObjects = selectedEvents.map((event) =>
        residentString(
          Reflect.get(Reflect.get(event as object, "payload"), "object"),
          "resident legacy proposed candidate ID"
        )
      );
      if (!residentSameStrings(proposedObjects, selectedCandidateIds)) {
        throw new Error("Resident legacy candidate evidence is outside the exact selected-candidate order.");
      }
    }
    const addedIds = addedEvents.map((event) => String(Reflect.get(event as object, "id")));
    if (residentSameStrings(addedIds, eventIds)) {
      evidenceMode = "new-ledger-events";
    } else if (addedEvents.length === 0 && eventIds.every((id) =>
      beforeEvents.some((event) => Reflect.get(event as object, "id") === id)
    )) {
      evidenceMode = "idempotent-existing-ledger-events";
    } else {
      throw new Error("Resident domain execution evidence is neither exact new events nor an idempotent replay.");
    }
  }
  return Object.freeze({
    schemaVersion: "resident-domain-invocation-attestation.v1",
    executionClaimEventId: invocation.executionClaimEventId,
    executionCapabilityHash: Reflect.get(invocation.logicalLocator, "executionCapabilityHash"),
    catalogOrdinal: entry.ordinal,
    implementationRevision: entry.implementationRevision,
    residentInvocationInputHash: residentHash(invocation),
    evidenceMode,
    preInvocationLedgerFingerprint: residentHash(beforeEvents),
    postInvocationLedgerFingerprint: residentHash(afterEvents),
    result: copiedResult
  });
}

function copyResidentDomainResult(
  value: AgentDomainExecutionResult
): AgentDomainExecutionResult {
  const result = residentDataRecord(value, "resident domain execution result");
  rejectResidentUnknown(
    result,
    ["eventIds", "artifactHashes", "readModelChanges", "resultSummary"],
    "resident domain execution result"
  );
  if (Object.keys(result).length !== 4) {
    throw new Error("Resident domain execution result must contain the exact four result fields.");
  }
  const readModelChanges = residentArray(
    result.readModelChanges,
    "resident domain read-model changes"
  ).map((value) => {
    const change = residentDataRecord(value, "resident domain read-model change");
    rejectResidentUnknown(
      change,
      ["projectionName", "change", "relatedIds"],
      "resident domain read-model change"
    );
    const relatedIds = change.relatedIds === undefined
      ? undefined
      : residentUniqueStrings(
          change.relatedIds as readonly string[],
          "resident domain related ID"
        );
    return Object.freeze({
      projectionName: residentString(
        change.projectionName,
        "resident domain projection name"
      ),
      change: residentString(change.change, "resident domain projection change"),
      ...(relatedIds === undefined ? {} : { relatedIds })
    });
  });
  return Object.freeze({
    eventIds: residentUniqueStrings(
      result.eventIds as readonly string[],
      "resident domain event ID"
    ),
    artifactHashes: residentUniqueStrings(
      result.artifactHashes as readonly string[],
      "resident artifact hash"
    ) as readonly `sha256:${string}`[],
    readModelChanges: Object.freeze(readModelChanges),
    resultSummary: residentString(
      result.resultSummary,
      "resident domain result summary"
    )
  });
}

async function normalizeResidentIdempotentPreview(
  entry: ResidentCatalogEntry,
  current: AgentApprovedToolPreviewResult,
  ledger: EventLedger
): Promise<AgentApprovedToolPreviewResult> {
  if (
    entry.ordinal !== 4 ||
    current.sourceEventIds.length !== 3 ||
    Reflect.get(current.preview, "currentReviewState") !== "accepted"
  ) {
    return current;
  }
  const preview = residentDataRecord(
    current.preview,
    "resident accepted-graph idempotent preview"
  );
  const affectedRefs = Array.isArray(preview.affectedRefs)
    ? preview.affectedRefs.map((value, index) => index === 0
      ? Object.freeze({
          ...residentDataRecord(value, "resident accepted-graph affected ref"),
          reviewState: "proposed"
        })
      : value)
    : [];
  const proposalEventId = residentString(
    preview.proposalEventId,
    "resident accepted-graph proposal event ID"
  );
  const proposal = (await ledger.readAll()).find((event) =>
    Reflect.get(event, "id") === proposalEventId
  );
  if (proposal === undefined) {
    throw new Error("Resident accepted-graph idempotent preview lacks its durable proposal.");
  }
  const projectionHighWaterMarks = Array.isArray(preview.projectionHighWaterMarks)
    ? preview.projectionHighWaterMarks.map((value) => {
        const mark = residentDataRecord(
          value,
          "resident accepted-graph projection high-water mark"
        );
        return Object.freeze({
          ...mark,
          ...(mark.projectionName === "ontology-assertion-review"
            ? { highWaterMark: Reflect.get(proposal, "sequence") }
            : {})
        });
      })
    : [];
  const normalizedInputHash = residentHash({
    assertionId: preview.assertionId,
    proposalEventId: preview.proposalEventId,
    evidenceId: preview.evidenceId,
    evidenceEventId: preview.evidenceEventId,
    evidenceContentHash: preview.evidenceContentHash,
    currentReviewState: "proposed",
    reviewerRationaleDraft: preview.reviewerRationaleDraft,
    lockSnapshot: preview.lockSnapshot,
    ontologyPackVersions: preview.ontologyPackVersions,
    projectedGraphImpact: preview.projectedGraphImpact
  });
  return Object.freeze({
    ...current,
    preview: Object.freeze({
      ...preview,
      normalizedInputHash,
      currentReviewState: "proposed",
      affectedRefs: Object.freeze(affectedRefs),
      relatedEventIds: Object.freeze(current.sourceEventIds.slice(0, 2)),
      projectionHighWaterMarks: Object.freeze(projectionHighWaterMarks)
    }) as never,
    sourceEventIds: Object.freeze(current.sourceEventIds.slice(0, 2))
  });
}

function residentExpectedEventType(ordinal: number): string | undefined {
  return new Map<number, string>([
    [2, "prr.request.sent"],
    [3, "prr.followup.sent"],
    [4, "assertion.accepted"],
    [5, "export.generated"],
    [6, "report.generated"],
    [9, "legacy.ontology.staging.approved"],
    [10, "assertion.proposed"]
  ]).get(ordinal);
}

function residentDataRecord(value: unknown, label: string): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    isProxy(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.getOwnPropertySymbols(value).length > 0
  ) {
    throw new Error(`${label} must be a non-proxy plain object.`);
  }
  const entries: [string, unknown][] = [];
  for (const key of Object.getOwnPropertyNames(value).sort()) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      !descriptor.enumerable ||
      ["__proto__", "constructor", "prototype"].includes(key)
    ) {
      throw new Error(`${label} must contain only enumerable own data properties.`);
    }
    entries.push([key, descriptor.value]);
  }
  return Object.fromEntries(entries);
}

function residentObject(value: unknown, label: string): object {
  if (value === null || typeof value !== "object" || isProxy(value)) {
    throw new Error(`${label} must be an issued non-proxy object.`);
  }
  return value;
}

function residentPlainObject(value: unknown, label: string): Record<string, unknown> {
  residentDataRecord(value, label);
  return value as Record<string, unknown>;
}

function residentString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be canonical.`);
  }
  return value;
}

function rejectResidentUnknown(
  record: Record<string, unknown>,
  allowed: readonly string[],
  label: string
): void {
  if (Object.keys(record).some((key) => !allowed.includes(key))) {
    throw new Error(`${label} contains an unsupported field.`);
  }
}

function residentUniqueStrings(value: readonly string[], label: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new Error(`${label} list must be canonical.`);
  }
  if (new Set(value).size !== value.length) {
    throw new Error(`${label} list must not contain duplicates.`);
  }
  return Object.freeze([...value]);
}

function residentArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value) || isProxy(value)) {
    throw new Error(`${label} must be a non-proxy array.`);
  }
  return Object.freeze([...value]);
}

function residentSameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function residentHash(value: unknown): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(residentCanonicalJson(value)).digest("hex")}`;
}

function residentCanonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(residentCanonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${residentCanonicalJson(Reflect.get(value, key))}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

const residentDomainExecutionApi = Object.freeze({
  createPackageOwnedResidentDomainExecutionCapability,
  bindPackageOwnedResidentDomainExecutionPort
});

export default residentDomainExecutionApi;
