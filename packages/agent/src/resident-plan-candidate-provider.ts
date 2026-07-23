import { isIP } from "node:net";
import { types } from "node:util";
import {
  validateKnowledgeEvent,
  validateResidentLoopEventSequence,
  type KnowledgeEvent
} from "../../ontology/src/contracts.js";
import type {
  ResidentLoopReplayV2,
  ResidentObservationEventV2,
  ResidentPlanEventV2
} from "./plan-observation-contracts.js";
import { isAgentSecretSafeText } from "./secret-safety.js";
import { approvalClassForSideEffect } from "./permission-policy.js";

type NormalizedValue = string | number | boolean | null | NormalizedRecord | NormalizedArray;

interface NormalizedRecord {
  readonly [key: string]: NormalizedValue;
}

interface NormalizedArray extends ReadonlyArray<NormalizedValue> {}

export type ResidentUnboundPlanV2 = NormalizedRecord;
export type ResidentLoopProviderPosture = NormalizedRecord;
export type ResidentLoopPolicyConstraintsV2 = NormalizedRecord;

export interface ResidentInitialPlanCandidateV2 {
  readonly kind: "initial";
  readonly proposedPlan: ResidentUnboundPlanV2;
  readonly providerPosture: ResidentLoopProviderPosture;
  readonly policyConstraints: ResidentLoopPolicyConstraintsV2;
}

export interface ResidentReplanCandidateV2 {
  readonly kind: "replan";
  readonly priorPlan: ResidentPlanEventV2;
  readonly priorPlanReadback: ResidentLoopReplayV2;
  readonly replanObservationReadback: ResidentObservationEventV2;
  readonly proposedPlan: ResidentUnboundPlanV2;
}

export interface ResidentPlanCandidateProvider {
  createInitialCandidate(input: unknown): Promise<ResidentInitialPlanCandidateV2>;
  createReplanCandidate(input: unknown): Promise<ResidentReplanCandidateV2>;
}

const hashPattern = /^sha256:[a-f0-9]{64}$/;
const eventPattern = /^evt_[a-zA-Z0-9_-]+$/;
const planPattern = /^plan_[a-zA-Z0-9_-]+$/;
const urlSchemePattern = /(?:^|[^a-z0-9])[a-z][a-z0-9+.-]*:/i;
const localhostPattern = /\blocalhost\b/i;
const ipShapedTokenPattern = /\[[^\]\s]+\]|(?:::|[0-9a-f]{1,4}:)[0-9a-f:.]*(?:%[a-z0-9_.-]+)?|(?:\d{1,3}\.){3}\d{1,3}/gi;
const standardUrlIpv4TokenPattern = /(?:^|[^a-z0-9])((?:[0-9a-fx]+\.)+[0-9a-fx]+|0x[0-9a-f]+|\d{8,})(?=$|[^a-z0-9])/gi;
const wholeNumericUrlHostPattern = /^(?:0x[0-9a-f]+|\d+)(?::\d+)?$/i;
const dnsHostTokenPattern = /(?:^|[^\p{L}\p{N}\p{M}_-])((?:[\p{L}\p{N}\p{M}-]+\.)+[\p{L}\p{N}\p{M}-]*[\p{L}\p{M}][\p{L}\p{N}\p{M}-]*)(?=$|[^\p{L}\p{N}\p{M}_-])/gu;
const idnaDotEquivalentPattern = /[\u3002\uFF0E\uFF61]/gu;
const releasedDottedVersionPattern = /^(?:resident-plan-record|resident-loop-provider-posture|agent-provider-capability|agent-provider-auth|policy|adapter)\.v[12]$|^1\.0\.0$/;
const canonicalIsoTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const rawCommandPattern = /(?:^|\s)(?:curl|wget|bash|sh|zsh|powershell|cmd)(?:\s|$)/i;
const runModes = new Set([
  "evidence-triage", "ontology-bootstrap", "investigation-planner", "prr-negotiation",
  "timeline-builder", "contradiction-finder", "report-builder", "memory-curation"
]);
const permittedAutomaticActionClasses = new Set(["read-only", "local-derivative", "ledger-proposal"]);
const residentSideEffectClasses = new Set(["read-only", "local-derivative", "ledger-proposal", "external-byte-transfer", "external-message-send", "legal-escalation", "export-or-publication", "destructive-or-repair", "ledger-review"]);
const releasedApprovalClasses = new Set([...residentSideEffectClasses].map((sideEffectClass) => approvalClassForSideEffect(sideEffectClass)));
releasedApprovalClasses.add("human-review");
const outputClasses = new Set(["observation", "derivative", "proposal", "approval-request"]);
const budgetFields = [
  "planRevisions", "observationRecords", "toolSteps", "providerInvocations", "providerRequestBytes",
  "providerResponseBytes", "contextBytes", "derivativeArtifactBytes", "activeExecutionMs", "approvalSuspensionMs"
] as const;
const hardMaximums: Readonly<Record<typeof budgetFields[number], number>> = Object.freeze({
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
});

/**
 * Produces frozen, untrusted plan candidates only. It neither appends nor
 * authorizes a plan; the later CF-1/Task136 boundary reparses this data.
 */
export function createResidentPlanCandidateProvider(): ResidentPlanCandidateProvider {
  return Object.freeze({
    async createInitialCandidate(input: unknown): Promise<ResidentInitialPlanCandidateV2> {
      try {
        const envelope = exactRecord(input, ["proposedPlan", "providerPosture", "policyConstraints"]);
        const proposedPlan = requireRecord(envelope, "proposedPlan");
        const providerPosture = requireRecord(envelope, "providerPosture");
        const policyConstraints = requireRecord(envelope, "policyConstraints");
        return parseResidentUntrustedPlanCandidate(Object.freeze({
          kind: "initial",
          proposedPlan,
          providerPosture,
          policyConstraints
        }));
      } catch {
        throw unavailable();
      }
    },

    async createReplanCandidate(input: unknown): Promise<ResidentReplanCandidateV2> {
      try {
        const envelope = exactRecord(input, [
          "priorPlan", "priorPlanReadback", "replanObservationReadback", "proposedPlan"
        ]);
        const priorPlan = requireRecord(envelope, "priorPlan");
        const priorPlanReadback = requireRecord(envelope, "priorPlanReadback");
        const replanObservationReadback = requireRecord(envelope, "replanObservationReadback");
        const proposedPlan = requireRecord(envelope, "proposedPlan");
        return parseResidentUntrustedPlanCandidate(Object.freeze({
          kind: "replan",
          priorPlan,
          priorPlanReadback,
          replanObservationReadback,
          proposedPlan
        }));
      } catch {
        throw unavailable();
      }
    }
  });
}

export function parseResidentUntrustedPlanCandidate(
  input: unknown
): ResidentInitialPlanCandidateV2 | ResidentReplanCandidateV2 {
  try {
    const candidate = requireNormalizedRecord(normalizeImmutablePlainData(input));
    const kind = string(candidate, "kind");
    if (kind === "initial") {
      requireExactKeys(candidate, [
        "kind", "proposedPlan", "providerPosture", "policyConstraints"
      ]);
      const proposedPlan = requireRecord(candidate, "proposedPlan");
      const providerPosture = requireRecord(candidate, "providerPosture");
      const policyConstraints = requireRecord(candidate, "policyConstraints");
      validatePlan(proposedPlan, providerPosture, policyConstraints);
      if (
        number(proposedPlan, "planRevision") !== 0 ||
        value(proposedPlan, "priorPlanReadback") !== null ||
        value(proposedPlan, "replanObservationReadback") !== null ||
        !isInitialBudget(requireRecord(proposedPlan, "budget"))
      ) {
        throw unavailable();
      }
      return Object.freeze({
        kind: "initial",
        proposedPlan,
        providerPosture,
        policyConstraints
      });
    }
    if (kind === "replan") {
      requireExactKeys(candidate, [
        "kind", "priorPlan", "priorPlanReadback",
        "replanObservationReadback", "proposedPlan"
      ]);
      const priorPlan = requireRecord(candidate, "priorPlan");
      const priorPlanReadback = requireRecord(candidate, "priorPlanReadback");
      const replanObservationReadback =
        requireRecord(candidate, "replanObservationReadback");
      const proposedPlan = requireRecord(candidate, "proposedPlan");
      const durable = validateDurableReplanTuple(
        priorPlan,
        priorPlanReadback,
        replanObservationReadback
      );
      validateReplan(proposedPlan, priorPlan, replanObservationReadback);
      return Object.freeze({
        kind: "replan",
        priorPlan: durable.priorPlan,
        priorPlanReadback: durable.priorPlanReadback,
        replanObservationReadback: durable.replanObservationReadback,
        proposedPlan
      });
    }
    throw unavailable();
  } catch {
    throw unavailable();
  }
}

function validatePlan(plan: NormalizedRecord, posture: NormalizedRecord, constraints: NormalizedRecord): void {
  validateUnboundPlan(plan);
  validateConstraints(constraints);
  validateStepsAgainstConstraints(requireArray(plan, "steps"), constraints);
  validatePosture(posture, plan, constraints);
}

function validateUnboundPlan(plan: NormalizedRecord): void {
  requireExactKeys(plan, [
    "schemaVersion", "residentAgentId", "workspaceId", "taskId", "attemptId", "runId", "runMode", "workflowDescriptor",
    "policy", "authority", "sourceEventIds", "contextPackRefs", "budget", "causationId", "correlationId", "planId",
    "planRevision", "priorPlanReadback", "replanObservationReadback", "steps"
  ]);
  if (string(plan, "schemaVersion") !== "resident-plan-record.v2" || string(plan, "residentAgentId") !== "agent_default") throw unavailable();
  requirePattern(string(plan, "workspaceId"), /^ws_[a-zA-Z0-9_-]+$/);
  for (const key of ["taskId", "attemptId", "runId", "causationId"] as const) requirePattern(string(plan, key), eventOrIdentityPattern(key));
  if (!runModes.has(string(plan, "runMode")) || string(plan, "correlationId").length < 3) throw unavailable();
  requirePattern(string(plan, "planId"), planPattern);
  if (!Number.isInteger(number(plan, "planRevision")) || number(plan, "planRevision") < 0 || number(plan, "planRevision") > 3) throw unavailable();
  validateWorkflow(requireRecord(plan, "workflowDescriptor"));
  validatePolicy(requireRecord(plan, "policy"));
  validateAuthority(requireRecord(plan, "authority"), plan);
  validateSources(requireArray(plan, "sourceEventIds"), requireArray(plan, "contextPackRefs"));
  const sourceIds = requireArray(plan, "sourceEventIds");
  if (string(requireRecord(plan, "authority"), "ledgerHighWaterEventId") !== sourceIds[sourceIds.length - 1]) throw unavailable();
  validateBudget(requireRecord(plan, "budget"));
  validateUnboundSteps(requireArray(plan, "steps"));
}

function validateReplan(
  plan: NormalizedRecord,
  priorPlan: NormalizedRecord,
  observationReadback: NormalizedRecord
): void {
  validateUnboundPlan(plan);
  const priorPayload = requireRecord(priorPlan, "payload");
  const observationPayload = requireRecord(observationReadback, "payload");
  if (
    number(plan, "planRevision") !== number(priorPayload, "planRevision") + 1 ||
    string(plan, "planId") === string(priorPayload, "planId")
  ) {
    throw unavailable();
  }
  const embeddedPrior = requireRecord(plan, "priorPlanReadback");
  const embeddedObservation = requireRecord(plan, "replanObservationReadback");
  requireExactKeys(embeddedPrior, [
    "planRecordEventId", "workspaceId", "residentAgentId", "taskId", "attemptId", "runId", "planId", "planRevision", "priorPlanRecordEventId"
  ]);
  if (
    string(embeddedPrior, "planRecordEventId") !== string(priorPlan, "id") ||
    string(embeddedPrior, "priorPlanRecordEventId") !== string(priorPlan, "id") ||
    !sameReadback(embeddedPrior, priorPayload, "planRecordEventId")
  ) {
    throw unavailable();
  }
  requireExactKeys(embeddedObservation, [
    "observationEventId", "workspaceId", "residentAgentId", "taskId",
    "attemptId", "runId", "planId", "planRevision"
  ]);
  if (
    string(embeddedObservation, "observationEventId") !==
      string(observationReadback, "id") ||
    !sameReadback(embeddedObservation, priorPayload, "observationEventId")
  ) {
    throw unavailable();
  }
  for (const key of [
    "residentAgentId", "workspaceId", "taskId", "attemptId", "runId", "runMode", "workflowDescriptor", "policy", "authority",
    "sourceEventIds", "contextPackRefs", "correlationId"
  ] as const) {
    if (!sameValue(value(plan, key), value(priorPayload, key))) throw unavailable();
  }
  if (string(plan, "causationId") !== string(observationReadback, "id")) {
    throw unavailable();
  }
  if (
    !isBudgetNarrower(
      requireRecord(plan, "budget"),
      requireRecord(observationPayload, "budget")
    )
  ) {
    throw unavailable();
  }
  const priorSteps = requireArray(priorPayload, "steps");
  for (const step of requireArray(plan, "steps")) {
    const unboundStep = requireNormalizedRecord(step);
    const ordinal = number(unboundStep, "ordinal");
    const matching = priorSteps.find((candidate) =>
      number(requireNormalizedRecord(candidate), "ordinal") === ordinal
    );
    if (
      matching === undefined ||
      !sameUnboundStep(unboundStep, requireNormalizedRecord(matching))
    ) {
      throw unavailable();
    }
  }
}

function validateDurableReplanTuple(
  priorPlan: NormalizedRecord,
  priorPlanReadback: NormalizedRecord,
  replanObservationReadback: NormalizedRecord
): {
  readonly priorPlan: ResidentPlanEventV2;
  readonly priorPlanReadback: ResidentLoopReplayV2;
  readonly replanObservationReadback: ResidentObservationEventV2;
} {
  const parsedPrior = validateKnowledgeEvent(priorPlan);
  const parsedObservation = validateKnowledgeEvent(replanObservationReadback);
  if (
    !parsedPrior.success ||
    parsedPrior.data.type !== "agent.resident-plan.recorded.v2" ||
    !parsedObservation.success ||
    parsedObservation.data.type !== "agent.resident-observation.recorded.v2"
  ) {
    throw unavailable();
  }

  requireExactKeys(priorPlanReadback, [
    "identity", "events", "plans", "observations",
    "toolSteps", "suspensions", "results"
  ]);
  const identity = requireRecord(priorPlanReadback, "identity");
  requireExactKeys(identity, [
    "residentAgentId", "workspaceId", "taskId", "attemptId", "runId"
  ]);
  const priorPayload = requireRecord(priorPlan, "payload");
  for (const key of [
    "residentAgentId", "workspaceId", "taskId", "attemptId", "runId"
  ] as const) {
    if (!sameValue(value(identity, key), value(priorPayload, key))) {
      throw unavailable();
    }
  }

  const eventValues = requireArray(priorPlanReadback, "events");
  const eventRecords = eventValues.map(requireNormalizedRecord);
  const parsedEvents: KnowledgeEvent[] = [];
  for (const event of eventRecords) {
    const parsed = validateKnowledgeEvent(event);
    if (
      !parsed.success ||
      !residentReplayEventTypes.has(parsed.data.type)
    ) {
      throw unavailable();
    }
    parsedEvents.push(parsed.data);
  }
  if (!validateResidentLoopEventSequence(parsedEvents).success) {
    throw unavailable();
  }

  const replayGroups = [
    ["plans", "agent.resident-plan.recorded.v2"],
    ["observations", "agent.resident-observation.recorded.v2"],
    ["toolSteps", "agent.resident-tool-step.recorded.v2"],
    ["suspensions", "agent.resident-loop.suspended.v2"],
    ["results", "agent.resident-loop.result.recorded.v2"]
  ] as const;
  for (const [key, type] of replayGroups) {
    const supplied = requireArray(priorPlanReadback, key);
    const expected = Object.freeze(
      eventRecords.filter((event) => value(event, "type") === type)
    );
    if (!sameValue(supplied, expected)) throw unavailable();
  }

  const plans = requireArray(priorPlanReadback, "plans");
  const observations = requireArray(priorPlanReadback, "observations");
  if (
    plans.length === 0 ||
    observations.length === 0 ||
    !sameValue(plans[plans.length - 1], priorPlan) ||
    !sameValue(
      observations[observations.length - 1],
      replanObservationReadback
    ) ||
    !sameValue(eventRecords[eventRecords.length - 1], replanObservationReadback)
  ) {
    throw unavailable();
  }

  return Object.freeze({
    priorPlan: priorPlan as unknown as ResidentPlanEventV2,
    priorPlanReadback: priorPlanReadback as unknown as ResidentLoopReplayV2,
    replanObservationReadback:
      replanObservationReadback as unknown as ResidentObservationEventV2
  });
}

const residentReplayEventTypes = new Set<KnowledgeEvent["type"]>([
  "agent.resident-plan.recorded.v2",
  "agent.resident-observation.recorded.v2",
  "agent.resident-tool-step.recorded.v2",
  "agent.resident-loop.suspended.v2",
  "agent.resident-loop.result.recorded.v2"
]);

function validateWorkflow(workflow: NormalizedRecord): void {
  requireExactKeys(workflow, ["workflowDescriptorId", "workflowDescriptorVersion", "workflowDescriptorHash"]);
  requirePattern(string(workflow, "workflowDescriptorId"), /^workflow_[a-zA-Z0-9_-]+$/);
  safe(string(workflow, "workflowDescriptorVersion"));
  hash(string(workflow, "workflowDescriptorHash"));
}

function validatePolicy(policy: NormalizedRecord): void {
  requireExactKeys(policy, ["policyId", "policyVersion", "policyHash"]);
  requirePattern(string(policy, "policyId"), /^agent_policy_[a-zA-Z0-9_-]+$/);
  safe(string(policy, "policyVersion"));
  hash(string(policy, "policyHash"));
}

function validateAuthority(authority: NormalizedRecord, plan: NormalizedRecord): void {
  requireExactKeys(authority, [
    "workspaceIdentityHash", "mountGeneration", "ledgerStoreIdentity", "artifactStoreIdentity", "ledgerHighWaterEventId", "policyHash", "activeLocksHash"
  ]);
  for (const key of ["workspaceIdentityHash", "policyHash", "activeLocksHash"] as const) hash(string(authority, key));
  for (const key of ["mountGeneration", "ledgerStoreIdentity", "artifactStoreIdentity"] as const) safe(string(authority, key));
  requirePattern(string(authority, "ledgerHighWaterEventId"), eventPattern);
  if (string(authority, "policyHash") !== string(requireRecord(plan, "policy"), "policyHash")) throw unavailable();
}

function validateSources(sourceIds: NormalizedArray, contextRefs: NormalizedArray): void {
  if (sourceIds.length === 0 || contextRefs.length === 0) throw unavailable();
  validateOrderedUniqueStrings(sourceIds, eventPattern);
  const contextIds: string[] = [];
  for (const reference of contextRefs) {
    const record = requireNormalizedRecord(reference);
    requireExactKeys(record, ["contextPackId", "contentHash"]);
    const id = string(record, "contextPackId");
    requirePattern(id, /^context_pack_[a-zA-Z0-9_-]+$/);
    hash(string(record, "contentHash"));
    contextIds.push(id);
  }
  validateOrderedUniqueStrings(contextIds);
}

function validateBudget(budget: NormalizedRecord): void {
  requireExactKeys(budget, ["ceilings", "consumed", "remaining", "actionConsumption"]);
  const ceilings = requireRecord(budget, "ceilings");
  const consumed = requireRecord(budget, "consumed");
  const remaining = requireRecord(budget, "remaining");
  const actionConsumption = requireRecord(budget, "actionConsumption");
  for (const record of [ceilings, consumed, remaining, actionConsumption]) requireExactKeys(record, budgetFields);
  for (const field of budgetFields) {
    const ceiling = number(ceilings, field);
    const used = number(consumed, field);
    const available = number(remaining, field);
    if (!Number.isInteger(ceiling) || !Number.isInteger(used) || !Number.isInteger(available) || ceiling < 0 || used < 0 || available < 0 || ceiling > hardMaximums[field] || used + available !== ceiling) {
      throw unavailable();
    }
    if (!Number.isInteger(number(actionConsumption, field)) || number(actionConsumption, field) < 0) throw unavailable();
  }
}

function validateConstraints(constraints: NormalizedRecord): void {
  requireExactKeys(constraints, ["toolAllowlist", "permittedAutomaticActionClasses", "requiredApprovalClasses"]);
  const toolAllowlist = requireArray(constraints, "toolAllowlist");
  if (toolAllowlist.length === 0) throw unavailable();
  const signatures: string[] = [];
  for (const entry of toolAllowlist) {
    const record = requireNormalizedRecord(entry);
    requireExactKeys(record, [
      "toolId", "toolVersion", "allowlistEntryHash", "expectedSafeOutputClass", "prerequisiteStepOrdinals", "sideEffectClass", "requiredApprovalClass"
    ]);
    const toolId = string(record, "toolId");
    const toolVersion = string(record, "toolVersion");
    safe(toolId); safe(toolVersion); hash(string(record, "allowlistEntryHash"));
    if (!outputClasses.has(string(record, "expectedSafeOutputClass"))) throw unavailable();
    validatePrerequisites(requireArray(record, "prerequisiteStepOrdinals"), Number.MAX_SAFE_INTEGER);
    const sideEffectClass = string(record, "sideEffectClass");
    const requiredApprovalClass = string(record, "requiredApprovalClass");
    const baselineApproval = approvalClassForSideEffect(sideEffectClass);
    if (!residentSideEffectClasses.has(sideEffectClass) || (requiredApprovalClass !== baselineApproval && !(baselineApproval === "none" && requiredApprovalClass === "human-review"))) throw unavailable();
    if (!requireArray(constraints, "requiredApprovalClasses").includes(requiredApprovalClass)) throw unavailable();
    signatures.push(`${toolId}\u0000${toolVersion}\u0000${string(record, "allowlistEntryHash")}`);
  }
  if (new Set(signatures).size !== signatures.length) throw unavailable();
  const automaticActionClasses = requireArray(constraints, "permittedAutomaticActionClasses");
  validateUniqueStrings(automaticActionClasses);
  if (automaticActionClasses.some((entry) => typeof entry !== "string" || !permittedAutomaticActionClasses.has(entry))) throw unavailable();
  const requiredApprovalClasses = requireArray(constraints, "requiredApprovalClasses");
  validateUniqueStrings(requiredApprovalClasses);
  if (requiredApprovalClasses.some((entry) => typeof entry !== "string" || ![...releasedApprovalClasses].some((released) => released === entry))) throw unavailable();
}

function validateUnboundSteps(steps: NormalizedArray): void {
  if (steps.length === 0) throw unavailable();
  for (const [index, stepValue] of steps.entries()) {
    const step = requireNormalizedRecord(stepValue);
    requireExactKeys(step, [
      "ordinal", "purpose", "toolId", "toolVersion", "allowlistEntryHash",
      "expectedSafeOutputClass", "prerequisiteStepOrdinals"
    ]);
    if (number(step, "ordinal") !== index + 1) throw unavailable();
    safe(string(step, "purpose"));
    safe(string(step, "toolId"));
    safe(string(step, "toolVersion"));
    hash(string(step, "allowlistEntryHash"));
    if (!outputClasses.has(string(step, "expectedSafeOutputClass"))) {
      throw unavailable();
    }
    validatePrerequisites(
      requireArray(step, "prerequisiteStepOrdinals"),
      index + 1
    );
  }
}

function validateStepsAgainstConstraints(
  steps: NormalizedArray,
  constraints: NormalizedRecord
): void {
  const allowed = requireArray(constraints, "toolAllowlist");
  for (const stepValue of steps) {
    const step = requireNormalizedRecord(stepValue);
    const allowlist = allowed.find((entry) => {
      const record = requireNormalizedRecord(entry);
      return string(record, "toolId") === string(step, "toolId") &&
        string(record, "toolVersion") === string(step, "toolVersion") &&
        string(record, "allowlistEntryHash") === string(step, "allowlistEntryHash") &&
        string(record, "expectedSafeOutputClass") === string(step, "expectedSafeOutputClass") &&
        sameValue(value(record, "prerequisiteStepOrdinals"), value(step, "prerequisiteStepOrdinals"));
    });
    if (allowlist === undefined) throw unavailable();
  }
}

function validatePosture(posture: NormalizedRecord, plan: NormalizedRecord, constraints: NormalizedRecord): void {
  requireExactKeys(posture, [
    "schemaVersion", "residentAgentId", "workspace", "run", "selection", "capability", "credentialReference", "feasibility", "approval", "binding"
  ]);
  if (string(posture, "schemaVersion") !== "resident-loop-provider-posture.v1" || string(posture, "residentAgentId") !== string(plan, "residentAgentId")) throw unavailable();
  const workspace = requireRecord(posture, "workspace");
  requireExactKeys(workspace, ["workspaceId", "mountInstanceId", "admissionGenerationId", "policyVersion", "policyDigest", "lockStateDigest", "highWaterMark", "highWaterOrdinal"]);
  const run = requireRecord(posture, "run");
  requireExactKeys(run, ["taskId", "attemptId", "runId"]);
  const policy = requireRecord(plan, "policy");
  const authority = requireRecord(plan, "authority");
  const workspaceId = string(workspace, "workspaceId");
  const mountInstanceId = string(workspace, "mountInstanceId");
  string(workspace, "admissionGenerationId");
  const policyVersion = string(workspace, "policyVersion");
  const policyDigest = string(workspace, "policyDigest");
  const lockStateDigest = string(workspace, "lockStateDigest");
  const highWaterMark = string(workspace, "highWaterMark");
  if (
    workspaceId !== string(plan, "workspaceId") ||
    mountInstanceId !== string(authority, "mountGeneration") ||
    policyVersion !== string(policy, "policyVersion") ||
    policyDigest !== string(policy, "policyHash") ||
    lockStateDigest !== string(authority, "activeLocksHash") ||
    highWaterMark !== string(authority, "ledgerHighWaterEventId") ||
    !Number.isSafeInteger(number(workspace, "highWaterOrdinal")) || number(workspace, "highWaterOrdinal") < 0 ||
    ["taskId", "attemptId", "runId"].some((key) => string(run, key) !== string(plan, key))
  ) throw unavailable();
  const selection = requireRecord(posture, "selection");
  requireExactKeys(selection, ["providerId", "modelId", "adapterVersion", "selectionPolicyVersion", "endpointPolicyId"]);
  const capability = requireRecord(posture, "capability");
  requireExactKeys(capability, ["capabilityId", "capabilityVersion", "capabilityHash", "capabilitySourceEventId", "capabilityRevision"]);
  const credentialReference = requireRecord(posture, "credentialReference");
  requireExactKeys(credentialReference, ["credentialRefId", "credentialKind", "sourceEventIds"]);
  const feasibility = requireRecord(posture, "feasibility");
  requireExactKeys(feasibility, ["feasibilityId", "lane", "assessedAt", "sourceEventIds"]);
  const approval = requireRecord(posture, "approval");
  requireExactKeys(approval, ["required", "approvalProfile", "requiredApprovalClass"]);
  const binding = requireRecord(posture, "binding");
  requireExactKeys(binding, ["promptArtifactHash", "approvalPreviewHash"]);
  const providerId = string(selection, "providerId");
  string(selection, "modelId");
  string(selection, "adapterVersion");
  const selectionPolicyVersion = string(selection, "selectionPolicyVersion");
  string(selection, "endpointPolicyId");
  const capabilityId = string(capability, "capabilityId");
  const capabilityVersion = string(capability, "capabilityVersion");
  hash(string(capability, "capabilityHash"));
  requirePattern(string(capability, "capabilitySourceEventId"), eventPattern);
  string(capability, "capabilityRevision");
  string(credentialReference, "credentialRefId");
  const credentialKind = string(credentialReference, "credentialKind");
  string(feasibility, "feasibilityId");
  const feasibilityLane = string(feasibility, "lane");
  if (!isCanonicalIsoTimestamp(string(feasibility, "assessedAt"))) throw unavailable();
  const approvalRequired = boolean(approval, "required");
  const approvalProfile = string(approval, "approvalProfile");
  const requiredApprovalClass = string(approval, "requiredApprovalClass");
  hash(string(binding, "promptArtifactHash"));
  hash(string(binding, "approvalPreviewHash"));
  if (
    providerId !== capabilityId ||
    selectionPolicyVersion !== string(policy, "policyVersion") ||
    capabilityVersion !== "agent-provider-capability.v2" ||
    credentialKind !== "api-key-bearer" ||
    feasibilityLane !== "byok" ||
    approvalRequired !== true ||
    approvalProfile !== "remote-byte-transfer-gated" ||
    requiredApprovalClass !== "provider-byte-transfer" ||
    !requireArray(constraints, "requiredApprovalClasses").includes("provider-byte-transfer")
  ) throw unavailable();
  validateOrderedUniqueStrings(requireArray(credentialReference, "sourceEventIds"), eventPattern);
  validateOrderedUniqueStrings(requireArray(feasibility, "sourceEventIds"), eventPattern);
}

function sameReadback(readback: NormalizedRecord, plan: NormalizedRecord, idKey: "planRecordEventId" | "observationEventId"): boolean {
  if (!eventPattern.test(string(readback, idKey))) return false;
  for (const key of ["workspaceId", "residentAgentId", "taskId", "attemptId", "runId", "planId", "planRevision"] as const) {
    if (!sameValue(value(readback, key), value(plan, key))) return false;
  }
  return true;
}

function sameUnboundStep(
  proposed: NormalizedRecord,
  durable: NormalizedRecord
): boolean {
  requireExactKeys(durable, [
    "ordinal", "purpose", "toolId", "toolVersion", "allowlistEntryHash",
    "expectedSafeOutputClass", "prerequisiteStepOrdinals",
    "toolRequestId", "executionCapabilityHash"
  ]);
  for (const key of [
    "ordinal", "purpose", "toolId", "toolVersion", "allowlistEntryHash",
    "expectedSafeOutputClass", "prerequisiteStepOrdinals"
  ] as const) {
    if (!sameValue(value(proposed, key), value(durable, key))) return false;
  }
  requirePattern(string(durable, "toolRequestId"), /^toolreq_[a-zA-Z0-9_-]+$/);
  hash(string(durable, "executionCapabilityHash"));
  return true;
}

function isBudgetNarrower(next: NormalizedRecord, prior: NormalizedRecord): boolean {
  const nextCeilings = requireRecord(next, "ceilings");
  const previousCeilings = requireRecord(prior, "ceilings");
  const nextConsumed = requireRecord(next, "consumed");
  const previousConsumed = requireRecord(prior, "consumed");
  const nextRemaining = requireRecord(next, "remaining");
  const previousRemaining = requireRecord(prior, "remaining");
  const action = requireRecord(next, "actionConsumption");
  if (number(action, "planRevisions") !== 1) return false;
  for (const field of budgetFields) {
    const actionConsumption = number(action, field);
    if (
      number(nextCeilings, field) !== number(previousCeilings, field) ||
      (field !== "planRevisions" && actionConsumption !== 0) ||
      number(nextConsumed, field) !== number(previousConsumed, field) + actionConsumption ||
      number(nextRemaining, field) !== number(previousRemaining, field) - actionConsumption
    ) return false;
  }
  return true;
}

function isInitialBudget(budget: NormalizedRecord): boolean {
  let hasAction = false;
  for (const field of budgetFields) {
    const consumed = number(requireRecord(budget, "consumed"), field);
    const action = number(requireRecord(budget, "actionConsumption"), field);
    if (
      consumed !== action ||
      (field === "planRevisions" && action !== 0) ||
      number(requireRecord(budget, "remaining"), field) !==
        number(requireRecord(budget, "ceilings"), field) - consumed
    ) {
      return false;
    }
    hasAction ||= action > 0;
  }
  return hasAction;
}

function exactRecord(input: unknown, keys: readonly string[]): NormalizedRecord {
  const record = requireNormalizedRecord(normalizeImmutablePlainData(input));
  requireExactKeys(record, keys);
  return record;
}

function normalizeImmutablePlainData(input: unknown): NormalizedValue {
  if (input === null || typeof input === "boolean") return input;
  if (typeof input === "string") return input;
  if (typeof input === "number") {
    if (!Number.isFinite(input)) throw unavailable();
    return input;
  }
  if (types.isProxy(input) || typeof input !== "object" || !Object.isFrozen(input)) throw unavailable();
  if (Array.isArray(input)) {
    if (Object.getPrototypeOf(input) !== Array.prototype || Object.getOwnPropertyNames(input).length !== input.length + 1 || Reflect.ownKeys(input).some((key) => typeof key !== "string")) throw unavailable();
    const values: NormalizedValue[] = [];
    for (let index = 0; index < input.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
      if (descriptor === undefined || !("value" in descriptor) || descriptor.get !== undefined || descriptor.set !== undefined || !descriptor.enumerable) throw unavailable();
      values.push(normalizeImmutablePlainData(descriptor.value));
    }
    return Object.freeze(values);
  }
  if (Object.getPrototypeOf(input) !== Object.prototype || Reflect.ownKeys(input).some((key) => typeof key !== "string")) throw unavailable();
  const output: Record<string, NormalizedValue> = {};
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(input))) {
    if (!("value" in descriptor) || descriptor.get !== undefined || descriptor.set !== undefined || !descriptor.enumerable) throw unavailable();
    output[key] = normalizeImmutablePlainData(descriptor.value);
  }
  return Object.freeze(output);
}

function requireNormalizedRecord(value: NormalizedValue): NormalizedRecord {
  if (!isNormalizedRecord(value)) throw unavailable();
  return value;
}

function isNormalizedRecord(value: NormalizedValue): value is NormalizedRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireRecord(record: NormalizedRecord, key: string): NormalizedRecord {
  return requireNormalizedRecord(value(record, key));
}

function requireArray(record: NormalizedRecord, key: string): NormalizedArray {
  const candidate = value(record, key);
  if (!Array.isArray(candidate)) throw unavailable();
  return candidate;
}

function requireExactKeys(record: NormalizedRecord, expected: readonly string[]): void {
  const keys = Object.keys(record);
  if (keys.length !== expected.length || keys.some((key) => !expected.includes(key))) throw unavailable();
}

function value(record: NormalizedRecord, key: string): NormalizedValue {
  const candidate = record[key];
  if (candidate === undefined) throw unavailable();
  return candidate;
}

function string(record: NormalizedRecord, key: string): string {
  const candidate = value(record, key);
  if (typeof candidate !== "string") throw unavailable();
  safe(candidate);
  return candidate;
}

function number(record: NormalizedRecord, key: string): number {
  const candidate = value(record, key);
  if (typeof candidate !== "number") throw unavailable();
  return candidate;
}

function boolean(record: NormalizedRecord, key: string): boolean {
  const candidate = value(record, key);
  if (typeof candidate !== "boolean") throw unavailable();
  return candidate;
}

function validatePrerequisites(prerequisites: NormalizedArray, ordinal: number): void {
  const values: number[] = [];
  for (const prerequisite of prerequisites) {
    if (typeof prerequisite !== "number" || !Number.isInteger(prerequisite) || prerequisite < 1 || prerequisite >= ordinal) throw unavailable();
    values.push(prerequisite);
  }
  if (new Set(values).size !== values.length || values.some((entry, index) => index > 0 && entry <= values[index - 1]!)) throw unavailable();
}

function validateOrderedUniqueStrings(values: readonly NormalizedValue[] | readonly string[], pattern?: RegExp): void {
  const strings = values.map((value) => {
    if (typeof value !== "string") throw unavailable();
    if (pattern !== undefined) requirePattern(value, pattern);
    safe(value);
    return value;
  });
  if (new Set(strings).size !== strings.length || strings.some((entry, index) => index > 0 && entry.localeCompare(strings[index - 1]!) <= 0)) throw unavailable();
}

function validateUniqueStrings(values: readonly NormalizedValue[] | readonly string[]): void {
  const strings = values.map((value) => {
    if (typeof value !== "string") throw unavailable();
    safe(value);
    return value;
  });
  if (new Set(strings).size !== strings.length) throw unavailable();
}

function safe(candidate: string): void {
  if (candidate === "api-key-bearer") return;
  if (
    !isAgentSecretSafeText(candidate) ||
    (!hashPattern.test(candidate) && urlSchemePattern.test(candidate)) ||
    localhostPattern.test(candidate) ||
    rawCommandPattern.test(candidate) ||
    hasIpAddress(candidate) ||
    hasDnsHostMaterial(candidate)
  ) {
    throw unavailable();
  }
}

function hasDnsHostMaterial(value: string): boolean {
  const classificationText = value.normalize("NFKC").replace(idnaDotEquivalentPattern, ".");
  if (canonicalIsoTimestampPattern.test(classificationText)) return false;
  for (const match of classificationText.matchAll(dnsHostTokenPattern)) {
    const token = match[1];
    if (token !== undefined && !releasedDottedVersionPattern.test(token)) return true;
  }
  return false;
}

function hasIpAddress(value: string): boolean {
  const classificationText = value.normalize("NFKC").replace(idnaDotEquivalentPattern, ".");
  if (canonicalIsoTimestampPattern.test(classificationText) || releasedDottedVersionPattern.test(classificationText)) return false;
  const tokens = classificationText.match(ipShapedTokenPattern);
  if (tokens !== null && tokens.some((token) => {
    const bracketless = token.startsWith("[") && token.endsWith("]") ? token.slice(1, -1) : token;
    const scopeIndex = bracketless.indexOf("%");
    return isIP(scopeIndex === -1 ? bracketless : bracketless.slice(0, scopeIndex)) !== 0;
  })) return true;
  if (wholeNumericUrlHostPattern.test(classificationText) && isStandardUrlIpv4Host(classificationText)) return true;
  for (const match of classificationText.matchAll(standardUrlIpv4TokenPattern)) {
    const token = match[1];
    if (token !== undefined && isStandardUrlIpv4Host(token)) return true;
  }
  return false;
}

function isCanonicalIsoTimestamp(value: string): boolean {
  if (!canonicalIsoTimestampPattern.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}

function isStandardUrlIpv4Host(token: string): boolean {
  try {
    return isIP(new URL(`http://${token}`).hostname) === 4;
  } catch {
    return false;
  }
}

function hash(candidate: string): void {
  if (!hashPattern.test(candidate)) throw unavailable();
}

function requirePattern(candidate: string, pattern: RegExp): void {
  if (!pattern.test(candidate)) throw unavailable();
  safe(candidate);
}

function eventOrIdentityPattern(key: "taskId" | "attemptId" | "runId" | "causationId"): RegExp {
  if (key === "causationId") return eventPattern;
  return new RegExp(`^${key.slice(0, -2)}_[a-zA-Z0-9_-]+$`);
}

function sameValue(left: NormalizedValue | undefined, right: NormalizedValue | undefined): boolean {
  if (left === right) return true;
  if (left === undefined || right === undefined || left === null || right === null || typeof left !== "object" || typeof right !== "object" || Array.isArray(left) !== Array.isArray(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => sameValue((left as NormalizedRecord)[key], (right as NormalizedRecord)[key]));
}

function unavailable(): Error {
  return new Error("resident plan candidate unavailable");
}
