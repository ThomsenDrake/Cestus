import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  type ActiveClaimReconciliationPort,
  type DurableSupervisorLeasePort,
  type SupervisorLeaseReadbackEvidence,
  type WorkspaceAdmissionSnapshot
} from "../../agent/src/wake-supervisor.js";
import { createPortableWorkspace } from "../../workspace/src/index.js";
import {
  issueMountedArtifactAuthorityOperationForFactory,
  registerMountedArtifactAuthorityIssuerForWakeRuntime
} from "../src/mounted-artifact-authority-operation.js";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import { createPortableWorkspaceLifecyclePorts, type PortableWorkspaceLifecyclePorts } from "../src/portable-workspace-lifecycle.js";
import { createSqlitePrrRuntime, type LocalRuntimeHandle } from "../src/runtime-factory.js";

type MountedProviderAuthorityApi = {
  readonly issueMountedProviderAuthority: (input: unknown) => object;
  readonly inspectMountedProviderAuthority: (authority: unknown) => Promise<MountedProviderAuthorityReadback>;
};

type MountedProviderAuthorityReadback = {
  readonly schemaVersion: "mounted-provider-authority-readback.v1";
  readonly stage: "locator";
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  readonly admissionGenerationId: string;
  readonly policyVersion: string;
  readonly policyDigest: string;
  readonly lockStateDigest: string;
  readonly highWaterMark: string;
  readonly highWaterOrdinal: number;
  readonly durableLedgerEventCount: number;
};

const tempDirs: string[] = [];
const handles: LocalRuntimeHandle[] = [];

afterEach(() => {
  for (const handle of handles.splice(0)) handle.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("mounted provider authority", () => {
  it("issues only the valid factory-mounted locator flow and returns deterministic immutable authoritative readback", async () => {
    const fixture = authorityFixture("valid");
    const operation = await issueOperation(fixture);
    const api = await authorityApi();
    let appendCalls = 0;
    const append = fixture.handle.ledger.append.bind(fixture.handle.ledger);
    Reflect.set(fixture.handle.ledger, "append", async (...args: Parameters<typeof append>) => {
      appendCalls += 1;
      return append(...args);
    });

    const authority = api.issueMountedProviderAuthority(Object.freeze({ operation }));
    const first = await api.inspectMountedProviderAuthority(authority);
    const second = await api.inspectMountedProviderAuthority(authority);

    expect(Object.isFrozen(authority)).toBe(true);
    expect(first).toEqual(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(first).toEqual({
      schemaVersion: "mounted-provider-authority-readback.v1",
      stage: "locator",
      workspaceId: fixture.workspaceId,
      mountInstanceId: "mount_instance_1",
      admissionGenerationId: "admission_generation_1",
      policyVersion: "policy.v1",
      policyDigest: "sha256:policy",
      lockStateDigest: "sha256:lock",
      highWaterMark: "high-water:5",
      highWaterOrdinal: 5,
      durableLedgerEventCount: 0
    });
    expect(appendCalls).toBe(0);
  });

  it("rejects a transparent Proxy around the valid operation envelope", async () => {
    const fixture = authorityFixture("transparent-envelope-proxy");
    const operation = await issueOperation(fixture);
    const api = await authorityApi();
    const envelope = new Proxy({ operation }, {});

    expect(() => api.issueMountedProviderAuthority(envelope)).toThrow(/mounted provider authority/i);
  });

  it("rejects a trap-bearing Proxy envelope before any handler trap executes", async () => {
    const fixture = authorityFixture("trap-envelope-proxy");
    const operation = await issueOperation(fixture);
    const api = await authorityApi();
    let trapCalls = 0;
    const handler: ProxyHandler<object> = {
      getPrototypeOf(target) {
        trapCalls += 1;
        return Reflect.getPrototypeOf(target);
      },
      setPrototypeOf(target, prototype) {
        trapCalls += 1;
        return Reflect.setPrototypeOf(target, prototype);
      },
      isExtensible(target) {
        trapCalls += 1;
        return Reflect.isExtensible(target);
      },
      preventExtensions(target) {
        trapCalls += 1;
        return Reflect.preventExtensions(target);
      },
      getOwnPropertyDescriptor(target, property) {
        trapCalls += 1;
        return Reflect.getOwnPropertyDescriptor(target, property);
      },
      defineProperty(target, property, descriptor) {
        trapCalls += 1;
        return Reflect.defineProperty(target, property, descriptor);
      },
      has(target, property) {
        trapCalls += 1;
        return Reflect.has(target, property);
      },
      get(target, property, receiver) {
        trapCalls += 1;
        return Reflect.get(target, property, receiver);
      },
      set(target, property, value, receiver) {
        trapCalls += 1;
        return Reflect.set(target, property, value, receiver);
      },
      deleteProperty(target, property) {
        trapCalls += 1;
        return Reflect.deleteProperty(target, property);
      },
      ownKeys(target) {
        trapCalls += 1;
        return Reflect.ownKeys(target);
      }
    };
    const envelope = new Proxy({ operation }, handler);
    let rejected = false;
    try {
      api.issueMountedProviderAuthority(envelope);
    } catch {
      rejected = true;
    }

    expect({ rejected, trapCalls }).toEqual({ rejected: true, trapCalls: 0 });
  });

  it("rejects structural, copied, proxied, non-mounted, cross-workspace-shaped, and P1-shaped mint attempts", async () => {
    const first = authorityFixture("first");
    const second = authorityFixture("second");
    const firstOperation = await issueOperation(first);
    const secondOperation = await issueOperation(second);
    const api = await authorityApi();
    let getterCalls = 0;
    const accessor = Object.create(Object.prototype, {
      operation: {
        enumerable: true,
        get() {
          getterCalls += 1;
          return firstOperation;
        }
      }
    });
    const operationProxy = new Proxy(firstOperation, {});
    const copiedOperation = { ...firstOperation };

    expect(() => api.issueMountedProviderAuthority({ operation: copiedOperation })).toThrow(/mounted provider authority/i);
    expect(() => api.issueMountedProviderAuthority({ operation: operationProxy })).toThrow(/mounted provider authority/i);
    expect(() => api.issueMountedProviderAuthority({ operation: first.handle })).toThrow(/mounted provider authority/i);
    expect(() => api.issueMountedProviderAuthority({ operation: firstOperation, workspaceId: second.workspaceId })).toThrow(/mounted provider authority/i);
    expect(() => api.issueMountedProviderAuthority({ operation: firstOperation, configuration: Object.freeze({}) })).toThrow(/mounted provider authority/i);
    expect(() => api.issueMountedProviderAuthority(accessor)).toThrow(/mounted provider authority/i);
    expect(getterCalls).toBe(0);

    const authority = api.issueMountedProviderAuthority({ operation: firstOperation });
    expect(() => api.issueMountedProviderAuthority({ operation: secondOperation })).not.toThrow();
    await expect(api.inspectMountedProviderAuthority({ ...authority })).rejects.toThrow(/mounted provider authority/i);
    await expect(api.inspectMountedProviderAuthority(new Proxy(authority, {}))).rejects.toThrow(/mounted provider authority/i);
  });

  it("fails closed when the mounted authority changes during or after authoritative ledger readback", async () => {
    const fixture = authorityFixture("stale");
    const operation = await issueOperation(fixture);
    const api = await authorityApi();
    const authority = api.issueMountedProviderAuthority({ operation });
    const readAll = fixture.handle.ledger.readAll.bind(fixture.handle.ledger);
    Reflect.set(fixture.handle.ledger, "readAll", async () => {
      const records = await readAll();
      fixture.ports.authority.invalidate?.("authority-loss");
      return records;
    });

    await expect(api.inspectMountedProviderAuthority(authority)).rejects.toThrow(/mounted provider authority/i);
    await expect(api.inspectMountedProviderAuthority(authority)).rejects.toThrow(/mounted provider authority/i);
  });

  it("fails closed for a closed runtime and never accepts P1-like provider facts as mounted authority", async () => {
    const fixture = authorityFixture("closed");
    const operation = await issueOperation(fixture);
    const api = await authorityApi();
    const authority = api.issueMountedProviderAuthority({ operation });
    fixture.handle.close();

    await expect(api.inspectMountedProviderAuthority(authority)).rejects.toThrow(/mounted provider authority/i);
    expect(() => api.issueMountedProviderAuthority(Object.freeze({
      operation,
      providerId: "provider_openai_codex_primary",
      modelId: "gpt-test",
      credentialRefId: "agent_credref_test",
      policyVersion: "policy.v1",
      sourceEventIds: ["evt_provider_source"]
    }))).toThrow(/mounted provider authority/i);
  });
});

async function authorityApi(): Promise<MountedProviderAuthorityApi> {
  const imported = await import("../src/mounted-provider-authority.js").catch(() => undefined);
  expect(isMountedProviderAuthorityApi(imported)).toBe(true);
  if (!isMountedProviderAuthorityApi(imported)) throw new Error("mounted provider authority module is unavailable");
  return imported;
}

function isMountedProviderAuthorityApi(value: unknown): value is MountedProviderAuthorityApi {
  if (value === null || typeof value !== "object") return false;
  return typeof Reflect.get(value, "issueMountedProviderAuthority") === "function" &&
    typeof Reflect.get(value, "inspectMountedProviderAuthority") === "function";
}

function authorityFixture(suffix: string): {
  readonly workspaceId: string;
  readonly handle: LocalRuntimeHandle;
  readonly ports: PortableWorkspaceLifecyclePorts;
} {
  const workspaceId = `ws_mounted_provider_${suffix}`;
  const workspaceRoot = join(tempDir(), workspaceId);
  createPortableWorkspace({
    rootDir: workspaceRoot,
    workspaceId,
    label: `Mounted provider ${suffix}`,
    createdAt: "2026-07-19T00:00:00.000Z",
    createdBy: "mounted-provider-authority-test"
  });
  const handle = track(createSqlitePrrRuntime({
    config: resolveLocalRuntimeConfig({
      cwd: workspaceRoot,
      env: { CESTUS_LOCAL_STORAGE: "portable-workspace", CESTUS_WORKSPACE_ROOT: workspaceRoot }
    }),
    actor: { id: "actor_mounted_provider", kind: "human", label: "Mounted provider test" }
  }));
  const ports = createPortableWorkspaceLifecyclePorts({
    workspaceId,
    residentId: "agent_default",
    supervisorEpoch: "epoch_mounted_provider",
    mountedFacts: {
      async read() {
        return {
          ok: true,
          facts: {
            schemaVersion: "portable-workspace-mounted-facts.v1",
            workspaceId,
            residentId: "agent_default",
            workspaceIdentityEventId: "evt_workspace_identity",
            mountInstanceId: "mount_instance_1",
            mountEvidenceId: "evidence_mount",
            authorityEvidenceId: "evidence_authority",
            ledgerStoreEvidenceId: "evidence_ledger",
            artifactStoreEvidenceId: "evidence_artifact",
            derivativeStoreEvidenceId: "evidence_derivative",
            policyVersion: "policy.v1",
            policyDigest: "sha256:policy",
            lockStateDigest: "sha256:lock",
            policyAndLockReadbackEventId: "evt_policy_lock_readback",
            highWaterMark: "high-water:5",
            highWaterReadbackEventId: "evt_high_water_readback",
            highWaterOrdinal: 5
          }
        };
      }
    },
    supervisorLease: leasePort(workspaceId),
    activeClaimReconciliation: {
      async readByIdempotencyKey() { return undefined; },
      async appendAndReadBack() { throw new Error("reconciliation is not expected"); }
    },
    now: () => "2026-07-19T00:00:00.000Z",
    createSafeOutageObservationId: () => "outage_mounted_provider"
  });
  return { workspaceId, handle, ports };
}

async function issueOperation(fixture: ReturnType<typeof authorityFixture>) {
  const wakeRuntime = {};
  registerMountedArtifactAuthorityIssuerForWakeRuntime({
    wakeRuntime,
    lifecyclePorts: fixture.ports,
    runtimeHandle: fixture.handle
  });
  await admit(fixture);
  return issueMountedArtifactAuthorityOperationForFactory(wakeRuntime);
}

async function admit(fixture: ReturnType<typeof authorityFixture>): Promise<void> {
  const grant = await fixture.ports.authority.revalidate({
    operation: "wake",
    expectedWorkspaceId: fixture.workspaceId,
    requiredCapabilities: ["wake", "lifecycle"]
  });
  if (!grant.ok) throw new Error("fixture must issue an admission");
  const result = await fixture.ports.supervisorLease.readOrAcquire({
    admission: grant.admission,
    residentId: "agent_default",
    supervisorEpoch: "epoch_mounted_provider",
    policyVersion: "policy.v1",
    policyDigest: "sha256:policy",
    lockStateDigest: "sha256:lock",
    causationId: "cause_mounted_provider",
    correlationId: "correlation_mounted_provider"
  });
  if (result.outcome !== "acquired-and-read-back") throw new Error("fixture must read back its lease");
}

function leasePort(workspaceId: string): DurableSupervisorLeasePort {
  return {
    async readOrAcquire(input) {
      return {
        outcome: "acquired-and-read-back",
        readback: leaseReadback(workspaceId, input.admission)
      };
    }
  };
}

function leaseReadback(workspaceId: string, admission: WorkspaceAdmissionSnapshot): SupervisorLeaseReadbackEvidence {
  return {
    schemaVersion: "resident-supervisor-lease-readback.v1",
    workspaceId,
    residentId: "agent_default",
    supervisorEpoch: "epoch_mounted_provider",
    workspaceIdentityEventId: "evt_workspace_identity",
    mountEvidenceId: "evidence_mount",
    authorityEvidenceId: "evidence_authority",
    policyVersion: "policy.v1",
    policyDigest: "sha256:policy",
    lockStateDigest: "sha256:lock",
    highWaterMark: "high-water:5",
    leaseEventId: "evt_lease",
    readbackEventId: "evt_lease_readback",
    expiresAt: "2026-07-19T01:00:00.000Z",
    causation: { causationId: "cause_mounted_provider", correlationId: "correlation_mounted_provider" },
    policyAndLock: {
      authorityEvidenceId: "evidence_authority",
      mountEvidenceId: "evidence_mount",
      leaseEventId: "evt_lease",
      leaseReadbackEventId: "evt_lease_readback",
      policyVersion: "policy.v1",
      policyDigest: "sha256:policy",
      lockStateDigest: "sha256:lock",
      readbackEventId: "evt_policy_lock_readback"
    },
    highWater: {
      authorityEvidenceId: "evidence_authority",
      mountEvidenceId: "evidence_mount",
      leaseEventId: "evt_lease",
      leaseReadbackEventId: "evt_lease_readback",
      highWaterMark: "high-water:5",
      readbackEventId: "evt_high_water_readback"
    }
  };
}

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "cestus-mounted-provider-authority-"));
  tempDirs.push(dir);
  return dir;
}

function track(handle: LocalRuntimeHandle): LocalRuntimeHandle {
  handles.push(handle);
  return handle;
}
