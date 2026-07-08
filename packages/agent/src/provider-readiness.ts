import { z } from "zod";
import {
  credentialKindSchema,
  type CredentialKind,
  type CredentialReference
} from "./credential-reference.js";
import {
  providerBackendKindSchema,
  type ProviderApprovalProfile,
  type ProviderCapabilityDescriptor,
  type ProviderCapabilityRegistry
} from "./provider-registry.js";
import { secretStoreHealthSchema, type SecretStore, type SecretStoreHealth } from "./secret-store.js";
import { isAgentSecretSafeText } from "./secret-safety.js";

const rawCredentialLocationPattern =
  /(?:^~|[./\\])[^ \n\r\t]*(?:auth|oauth|token|secret|credential|credentials|private[-_]?key)[^ \n\r\t]*/i;

function isProviderReadinessSecretSafeText(value: string): boolean {
  return isAgentSecretSafeText(value) && !rawCredentialLocationPattern.test(value);
}

const providerIdSchema = z.string()
  .regex(/^provider_[a-zA-Z0-9_-]+$/)
  .refine(isProviderReadinessSecretSafeText, { message: "providerId must be secret-safe" });

const credentialRefIdSchema = z.string()
  .regex(/^agent_credref_[a-zA-Z0-9_-]+$/)
  .refine(isProviderReadinessSecretSafeText, { message: "credentialRefId must be secret-safe" });

const safeTextSchema = z.string().min(1).refine(isProviderReadinessSecretSafeText, {
  message: "must be secret-safe"
});

const fallbackGeneratedAt = "1970-01-01T00:00:00.000Z";
const strictDateTimeSchema = z.string().datetime();

const safeActionIdSchema = z.string()
  .regex(/^action_[a-z0-9_]+$/)
  .refine(isProviderReadinessSecretSafeText, { message: "safeActionId must be secret-safe" });

const safeRelatedIdSchema = z.string()
  .regex(/^(provider|agent_credref|evt|diag|policy|action)_[a-zA-Z0-9_-]+$/)
  .refine(isProviderReadinessSecretSafeText, { message: "relatedSafeId must be secret-safe" });

export const providerReadinessStateSchema = z.enum([
  "ready",
  "works-locally",
  "needs-api-key",
  "needs-workload-identity",
  "needs-oauth-sign-in",
  "needs-device-sign-in",
  "needs-mtls-binding",
  "credential-binding-missing",
  "credential-expired",
  "credential-revoked",
  "insufficient-scope",
  "provider-unavailable",
  "harness-not-installed",
  "local-model-not-running",
  "not-available-for-task",
  "policy-blocked",
  "requires-byte-transfer-approval",
  "health-unverified"
]);

export const providerReadinessApprovalClassSchema = z.enum([
  "none",
  "provider-byte-transfer",
  "harness-workspace",
  "policy"
]);

export const providerSetupCardSchema = z.object({
  providerId: providerIdSchema,
  label: safeTextSchema,
  backendKind: providerBackendKindSchema,
  capabilitySummary: z.array(safeTextSchema),
  credentialKindSummary: z.array(credentialKindSchema).min(1),
  state: providerReadinessStateSchema,
  requiredApprovalClass: providerReadinessApprovalClassSchema,
  safeActionIds: z.array(safeActionIdSchema)
}).strict();

export const providerReadinessDiagnosticSchema = z.object({
  diagnosticId: z.string()
    .regex(/^diag_[a-z0-9_]+$/)
    .refine(isProviderReadinessSecretSafeText, { message: "diagnosticId must be secret-safe" }),
  providerId: providerIdSchema,
  credentialRefId: credentialRefIdSchema.optional(),
  category: providerReadinessStateSchema,
  severity: z.enum(["info", "warning", "error"]),
  retryability: z.enum(["retryable", "after-operator-action", "not-retryable"]),
  relatedSafeIds: z.array(safeRelatedIdSchema),
  safeRepairActionIds: z.array(safeActionIdSchema),
  checkedAt: z.string().datetime()
}).strict();

export const providerReadinessDtoSchema = z.object({
  schemaVersion: z.literal("agent-provider-readiness.v1"),
  generatedAt: z.string().datetime(),
  cards: z.array(providerSetupCardSchema),
  diagnostics: z.array(providerReadinessDiagnosticSchema)
}).strict();

export type ProviderReadinessState = z.infer<typeof providerReadinessStateSchema>;
export type ProviderReadinessApprovalClass = z.infer<typeof providerReadinessApprovalClassSchema>;
export type ProviderSetupCard = z.infer<typeof providerSetupCardSchema>;
export type ProviderReadinessDiagnostic = z.infer<typeof providerReadinessDiagnosticSchema>;
export type ProviderReadinessDto = z.infer<typeof providerReadinessDtoSchema>;

const allowedSchemaLiteralText = new Set<string>([
  "agent-provider-readiness.v1",
  ...credentialKindSchema.options,
  ...providerReadinessStateSchema.options,
  ...providerReadinessApprovalClassSchema.options,
  ...providerBackendKindSchema.options
]);

export interface BuildProviderReadinessInput {
  readonly registry: ProviderCapabilityRegistry;
  readonly credentialReferences: readonly CredentialReference[];
  readonly secretStore: SecretStore;
  readonly now: () => string;
}

interface ProviderReadinessEvaluation {
  readonly state: ProviderReadinessState;
  readonly credentialRefId?: string;
}

export async function buildProviderReadiness(
  input: BuildProviderReadinessInput
): Promise<ProviderReadinessDto> {
  const rawGeneratedAt = input.now();
  const generatedAt = dtoTimestampFor(rawGeneratedAt);
  const credentialReferencesByProviderId = groupCredentialReferencesByProviderId(input.credentialReferences);
  const cards: ProviderSetupCard[] = [];
  const diagnostics: ProviderReadinessDiagnostic[] = [];

  for (const descriptor of input.registry.list()) {
    const credentialReferences = credentialReferencesByProviderId.get(descriptor.providerId) ?? [];
    const evaluation = await evaluateProviderReadiness(
      descriptor,
      credentialReferences,
      input.secretStore,
      rawGeneratedAt
    );
    const safeActionIds = safeActionIdsForState(evaluation.state);
    const card = providerSetupCardSchema.parse({
      providerId: descriptor.providerId,
      label: descriptor.label,
      backendKind: descriptor.backendKind,
      capabilitySummary: capabilitySummaryFor(descriptor),
      credentialKindSummary: credentialKindSummaryFor(descriptor),
      state: evaluation.state,
      requiredApprovalClass: requiredApprovalClassFor(descriptor.approvalProfile),
      safeActionIds
    });
    cards.push(freezeProviderSetupCard(card));

    const diagnostic = diagnosticForEvaluation({
      descriptor,
      evaluation,
      generatedAt,
      safeActionIds
    });
    if (diagnostic !== undefined) {
      diagnostics.push(freezeProviderReadinessDiagnostic(diagnostic));
    }
  }

  const dto = providerReadinessDtoSchema.parse({
    schemaVersion: "agent-provider-readiness.v1",
    generatedAt,
    cards,
    diagnostics
  });
  assertProviderReadinessDtoSecretSafe(dto);

  return freezeProviderReadinessDto(dto);
}

function groupCredentialReferencesByProviderId(
  credentialReferences: readonly CredentialReference[]
): ReadonlyMap<string, readonly CredentialReference[]> {
  const grouped = new Map<string, CredentialReference[]>();
  for (const credentialReference of credentialReferences) {
    const refs = grouped.get(credentialReference.providerId) ?? [];
    refs.push(credentialReference);
    grouped.set(credentialReference.providerId, refs);
  }

  for (const [providerId, refs] of grouped.entries()) {
    grouped.set(providerId, refs.sort(compareCredentialReferenceIds));
  }

  return grouped;
}

async function evaluateProviderReadiness(
  descriptor: ProviderCapabilityDescriptor,
  credentialReferences: readonly CredentialReference[],
  secretStore: SecretStore,
  checkedAt: string
): Promise<ProviderReadinessEvaluation> {
  if (requiresOnlyLocalNoSecret(descriptor)) {
    return { state: "works-locally" };
  }

  const readyCredentialRefIds: string[] = [];
  const requiredCredentialKinds = credentialRequirementKinds(descriptor, true);
  const alternativeCredentialKinds = credentialRequirementKinds(descriptor, false);
  for (const credentialKind of requiredCredentialKinds) {
    const credentialEvaluation = await evaluateCredentialKindReadiness(
      credentialKind,
      credentialReferences,
      secretStore,
      checkedAt
    );
    if (credentialEvaluation.state !== "ready") {
      return credentialEvaluation;
    }
    if (credentialEvaluation.credentialRefId !== undefined) {
      readyCredentialRefIds.push(credentialEvaluation.credentialRefId);
    }
  }

  if (alternativeCredentialKinds.length > 0) {
    const alternativeEvaluation = await evaluateAlternativeCredentialReadiness(
      alternativeCredentialKinds,
      credentialReferences,
      secretStore,
      checkedAt
    );
    if (alternativeEvaluation.state !== "ready") {
      return alternativeEvaluation;
    }
    if (alternativeEvaluation.credentialRefId !== undefined) {
      readyCredentialRefIds.push(alternativeEvaluation.credentialRefId);
    }
  }

  if (
    descriptor.approvalProfile === "remote-byte-transfer-gated" ||
    descriptor.approvalProfile === "harness-workspace-gated"
  ) {
    return evaluationWithOptionalCredentialRef(
      "requires-byte-transfer-approval",
      readyCredentialRefIds[0]
    );
  }

  return evaluationWithOptionalCredentialRef("ready", readyCredentialRefIds[0]);
}

function evaluationWithOptionalCredentialRef(
  state: ProviderReadinessState,
  credentialRefId: string | undefined
): ProviderReadinessEvaluation {
  return credentialRefId === undefined ? { state } : { state, credentialRefId };
}

function credentialRequirementKinds(
  descriptor: ProviderCapabilityDescriptor,
  required: boolean
): readonly CredentialKind[] {
  return Object.freeze(uniqueSorted(
    descriptor.credentialRequirements
      .filter((requirement) => requirement.required === required)
      .map((requirement) => requirement.credentialKind)
      .filter((credentialKind) => credentialKind !== "local-no-secret")
  ) as CredentialKind[]);
}

async function evaluateAlternativeCredentialReadiness(
  credentialKinds: readonly CredentialKind[],
  credentialReferences: readonly CredentialReference[],
  secretStore: SecretStore,
  checkedAt: string
): Promise<ProviderReadinessEvaluation> {
  const blockedEvaluations: ProviderReadinessEvaluation[] = [];
  for (const credentialKind of credentialKinds) {
    const credentialEvaluation = await evaluateCredentialKindReadiness(
      credentialKind,
      credentialReferences,
      secretStore,
      checkedAt
    );
    if (credentialEvaluation.state === "ready") {
      return credentialEvaluation;
    }
    blockedEvaluations.push(credentialEvaluation);
  }

  return blockedEvaluations.find((evaluation) => evaluation.credentialRefId !== undefined) ??
    blockedEvaluations[0] ??
    { state: "health-unverified" };
}

async function evaluateCredentialKindReadiness(
  credentialKind: CredentialKind,
  credentialReferences: readonly CredentialReference[],
  secretStore: SecretStore,
  checkedAt: string
): Promise<ProviderReadinessEvaluation> {
  const matchingCredentialReferences = credentialReferences
    .filter((ref) => ref.credentialKind === credentialKind);
  if (matchingCredentialReferences.length === 0) {
    return { state: missingCredentialStateFor(credentialKind) };
  }

  const blockedEvaluations: ProviderReadinessEvaluation[] = [];
  for (const credentialReference of matchingCredentialReferences) {
    const credentialEvaluation = await evaluateCredentialReferenceReadiness(
      credentialKind,
      credentialReference,
      secretStore,
      checkedAt
    );
    if (credentialEvaluation.state === "ready") {
      return credentialEvaluation;
    }
    blockedEvaluations.push(credentialEvaluation);
  }

  return blockedEvaluations[0] ?? { state: missingCredentialStateFor(credentialKind) };
}

async function evaluateCredentialReferenceReadiness(
  credentialKind: CredentialKind,
  credentialReference: CredentialReference,
  secretStore: SecretStore,
  checkedAt: string
): Promise<ProviderReadinessEvaluation> {
  const referenceState = stateForCredentialReference(credentialReference, checkedAt);
  if (referenceState !== undefined) {
    return {
      state: referenceState,
      credentialRefId: credentialReference.credentialRefId
    };
  }

  const health = await readSecretStoreHealth(secretStore, credentialReference.credentialRefId);
  if (health === undefined) {
    return {
      state: "health-unverified",
      credentialRefId: credentialReference.credentialRefId
    };
  }

  const healthState = stateForSecretStoreHealth(credentialKind, health);
  if (healthState !== "ready") {
    return {
      state: healthState,
      credentialRefId: credentialReference.credentialRefId
    };
  }

  return {
    state: "ready",
    credentialRefId: credentialReference.credentialRefId
  };
}

async function readSecretStoreHealth(
  secretStore: SecretStore,
  credentialRefId: string
): Promise<SecretStoreHealth | undefined> {
  try {
    const health = secretStoreHealthSchema.safeParse(await secretStore.health(credentialRefId));
    if (!health.success || health.data.credentialRefId !== credentialRefId) {
      return undefined;
    }
    return health.data;
  } catch {
    return undefined;
  }
}

function requiresOnlyLocalNoSecret(descriptor: ProviderCapabilityDescriptor): boolean {
  return descriptor.approvalProfile === "local-only" &&
    descriptor.credentialRequirements.every((requirement) => requirement.credentialKind === "local-no-secret");
}

function stateForCredentialReference(
  credentialReference: CredentialReference,
  checkedAt: string
): ProviderReadinessState | undefined {
  if (credentialReference.status === "expired") {
    return "credential-expired";
  }
  if (credentialReference.status === "revoked") {
    return "credential-revoked";
  }
  if (credentialReference.status === "insufficient-scope") {
    return "insufficient-scope";
  }
  if (credentialReference.status === "missing-binding") {
    return missingCredentialStateFor(credentialReference.credentialKind);
  }
  if (credentialReference.status === "unverified") {
    return "health-unverified";
  }
  if (credentialReferenceExpiredAtOrBefore(credentialReference, checkedAt)) {
    return "credential-expired";
  }
  return undefined;
}

function credentialReferenceExpiredAtOrBefore(
  credentialReference: CredentialReference,
  checkedAt: string
): boolean {
  const checkedAtTime = parseStrictDateTime(checkedAt);
  if (checkedAtTime === undefined) {
    return true;
  }

  if (credentialReference.expiresAt === undefined) {
    return false;
  }

  const expiresAtTime = parseStrictDateTime(credentialReference.expiresAt);
  if (expiresAtTime === undefined) {
    return true;
  }

  return expiresAtTime <= checkedAtTime;
}

function parseStrictDateTime(value: string): number | undefined {
  if (!strictDateTimeSchema.safeParse(value).success) {
    return undefined;
  }
  const time = Date.parse(value);
  return Number.isNaN(time) ? undefined : time;
}

function dtoTimestampFor(value: string): string {
  return strictDateTimeSchema.safeParse(value).success ? value : fallbackGeneratedAt;
}

function stateForSecretStoreHealth(
  credentialKind: CredentialKind,
  health: SecretStoreHealth
): ProviderReadinessState | "ready" {
  if (health.status === "healthy") {
    return "ready";
  }
  if (health.status === "missing-binding") {
    return missingCredentialStateFor(credentialKind);
  }
  if (health.status === "expired") {
    return "credential-expired";
  }
  if (health.status === "revoked") {
    return "credential-revoked";
  }
  return "health-unverified";
}

function missingCredentialStateFor(credentialKind: CredentialKind): ProviderReadinessState {
  if (credentialKind === "api-key-bearer") {
    return "needs-api-key";
  }
  if (credentialKind === "workload-identity-token") {
    return "needs-workload-identity";
  }
  if (credentialKind === "subscription-oauth") {
    return "needs-oauth-sign-in";
  }
  if (credentialKind === "device-code-oauth") {
    return "needs-device-sign-in";
  }
  if (credentialKind === "mtls-certificate") {
    return "needs-mtls-binding";
  }
  if (credentialKind === "enterprise-gateway") {
    return "provider-unavailable";
  }
  return "credential-binding-missing";
}

function requiredApprovalClassFor(
  approvalProfile: ProviderApprovalProfile
): ProviderReadinessApprovalClass {
  if (approvalProfile === "remote-byte-transfer-gated") {
    return "provider-byte-transfer";
  }
  if (approvalProfile === "harness-workspace-gated") {
    return "harness-workspace";
  }
  return "none";
}

function capabilitySummaryFor(descriptor: ProviderCapabilityDescriptor): readonly string[] {
  const structuredOutput =
    descriptor.structuredOutputSupport === "schema-strict" ? "schema output" : descriptor.structuredOutputSupport;
  const toolSupport = descriptor.toolSupport === "none" ? "no tools" : `tools ${descriptor.toolSupport}`;
  return Object.freeze(uniqueSorted([...descriptor.modalities, structuredOutput, toolSupport]));
}

function credentialKindSummaryFor(descriptor: ProviderCapabilityDescriptor): readonly CredentialKind[] {
  return Object.freeze(uniqueSorted(
    descriptor.credentialRequirements.map((requirement) => requirement.credentialKind)
  ) as CredentialKind[]);
}

function safeActionIdsForState(state: ProviderReadinessState): readonly string[] {
  const byState: Record<ProviderReadinessState, readonly string[]> = {
    ready: [],
    "works-locally": [],
    "needs-api-key": ["action_link_provider_credential"],
    "needs-workload-identity": ["action_link_provider_credential"],
    "needs-oauth-sign-in": ["action_open_oauth_sign_in"],
    "needs-device-sign-in": ["action_open_device_sign_in"],
    "needs-mtls-binding": ["action_link_provider_credential"],
    "credential-binding-missing": ["action_relink_provider_credential"],
    "credential-expired": ["action_rotate_provider_credential"],
    "credential-revoked": ["action_relink_provider_credential"],
    "insufficient-scope": ["action_review_provider_scope"],
    "provider-unavailable": ["action_check_provider_health"],
    "harness-not-installed": ["action_install_provider_harness"],
    "local-model-not-running": ["action_start_local_model"],
    "not-available-for-task": ["action_choose_provider"],
    "policy-blocked": ["action_review_provider_policy"],
    "requires-byte-transfer-approval": ["action_request_provider_byte_transfer_approval"],
    "health-unverified": ["action_check_provider_health"]
  };

  return Object.freeze([...byState[state]]);
}

function diagnosticForEvaluation(input: {
  readonly descriptor: ProviderCapabilityDescriptor;
  readonly evaluation: ProviderReadinessEvaluation;
  readonly generatedAt: string;
  readonly safeActionIds: readonly string[];
}): ProviderReadinessDiagnostic | undefined {
  if (input.evaluation.state === "ready" || input.evaluation.state === "works-locally") {
    return undefined;
  }

  const relatedSafeIds = [
    input.descriptor.providerId,
    ...(input.evaluation.credentialRefId === undefined ? [] : [input.evaluation.credentialRefId])
  ];

  return providerReadinessDiagnosticSchema.parse({
    diagnosticId: diagnosticIdFor(input.descriptor.providerId, input.evaluation.state),
    providerId: input.descriptor.providerId,
    ...(input.evaluation.credentialRefId === undefined ? {} : { credentialRefId: input.evaluation.credentialRefId }),
    category: input.evaluation.state,
    severity: severityForState(input.evaluation.state),
    retryability: retryabilityForState(input.evaluation.state),
    relatedSafeIds,
    safeRepairActionIds: input.safeActionIds,
    checkedAt: input.generatedAt
  });
}

function diagnosticIdFor(providerId: string, state: ProviderReadinessState): string {
  return `diag_${diagnosticIdComponentFor(providerId.replace(/^provider_/i, ""))}_${diagnosticIdComponentFor(state)}`;
}

function diagnosticIdComponentFor(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "unknown";
}

function severityForState(state: ProviderReadinessState): ProviderReadinessDiagnostic["severity"] {
  if (state === "requires-byte-transfer-approval" || state === "health-unverified") {
    return "info";
  }
  if (state === "policy-blocked" || state === "credential-revoked" || state === "insufficient-scope") {
    return "error";
  }
  return "warning";
}

function retryabilityForState(state: ProviderReadinessState): ProviderReadinessDiagnostic["retryability"] {
  if (state === "policy-blocked" || state === "credential-revoked" || state === "not-available-for-task") {
    return "not-retryable";
  }
  if (state === "provider-unavailable" || state === "local-model-not-running") {
    return "retryable";
  }
  return "after-operator-action";
}

function freezeProviderReadinessDto(dto: ProviderReadinessDto): ProviderReadinessDto {
  return Object.freeze({
    ...dto,
    cards: Object.freeze(dto.cards.map(freezeProviderSetupCard)),
    diagnostics: Object.freeze(dto.diagnostics.map(freezeProviderReadinessDiagnostic))
  }) as ProviderReadinessDto;
}

function freezeProviderSetupCard(card: ProviderSetupCard): ProviderSetupCard {
  return Object.freeze({
    ...card,
    capabilitySummary: Object.freeze([...card.capabilitySummary]),
    credentialKindSummary: Object.freeze([...card.credentialKindSummary]),
    safeActionIds: Object.freeze([...card.safeActionIds])
  }) as ProviderSetupCard;
}

function freezeProviderReadinessDiagnostic(
  diagnostic: ProviderReadinessDiagnostic
): ProviderReadinessDiagnostic {
  return Object.freeze({
    ...diagnostic,
    relatedSafeIds: Object.freeze([...diagnostic.relatedSafeIds]),
    safeRepairActionIds: Object.freeze([...diagnostic.safeRepairActionIds])
  }) as ProviderReadinessDiagnostic;
}

function assertProviderReadinessDtoSecretSafe(dto: ProviderReadinessDto): void {
  assertSecretSafeStructure(dto, "providerReadiness");
}

function assertSecretSafeStructure(value: unknown, path: string): void {
  if (typeof value === "string") {
    assertProviderReadinessSecretSafeText(value, path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSecretSafeStructure(item, `${path}.${index}`));
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      assertProviderReadinessSecretSafeText(key, `${path}.${key}`);
      assertSecretSafeStructure(nested, `${path}.${key}`);
    }
  }
}

function assertProviderReadinessSecretSafeText(value: string, label: string): void {
  if (allowedSchemaLiteralText.has(value)) {
    return;
  }
  if (!isProviderReadinessSecretSafeText(value)) {
    throw new Error(`${label} must be secret-safe`);
  }
}

function compareCredentialReferenceIds(left: CredentialReference, right: CredentialReference): number {
  if (left.credentialRefId < right.credentialRefId) {
    return -1;
  }
  if (left.credentialRefId > right.credentialRefId) {
    return 1;
  }
  return 0;
}

function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort();
}
