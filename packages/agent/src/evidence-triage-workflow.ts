import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { z } from "zod";
import { providerParseExecuteDescriptor } from "./adapters/provider-byte-transfer.js";
import { serializeContextPackPayload } from "./context-packs.js";
import { buildSpecialistHandoffMaterial } from "./specialist-handoff-manifest.js";
import { assertAgentSecretSafeText } from "./secret-safety.js";
import {
  validateProductionSpecialistProviderOutput,
  type EvidenceTriageClassifyOutput
} from "./production-specialist-output-contracts.js";
import {
  parseLegacySpecialistWorkflowHandoff,
  type LegacySpecialistWorkflowHandoffDto,
  type SpecialistNextAction
} from "./specialist-handoffs.js";
import {
  appendSpecialistDerivativeStep,
  appendSpecialistFinalOutputStep,
  assertSpecialistDerivativeStoreAvailable,
  assertSpecialistStepNotRecorded,
  finalizeSpecialistRunAfterHandoff,
  invokeSpecialistModel,
  normalizeSpecialistJsonValue,
  prepareSpecialistRun,
  recordSpecialistHandoff,
  writeSpecialistDerivativeArtifact,
  type SpecialistDerivativeArtifactStore,
  type SpecialistHandoffManifestStore,
  type SpecialistRunnerBaseInput
} from "./specialist-runner-kernel.js";
import type { AgentToolPreview } from "./tool-gateway.js";

const evidenceIdSchema = z.string().regex(/^ev_[a-zA-Z0-9_-]+$/);
type EvidenceTriageModelOutput = EvidenceTriageClassifyOutput;

export interface RunEvidenceTriageWorkflowInput extends SpecialistRunnerBaseInput {
  readonly evidenceIds: readonly string[];
  readonly providerParseApprovalPreview?: AgentToolPreview;
}

export interface RunEvidenceTriageWorkflowResult {
  readonly handoff: LegacySpecialistWorkflowHandoffDto;
  readonly eventIds: readonly string[];
}

interface NormalizedEvidenceTriagePreviews {
  readonly providerParseApprovalPreview: AgentToolPreview;
  readonly sourceBindings: EvidenceTriageSourceBindingBundle;
}

interface EvidenceTriageSourceBindingBundle {
  readonly providerParseToolId: "ingestion.provider-parse.execute";
  readonly providerJobId?: string;
  readonly sourceCollectionId?: string;
  readonly importBatchId?: string;
  readonly evidence: readonly {
    readonly evidenceId: string;
    readonly evidenceEventId: string;
    readonly linkEventId: string;
    readonly contentHash: `sha256:${string}`;
  }[];
  readonly relatedEventIds: readonly string[];
  readonly artifactHashes: readonly `sha256:${string}`[];
  readonly promptArtifactHash?: `sha256:${string}`;
}

interface EvidenceTriageEvidenceSnapshot {
  readonly ids: readonly string[];
  readonly idSet: ReadonlySet<string>;
}

export async function runEvidenceTriageWorkflow(
  input: RunEvidenceTriageWorkflowInput
): Promise<RunEvidenceTriageWorkflowResult> {
  const evidenceSnapshot = snapshotCurrentRunEvidenceIds(input.evidenceIds);
  if (evidenceSnapshot.ids.length === 0) {
    return blockedHandoff(input, "Evidence references are required before triage can begin.");
  }
  assertSpecialistDerivativeStoreAvailable(input);
  const previews = assertApprovalPreviewsAvailable(input, evidenceSnapshot.idSet);
  await assertSpecialistStepNotRecorded(input.ledger, input.runId, "step_evidence_triage_local_artifacts");

  const prepared = await prepareSpecialistRun(input, "evidence-triage");
  const invocationId = `inv_${input.runId}_evidence_triage`;
  const invocation = await invokeSpecialistModel(input, prepared, invocationId);
  const output = parseModelOutput(invocation.outputText);
  if (output === undefined) {
    return await failedModelOutputResult(input, prepared, invocation.eventIds);
  }
  if (!modelEvidenceReferencesBelongToRun(output, evidenceSnapshot.idSet)) {
    return await failedModelOutputResult(input, prepared, invocation.eventIds);
  }

  let artifactHashes: EvidenceTriageArtifactHashes;
  try {
    artifactHashes = await writeEvidenceTriageArtifacts(
      input.derivativeStore,
      input,
      evidenceSnapshot.ids,
      output,
      previews.sourceBindings
    );
  } catch {
    return await failedDerivativeArtifactResult(input, prepared, invocation.eventIds);
  }
  const step = await appendSpecialistDerivativeStep({
    ledger: input.ledger,
    actor: input.actor,
    now: input.now,
    runId: input.runId,
    stepId: "step_evidence_triage_local_artifacts",
    invocationId,
    summary: "Created local evidence triage dossier, summaries, governance flags, duplicate groups, gaps, and candidate bundle hashes for review.",
    inputArtifactHashes: [prepared.promptArtifact.manifest.inputArtifactHash, invocation.outputArtifactHash],
    outputArtifactHashes: Object.values(artifactHashes)
  });
  const nextSafeActions = localReviewNextActions(input, output);
  const handoff = parseLegacySpecialistWorkflowHandoff({
    schemaVersion: "agent-specialist-handoff.v1",
    runType: "evidence-triage",
    runId: input.runId,
    taskId: input.taskId,
    residentAgentId: "agent_default",
    generatedAt: input.now(),
    status: output.requestProviderParseApproval ? "blocked" : "ready-for-review",
    safeSummary: output.requestProviderParseApproval
      ? "Evidence triage artifacts are local-only; provider parse was not queued because the provider execution service is not registered for this runner."
      : "Evidence triage artifacts are ready for local human review.",
    contextPackRefs: prepared.contextPackRefs,
    promptArtifactHash: prepared.promptArtifact.manifest.inputArtifactHash,
    outputArtifacts: [
      { artifactId: `artifact_${input.runId}_dossier`, artifactKind: "triage-dossier", schemaId: "evidence-triage-handoff.v1", artifactHash: artifactHashes.dossierHash, safeSummary: "Local evidence triage dossier hash is ready for review." },
      { artifactId: `artifact_${input.runId}_summaries`, artifactKind: "safe-evidence-summaries", schemaId: "evidence-triage-handoff.v1", artifactHash: artifactHashes.safeSummariesHash, safeSummary: "Safe evidence summary bundle hash is ready for review." },
      { artifactId: `artifact_${input.runId}_governance`, artifactKind: "sensitive-quarantine-flags", schemaId: "evidence-triage-handoff.v1", artifactHash: artifactHashes.governanceFlagsHash, safeSummary: "Governance and quarantine flag hash is ready for review." },
      { artifactId: `artifact_${input.runId}_duplicates`, artifactKind: "duplicate-groups", schemaId: "evidence-triage-handoff.v1", artifactHash: artifactHashes.duplicateGroupsHash, safeSummary: "Duplicate group hash is ready for review." },
      { artifactId: `artifact_${input.runId}_gaps`, artifactKind: "evidence-gap-list", schemaId: "evidence-triage-handoff.v1", artifactHash: artifactHashes.evidenceGapsHash, safeSummary: "Evidence gap list hash is ready for review." },
      { artifactId: `artifact_${input.runId}_candidates`, artifactKind: "assertion-candidate-bundle", schemaId: "evidence-triage-handoff.v1", artifactHash: artifactHashes.assertionCandidatesHash, safeSummary: "Local assertion candidate bundle hash requires review before any ontology action." }
    ],
    toolRequestIds: [],
    approvalRequirements: [],
    nextSafeActions
  });
  const publication = await publishEvidenceTriageDurableHandoff(input, prepared, handoff, {
    sourceEventIds: previews.sourceBindings.relatedEventIds,
    relatedEventIds: [...invocation.eventIds, step.id, ...previews.sourceBindings.relatedEventIds]
  });
  return Object.freeze({
    handoff,
    eventIds: Object.freeze([
      ...invocation.eventIds,
      step.id,
      publication.finalOutput.id,
      publication.recorded.prepared.id,
      publication.recorded.recorded.id,
      publication.finalized.terminal.id
    ])
  });
}

async function publishEvidenceTriageDurableHandoff(
  input: RunEvidenceTriageWorkflowInput,
  prepared: Awaited<ReturnType<typeof prepareSpecialistRun>>,
  handoff: LegacySpecialistWorkflowHandoffDto,
  refs: {
    readonly sourceEventIds: readonly string[];
    readonly relatedEventIds: readonly string[];
  }
) {
  const handoffStore = evidenceTriageHandoffStore(input.derivativeStore);
  await seedEvidenceTriageHandoffReferences(handoffStore, prepared, handoff.outputArtifacts);
  const handoffMaterial = buildSpecialistHandoffMaterial({
    status: handoff.status,
    safeSummary: handoff.safeSummary,
    contextPackRefs: prepared.contextPackRefs,
    promptArtifactHash: prepared.promptArtifact.manifest.inputArtifactHash as `sha256:${string}`,
    outputArtifacts: handoff.outputArtifacts,
    toolRequestIds: handoff.toolRequestIds,
    approvalRequirements: handoff.approvalRequirements,
    nextSafeActions: handoff.nextSafeActions,
    ...(handoff.failure === undefined ? {} : { failure: handoff.failure }),
    sourceEventIds: refs.sourceEventIds,
    relatedEventIds: refs.relatedEventIds
  });
  const finalOutput = await appendSpecialistFinalOutputStep({
    ledger: input.ledger,
    materialStore: handoffStore,
    actor: input.actor,
    now: input.now,
    runId: input.runId,
    taskId: input.taskId,
    handoffMaterial
  });
  const recorded = await recordSpecialistHandoff({
    ledger: input.ledger,
    manifestStore: handoffStore,
    actor: input.actor,
    now: input.now,
    runId: input.runId,
    taskId: input.taskId
  });
  const finalized = await finalizeSpecialistRunAfterHandoff({
    ledger: input.ledger,
    actor: input.actor,
    now: input.now,
    recorded
  });
  return Object.freeze({ finalOutput, recorded, finalized });
}

function parseModelOutput(outputText: string) {
  try {
    const output = validateProductionSpecialistProviderOutput({
      runType: "evidence-triage",
      value: JSON.parse(outputText)
    });
    return output.runType === "evidence-triage" ? output.value : undefined;
  } catch {
    return undefined;
  }
}

function evidenceTriageHandoffStore(store: SpecialistDerivativeArtifactStore | undefined): SpecialistHandoffManifestStore {
  const candidate = store as unknown;
  if (
    typeof candidate === "object" &&
    candidate !== null &&
    typeof (candidate as { readonly put?: unknown }).put === "function" &&
    typeof (candidate as { readonly get?: unknown }).get === "function"
  ) {
    return candidate as SpecialistHandoffManifestStore;
  }
  throw new Error("Evidence triage durable handoff requires content-addressed artifact readback.");
}

async function seedEvidenceTriageHandoffReferences(
  store: SpecialistHandoffManifestStore,
  prepared: Awaited<ReturnType<typeof prepareSpecialistRun>>,
  outputArtifacts: readonly { readonly artifactHash: `sha256:${string}` }[]
): Promise<void> {
  const resolvedContextPacks = prepared.promptArtifact.resolvedContextPacks ?? [];
  const resolvedByHash = new Map(resolvedContextPacks.map((resolved) => [resolved.ref.contentHash, resolved]));
  for (const ref of prepared.contextPackRefs) {
    const resolved = resolvedByHash.get(ref.contentHash);
    if (resolved === undefined) {
      throw new Error("Evidence triage durable handoff requires resolved context payload bytes for every context ref.");
    }
    const payloadBytes = Buffer.from(serializeContextPackPayload(resolved.payload));
    await assertStoreBindsHash(store, ref.contentHash as `sha256:${string}`, payloadBytes, "context pack payload");
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
      throw new Error("Evidence triage durable handoff output artifact readback failed.");
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
    throw new Error(`Evidence triage durable handoff ${label} bytes do not match their content hash.`);
  }
  const readback = await store.get(contentHash);
  if (!Buffer.isBuffer(readback) || !readback.equals(bytes)) {
    throw new Error(`Evidence triage durable handoff ${label} readback failed.`);
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

function assertApprovalPreviewsAvailable(
  input: RunEvidenceTriageWorkflowInput,
  runEvidenceIds: ReadonlySet<string>
): NormalizedEvidenceTriagePreviews {
  const missing = [
    ["provider parse approval preview", input.providerParseApprovalPreview]
  ].filter(([, preview]) => preview === undefined).map(([label]) => label);
  if (missing.length > 0) {
    throw new Error(`Evidence triage requires ${missing.join(", ")} before model invocation.`);
  }
  return assertApprovalPreviewBindings(input, runEvidenceIds);
}

function assertApprovalPreviewBindings(
  input: RunEvidenceTriageWorkflowInput,
  runEvidenceIds: ReadonlySet<string>
): NormalizedEvidenceTriagePreviews {
  const providerParseApprovalPreview = normalizePreview(input.providerParseApprovalPreview!, "Evidence triage provider-parse approval preview");
  const sourceBindings = assertProviderParseApprovalPreview(providerParseApprovalPreview, input, runEvidenceIds);
  return Object.freeze({
    providerParseApprovalPreview,
    sourceBindings
  });
}

function assertProviderParseApprovalPreview(
  preview: AgentToolPreview,
  input: RunEvidenceTriageWorkflowInput,
  runEvidenceIds: ReadonlySet<string>
): EvidenceTriageSourceBindingBundle {
  assertPlainPreviewData(preview, "Evidence triage provider-parse approval preview");
  assertPreviewMatchesRun(preview, input, providerParseExecuteDescriptor.toolId);
  if (readPreviewString(preview, "schemaVersion", providerParseExecuteDescriptor.toolId) !== "agent-domain-preview.v1") {
    throw new Error("Evidence triage provider-parse preview must use the authoritative domain preview schema.");
  }
  if (readPreviewString(preview, "toolVersion", providerParseExecuteDescriptor.toolId) !== providerParseExecuteDescriptor.toolVersion) {
    throw new Error("Evidence triage provider-parse preview has a stale tool version.");
  }
  if (readPreviewString(preview, "sideEffectClass", providerParseExecuteDescriptor.toolId) !== "external-byte-transfer") {
    throw new Error("Evidence triage provider-parse preview must disclose external byte transfer.");
  }
  if (readPreviewString(preview, "requiredApprovalClass", providerParseExecuteDescriptor.toolId) !== "provider-byte-transfer") {
    throw new Error("Evidence triage provider-parse preview must require provider byte-transfer approval.");
  }
  if (readPreviewString(preview, "inputSchemaId", providerParseExecuteDescriptor.toolId) !== providerParseExecuteDescriptor.inputSchemaId) {
    throw new Error("Evidence triage provider-parse preview has a stale input schema.");
  }

  const artifactHashes = artifactHashesFromPreview(preview);
  const relatedEventIds = readPreviewStringArray(preview, "relatedEventIds", providerParseExecuteDescriptor.toolId);
  const bindings = readProviderEvidenceBindings(preview, providerParseExecuteDescriptor.toolId);
  if (bindings.length === 0) {
    throw new Error("Evidence triage provider-parse preview must bind at least one evidence item.");
  }
  const previewEvidenceIds = bindings.map((binding) => binding.evidenceId).sort();
  const runEvidenceIdValues = [...runEvidenceIds].sort();
  if (!sameOrderedStrings(previewEvidenceIds, runEvidenceIdValues)) {
    throw new Error("Evidence triage provider-parse preview evidence IDs must exactly match the current run evidence IDs.");
  }
  for (const binding of bindings) {
    if (!runEvidenceIds.has(binding.evidenceId)) {
      throw new Error("Evidence triage provider-parse preview references evidence outside the current run.");
    }
    if (!relatedEventIds.includes(binding.evidenceEventId) || !relatedEventIds.includes(binding.linkEventId)) {
      throw new Error("Evidence triage provider-parse preview source event bindings are incomplete.");
    }
    if (!artifactHashes.includes(binding.contentHash)) {
      throw new Error("Evidence triage provider-parse preview artifact bindings are incomplete.");
    }
  }
  const promptArtifactHash = readOptionalPreviewHash(preview, "promptArtifactHash");
  if (promptArtifactHash !== undefined && !artifactHashes.includes(promptArtifactHash)) {
    throw new Error("Evidence triage provider-parse preview prompt artifact hash is not request-bound.");
  }
  return sourceBindingBundleFromPreview({
    preview,
    input,
    bindings,
    relatedEventIds,
    artifactHashes,
    ...(promptArtifactHash === undefined ? {} : { promptArtifactHash })
  });
}

function assertPreviewMatchesRun(
  preview: AgentToolPreview,
  input: RunEvidenceTriageWorkflowInput,
  expectedToolId: string
): void {
  if (
    readPreviewString(preview, "runId", expectedToolId) !== input.runId ||
    readPreviewString(preview, "taskId", expectedToolId) !== input.taskId ||
    readPreviewString(preview, "residentAgentId", expectedToolId) !== "agent_default" ||
    readPreviewString(preview, "toolId", expectedToolId) !== expectedToolId
  ) {
    throw new Error("Evidence triage approval preview does not match the current run.");
  }
}

function readPreviewString(
  preview: AgentToolPreview,
  key: string,
  label: string,
  fallback?: string
): string {
  const record = previewDataRecord(preview, `Evidence triage ${label} approval preview`);
  const value = readOptionalData(record, key);
  if (value === undefined && fallback !== undefined) {
    return fallback;
  }
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Evidence triage ${label} approval preview is missing ${key}.`);
  }
  assertAgentSecretSafeText(value, `evidence triage ${label} preview ${key}`);
  return value;
}

function readPreviewStringArray(
  preview: AgentToolPreview,
  key: string,
  label: string
): readonly string[] {
  const record = previewDataRecord(preview, `Evidence triage ${label} approval preview`);
  const value = readOptionalData(record, key);
  if (!Array.isArray(value)) {
    throw new Error(`Evidence triage ${label} approval preview is missing ${key}.`);
  }
  return readUniqueStringArray(value, /^evt_[a-zA-Z0-9_-]+$/, `Evidence triage ${label} approval preview ${key}`);
}

function readOptionalPreviewHash(
  preview: AgentToolPreview,
  key: string
): `sha256:${string}` | undefined {
  const record = previewDataRecord(preview, "Evidence triage provider-parse approval preview");
  const value = readOptionalData(record, key);
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value)) {
    throw new Error(`Evidence triage provider-parse approval preview has invalid ${key}.`);
  }
  return value as `sha256:${string}`;
}

function readOptionalPreviewString(
  preview: AgentToolPreview,
  key: string,
  label: string
): string | undefined {
  const record = previewDataRecord(preview, label);
  const value = readOptionalData(record, key);
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} has invalid ${key}.`);
  }
  assertAgentSecretSafeText(value, `${label} ${key}`);
  return value;
}

function sourceBindingBundleFromPreview(input: {
  readonly preview: AgentToolPreview;
  readonly input: RunEvidenceTriageWorkflowInput;
  readonly bindings: readonly {
    readonly evidenceId: string;
    readonly evidenceEventId: string;
    readonly linkEventId: string;
    readonly contentHash: `sha256:${string}`;
  }[];
  readonly relatedEventIds: readonly string[];
  readonly artifactHashes: readonly `sha256:${string}`[];
  readonly promptArtifactHash?: `sha256:${string}`;
}): EvidenceTriageSourceBindingBundle {
  const label = "Evidence triage provider-parse approval preview";
  const providerJobId = readOptionalPreviewString(input.preview, "providerJobId", label);
  const sourceCollectionId = readOptionalPreviewString(input.preview, "sourceCollectionId", label);
  const importBatchId = readOptionalPreviewString(input.preview, "importBatchId", label);
  return Object.freeze({
    providerParseToolId: "ingestion.provider-parse.execute",
    ...(providerJobId === undefined ? {} : { providerJobId }),
    ...(sourceCollectionId === undefined ? {} : { sourceCollectionId }),
    ...(importBatchId === undefined ? {} : { importBatchId }),
    evidence: Object.freeze(input.bindings.map((binding) => Object.freeze({ ...binding }))),
    relatedEventIds: Object.freeze([...input.relatedEventIds]),
    artifactHashes: Object.freeze([...input.artifactHashes]),
    ...(input.promptArtifactHash === undefined ? {} : { promptArtifactHash: input.promptArtifactHash })
  });
}

function readProviderEvidenceBindings(
  preview: AgentToolPreview,
  label: string
): readonly {
  readonly evidenceId: string;
  readonly evidenceEventId: string;
  readonly linkEventId: string;
  readonly contentHash: `sha256:${string}`;
}[] {
  const record = previewDataRecord(preview, `Evidence triage ${label} approval preview`);
  const value = readOptionalData(record, "evidenceBindings");
  if (!Array.isArray(value)) {
    throw new Error(`Evidence triage ${label} approval preview is missing evidenceBindings.`);
  }
  const seen = new Set<string>();
  return Object.freeze(readPlainArray(value, `Evidence triage ${label} evidenceBindings`).map((candidate) => {
    const binding = previewDataRecord(candidate, `Evidence triage ${label} evidence binding`);
    const evidenceId = readOptionalData(binding, "evidenceId");
    const evidenceEventId = readOptionalData(binding, "evidenceEventId");
    const linkEventId = readOptionalData(binding, "linkEventId");
    const contentHash = readOptionalData(binding, "contentHash");
    if (
      typeof evidenceId !== "string" ||
      typeof evidenceEventId !== "string" ||
      typeof linkEventId !== "string" ||
      typeof contentHash !== "string" ||
      !/^ev_[a-zA-Z0-9_-]+$/.test(evidenceId) ||
      !/^sha256:[a-f0-9]{64}$/.test(contentHash)
    ) {
      throw new Error(`Evidence triage ${label} approval preview has invalid evidence binding fields.`);
    }
    const dedupeKey = `${evidenceId}\u0000${evidenceEventId}\u0000${linkEventId}\u0000${contentHash}`;
    if (seen.has(dedupeKey)) {
      throw new Error(`Evidence triage ${label} approval preview contains duplicate evidence bindings.`);
    }
    seen.add(dedupeKey);
    return Object.freeze({
      evidenceId,
      evidenceEventId,
      linkEventId,
      contentHash: contentHash as `sha256:${string}`
    });
  }));
}

function previewDataRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a plain data object.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} must be a plain data object.`);
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new Error(`${label} must not contain symbol-keyed fields.`);
  }
  const record = value as Record<string, unknown>;
  const enumerableKeys = Object.keys(record);
  if (Object.getOwnPropertyNames(record).length !== enumerableKeys.length) {
    throw new Error(`${label} must not contain non-enumerable fields.`);
  }
  for (const key of enumerableKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new Error(`${label} must contain only own enumerable data properties.`);
    }
  }
  return record;
}

function readOptionalData(record: Record<string, unknown>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (descriptor === undefined) {
    return undefined;
  }
  if (!("value" in descriptor)) {
    throw new Error("Evidence triage approval preview must contain only own enumerable data properties.");
  }
  return descriptor.value;
}

function assertPlainPreviewData(value: unknown, label: string): void {
  normalizeSpecialistJsonValue(value, label);
}

function normalizePreview(value: AgentToolPreview, label: string): AgentToolPreview {
  return Object.freeze(normalizeSpecialistJsonValue(value, label) as AgentToolPreview);
}

function readPlainArray(value: readonly unknown[], label: string): readonly unknown[] {
  const keys = Object.keys(value);
  const expected = Array.from({ length: value.length }, (_, index) => String(index));
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} must not contain custom array fields.`);
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new Error(`${label} must not contain symbol-keyed fields.`);
  }
  const allowed = new Set(["length", ...expected]);
  for (const key of Object.getOwnPropertyNames(value)) {
    if (!allowed.has(key)) {
      throw new Error(`${label} must not contain unsupported array fields.`);
    }
  }
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new Error(`${label} must contain only own data items.`);
    }
  }
  return Object.freeze(keys.map((key) => Object.getOwnPropertyDescriptor(value, key)!.value));
}

function readUniqueStringArray(
  value: readonly unknown[],
  pattern: RegExp,
  label: string
): readonly string[] {
  const items = readPlainArray(value, label);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    if (typeof item !== "string" || !pattern.test(item)) {
      throw new Error(`${label} contains an invalid value.`);
    }
    if (seen.has(item)) {
      throw new Error(`${label} contains duplicate values.`);
    }
    seen.add(item);
    result.push(item);
  }
  return Object.freeze(result);
}

function artifactHashesFromPreview(preview: AgentToolPreview): readonly `sha256:${string}`[] {
  const record = previewDataRecord(preview, "Evidence triage approval preview");
  const value = readOptionalData(record, "artifactHashes");
  if (value === undefined) {
    return Object.freeze([]);
  }
  if (!Array.isArray(value)) {
    throw new Error("Evidence triage approval preview artifactHashes must be an array.");
  }
  return readUniqueStringArray(
    value,
    /^sha256:[a-f0-9]{64}$/,
    "Evidence triage approval preview artifactHashes"
  ) as readonly `sha256:${string}`[];
}

interface EvidenceTriageArtifactHashes {
  readonly dossierHash: `sha256:${string}`;
  readonly safeSummariesHash: `sha256:${string}`;
  readonly governanceFlagsHash: `sha256:${string}`;
  readonly duplicateGroupsHash: `sha256:${string}`;
  readonly evidenceGapsHash: `sha256:${string}`;
  readonly assertionCandidatesHash: `sha256:${string}`;
}

function evidenceTriageArtifactPayloads(
  input: RunEvidenceTriageWorkflowInput,
  evidenceIds: readonly string[],
  output: EvidenceTriageModelOutput,
  sourceBindings: EvidenceTriageSourceBindingBundle
) {
  return Object.freeze({
    dossier: Object.freeze({
      schemaVersion: "evidence-triage-handoff.v1",
      artifactKind: "triage-dossier",
      runId: input.runId,
      taskId: input.taskId,
      evidenceIds: [...evidenceIds],
      sourceBindings,
      dossierSummary: output.dossierSummary
    }),
    safeSummaries: Object.freeze({
      schemaVersion: "evidence-triage-handoff.v1",
      artifactKind: "safe-evidence-summaries",
      runId: input.runId,
      taskId: input.taskId,
      evidenceIds: [...evidenceIds],
      sourceBindings,
      safeSummaries: [...output.safeSummaries]
    }),
    governanceFlags: Object.freeze({
      schemaVersion: "evidence-triage-handoff.v1",
      artifactKind: "sensitive-quarantine-flags",
      runId: input.runId,
      taskId: input.taskId,
      evidenceIds: [...evidenceIds],
      sourceBindings,
      governanceFlags: output.governanceFlags.map((flag) => ({ ...flag }))
    }),
    duplicateGroups: Object.freeze({
      schemaVersion: "evidence-triage-handoff.v1",
      artifactKind: "duplicate-groups",
      runId: input.runId,
      taskId: input.taskId,
      evidenceIds: [...evidenceIds],
      sourceBindings,
      duplicateGroups: output.duplicateGroups.map((group) => ({
        ...group,
        evidenceIds: [...group.evidenceIds]
      }))
    }),
    evidenceGaps: Object.freeze({
      schemaVersion: "evidence-triage-handoff.v1",
      artifactKind: "evidence-gap-list",
      runId: input.runId,
      taskId: input.taskId,
      evidenceIds: [...evidenceIds],
      sourceBindings,
      evidenceGaps: [...output.evidenceGaps]
    }),
    assertionCandidates: Object.freeze({
      schemaVersion: "evidence-triage-handoff.v1",
      artifactKind: "assertion-candidate-bundle",
      runId: input.runId,
      taskId: input.taskId,
      evidenceIds: [...evidenceIds],
      sourceBindings,
      assertionCandidates: output.assertionCandidates.map((candidate) => ({ ...candidate }))
    })
  });
}

async function writeEvidenceTriageArtifacts(
  derivativeStore: SpecialistDerivativeArtifactStore | undefined,
  input: RunEvidenceTriageWorkflowInput,
  evidenceIds: readonly string[],
  output: EvidenceTriageModelOutput,
  sourceBindings: EvidenceTriageSourceBindingBundle
): Promise<EvidenceTriageArtifactHashes> {
  const payloads = evidenceTriageArtifactPayloads(input, evidenceIds, output, sourceBindings);
  const dossier = await writeSpecialistDerivativeArtifact({ derivativeStore, artifactKind: "triage-dossier", payload: payloads.dossier });
  const safeSummaries = await writeSpecialistDerivativeArtifact({ derivativeStore, artifactKind: "safe-evidence-summaries", payload: payloads.safeSummaries });
  const governanceFlags = await writeSpecialistDerivativeArtifact({ derivativeStore, artifactKind: "sensitive-quarantine-flags", payload: payloads.governanceFlags });
  const duplicateGroups = await writeSpecialistDerivativeArtifact({ derivativeStore, artifactKind: "duplicate-groups", payload: payloads.duplicateGroups });
  const evidenceGaps = await writeSpecialistDerivativeArtifact({ derivativeStore, artifactKind: "evidence-gap-list", payload: payloads.evidenceGaps });
  const assertionCandidates = await writeSpecialistDerivativeArtifact({ derivativeStore, artifactKind: "assertion-candidate-bundle", payload: payloads.assertionCandidates });
  return Object.freeze({
    dossierHash: dossier.artifactHash,
    safeSummariesHash: safeSummaries.artifactHash,
    governanceFlagsHash: governanceFlags.artifactHash,
    duplicateGroupsHash: duplicateGroups.artifactHash,
    evidenceGapsHash: evidenceGaps.artifactHash,
    assertionCandidatesHash: assertionCandidates.artifactHash
  });
}

function snapshotCurrentRunEvidenceIds(evidenceIds: readonly string[]): EvidenceTriageEvidenceSnapshot {
  const normalized = normalizeSpecialistJsonValue(evidenceIds, "Evidence triage input evidenceIds");
  if (!Array.isArray(normalized)) {
    throw new Error("Evidence triage input evidenceIds must be a plain array.");
  }
  const seen = new Set<string>();
  const ids: string[] = [];
  for (let index = 0; index < normalized.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(normalized, String(index));
    if (descriptor === undefined || !("value" in descriptor) || typeof descriptor.value !== "string") {
      throw new Error("Evidence triage input evidenceIds must contain only own enumerable data properties.");
    }
    const evidenceId = descriptor.value;
    if (!evidenceIdSchema.safeParse(evidenceId).success) {
      throw new Error("Evidence triage input evidenceIds must be well-formed evidence references.");
    }
    if (seen.has(evidenceId)) {
      throw new Error("Evidence triage input evidenceIds must be unique.");
    }
    seen.add(evidenceId);
    ids.push(evidenceId);
  }
  return Object.freeze({ ids: Object.freeze(ids), idSet: seen });
}

function modelEvidenceReferencesBelongToRun(
  output: EvidenceTriageModelOutput,
  runEvidenceIds: ReadonlySet<string>
): boolean {
  const referenced = [
    ...output.governanceFlags.map((flag) => flag.evidenceId),
    ...output.duplicateGroups.flatMap((group) => group.evidenceIds),
    ...output.assertionCandidates.map((candidate) => candidate.evidenceId)
  ];
  for (const evidenceId of referenced) {
    if (!runEvidenceIds.has(evidenceId)) {
      return false;
    }
  }
  return true;
}

function localReviewNextActions(
  input: RunEvidenceTriageWorkflowInput,
  output: EvidenceTriageModelOutput
): readonly SpecialistNextAction[] {
  const actions: SpecialistNextAction[] = [{
    actionId: `action_${input.runId}_review`,
    label: "Review local evidence triage artifacts",
    kind: "review",
    effect: "none",
    artifactId: `artifact_${input.runId}_dossier`
  }];
  if (output.requestProviderParseApproval) {
    actions.push({
      actionId: `action_${input.runId}_inspect_provider_parse`,
      label: "Inspect provider parse readiness; no tool request was queued because provider execution service is not registered",
      kind: "inspect",
      effect: "none",
      artifactId: `artifact_${input.runId}_gaps`
    });
  }
  if (output.requestGovernanceReview || output.governanceFlags.length > 0) {
    actions.push({
      actionId: `action_${input.runId}_review_governance`,
      label: "Review local governance flag artifact; adapter not registered",
      kind: "review",
      effect: "none",
      artifactId: `artifact_${input.runId}_governance`
    });
  }
  if (output.requestQuarantineReview) {
    actions.push({
      actionId: `action_${input.runId}_review_quarantine`,
      label: "Review local quarantine suggestion artifact; adapter not registered",
      kind: "review",
      effect: "none",
      artifactId: `artifact_${input.runId}_governance`
    });
  }
  if (output.requestAssertionProposalReview || output.assertionCandidates.length > 0) {
    actions.push({
      actionId: `action_${input.runId}_review_assertions`,
      label: "Review local assertion candidate artifact; adapter not registered",
      kind: "review",
      effect: "none",
      artifactId: `artifact_${input.runId}_candidates`
    });
  }
  return Object.freeze(actions);
}

async function failedModelOutputResult(
  input: RunEvidenceTriageWorkflowInput,
  prepared: Awaited<ReturnType<typeof prepareSpecialistRun>>,
  invocationEventIds: readonly string[]
): Promise<RunEvidenceTriageWorkflowResult> {
  const handoff = parseLegacySpecialistWorkflowHandoff({
    schemaVersion: "agent-specialist-handoff.v1",
    runType: "evidence-triage",
    runId: input.runId,
    taskId: input.taskId,
    residentAgentId: "agent_default",
    generatedAt: input.now(),
    status: "failed",
    safeSummary: "Evidence triage could not produce valid structured artifacts.",
    contextPackRefs: prepared.contextPackRefs,
    promptArtifactHash: prepared.promptArtifact.manifest.inputArtifactHash,
    outputArtifacts: [],
    toolRequestIds: [],
    approvalRequirements: [],
    nextSafeActions: [{
      actionId: `action_${input.runId}_retry_model`,
      label: "Retry evidence triage model output",
      kind: "retry",
      effect: "none"
    }],
    failure: {
      category: "model-output-invalid",
      code: "evidence-triage-model-output-invalid",
      safeSummary: "Model output failed evidence triage schema validation.",
      retryable: true
    }
  });
  const publication = await publishEvidenceTriageDurableHandoff(input, prepared, handoff, {
    sourceEventIds: invocationEventIds,
    relatedEventIds: invocationEventIds
  });
  return Object.freeze({
    handoff,
    eventIds: Object.freeze([
      ...invocationEventIds,
      publication.finalOutput.id,
      publication.recorded.prepared.id,
      publication.recorded.recorded.id,
      publication.finalized.terminal.id
    ])
  });
}

async function failedDerivativeArtifactResult(
  input: RunEvidenceTriageWorkflowInput,
  prepared: Awaited<ReturnType<typeof prepareSpecialistRun>>,
  invocationEventIds: readonly string[]
): Promise<RunEvidenceTriageWorkflowResult> {
  const handoff = parseLegacySpecialistWorkflowHandoff({
    schemaVersion: "agent-specialist-handoff.v1",
    runType: "evidence-triage",
    runId: input.runId,
    taskId: input.taskId,
    residentAgentId: "agent_default",
    generatedAt: input.now(),
    status: "failed",
    safeSummary: "Evidence triage could not publish local derivative artifacts.",
    contextPackRefs: prepared.contextPackRefs,
    promptArtifactHash: prepared.promptArtifact.manifest.inputArtifactHash,
    outputArtifacts: [],
    toolRequestIds: [],
    approvalRequirements: [],
    nextSafeActions: [{
      actionId: `action_${input.runId}_retry_storage`,
      label: "Retry evidence triage after derivative storage is healthy",
      kind: "retry",
      effect: "none"
    }],
    failure: {
      category: "external-effect-failed",
      code: "evidence-triage-derivative-storage-failed",
      safeSummary: "Derivative artifact storage failed before any specialist step or tool request was recorded.",
      retryable: true
    }
  });
  const publication = await publishEvidenceTriageDurableHandoff(input, prepared, handoff, {
    sourceEventIds: invocationEventIds,
    relatedEventIds: invocationEventIds
  });
  return Object.freeze({
    handoff,
    eventIds: Object.freeze([
      ...invocationEventIds,
      publication.finalOutput.id,
      publication.recorded.prepared.id,
      publication.recorded.recorded.id,
      publication.finalized.terminal.id
    ])
  });
}

function blockedHandoff(
  input: RunEvidenceTriageWorkflowInput,
  summary: string
): RunEvidenceTriageWorkflowResult {
  const handoff = parseLegacySpecialistWorkflowHandoff({
    schemaVersion: "agent-specialist-handoff.v1",
    runType: "evidence-triage",
    runId: input.runId,
    taskId: input.taskId,
    residentAgentId: "agent_default",
    generatedAt: input.now(),
    status: "blocked",
    safeSummary: summary,
    contextPackRefs: [],
    outputArtifacts: [],
    toolRequestIds: [],
    approvalRequirements: [],
    nextSafeActions: [{
      actionId: `action_${input.runId}_inspect`,
      label: "Inspect evidence triage inputs",
      kind: "inspect",
      effect: "none"
    }]
  });
  return Object.freeze({ handoff, eventIds: Object.freeze([]) });
}

function sameOrderedStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
