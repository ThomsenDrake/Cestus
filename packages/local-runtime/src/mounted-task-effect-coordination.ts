import type { LocalRuntimeHandle } from "./runtime-factory.js";

interface MountedTaskEffectGate {
  tail: Promise<void>;
  queued: number;
}

const mountedTaskEffectGates = new Map<string, MountedTaskEffectGate>();

/**
 * Serializes mounted artifact writes and the durable cancellation event for one
 * portable-workspace task. Separate runtime handles share the same root-based
 * gate, so a controller cannot record cancellation ahead of an in-flight write.
 */
export async function serializeMountedTaskArtifactEffect<T>(input: {
  readonly handle: LocalRuntimeHandle;
  readonly taskId: string;
  readonly effect: () => Promise<T>;
}): Promise<T> {
  const mounted = input.handle.mountedWorkspace;
  if (mounted === undefined) {
    throw new Error("Mounted task artifact effect coordination requires a portable workspace.");
  }
  const key = `${mounted.workspaceId}\u0000${mounted.rootDir}\u0000${input.taskId}`;
  const gate = mountedTaskEffectGates.get(key) ?? { tail: Promise.resolve(), queued: 0 };
  if (!mountedTaskEffectGates.has(key)) mountedTaskEffectGates.set(key, gate);
  const preceding = gate.tail;
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  gate.queued += 1;
  gate.tail = preceding.then(() => current);
  await preceding;
  try {
    return await input.effect();
  } finally {
    release();
    gate.queued -= 1;
    if (gate.queued === 0 && mountedTaskEffectGates.get(key) === gate) {
      mountedTaskEffectGates.delete(key);
    }
  }
}
