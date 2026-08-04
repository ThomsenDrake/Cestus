import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import type { AppendableKnowledgeEvent, KnowledgeEvent } from "../../ontology/src/contracts.js";
import {
  buildPrrCorrespondenceApprovalPreview,
  prrFollowUpExecuteDescriptor,
  type BuildPrrCorrespondencePreviewInput
} from "./adapters/prr-correspondence.js";
import { assertAgentSecretSafeText } from "./secret-safety.js";
import { serializeContextPackPayload } from "./context-packs.js";
import { buildSpecialistHandoffMaterial } from "./specialist-handoff-manifest.js";
import { validateProductionSpecialistProviderOutput } from "./production-specialist-output-contracts.js";
import { createAgentToolGateway } from "./tool-gateway.js";
import {
  parseLegacySpecialistWorkflowHandoff,
  type LegacySpecialistWorkflowHandoffDto,
  type SpecialistOutputArtifactRef,
  type SpecialistWorkflowHandoffDto
} from "./specialist-handoffs.js";
import type { MountedSpecialistHandoffAuthorityWitness } from "./specialist-handoff-authority.js";
import {
  appendSpecialistFinalOutputStep,
  appendSpecialistDerivativeStep,
  appendSpecialistFailure,
  assertSpecialistDerivativeStoreAvailable,
  assertSpecialistStepNotRecorded,
  governanceLockIsActive,
  invokeSpecialistModel,
  normalizeSpecialistJsonValue,
  prepareSpecialistRun,
  recordAuthorityBoundSpecialistHandoff,
  writeSpecialistDerivativeArtifact,
  type SpecialistHandoffManifestStore,
  type SpecialistRunnerBaseInput
} from "./specialist-runner-kernel.js";

export interface RunPrrNegotiationWorkflowInput extends SpecialistRunnerBaseInput {
  readonly prrRequestId: string;
  readonly correspondenceId: string;
  readonly jurisdictionRuleRefs: readonly string[];
  readonly followUpApprovalPreview?: PrrNegotiationFollowUpApprovalPreviewInput;
  /** Opaque current factory authority; this workflow must never construct it. */
  readonly handoffAuthorityWitness?: MountedSpecialistHandoffAuthorityWitness;
  /** Mounted content-addressed handoff storage, distinct from derivative storage. */
  readonly handoffStore?: SpecialistHandoffManifestStore;
}

export interface RunPrrNegotiationWorkflowResult {
  readonly handoff: LegacySpecialistWorkflowHandoffDto | SpecialistWorkflowHandoffDto;
  readonly eventIds: readonly string[];
}

export type PrrNegotiationFollowUpApprovalPreviewInput = Omit<
  BuildPrrCorrespondencePreviewInput,
  | "toolRequestId"
  | "toolId"
  | "toolVersion"
  | "runId"
  | "taskId"
  | "residentAgentId"
  | "prrRequestId"
  | "correspondenceId"
>;

interface PrrNegotiationFollowUpApprovalPreflight {
  readonly toolRequestId: string;
  readonly previewInput: PrrNegotiationFollowUpApprovalPreviewInput;
  readonly preflightPreview: ReturnType<typeof buildPrrCorrespondenceApprovalPreview>;
}

export async function runPrrNegotiationWorkflow(
  input: RunPrrNegotiationWorkflowInput
): Promise<RunPrrNegotiationWorkflowResult> {
  const resumed = await resumePrrNegotiationDraftHandoff(input);
  if (resumed !== undefined) return resumed;
  await assertSpecialistStepNotRecorded(input.ledger, input.runId, "step_prr_negotiation_draft");
  const toolRequestId = `toolreq_${input.runId}_followup`;
  const followUpPreflight = preflightFollowUpApprovalPreview(input, toolRequestId);
  assertSpecialistDerivativeStoreAvailable(input);
  const handoffStore = requirePrrNegotiationHandoffStore(input);
  const handoffAuthorityWitness = requirePrrNegotiationHandoffAuthority(input);
  const runnerInput: SpecialistRunnerBaseInput = {
    ...input,
    scope: input.scope ?? Object.freeze({
      kind: "prr-request",
      refs: Object.freeze([input.prrRequestId]),
      associatedPrrRequestId: input.prrRequestId
    })
  };
  let prepared: Awaited<ReturnType<typeof prepareSpecialistRun>>;
  try {
    prepared = await prepareSpecialistRun(runnerInput, "prr-negotiation");
  } catch {
    return blockedPrrContextHandoff(input, []);
  }
  if (governanceLockIsActive(prepared.contextPackRefs, prepared.promptArtifact.resolvedContextPacks) ||
    hasStalePrrAdvisoryContext(prepared.contextPackRefs)) {
    return blockedPrrContextHandoff(input, prepared.contextPackRefs);
  }
  if (!trustedPrrReferencesAreCurrent(input, prepared)) {
    return blockedPrrContextHandoff(input, prepared.contextPackRefs);
  }
  const invocationId = `inv_${input.runId}_prr_negotiation`;
  const invocation = await invokeSpecialistModel(runnerInput, prepared, invocationId);
  const output = parseModelOutput(invocation.outputText);
  if (output === undefined) {
    return await failedModelOutputResult(input, prepared, invocation.eventIds);
  }
  if (!prrNegotiationReferencesAreExact(input, prepared, output)) {
    return await failedModelOutputResult(input, prepared, invocation.eventIds);
  }
  const draftPayload = {
    schemaVersion: "prr-negotiation-handoff.v1",
    artifactKind: "correspondence-draft-artifact",
    runId: input.runId,
    taskId: input.taskId,
    prrRequestId: input.prrRequestId,
    correspondenceId: input.correspondenceId,
    domainSourceBindings: prrAdvisoryDomainSourceBindings(followUpPreflight),
    draftSummary: output.draftSummary,
    citedRuleRefs: [...output.citedRuleRefs],
    jurisdictionRefs: [...output.jurisdictionRefs],
    deadlineRefs: [...output.deadlineRefs],
    deadlineNotes: [...output.deadlineNotes],
    narrowingOptions: [...output.narrowingOptions],
    feeOptions: [...output.feeOptions],
    feeOrStallingSignals: [...output.feeOrStallingSignals],
    unresolvedQuestions: [...output.unresolvedQuestions],
    legalPressureNotes: [...output.legalPressureNotes]
  };
  let draftArtifact: Awaited<ReturnType<typeof writeSpecialistDerivativeArtifact>>;
  try {
    draftArtifact = await writeSpecialistDerivativeArtifact({
      derivativeStore: input.derivativeStore,
      artifactKind: "correspondence-draft-artifact",
      payload: draftPayload
    });
  } catch {
    return await failedDerivativeArtifactResult(input, prepared, invocation.eventIds);
  }
  const draftHash = draftArtifact.artifactHash;
  const draftStep = await appendSpecialistDerivativeStep({
    ledger: input.ledger, actor: input.actor, now: input.now, runId: input.runId,
    stepId: "step_prr_negotiation_draft", summary: "Created a local PRR negotiation advisory artifact for human review; the sendable message remains domain supplied.",
    invocationId, inputArtifactHashes: [prepared.promptArtifact.manifest.inputArtifactHash, invocation.outputArtifactHash],
    outputArtifactHashes: [draftHash]
  });
  try {
    const materialStore = requirePrrNegotiationMaterialStore(input);
    await persistPrrNegotiationDraftArtifact(materialStore, handoffStore, draftArtifact);
  } catch {
    return await failedDraftHandoffStorageResult(input, prepared, [
      ...invocation.eventIds,
      draftStep.id
    ]);
  }

  const approval = output.requestFollowUpApproval
    ? await requestFollowUpApproval(input, followUpPreflight, output.citedRuleRefs)
    : undefined;
  const outputArtifacts = prrNegotiationDraftOutputArtifacts(input, draftHash);
  if (approval !== undefined) {
    const handoff = waitingForApprovalPrrHandoff(input, prepared, outputArtifacts, toolRequestId);
    return Object.freeze({
      handoff,
      eventIds: Object.freeze([
        ...invocation.eventIds,
        draftStep.id,
        approval.drafted.id,
        approval.requested.id
      ])
    });
  }
  let publication: Awaited<ReturnType<typeof appendPrrNegotiationDraftFinalOutput>>;
  try {
    publication = await appendPrrNegotiationDraftFinalOutput(input, prepared, handoffStore, readyForReviewPrrHandoffMaterial(
      input,
      prepared,
      outputArtifacts,
      {
        sourceEventIds: [draftStep.id, ...invocation.eventIds],
        relatedEventIds: [...invocation.eventIds, draftStep.id]
      }
    ));
  } catch {
    return await failedDraftHandoffStorageResult(input, prepared, [
      ...invocation.eventIds,
      draftStep.id
    ]);
  }
  let recorded: Awaited<ReturnType<typeof recordAuthorityBoundSpecialistHandoff>>;
  try {
    recorded = await recordAuthorityBoundSpecialistHandoff({
      ledger: input.ledger,
      manifestStore: publication.handoffStore,
      actor: input.actor,
      now: input.now,
      runId: input.runId,
      taskId: input.taskId,
      handoffAuthorityWitness
    });
  } catch {
    return blockedDraftHandoffAfterRecordFailure(input, prepared, outputArtifacts, [
      ...invocation.eventIds,
      draftStep.id,
      publication.finalOutput.id
    ]);
  }
  return Object.freeze({
    handoff: recorded.handoff,
    eventIds: Object.freeze([
      ...invocation.eventIds,
      draftStep.id,
      publication.finalOutput.id,
      recorded.prepared.id,
      recorded.recorded.id,
      recorded.terminal.id,
      recorded.taskStatus.id
    ])
  });
}

function blockedPrrContextHandoff(
  input: RunPrrNegotiationWorkflowInput,
  contextPackRefs: readonly import("./context-packs.js").ContextPackRef[]
): RunPrrNegotiationWorkflowResult {
  const handoff = parseLegacySpecialistWorkflowHandoff({
    schemaVersion: "agent-specialist-handoff.v1",
    runType: "prr-negotiation",
    runId: input.runId,
    taskId: input.taskId,
    residentAgentId: "agent_default",
    generatedAt: input.now(),
    status: "blocked",
    safeSummary: "PRR request context, jurisdiction, evidence, or governance posture is unavailable or stale.",
    contextPackRefs,
    outputArtifacts: [],
    toolRequestIds: [],
    approvalRequirements: [],
    nextSafeActions: [{
      actionId: `action_${input.runId}_inspect_context`,
      label: "Inspect current PRR request, jurisdiction, evidence, and governance context",
      kind: "inspect",
      effect: "none"
    }]
  });
  return Object.freeze({ handoff, eventIds: Object.freeze([]) });
}

function hasStalePrrAdvisoryContext(
  contextPackRefs: readonly import("./context-packs.js").ContextPackRef[]
): boolean {
  return contextPackRefs.some((ref) =>
    ["prr-read-model.v1", "jurisdiction-pack-summary.v1", "evidence-summary.v1"].includes(ref.contextPackId) &&
    (ref.stalenessInputs ?? []).some((input) => /(?:^|[-_])(?:stale|missing|unavailable)(?:$|[-_])/i.test(input.kind))
  );
}

async function resumePrrNegotiationDraftHandoff(
  input: RunPrrNegotiationWorkflowInput
): Promise<RunPrrNegotiationWorkflowResult | undefined> {
  const stream = await input.ledger.readStream(`agent_run_${input.runId}`);
  const finalOutput = stream.findLast((event) =>
    event.type === "agent.specialist-run.step.recorded" &&
    event.payload.runId === input.runId &&
    event.payload.stepKind === "final-output" &&
    event.payload.stepId === `step_${input.runId}_final_output`
  );
  if (finalOutput === undefined) return undefined;
  try {
    const recorded = await recordAuthorityBoundSpecialistHandoff({
      ledger: input.ledger,
      manifestStore: requirePrrNegotiationHandoffStore(input),
      actor: input.actor,
      now: input.now,
      runId: input.runId,
      taskId: input.taskId,
      handoffAuthorityWitness: requirePrrNegotiationHandoffAuthority(input)
    });
    return Object.freeze({
      handoff: recorded.handoff,
      eventIds: Object.freeze([
        finalOutput.id,
        recorded.prepared.id,
        recorded.recorded.id,
        recorded.terminal.id,
        recorded.taskStatus.id
      ])
    });
  } catch {
    return resumableDraftHandoffFromFinalOutput(input, finalOutput.id);
  }
}

function resumableDraftHandoffFromFinalOutput(
  input: RunPrrNegotiationWorkflowInput,
  finalOutputEventId: string
): RunPrrNegotiationWorkflowResult {
  const blocked = parseLegacySpecialistWorkflowHandoff({
    schemaVersion: "agent-specialist-handoff.v1",
    runType: "prr-negotiation",
    runId: input.runId,
    taskId: input.taskId,
    residentAgentId: "agent_default",
    generatedAt: input.now(),
    status: "blocked",
    safeSummary: "A durable PRR final output awaits verified handoff recording before review.",
    contextPackRefs: [],
    outputArtifacts: [],
    toolRequestIds: [],
    approvalRequirements: [],
    nextSafeActions: [{
      actionId: `action_${input.runId}_resume_handoff_recording`,
      label: "Repair PRR handoff storage and resume verified handoff recording",
      kind: "retry",
      effect: "none"
    }]
  });
  return Object.freeze({ handoff: blocked, eventIds: Object.freeze([finalOutputEventId]) });
}

function blockedDraftHandoffAfterRecordFailure(
  input: RunPrrNegotiationWorkflowInput,
  prepared: Awaited<ReturnType<typeof prepareSpecialistRun>>,
  outputArtifacts: readonly SpecialistOutputArtifactRef[],
  eventIds: readonly string[]
): RunPrrNegotiationWorkflowResult {
  const blocked = parseLegacySpecialistWorkflowHandoff({
    schemaVersion: "agent-specialist-handoff.v1",
    runType: "prr-negotiation",
    runId: input.runId,
    taskId: input.taskId,
    residentAgentId: "agent_default",
    generatedAt: input.now(),
    status: "blocked",
    safeSummary: "PRR negotiation draft remains local and requires handoff storage repair before review.",
    contextPackRefs: prepared.contextPackRefs,
    promptArtifactHash: prepared.promptArtifact.manifest.inputArtifactHash,
    outputArtifacts,
    toolRequestIds: [],
    approvalRequirements: [],
    nextSafeActions: [{
      actionId: `action_${input.runId}_repair_handoff_storage`,
      label: "Repair PRR handoff storage and resume verified handoff recording",
      kind: "retry",
      effect: "none",
      artifactId: `artifact_${input.runId}_draft`
    }]
  });
  return Object.freeze({ handoff: blocked, eventIds: Object.freeze([...eventIds]) });
}

async function failedDraftHandoffStorageResult(
  input: RunPrrNegotiationWorkflowInput,
  prepared: Awaited<ReturnType<typeof prepareSpecialistRun>>,
  eventIds: readonly string[]
): Promise<RunPrrNegotiationWorkflowResult> {
  const failure = await appendSpecialistFailure({
    ledger: input.ledger,
    actor: input.actor,
    now: input.now,
    runId: input.runId,
    category: "external-effect-failed",
    message: "PRR negotiation handoff storage could not be verified before review.",
    retryable: true,
    allowedActions: ["inspect local PRR handoff storage and start a new draft run"],
    ...(eventIds.at(-1) === undefined ? {} : { causationId: eventIds.at(-1) })
  });
  const handoff = parseLegacySpecialistWorkflowHandoff({
    schemaVersion: "agent-specialist-handoff.v1",
    runType: "prr-negotiation",
    runId: input.runId,
    taskId: input.taskId,
    residentAgentId: "agent_default",
    generatedAt: input.now(),
    status: "failed",
    safeSummary: "PRR negotiation could not verify local handoff storage before review.",
    contextPackRefs: prepared.contextPackRefs,
    promptArtifactHash: prepared.promptArtifact.manifest.inputArtifactHash,
    outputArtifacts: [],
    toolRequestIds: [],
    approvalRequirements: [],
    nextSafeActions: [{
      actionId: `action_${input.runId}_inspect_handoff_storage`,
      label: "Inspect local PRR handoff storage before starting a new draft run",
      kind: "inspect",
      effect: "none"
    }],
    failure: {
      category: "external-effect-failed",
      code: "prr-negotiation-handoff-storage-failed",
      safeSummary: "PRR negotiation handoff storage could not be verified before review.",
      retryable: true
    }
  });
  return Object.freeze({ handoff, eventIds: Object.freeze([...eventIds, failure.id]) });
}

async function appendPrrNegotiationDraftFinalOutput(
  input: RunPrrNegotiationWorkflowInput,
  prepared: Awaited<ReturnType<typeof prepareSpecialistRun>>,
  handoffStore: SpecialistHandoffManifestStore,
  handoffMaterial: ReturnType<typeof buildSpecialistHandoffMaterial>
) {
  const materialStore = requirePrrNegotiationMaterialStore(input);
  if (materialStore !== handoffStore) {
    await seedPrrNegotiationHandoffReferences(materialStore, prepared, handoffMaterial.outputArtifacts);
  }
  await seedPrrNegotiationHandoffReferences(handoffStore, prepared, handoffMaterial.outputArtifacts);
  const finalOutput = await appendSpecialistFinalOutputStep({
    ledger: input.ledger,
    materialStore,
    actor: input.actor,
    now: input.now,
    runId: input.runId,
    taskId: input.taskId,
    handoffMaterial
  });
  await copyPrrArtifactExact(
    materialStore,
    handoffStore,
    finalOutput.payload.handoffMaterialArtifactHash as `sha256:${string}`
  );
  return Object.freeze({ handoffStore, finalOutput });
}

function requirePrrNegotiationMaterialStore(
  input: RunPrrNegotiationWorkflowInput
): SpecialistHandoffManifestStore {
  const store = input.derivativeStore as SpecialistHandoffManifestStore | undefined;
  if (store === undefined || typeof store.put !== "function" || typeof store.get !== "function") {
    throw new Error("PRR negotiation requires the readable mounted material store before provider invocation.");
  }
  return store;
}

function requirePrrNegotiationHandoffStore(
  input: RunPrrNegotiationWorkflowInput
): SpecialistHandoffManifestStore {
  const store = input.handoffStore;
  if (store === undefined || typeof store.put !== "function" || typeof store.get !== "function") {
    throw new Error("PRR negotiation requires the current mounted handoff store before provider invocation.");
  }
  return store;
}

function requirePrrNegotiationHandoffAuthority(
  input: RunPrrNegotiationWorkflowInput
): MountedSpecialistHandoffAuthorityWitness {
  if (input.handoffAuthorityWitness === undefined) {
    throw new Error("PRR negotiation requires the current mounted handoff authority before provider invocation.");
  }
  return input.handoffAuthorityWitness;
}

function prrNegotiationDraftOutputArtifacts(
  input: RunPrrNegotiationWorkflowInput,
  draftHash: `sha256:${string}`
): readonly SpecialistOutputArtifactRef[] {
  return Object.freeze([{
    artifactId: `artifact_${input.runId}_draft`,
    artifactKind: "correspondence-draft-artifact",
    schemaId: "prr-negotiation-handoff.v1",
    artifactHash: draftHash,
    safeSummary: "Local PRR negotiation advisory artifact hash is ready for human review."
  }]);
}

function readyForReviewPrrHandoffMaterial(
  input: RunPrrNegotiationWorkflowInput,
  prepared: Awaited<ReturnType<typeof prepareSpecialistRun>>,
  outputArtifacts: readonly SpecialistOutputArtifactRef[],
  refs: {
    readonly sourceEventIds: readonly string[];
    readonly relatedEventIds: readonly string[];
  }
) {
  return buildSpecialistHandoffMaterial({
    status: "ready-for-review",
    safeSummary: "PRR negotiation advisory artifact is ready for human review.",
    contextPackRefs: prepared.contextPackRefs,
    promptArtifactHash: prepared.promptArtifact.manifest.inputArtifactHash as `sha256:${string}`,
    outputArtifacts,
    toolRequestIds: [],
    approvalRequirements: [],
    nextSafeActions: [{
      actionId: `action_${input.runId}_review`,
      label: "Review the PRR correspondence draft",
      kind: "review",
      effect: "none",
      artifactId: `artifact_${input.runId}_draft`
    }],
    sourceEventIds: refs.sourceEventIds,
    relatedEventIds: refs.relatedEventIds
  });
}

function waitingForApprovalPrrHandoff(
  input: RunPrrNegotiationWorkflowInput,
  prepared: Awaited<ReturnType<typeof prepareSpecialistRun>>,
  outputArtifacts: readonly SpecialistOutputArtifactRef[],
  toolRequestId: string
): LegacySpecialistWorkflowHandoffDto {
  return parseLegacySpecialistWorkflowHandoff({
    schemaVersion: "agent-specialist-handoff.v1",
    runType: "prr-negotiation",
    runId: input.runId,
    taskId: input.taskId,
    residentAgentId: "agent_default",
    generatedAt: input.now(),
    status: "waiting-for-approval",
    safeSummary: "PRR negotiation advisory artifact is ready for review and domain-supplied follow-up approval.",
    contextPackRefs: prepared.contextPackRefs,
    promptArtifactHash: prepared.promptArtifact.manifest.inputArtifactHash,
    outputArtifacts,
    toolRequestIds: [toolRequestId],
    approvalRequirements: [{
      approvalClass: "external-message-send",
      reason: "Human approval is required before a PRR follow-up can leave draft state.",
      toolRequestId
    }],
    nextSafeActions: [
      {
        actionId: `action_${input.runId}_review`,
        label: "Review the PRR correspondence draft",
        kind: "review",
        effect: "none",
        artifactId: `artifact_${input.runId}_draft`
      },
      {
        actionId: `action_${input.runId}_approval`,
        label: "Request follow-up send approval",
        kind: "request-approval",
        effect: "request-approval",
        toolRequestId
      }
    ]
  });
}

async function persistPrrNegotiationDraftArtifact(
  materialStore: SpecialistHandoffManifestStore,
  handoffStore: SpecialistHandoffManifestStore,
  artifact: Awaited<ReturnType<typeof writeSpecialistDerivativeArtifact>>
): Promise<void> {
  await copyPrrArtifactExact(materialStore, handoffStore, artifact.artifactHash, artifact.sizeBytes);
}

async function copyPrrArtifactExact(
  source: SpecialistHandoffManifestStore,
  target: SpecialistHandoffManifestStore,
  artifactHash: `sha256:${string}`,
  expectedSize?: number
): Promise<void> {
  const bytes = await source.get(artifactHash);
  if (!Buffer.isBuffer(bytes) || hashBytes(bytes) !== artifactHash ||
    (expectedSize !== undefined && bytes.byteLength !== expectedSize)) {
    throw new Error("PRR negotiation mounted material bytes are unavailable or mismatched.");
  }
  if (source !== target) {
    await assertStoreBindsHash(target, artifactHash, Buffer.from(bytes), "copied material artifact");
  }
}

async function seedPrrNegotiationHandoffReferences(
  store: SpecialistHandoffManifestStore,
  prepared: Awaited<ReturnType<typeof prepareSpecialistRun>>,
  outputArtifacts: readonly { readonly artifactHash: `sha256:${string}` }[]
): Promise<void> {
  const resolvedContextPacks = prepared.promptArtifact.resolvedContextPacks ?? [];
  const resolvedByHash = new Map(resolvedContextPacks.map((resolved) => [resolved.ref.contentHash, resolved]));
  for (const ref of prepared.contextPackRefs) {
    const resolved = resolvedByHash.get(ref.contentHash);
    if (resolved === undefined) {
      throw new Error("PRR negotiation durable handoff requires resolved context payload bytes for every context ref.");
    }
    await assertStoreBindsHash(
      store,
      ref.contentHash as `sha256:${string}`,
      Buffer.from(serializeContextPackPayload(resolved.payload)),
      "context pack payload"
    );
  }
  await assertStoreBindsHash(
    store,
    prepared.promptArtifact.manifest.inputArtifactHash as `sha256:${string}`,
    promptArtifactReferenceBytes(prepared.promptArtifact),
    "prompt artifact"
  );
  for (const artifact of outputArtifacts) {
    const bytes = await store.get(artifact.artifactHash);
    if (!Buffer.isBuffer(bytes) || hashBytes(bytes) !== artifact.artifactHash) {
      throw new Error("PRR negotiation durable handoff output artifact readback failed.");
    }
  }
}

async function assertStoreBindsHash(
  store: SpecialistHandoffManifestStore,
  contentHash: `sha256:${string}`,
  bytes: Buffer,
  label: string
): Promise<void> {
  const stored = await store.put(bytes);
  if (stored.contentHash !== contentHash || stored.sizeBytes !== bytes.byteLength) {
    throw new Error(`PRR negotiation durable handoff ${label} bytes do not match their content hash.`);
  }
  const readback = await store.get(contentHash);
  if (!Buffer.isBuffer(readback) || !readback.equals(bytes)) {
    throw new Error(`PRR negotiation durable handoff ${label} readback failed.`);
  }
}

function promptArtifactReferenceBytes(
  promptArtifact: Awaited<ReturnType<typeof prepareSpecialistRun>>["promptArtifact"]
): Buffer {
  const { inputArtifactHash: _inputArtifactHash, ...manifestWithoutHash } = promptArtifact.manifest;
  return Buffer.from(serializeContextPackPayload({
    manifest: manifestWithoutHash,
    text: promptArtifact.text
  }));
}

function hashBytes(bytes: Buffer): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function parseModelOutput(outputText: string) {
  try {
    const output = validateProductionSpecialistProviderOutput({
      runType: "prr-negotiation",
      value: JSON.parse(outputText)
    });
    return output.runType === "prr-negotiation" ? output.value : undefined;
  } catch {
    return undefined;
  }
}

function trustedPrrReferencesAreCurrent(
  input: RunPrrNegotiationWorkflowInput,
  prepared: Awaited<ReturnType<typeof prepareSpecialistRun>>
): boolean {
  const trusted = input.jurisdictionRuleRefs;
  if (trusted.length === 0 || new Set(trusted).size !== trusted.length) return false;
  const context = prrResolvedContextStrings(prepared);
  return trusted.every((ref) => context.has(ref));
}

function prrNegotiationReferencesAreExact(
  input: RunPrrNegotiationWorkflowInput,
  prepared: Awaited<ReturnType<typeof prepareSpecialistRun>>,
  output: NonNullable<ReturnType<typeof parseModelOutput>>
): boolean {
  const context = prrResolvedContextStrings(prepared);
  const trustedRules = new Set(input.jurisdictionRuleRefs);
  return output.citedRuleRefs.length > 0 &&
    new Set(output.citedRuleRefs).size === output.citedRuleRefs.length &&
    output.citedRuleRefs.every((ref) => trustedRules.has(ref) && context.has(ref)) &&
    output.jurisdictionRefs.length > 0 &&
    new Set(output.jurisdictionRefs).size === output.jurisdictionRefs.length &&
    output.jurisdictionRefs.every((ref) => context.has(ref)) &&
    output.deadlineRefs.length > 0 &&
    new Set(output.deadlineRefs).size === output.deadlineRefs.length &&
    output.deadlineRefs.every((ref) => context.has(ref));
}

function prrResolvedContextStrings(
  prepared: Awaited<ReturnType<typeof prepareSpecialistRun>>
): ReadonlySet<string> {
  const values = new Set<string>();
  for (const pack of prepared.promptArtifact.resolvedContextPacks ?? []) {
    collectPrrContextStrings(pack.payload, values);
    for (const ref of pack.ref.provenanceRefs) values.add(ref);
    for (const ref of pack.ref.sourceEventIds ?? []) values.add(ref);
    for (const ref of pack.ref.artifactHashes ?? []) values.add(ref);
  }
  return values;
}

function collectPrrContextStrings(value: unknown, output: Set<string>): void {
  if (typeof value === "string") {
    output.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectPrrContextStrings(item, output);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) collectPrrContextStrings(item, output);
  }
}

async function failedModelOutputResult(
  input: RunPrrNegotiationWorkflowInput,
  prepared: Awaited<ReturnType<typeof prepareSpecialistRun>>,
  invocationEventIds: readonly string[]
): Promise<RunPrrNegotiationWorkflowResult> {
  const failed = await appendSpecialistFailure({
    ledger: input.ledger,
    actor: input.actor,
    now: input.now,
    runId: input.runId,
    category: "model-output-invalid",
    message: "PRR negotiation model output did not match the required structured schema.",
    retryable: true,
    allowedActions: ["retry with a provider that returns the approved PRR negotiation schema"],
    ...(invocationEventIds.at(-1) === undefined ? {} : { causationId: invocationEventIds.at(-1) })
  });
  const handoff = parseLegacySpecialistWorkflowHandoff({
    schemaVersion: "agent-specialist-handoff.v1",
    runType: "prr-negotiation",
    runId: input.runId,
    taskId: input.taskId,
    residentAgentId: "agent_default",
    generatedAt: input.now(),
    status: "failed",
    safeSummary: "PRR negotiation could not produce a valid structured draft.",
    contextPackRefs: prepared.contextPackRefs,
    promptArtifactHash: prepared.promptArtifact.manifest.inputArtifactHash,
    outputArtifacts: [],
    toolRequestIds: [],
    approvalRequirements: [],
    nextSafeActions: [{
      actionId: `action_${input.runId}_retry_model`,
      label: "Retry PRR negotiation model output",
      kind: "retry",
      effect: "none"
    }],
    failure: {
      category: "model-output-invalid",
      code: "prr-negotiation-model-output-invalid",
      safeSummary: "Model output failed PRR negotiation schema validation.",
      retryable: true
    }
  });
  return Object.freeze({ handoff, eventIds: Object.freeze([...invocationEventIds, failed.id]) });
}

async function failedDerivativeArtifactResult(
  input: RunPrrNegotiationWorkflowInput,
  prepared: Awaited<ReturnType<typeof prepareSpecialistRun>>,
  invocationEventIds: readonly string[]
): Promise<RunPrrNegotiationWorkflowResult> {
  const failed = await appendSpecialistFailure({
    ledger: input.ledger,
    actor: input.actor,
    now: input.now,
    runId: input.runId,
    category: "external-effect-failed",
    message: "PRR negotiation derivative artifact storage failed before ledger publication.",
    retryable: true,
    allowedActions: ["inspect local derivative artifact storage and retry PRR negotiation"],
    ...(invocationEventIds.at(-1) === undefined ? {} : { causationId: invocationEventIds.at(-1) })
  });
  const handoff = parseLegacySpecialistWorkflowHandoff({
    schemaVersion: "agent-specialist-handoff.v1",
    runType: "prr-negotiation",
    runId: input.runId,
    taskId: input.taskId,
    residentAgentId: "agent_default",
    generatedAt: input.now(),
    status: "failed",
    safeSummary: "PRR negotiation could not publish the local advisory artifact.",
    contextPackRefs: prepared.contextPackRefs,
    promptArtifactHash: prepared.promptArtifact.manifest.inputArtifactHash,
    outputArtifacts: [],
    toolRequestIds: [],
    approvalRequirements: [],
    nextSafeActions: [{
      actionId: `action_${input.runId}_retry_storage`,
      label: "Retry PRR negotiation after derivative storage is healthy",
      kind: "retry",
      effect: "none"
    }],
    failure: {
      category: "external-effect-failed",
      code: "prr-negotiation-derivative-storage-failed",
      safeSummary: "Derivative artifact storage failed before any specialist step or tool request was recorded.",
      retryable: true
    }
  });
  return Object.freeze({ handoff, eventIds: Object.freeze([...invocationEventIds, failed.id]) });
}

async function requestFollowUpApproval(
  input: RunPrrNegotiationWorkflowInput,
  preflight: PrrNegotiationFollowUpApprovalPreflight,
  citedRuleRefs: readonly string[]
): Promise<{ readonly drafted: KnowledgeEvent; readonly requested: KnowledgeEvent }> {
  const drafted = await appendPrrFollowupDrafted(input, preflight.previewInput, citedRuleRefs);
  const preview = buildFollowUpApprovalPreview(input, preflight, drafted.id);
  const gateway = createAgentToolGateway({ ledger: input.ledger, actor: input.actor, now: input.now });
  const requested = await gateway.requestTool({
    toolRequestId: preflight.toolRequestId,
    residentAgentId: "agent_default",
    taskId: input.taskId,
    runId: input.runId,
    toolId: preview.toolId,
    toolVersion: preview.toolVersion,
    sideEffectClass: preview.sideEffectClass,
    requiredApprovalClass: "external-message-send",
    preview,
    inputArtifactHashes: prrPreviewArtifactHashes(preview)
  });
  return Object.freeze({ drafted, requested });
}

function preflightFollowUpApprovalPreview(
  input: RunPrrNegotiationWorkflowInput,
  toolRequestId: string
): PrrNegotiationFollowUpApprovalPreflight {
  if (input.followUpApprovalPreview === undefined) {
    throw new Error("PRR follow-up approval preview is required before running approval-capable PRR negotiation.");
  }
  const previewInput = normalizeSpecialistJsonValue(
    input.followUpApprovalPreview,
    "PRR follow-up approval preview"
  ) as PrrNegotiationFollowUpApprovalPreviewInput;
  const preflight = buildPrrCorrespondenceApprovalPreview({
    ...previewInput,
    toolRequestId,
    toolId: prrFollowUpExecuteDescriptor.toolId,
    toolVersion: prrFollowUpExecuteDescriptor.toolVersion,
    runId: input.runId,
    taskId: input.taskId,
    residentAgentId: "agent_default",
    prrRequestId: input.prrRequestId,
    correspondenceId: input.correspondenceId,
    messageSourceEventId: previewInput.messageSourceEventId
  });
  return Object.freeze({
    toolRequestId,
    previewInput,
    preflightPreview: preflight
  });
}

function buildFollowUpApprovalPreview(
  input: RunPrrNegotiationWorkflowInput,
  preflight: PrrNegotiationFollowUpApprovalPreflight,
  messageSourceEventId: string
): ReturnType<typeof buildPrrCorrespondenceApprovalPreview> {
  const preview = buildPrrCorrespondenceApprovalPreview({
    ...preflight.previewInput,
    toolRequestId: preflight.toolRequestId,
    toolId: prrFollowUpExecuteDescriptor.toolId,
    toolVersion: prrFollowUpExecuteDescriptor.toolVersion,
    runId: input.runId,
    taskId: input.taskId,
    residentAgentId: "agent_default",
    prrRequestId: input.prrRequestId,
    correspondenceId: input.correspondenceId,
    messageSourceEventId
  });
  assertFollowUpPreviewStillMatchesPreflight(preflight.preflightPreview, preview);
  return preview;
}

function assertFollowUpPreviewStillMatchesPreflight(
  preflight: ReturnType<typeof buildPrrCorrespondenceApprovalPreview>,
  preview: ReturnType<typeof buildPrrCorrespondenceApprovalPreview>
): void {
  if (
    preview.toolId !== preflight.toolId ||
    preview.toolVersion !== preflight.toolVersion ||
    preview.runId !== preflight.runId ||
    preview.taskId !== preflight.taskId ||
    preview.residentAgentId !== preflight.residentAgentId ||
    preview.prrRequestId !== preflight.prrRequestId ||
    preview.correspondenceId !== preflight.correspondenceId ||
    preview.provider !== preflight.provider ||
    preview.subjectHash !== preflight.subjectHash ||
    preview.bodyHash !== preflight.bodyHash ||
    preview.renderedBodyHash !== preflight.renderedBodyHash ||
    preview.providerIdempotencyKey !== preflight.providerIdempotencyKey ||
    !sameOrderedStrings(preview.artifactHashes ?? [], preflight.artifactHashes ?? [])
  ) {
    throw new Error("PRR follow-up approval preview changed after preflight validation.");
  }
}

function prrAdvisoryDomainSourceBindings(preflight: PrrNegotiationFollowUpApprovalPreflight) {
  const preview = preflight.preflightPreview;
  return Object.freeze({
    normalizedInputHash: requiredPreviewHash(preview, "normalizedInputHash"),
    relatedEventIds: Object.freeze([...(preview.relatedEventIds ?? [])]),
    artifactHashes: prrPreviewArtifactHashes(preview),
    provider: requiredPreviewString(preview, "provider"),
    subjectHash: requiredPreviewHash(preview, "subjectHash"),
    bodyHash: requiredPreviewHash(preview, "bodyHash"),
    renderedBodyHash: requiredPreviewHash(preview, "renderedBodyHash"),
    projectionHighWaterMarks: projectionHighWaterMarksFromPreview(preview)
  });
}

function requiredPreviewString(
  preview: ReturnType<typeof buildPrrCorrespondenceApprovalPreview>,
  key: string
): string {
  const value = preview[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`PRR advisory domain source binding missing ${key}.`);
  }
  assertAgentSecretSafeText(value, `PRR advisory domain source binding ${key}`);
  return value;
}

function requiredPreviewHash(
  preview: ReturnType<typeof buildPrrCorrespondenceApprovalPreview>,
  key: string
): `sha256:${string}` {
  const value = requiredPreviewString(preview, key);
  if (!/^sha256:[a-f0-9]{64}$/.test(value)) {
    throw new Error(`PRR advisory domain source binding has invalid ${key}.`);
  }
  return value as `sha256:${string}`;
}

function projectionHighWaterMarksFromPreview(
  preview: ReturnType<typeof buildPrrCorrespondenceApprovalPreview>
): readonly { readonly projectionName: string; readonly highWaterMark: number }[] {
  const value = preview.projectionHighWaterMarks;
  if (!Array.isArray(value)) {
    throw new Error("PRR advisory domain source binding missing projection high-water marks.");
  }
  return Object.freeze(value.map((candidate) => {
    if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new Error("PRR advisory domain source binding has invalid projection high-water mark.");
    }
    const projectionName = (candidate as { readonly projectionName?: unknown }).projectionName;
    const highWaterMark = (candidate as { readonly highWaterMark?: unknown }).highWaterMark;
    if (
      typeof projectionName !== "string" ||
      typeof highWaterMark !== "number" ||
      !Number.isSafeInteger(highWaterMark) ||
      highWaterMark < 0
    ) {
      throw new Error("PRR advisory domain source binding has invalid projection high-water mark.");
    }
    assertAgentSecretSafeText(projectionName, "PRR advisory projection high-water mark name");
    return Object.freeze({ projectionName, highWaterMark });
  }));
}

function prrPreviewArtifactHashes(preview: ReturnType<typeof buildPrrCorrespondenceApprovalPreview>): readonly `sha256:${string}`[] {
  const hashes = (preview.artifactHashes ?? []).map((hash) => {
    if (typeof hash !== "string" || !/^sha256:[a-f0-9]{64}$/.test(hash)) {
      throw new Error("PRR follow-up approval preview contains an invalid artifact hash.");
    }
    return hash as `sha256:${string}`;
  });
  return Object.freeze([...new Set(hashes)]);
}

function sameOrderedStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function appendPrrFollowupDrafted(
  input: RunPrrNegotiationWorkflowInput,
  previewInput: PrrNegotiationFollowUpApprovalPreviewInput,
  citedRuleRefs: readonly string[]
): Promise<KnowledgeEvent> {
  const event: AppendableKnowledgeEvent<"prr.followup.drafted"> = {
    type: "prr.followup.drafted",
    version: 1,
    streamId: input.prrRequestId,
    context: {
      actor: input.actor,
      occurredAt: input.now(),
      causationId: previewInput.requestState.initialSentEventId ?? previewInput.requestState.requestCreatedEventId,
      correlationId: `corr_${input.runId}_prr_followup_drafted`,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", prr: "0.1.0", agent: "0.1.0" }
    },
    payload: {
      prrRequestId: input.prrRequestId,
      correspondenceId: input.correspondenceId,
      subject: previewInput.message.subject,
      bodyHash: previewInput.message.renderedBodyHash,
      citedRules: citedRulesForDraft(previewInput, citedRuleRefs)
    }
  };
  return await input.ledger.append(event);
}

function citedRulesForDraft(
  previewInput: PrrNegotiationFollowUpApprovalPreviewInput,
  citedRuleRefs: readonly string[]
) {
  const projectedRules = previewInput.requestState.legalEscalation?.citedRules
    ?? previewInput.requestState.activeDeadline?.citedRules
    ?? [];
  if (projectedRules.length > 0) {
    return projectedRules.map((rule) => ({ ...rule, jurisdictionPack: { ...rule.jurisdictionPack } }));
  }
  return citedRuleRefs.map((ref) => ({
    jurisdictionPack: { ...previewInput.requestState.jurisdictionPack },
    label: ref,
    citation: ref
  }));
}
