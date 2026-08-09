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

export function normalizeSecretCommitmentPublicRecord(
  _value: unknown
): SecretCommitmentPublicRecord | undefined {
  return undefined;
}
