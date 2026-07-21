import { z } from "zod";
import { credentialReferenceSchema } from "./credential-reference.js";
import { providerCapabilityDescriptorSchema } from "./provider-registry.js";
import { isAgentSecretSafeText } from "./secret-safety.js";

const safeTextSchema = z.string().min(1).refine(isAgentSecretSafeText, {
  message: "must be secret-safe"
});
const nonUrlSafeTextSchema = safeTextSchema.refine((value) => !isUrlShaped(value), {
  message: "must not be URL-shaped"
});
const providerIdSchema = z.string().regex(/^provider_[a-zA-Z0-9_-]+$/).pipe(safeTextSchema);
const credentialRefIdSchema = z.string().regex(/^agent_credref_[a-zA-Z0-9_-]+$/).pipe(safeTextSchema);
const workspaceIdSchema = z.string().regex(/^workspace_[a-zA-Z0-9_-]+$/).pipe(safeTextSchema);
const mountInstanceIdSchema = z.string().regex(/^mount_[a-zA-Z0-9_-]+$/).pipe(safeTextSchema);
const taskIdSchema = z.string().regex(/^task_[a-zA-Z0-9_-]+$/).pipe(safeTextSchema);
const attemptIdSchema = z.string().regex(/^attempt_[a-zA-Z0-9_-]+$/).pipe(safeTextSchema);
const runIdSchema = z.string().regex(/^run_[a-zA-Z0-9_-]+$/).pipe(safeTextSchema);
const endpointPolicyIdSchema = z.string().regex(/^endpoint_policy_[a-zA-Z0-9_-]+$/).pipe(safeTextSchema);
const sourceEventIdSchema = z.string().regex(/^evt_[a-zA-Z0-9_-]+$/).pipe(safeTextSchema);
const contentHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const capabilityVersionSchema = z.literal("agent-provider-capability.v2");
const preparationVersionSchema = z.literal("agent-provider-invocation-preparation.v1");
const sourceEventIdsSchema = z.array(sourceEventIdSchema).min(1).superRefine((values, context) => {
  if (new Set(values).size !== values.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "must not contain duplicates" });
  }
});

const requestedUseSchema = z.object({
  workspaceId: workspaceIdSchema,
  mountInstanceId: mountInstanceIdSchema,
  taskId: taskIdSchema,
  attemptId: attemptIdSchema,
  runId: runIdSchema,
  promptArtifactHash: contentHashSchema,
  approvalPreviewHash: contentHashSchema,
  policyVersion: nonUrlSafeTextSchema
}).strict();

const selectionSchema = z.object({
  providerId: providerIdSchema,
  modelId: nonUrlSafeTextSchema,
  adapterVersion: nonUrlSafeTextSchema,
  capabilityVersion: capabilityVersionSchema,
  capabilityHash: contentHashSchema,
  capabilitySourceEventId: sourceEventIdSchema,
  capabilityRevision: nonUrlSafeTextSchema,
  credentialRefId: credentialRefIdSchema,
  credentialSourceEventIds: sourceEventIdsSchema,
  endpointPolicyId: endpointPolicyIdSchema,
  workspaceId: workspaceIdSchema,
  taskId: taskIdSchema,
  attemptId: attemptIdSchema,
  approvalPreviewHash: contentHashSchema,
  policyVersion: nonUrlSafeTextSchema
}).strict();

const capabilityEvidenceSchema = z.object({
  capabilityVersion: capabilityVersionSchema,
  capabilityHash: contentHashSchema,
  capabilitySourceEventId: sourceEventIdSchema,
  capabilityRevision: nonUrlSafeTextSchema
}).strict();

const endpointPolicySchema = z.object({
  endpointPolicyId: endpointPolicyIdSchema,
  providerId: providerIdSchema,
  modelId: nonUrlSafeTextSchema,
  adapterVersion: nonUrlSafeTextSchema,
  scope: z.enum(["exact-provider-model", "wildcard"]),
  status: z.enum(["approved", "unapproved"])
}).strict();

const preparationSchema = selectionSchema.extend({
  preparationVersion: preparationVersionSchema,
  residentAgentId: z.literal("agent_default"),
  mountInstanceId: mountInstanceIdSchema,
  runId: runIdSchema,
  promptArtifactHash: contentHashSchema
}).strict();

const authoritySchema = z.object({
  selection: selectionSchema,
  capability: providerCapabilityDescriptorSchema,
  capabilityEvidence: capabilityEvidenceSchema,
  credentialReference: credentialReferenceSchema.optional(),
  endpointPolicy: endpointPolicySchema,
  current: requestedUseSchema,
  preparation: preparationSchema
}).strict();

const requestedUseKeys = new Set([
  "workspaceId",
  "mountInstanceId",
  "taskId",
  "attemptId",
  "runId",
  "promptArtifactHash",
  "approvalPreviewHash",
  "policyVersion"
]);
const authorityKeys = new Set([
  "selection",
  "capability",
  "capabilityEvidence",
  "credentialReference",
  "endpointPolicy",
  "current",
  "preparation"
]);
const authorityReaderBrands = new WeakSet<object>();

export interface ByokProviderRequestedUse extends z.infer<typeof requestedUseSchema> {}

export interface ByokProviderAuthorityReader {
  readonly version: "ByokProviderAuthorityReader.v1";
  readonly readCurrentByokProviderAuthority: (requestedUse: ByokProviderRequestedUse) => unknown;
}

export interface ByokProviderBoundary {
  evaluate(input: unknown): ByokProviderBoundaryResult;
}

export type ByokProviderBoundaryResult =
  | {
    readonly kind: "approval-required";
    readonly category: "provider-byte-transfer-required";
    readonly safeActionId: "action_request_provider_byte_transfer";
    readonly selection: ByokProviderBoundarySelection;
  }
  | {
    readonly kind: "unavailable";
    readonly category:
      | "authority-reader-unavailable"
      | "credential-reference-missing"
      | "credential-reference-revoked"
      | "credential-reference-expired"
      | "credential-reference-unavailable";
    readonly safeActionId:
      | "action_check_provider_health"
      | "action_link_provider_credential"
      | "action_relink_provider_credential"
      | "action_rotate_provider_credential";
  }
  | {
    readonly kind: "blocked";
    readonly category: "unsafe-input";
    readonly safeActionId: "action_review_byok_provider";
  };

export interface ByokProviderBoundarySelection {
  readonly providerId: string;
  readonly modelId: string;
  readonly adapterVersion: string;
  readonly credentialRefId: string;
  readonly endpointPolicyId: string;
  readonly policyVersion: string;
}

type UnavailableResult = Extract<ByokProviderBoundaryResult, { readonly kind: "unavailable" }>;
type BlockedResult = Extract<ByokProviderBoundaryResult, { readonly kind: "blocked" }>;

/**
 * Creates the only supported `ByokProviderAuthorityReader.v1` capability.
 * Task139 later mounts a production resolver through this factory; arbitrary
 * caller objects cannot impersonate the capability.
 */
export function createByokProviderAuthorityReader(
  readCurrentByokProviderAuthority: (requestedUse: ByokProviderRequestedUse) => unknown
): ByokProviderAuthorityReader {
  if (typeof readCurrentByokProviderAuthority !== "function") {
    throw new TypeError("BYOK authority reader must provide a resolver function");
  }

  const reader: ByokProviderAuthorityReader = Object.freeze({
    version: "ByokProviderAuthorityReader.v1",
    readCurrentByokProviderAuthority
  });
  authorityReaderBrands.add(reader);
  return reader;
}

/**
 * Creates a credential-free BYOK admission boundary. Public unknown input can
 * identify only the requested current use; all authority comes from the
 * injected reader and is checked again before approval can be requested.
 */
export function createByokProviderBoundary(reader: unknown): ByokProviderBoundary {
  return Object.freeze({
    evaluate(input: unknown): ByokProviderBoundaryResult {
      return evaluateByokProviderBoundary(reader, input);
    }
  });
}

export function evaluateByokProviderBoundary(
  reader: unknown,
  input: unknown
): ByokProviderBoundaryResult {
  const normalizedUse = normalizePlainOwnData(input);
  if (
    typeof normalizedUse !== "object" ||
    normalizedUse === null ||
    Array.isArray(normalizedUse) ||
    !hasExactKeys(normalizedUse, requestedUseKeys)
  ) {
    return blocked("unsafe-input", "action_review_byok_provider");
  }
  const parsedUse = requestedUseSchema.safeParse(normalizedUse);
  if (!parsedUse.success) {
    return blocked("unsafe-input", "action_review_byok_provider");
  }
  const requestedUse = Object.freeze({ ...parsedUse.data }) as ByokProviderRequestedUse;

  if (!isTrustedAuthorityReader(reader)) {
    return unavailable("authority-reader-unavailable", "action_check_provider_health");
  }

  let rawAuthority: unknown;
  try {
    rawAuthority = reader.readCurrentByokProviderAuthority(requestedUse);
  } catch {
    return unavailable("authority-reader-unavailable", "action_check_provider_health");
  }
  const normalizedAuthority = normalizePlainOwnData(rawAuthority);
  if (
    typeof normalizedAuthority !== "object" ||
    normalizedAuthority === null ||
    Array.isArray(normalizedAuthority) ||
    !hasExactKeys(normalizedAuthority, authorityKeys)
  ) {
    return unavailable("authority-reader-unavailable", "action_check_provider_health");
  }
  const authority = authoritySchema.safeParse(normalizedAuthority);
  if (!authority.success) {
    return unavailable("authority-reader-unavailable", "action_check_provider_health");
  }

  if (!hasExactByokCapability(authority.data.capability, authority.data.selection)) {
    return authorityReaderUnavailable();
  }
  if (!hasExactCapabilityEvidence(authority.data.capabilityEvidence, authority.data.selection, authority.data.preparation)) {
    return authorityReaderUnavailable();
  }
  if (!hasExactEndpointPolicy(authority.data.endpointPolicy, authority.data.selection, authority.data.preparation)) {
    return authorityReaderUnavailable();
  }
  if (!hasMatchingSelection(authority.data.preparation, authority.data.selection)) {
    return authorityReaderUnavailable();
  }
  if (!hasCurrentPreparation(authority.data.preparation, authority.data.current, authority.data.selection, requestedUse)) {
    return authorityReaderUnavailable();
  }

  if (authority.data.credentialReference === undefined) {
    return unavailable("credential-reference-missing", "action_link_provider_credential");
  }
  if (!hasExactCredentialReference(authority.data.credentialReference, authority.data.selection, authority.data.preparation)) {
    return authorityReaderUnavailable();
  }
  if (isElapsedCredentialReference(authority.data.credentialReference)) {
    return unavailable("credential-reference-expired", "action_rotate_provider_credential");
  }
  if (authority.data.credentialReference.status === "revoked") {
    return unavailable("credential-reference-revoked", "action_relink_provider_credential");
  }
  if (authority.data.credentialReference.status === "expired") {
    return unavailable("credential-reference-expired", "action_rotate_provider_credential");
  }
  if (
    authority.data.credentialReference.status === "missing-binding" ||
    authority.data.credentialReference.status === "unverified" ||
    authority.data.credentialReference.status === "insufficient-scope"
  ) {
    return unavailable("credential-reference-unavailable", "action_check_provider_health");
  }

  return Object.freeze({
    kind: "approval-required",
    category: "provider-byte-transfer-required",
    safeActionId: "action_request_provider_byte_transfer",
    selection: Object.freeze({
      providerId: authority.data.selection.providerId,
      modelId: authority.data.selection.modelId,
      adapterVersion: authority.data.selection.adapterVersion,
      credentialRefId: authority.data.selection.credentialRefId,
      endpointPolicyId: authority.data.selection.endpointPolicyId,
      policyVersion: authority.data.selection.policyVersion
    })
  });
}

function hasExactByokCapability(
  capability: z.infer<typeof providerCapabilityDescriptorSchema>,
  selection: z.infer<typeof selectionSchema>
): boolean {
  return capability.providerId === selection.providerId &&
    capability.adapterVersion === selection.adapterVersion &&
    capability.backendKind === "openai-compatible-api" &&
    capability.approvalProfile === "remote-byte-transfer-gated" &&
    capability.costPolicy === "metered-api" &&
    capability.fakeSupport === false &&
    capability.modelFamilies.includes(selection.modelId) &&
    capability.credentialRequirements.some((requirement) =>
      requirement.credentialKind === "api-key-bearer" && requirement.required
    ) &&
    capability.diagnosticContract.includes("requires-byte-transfer-approval");
}

function hasExactCapabilityEvidence(
  evidence: z.infer<typeof capabilityEvidenceSchema>,
  selection: z.infer<typeof selectionSchema>,
  preparation: z.infer<typeof preparationSchema>
): boolean {
  return evidence.capabilityVersion === selection.capabilityVersion &&
    evidence.capabilityVersion === preparation.capabilityVersion &&
    evidence.capabilityHash === selection.capabilityHash &&
    evidence.capabilityHash === preparation.capabilityHash &&
    evidence.capabilitySourceEventId === selection.capabilitySourceEventId &&
    evidence.capabilitySourceEventId === preparation.capabilitySourceEventId &&
    evidence.capabilityRevision === selection.capabilityRevision &&
    evidence.capabilityRevision === preparation.capabilityRevision;
}

function hasExactCredentialReference(
  credentialReference: z.infer<typeof credentialReferenceSchema>,
  selection: z.infer<typeof selectionSchema>,
  preparation: z.infer<typeof preparationSchema>
): boolean {
  return credentialReference.credentialRefId === selection.credentialRefId &&
    credentialReference.credentialRefId === preparation.credentialRefId &&
    credentialReference.providerId === selection.providerId &&
    credentialReference.credentialKind === "api-key-bearer" &&
    credentialReference.policyVersion === selection.policyVersion &&
    credentialReference.policyVersion === preparation.policyVersion &&
    credentialReference.capabilityScopes.includes("model-inference") &&
    hasExactStringList(credentialReference.sourceEventIds, selection.credentialSourceEventIds) &&
    hasExactStringList(credentialReference.sourceEventIds, preparation.credentialSourceEventIds);
}

function hasExactEndpointPolicy(
  endpointPolicy: z.infer<typeof endpointPolicySchema>,
  selection: z.infer<typeof selectionSchema>,
  preparation: z.infer<typeof preparationSchema>
): boolean {
  return endpointPolicy.status === "approved" &&
    endpointPolicy.scope === "exact-provider-model" &&
    endpointPolicy.endpointPolicyId === selection.endpointPolicyId &&
    endpointPolicy.endpointPolicyId === preparation.endpointPolicyId &&
    endpointPolicy.providerId === selection.providerId &&
    endpointPolicy.modelId === selection.modelId &&
    endpointPolicy.adapterVersion === selection.adapterVersion;
}

function hasMatchingSelection(
  preparation: z.infer<typeof preparationSchema>,
  selection: z.infer<typeof selectionSchema>
): boolean {
  return preparation.providerId === selection.providerId &&
    preparation.modelId === selection.modelId &&
    preparation.adapterVersion === selection.adapterVersion &&
    preparation.credentialRefId === selection.credentialRefId &&
    preparation.endpointPolicyId === selection.endpointPolicyId &&
    preparation.workspaceId === selection.workspaceId &&
    preparation.taskId === selection.taskId &&
    preparation.attemptId === selection.attemptId &&
    preparation.policyVersion === selection.policyVersion;
}

function hasCurrentPreparation(
  preparation: z.infer<typeof preparationSchema>,
  current: z.infer<typeof requestedUseSchema>,
  selection: z.infer<typeof selectionSchema>,
  requestedUse: ByokProviderRequestedUse
): boolean {
  return preparation.workspaceId === current.workspaceId &&
    current.workspaceId === selection.workspaceId &&
    current.workspaceId === requestedUse.workspaceId &&
    preparation.mountInstanceId === current.mountInstanceId &&
    current.mountInstanceId === requestedUse.mountInstanceId &&
    preparation.taskId === current.taskId &&
    current.taskId === selection.taskId &&
    current.taskId === requestedUse.taskId &&
    preparation.attemptId === current.attemptId &&
    current.attemptId === selection.attemptId &&
    current.attemptId === requestedUse.attemptId &&
    preparation.runId === current.runId &&
    current.runId === requestedUse.runId &&
    preparation.promptArtifactHash === current.promptArtifactHash &&
    current.promptArtifactHash === requestedUse.promptArtifactHash &&
    preparation.approvalPreviewHash === current.approvalPreviewHash &&
    current.approvalPreviewHash === selection.approvalPreviewHash &&
    current.approvalPreviewHash === requestedUse.approvalPreviewHash &&
    preparation.policyVersion === current.policyVersion &&
    current.policyVersion === selection.policyVersion &&
    current.policyVersion === requestedUse.policyVersion;
}

function isElapsedCredentialReference(credentialReference: z.infer<typeof credentialReferenceSchema>): boolean {
  return credentialReference.expiresAt !== undefined && Date.parse(credentialReference.expiresAt) <= Date.now();
}

function hasExactStringList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isTrustedAuthorityReader(value: unknown): value is ByokProviderAuthorityReader {
  return typeof value === "object" && value !== null && authorityReaderBrands.has(value);
}

function hasExactKeys(value: object, expectedKeys: ReadonlySet<string>): boolean {
  const keys = Object.keys(value);
  return keys.length === expectedKeys.size && keys.every((key) => expectedKeys.has(key));
}

function normalizePlainOwnData(value: unknown): Record<string, unknown> | readonly unknown[] | string | number | boolean | null | undefined {
  try {
    return normalize(value);
  } catch {
    return undefined;
  }
}

function normalize(value: unknown): Record<string, unknown> | readonly unknown[] | string | number | boolean | null | undefined {
  if (
    value === undefined ||
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      throw new Error("unsafe array");
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (
      lengthDescriptor === undefined ||
      !("value" in lengthDescriptor) ||
      typeof lengthDescriptor.value !== "number" ||
      !Number.isSafeInteger(lengthDescriptor.value) ||
      lengthDescriptor.value < 0
    ) {
      throw new Error("unsafe array length");
    }
    const names = Object.getOwnPropertyNames(descriptors);
    if (names.some((name) => name !== "length" && !/^(?:0|[1-9][0-9]*)$/.test(name))) {
      throw new Error("unsafe array property");
    }
    if (Reflect.ownKeys(descriptors).some((key) => typeof key === "symbol")) {
      throw new Error("unsafe array symbol");
    }
    const normalized: unknown[] = [];
    for (let index = 0; index < lengthDescriptor.value; index += 1) {
      const descriptor = descriptors[String(index)];
      if (descriptor === undefined || !("value" in descriptor) || descriptor.get !== undefined || descriptor.set !== undefined) {
        throw new Error("unsafe array entry");
      }
      normalized.push(normalize(descriptor.value));
    }
    return Object.freeze(normalized);
  }
  if (!isPlainRecord(value)) {
    throw new Error("unsafe object");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key === "symbol")) {
    throw new Error("unsafe object symbol");
  }
  const normalized: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!("value" in descriptor) || descriptor.get !== undefined || descriptor.set !== undefined) {
      throw new Error("unsafe object accessor");
    }
    Object.defineProperty(normalized, key, {
      value: normalize(descriptor.value),
      enumerable: true,
      configurable: false,
      writable: false
    });
  }
  return Object.freeze(normalized);
}

function isPlainRecord(value: object): value is Record<string, unknown> {
  return Object.getPrototypeOf(value) === Object.prototype;
}

function unavailable(
  category: UnavailableResult["category"],
  safeActionId: UnavailableResult["safeActionId"]
): UnavailableResult {
  return Object.freeze({ kind: "unavailable", category, safeActionId });
}

function authorityReaderUnavailable(): UnavailableResult {
  return unavailable("authority-reader-unavailable", "action_check_provider_health");
}

function blocked(
  category: BlockedResult["category"],
  safeActionId: BlockedResult["safeActionId"]
): BlockedResult {
  return Object.freeze({ kind: "blocked", category, safeActionId });
}

function isUrlShaped(value: string): boolean {
  return /(?:^|[^a-z0-9])https?:\/\//i.test(value);
}
