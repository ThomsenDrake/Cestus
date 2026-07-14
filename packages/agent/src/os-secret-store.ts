import {
  credentialReferenceSchema,
  isCredentialReferenceSecretSafeText,
  type CredentialReference
} from "./credential-reference.js";

const capabilityHashPattern = /^sha256:[a-f0-9]{64}$/;
const workspaceIdPattern = /^workspace_[a-zA-Z0-9_-]+$/;
const mountInstanceIdPattern = /^mount_[a-zA-Z0-9_-]+$/;
const runIdPattern = /^run_[a-zA-Z0-9_-]+$/;

const purposes = ["model-inference", "provider-health", "harness-execution"] as const;
const healthValues = ["healthy", "missing-binding", "expired", "revoked", "insufficient-scope", "unverified"] as const;
const diagnosticCodes = [
  "exact-use-mismatch",
  "credential-binding-missing",
  "credential-expired",
  "credential-revoked",
  "credential-insufficient-scope",
  "credential-unverified",
  "os-secret-facility-unavailable",
  "secret-safety-rejection"
] as const;

export type OsSecretPurpose = typeof purposes[number];
export type OsSecretHealth = typeof healthValues[number];
export type OsSecretDiagnosticCode = typeof diagnosticCodes[number];

export interface OsSecretResolutionRequest {
  readonly credentialRef: CredentialReference;
  readonly providerCapabilityHash: string;
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  readonly runId: string;
  readonly purpose: OsSecretPurpose;
}

export interface OsSecretBackendRequest {
  readonly credentialRefId: string;
  readonly providerId: string;
  readonly providerCapabilityHash: string;
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  readonly runId: string;
  readonly purpose: OsSecretPurpose;
}

export interface OsSecretBackend {
  resolve(input: OsSecretBackendRequest): Promise<OsSecretBackendResolution>;
}

export type OsSecretBackendResolution =
  | { readonly kind: "resolved"; readonly material: OpaqueSecretMaterial }
  | {
    readonly kind: "unavailable";
    readonly health: Exclude<OsSecretHealth, "healthy">;
    readonly safeDiagnosticCode: OsSecretDiagnosticCode;
  };

export interface OsSecretResolution {
  readonly kind: "resolved" | "unavailable" | "blocked";
  readonly health: OsSecretHealth;
  readonly safeDiagnosticCodes: readonly OsSecretDiagnosticCode[];
  readonly material?: OpaqueSecretMaterial;
}

export interface OsSecretStore {
  resolveForExactUse(input: OsSecretResolutionRequest): Promise<OsSecretResolution>;
}

export interface CreateOsSecretStoreInput {
  readonly currentUse: OsSecretResolutionRequest;
  readonly backend: OsSecretBackend;
}

interface NormalizedExactUse extends OsSecretBackendRequest {
  readonly credentialRef: CredentialReference;
  readonly credentialRefIdentity: string;
}

const opaqueMaterials = new WeakSet<object>();

/** Process-local material has no enumerable state and cannot serialize itself. */
export class OpaqueSecretMaterial {
  #released = false;

  private constructor() {
    opaqueMaterials.add(this);
  }

  releaseAfterImmediateUse(): void {
    this.#released = true;
  }

  get released(): boolean {
    return this.#released;
  }

  toJSON(): Record<string, never> {
    return {};
  }

  toString(): string {
    return "[OpaqueSecretMaterial]";
  }

  static createCredentialFreeTestHandle(): OpaqueSecretMaterial {
    return Object.freeze(new OpaqueSecretMaterial());
  }
}

/** This creates a no-value handle for credential-free deterministic tests only. */
export function createCredentialFreeTestOpaqueSecretMaterial(): OpaqueSecretMaterial {
  return OpaqueSecretMaterial.createCredentialFreeTestHandle();
}

export function createOsSecretStore(input: CreateOsSecretStoreInput): OsSecretStore {
  const currentUse = normalizeExactUse(input.currentUse);
  const backend = normalizeBackend(input.backend);

  return Object.freeze({
    async resolveForExactUse(request: OsSecretResolutionRequest): Promise<OsSecretResolution> {
      const normalizedRequest = normalizeExactUse(request);
      if (currentUse === undefined || backend === undefined || normalizedRequest === undefined) {
        return safeResolution("blocked", "unverified", ["secret-safety-rejection"]);
      }

      const preflight = validateCurrentExactUse(currentUse, normalizedRequest);
      if (preflight !== undefined) {
        return preflight;
      }

      try {
        return normalizeBackendResolution(await backend.resolve(toBackendRequest(normalizedRequest)));
      } catch {
        return safeResolution("unavailable", "unverified", ["os-secret-facility-unavailable"]);
      }
    }
  });
}

function validateCurrentExactUse(
  currentUse: NormalizedExactUse,
  request: NormalizedExactUse
): OsSecretResolution | undefined {
  if (!sameExactUse(currentUse, request)) {
    return safeResolution("blocked", "unverified", ["exact-use-mismatch"]);
  }
  if (request.credentialRef.status === "missing-binding") {
    return safeResolution("unavailable", "missing-binding", ["credential-binding-missing"]);
  }
  if (request.credentialRef.status === "expired") {
    return safeResolution("blocked", "expired", ["credential-expired"]);
  }
  if (request.credentialRef.status === "revoked") {
    return safeResolution("blocked", "revoked", ["credential-revoked"]);
  }
  if (request.credentialRef.status === "insufficient-scope" ||
      !request.credentialRef.capabilityScopes.includes(request.purpose)) {
    return safeResolution("blocked", "insufficient-scope", ["credential-insufficient-scope"]);
  }
  if (request.credentialRef.status !== "healthy") {
    return safeResolution("blocked", "unverified", ["credential-unverified"]);
  }
  return undefined;
}

function normalizeBackend(value: unknown): OsSecretBackend | undefined {
  const record = plainOwnDataRecord(value);
  if (record === undefined || !hasExactKeys(record, ["resolve"]) || typeof record.resolve !== "function") {
    return undefined;
  }
  return Object.freeze({ resolve: record.resolve as OsSecretBackend["resolve"] });
}

function normalizeExactUse(value: unknown): NormalizedExactUse | undefined {
  const record = plainOwnDataRecord(value);
  if (record === undefined || !hasExactKeys(record, [
    "credentialRef",
    "providerCapabilityHash",
    "workspaceId",
    "mountInstanceId",
    "runId",
    "purpose"
  ])) {
    return undefined;
  }

  const credentialRef = normalizeCredentialReference(record.credentialRef);
  if (credentialRef === undefined ||
      !isSafeId(record.providerCapabilityHash, capabilityHashPattern) ||
      !isSafeId(record.workspaceId, workspaceIdPattern) ||
      !isSafeId(record.mountInstanceId, mountInstanceIdPattern) ||
      !isSafeId(record.runId, runIdPattern) ||
      !isPurpose(record.purpose)) {
    return undefined;
  }

  return Object.freeze({
    credentialRef,
    credentialRefIdentity: JSON.stringify(credentialRef),
    credentialRefId: credentialRef.credentialRefId,
    providerId: credentialRef.providerId,
    providerCapabilityHash: record.providerCapabilityHash,
    workspaceId: record.workspaceId,
    mountInstanceId: record.mountInstanceId,
    runId: record.runId,
    purpose: record.purpose
  });
}

function normalizeCredentialReference(value: unknown): CredentialReference | undefined {
  const record = plainOwnDataRecord(value);
  if (record === undefined) {
    return undefined;
  }
  const capabilityScopes = plainStringArray(record.capabilityScopes);
  const sourceEventIds = plainStringArray(record.sourceEventIds);
  if (capabilityScopes === undefined || sourceEventIds === undefined) {
    return undefined;
  }
  const parsed = credentialReferenceSchema.safeParse({
    ...record,
    capabilityScopes,
    sourceEventIds
  });
  if (!parsed.success) {
    return undefined;
  }
  return Object.freeze({
    ...parsed.data,
    capabilityScopes: Object.freeze([...parsed.data.capabilityScopes]),
    sourceEventIds: Object.freeze([...parsed.data.sourceEventIds])
  }) as CredentialReference;
}

function normalizeBackendResolution(value: unknown): OsSecretResolution {
  const record = plainOwnDataRecord(value);
  if (record === undefined || typeof record.kind !== "string") {
    return safeResolution("unavailable", "unverified", ["os-secret-facility-unavailable"]);
  }
  if (record.kind === "resolved" && hasExactKeys(record, ["kind", "material"]) && isOpaqueMaterial(record.material)) {
    return safeResolution("resolved", "healthy", [], record.material);
  }
  if (record.kind === "unavailable" &&
      hasExactKeys(record, ["kind", "health", "safeDiagnosticCode"]) &&
      isUnavailableHealth(record.health) &&
      isDiagnosticCode(record.safeDiagnosticCode)) {
    return safeResolution("unavailable", record.health, [record.safeDiagnosticCode]);
  }
  return safeResolution("unavailable", "unverified", ["os-secret-facility-unavailable"]);
}

function toBackendRequest(input: NormalizedExactUse): OsSecretBackendRequest {
  return Object.freeze({
    credentialRefId: input.credentialRefId,
    providerId: input.providerId,
    providerCapabilityHash: input.providerCapabilityHash,
    workspaceId: input.workspaceId,
    mountInstanceId: input.mountInstanceId,
    runId: input.runId,
    purpose: input.purpose
  });
}

function sameExactUse(left: NormalizedExactUse, right: NormalizedExactUse): boolean {
  return left.credentialRefIdentity === right.credentialRefIdentity &&
    left.providerCapabilityHash === right.providerCapabilityHash &&
    left.workspaceId === right.workspaceId &&
    left.mountInstanceId === right.mountInstanceId &&
    left.runId === right.runId &&
    left.purpose === right.purpose;
}

function safeResolution(
  kind: OsSecretResolution["kind"],
  health: OsSecretHealth,
  safeDiagnosticCodes: readonly OsSecretDiagnosticCode[],
  material?: OpaqueSecretMaterial
): OsSecretResolution {
  const resolution: Record<string, unknown> = {
    kind,
    health,
    safeDiagnosticCodes: Object.freeze([...safeDiagnosticCodes])
  };
  if (material !== undefined) {
    Object.defineProperty(resolution, "material", {
      value: material,
      enumerable: false,
      writable: false,
      configurable: false
    });
  }
  return Object.freeze(resolution) as OsSecretResolution;
}

function plainOwnDataRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  try {
    if (Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertySymbols(value).length > 0) {
      return undefined;
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const snapshot: Record<string, unknown> = {};
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (!("value" in descriptor) || !descriptor.enumerable) {
        return undefined;
      }
      snapshot[key] = descriptor.value;
    }
    return Object.freeze(snapshot);
  } catch {
    return undefined;
  }
}

function plainStringArray(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  try {
    if (Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length > 0) {
      return undefined;
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const length = value.length;
    if (Object.keys(descriptors).some((key) => key !== "length" && !/^(0|[1-9][0-9]*)$/.test(key))) {
      return undefined;
    }
    const snapshot: string[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable ||
          typeof descriptor.value !== "string") {
        return undefined;
      }
      snapshot.push(descriptor.value);
    }
    return Object.freeze(snapshot);
  } catch {
    return undefined;
  }
}

function hasExactKeys(record: Readonly<Record<string, unknown>>, expected: readonly string[]): boolean {
  const actual = Object.keys(record).sort();
  const required = [...expected].sort();
  return actual.length === required.length && actual.every((key, index) => key === required[index]);
}

function isSafeId(value: unknown, pattern: RegExp): value is string {
  return typeof value === "string" && pattern.test(value) && isCredentialReferenceSecretSafeText(value);
}

function isPurpose(value: unknown): value is OsSecretPurpose {
  return typeof value === "string" && (purposes as readonly string[]).includes(value);
}

function isUnavailableHealth(value: unknown): value is Exclude<OsSecretHealth, "healthy"> {
  return typeof value === "string" && value !== "healthy" && (healthValues as readonly string[]).includes(value);
}

function isDiagnosticCode(value: unknown): value is OsSecretDiagnosticCode {
  return typeof value === "string" && (diagnosticCodes as readonly string[]).includes(value);
}

function isOpaqueMaterial(value: unknown): value is OpaqueSecretMaterial {
  return typeof value === "object" && value !== null && opaqueMaterials.has(value);
}
