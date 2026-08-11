export type SecretCommitmentByteLimit = 32 | 8_388_608 | 8_454_144;

export function trustedCanonicalSecretCommitmentByteLength(
  value: unknown,
  maximumLength: SecretCommitmentByteLimit
): number | undefined {
  void value;
  void maximumLength;
  return undefined;
}

export function snapshotCanonicalSecretCommitmentBytes(
  value: unknown,
  maximumLength: SecretCommitmentByteLimit
): Uint8Array | undefined {
  void value;
  void maximumLength;
  return undefined;
}
