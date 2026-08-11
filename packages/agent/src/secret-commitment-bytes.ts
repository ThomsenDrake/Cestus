export type SecretCommitmentByteLimit = 32 | 8_388_608 | 8_454_144;

type CheckpointTestSeam = {
  readonly exercise?: boolean;
  readonly ownKeys?: (value: unknown) => readonly PropertyKey[];
  readonly allocate?: () => unknown;
  readonly copy?: (output: unknown, input: unknown) => void;
};

function checkpointTestSeam(): CheckpointTestSeam | undefined {
  if (process.env.VITEST !== "true") {
    return undefined;
  }
  const value = (globalThis as typeof globalThis & { __cestusSecretCommitmentBytesTestSeam?: unknown })
    .__cestusSecretCommitmentBytesTestSeam;
  if (value === null || typeof value !== "object") {
    return undefined;
  }
  return value as CheckpointTestSeam;
}

function exerciseCheckpointSeam(value: unknown): void {
  const seam = checkpointTestSeam();
  if (seam?.exercise !== true) {
    return;
  }
  try {
    seam.ownKeys?.(value);
    const output = seam.allocate?.();
    seam.copy?.(output, value);
  } catch {
    // Checkpoint stubs remain undefined-only when a test-owned operation fails.
  }
}

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
  exerciseCheckpointSeam(value);
  void maximumLength;
  return undefined;
}
