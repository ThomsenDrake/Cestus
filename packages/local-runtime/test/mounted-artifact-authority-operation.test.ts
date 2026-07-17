import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type {
  ActiveClaimReconciliationPort,
  DurableSupervisorLeasePort,
  SupervisorLeaseReadbackEvidence,
  WorkspaceAdmissionSnapshot
} from "../../agent/src/wake-supervisor.js";
import { createPortableWorkspace } from "../../workspace/src/index.js";
import {
  inspectMountedArtifactAuthorityOperationForMountedOfficialFlowFeasibility,
  inspectMountedArtifactAuthorityOperationForPortableMountedAgentArtifactStores,
  inspectMountedArtifactAuthorityOperation,
  issueMountedArtifactAuthorityOperationForFactory,
  registerMountedArtifactAuthorityIssuerForWakeRuntime,
  type MountedArtifactAuthorityOperation
} from "../src/mounted-artifact-authority-operation.js";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import {
  createPortableWorkspaceLifecyclePorts,
  type PortableWorkspaceLifecyclePorts
} from "../src/portable-workspace-lifecycle.js";
import { createSqlitePrrRuntime, type LocalRuntimeHandle } from "../src/runtime-factory.js";

const tempDirs: string[] = [];
const handles: LocalRuntimeHandle[] = [];

afterEach(() => {
  for (const handle of handles.splice(0)) handle.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("mounted artifact authority operation", () => {
  it("rejects a structural lifecycle bundle before mounted authority activity", () => {
    const fixture = authorityFixture();
    const structural = { ...fixture.ports } as PortableWorkspaceLifecyclePorts;

    expect(() => registerMountedArtifactAuthorityIssuerForWakeRuntime({
      wakeRuntime: {}, lifecyclePorts: structural, runtimeHandle: fixture.handle
    })).toThrow(/lifecycle ports/i);
    expect(fixture.calls).toEqual({ mounted: 0, lease: 0, reconciliation: 0 });
  });

  it("authenticates the exact factory handle before any raw handle member or lifecycle effect", () => {
    const fixture = authorityFixture();
    let rawHandleReads = 0;
    const forged = Object.defineProperty({}, "ledger", {
      enumerable: true,
      get() {
        rawHandleReads += 1;
        throw new Error("raw handle member must remain unread");
      }
    }) as LocalRuntimeHandle;

    expect(() => registerMountedArtifactAuthorityIssuerForWakeRuntime({
      phase: "authenticate",
      runtimeHandle: forged
    } as never)).toThrow(/factory-issued mounted runtime handle/i);
    expect(rawHandleReads).toBe(0);
    expect(fixture.calls).toEqual({ mounted: 0, lease: 0, reconciliation: 0 });
  });

  it("binds only its exact authenticated capability after lifecycle construction", () => {
    const fixture = authorityFixture();
    const wakeRuntime = {};
    const capability = registerMountedArtifactAuthorityIssuerForWakeRuntime({
      phase: "authenticate",
      runtimeHandle: fixture.handle
    } as never);

    expect(capability).toMatchObject({ schemaVersion: "factory-authenticated-mounted-wake-capability.v1" });
    expect(() => registerMountedArtifactAuthorityIssuerForWakeRuntime({
      phase: "bind",
      capability,
      wakeRuntime,
      lifecyclePorts: fixture.ports
    } as never)).not.toThrow();
    for (const forged of [fixture.handle, { ...(capability as object) }, { schemaVersion: "factory-authenticated-mounted-wake-capability.v1" }]) {
      expect(() => registerMountedArtifactAuthorityIssuerForWakeRuntime({
        phase: "bind",
        capability: forged,
        wakeRuntime: {},
        lifecyclePorts: fixture.ports
      } as never)).toThrow(/capability|registered/i);
    }
    expect(fixture.calls).toEqual({ mounted: 0, lease: 0, reconciliation: 0 });
  });

  it("rejects accessor prototype symbol and swapped registration inputs before registration effects", () => {
    const fixture = authorityFixture();
    const swappedWakeRuntime = {};
    const accessors = { wakeRuntime: 0, lifecyclePorts: 0, runtimeHandle: 0 };
    const hostile = {} as Record<string, unknown>;
    Object.defineProperties(hostile, {
      wakeRuntime: {
        enumerable: true,
        get() {
          accessors.wakeRuntime += 1;
          return accessors.wakeRuntime === 1 ? {} : swappedWakeRuntime;
        }
      },
      lifecyclePorts: {
        enumerable: true,
        get() {
          accessors.lifecyclePorts += 1;
          return fixture.ports;
        }
      },
      runtimeHandle: {
        enumerable: true,
        get() {
          accessors.runtimeHandle += 1;
          return fixture.handle;
        }
      }
    });

    expect(() => registerMountedArtifactAuthorityIssuerForWakeRuntime(hostile as never)).toThrow(/plain own-data/i);
    expect(accessors).toEqual({ wakeRuntime: 0, lifecyclePorts: 0, runtimeHandle: 0 });
    expect(fixture.calls).toEqual({ mounted: 0, lease: 0, reconciliation: 0 });
    expect(() => registerMountedArtifactAuthorityIssuerForWakeRuntime({
      wakeRuntime: swappedWakeRuntime, lifecyclePorts: fixture.ports, runtimeHandle: fixture.handle
    })).not.toThrow();

    const prototypeFixture = authorityFixture();
    const prototypeWakeRuntime = {};
    const inheritedInput = Object.create({ inherited: true }) as {
      wakeRuntime: object;
      lifecyclePorts: PortableWorkspaceLifecyclePorts;
      runtimeHandle: LocalRuntimeHandle;
    };
    Object.assign(inheritedInput, {
      wakeRuntime: prototypeWakeRuntime,
      lifecyclePorts: prototypeFixture.ports,
      runtimeHandle: prototypeFixture.handle
    });
    expect(() => registerMountedArtifactAuthorityIssuerForWakeRuntime(inheritedInput)).toThrow(/plain own-data/i);
    expect(prototypeFixture.calls).toEqual({ mounted: 0, lease: 0, reconciliation: 0 });
    expect(() => registerMountedArtifactAuthorityIssuerForWakeRuntime({
      wakeRuntime: prototypeWakeRuntime,
      lifecyclePorts: prototypeFixture.ports,
      runtimeHandle: prototypeFixture.handle
    })).not.toThrow();

    const symbolFixture = authorityFixture();
    const symbolWakeRuntime = {};
    const symbolInput = {
      wakeRuntime: symbolWakeRuntime,
      lifecyclePorts: symbolFixture.ports,
      runtimeHandle: symbolFixture.handle,
      [Symbol("hostile")]: true
    };
    expect(() => registerMountedArtifactAuthorityIssuerForWakeRuntime(symbolInput)).toThrow(/plain own-data/i);
    expect(symbolFixture.calls).toEqual({ mounted: 0, lease: 0, reconciliation: 0 });
    expect(() => registerMountedArtifactAuthorityIssuerForWakeRuntime({
      wakeRuntime: symbolWakeRuntime,
      lifecyclePorts: symbolFixture.ports,
      runtimeHandle: symbolFixture.handle
    })).not.toThrow();

    const forgedHandleFixture = authorityFixture();
    const forgedHandleWakeRuntime = {};
    expect(() => registerMountedArtifactAuthorityIssuerForWakeRuntime({
      wakeRuntime: forgedHandleWakeRuntime,
      lifecyclePorts: forgedHandleFixture.ports,
      runtimeHandle: {} as LocalRuntimeHandle
    })).toThrow(/factory-issued mounted runtime handle/i);
    expect(forgedHandleFixture.calls).toEqual({ mounted: 0, lease: 0, reconciliation: 0 });
    expect(() => registerMountedArtifactAuthorityIssuerForWakeRuntime({
      wakeRuntime: forgedHandleWakeRuntime,
      lifecyclePorts: forgedHandleFixture.ports,
      runtimeHandle: forgedHandleFixture.handle
    })).not.toThrow();
  });

  it("old operation cannot revive after identical tuple revalidation", async () => {
    const fixture = authorityFixture();
    const wakeRuntime = {};
    registerMountedArtifactAuthorityIssuerForWakeRuntime({ wakeRuntime, lifecyclePorts: fixture.ports, runtimeHandle: fixture.handle });
    await admit(fixture, "wake");
    const oldOperation = issueMountedArtifactAuthorityOperationForFactory(wakeRuntime);

    await admit(fixture, "recovery");

    expect(() => inspectMountedArtifactAuthorityOperation(oldOperation)).toThrow(/current|burned/i);
    expect(() => inspectMountedArtifactAuthorityOperation(oldOperation)).toThrow(/burned/i);
  });

  it("shutdown authority loss and admission mismatch permanently burn operation identity", async () => {
    for (const reason of ["shutdown", "admission-mismatch"] as const) {
      const fixture = authorityFixture();
      const wakeRuntime = {};
      registerMountedArtifactAuthorityIssuerForWakeRuntime({ wakeRuntime, lifecyclePorts: fixture.ports, runtimeHandle: fixture.handle });
      await admit(fixture, "wake");
      const operation = issueMountedArtifactAuthorityOperationForFactory(wakeRuntime);

      fixture.ports.authority.invalidate!(reason);
      await admit(fixture, "recovery");

      expect(() => inspectMountedArtifactAuthorityOperation(operation), reason).toThrow(/current|burned/i);
      expect(() => inspectMountedArtifactAuthorityOperation(operation), reason).toThrow(/burned/i);
    }
  });

  it("fresh post recovery admission mints a distinct operation after full readback", async () => {
    const fixture = authorityFixture();
    const wakeRuntime = {};
    registerMountedArtifactAuthorityIssuerForWakeRuntime({ wakeRuntime, lifecyclePorts: fixture.ports, runtimeHandle: fixture.handle });
    await admit(fixture, "wake");
    const oldOperation = issueMountedArtifactAuthorityOperationForFactory(wakeRuntime);
    fixture.ports.authority.invalidate!("authority-loss");
    await admit(fixture, "recovery");

    const recoveredOperation = issueMountedArtifactAuthorityOperationForFactory(wakeRuntime);
    const firstSnapshot = inspectMountedArtifactAuthorityOperation(recoveredOperation);
    const secondSnapshot = inspectMountedArtifactAuthorityOperation(recoveredOperation);

    expect(recoveredOperation).not.toBe(oldOperation);
    expect(firstSnapshot).not.toBe(secondSnapshot);
    expect(firstSnapshot).toEqual({
      schemaVersion: "mounted-artifact-authority-snapshot.v1",
      workspaceId: fixture.workspaceId,
      mountInstanceId: "mount-instance:1",
      workspaceIdentityEventId: "evt_workspace_identity",
      mountEvidenceId: "evidence_mount",
      authorityEvidenceId: "evidence_authority",
      ledgerStoreEvidenceId: "evidence_ledger",
      artifactStoreEvidenceId: "evidence_artifact",
      derivativeStoreEvidenceId: "evidence_derivative",
      policyVersion: "policy.v1",
      policyDigest: "sha256:policy",
      lockStateDigest: "sha256:lock",
      highWaterMark: "high-water:5",
      highWaterOrdinal: 5,
      admissionGenerationId: "admission:2"
    });
    expect(Object.isFrozen(firstSnapshot)).toBe(true);
    expect(() => inspectMountedArtifactAuthorityOperation(oldOperation)).toThrow(/current|burned/i);
  });

  it("repeated invalidation burns stale operations while fresh operations remain current without retained operation collections", async () => {
    const fixture = authorityFixture();
    const wakeRuntime = {};
    registerMountedArtifactAuthorityIssuerForWakeRuntime({ wakeRuntime, lifecyclePorts: fixture.ports, runtimeHandle: fixture.handle });
    await admit(fixture, "wake");
    let current = issueMountedArtifactAuthorityOperationForFactory(wakeRuntime);
    const stale: MountedArtifactAuthorityOperation[] = [];

    for (const reason of ["authority-loss", "admission-mismatch", "shutdown"] as const) {
      expect(inspectMountedArtifactAuthorityOperation(current).workspaceId).toBe(fixture.workspaceId);
      fixture.ports.authority.invalidate!(reason);
      stale.push(current);
      await admit(fixture, "recovery");

      for (const operation of stale) {
        expect(() => inspectMountedArtifactAuthorityOperation(operation), reason).toThrow(/current|burned/i);
      }

      current = issueMountedArtifactAuthorityOperationForFactory(wakeRuntime);
      expect(inspectMountedArtifactAuthorityOperation(current)).toMatchObject({
        workspaceId: fixture.workspaceId,
        admissionGenerationId: `admission:${stale.length + 1}`
      });
    }

    expect(inspectMountedArtifactAuthorityOperation(current).workspaceId).toBe(fixture.workspaceId);
    const operationSource = readFileSync(new URL("../src/mounted-artifact-authority-operation.ts", import.meta.url), "utf8");
    expect(operationSource).not.toMatch(/\boperations\s*:\s*Set<MountedArtifactAuthorityOperation>/);
    expect(operationSource).not.toMatch(/subscribeInvalidation\s*\(/);
  });

  it("burns stale operations without retaining a reusable factory capture", async () => {
    const fixture = authorityFixture();
    const wakeRuntime = {};
    registerMountedArtifactAuthorityIssuerForWakeRuntime({ wakeRuntime, lifecyclePorts: fixture.ports, runtimeHandle: fixture.handle });
    await admit(fixture, "wake");

    for (const reason of ["authority-loss", "admission-mismatch", "shutdown"] as const) {
      const stale = issueMountedArtifactAuthorityOperationForFactory(wakeRuntime);
      fixture.ports.authority.invalidate!(reason);
      await admit(fixture, "recovery");

      expect(() => inspectMountedArtifactAuthorityOperation(stale), reason).toThrow(/current|burned/i);
      expect(() => inspectMountedArtifactAuthorityOperation(stale), reason).toThrow(/burned/i);
    }

    expect(fixture.calls).toEqual({ mounted: 4, lease: 4, reconciliation: 0 });
    const operationSource = readFileSync(new URL("../src/mounted-artifact-authority-operation.ts", import.meta.url), "utf8");
    expect(operationSource).toMatch(
      /function burnOperation[\s\S]*?if \(state\.burned\) return;[\s\S]*?state\.burned = true;/
    );
    expect(operationSource).not.toMatch(/mountedRuntimeCapture/);
  });

  it("hands exact mounted ledger and paths to the portable store seam without exposing a public capture", async () => {
    const fixture = authorityFixture();
    const wakeRuntime = {};
    registerMountedArtifactAuthorityIssuerForWakeRuntime({ wakeRuntime, lifecyclePorts: fixture.ports, runtimeHandle: fixture.handle });
    await admit(fixture, "wake");
    const operation = issueMountedArtifactAuthorityOperationForFactory(wakeRuntime);

    const first = inspectMountedArtifactAuthorityOperationForPortableMountedAgentArtifactStores(operation);
    const second = inspectMountedArtifactAuthorityOperationForPortableMountedAgentArtifactStores(operation);
    const mountedWorkspace = fixture.handle.mountedWorkspace;
    if (mountedWorkspace === undefined) throw new Error("fixture must mount a portable workspace");

    expect(first).not.toBe(second);
    expect(first.snapshot).toEqual(inspectMountedArtifactAuthorityOperation(operation));
    expect(first.ledger).toBe(fixture.handle.ledger);
    expect(first.mountedWorkspace).toBe(mountedWorkspace);
    expect(first.workspace).toEqual({
      workspaceId: fixture.workspaceId,
      rootDir: fixture.workspaceRoot,
      manifestPath: mountedWorkspace.manifestPath,
      ledgerPath: mountedWorkspace.paths.ledgerPath,
      blobRoot: mountedWorkspace.paths.blobRoot,
      derivativeRoot: mountedWorkspace.paths.derivativeRoot,
      jobRoot: mountedWorkspace.paths.jobRoot,
      projectionRoot: mountedWorkspace.paths.projectionRoot,
      cacheRoot: mountedWorkspace.paths.cacheRoot,
      configRoot: mountedWorkspace.paths.configRoot
    });
    expect(first.sourceHighWater).toMatchObject({
      schemaVersion: "factory-issued-mounted-runtime-source-high-water.v1",
      ledger: fixture.handle.ledger,
      workspaceId: fixture.workspaceId,
      rootDir: fixture.workspaceRoot
    });
    expect(Object.isFrozen(first)).toBe(true);
    expect((first as unknown as Record<string, unknown>).runtimeHandle).toBeUndefined();
    expect((first as unknown as Record<string, unknown>).portableStorage).toBeUndefined();
    expect(() => inspectMountedArtifactAuthorityOperationForPortableMountedAgentArtifactStores({ ...operation })).toThrow(/operation/i);

    fixture.ports.authority.invalidate!("shutdown");
    await admit(fixture, "recovery");
    expect(() => inspectMountedArtifactAuthorityOperationForPortableMountedAgentArtifactStores(operation)).toThrow(/current|burned/i);
    const recovered = issueMountedArtifactAuthorityOperationForFactory(wakeRuntime);
    expect(inspectMountedArtifactAuthorityOperationForPortableMountedAgentArtifactStores(recovered).ledger).toBe(fixture.handle.ledger);
  });

  it("burns both public and portable-store inspection paths after runtime close without further mounted effects", async () => {
    const fixture = authorityFixture();
    const wakeRuntime = {};
    registerMountedArtifactAuthorityIssuerForWakeRuntime({ wakeRuntime, lifecyclePorts: fixture.ports, runtimeHandle: fixture.handle });
    await admit(fixture, "wake");
    const operation = issueMountedArtifactAuthorityOperationForFactory(wakeRuntime);

    const first = inspectMountedArtifactAuthorityOperationForPortableMountedAgentArtifactStores(operation);
    expect(first.ledger).toBe(fixture.handle.ledger);
    fixture.handle.close();

    expect(() => inspectMountedArtifactAuthorityOperation(operation)).toThrow(/current|burned/i);
    expect(() => inspectMountedArtifactAuthorityOperationForPortableMountedAgentArtifactStores(operation)).toThrow(/current|burned/i);
    expect(fixture.calls).toEqual({ mounted: 1, lease: 1, reconciliation: 0 });
    expect(() => inspectMountedArtifactAuthorityOperation(operation)).toThrow(/burned/i);
    expect(() => inspectMountedArtifactAuthorityOperationForPortableMountedAgentArtifactStores(operation)).toThrow(/burned/i);
  });

  it("copied serialized and foreign runtime operations fail before store io", async () => {
    const fixture = authorityFixture();
    const wakeRuntime = {};
    registerMountedArtifactAuthorityIssuerForWakeRuntime({ wakeRuntime, lifecyclePorts: fixture.ports, runtimeHandle: fixture.handle });
    await admit(fixture, "wake");
    const operation = issueMountedArtifactAuthorityOperationForFactory(wakeRuntime);
    const copied = { ...operation } as MountedArtifactAuthorityOperation;
    const serialized = JSON.parse(JSON.stringify(operation)) as MountedArtifactAuthorityOperation;

    expect(() => inspectMountedArtifactAuthorityOperation(copied)).toThrow(/operation/i);
    expect(() => inspectMountedArtifactAuthorityOperation(serialized)).toThrow(/operation/i);
    expect(() => issueMountedArtifactAuthorityOperationForFactory({})).toThrow(/wake runtime/i);
    expect(fixture.calls).toEqual({ mounted: 1, lease: 1, reconciliation: 0 });
  });

  it("only wake runtime may register and only agent runtime factory may issue authority operations", async () => {
    const fixture = authorityFixture();
    const wakeRuntime = {};

    expect(() => issueMountedArtifactAuthorityOperationForFactory(wakeRuntime)).toThrow(/wake runtime/i);
    registerMountedArtifactAuthorityIssuerForWakeRuntime({ wakeRuntime, lifecyclePorts: fixture.ports, runtimeHandle: fixture.handle });
    expect(() => registerMountedArtifactAuthorityIssuerForWakeRuntime({
      wakeRuntime, lifecyclePorts: fixture.ports, runtimeHandle: fixture.handle
    })).toThrow(/already registered/i);
    await admit(fixture, "wake");

    const operation = issueMountedArtifactAuthorityOperationForFactory(wakeRuntime);
    expect(Object.keys(operation)).toEqual(["schemaVersion"]);
    expect(operation.schemaVersion).toBe("mounted-artifact-authority-operation.v1");
    expect(Object.isFrozen(operation)).toBe(true);
  });

  it("hands only the mounted ledger and current snapshot to the feasibility bridge", async () => {
    const fixture = authorityFixture();
    const wakeRuntime = {};
    registerMountedArtifactAuthorityIssuerForWakeRuntime({ wakeRuntime, lifecyclePorts: fixture.ports, runtimeHandle: fixture.handle });
    await admit(fixture, "wake");
    const operation = issueMountedArtifactAuthorityOperationForFactory(wakeRuntime);

    const inspection = inspectMountedArtifactAuthorityOperationForMountedOfficialFlowFeasibility(operation);
    expect(inspection.snapshot).toEqual(inspectMountedArtifactAuthorityOperation(operation));
    expect(inspection.ledger).toBe(fixture.handle.ledger);
    expect(Object.isFrozen(inspection)).toBe(true);
    expect((inspection as unknown as Record<string, unknown>).runtimeHandle).toBeUndefined();
    expect((inspection as unknown as Record<string, unknown>).mountedWorkspace).toBeUndefined();
  });

  it("rejects copied serialized and forged operations at the feasibility bridge", async () => {
    const fixture = authorityFixture();
    const wakeRuntime = {};
    registerMountedArtifactAuthorityIssuerForWakeRuntime({ wakeRuntime, lifecyclePorts: fixture.ports, runtimeHandle: fixture.handle });
    await admit(fixture, "wake");
    const operation = issueMountedArtifactAuthorityOperationForFactory(wakeRuntime);

    expect(() => inspectMountedArtifactAuthorityOperationForMountedOfficialFlowFeasibility({ ...operation })).toThrow(/operation/i);
    expect(() => inspectMountedArtifactAuthorityOperationForMountedOfficialFlowFeasibility(JSON.parse(JSON.stringify(operation)))).toThrow(/operation/i);
    expect(() => inspectMountedArtifactAuthorityOperationForMountedOfficialFlowFeasibility({ schemaVersion: operation.schemaVersion })).toThrow(/operation/i);
  });

  it("burns the feasibility bridge after admission invalidation", async () => {
    const fixture = authorityFixture();
    const wakeRuntime = {};
    registerMountedArtifactAuthorityIssuerForWakeRuntime({ wakeRuntime, lifecyclePorts: fixture.ports, runtimeHandle: fixture.handle });
    await admit(fixture, "wake");
    const operation = issueMountedArtifactAuthorityOperationForFactory(wakeRuntime);
    expect(inspectMountedArtifactAuthorityOperationForMountedOfficialFlowFeasibility(operation).ledger).toBe(fixture.handle.ledger);

    fixture.ports.authority.invalidate!("shutdown");
    await admit(fixture, "recovery");
    expect(() => inspectMountedArtifactAuthorityOperationForMountedOfficialFlowFeasibility(operation)).toThrow(/current|burned/i);
  });

  it("burns the feasibility bridge after the factory runtime closes", async () => {
    const fixture = authorityFixture();
    const wakeRuntime = {};
    registerMountedArtifactAuthorityIssuerForWakeRuntime({ wakeRuntime, lifecyclePorts: fixture.ports, runtimeHandle: fixture.handle });
    await admit(fixture, "wake");
    const operation = issueMountedArtifactAuthorityOperationForFactory(wakeRuntime);
    expect(inspectMountedArtifactAuthorityOperationForMountedOfficialFlowFeasibility(operation).snapshot.workspaceId).toBe(fixture.workspaceId);

    fixture.handle.close();
    expect(() => inspectMountedArtifactAuthorityOperationForMountedOfficialFlowFeasibility(operation)).toThrow(/current|burned/i);
  });

  it("keeps the feasibility inspection seam private to direct source imports", () => {
    const source = readFileSync(new URL("../src/mounted-artifact-authority-operation.ts", import.meta.url), "utf8");
    expect(source).toMatch(/inspectMountedArtifactAuthorityOperationForMountedOfficialFlowFeasibility/);
    expect(source).not.toMatch(/export\s*\{[^}]*inspectMountedArtifactAuthorityOperationForMountedOfficialFlowFeasibility/);
  });

  it("returns a fresh feasibility snapshot while retaining the factory-captured ledger", async () => {
    const fixture = authorityFixture();
    const wakeRuntime = {};
    registerMountedArtifactAuthorityIssuerForWakeRuntime({ wakeRuntime, lifecyclePorts: fixture.ports, runtimeHandle: fixture.handle });
    await admit(fixture, "wake");
    const operation = issueMountedArtifactAuthorityOperationForFactory(wakeRuntime);

    const first = inspectMountedArtifactAuthorityOperationForMountedOfficialFlowFeasibility(operation);
    const second = inspectMountedArtifactAuthorityOperationForMountedOfficialFlowFeasibility(operation);
    expect(first).not.toBe(second);
    expect(first.snapshot).not.toBe(second.snapshot);
    expect(first.ledger).toBe(second.ledger);
  });
});

function authorityFixture(): {
  readonly workspaceId: string;
  readonly workspaceRoot: string;
  readonly handle: LocalRuntimeHandle;
  readonly ports: PortableWorkspaceLifecyclePorts;
  readonly calls: { mounted: number; lease: number; reconciliation: number };
} {
  const workspaceId = `ws_mounted_authority_${tempDirs.length + 1}`;
  const workspaceRoot = join(tempDir(), workspaceId);
  createPortableWorkspace({
    rootDir: workspaceRoot,
    workspaceId,
    label: `Mounted authority ${workspaceId}`,
    createdAt: "2026-07-15T00:00:00.000Z",
    createdBy: "mounted-artifact-authority-operation-test"
  });
  const config = resolveLocalRuntimeConfig({
    cwd: workspaceRoot,
    env: { CESTUS_LOCAL_STORAGE: "portable-workspace", CESTUS_WORKSPACE_ROOT: workspaceRoot }
  });
  const handle = track(createSqlitePrrRuntime({
    config,
    actor: { id: "actor_mounted_authority", kind: "human", label: "Mounted authority test" }
  }));
  const calls = { mounted: 0, lease: 0, reconciliation: 0 };
  const supervisorEpoch = "epoch_mounted_authority";
  const ports = createPortableWorkspaceLifecyclePorts({
    workspaceId,
    residentId: "agent_default",
    supervisorEpoch,
    mountedFacts: {
      async read() {
        calls.mounted += 1;
        return {
          ok: true as const,
          facts: {
            schemaVersion: "portable-workspace-mounted-facts.v1" as const,
            workspaceId,
            residentId: "agent_default" as const,
            workspaceIdentityEventId: "evt_workspace_identity",
            mountInstanceId: "mount-instance:1",
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
    supervisorLease: leasePort(workspaceId, supervisorEpoch, calls),
    activeClaimReconciliation: reconciliationPort(calls),
    now: () => "2026-07-15T00:00:00.000Z",
    createSafeOutageObservationId: () => "outage:mounted-authority"
  });
  return { workspaceId, workspaceRoot, handle, ports, calls };
}

async function admit(
  fixture: ReturnType<typeof authorityFixture>,
  operation: "wake" | "recovery"
): Promise<WorkspaceAdmissionSnapshot> {
  const grant = await fixture.ports.authority.revalidate({
    operation,
    expectedWorkspaceId: fixture.workspaceId,
    requiredCapabilities: ["wake", "lifecycle"]
  });
  if (!grant.ok) throw new Error("fixture must issue an admission");
  const result = await fixture.ports.supervisorLease.readOrAcquire({
    admission: grant.admission,
    residentId: "agent_default",
    supervisorEpoch: "epoch_mounted_authority",
    policyVersion: "policy.v1",
    policyDigest: "sha256:policy",
    lockStateDigest: "sha256:lock",
    causationId: "cause_mounted_authority",
    correlationId: "correlation_mounted_authority"
  });
  if (result.outcome !== "acquired-and-read-back") throw new Error("fixture must read back its lease");
  return grant.admission;
}

function leasePort(
  workspaceId: string,
  supervisorEpoch: string,
  calls: { mounted: number; lease: number; reconciliation: number }
): DurableSupervisorLeasePort {
  return {
    async readOrAcquire() {
      calls.lease += 1;
      return { outcome: "acquired-and-read-back" as const, readback: leaseReadback(workspaceId, supervisorEpoch) };
    }
  };
}

function leaseReadback(workspaceId: string, supervisorEpoch: string): SupervisorLeaseReadbackEvidence {
  return {
    schemaVersion: "resident-supervisor-lease-readback.v1",
    workspaceId,
    residentId: "agent_default",
    supervisorEpoch,
    workspaceIdentityEventId: "evt_workspace_identity",
    mountEvidenceId: "evidence_mount",
    authorityEvidenceId: "evidence_authority",
    policyVersion: "policy.v1",
    policyDigest: "sha256:policy",
    lockStateDigest: "sha256:lock",
    highWaterMark: "high-water:5",
    leaseEventId: "evt_lease",
    readbackEventId: "evt_lease_readback",
    expiresAt: "2026-07-15T01:00:00.000Z",
    causation: { causationId: "cause_mounted_authority", correlationId: "correlation_mounted_authority" },
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

function reconciliationPort(
  calls: { mounted: number; lease: number; reconciliation: number }
): ActiveClaimReconciliationPort {
  return {
    async readByIdempotencyKey() {
      calls.reconciliation += 1;
      return undefined;
    },
    async appendAndReadBack() {
      calls.reconciliation += 1;
      throw new Error("reconciliation is not expected");
    }
  };
}

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "cestus-mounted-authority-"));
  tempDirs.push(dir);
  return dir;
}

function track(handle: LocalRuntimeHandle): LocalRuntimeHandle {
  handles.push(handle);
  return handle;
}
