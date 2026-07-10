import { z } from "zod";
import { contextPackRefSchema, type ContextPackRef } from "./context-packs.js";
import type { AgentDomainToolFamily } from "./domain-execution-descriptors.js";
import { assertAgentSecretSafeText } from "./secret-safety.js";
import type { AgentToolApprovalClass } from "./projection-types.js";
import {
  type PromptArtifactTemplateRegistration,
  type PromptArtifactTemplateRegistrySnapshot
} from "./prompt-artifacts.js";
import {
  providerReadinessDtoSchema,
  providerSetupCardSchema,
  type ProviderReadinessDto,
  type ProviderReadinessState,
  type ProviderSetupCard
} from "./provider-readiness.js";
import type { AgentSpecialistRunType } from "./specialists.js";
import { specialistWorkflowDescriptors, type SpecialistWorkflowDescriptor } from "./specialist-workflows.js";

export type SpecialistWorkflowReadinessStatus = "blocked" | "waiting-for-approval" | "context-ready";

export type SpecialistWorkflowReadinessCategory =
  | "blocked-prerequisite"
  | "blocked-provenance"
  | "projection-lag"
  | "blocked-lock"
  | "approval-required"
  | "context-ready";

export interface SpecialistReadinessActiveLock {
  readonly lockId: string;
  readonly category: string;
  readonly safeSummary?: string;
}

export interface SpecialistProviderReadinessBlocker {
  readonly providerId: string;
  readonly state: ProviderReadinessState;
  readonly requiredApprovalClass: "none" | "provider-byte-transfer" | "harness-workspace" | "policy";
  readonly safeActionIds: readonly string[];
}

export interface ProjectSpecialistWorkflowReadinessInput {
  readonly runType: AgentSpecialistRunType;
  readonly descriptor: SpecialistWorkflowDescriptor;
  readonly availableContracts: readonly string[];
  readonly contextPackRefs: readonly ContextPackRef[];
  readonly promptTemplateRegistrations:
    | readonly PromptArtifactTemplateRegistration[]
    | PromptArtifactTemplateRegistrySnapshot;
  readonly providerReadiness: ProviderReadinessDto | { readonly cards: readonly ProviderSetupCard[] };
  readonly availableDomainAdapterFamilies: readonly AgentDomainToolFamily[];
  readonly currentProjectionHighWaterMarks: Readonly<Record<string, number>>;
  readonly activeLocks: readonly SpecialistReadinessActiveLock[];
  readonly satisfiedApprovalClasses: readonly AgentToolApprovalClass[];
}

export interface SpecialistWorkflowReadinessDto {
  readonly schemaVersion: "agent-specialist-workflow-readiness.v1";
  readonly runType: AgentSpecialistRunType;
  readonly residentAgentId: "agent_default";
  readonly status: SpecialistWorkflowReadinessStatus;
  readonly category: SpecialistWorkflowReadinessCategory;
  readonly contextReady: boolean;
  readonly executionReady: false;
  readonly missingContractIds: readonly string[];
  readonly missingContextPackIds: readonly string[];
  readonly staleContextPackIds: readonly string[];
  readonly missingProjectionHighWaterMarkIds: readonly string[];
  readonly missingProvenanceContextPackIds: readonly string[];
  readonly missingPromptTemplateIds: readonly string[];
  readonly missingProviderStates: readonly SpecialistProviderReadinessBlocker[];
  readonly missingAdapterFamilies: readonly AgentDomainToolFamily[];
  readonly activeLockIds: readonly string[];
  readonly missingApprovalClasses: readonly AgentToolApprovalClass[];
  readonly nextSafeActions: readonly string[];
}

const schemaVersion = "agent-specialist-workflow-readiness.v1";
const residentAgentId = "agent_default";
const readyProviderStates = new Set<ProviderReadinessState>(["ready", "works-locally"]);
const approvalClassValues = [
  "none",
  "human-review",
  "provider-byte-transfer",
  "external-message-send",
  "export-or-publication",
  "destructive-or-repair",
  "legal-escalation",
  "ledger-review"
] as const;
const adapterFamilyValues = [
  "provider-byte-transfer",
  "prr-correspondence",
  "accepted-graph-review",
  "contradiction-claim-review",
  "export-report",
  "destructive-repair",
  "legacy-staging"
] as const satisfies readonly AgentDomainToolFamily[];
const providerApprovalClassValues = ["none", "provider-byte-transfer", "harness-workspace", "policy"] as const;
const providerReadinessStateValues = providerReadinessDtoSchema.shape.cards.element.shape.state.options;
const descriptorRegisteredRunTypeSet = new Set<string>(
  specialistWorkflowDescriptors.map((descriptor) => descriptor.runType)
);
const executableCommandTextPattern =
  /(?:^|\s)(?:npm|npx|pnpm|yarn|bun|node|tsx|ts-node|curl|wget|bash|sh|zsh|fish|python|python3|ruby|perl|git|gh|docker|kubectl|ssh|scp|rsync)(?:\s|$)|(?:^|\s)(?:sudo|env)\s+[a-z0-9_-]+|[`]|(?:\$\()|&&|\|\||(?:^|\s);|--header\b/i;

const secretSafeTextSchema = (label: string) => z.string().min(1).superRefine((value, ctx) => {
  try {
    assertAgentSecretSafeText(value, label);
  } catch (error) {
    ctx.addIssue({
      code: "custom",
      message: error instanceof Error ? error.message : `${label} must be secret-safe`
    });
  }
  if (executableCommandTextPattern.test(value)) {
    ctx.addIssue({
      code: "custom",
      message: `${label} must not contain executable command text`
    });
  }
});

const specialistProviderReadinessBlockerSchema = z.object({
  providerId: secretSafeTextSchema("provider readiness blocker providerId"),
  state: z.enum(providerReadinessStateValues),
  requiredApprovalClass: z.enum(providerApprovalClassValues),
  safeActionIds: z.array(secretSafeTextSchema("provider readiness blocker safeActionId"))
}).strict();

const approvedRunTypeSchema = secretSafeTextSchema("specialist readiness runType")
  .refine((value) => descriptorRegisteredRunTypeSet.has(value), {
    message: "runType must be a registered MVP specialist workflow run type"
  })
  .transform((value) => value as AgentSpecialistRunType);

export const agentSpecialistWorkflowReadinessDtoSchema = z.object({
  schemaVersion: z.literal(schemaVersion),
  runType: approvedRunTypeSchema,
  residentAgentId: z.literal(residentAgentId),
  status: z.enum(["blocked", "waiting-for-approval", "context-ready"]),
  category: z.enum([
    "blocked-prerequisite",
    "blocked-provenance",
    "projection-lag",
    "blocked-lock",
    "approval-required",
    "context-ready"
  ]),
  contextReady: z.boolean(),
  executionReady: z.literal(false),
  missingContractIds: z.array(secretSafeTextSchema("missing contract id")),
  missingContextPackIds: z.array(secretSafeTextSchema("missing context pack id")),
  staleContextPackIds: z.array(secretSafeTextSchema("stale context pack id")),
  missingProjectionHighWaterMarkIds: z.array(secretSafeTextSchema("missing projection high-water mark id")),
  missingProvenanceContextPackIds: z.array(secretSafeTextSchema("missing provenance context pack id")),
  missingPromptTemplateIds: z.array(secretSafeTextSchema("missing prompt template id")),
  missingProviderStates: z.array(specialistProviderReadinessBlockerSchema),
  missingAdapterFamilies: z.array(z.enum(adapterFamilyValues)),
  activeLockIds: z.array(secretSafeTextSchema("active lock id")),
  missingApprovalClasses: z.array(z.enum(approvalClassValues)),
  nextSafeActions: z.array(secretSafeTextSchema("specialist readiness next safe action"))
}).strict().superRefine((value, ctx) => {
  const prerequisiteBlocked = value.missingContractIds.length > 0 ||
    value.missingPromptTemplateIds.length > 0 ||
    value.missingProviderStates.length > 0 ||
    value.missingAdapterFamilies.length > 0;
  const provenanceBlocked = value.missingContextPackIds.length > 0 ||
    value.missingProvenanceContextPackIds.length > 0;
  const projectionBlocked = value.staleContextPackIds.length > 0 ||
    value.missingProjectionHighWaterMarkIds.length > 0;
  const lockBlocked = value.activeLockIds.length > 0;
  const approvalBlocked = value.missingApprovalClasses.length > 0;
  const anyBlocker = prerequisiteBlocked || provenanceBlocked || projectionBlocked || lockBlocked || approvalBlocked;

  if (value.status === "context-ready") {
    if (!value.contextReady) {
      addReadinessInvariantIssue(ctx, ["contextReady"], "contextReady must be true when status is context-ready.");
    }
    if (value.category !== "context-ready") {
      addReadinessInvariantIssue(ctx, ["category"], "category must be context-ready when status is context-ready.");
    }
    if (anyBlocker) {
      addReadinessInvariantIssue(ctx, [], "context-ready readiness must not include blocker arrays.");
    }
    return;
  }

  if (value.contextReady) {
    addReadinessInvariantIssue(ctx, ["contextReady"], "contextReady must be false unless status is context-ready.");
  }

  if (value.status === "waiting-for-approval") {
    if (value.category !== "approval-required") {
      addReadinessInvariantIssue(ctx, ["category"], "waiting-for-approval readiness must use approval-required category.");
    }
    if (!approvalBlocked) {
      addReadinessInvariantIssue(
        ctx,
        ["missingApprovalClasses"],
        "waiting-for-approval readiness requires at least one missing approval class."
      );
    }
    if (prerequisiteBlocked || provenanceBlocked || projectionBlocked || lockBlocked) {
      addReadinessInvariantIssue(ctx, [], "waiting-for-approval readiness must not include non-approval blockers.");
    }
    return;
  }

  if (value.category === "context-ready" || value.category === "approval-required") {
    addReadinessInvariantIssue(ctx, ["category"], "blocked readiness must use a blocked category.");
  }
  if (value.category === "blocked-prerequisite" && !prerequisiteBlocked) {
    addReadinessInvariantIssue(ctx, ["category"], "blocked-prerequisite requires a prerequisite blocker.");
  }
  if (value.category === "blocked-provenance" && !provenanceBlocked) {
    addReadinessInvariantIssue(ctx, ["category"], "blocked-provenance requires a provenance blocker.");
  }
  if (value.category === "projection-lag" && !projectionBlocked) {
    addReadinessInvariantIssue(ctx, ["category"], "projection-lag requires a projection freshness blocker.");
  }
  if (value.category === "blocked-lock" && !lockBlocked) {
    addReadinessInvariantIssue(ctx, ["category"], "blocked-lock requires an active lock blocker.");
  }
});

export function projectSpecialistWorkflowReadiness(
  input: ProjectSpecialistWorkflowReadinessInput
): SpecialistWorkflowReadinessDto {
  assertDescriptorMatchesRunType(input);

  const requiredContextPackIds = input.descriptor.contextPacks
    .filter((pack) => pack.required)
    .map((pack) => pack.contextPackId);
  const refsById = contextRefsById(input.contextPackRefs);
  const missingContextPackIds = requiredContextPackIds.filter((contextPackId) => !refsById.has(contextPackId));
  const missingProjectionHighWaterMarkIds = requiredContextPackIds.filter((contextPackId) => {
    const ref = refsById.get(contextPackId);
    return ref !== undefined && input.currentProjectionHighWaterMarks[contextPackId] === undefined;
  });
  const staleContextPackIds = requiredContextPackIds.filter((contextPackId) => {
    const ref = refsById.get(contextPackId);
    const current = input.currentProjectionHighWaterMarks[contextPackId];
    return ref !== undefined &&
      current !== undefined &&
      (ref.projectionHighWaterMark === undefined || ref.projectionHighWaterMark < current);
  });
  const missingProvenanceContextPackIds = requiredContextPackIds.filter((contextPackId) => {
    const ref = refsById.get(contextPackId);
    return ref !== undefined && ref.provenanceRefs.length === 0;
  });
  const contextPackRefsReady = missingContextPackIds.length === 0 &&
    missingProjectionHighWaterMarkIds.length === 0 &&
    staleContextPackIds.length === 0 &&
    missingProvenanceContextPackIds.length === 0;

  const missingContractIds = input.descriptor.prerequisiteContractIds
    .filter((contractId) => !input.availableContracts.includes(contractId));
  const missingPromptTemplateIds = hasPromptTemplateRegistration(input)
    ? []
    : [input.descriptor.promptTemplate.promptTemplateId];
  const providerState = providerReadinessBlockers(input);
  const requiredAdapterFamilies = requiredAdapterFamiliesFor(input.descriptor);
  const missingAdapterFamilies = requiredAdapterFamilies
    .filter((family) => !input.availableDomainAdapterFamilies.includes(family));
  const activeLockIds = input.activeLocks.map((lock) => assertSafeInputText(lock.lockId, "active lock id"));
  const missingApprovalClasses = missingProviderApprovalClasses(input, providerState);

  const { status, category } = statusFor({
    missingContractIds,
    missingContextPackIds,
    missingProjectionHighWaterMarkIds,
    staleContextPackIds,
    missingProvenanceContextPackIds,
    activeLockIds,
    missingPromptTemplateIds,
    providerState,
    missingAdapterFamilies,
    missingApprovalClasses
  });

  return parseSpecialistWorkflowReadinessDto({
    schemaVersion,
    runType: input.runType,
    residentAgentId,
    status,
    category,
    contextReady: status === "context-ready" && contextPackRefsReady,
    executionReady: false,
    missingContractIds,
    missingContextPackIds,
    staleContextPackIds,
    missingProjectionHighWaterMarkIds,
    missingProvenanceContextPackIds,
    missingPromptTemplateIds,
    missingProviderStates: providerState.filter((state) => state.state !== "requires-byte-transfer-approval"),
    missingAdapterFamilies,
    activeLockIds,
    missingApprovalClasses,
    nextSafeActions: nextSafeActionsFor({
      status,
      category,
      missingContractIds,
      missingContextPackIds,
      staleContextPackIds,
      missingProjectionHighWaterMarkIds,
      missingPromptTemplateIds,
      providerState,
      missingAdapterFamilies,
      activeLockIds,
      missingApprovalClasses
    })
  });
}

export function parseSpecialistWorkflowReadinessDto(value: unknown): SpecialistWorkflowReadinessDto {
  const parsed = agentSpecialistWorkflowReadinessDtoSchema.parse(value);

  return Object.freeze({
    schemaVersion: parsed.schemaVersion,
    runType: parsed.runType as AgentSpecialistRunType,
    residentAgentId: parsed.residentAgentId,
    status: parsed.status,
    category: parsed.category,
    contextReady: parsed.contextReady,
    executionReady: false,
    missingContractIds: Object.freeze([...parsed.missingContractIds]),
    missingContextPackIds: Object.freeze([...parsed.missingContextPackIds]),
    staleContextPackIds: Object.freeze([...parsed.staleContextPackIds]),
    missingProjectionHighWaterMarkIds: Object.freeze([...parsed.missingProjectionHighWaterMarkIds]),
    missingProvenanceContextPackIds: Object.freeze([...parsed.missingProvenanceContextPackIds]),
    missingPromptTemplateIds: Object.freeze([...parsed.missingPromptTemplateIds]),
    missingProviderStates: Object.freeze(parsed.missingProviderStates.map((state) => Object.freeze({
      providerId: state.providerId,
      state: state.state,
      requiredApprovalClass: state.requiredApprovalClass,
      safeActionIds: Object.freeze([...state.safeActionIds])
    }))),
    missingAdapterFamilies: Object.freeze([...parsed.missingAdapterFamilies]),
    activeLockIds: Object.freeze([...parsed.activeLockIds]),
    missingApprovalClasses: Object.freeze([...parsed.missingApprovalClasses]),
    nextSafeActions: Object.freeze([...parsed.nextSafeActions])
  }) as SpecialistWorkflowReadinessDto;
}

function addReadinessInvariantIssue(ctx: z.RefinementCtx, path: readonly string[], message: string): void {
  ctx.addIssue({
    code: "custom",
    path: [...path],
    message
  });
}

function assertDescriptorMatchesRunType(input: ProjectSpecialistWorkflowReadinessInput): void {
  if (input.descriptor.runType !== input.runType) {
    throw new Error("Specialist readiness descriptor must match the requested run type.");
  }
  if (input.descriptor.residentIdentity !== residentAgentId) {
    throw new Error("Specialist readiness only supports the resident agent identity.");
  }
  if (input.descriptor.executionEnabled !== false) {
    throw new Error("Specialist readiness must remain fail-closed for execution.");
  }
}

function contextRefsById(contextPackRefs: readonly ContextPackRef[]): ReadonlyMap<string, ContextPackRef> {
  const refs = new Map<string, ContextPackRef>();
  for (const refInput of contextPackRefs) {
    const ref = contextPackRefSchema.parse(refInput);
    if (!refs.has(ref.contextPackId)) {
      refs.set(ref.contextPackId, ref);
    }
  }
  return refs;
}

function hasPromptTemplateRegistration(input: ProjectSpecialistWorkflowReadinessInput): boolean {
  const registrations: readonly PromptArtifactTemplateRegistration[] =
    "templates" in input.promptTemplateRegistrations
      ? input.promptTemplateRegistrations.templates
      : input.promptTemplateRegistrations;

  return registrations.some((registration) =>
    registration.runType === input.runType &&
    registration.promptTemplateId === input.descriptor.promptTemplate.promptTemplateId &&
    registration.promptTemplateVersion === input.descriptor.promptTemplate.promptTemplateVersion
  );
}

function providerReadinessBlockers(
  input: ProjectSpecialistWorkflowReadinessInput
): readonly SpecialistProviderReadinessBlocker[] {
  const cards = readProviderCards(input.providerReadiness);
  if (cards.length === 0) {
    return [freezeProviderBlocker({
      providerId: "provider:missing",
      state: "provider-unavailable",
      requiredApprovalClass: "none",
      safeActionIds: ["action_choose_provider"]
    })];
  }

  const readyCard = cards.find((card) => readyProviderStates.has(card.state));
  if (readyCard !== undefined) {
    return [];
  }

  const byteTransferCard = cards.find((card) => card.state === "requires-byte-transfer-approval");
  if (byteTransferCard !== undefined) {
    return [providerBlockerForCard(byteTransferCard)];
  }

  return [providerBlockerForCard(cards[0] as ProviderSetupCard)];
}

function readProviderCards(
  providerReadiness: ProjectSpecialistWorkflowReadinessInput["providerReadiness"]
): readonly ProviderSetupCard[] {
  if ("schemaVersion" in providerReadiness) {
    return providerReadinessDtoSchema.parse(providerReadiness).cards;
  }
  return providerReadiness.cards.map((card) => providerSetupCardSchema.parse(card));
}

function providerBlockerForCard(card: ProviderSetupCard): SpecialistProviderReadinessBlocker {
  return freezeProviderBlocker({
    providerId: card.providerId,
    state: card.state,
    requiredApprovalClass: card.requiredApprovalClass,
    safeActionIds: card.safeActionIds
  });
}

function freezeProviderBlocker(blocker: SpecialistProviderReadinessBlocker): SpecialistProviderReadinessBlocker {
  return Object.freeze({
    providerId: assertSafeInputText(blocker.providerId, "provider readiness blocker providerId"),
    state: blocker.state,
    requiredApprovalClass: blocker.requiredApprovalClass,
    safeActionIds: Object.freeze(blocker.safeActionIds.map((actionId) =>
      assertSafeInputText(actionId, "provider readiness blocker safeActionId")
    ))
  });
}

function requiredAdapterFamiliesFor(descriptor: SpecialistWorkflowDescriptor): readonly AgentDomainToolFamily[] {
  const families = new Set<AgentDomainToolFamily>();

  if (
    descriptor.promptTemplate.transferApprovalClass === "provider-byte-transfer" ||
    descriptor.approvalRequirements.some((approval) => approval.approvalClass === "provider-byte-transfer")
  ) {
    families.add("provider-byte-transfer");
  }
  if (descriptor.allowedTools.some((tool) => tool.toolId.startsWith("prr.") && tool.requiredApprovalClass === "external-message-send")) {
    families.add("prr-correspondence");
  }
  if (descriptor.allowedTools.some((tool) =>
    tool.toolId === "diagnostic.investigative-signal.request" ||
    tool.toolId === "claim.contradiction-link.request"
  )) {
    families.add("contradiction-claim-review");
  }
  if (descriptor.allowedTools.some((tool) => tool.toolId.startsWith("governance.export") || tool.toolId.startsWith("report."))) {
    families.add("export-report");
  }

  return Object.freeze([...families].sort());
}

function missingProviderApprovalClasses(
  input: ProjectSpecialistWorkflowReadinessInput,
  providerState: readonly SpecialistProviderReadinessBlocker[]
): readonly AgentToolApprovalClass[] {
  const missing = providerState
    .filter((state) => state.requiredApprovalClass === "provider-byte-transfer")
    .filter(() => !input.satisfiedApprovalClasses.includes("provider-byte-transfer"))
    .map(() => "provider-byte-transfer" as const);

  return Object.freeze([...new Set(missing)].sort());
}

function statusFor(input: {
  readonly missingContractIds: readonly string[];
  readonly missingContextPackIds: readonly string[];
  readonly missingProjectionHighWaterMarkIds: readonly string[];
  readonly staleContextPackIds: readonly string[];
  readonly missingProvenanceContextPackIds: readonly string[];
  readonly activeLockIds: readonly string[];
  readonly missingPromptTemplateIds: readonly string[];
  readonly providerState: readonly SpecialistProviderReadinessBlocker[];
  readonly missingAdapterFamilies: readonly AgentDomainToolFamily[];
  readonly missingApprovalClasses: readonly AgentToolApprovalClass[];
}): {
  readonly status: SpecialistWorkflowReadinessStatus;
  readonly category: SpecialistWorkflowReadinessCategory;
} {
  if (input.missingContractIds.length > 0) {
    return { status: "blocked", category: "blocked-prerequisite" };
  }
  if (input.missingContextPackIds.length > 0 || input.missingProvenanceContextPackIds.length > 0) {
    return { status: "blocked", category: "blocked-provenance" };
  }
  if (input.missingProjectionHighWaterMarkIds.length > 0 || input.staleContextPackIds.length > 0) {
    return { status: "blocked", category: "projection-lag" };
  }
  if (input.activeLockIds.length > 0) {
    return { status: "blocked", category: "blocked-lock" };
  }
  if (
    input.missingPromptTemplateIds.length > 0 ||
    input.providerState.some((state) => state.state !== "requires-byte-transfer-approval") ||
    input.missingAdapterFamilies.length > 0
  ) {
    return { status: "blocked", category: "blocked-prerequisite" };
  }
  if (input.missingApprovalClasses.length > 0) {
    return { status: "waiting-for-approval", category: "approval-required" };
  }
  return { status: "context-ready", category: "context-ready" };
}

function nextSafeActionsFor(input: {
  readonly status: SpecialistWorkflowReadinessStatus;
  readonly category: SpecialistWorkflowReadinessCategory;
  readonly missingContractIds: readonly string[];
  readonly missingContextPackIds: readonly string[];
  readonly staleContextPackIds: readonly string[];
  readonly missingProjectionHighWaterMarkIds: readonly string[];
  readonly missingPromptTemplateIds: readonly string[];
  readonly providerState: readonly SpecialistProviderReadinessBlocker[];
  readonly missingAdapterFamilies: readonly AgentDomainToolFamily[];
  readonly activeLockIds: readonly string[];
  readonly missingApprovalClasses: readonly AgentToolApprovalClass[];
}): readonly string[] {
  const actions = new Set<string>();

  for (const contractId of input.missingContractIds) {
    actions.add(`register contract ${contractId}`);
  }
  for (const contextPackId of input.missingContextPackIds) {
    actions.add(`build context pack ${contextPackId}`);
  }
  for (const contextPackId of [...input.staleContextPackIds, ...input.missingProjectionHighWaterMarkIds]) {
    actions.add(`refresh projection freshness for ${contextPackId}`);
  }
  for (const templateId of input.missingPromptTemplateIds) {
    actions.add(`register prompt template ${templateId}`);
  }
  for (const provider of input.providerState) {
    for (const actionId of provider.safeActionIds) {
      actions.add(actionId);
    }
  }
  for (const family of input.missingAdapterFamilies) {
    actions.add(`register domain adapter family ${family}`);
  }
  for (const lockId of input.activeLockIds) {
    actions.add(`inspect active lock ${lockId}`);
  }
  for (const approvalClass of input.missingApprovalClasses) {
    actions.add(`request ${approvalClass} approval`);
  }
  if (input.status === "context-ready" || input.category === "context-ready") {
    actions.add("continue with local handoff preparation only");
  }
  actions.add("keep specialist execution disabled until a workflow runner is approved");

  return Object.freeze([...actions]);
}

function assertSafeInputText(value: string, label: string): string {
  assertAgentSecretSafeText(value, label);
  return value;
}
