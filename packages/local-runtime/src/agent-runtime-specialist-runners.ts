import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import {
  parseUntrustedSpecialistHandoffPreparation,
  hashUntrustedSpecialistHandoffPreparation,
  type UntrustedSpecialistHandoffPreparationV1
} from "../../agent/src/specialist-handoff-preparation.js";
import { hashSpecialistHandoffMaterial } from "../../agent/src/specialist-handoff-manifest.js";
import {
  appendSpecialistFinalOutputStep,
  recordAuthorityBoundSpecialistHandoff,
  type SpecialistHandoffManifestStore
} from "../../agent/src/specialist-runner-kernel.js";
import { taskOrchestrationStreamId } from "../../agent/src/task-orchestrator-events.js";
import {
  executeSourcedInvestigationWorkflow,
  type ExecuteSourcedInvestigationWorkflowInput
} from "../../agent/src/sourced-investigation-workflows.js";
import {
  runInvestigationPlannerWorkflow,
  type RunInvestigationPlannerWorkflowInput,
  type RunInvestigationPlannerWorkflowResult
} from "../../agent/src/investigation-planner-workflow.js";
import {
  runPrrNegotiationWorkflow,
  type RunPrrNegotiationWorkflowInput,
  type RunPrrNegotiationWorkflowResult
} from "../../agent/src/prr-negotiation-workflow.js";
import type {
  TaskOrchestratorRunnerDispatchInput,
  TaskOrchestratorRunnerDispatchResult
} from "../../agent/src/task-orchestrator.js";
import type { ActorRef } from "../../ontology/src/contracts.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";
import {
  consumeMountedHandoffAuthorityController,
  preflightPortableMountedAgentHandoffBinding,
  type MountedHandoffAuthorityConsumptionReceiptV1,
  type FactoryPortableMountedAgentHandoffProducerResultV1
} from "./portable-mounted-agent-artifact-stores.js";

export interface UntrustedSpecialistRunner {
  dispatch(input: TaskOrchestratorRunnerDispatchInput): Promise<TaskOrchestratorRunnerDispatchResult>;
}

export type SpecialistRunnerPreparationErrorCode = "runner-preparation-invalid";

export class SpecialistRunnerPreparationError extends Error {
  readonly code: SpecialistRunnerPreparationErrorCode;

  constructor() {
    super("runner-preparation-invalid");
    this.name = "SpecialistRunnerPreparationError";
    this.code = "runner-preparation-invalid";
    Object.freeze(this);
  }
}

/**
 * This nonterminal adapter owns neither factory authority nor a durable handoff
 * capability. It snapshots the public dispatch before delegation and returns
 * only canonical untrusted preparation data.
 */
export function createUntrustedSpecialistRunner(input: {
  readonly delegate: (input: TaskOrchestratorRunnerDispatchInput) => Promise<unknown>;
}): UntrustedSpecialistRunner {
  const delegate = normalizeDelegate(input);
  return Object.freeze({
    async dispatch(input: TaskOrchestratorRunnerDispatchInput): Promise<TaskOrchestratorRunnerDispatchResult> {
      const dispatch = normalizePublicDispatch(input);
      let value: unknown;
      try {
        value = await delegate(dispatch);
      } catch (error) {
        if (error instanceof SpecialistRunnerPreparationError) {
          throw error;
        }
        throw error;
      }

      let preparation: UntrustedSpecialistHandoffPreparationV1;
      try {
        preparation = parseUntrustedSpecialistHandoffPreparation(value);
      } catch {
        throw preparationError();
      }
      if (
        preparation.taskId !== dispatch.taskId ||
        preparation.attemptId !== dispatch.attemptId ||
        preparation.approvedRunId !== dispatch.approvedRunId ||
        preparation.runType !== dispatch.runType
      ) {
        throw preparationError();
      }
      return Object.freeze({
        preparation: Object.freeze({
          schemaVersion: "agent.task-orchestrator.runner-preparation.v1" as const,
          preparation
        })
      });
    }
  });
}

export interface MountedInvestigationPlannerRunnerResolution extends Omit<
  RunInvestigationPlannerWorkflowInput,
  | "runId"
  | "taskId"
  | "investigationId"
  | "derivativeStore"
  | "handoffStore"
  | "handoffAuthorityWitness"
> {
  readonly investigationId: string;
}

export interface MountedPrrNegotiationRunnerResolution extends Omit<
  RunPrrNegotiationWorkflowInput,
  | "runId"
  | "taskId"
  | "derivativeStore"
  | "handoffStore"
  | "handoffAuthorityWitness"
> {}

export interface MountedAdvisoryDispatchInput {
  readonly dispatch: TaskOrchestratorRunnerDispatchInput;
  readonly retryGeneration: number;
  readonly handoff: FactoryPortableMountedAgentHandoffProducerResultV1;
}

export interface MountedInvestigationPlannerDispatchResult {
  readonly result: RunInvestigationPlannerWorkflowResult;
  readonly authorityConsumption?: MountedHandoffAuthorityConsumptionReceiptV1;
}

export interface MountedPrrNegotiationDispatchResult {
  readonly result: RunPrrNegotiationWorkflowResult;
  readonly authorityConsumption?: MountedHandoffAuthorityConsumptionReceiptV1;
}

/**
 * Binds the existing planner workflow to one exact factory-issued mounted
 * handoff. The caller can resolve local/fake model and context dependencies,
 * but cannot replace the task/run identity, stores, or handoff authority.
 */
export function createMountedInvestigationPlannerSpecialistRunner(input: {
  readonly resolve: (
    dispatch: TaskOrchestratorRunnerDispatchInput
  ) => Promise<MountedInvestigationPlannerRunnerResolution> | MountedInvestigationPlannerRunnerResolution;
}) {
  const resolve = mountedAdvisoryResolver<MountedInvestigationPlannerRunnerResolution>(input);
  return Object.freeze({
    async dispatch(value: MountedAdvisoryDispatchInput): Promise<MountedInvestigationPlannerDispatchResult> {
      const mounted = normalizeMountedAdvisoryDispatch(value, "investigation-planner");
      await preflightMountedAdvisoryDispatch(mounted);
      const resolved = await resolve(mounted.dispatch);
      const result = await runInvestigationPlannerWorkflow({
        ...resolved,
        runId: mounted.dispatch.approvedRunId,
        taskId: mounted.dispatch.taskId,
        investigationId: resolved.investigationId,
        derivativeStore: mounted.handoff.binding.materialStore,
        handoffStore: mounted.handoff.binding.materialStore,
        handoffAuthorityWitness: mounted.handoff.binding.authorityWitness
      });
      assertAdvisoryResultIdentity(result.handoff, mounted.dispatch);
      const authorityConsumption = await consumeCompletedMountedAdvisoryHandoff({
        ledger: resolved.ledger,
        handoff: mounted.handoff,
        dispatch: mounted.dispatch
      });
      return Object.freeze({
        result,
        ...(authorityConsumption === undefined ? {} : { authorityConsumption })
      });
    }
  });
}

/** The equivalent mounted composition for local PRR advice and drafts. */
export function createMountedPrrNegotiationSpecialistRunner(input: {
  readonly resolve: (
    dispatch: TaskOrchestratorRunnerDispatchInput
  ) => Promise<MountedPrrNegotiationRunnerResolution> | MountedPrrNegotiationRunnerResolution;
}) {
  const resolve = mountedAdvisoryResolver<MountedPrrNegotiationRunnerResolution>(input);
  return Object.freeze({
    async dispatch(value: MountedAdvisoryDispatchInput): Promise<MountedPrrNegotiationDispatchResult> {
      const mounted = normalizeMountedAdvisoryDispatch(value, "prr-negotiation");
      await preflightMountedAdvisoryDispatch(mounted);
      const resolved = await resolve(mounted.dispatch);
      const result = await runPrrNegotiationWorkflow({
        ...resolved,
        runId: mounted.dispatch.approvedRunId,
        taskId: mounted.dispatch.taskId,
        derivativeStore: mounted.handoff.binding.materialStore,
        handoffStore: mounted.handoff.binding.materialStore,
        handoffAuthorityWitness: mounted.handoff.binding.authorityWitness
      });
      assertAdvisoryResultIdentity(result.handoff, mounted.dispatch);
      const authorityConsumption = await consumeCompletedMountedAdvisoryHandoff({
        ledger: resolved.ledger,
        handoff: mounted.handoff,
        dispatch: mounted.dispatch
      });
      return Object.freeze({
        result,
        ...(authorityConsumption === undefined ? {} : { authorityConsumption })
      });
    }
  });
}

export interface SourcedInvestigationRunnerResolution extends Omit<
  ExecuteSourcedInvestigationWorkflowInput,
  "runType" | "runId" | "taskId" | "promptRunId"
> {}

export interface ConsumeMountedSourcedInvestigationDispatchInput {
  readonly runner: UntrustedSpecialistRunner;
  readonly dispatch: TaskOrchestratorRunnerDispatchInput;
  readonly retryGeneration: number;
  readonly handoff: FactoryPortableMountedAgentHandoffProducerResultV1;
  readonly stores: {
    readonly material: SpecialistHandoffManifestStore;
    readonly manifest: SpecialistHandoffManifestStore;
  };
  readonly ledger: EventLedger;
  readonly actor: ActorRef;
  readonly now: () => string;
}

/**
 * The mounted runtime owns this terminal composition. The specialist runner
 * remains preparation-only; only an exact factory-issued portable binding can
 * bind its preparation, persist the canonical V2 handoff, and consume the
 * mounted authority after complete ledger/artifact readback.
 */
export async function consumeMountedSourcedInvestigationDispatch(
  input: ConsumeMountedSourcedInvestigationDispatchInput
) {
  if (input.dispatch.runType !== "timeline-builder" && input.dispatch.runType !== "contradiction-finder") {
    throw preparationError();
  }

  const dispatched = await input.runner.dispatch(input.dispatch);
  const preparation = dispatched.preparation?.preparation;
  if (preparation === undefined) throw preparationError();
  const preparationReadback = input.handoff.binding.preparationBinder.prepare(preparation);
  if (preparationReadback.preparationHash !== preparation.preparationHash) throw preparationError();

  const dependencyHashes = uniqueHashes([
    ...preparation.handoffMaterial.contextPackRefs.flatMap((ref) => [
      ref.contentHash,
      ...(ref.artifactHashes ?? [])
    ]),
    ...(preparation.handoffMaterial.promptArtifactHash === undefined
      ? []
      : [preparation.handoffMaterial.promptArtifactHash]),
    ...preparation.handoffMaterial.outputArtifacts.map((artifact) => artifact.artifactHash)
  ]);
  for (const contentHash of dependencyHashes) {
    await copyExactArtifact(
      input.stores.material,
      input.stores.manifest,
      contentHash
    );
  }

  const finalOutput = await appendSpecialistFinalOutputStep({
    ledger: input.ledger,
    materialStore: input.stores.material,
    actor: input.actor,
    now: input.now,
    runId: input.dispatch.approvedRunId,
    taskId: input.dispatch.taskId,
    handoffMaterial: preparation.handoffMaterial
  });
  if (finalOutput.payload.handoffMaterialArtifactHash !== preparation.handoffMaterialHash) {
    throw preparationError();
  }
  await copyExactArtifact(
    input.stores.material,
    input.stores.manifest,
    preparation.handoffMaterialHash
  );

  const recorded = await recordAuthorityBoundSpecialistHandoff({
    ledger: input.ledger,
    manifestStore: input.stores.manifest,
    actor: input.actor,
    now: input.now,
    runId: input.dispatch.approvedRunId,
    taskId: input.dispatch.taskId,
    handoffAuthorityWitness: input.handoff.binding.authorityWitness
  });
  const orchestrationEvents = await input.ledger.readStream(taskOrchestrationStreamId(
    input.dispatch.taskId,
    input.dispatch.runType
  ));
  const orchestration = orchestrationEvents.find((event) =>
    event.type === "agent.task.orchestration.completed" &&
    event.payload.taskId === input.dispatch.taskId &&
    event.payload.runId === input.dispatch.approvedRunId &&
    event.payload.finalOutputStepEventId === finalOutput.id &&
    event.payload.handoffPreparedEventId === recorded.prepared.id &&
    event.payload.handoffRecordedEventId === recorded.recorded.id &&
    event.payload.specialistRunCompletedEventId === recorded.terminal.id
  );
  if (orchestration === undefined) throw preparationError();
  const authorityConsumption = await consumeMountedHandoffAuthorityController(input.handoff.controller, [
    finalOutput.id,
    recorded.prepared.id,
    recorded.recorded.id,
    recorded.terminal.id,
    orchestration.id,
    recorded.taskStatus.id
  ]);
  return Object.freeze({
    preparationReadback,
    finalOutput,
    recorded,
    orchestration,
    authorityConsumption
  });
}

/**
 * Composes the timeline and contradiction local/fake workflow into the
 * orchestrator's non-authoritative preparation boundary. The returned runner
 * owns no handoff recording authority; mounted factory code must still replay
 * and record the canonical preparation.
 */
export function createSourcedInvestigationSpecialistRunner(input: {
  readonly resolve: (
    dispatch: TaskOrchestratorRunnerDispatchInput
  ) => Promise<SourcedInvestigationRunnerResolution> | SourcedInvestigationRunnerResolution;
}): UntrustedSpecialistRunner {
  const constructor = exactOwnDataObject(input, ["resolve"]);
  if (typeof constructor.resolve !== "function") throw preparationError();
  const resolve = constructor.resolve as (
    dispatch: TaskOrchestratorRunnerDispatchInput
  ) => Promise<SourcedInvestigationRunnerResolution> | SourcedInvestigationRunnerResolution;

  return createUntrustedSpecialistRunner({
    async delegate(dispatch) {
      if (dispatch.runType !== "timeline-builder" && dispatch.runType !== "contradiction-finder") {
        throw preparationError();
      }
      const resolved = await resolve(dispatch);
      const result = await executeSourcedInvestigationWorkflow({
        ...resolved,
        runType: dispatch.runType,
        runId: dispatch.approvedRunId,
        taskId: dispatch.taskId,
        promptRunId: dispatch.attemptId
      });
      const unsigned = Object.freeze({
        schemaVersion: "agent-specialist-handoff-preparation.v1" as const,
        taskId: dispatch.taskId,
        attemptId: dispatch.attemptId,
        approvedRunId: dispatch.approvedRunId,
        runType: dispatch.runType,
        handoffMaterial: result.handoffMaterial,
        handoffMaterialHash: hashSpecialistHandoffMaterial(result.handoffMaterial)
      });
      return Object.freeze({
        ...unsigned,
        preparationHash: hashUntrustedSpecialistHandoffPreparation(unsigned)
      });
    }
  });
}

function normalizeDelegate(value: unknown): (input: TaskOrchestratorRunnerDispatchInput) => Promise<unknown> {
  const input = exactOwnDataObject(value, ["delegate"]);
  if (typeof input.delegate !== "function") {
    throw preparationError();
  }
  return input.delegate as (input: TaskOrchestratorRunnerDispatchInput) => Promise<unknown>;
}

function mountedAdvisoryResolver<T>(value: unknown): (
  dispatch: TaskOrchestratorRunnerDispatchInput
) => Promise<T> | T {
  const input = exactOwnDataObject(value, ["resolve"]);
  if (typeof input.resolve !== "function") throw preparationError();
  return input.resolve as (dispatch: TaskOrchestratorRunnerDispatchInput) => Promise<T> | T;
}

function normalizeMountedAdvisoryDispatch(
  value: unknown,
  expectedRunType: "investigation-planner" | "prr-negotiation"
): MountedAdvisoryDispatchInput {
  const input = exactOwnDataObject(value, ["dispatch", "retryGeneration", "handoff"]);
  const dispatch = normalizePublicDispatch(input.dispatch);
  if (dispatch.runType !== expectedRunType ||
    !Number.isInteger(input.retryGeneration) || (input.retryGeneration as number) < 0 ||
    input.handoff === null || typeof input.handoff !== "object") {
    throw preparationError();
  }
  return Object.freeze({
    dispatch,
    retryGeneration: input.retryGeneration as number,
    handoff: input.handoff as FactoryPortableMountedAgentHandoffProducerResultV1
  });
}

async function preflightMountedAdvisoryDispatch(input: MountedAdvisoryDispatchInput): Promise<void> {
  try {
    await preflightPortableMountedAgentHandoffBinding({
      binding: input.handoff.binding,
      controller: input.handoff.controller,
      taskId: input.dispatch.taskId,
      attemptId: input.dispatch.attemptId,
      runId: input.dispatch.approvedRunId,
      runType: input.dispatch.runType,
      retryGeneration: input.retryGeneration
    });
  } catch {
    throw preparationError();
  }
}

function assertAdvisoryResultIdentity(
  handoff: RunInvestigationPlannerWorkflowResult["handoff"] | RunPrrNegotiationWorkflowResult["handoff"],
  dispatch: TaskOrchestratorRunnerDispatchInput
): void {
  if (handoff.taskId !== dispatch.taskId || handoff.runId !== dispatch.approvedRunId ||
    handoff.runType !== dispatch.runType) {
    throw preparationError();
  }
}

async function consumeCompletedMountedAdvisoryHandoff(input: {
  readonly ledger: EventLedger;
  readonly handoff: FactoryPortableMountedAgentHandoffProducerResultV1;
  readonly dispatch: TaskOrchestratorRunnerDispatchInput;
}): Promise<MountedHandoffAuthorityConsumptionReceiptV1 | undefined> {
  const events = await input.ledger.readAll();
  const effectIds = events.filter((event) => {
    switch (event.type) {
      case "agent.specialist-run.step.recorded":
        return event.payload.runId === input.dispatch.approvedRunId && event.payload.stepKind === "final-output";
      case "agent.specialist-handoff.prepared":
      case "agent.specialist-handoff.recorded":
        return event.payload.runId === input.dispatch.approvedRunId &&
          event.payload.taskId === input.dispatch.taskId && event.payload.runType === input.dispatch.runType;
      case "agent.specialist-run.completed":
      case "agent.specialist-run.failed":
        return event.payload.runId === input.dispatch.approvedRunId;
      case "agent.task.orchestration.completed":
        return event.payload.taskId === input.dispatch.taskId &&
          event.payload.runId === input.dispatch.approvedRunId && event.payload.runType === input.dispatch.runType &&
          event.payload.attemptId === input.dispatch.attemptId;
      case "agent.task.status.changed":
        return event.payload.taskId === input.dispatch.taskId && event.payload.runId === input.dispatch.approvedRunId &&
          (event.payload.status === "completed" || event.payload.status === "failed");
      default:
        return false;
    }
  }).map((event) => event.id);
  if (effectIds.length === 0) return undefined;
  if (effectIds.length !== 6) throw preparationError();
  try {
    return await consumeMountedHandoffAuthorityController(input.handoff.controller, effectIds);
  } catch {
    throw preparationError();
  }
}

function normalizePublicDispatch(value: unknown): TaskOrchestratorRunnerDispatchInput {
  const input = exactOwnDataObject(value, ["taskId", "runType", "attemptId", "approvedRunId"]);
  if (
    !isText(input.taskId) ||
    !isText(input.runType) ||
    !isText(input.attemptId) ||
    !isText(input.approvedRunId)
  ) {
    throw preparationError();
  }
  return Object.freeze({
    taskId: input.taskId,
    runType: input.runType as TaskOrchestratorRunnerDispatchInput["runType"],
    attemptId: input.attemptId,
    approvedRunId: input.approvedRunId
  });
}

function exactOwnDataObject(value: unknown, expectedFields: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw preparationError();
  }
  const prototype = Object.getPrototypeOf(value);
  if ((prototype !== Object.prototype && prototype !== null) || Object.getOwnPropertySymbols(value).length > 0) {
    throw preparationError();
  }
  const actual = Object.getOwnPropertyNames(value).sort();
  const expected = [...expectedFields].sort();
  if (actual.length !== expected.length || actual.some((field, index) => field !== expected[index])) {
    throw preparationError();
  }
  const normalized: Record<string, unknown> = Object.create(null);
  for (const field of expectedFields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      throw preparationError();
    }
    normalized[field] = descriptor.value;
  }
  return Object.freeze(normalized);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function uniqueHashes(values: readonly string[]): readonly `sha256:${string}`[] {
  const hashes = new Set<`sha256:${string}`>();
  for (const value of values) {
    if (!/^sha256:[a-f0-9]{64}$/.test(value)) throw preparationError();
    hashes.add(value as `sha256:${string}`);
  }
  return Object.freeze([...hashes]);
}

async function copyExactArtifact(
  source: FactoryPortableMountedAgentHandoffProducerResultV1["binding"]["materialStore"],
  target: FactoryPortableMountedAgentHandoffProducerResultV1["binding"]["manifestStore"],
  contentHash: `sha256:${string}`
): Promise<void> {
  const bytes = await source.get(contentHash);
  if (!Buffer.isBuffer(bytes) || hashBytes(bytes) !== contentHash) throw preparationError();
  const stored = await target.put(Buffer.from(bytes));
  if (stored.contentHash !== contentHash || stored.sizeBytes !== bytes.byteLength) throw preparationError();
  const readback = await target.get(contentHash);
  if (!Buffer.isBuffer(readback) || !readback.equals(bytes)) throw preparationError();
}

function hashBytes(bytes: Buffer): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function preparationError(): SpecialistRunnerPreparationError {
  return new SpecialistRunnerPreparationError();
}
