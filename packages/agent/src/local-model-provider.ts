import { types as nodeTypes } from "node:util";
import { isAgentSecretSafeText } from "./secret-safety.js";

const hashPattern = /^sha256:[a-f0-9]{64}$/;
const providerIdPattern = /^provider_[a-zA-Z0-9_-]+$/;
const workspaceIdPattern = /^workspace_[a-zA-Z0-9_-]+$/;
const mountInstanceIdPattern = /^mount_[a-zA-Z0-9_-]+$/;
const taskIdPattern = /^task_[a-zA-Z0-9_-]+$/;
const attemptIdPattern = /^attempt_[a-zA-Z0-9_-]+$/;
const runIdPattern = /^run_[a-zA-Z0-9_-]+$/;
const policyVersionPattern = /^policy_[a-zA-Z0-9_.-]+$/;
const adapterVersionPattern = /^local-model-provider\.v[0-9]+$/;
const modelIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,127}$/;

const modalities = ["text", "image", "audio", "file", "code", "embedding"] as const;
const structuredOutputSupport = ["unsupported", "json-mode", "schema-strict"] as const;
const toolSupport = ["none", "function-calling"] as const;
const diagnosticCategories = [
  "local-capability-unsupported",
  "local-concurrency-exhausted",
  "local-engine-unavailable",
  "local-budget-exhausted",
  "local-preparation-invalid",
  "local-preparation-stale",
  "local-selection-mismatch",
  "local-time-budget-exhausted"
] as const;

type LocalModality = typeof modalities[number];
type LocalStructuredOutputSupport = typeof structuredOutputSupport[number];
type LocalToolSupport = typeof toolSupport[number];
type LocalDiagnosticCategory = typeof diagnosticCategories[number];

export interface LocalModelCapability {
  readonly providerId: string;
  readonly modelId: string;
  readonly adapterVersion: string;
  readonly capabilityHash: string;
  readonly backendKind: "local-engine";
  readonly modalities: readonly LocalModality[];
  readonly structuredOutputSupport: LocalStructuredOutputSupport;
  readonly toolSupport: LocalToolSupport;
  readonly credentialKind: "local-no-secret";
  readonly costPolicy: "local-compute";
  readonly approvalProfile: "local-only";
}

export interface LocalModelPolicy {
  readonly policyVersion: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilityHash: string;
  readonly allowLocalModel: boolean;
  readonly maxInputUnits: number;
  readonly maxOutputUnits: number;
  readonly maxConcurrentInvocations: number;
  readonly maxExecutionMilliseconds: number;
}

export interface LocalModelInvocationPreparation {
  readonly residentAgentId: "agent_default";
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly runId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilityHash: string;
  readonly credentialKind: "local-no-secret";
  readonly policyVersion: string;
  readonly approvalProfile: "local-only";
  readonly approvalBindingHash: string;
  readonly promptArtifactHash: string;
  readonly contextHash: string;
  readonly modality: LocalModality;
  readonly structuredOutputRequired: boolean;
  readonly toolSupportRequired: LocalToolSupport;
  readonly inputUnits: number;
  readonly outputUnitBudget: number;
  readonly inputText: string;
}

export interface LocalEngineInspection {
  readonly kind: "available";
  readonly modelIds: readonly string[];
  readonly modalities: readonly LocalModality[];
  readonly structuredOutputSupport: LocalStructuredOutputSupport;
  readonly toolSupport: LocalToolSupport;
}

export interface LocalEngineInvocation {
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilityHash: string;
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly runId: string;
  readonly policyVersion: string;
  readonly approvalBindingHash: string;
  readonly promptArtifactHash: string;
  readonly contextHash: string;
  readonly modality: LocalModality;
  readonly structuredOutputRequired: boolean;
  readonly toolSupportRequired: LocalToolSupport;
  readonly inputText: string;
}

export interface LocalModelEngine {
  inspect(signal: AbortSignal): Promise<unknown>;
  execute(input: LocalEngineInvocation, signal: AbortSignal): Promise<unknown>;
}

export interface CreateLocalModelProviderInput {
  readonly selectedCapability: LocalModelCapability;
  readonly selectedPolicy: LocalModelPolicy;
  readonly currentPreparation: LocalModelInvocationPreparation;
  readonly engine: LocalModelEngine;
}

export type LocalModelInvocationResult =
  | {
    readonly kind: "executed";
    readonly providerId: string;
    readonly modelId: string;
    readonly capabilityHash: string;
    readonly inputUnits: number;
    readonly outputUnits: number;
    readonly safeDiagnosticCodes: readonly [];
  }
  | {
    readonly kind: "unavailable" | "blocked";
    readonly category: LocalDiagnosticCategory;
    readonly providerId: string;
    readonly modelId: string;
    readonly capabilityHash: string;
    readonly safeDiagnosticCodes: readonly [LocalDiagnosticCategory];
  };

export interface LocalModelProvider {
  invoke(input: unknown): Promise<LocalModelInvocationResult>;
}

interface NormalizedCreateInput {
  readonly selectedCapability: LocalModelCapability;
  readonly selectedPolicy: LocalModelPolicy;
  readonly currentPreparation: LocalModelInvocationPreparation;
  readonly engine: LocalModelEngine;
}

interface LocalEngineUsage {
  readonly inputUnits: number;
  readonly outputUnits: number;
}

interface LocalEngineUnavailable {
  readonly kind: "unavailable";
}

/**
 * Executes only an already-selected in-process local engine. This boundary has
 * no endpoint, credential, provider discovery, registry, or fallback input.
 */
export function createLocalModelProvider(input: unknown): LocalModelProvider {
  const configured = normalizeCreateInput(input);
  let activeInvocations = 0;

  return Object.freeze({
    async invoke(candidate: unknown): Promise<LocalModelInvocationResult> {
      const preparation = normalizePreparation(candidate);
      if (preparation === undefined) {
        return failure("blocked", "local-preparation-invalid");
      }
      if (configured === undefined) {
        return failure("blocked", "local-selection-mismatch");
      }
      if (!samePreparationBinding(configured.currentPreparation, preparation)) {
        return failureForConfiguration(configured, "blocked", "local-preparation-stale");
      }
      if (!hasCurrentExplicitLocalSelection(configured, preparation)) {
        return failureForConfiguration(configured, "blocked", "local-selection-mismatch");
      }
      if (budgetIsExhausted(configured.selectedPolicy, preparation)) {
        return failureForConfiguration(configured, "blocked", "local-budget-exhausted");
      }
      if (activeInvocations >= configured.selectedPolicy.maxConcurrentInvocations) {
        return failureForConfiguration(configured, "blocked", "local-concurrency-exhausted");
      }

      activeInvocations += 1;
      let reservationRetainedUntilEngineSettles = false;
      let reservationReleased = false;
      const releaseReservation = (): void => {
        if (!reservationReleased) {
          reservationReleased = true;
          activeInvocations -= 1;
        }
      };
      const retainReservationUntilSettled = (work: Promise<unknown>): void => {
        reservationRetainedUntilEngineSettles = true;
        void work.then(releaseReservation, releaseReservation);
      };
      const controller = new AbortController();
      const deadline = Date.now() + configured.selectedPolicy.maxExecutionMilliseconds;

      try {
        const inspectionWork = Promise.resolve().then(() => configured.engine.inspect(controller.signal));
        const inspectionOutcome = await settleBeforeDeadline(
          inspectionWork,
          controller,
          deadline
        );
        if (inspectionOutcome.kind === "timeout") {
          retainReservationUntilSettled(inspectionWork);
          return failureForConfiguration(configured, "blocked", "local-time-budget-exhausted");
        }
        if (inspectionOutcome.kind === "failed") {
          return failureForConfiguration(configured, "unavailable", "local-engine-unavailable");
        }

        const inspection = normalizeInspection(inspectionOutcome.value);
        if (inspection === undefined || inspection.kind === "unavailable") {
          return failureForConfiguration(configured, "unavailable", "local-engine-unavailable");
        }
        if (!engineSupportsSelectedPreparation(configured.selectedCapability, inspection, preparation)) {
          return failureForConfiguration(configured, "unavailable", "local-capability-unsupported");
        }

        const executionWork = Promise.resolve().then(() => configured.engine.execute(
          toEngineInvocation(preparation),
          controller.signal
        ));
        const executionOutcome = await settleBeforeDeadline(
          executionWork,
          controller,
          deadline
        );
        if (executionOutcome.kind === "timeout") {
          retainReservationUntilSettled(executionWork);
          return failureForConfiguration(configured, "blocked", "local-time-budget-exhausted");
        }
        if (executionOutcome.kind === "failed") {
          return failureForConfiguration(configured, "unavailable", "local-engine-unavailable");
        }

        const usage = normalizeUsage(executionOutcome.value);
        if (usage === undefined) {
          return failureForConfiguration(configured, "unavailable", "local-engine-unavailable");
        }
        if (usage.inputUnits > configured.selectedPolicy.maxInputUnits ||
            usage.outputUnits > configured.selectedPolicy.maxOutputUnits ||
            usage.outputUnits > preparation.outputUnitBudget) {
          return failureForConfiguration(configured, "blocked", "local-budget-exhausted");
        }

        return executionReceipt(configured.selectedCapability, usage);
      } finally {
        if (!reservationRetainedUntilEngineSettles) {
          releaseReservation();
        }
      }
    }
  });
}

function normalizeCreateInput(value: unknown): NormalizedCreateInput | undefined {
  const record = plainOwnDataRecord(value);
  if (record === undefined || !hasExactKeys(record, [
    "selectedCapability",
    "selectedPolicy",
    "currentPreparation",
    "engine"
  ])) {
    return undefined;
  }

  const selectedCapability = normalizeCapability(record.selectedCapability);
  const selectedPolicy = normalizePolicy(record.selectedPolicy);
  const currentPreparation = normalizePreparation(record.currentPreparation);
  const engine = normalizeEngine(record.engine);
  if (selectedCapability === undefined || selectedPolicy === undefined ||
      currentPreparation === undefined || engine === undefined) {
    return undefined;
  }

  return Object.freeze({ selectedCapability, selectedPolicy, currentPreparation, engine });
}

function normalizeCapability(value: unknown): LocalModelCapability | undefined {
  const record = plainOwnDataRecord(value);
  if (record === undefined || !hasExactKeys(record, [
    "providerId",
    "modelId",
    "adapterVersion",
    "capabilityHash",
    "backendKind",
    "modalities",
    "structuredOutputSupport",
    "toolSupport",
    "credentialKind",
    "costPolicy",
    "approvalProfile"
  ])) {
    return undefined;
  }

  const supportedModalities = normalizeEnumArray(record.modalities, modalities);
  if (!isSafeProviderId(record.providerId) || !isSafeModelId(record.modelId) ||
      !isSafeAdapterVersion(record.adapterVersion) || !isHash(record.capabilityHash) ||
      record.backendKind !== "local-engine" || supportedModalities === undefined ||
      !isEnumValue(record.structuredOutputSupport, structuredOutputSupport) ||
      !isEnumValue(record.toolSupport, toolSupport) || record.credentialKind !== "local-no-secret" ||
      record.costPolicy !== "local-compute" || record.approvalProfile !== "local-only") {
    return undefined;
  }

  return Object.freeze({
    providerId: record.providerId,
    modelId: record.modelId,
    adapterVersion: record.adapterVersion,
    capabilityHash: record.capabilityHash,
    backendKind: "local-engine",
    modalities: supportedModalities,
    structuredOutputSupport: record.structuredOutputSupport,
    toolSupport: record.toolSupport,
    credentialKind: "local-no-secret",
    costPolicy: "local-compute",
    approvalProfile: "local-only"
  });
}

function normalizePolicy(value: unknown): LocalModelPolicy | undefined {
  const record = plainOwnDataRecord(value);
  if (record === undefined || !hasExactKeys(record, [
    "policyVersion",
    "providerId",
    "modelId",
    "capabilityHash",
    "allowLocalModel",
    "maxInputUnits",
    "maxOutputUnits",
    "maxConcurrentInvocations",
    "maxExecutionMilliseconds"
  ])) {
    return undefined;
  }

  if (!isSafePolicyVersion(record.policyVersion) || !isSafeProviderId(record.providerId) ||
      !isSafeModelId(record.modelId) || !isHash(record.capabilityHash) ||
      typeof record.allowLocalModel !== "boolean" || !isPositiveInteger(record.maxInputUnits) ||
      !isPositiveInteger(record.maxOutputUnits) || !isPositiveInteger(record.maxConcurrentInvocations) ||
      !isPositiveInteger(record.maxExecutionMilliseconds)) {
    return undefined;
  }

  return Object.freeze({
    policyVersion: record.policyVersion,
    providerId: record.providerId,
    modelId: record.modelId,
    capabilityHash: record.capabilityHash,
    allowLocalModel: record.allowLocalModel,
    maxInputUnits: record.maxInputUnits,
    maxOutputUnits: record.maxOutputUnits,
    maxConcurrentInvocations: record.maxConcurrentInvocations,
    maxExecutionMilliseconds: record.maxExecutionMilliseconds
  });
}

function normalizePreparation(value: unknown): LocalModelInvocationPreparation | undefined {
  const record = plainOwnDataRecord(value);
  if (record === undefined || !hasExactKeys(record, [
    "residentAgentId",
    "workspaceId",
    "mountInstanceId",
    "taskId",
    "attemptId",
    "runId",
    "providerId",
    "modelId",
    "capabilityHash",
    "credentialKind",
    "policyVersion",
    "approvalProfile",
    "approvalBindingHash",
    "promptArtifactHash",
    "contextHash",
    "modality",
    "structuredOutputRequired",
    "toolSupportRequired",
    "inputUnits",
    "outputUnitBudget",
    "inputText"
  ])) {
    return undefined;
  }

  if (record.residentAgentId !== "agent_default" || !isSafeId(record.workspaceId, workspaceIdPattern) ||
      !isSafeId(record.mountInstanceId, mountInstanceIdPattern) || !isSafeId(record.taskId, taskIdPattern) ||
      !isSafeId(record.attemptId, attemptIdPattern) || !isSafeId(record.runId, runIdPattern) ||
      !isSafeProviderId(record.providerId) || !isSafeModelId(record.modelId) ||
      !isHash(record.capabilityHash) || record.credentialKind !== "local-no-secret" ||
      !isSafePolicyVersion(record.policyVersion) || record.approvalProfile !== "local-only" ||
      !isHash(record.approvalBindingHash) || !isHash(record.promptArtifactHash) ||
      !isHash(record.contextHash) || !isEnumValue(record.modality, modalities) ||
      typeof record.structuredOutputRequired !== "boolean" || !isEnumValue(record.toolSupportRequired, toolSupport) ||
      !isNonnegativeInteger(record.inputUnits) || !isNonnegativeInteger(record.outputUnitBudget) ||
      typeof record.inputText !== "string" || record.inputText.length === 0) {
    return undefined;
  }

  return Object.freeze({
    residentAgentId: "agent_default",
    workspaceId: record.workspaceId,
    mountInstanceId: record.mountInstanceId,
    taskId: record.taskId,
    attemptId: record.attemptId,
    runId: record.runId,
    providerId: record.providerId,
    modelId: record.modelId,
    capabilityHash: record.capabilityHash,
    credentialKind: "local-no-secret",
    policyVersion: record.policyVersion,
    approvalProfile: "local-only",
    approvalBindingHash: record.approvalBindingHash,
    promptArtifactHash: record.promptArtifactHash,
    contextHash: record.contextHash,
    modality: record.modality,
    structuredOutputRequired: record.structuredOutputRequired,
    toolSupportRequired: record.toolSupportRequired,
    inputUnits: record.inputUnits,
    outputUnitBudget: record.outputUnitBudget,
    inputText: record.inputText
  });
}

function normalizeEngine(value: unknown): LocalModelEngine | undefined {
  const record = plainOwnDataRecord(value);
  if (record === undefined || !hasExactKeys(record, ["inspect", "execute"]) ||
      typeof record.inspect !== "function" || typeof record.execute !== "function") {
    return undefined;
  }
  return Object.freeze({
    inspect: record.inspect as LocalModelEngine["inspect"],
    execute: record.execute as LocalModelEngine["execute"]
  });
}

function hasCurrentExplicitLocalSelection(
  configured: NormalizedCreateInput,
  preparation: LocalModelInvocationPreparation
): boolean {
  const { selectedCapability: capability, selectedPolicy: policy } = configured;
  return policy.allowLocalModel && capability.backendKind === "local-engine" &&
    capability.credentialKind === "local-no-secret" && capability.costPolicy === "local-compute" &&
    capability.approvalProfile === "local-only" && capability.providerId === policy.providerId &&
    capability.modelId === policy.modelId && capability.capabilityHash === policy.capabilityHash &&
    capability.providerId === preparation.providerId && capability.modelId === preparation.modelId &&
    capability.capabilityHash === preparation.capabilityHash && policy.policyVersion === preparation.policyVersion &&
    preparation.credentialKind === "local-no-secret" && preparation.approvalProfile === "local-only";
}

function budgetIsExhausted(policy: LocalModelPolicy, preparation: LocalModelInvocationPreparation): boolean {
  return preparation.inputUnits > policy.maxInputUnits || preparation.outputUnitBudget > policy.maxOutputUnits;
}

function samePreparationBinding(
  current: LocalModelInvocationPreparation,
  candidate: LocalModelInvocationPreparation
): boolean {
  return current.residentAgentId === candidate.residentAgentId &&
    current.workspaceId === candidate.workspaceId && current.mountInstanceId === candidate.mountInstanceId &&
    current.taskId === candidate.taskId && current.attemptId === candidate.attemptId && current.runId === candidate.runId &&
    current.providerId === candidate.providerId && current.modelId === candidate.modelId &&
    current.capabilityHash === candidate.capabilityHash && current.credentialKind === candidate.credentialKind &&
    current.policyVersion === candidate.policyVersion && current.approvalProfile === candidate.approvalProfile &&
    current.approvalBindingHash === candidate.approvalBindingHash &&
    current.promptArtifactHash === candidate.promptArtifactHash && current.contextHash === candidate.contextHash &&
    current.modality === candidate.modality && current.structuredOutputRequired === candidate.structuredOutputRequired &&
    current.toolSupportRequired === candidate.toolSupportRequired && current.inputUnits === candidate.inputUnits &&
    current.outputUnitBudget === candidate.outputUnitBudget && current.inputText === candidate.inputText;
}

function normalizeInspection(value: unknown): LocalEngineInspection | LocalEngineUnavailable | undefined {
  const record = plainOwnDataRecord(value);
  if (record === undefined) {
    return undefined;
  }
  if (record.kind === "unavailable" && hasExactKeys(record, ["kind", "category"]) &&
      typeof record.category === "string") {
    return Object.freeze({ kind: "unavailable" });
  }
  if (!hasExactKeys(record, [
    "kind",
    "modelIds",
    "modalities",
    "structuredOutputSupport",
    "toolSupport"
  ])) {
    return undefined;
  }
  const modelIds = normalizeSafeModelIds(record.modelIds);
  const supportedModalities = normalizeEnumArray(record.modalities, modalities);
  if (record.kind !== "available" || modelIds === undefined || supportedModalities === undefined ||
      !isEnumValue(record.structuredOutputSupport, structuredOutputSupport) ||
      !isEnumValue(record.toolSupport, toolSupport)) {
    return undefined;
  }
  return Object.freeze({
    kind: "available",
    modelIds,
    modalities: supportedModalities,
    structuredOutputSupport: record.structuredOutputSupport,
    toolSupport: record.toolSupport
  });
}

function engineSupportsSelectedPreparation(
  capability: LocalModelCapability,
  inspection: LocalEngineInspection,
  preparation: LocalModelInvocationPreparation
): boolean {
  if (!inspection.modelIds.includes(capability.modelId) || !capability.modalities.includes(preparation.modality) ||
      !inspection.modalities.includes(preparation.modality)) {
    return false;
  }
  if (preparation.structuredOutputRequired &&
      (capability.structuredOutputSupport !== "schema-strict" || inspection.structuredOutputSupport !== "schema-strict")) {
    return false;
  }
  return preparation.toolSupportRequired === "none" ||
    (capability.toolSupport === "function-calling" && inspection.toolSupport === "function-calling");
}

function toEngineInvocation(preparation: LocalModelInvocationPreparation): LocalEngineInvocation {
  return Object.freeze({
    providerId: preparation.providerId,
    modelId: preparation.modelId,
    capabilityHash: preparation.capabilityHash,
    workspaceId: preparation.workspaceId,
    mountInstanceId: preparation.mountInstanceId,
    taskId: preparation.taskId,
    attemptId: preparation.attemptId,
    runId: preparation.runId,
    policyVersion: preparation.policyVersion,
    approvalBindingHash: preparation.approvalBindingHash,
    promptArtifactHash: preparation.promptArtifactHash,
    contextHash: preparation.contextHash,
    modality: preparation.modality,
    structuredOutputRequired: preparation.structuredOutputRequired,
    toolSupportRequired: preparation.toolSupportRequired,
    inputText: preparation.inputText
  });
}

function normalizeUsage(value: unknown): LocalEngineUsage | undefined {
  const record = plainOwnDataRecord(value);
  if (record === undefined || !hasExactKeys(record, ["inputUnits", "outputUnits"]) ||
      !isNonnegativeInteger(record.inputUnits) || !isNonnegativeInteger(record.outputUnits)) {
    return undefined;
  }
  return Object.freeze({ inputUnits: record.inputUnits, outputUnits: record.outputUnits });
}

async function settleBeforeDeadline<T>(
  work: Promise<T>,
  controller: AbortController,
  deadline: number
): Promise<{ readonly kind: "value"; readonly value: T } | { readonly kind: "failed" | "timeout" }> {
  const remainingMilliseconds = deadline - Date.now();
  if (remainingMilliseconds <= 0) {
    controller.abort();
    return { kind: "timeout" };
  }

  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutOutcome = new Promise<{ readonly kind: "timeout" }>((resolve) => {
    timeout = setTimeout(() => {
      controller.abort();
      resolve({ kind: "timeout" });
    }, remainingMilliseconds);
  });
  const workOutcome = work.then(
    (value): { readonly kind: "value"; readonly value: T } => ({ kind: "value", value }),
    (): { readonly kind: "failed" } => ({ kind: "failed" })
  );
  const outcome = await Promise.race([workOutcome, timeoutOutcome]);
  if (timeout !== undefined) {
    clearTimeout(timeout);
  }
  return outcome;
}

function executionReceipt(capability: LocalModelCapability, usage: LocalEngineUsage): LocalModelInvocationResult {
  return Object.freeze({
    kind: "executed",
    providerId: capability.providerId,
    modelId: capability.modelId,
    capabilityHash: capability.capabilityHash,
    inputUnits: usage.inputUnits,
    outputUnits: usage.outputUnits,
    safeDiagnosticCodes: Object.freeze([]) as readonly []
  });
}

function failureForConfiguration(
  configured: NormalizedCreateInput,
  kind: "unavailable" | "blocked",
  category: LocalDiagnosticCategory
): LocalModelInvocationResult {
  return failure(kind, category, configured.selectedCapability);
}

function failure(
  kind: "unavailable" | "blocked",
  category: LocalDiagnosticCategory,
  capability?: LocalModelCapability
): LocalModelInvocationResult {
  return Object.freeze({
    kind,
    category,
    providerId: capability?.providerId ?? "provider_local_unavailable",
    modelId: capability?.modelId ?? "local-unavailable",
    capabilityHash: capability?.capabilityHash ?? "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    safeDiagnosticCodes: Object.freeze([category]) as readonly [LocalDiagnosticCategory]
  });
}

function plainOwnDataRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  try {
    if (nodeTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype ||
        Object.getOwnPropertySymbols(value).length > 0) {
      return undefined;
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const snapshot: Record<string, unknown> = {};
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (!("value" in descriptor) || descriptor.get !== undefined || descriptor.set !== undefined) {
        return undefined;
      }
      snapshot[key] = descriptor.value;
    }
    return Object.freeze(snapshot);
  } catch {
    return undefined;
  }
}

function normalizeSafeModelIds(value: unknown): readonly string[] | undefined {
  const values = plainDataArray(value);
  if (values === undefined || values.length === 0 || !values.every(isSafeModelId)) {
    return undefined;
  }
  return Object.freeze([...values]);
}

function normalizeEnumArray<T extends string>(
  value: unknown,
  allowed: readonly T[]
): readonly T[] | undefined {
  const values = plainDataArray(value);
  if (values === undefined || values.length === 0 || !values.every((item) => isEnumValue(item, allowed))) {
    return undefined;
  }
  return Object.freeze([...new Set(values)]);
}

function plainDataArray(value: unknown): readonly unknown[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  try {
    if (nodeTypes.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype ||
        Object.getOwnPropertySymbols(value).length > 0) {
      return undefined;
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const lengthDescriptor = descriptors.length;
    if (lengthDescriptor === undefined || !("value" in lengthDescriptor) ||
        lengthDescriptor.get !== undefined || lengthDescriptor.set !== undefined ||
        !isNonnegativeInteger(lengthDescriptor.value)) {
      return undefined;
    }
    const expectedKeys = new Set(["length"]);
    for (let index = 0; index < lengthDescriptor.value; index += 1) {
      expectedKeys.add(String(index));
    }
    if (Object.keys(descriptors).length !== expectedKeys.size ||
        Object.keys(descriptors).some((key) => !expectedKeys.has(key))) {
      return undefined;
    }
    const snapshot: unknown[] = [];
    for (let index = 0; index < lengthDescriptor.value; index += 1) {
      const descriptor = descriptors[String(index)];
      if (descriptor === undefined || !("value" in descriptor) || descriptor.get !== undefined || descriptor.set !== undefined) {
        return undefined;
      }
      snapshot.push(descriptor.value);
    }
    return Object.freeze(snapshot);
  } catch {
    return undefined;
  }
}

function hasExactKeys(record: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isSafeProviderId(value: unknown): value is string {
  return isSafeId(value, providerIdPattern);
}

function isSafeModelId(value: unknown): value is string {
  return typeof value === "string" && modelIdPattern.test(value) && isSafePublicText(value);
}

function isSafeAdapterVersion(value: unknown): value is string {
  return typeof value === "string" && adapterVersionPattern.test(value) && isSafePublicText(value);
}

function isSafePolicyVersion(value: unknown): value is string {
  return isSafeId(value, policyVersionPattern);
}

function isSafeId(value: unknown, pattern: RegExp): value is string {
  return typeof value === "string" && pattern.test(value) && isSafePublicText(value);
}

function isHash(value: unknown): value is string {
  return typeof value === "string" && hashPattern.test(value);
}

function isSafePublicText(value: string): boolean {
  return isAgentSecretSafeText(value) && !/(?:[a-z][a-z0-9+.-]*:\/\/|www\.)/i.test(value);
}

function isEnumValue<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isNonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
