import { z } from "zod";
import {
  providerCostPolicySchema,
  providerModalitySchema,
  type ProviderCapabilityDescriptor,
  type ProviderCapabilityRegistry
} from "./provider-registry.js";
import {
  providerReadinessStateSchema,
  type ProviderReadinessState
} from "./provider-readiness.js";
import { isAgentSecretSafeText } from "./secret-safety.js";

const providerIdSchema = z.string()
  .regex(/^provider_[a-zA-Z0-9_-]+$/)
  .refine(isAgentSecretSafeText, { message: "providerId must be secret-safe" });

const safeActionIdSchema = z.string()
  .regex(/^action_[a-z0-9_]+$/)
  .refine(isAgentSecretSafeText, { message: "safeActionId must be secret-safe" });

const safeTextSchema = z.string()
  .min(1)
  .refine(isAgentSecretSafeText, { message: "must be secret-safe" });

export const providerTaskSensitivitySchema = z.enum([
  "workspace-safe",
  "public-safe",
  "sensitive-evidence",
  "sensitive-local-only",
  "provider-approved"
]);

export const providerSelectionTaskSchema = z.object({
  modality: providerModalitySchema,
  structuredOutputRequired: z.boolean(),
  sensitivity: providerTaskSensitivitySchema,
  requiresRemoteHarness: z.boolean()
}).strict();

export const providerSelectionPolicySchema = z.object({
  allowRemoteByteTransfer: z.boolean(),
  preferredCostPolicy: providerCostPolicySchema
}).strict();

export const providerSelectionApprovalClassSchema = z.enum([
  "none",
  "provider-byte-transfer",
  "harness-workspace"
]);

export const providerSelectionFailureCategorySchema = z.enum([
  "provider-not-found",
  "provider-not-ready",
  "provider-policy-blocked"
]);

const providerSelectionSafeReasonSchema = z.enum([
  "ready-local-provider",
  "ready-provider",
  "approval-required"
]);

export const providerSelectionSuccessSchema = z.object({
  ok: z.literal(true),
  providerId: providerIdSchema,
  modelId: safeTextSchema,
  capabilityIds: z.array(safeTextSchema).min(1),
  approvalClass: providerSelectionApprovalClassSchema,
  safeReason: providerSelectionSafeReasonSchema
}).strict();

export const providerSelectionFailureSchema = z.object({
  ok: z.literal(false),
  category: providerSelectionFailureCategorySchema,
  safeMessage: safeTextSchema,
  safeActionIds: z.array(safeActionIdSchema)
}).strict();

export const providerSelectionResultSchema = z.discriminatedUnion("ok", [
  providerSelectionSuccessSchema,
  providerSelectionFailureSchema
]);

export type ProviderTaskSensitivity = z.infer<typeof providerTaskSensitivitySchema>;
export type ProviderSelectionTask = z.infer<typeof providerSelectionTaskSchema>;
export type ProviderSelectionPolicy = z.infer<typeof providerSelectionPolicySchema>;
export type ProviderSelectionApprovalClass = z.infer<typeof providerSelectionApprovalClassSchema>;
export type ProviderSelectionFailureCategory = z.infer<typeof providerSelectionFailureCategorySchema>;
export type ProviderSelectionResult = z.infer<typeof providerSelectionResultSchema>;

export interface SelectProviderForTaskInput {
  readonly registry: ProviderCapabilityRegistry;
  readonly task: ProviderSelectionTask;
  readonly readinessByProviderId: Readonly<Record<string, ProviderReadinessState>>;
  readonly policy: ProviderSelectionPolicy;
}

type ProviderSelectionSafeReason = z.infer<typeof providerSelectionSafeReasonSchema>;

interface ProviderSelectionCandidate {
  readonly descriptor: ProviderCapabilityDescriptor;
  readonly approvalClass: ProviderSelectionApprovalClass;
  readonly safeReason: ProviderSelectionSafeReason;
}

type ProviderPolicyEvaluation =
  | {
    readonly kind: "ready";
    readonly approvalClass: ProviderSelectionApprovalClass;
    readonly safeReason: ProviderSelectionSafeReason;
  }
  | { readonly kind: "not-ready" }
  | { readonly kind: "policy-blocked" };

const readinessByProviderIdSchema = z.record(providerIdSchema, providerReadinessStateSchema);

const notReadyStates = new Set<ProviderReadinessState>([
  "needs-oauth-sign-in",
  "needs-device-sign-in",
  "needs-api-key",
  "credential-binding-missing",
  "credential-expired",
  "provider-unavailable",
  "credential-revoked",
  "insufficient-scope",
  "needs-workload-identity",
  "needs-mtls-binding",
  "harness-not-installed",
  "local-model-not-running",
  "not-available-for-task",
  "health-unverified"
]);

export function selectProviderForTask(input: SelectProviderForTaskInput): ProviderSelectionResult {
  const task = providerSelectionTaskSchema.parse(input.task);
  const policy = providerSelectionPolicySchema.parse(input.policy);
  const readinessByProviderId = readinessByProviderIdSchema.parse(input.readinessByProviderId);

  const candidates: ProviderSelectionCandidate[] = [];
  let foundCapableProvider = false;
  let sawPolicyBlockedProvider = false;

  for (const descriptor of sortedProviderDescriptors(input.registry.list())) {
    if (!providerCanSatisfyTask(descriptor, task)) {
      continue;
    }

    foundCapableProvider = true;
    const readiness = readinessByProviderId[descriptor.providerId];
    if (readiness === undefined) {
      continue;
    }

    const evaluation = evaluateReadinessForPolicy({
      descriptor,
      readiness,
      task,
      policy
    });
    if (evaluation.kind === "ready") {
      candidates.push({
        descriptor,
        approvalClass: evaluation.approvalClass,
        safeReason: evaluation.safeReason
      });
      continue;
    }

    if (evaluation.kind === "policy-blocked") {
      sawPolicyBlockedProvider = true;
    }
  }

  if (candidates.length > 0) {
    const [selected] = candidates.sort((left, right) => compareCandidates(left, right, task, policy));
    if (selected === undefined) {
      return providerSelectionFailure("provider-not-ready");
    }
    return freezeProviderSelectionResult(providerSelectionSuccessSchema.parse({
      ok: true,
      providerId: selected.descriptor.providerId,
      modelId: selectedModelId(selected.descriptor),
      capabilityIds: capabilityIdsFor(selected.descriptor),
      approvalClass: selected.approvalClass,
      safeReason: selected.safeReason
    }));
  }

  if (!foundCapableProvider) {
    return providerSelectionFailure("provider-not-found");
  }

  if (sawPolicyBlockedProvider) {
    return providerSelectionFailure("provider-policy-blocked");
  }

  return providerSelectionFailure("provider-not-ready");
}

function evaluateReadinessForPolicy(input: {
  readonly descriptor: ProviderCapabilityDescriptor;
  readonly readiness: ProviderReadinessState;
  readonly task: ProviderSelectionTask;
  readonly policy: ProviderSelectionPolicy;
}): ProviderPolicyEvaluation {
  if (input.readiness === "policy-blocked") {
    return { kind: "policy-blocked" };
  }

  if (notReadyStates.has(input.readiness)) {
    return { kind: "not-ready" };
  }

  if (remoteProviderBlockedBySensitivity(input.descriptor, input.task, input.policy)) {
    return { kind: "policy-blocked" };
  }

  const approvalClass = approvalClassFor(input.descriptor, input.readiness, input.task);
  if (approvalClass !== "none" && !input.policy.allowRemoteByteTransfer) {
    return { kind: "policy-blocked" };
  }

  if (
    input.readiness === "ready" ||
    input.readiness === "works-locally" ||
    input.readiness === "requires-byte-transfer-approval"
  ) {
    return {
      kind: "ready",
      approvalClass,
      safeReason: safeReasonFor(input.descriptor, approvalClass)
    };
  }

  return { kind: "not-ready" };
}

function providerCanSatisfyTask(
  descriptor: ProviderCapabilityDescriptor,
  task: ProviderSelectionTask
): boolean {
  if (!descriptor.modalities.includes(task.modality)) {
    return false;
  }

  if (task.requiresRemoteHarness && !isHarnessProvider(descriptor)) {
    return false;
  }

  if (task.structuredOutputRequired && !supportsRequiredStructuredOutput(descriptor, task)) {
    return false;
  }

  return true;
}

function supportsRequiredStructuredOutput(
  descriptor: ProviderCapabilityDescriptor,
  task: ProviderSelectionTask
): boolean {
  return descriptor.structuredOutputSupport === "schema-strict" ||
    (task.requiresRemoteHarness && descriptor.structuredOutputSupport === "harness-mediated");
}

function isHarnessProvider(descriptor: ProviderCapabilityDescriptor): boolean {
  return descriptor.approvalProfile === "harness-workspace-gated" ||
    descriptor.toolSupport === "harness-tools" ||
    descriptor.backendKind === "openai-codex-harness" ||
    descriptor.backendKind === "xai-harness";
}

function remoteProviderBlockedBySensitivity(
  descriptor: ProviderCapabilityDescriptor,
  task: ProviderSelectionTask,
  policy: ProviderSelectionPolicy
): boolean {
  if (isLocalProvider(descriptor)) {
    return false;
  }

  if (task.sensitivity === "sensitive-local-only") {
    return true;
  }

  return task.sensitivity === "sensitive-evidence" &&
    !policy.allowRemoteByteTransfer;
}

function approvalClassFor(
  descriptor: ProviderCapabilityDescriptor,
  readiness: ProviderReadinessState,
  task: ProviderSelectionTask
): ProviderSelectionApprovalClass {
  if (descriptor.approvalProfile === "harness-workspace-gated") {
    return "harness-workspace";
  }

  if (
    descriptor.approvalProfile === "remote-byte-transfer-gated" ||
    readiness === "requires-byte-transfer-approval" ||
    (!isLocalProvider(descriptor) && task.sensitivity === "sensitive-evidence")
  ) {
    return "provider-byte-transfer";
  }

  return "none";
}

function safeReasonFor(
  descriptor: ProviderCapabilityDescriptor,
  approvalClass: ProviderSelectionApprovalClass
): ProviderSelectionSafeReason {
  if (approvalClass !== "none") {
    return "approval-required";
  }
  return isLocalProvider(descriptor) ? "ready-local-provider" : "ready-provider";
}

function compareCandidates(
  left: ProviderSelectionCandidate,
  right: ProviderSelectionCandidate,
  task: ProviderSelectionTask,
  policy: ProviderSelectionPolicy
): number {
  return compareRank(candidateRank(left, task, policy), candidateRank(right, task, policy)) ||
    compareProviderIds(left.descriptor.providerId, right.descriptor.providerId);
}

function candidateRank(
  candidate: ProviderSelectionCandidate,
  task: ProviderSelectionTask,
  policy: ProviderSelectionPolicy
): readonly number[] {
  return [
    sensitivityPrefersLocalProvider(task.sensitivity) && !isLocalProvider(candidate.descriptor) ? 1 : 0,
    candidate.descriptor.costPolicy === policy.preferredCostPolicy ? 0 : 1,
    approvalClassRank(candidate.approvalClass)
  ];
}

function approvalClassRank(approvalClass: ProviderSelectionApprovalClass): number {
  const ranks: Record<ProviderSelectionApprovalClass, number> = {
    none: 0,
    "provider-byte-transfer": 1,
    "harness-workspace": 2
  };
  return ranks[approvalClass];
}

function compareRank(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    if (leftValue !== rightValue) {
      return leftValue - rightValue;
    }
  }

  return 0;
}

function sortedProviderDescriptors(
  descriptors: readonly ProviderCapabilityDescriptor[]
): readonly ProviderCapabilityDescriptor[] {
  return Object.freeze([...descriptors].sort((left, right) => compareProviderIds(left.providerId, right.providerId)));
}

function compareProviderIds(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function isLocalProvider(descriptor: ProviderCapabilityDescriptor): boolean {
  return descriptor.approvalProfile === "local-only" ||
    descriptor.backendKind === "local-engine";
}

function selectedModelId(descriptor: ProviderCapabilityDescriptor): string {
  const modelId = [...descriptor.modelFamilies].sort(compareProviderIds).at(0);
  if (modelId === undefined) {
    throw new Error("Selected provider has no registered model family.");
  }
  return modelId;
}

function capabilityIdsFor(descriptor: ProviderCapabilityDescriptor): readonly string[] {
  return Object.freeze([
    `capability_provider_${descriptor.providerId}`,
    `capability_model_${selectedModelId(descriptor)}`,
    `capability_adapter_${descriptor.adapterVersion}`
  ]);
}

function sensitivityPrefersLocalProvider(sensitivity: ProviderTaskSensitivity): boolean {
  return sensitivity === "sensitive-evidence" ||
    sensitivity === "sensitive-local-only";
}

function providerSelectionFailure(
  category: ProviderSelectionFailureCategory
): ProviderSelectionResult {
  const details: Record<ProviderSelectionFailureCategory, {
    readonly safeMessage: string;
    readonly safeActionIds: readonly string[];
  }> = {
    "provider-not-found": {
      safeMessage: "No registered provider can satisfy this task.",
      safeActionIds: ["action_choose_provider"]
    },
    "provider-not-ready": {
      safeMessage: "A matching provider exists but is not ready.",
      safeActionIds: ["action_check_provider_health"]
    },
    "provider-policy-blocked": {
      safeMessage: "Provider policy blocks this task until approval or policy changes.",
      safeActionIds: ["action_review_provider_policy"]
    }
  };
  const detail = details[category];
  return freezeProviderSelectionResult(providerSelectionFailureSchema.parse({
    ok: false,
    category,
    safeMessage: detail.safeMessage,
    safeActionIds: detail.safeActionIds
  }));
}

function freezeProviderSelectionResult(result: ProviderSelectionResult): ProviderSelectionResult {
  if (!result.ok) {
    return Object.freeze({
      ...result,
      safeActionIds: Object.freeze([...result.safeActionIds])
    }) as ProviderSelectionResult;
  }

  return Object.freeze({
    ...result,
    capabilityIds: Object.freeze([...result.capabilityIds])
  }) as ProviderSelectionResult;
}
