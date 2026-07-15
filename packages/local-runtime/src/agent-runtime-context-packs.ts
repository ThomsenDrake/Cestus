import {
  contextPackDescriptorSchema,
  contextPackRefSchema,
  createContextPackRegistry,
  hashAgentContextPack,
  hasVerifiedResolvedContextPackParserAuthority,
  serializeContextPackPayload,
  type AgentContextPackJsonValue,
  type ContextPackDescriptor,
  type ContextPackRef,
  type ContextPackRegistry,
  type ContextPackScope,
  type VerifiedResolvedContextPack
} from "../../agent/src/index.js";

export interface MountedWorkspaceRuntimeAuthority {
  readonly authorityVersion: "mounted-workspace-runtime-authority.v1";
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  readonly workspaceIdentityEventId: string;
  readonly policyVersion: string;
  readonly sourceHighWaterMark: number;
  reverify(input: RuntimeAuthorityReverificationInput): Promise<unknown>;
}

export interface RuntimeAuthorityReverificationInput {
  readonly schemaVersion: "mounted-runtime-authority-reverification.v1";
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  readonly workspaceIdentityEventId: string;
  readonly policyVersion: string;
  readonly sourceHighWaterMark: number;
  readonly runId: string;
}

export interface ContextRegistrationBinding {
  readonly schemaVersion: "context-registration-binding.v1";
  /** The mount that authorizes this registration, independent of pack scope. */
  readonly workspaceId: string;
  readonly contextPackId: string;
  readonly version: number;
  readonly descriptorHash: string;
  readonly parserIdentity: string;
  /** Package producer identity; it is not a source-projection alias. */
  readonly producerIdentity: string;
  /** Package registration identity, distinct from the builder's producer identity. */
  readonly registrationIdentity: string;
  readonly sourceProjection: string;
  readonly scope: ContextPackScope;
  readonly sourceHighWaterMark: number;
  readonly selectionProof: ContextPackSelectionProof;
  readonly contentHash: string;
  readonly sizeBytes: number;
  readonly policyVersion: string;
  readonly provenanceRefs: readonly string[];
}

/**
 * Bounded package-family selection evidence. The mounted runtime does not
 * invent a generic payload grammar: it consumes only these frozen proof forms
 * after the package-owned parser has authenticated the resolved envelope.
 */
export type ContextPackSelectionProof =
  | {
    readonly kind: "operational-ref.v1";
  }
  | {
    readonly kind: "prr-selected-request.v1";
    readonly streamHighWaterMark: number;
  }
  | {
    readonly kind: "prr-jurisdiction.v1";
    readonly selectedRequestEventId: string;
  }
  | {
    readonly kind: "selection-manifest.v1";
    readonly manifestHash: string;
    readonly sourceHighWaterMark: number;
  }
  | {
    readonly kind: "investigative-selection-manifest.v1";
    readonly manifestHash: string;
    readonly sourceProjectionHighWaterMarks: readonly ContextProjectionHighWaterMark[];
  };

export interface ContextProjectionHighWaterMark {
  readonly projection: "agent" | "governance" | "graph" | "ingestion";
  readonly highWaterMark: number;
}

export interface VerifyMountedContextForRunInput {
  readonly schemaVersion: "verify-mounted-context-for-run.v1";
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  readonly workspaceIdentityEventId: string;
  readonly policyVersion: string;
  readonly sourceHighWaterMark: number;
  readonly runId: string;
  readonly requiredContextPackIds: readonly string[];
}

export interface MountedContextCapability {
  readonly capabilityVersion: "mounted-agent-context.v1";
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  verifyForRun(input: VerifyMountedContextForRunInput): Promise<VerifiedContextBindingSet>;
}

export interface VerifiedContextBindingSet {
  readonly schemaVersion: "verified-context-binding-set.v1";
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  readonly workspaceIdentityEventId: string;
  readonly policyVersion: string;
  readonly sourceHighWaterMark: number;
  readonly runId: string;
  readonly contextPacks: readonly VerifiedResolvedContextPack[];
  readonly bindings: readonly VerifiedContextBinding[];
}

export interface VerifiedContextBinding {
  readonly contextPackId: string;
  readonly version: number;
  readonly descriptorHash: string;
  readonly parserIdentity: string;
  readonly producerIdentity: string;
  readonly registrationIdentity: string;
  readonly sourceProjection: string;
  readonly scope: ContextPackScope;
  readonly contentHash: string;
  readonly sizeBytes: number;
  readonly sourceHighWaterMark: number;
  readonly selectionProof: ContextPackSelectionProof;
  /** Present only for selection-manifest-bound package families. */
  readonly selectionManifestHash?: string;
  readonly policyVersion: string;
  readonly provenanceRefs: readonly string[];
}

interface CanonicalMountedAuthority {
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  readonly workspaceIdentityEventId: string;
  readonly policyVersion: string;
  readonly sourceHighWaterMark: number;
  readonly reverify: (input: RuntimeAuthorityReverificationInput) => Promise<unknown>;
}

interface CanonicalAuthorityReverification {
  readonly ok: boolean;
  readonly workspaceId?: string;
  readonly mountInstanceId?: string;
  readonly workspaceIdentityEventId?: string;
  readonly policyVersion?: string;
  readonly sourceHighWaterMark?: number;
  readonly runId?: string;
}

const mountedContextCapabilities = new WeakSet<object>();
const verifiedContextBindingSets = new WeakSet<object>();
const hashPattern = /^sha256:[a-f0-9]{64}$/;

/**
 * Creates a factory-owned, mounted context capability. The registry is
 * deliberately private: callers supply only a frozen registration manifest
 * and the factory registration callback, never a usable registry or cache.
 */
export function createMountedAgentContextCapability(input: {
  readonly authority: MountedWorkspaceRuntimeAuthority;
  readonly registrations: readonly ContextRegistrationBinding[];
  readonly registerBuilders: (registry: ContextPackRegistry) => void;
}): MountedContextCapability {
  const canonicalInput = ownDataRecord(input, "mounted-context-capability-input");
  requireExactKeys(canonicalInput, ["authority", "registrations", "registerBuilders"], "mounted-context-capability-input");
  if (typeof canonicalInput.registerBuilders !== "function") {
    throw blocked("invalid-mounted-context-capability-input");
  }

  const authority = canonicalAuthority(canonicalInput.authority);
  const registrations = canonicalRegistrations(canonicalInput.registrations, authority);
  const registrationsById = new Map(registrations.map((registration) => [registration.contextPackId, registration]));
  const registry = createContextPackRegistry();
  try {
    canonicalInput.registerBuilders(registry);
  } catch {
    throw blocked("context-registration-failed");
  }
  assertExactFactoryRegistry(registry, registrations);

  const capability: MountedContextCapability = Object.freeze({
    capabilityVersion: "mounted-agent-context.v1" as const,
    workspaceId: authority.workspaceId,
    mountInstanceId: authority.mountInstanceId,
    async verifyForRun(rawInput: VerifyMountedContextForRunInput): Promise<VerifiedContextBindingSet> {
      const request = canonicalVerifyForRunInput(rawInput);
      assertRequestMatchesMountedAuthority(request, authority);

      const reverificationInput = Object.freeze({
        schemaVersion: "mounted-runtime-authority-reverification.v1" as const,
        workspaceId: request.workspaceId,
        mountInstanceId: request.mountInstanceId,
        workspaceIdentityEventId: request.workspaceIdentityEventId,
        policyVersion: request.policyVersion,
        sourceHighWaterMark: request.sourceHighWaterMark,
        runId: request.runId
      });
      let rawReverification: unknown;
      try {
        rawReverification = await authority.reverify(reverificationInput);
      } catch {
        throw blocked("mounted-authority-unavailable");
      }
      const reverification = canonicalAuthorityReverification(rawReverification);
      if (!reverification.ok) {
        throw blocked("mounted-authority-unavailable");
      }
      assertReverificationMatchesMountedAuthority(reverification, authority, request);

      // A retained registration callback cannot turn this private registry into
      // a fallback/cache authority after it has been mounted.
      assertExactFactoryRegistry(registry, registrations);

      const contextPacks: VerifiedResolvedContextPack[] = [];
      const bindings: VerifiedContextBinding[] = [];
      for (const contextPackId of request.requiredContextPackIds) {
        const registration = registrationsById.get(contextPackId);
        if (registration === undefined) {
          throw blocked("context-pack-not-mounted");
        }

        let resolved: VerifiedResolvedContextPack;
        try {
          resolved = await registry.buildResolved(contextPackId);
        } catch {
          throw blocked("context-pack-resolution-failed");
        }
        const verified = verifyMountedResolvedPack(resolved, registration, authority);
        contextPacks.push(verified.contextPack);
        bindings.push(verified.binding);
      }

      const bindingSet = Object.freeze({
        schemaVersion: "verified-context-binding-set.v1" as const,
        workspaceId: authority.workspaceId,
        mountInstanceId: authority.mountInstanceId,
        workspaceIdentityEventId: authority.workspaceIdentityEventId,
        policyVersion: authority.policyVersion,
        sourceHighWaterMark: authority.sourceHighWaterMark,
        runId: request.runId,
        contextPacks: Object.freeze([...contextPacks]),
        bindings: Object.freeze([...bindings])
      });
      verifiedContextBindingSets.add(bindingSet);
      return bindingSet;
    }
  });
  mountedContextCapabilities.add(capability);
  return capability;
}

export function hasMountedContextCapability(value: unknown): value is MountedContextCapability {
  return typeof value === "object" && value !== null && mountedContextCapabilities.has(value);
}

export function hasVerifiedContextBindingSet(value: unknown): value is VerifiedContextBindingSet {
  return typeof value === "object" && value !== null && verifiedContextBindingSets.has(value);
}

function canonicalAuthority(value: unknown): CanonicalMountedAuthority {
  const record = ownDataRecord(value, "mounted-runtime-authority");
  requireExactKeys(record, [
    "authorityVersion",
    "workspaceId",
    "mountInstanceId",
    "workspaceIdentityEventId",
    "policyVersion",
    "sourceHighWaterMark",
    "reverify"
  ], "mounted-runtime-authority");
  if (record.authorityVersion !== "mounted-workspace-runtime-authority.v1" || typeof record.reverify !== "function") {
    throw blocked("invalid-mounted-runtime-authority");
  }
  return Object.freeze({
    workspaceId: requiredText(record.workspaceId, "workspace-id"),
    mountInstanceId: requiredText(record.mountInstanceId, "mount-instance-id"),
    workspaceIdentityEventId: requiredText(record.workspaceIdentityEventId, "workspace-identity-event-id"),
    policyVersion: requiredText(record.policyVersion, "policy-version"),
    sourceHighWaterMark: requiredNonnegativeInteger(record.sourceHighWaterMark, "source-high-water-mark"),
    reverify: record.reverify as CanonicalMountedAuthority["reverify"]
  });
}

function canonicalRegistrations(
  value: unknown,
  authority: CanonicalMountedAuthority
): readonly ContextRegistrationBinding[] {
  const rawRegistrations = ownDataArray(value, "context-registrations");
  if (rawRegistrations.length === 0) {
    throw blocked("invalid-context-registrations");
  }
  const ids = new Set<string>();
  const registrations = rawRegistrations.map((rawRegistration) => {
    const record = ownDataRecord(rawRegistration, "context-registration");
    requireExactKeys(record, [
      "schemaVersion",
      "workspaceId",
      "contextPackId",
      "version",
      "descriptorHash",
      "parserIdentity",
      "producerIdentity",
      "registrationIdentity",
      "sourceProjection",
      "scope",
      "sourceHighWaterMark",
      "selectionProof",
      "contentHash",
      "sizeBytes",
      "policyVersion",
      "provenanceRefs"
    ], "context-registration");
    if (record.schemaVersion !== "context-registration-binding.v1") {
      throw blocked("invalid-context-registration");
    }
    const contextPackId = requiredText(record.contextPackId, "context-pack-id");
    if (ids.has(contextPackId)) {
      throw blocked("duplicate-context-pack-registration");
    }
    ids.add(contextPackId);
    const scope = canonicalScope(record.scope, "context-registration-scope");
    const workspaceId = requiredText(record.workspaceId, "workspace-id");
    const sourceProjection = requiredText(record.sourceProjection, "source-projection");
    const producerIdentity = requiredText(record.producerIdentity, "producer-identity");
    const registrationIdentity = requiredText(record.registrationIdentity, "registration-identity");
    const sourceHighWaterMark = requiredNonnegativeInteger(record.sourceHighWaterMark, "source-high-water-mark");
    if (workspaceId !== authority.workspaceId ||
      requiredText(record.policyVersion, "policy-version") !== authority.policyVersion ||
      sourceHighWaterMark > authority.sourceHighWaterMark) {
      throw blocked("context-registration-mismatch");
    }
    return Object.freeze({
      schemaVersion: "context-registration-binding.v1" as const,
      workspaceId,
      contextPackId,
      version: requiredPositiveInteger(record.version, "context-pack-version"),
      descriptorHash: requiredHash(record.descriptorHash, "descriptor-hash"),
      parserIdentity: requiredText(record.parserIdentity, "parser-identity"),
      producerIdentity,
      registrationIdentity,
      sourceProjection,
      scope,
      sourceHighWaterMark,
      selectionProof: canonicalSelectionProof(record.selectionProof),
      contentHash: requiredHash(record.contentHash, "content-hash"),
      sizeBytes: requiredNonnegativeInteger(record.sizeBytes, "size-bytes"),
      policyVersion: authority.policyVersion,
      provenanceRefs: Object.freeze(ownDataArray(record.provenanceRefs, "context-registration-provenance-refs")
        .map((ref) => requiredText(ref, "provenance-ref")))
    });
  });
  return Object.freeze(registrations);
}

function canonicalSelectionProof(value: unknown): ContextPackSelectionProof {
  const record = ownDataRecord(value, "context-selection-proof");
  const kind = record.kind;
  if (kind === "operational-ref.v1") {
    requireExactKeys(record, ["kind"], "context-selection-proof");
    return Object.freeze({ kind });
  }
  if (kind === "prr-selected-request.v1") {
    requireExactKeys(record, ["kind", "streamHighWaterMark"], "context-selection-proof");
    return Object.freeze({
      kind,
      streamHighWaterMark: requiredNonnegativeInteger(record.streamHighWaterMark, "selection-stream-high-water-mark")
    });
  }
  if (kind === "prr-jurisdiction.v1") {
    requireExactKeys(record, ["kind", "selectedRequestEventId"], "context-selection-proof");
    return Object.freeze({
      kind,
      selectedRequestEventId: requiredText(record.selectedRequestEventId, "selection-request-event-id")
    });
  }
  if (kind === "selection-manifest.v1") {
    requireExactKeys(record, ["kind", "manifestHash", "sourceHighWaterMark"], "context-selection-proof");
    return Object.freeze({
      kind,
      manifestHash: requiredHash(record.manifestHash, "selection-manifest-hash"),
      sourceHighWaterMark: requiredNonnegativeInteger(record.sourceHighWaterMark, "selection-manifest-source-high-water-mark")
    });
  }
  if (kind === "investigative-selection-manifest.v1") {
    requireExactKeys(record, ["kind", "manifestHash", "sourceProjectionHighWaterMarks"], "context-selection-proof");
    return Object.freeze({
      kind,
      manifestHash: requiredHash(record.manifestHash, "selection-manifest-hash"),
      sourceProjectionHighWaterMarks: canonicalProjectionHighWaterMarks(record.sourceProjectionHighWaterMarks)
    });
  }
  throw blocked("invalid-context-selection-proof");
}

function canonicalProjectionHighWaterMarks(value: unknown): readonly ContextProjectionHighWaterMark[] {
  const rows = ownDataArray(value, "context-selection-projection-high-water-marks");
  if (rows.length === 0) {
    throw blocked("invalid-context-selection-proof");
  }
  const projections = new Set<string>();
  const normalized = rows.map((value) => {
    const record = ownDataRecord(value, "context-selection-projection-high-water-mark");
    requireExactKeys(record, ["projection", "highWaterMark"], "context-selection-projection-high-water-mark");
    const projection = requiredProjectionName(record.projection);
    if (projections.has(projection)) {
      throw blocked("invalid-context-selection-proof");
    }
    projections.add(projection);
    return Object.freeze({
      projection,
      highWaterMark: requiredNonnegativeInteger(record.highWaterMark, "selection-projection-high-water-mark")
    });
  });
  return Object.freeze(normalized.sort((left, right) => left.projection.localeCompare(right.projection)));
}

function requiredProjectionName(value: unknown): ContextProjectionHighWaterMark["projection"] {
  if (value === "agent" || value === "governance" || value === "graph" || value === "ingestion") {
    return value;
  }
  throw blocked("invalid-context-selection-proof");
}

function canonicalVerifyForRunInput(value: unknown): VerifyMountedContextForRunInput {
  const record = ownDataRecord(value, "verify-mounted-context-for-run");
  requireExactKeys(record, [
    "schemaVersion",
    "workspaceId",
    "mountInstanceId",
    "workspaceIdentityEventId",
    "policyVersion",
    "sourceHighWaterMark",
    "runId",
    "requiredContextPackIds"
  ], "verify-mounted-context-for-run");
  if (record.schemaVersion !== "verify-mounted-context-for-run.v1") {
    throw blocked("invalid-verify-mounted-context-for-run");
  }
  const ids = new Set<string>();
  const requiredContextPackIds = ownDataArray(record.requiredContextPackIds, "verify-mounted-context-for-run")
    .map((rawContextPackId) => {
      const contextPackId = requiredText(rawContextPackId, "context-pack-id");
      if (ids.has(contextPackId)) {
        throw blocked("duplicate-context-pack-requirement");
      }
      ids.add(contextPackId);
      return contextPackId;
    });
  if (requiredContextPackIds.length === 0) {
    throw blocked("invalid-verify-mounted-context-for-run");
  }
  return Object.freeze({
    schemaVersion: "verify-mounted-context-for-run.v1" as const,
    workspaceId: requiredText(record.workspaceId, "workspace-id"),
    mountInstanceId: requiredText(record.mountInstanceId, "mount-instance-id"),
    workspaceIdentityEventId: requiredText(record.workspaceIdentityEventId, "workspace-identity-event-id"),
    policyVersion: requiredText(record.policyVersion, "policy-version"),
    sourceHighWaterMark: requiredNonnegativeInteger(record.sourceHighWaterMark, "source-high-water-mark"),
    runId: requiredText(record.runId, "run-id"),
    requiredContextPackIds: Object.freeze(requiredContextPackIds)
  });
}

function canonicalAuthorityReverification(value: unknown): CanonicalAuthorityReverification {
  const record = ownDataRecord(value, "mounted-runtime-authority-reverification");
  if (record.ok === false) {
    requireExactKeys(record, ["schemaVersion", "ok", "category"], "mounted-runtime-authority-reverification");
    if (record.schemaVersion !== "mounted-runtime-authority-reverification.v1" || typeof record.category !== "string") {
      throw blocked("invalid-mounted-authority-reverification");
    }
    return Object.freeze({ ok: false });
  }
  requireExactKeys(record, [
    "schemaVersion",
    "ok",
    "workspaceId",
    "mountInstanceId",
    "workspaceIdentityEventId",
    "policyVersion",
    "sourceHighWaterMark",
    "runId"
  ], "mounted-runtime-authority-reverification");
  if (record.schemaVersion !== "mounted-runtime-authority-reverification.v1" || record.ok !== true) {
    throw blocked("invalid-mounted-authority-reverification");
  }
  return Object.freeze({
    ok: true,
    workspaceId: requiredText(record.workspaceId, "workspace-id"),
    mountInstanceId: requiredText(record.mountInstanceId, "mount-instance-id"),
    workspaceIdentityEventId: requiredText(record.workspaceIdentityEventId, "workspace-identity-event-id"),
    policyVersion: requiredText(record.policyVersion, "policy-version"),
    sourceHighWaterMark: requiredNonnegativeInteger(record.sourceHighWaterMark, "source-high-water-mark"),
    runId: requiredText(record.runId, "run-id")
  });
}

function assertRequestMatchesMountedAuthority(
  request: VerifyMountedContextForRunInput,
  authority: CanonicalMountedAuthority
): void {
  if (request.workspaceId !== authority.workspaceId || request.mountInstanceId !== authority.mountInstanceId ||
    request.workspaceIdentityEventId !== authority.workspaceIdentityEventId || request.policyVersion !== authority.policyVersion ||
    request.sourceHighWaterMark !== authority.sourceHighWaterMark) {
    throw blocked("workspace-identity-mismatch");
  }
}

function assertReverificationMatchesMountedAuthority(
  reverification: CanonicalAuthorityReverification,
  authority: CanonicalMountedAuthority,
  request: VerifyMountedContextForRunInput
): void {
  if (reverification.workspaceId !== authority.workspaceId || reverification.mountInstanceId !== authority.mountInstanceId ||
    reverification.workspaceIdentityEventId !== authority.workspaceIdentityEventId || reverification.policyVersion !== authority.policyVersion ||
    reverification.sourceHighWaterMark !== authority.sourceHighWaterMark || reverification.runId !== request.runId) {
    throw blocked("workspace-identity-mismatch");
  }
}

function assertExactFactoryRegistry(
  registry: ContextPackRegistry,
  registrations: readonly ContextRegistrationBinding[]
): void {
  let rawDescriptors: readonly unknown[];
  try {
    rawDescriptors = ownDataArray(registry.listDescriptors(), "factory-context-descriptors");
  } catch {
    throw blocked("context-registration-mismatch");
  }
  if (rawDescriptors.length !== registrations.length) {
    throw blocked("context-registration-mismatch");
  }
  const descriptors = new Map<string, ContextPackDescriptor>();
  for (const rawDescriptor of rawDescriptors) {
    let descriptor: ContextPackDescriptor;
    try {
      descriptor = contextPackDescriptorSchema.parse(rawDescriptor);
    } catch {
      throw blocked("context-registration-mismatch");
    }
    if (descriptors.has(descriptor.contextPackId)) {
      throw blocked("context-registration-mismatch");
    }
    descriptors.set(descriptor.contextPackId, descriptor);
  }
  for (const registration of registrations) {
    const descriptor = descriptors.get(registration.contextPackId);
    if (descriptor === undefined || descriptor.version !== registration.version ||
      descriptor.sourceProjection !== registration.sourceProjection ||
      hashAgentContextPack(descriptor) !== registration.descriptorHash) {
      throw blocked("context-registration-mismatch");
    }
  }
}

function verifyMountedResolvedPack(
  value: unknown,
  registration: ContextRegistrationBinding,
  authority: CanonicalMountedAuthority
): { readonly contextPack: VerifiedResolvedContextPack; readonly binding: VerifiedContextBinding } {
  if (!hasVerifiedResolvedContextPackParserAuthority(value, registration.contextPackId, registration.parserIdentity)) {
    throw blocked("context-pack-parser-authority-mismatch");
  }
  const resolvedRecord = ownDataRecord(value, "verified-resolved-context-pack");
  requireExactKeys(resolvedRecord, ["ref", "payload"], "verified-resolved-context-pack");
  let ref;
  try {
    ref = contextPackRefSchema.parse(resolvedRecord.ref);
  } catch {
    throw blocked("context-pack-resolution-failed");
  }
  const payload = canonicalJsonValue(resolvedRecord.payload, "context-pack-payload");
  const payloadBytesHash = hashAgentContextPack(payload);
  const payloadSizeBytes = serializeContextPackPayload(payload).byteLength;

  if (ref.contextPackId !== registration.contextPackId || ref.version !== registration.version) {
    throw blocked("context-pack-descriptor-mismatch");
  }
  if (ref.contentHash !== registration.contentHash || payloadBytesHash !== registration.contentHash ||
    ref.sizeBytes !== registration.sizeBytes || payloadSizeBytes !== registration.sizeBytes) {
    throw blocked("context-pack-content-mismatch");
  }
  if (ref.scope === undefined || !sameScope(ref.scope, registration.scope)) {
    throw blocked("workspace-identity-mismatch");
  }
  if (ref.projectionHighWaterMark !== registration.sourceHighWaterMark) {
    throw blocked("context-pack-source-high-water-mismatch");
  }
  if (ref.policyVersion !== registration.policyVersion || ref.policyVersion !== authority.policyVersion) {
    throw blocked("context-pack-policy-mismatch");
  }
  if (!sameTextArray(ref.provenanceRefs, registration.provenanceRefs)) {
    throw blocked("context-pack-provenance-mismatch");
  }

  verifyBoundedSelectionProof(payload, ref, registration);

  const contextPack = value as VerifiedResolvedContextPack;
  return Object.freeze({
    contextPack,
    binding: Object.freeze({
      contextPackId: ref.contextPackId,
      version: ref.version,
      descriptorHash: registration.descriptorHash,
      parserIdentity: registration.parserIdentity,
      producerIdentity: registration.producerIdentity,
      registrationIdentity: registration.registrationIdentity,
      sourceProjection: registration.sourceProjection,
      scope: registration.scope,
      contentHash: ref.contentHash,
      sizeBytes: ref.sizeBytes,
      sourceHighWaterMark: registration.sourceHighWaterMark,
      selectionProof: registration.selectionProof,
      ...(selectionManifestHashForProof(registration.selectionProof) === undefined
        ? {}
        : { selectionManifestHash: selectionManifestHashForProof(registration.selectionProof) }),
      policyVersion: registration.policyVersion,
      provenanceRefs: registration.provenanceRefs
    })
  });
}

function verifyBoundedSelectionProof(
  payload: AgentContextPackJsonValue,
  ref: ContextPackRef,
  registration: ContextRegistrationBinding
): void {
  const payloadRecord = ownDataRecord(payload, "context-pack-payload");
  const proof = registration.selectionProof;
  if (proof.kind === "operational-ref.v1") {
    if ("selectionManifest" in payloadRecord || !hasProjectionHighWaterStaleness(ref, registration.sourceHighWaterMark)) {
      throw blocked("context-pack-selection-manifest-mismatch");
    }
    return;
  }
  if (proof.kind === "prr-selected-request.v1") {
    const scope = canonicalScope(payloadRecord.scope, "prr-context-pack-scope");
    const stream = ownDataRecord(payloadRecord.requestStream, "prr-context-pack-request-stream");
    if (!sameScope(scope, registration.scope) ||
      requiredNonnegativeInteger(stream.streamHighWaterMark, "prr-request-stream-high-water-mark") !== proof.streamHighWaterMark ||
      !hasStalenessInput(ref, "prr-request-stream-high-water-mark", registration.scope.id, String(proof.streamHighWaterMark)) ||
      !hasStalenessInput(ref, "prr-projection-high-water-mark", "prr.projection", String(registration.sourceHighWaterMark))) {
      throw blocked("context-pack-selection-manifest-mismatch");
    }
    return;
  }
  if (proof.kind === "prr-jurisdiction.v1") {
    const scope = canonicalScope(payloadRecord.scope, "prr-context-pack-scope");
    if (!sameScope(scope, registration.scope) ||
      requiredText(payloadRecord.selectedRequestEventId, "prr-selected-request-event-id") !== proof.selectedRequestEventId) {
      throw blocked("context-pack-selection-manifest-mismatch");
    }
    return;
  }
  if (proof.kind === "selection-manifest.v1") {
    const selectionManifest = ownDataRecord(payloadRecord.selectionManifest, "context-pack-selection-manifest");
    const scope = canonicalScope(selectionManifest.scope, "context-pack-selection-manifest-scope");
    const sourceHighWaterMark = requiredNonnegativeInteger(
      selectionManifest.sourceHighWaterMark,
      "selection-manifest-source-high-water-mark"
    );
    if (hashAgentContextPack(selectionManifest) !== proof.manifestHash || !sameScope(scope, registration.scope) ||
      sourceHighWaterMark !== proof.sourceHighWaterMark || sourceHighWaterMark !== registration.sourceHighWaterMark) {
      throw blocked("context-pack-selection-manifest-mismatch");
    }
    return;
  }

  const selectionManifest = ownDataRecord(payloadRecord.selectionManifest, "investigative-context-selection-manifest");
  const scope = canonicalScope(selectionManifest.scope, "investigative-context-selection-manifest-scope");
  const manifestHash = requiredHash(selectionManifest.manifestHash, "investigative-selection-manifest-hash");
  const marks = canonicalProjectionHighWaterMarksFromPayload(selectionManifest.sourceProjectionHighWaterMarks);
  if (manifestHash !== proof.manifestHash || !sameScope(scope, registration.scope) ||
    !sameProjectionHighWaterMarks(marks, proof.sourceProjectionHighWaterMarks) ||
    !hasRegistrationProjectionHighWaterMark(marks, registration.sourceHighWaterMark)) {
    throw blocked("context-pack-selection-manifest-mismatch");
  }
}

function hasProjectionHighWaterStaleness(ref: ContextPackRef, sourceHighWaterMark: number): boolean {
  return ref.stalenessInputs?.some((input) =>
    input.kind === "projection-high-water-mark" && input.value === String(sourceHighWaterMark)
  ) ?? false;
}

function hasStalenessInput(ref: ContextPackRef, kind: string, inputRef: string, value: string): boolean {
  return ref.stalenessInputs?.some((input) =>
    input.kind === kind && input.ref === inputRef && input.value === value
  ) ?? false;
}

function canonicalProjectionHighWaterMarksFromPayload(value: unknown): readonly ContextProjectionHighWaterMark[] {
  const record = ownDataRecord(value, "investigative-selection-projection-high-water-marks");
  const rows: ContextProjectionHighWaterMark[] = [];
  for (const projection of ["agent", "governance", "graph", "ingestion"] as const) {
    if (Object.prototype.hasOwnProperty.call(record, projection)) {
      rows.push(Object.freeze({
        projection,
        highWaterMark: requiredNonnegativeInteger(record[projection], "investigative-selection-projection-high-water-mark")
      }));
    }
  }
  if (rows.length === 0 || Object.keys(record).length !== rows.length) {
    throw blocked("context-pack-selection-manifest-mismatch");
  }
  return Object.freeze(rows.sort((left, right) => left.projection.localeCompare(right.projection)));
}

function sameProjectionHighWaterMarks(
  left: readonly ContextProjectionHighWaterMark[],
  right: readonly ContextProjectionHighWaterMark[]
): boolean {
  return left.length === right.length && left.every((value, index) =>
    value.projection === right[index]?.projection && value.highWaterMark === right[index]?.highWaterMark
  );
}

function hasRegistrationProjectionHighWaterMark(
  marks: readonly ContextProjectionHighWaterMark[],
  sourceHighWaterMark: number
): boolean {
  return marks.some((mark) => mark.highWaterMark === sourceHighWaterMark);
}

function selectionManifestHashForProof(proof: ContextPackSelectionProof): string | undefined {
  return proof.kind === "selection-manifest.v1" || proof.kind === "investigative-selection-manifest.v1"
    ? proof.manifestHash
    : undefined;
}

function canonicalJsonValue(value: unknown, label: string): AgentContextPackJsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return Object.freeze(ownDataArray(value, label).map((item) => canonicalJsonValue(item, label)));
  }
  const record = ownDataRecord(value, label);
  const normalized: Record<string, AgentContextPackJsonValue> = {};
  for (const [key, item] of Object.entries(record)) {
    normalized[key] = canonicalJsonValue(item, label);
  }
  return Object.freeze(normalized);
}

function canonicalScope(value: unknown, label: string): ContextPackScope {
  const record = ownDataRecord(value, label);
  requireExactKeys(record, ["kind", "id"], label);
  return Object.freeze({
    kind: requiredText(record.kind, `${label}-kind`),
    id: requiredText(record.id, `${label}-id`)
  });
}

function ownDataRecord(value: unknown, label: string): Record<string, unknown> {
  const prototype = typeof value === "object" && value !== null ? Object.getPrototypeOf(value) : undefined;
  if (prototype !== Object.prototype && prototype !== null) {
    throw blocked(`invalid-${label}`);
  }
  const result: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") {
      throw blocked(`invalid-${label}`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      throw blocked(`invalid-${label}`);
    }
    result[key] = descriptor.value;
  }
  return Object.freeze(result);
}

function ownDataArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw blocked(`invalid-${label}`);
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (lengthDescriptor === undefined || !("value" in lengthDescriptor) || !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0) {
    throw blocked(`invalid-${label}`);
  }
  const length = lengthDescriptor.value;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || key === "length") {
      if (typeof key !== "string") throw blocked(`invalid-${label}`);
      continue;
    }
    if (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= length) {
      throw blocked(`invalid-${label}`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      throw blocked(`invalid-${label}`);
    }
  }
  const result: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      throw blocked(`invalid-${label}`);
    }
    result.push(descriptor.value);
  }
  return result;
}

function requireExactKeys(record: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(record).sort();
  const required = [...expected].sort();
  if (actual.length !== required.length || actual.some((key, index) => key !== required[index])) {
    throw blocked(`invalid-${label}`);
  }
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw blocked(`invalid-${label}`);
  }
  return value;
}

function requiredHash(value: unknown, label: string): string {
  const hash = requiredText(value, label);
  if (!hashPattern.test(hash)) {
    throw blocked(`invalid-${label}`);
  }
  return hash;
}

function requiredNonnegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw blocked(`invalid-${label}`);
  }
  return value;
}

function requiredPositiveInteger(value: unknown, label: string): number {
  const integer = requiredNonnegativeInteger(value, label);
  if (integer === 0) {
    throw blocked(`invalid-${label}`);
  }
  return integer;
}

function sameScope(left: ContextPackScope, right: ContextPackScope): boolean {
  return left.kind === right.kind && left.id === right.id;
}

function sameTextArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function blocked(category: string): Error {
  return new Error(`blocked.${category}`);
}
