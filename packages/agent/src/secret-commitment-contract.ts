import { isProxy } from "node:util/types";

export type SecretCommitmentProfile =
  | "cestus.source-observation.v1"
  | "source-manifest-authority.v1";

export interface SecretCommitmentKeyReference {
  readonly backendId: string;
  readonly keyId: string;
  readonly keyVersion: number;
}

export interface SourceObservationCommitmentRecord extends SecretCommitmentKeyReference {
  readonly profile: "cestus.source-observation.v1";
  readonly contractVersion: 1;
  readonly workspaceId: string;
  readonly sourceCollectionId: string;
  readonly sourceBoundaryRevision: string;
  readonly manifestEntryId: string;
  readonly nonceHex: string;
  readonly hmacHex: string;
}

export interface ManifestAuthorityCommitmentRecord extends SecretCommitmentKeyReference {
  readonly profile: "source-manifest-authority.v1";
  readonly contractVersion: 1;
  readonly recordClass: "manifest";
  readonly workspaceId: string;
  readonly sourceCollectionId: string;
  readonly sourceBoundaryRevision: string;
  readonly classificationPolicyHashHex: string;
  readonly publicManifestIdHex: string;
  readonly hmacHex: string;
}

export interface EntryAuthorityCommitmentRecord extends SecretCommitmentKeyReference {
  readonly profile: "source-manifest-authority.v1";
  readonly contractVersion: 1;
  readonly recordClass: "entry";
  readonly workspaceId: string;
  readonly sourceCollectionId: string;
  readonly sourceBoundaryRevision: string;
  readonly classificationPolicyHashHex: string;
  readonly publicManifestIdHex: string;
  readonly publicEntryIdHex: string;
  readonly hmacHex: string;
}

export type SecretCommitmentPublicRecord =
  | SourceObservationCommitmentRecord
  | ManifestAuthorityCommitmentRecord
  | EntryAuthorityCommitmentRecord;

export type ComputeCommitmentResult =
  | { readonly status: "computed"; readonly record: SecretCommitmentPublicRecord }
  | { readonly status: "rejected"; readonly reason: "invalid-profile" | "invalid-frame" | "invalid-record" }
  | {
    readonly status: "unavailable";
    readonly reason:
      | "authority-unavailable"
      | "backend-unavailable"
      | "key-unavailable"
      | "nonce-unavailable";
  };

export type VerifyCommitmentResult =
  | { readonly status: "valid" }
  | { readonly status: "mismatch" }
  | { readonly status: "unverifiable"; readonly reason: "key-lost" }
  | {
    readonly status: "rejected";
    readonly reason:
      | "invalid-profile"
      | "invalid-frame"
      | "invalid-record"
      | "record-reference-invalid";
  }
  | {
    readonly status: "unavailable";
    readonly reason: "authority-unavailable" | "backend-unavailable";
  };

export interface SecretCommitmentComputePort {
  computeCommitment(
    profile: SecretCommitmentProfile,
    frame: Uint8Array
  ): Promise<ComputeCommitmentResult>;
  verifyCommitment(
    profile: SecretCommitmentProfile,
    frame: Uint8Array,
    publicRecord: SecretCommitmentPublicRecord
  ): Promise<VerifyCommitmentResult>;
}

export interface SourceObservationFrameInput {
  readonly workspaceId: string;
  readonly sourceCollectionId: string;
  readonly sourceBoundaryRevision: string;
  readonly manifestEntryId: string;
  readonly nonce: Uint8Array;
  readonly observedBytes: Uint8Array;
}

export interface ManifestAuthorityFrameInput {
  readonly workspaceId: string;
  readonly sourceCollectionId: string;
  readonly sourceBoundaryRevision: string;
  readonly classificationPolicyHash: Uint8Array;
  readonly publicManifestId: Uint8Array;
  readonly protectedCanonicalManifestBytes: Uint8Array;
}

export interface EntryAuthorityFrameInput {
  readonly workspaceId: string;
  readonly sourceCollectionId: string;
  readonly sourceBoundaryRevision: string;
  readonly classificationPolicyHash: Uint8Array;
  readonly publicManifestId: Uint8Array;
  readonly publicEntryId: Uint8Array;
  readonly protectedCanonicalEntryBytes: Uint8Array;
}

export function buildSourceObservationFrame(input: unknown): Uint8Array | undefined {
  void input;
  return undefined;
}

export function buildManifestAuthorityFrame(input: unknown): Uint8Array | undefined {
  void input;
  return undefined;
}

export function buildEntryAuthorityFrame(input: unknown): Uint8Array | undefined {
  void input;
  return undefined;
}

export function normalizeSecretCommitmentPublicRecord(
  value: unknown
): SecretCommitmentPublicRecord | undefined {
  try {
    if (value === null || typeof value !== "object") {
      return undefined;
    }
    if (isProxy(value) || Array.isArray(value)) {
      return undefined;
    }

    const properties = collectExactOwnDataProperties(value);
    if (properties === undefined) {
      return undefined;
    }

    const profile = properties.get("profile");
    if (profile === "cestus.source-observation.v1") {
      return normalizeSourceObservationRecord(properties);
    }
    if (profile !== "source-manifest-authority.v1") {
      return undefined;
    }

    const recordClass = properties.get("recordClass");
    if (recordClass === "manifest") {
      return normalizeManifestAuthorityRecord(properties);
    }
    if (recordClass === "entry") {
      return normalizeEntryAuthorityRecord(properties);
    }
    return undefined;
  } catch {
    return undefined;
  }
}

const sourceObservationKeys = [
  "profile",
  "contractVersion",
  "workspaceId",
  "sourceCollectionId",
  "sourceBoundaryRevision",
  "manifestEntryId",
  "nonceHex",
  "hmacHex",
  "backendId",
  "keyId",
  "keyVersion"
];

const manifestAuthorityKeys = [
  "profile",
  "contractVersion",
  "recordClass",
  "workspaceId",
  "sourceCollectionId",
  "sourceBoundaryRevision",
  "classificationPolicyHashHex",
  "publicManifestIdHex",
  "hmacHex",
  "backendId",
  "keyId",
  "keyVersion"
];

const entryAuthorityKeys = [
  "profile",
  "contractVersion",
  "recordClass",
  "workspaceId",
  "sourceCollectionId",
  "sourceBoundaryRevision",
  "classificationPolicyHashHex",
  "publicManifestIdHex",
  "publicEntryIdHex",
  "hmacHex",
  "backendId",
  "keyId",
  "keyVersion"
];

function collectExactOwnDataProperties(value: object): ReadonlyMap<string, unknown> | undefined {
  try {
    if (
      Object.getPrototypeOf(value) !== Object.prototype ||
      Object.getOwnPropertySymbols(value).length !== 0
    ) {
      return undefined;
    }

    const properties = new Map<string, unknown>();
    for (const key of Object.getOwnPropertyNames(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
        return undefined;
      }
      properties.set(key, descriptor.value);
    }
    return properties;
  } catch {
    return undefined;
  }
}

function hasExactKeys(properties: ReadonlyMap<string, unknown>, requiredKeys: readonly string[]): boolean {
  return properties.size === requiredKeys.length && requiredKeys.every((key) => properties.has(key));
}

function normalizeCommonKeyReference(
  properties: ReadonlyMap<string, unknown>
): SecretCommitmentKeyReference | undefined {
  const backendId = normalizeIdentifier(properties.get("backendId"));
  const keyId = normalizeIdentifier(properties.get("keyId"));
  const keyVersion = normalizeKeyVersion(properties.get("keyVersion"));
  if (backendId === undefined || keyId === undefined || keyVersion === undefined) {
    return undefined;
  }
  return { backendId, keyId, keyVersion };
}

function normalizeSourceObservationRecord(
  properties: ReadonlyMap<string, unknown>
): SourceObservationCommitmentRecord | undefined {
  if (
    !hasExactKeys(properties, sourceObservationKeys) ||
    properties.get("profile") !== "cestus.source-observation.v1" ||
    properties.get("contractVersion") !== 1
  ) {
    return undefined;
  }

  const workspaceId = normalizeIdentifier(properties.get("workspaceId"));
  const sourceCollectionId = normalizeIdentifier(properties.get("sourceCollectionId"));
  const sourceBoundaryRevision = normalizeIdentifier(properties.get("sourceBoundaryRevision"));
  const manifestEntryId = normalizeIdentifier(properties.get("manifestEntryId"));
  const nonceHex = normalizeHex(properties.get("nonceHex"));
  const hmacHex = normalizeHex(properties.get("hmacHex"));
  const common = normalizeCommonKeyReference(properties);
  if (
    workspaceId === undefined ||
    sourceCollectionId === undefined ||
    sourceBoundaryRevision === undefined ||
    manifestEntryId === undefined ||
    nonceHex === undefined ||
    hmacHex === undefined ||
    common === undefined
  ) {
    return undefined;
  }

  const record: SourceObservationCommitmentRecord = {
    profile: "cestus.source-observation.v1",
    contractVersion: 1,
    workspaceId,
    sourceCollectionId,
    sourceBoundaryRevision,
    manifestEntryId,
    nonceHex,
    hmacHex,
    backendId: common.backendId,
    keyId: common.keyId,
    keyVersion: common.keyVersion
  };
  return Object.freeze(record);
}

function normalizeManifestAuthorityRecord(
  properties: ReadonlyMap<string, unknown>
): ManifestAuthorityCommitmentRecord | undefined {
  if (
    !hasExactKeys(properties, manifestAuthorityKeys) ||
    properties.get("profile") !== "source-manifest-authority.v1" ||
    properties.get("contractVersion") !== 1 ||
    properties.get("recordClass") !== "manifest"
  ) {
    return undefined;
  }

  const workspaceId = normalizeIdentifier(properties.get("workspaceId"));
  const sourceCollectionId = normalizeIdentifier(properties.get("sourceCollectionId"));
  const sourceBoundaryRevision = normalizeIdentifier(properties.get("sourceBoundaryRevision"));
  const classificationPolicyHashHex = normalizeHex(properties.get("classificationPolicyHashHex"));
  const publicManifestIdHex = normalizeHex(properties.get("publicManifestIdHex"));
  const hmacHex = normalizeHex(properties.get("hmacHex"));
  const common = normalizeCommonKeyReference(properties);
  if (
    workspaceId === undefined ||
    sourceCollectionId === undefined ||
    sourceBoundaryRevision === undefined ||
    classificationPolicyHashHex === undefined ||
    publicManifestIdHex === undefined ||
    hmacHex === undefined ||
    common === undefined
  ) {
    return undefined;
  }

  const record: ManifestAuthorityCommitmentRecord = {
    profile: "source-manifest-authority.v1",
    contractVersion: 1,
    recordClass: "manifest",
    workspaceId,
    sourceCollectionId,
    sourceBoundaryRevision,
    classificationPolicyHashHex,
    publicManifestIdHex,
    hmacHex,
    backendId: common.backendId,
    keyId: common.keyId,
    keyVersion: common.keyVersion
  };
  return Object.freeze(record);
}

function normalizeEntryAuthorityRecord(
  properties: ReadonlyMap<string, unknown>
): EntryAuthorityCommitmentRecord | undefined {
  if (
    !hasExactKeys(properties, entryAuthorityKeys) ||
    properties.get("profile") !== "source-manifest-authority.v1" ||
    properties.get("contractVersion") !== 1 ||
    properties.get("recordClass") !== "entry"
  ) {
    return undefined;
  }

  const workspaceId = normalizeIdentifier(properties.get("workspaceId"));
  const sourceCollectionId = normalizeIdentifier(properties.get("sourceCollectionId"));
  const sourceBoundaryRevision = normalizeIdentifier(properties.get("sourceBoundaryRevision"));
  const classificationPolicyHashHex = normalizeHex(properties.get("classificationPolicyHashHex"));
  const publicManifestIdHex = normalizeHex(properties.get("publicManifestIdHex"));
  const publicEntryIdHex = normalizeHex(properties.get("publicEntryIdHex"));
  const hmacHex = normalizeHex(properties.get("hmacHex"));
  const common = normalizeCommonKeyReference(properties);
  if (
    workspaceId === undefined ||
    sourceCollectionId === undefined ||
    sourceBoundaryRevision === undefined ||
    classificationPolicyHashHex === undefined ||
    publicManifestIdHex === undefined ||
    publicEntryIdHex === undefined ||
    hmacHex === undefined ||
    common === undefined
  ) {
    return undefined;
  }

  const record: EntryAuthorityCommitmentRecord = {
    profile: "source-manifest-authority.v1",
    contractVersion: 1,
    recordClass: "entry",
    workspaceId,
    sourceCollectionId,
    sourceBoundaryRevision,
    classificationPolicyHashHex,
    publicManifestIdHex,
    publicEntryIdHex,
    hmacHex,
    backendId: common.backendId,
    keyId: common.keyId,
    keyVersion: common.keyVersion
  };
  return Object.freeze(record);
}

function normalizeIdentifier(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(new TextEncoder().encode(value)) === value
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

function normalizeHex(value: unknown): string | undefined {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value) ? value : undefined;
}

function normalizeKeyVersion(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}
