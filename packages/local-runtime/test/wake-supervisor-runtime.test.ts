import { describe, expect, it } from "vitest";
import {
  inspectMountedArtifactAuthorityOperation,
  issueMountedArtifactAuthorityOperationForFactory
} from "../src/mounted-artifact-authority-operation.js";
import { createWakeSupervisorRuntime } from "../src/wake-supervisor-runtime.js";
import type { LocalRuntimeHandle } from "../src/runtime-factory.js";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";

function fixture() {
  const handle = {
    ledger: new InMemoryEventLedger(),
    mountedWorkspace: {
      workspaceId: "ws_wake_runtime",
      rootDir: "/tmp/ws_wake_runtime",
      manifestPath: "/tmp/ws_wake_runtime/workspace.json",
      paths: { ledgerPath: "/tmp/ws_wake_runtime/ledger.sqlite", blobRoot: "/tmp/ws_wake_runtime/blobs", derivativeRoot: "/tmp/ws_wake_runtime/derivatives", jobRoot: "/tmp/ws_wake_runtime/jobs", projectionRoot: "/tmp/ws_wake_runtime/projections", cacheRoot: "/tmp/ws_wake_runtime/cache", configRoot: "/tmp/ws_wake_runtime/config" }
    }
  } as unknown as LocalRuntimeHandle;
  const runtime = createWakeSupervisorRuntime({
    runtimeHandle: handle,
    actor: { id: "agent_wake_runtime", kind: "agent", label: "Wake runtime" },
    supervisorEpoch: "epoch_wake_runtime",
    policy: { policyVersion: "policy.v1", policyDigest: "sha256:policy", lockStateDigest: "sha256:lock" },
    now: () => "2026-07-16T00:00:00.000Z",
    createSafeId: (kind) => `${kind}_wake_runtime`
  });
  return { handle, runtime };
}

describe("wake supervisor runtime", () => {
  it("wake runtime registers one non public authority issuer after complete admission", async () => {
    const { runtime } = fixture();
    await expect(runtime.supervision.start()).resolves.toMatchObject({ outcome: "accepted" });
    expect(inspectMountedArtifactAuthorityOperation(issueMountedArtifactAuthorityOperationForFactory(runtime))).toMatchObject({ workspaceId: "ws_wake_runtime" });
  });

  it("stopped runtime cannot issue or inspect an authority operation", async () => {
    const { runtime } = fixture();
    await runtime.supervision.start();
    const operation = issueMountedArtifactAuthorityOperationForFactory(runtime);
    await runtime.stop();
    expect(() => inspectMountedArtifactAuthorityOperation(operation)).toThrow(/burned|current/i);
    expect(() => issueMountedArtifactAuthorityOperationForFactory(runtime)).toThrow(/complete|current|registered/i);
  });

  it("fresh process runtime requires new admission and emits a distinct operation", async () => {
    const first = fixture();
    await first.runtime.supervision.start();
    const firstOperation = issueMountedArtifactAuthorityOperationForFactory(first.runtime);
    await first.runtime.stop();
    const second = fixture();
    expect(() => issueMountedArtifactAuthorityOperationForFactory(second.runtime)).toThrow(/complete|current/i);
    await second.runtime.supervision.start();
    const secondOperation = issueMountedArtifactAuthorityOperationForFactory(second.runtime);
    expect(secondOperation).not.toBe(firstOperation);
  });

  it("exposes only supervision control and stop rather than authority internals", () => {
    const { runtime } = fixture();
    expect(Reflect.ownKeys(runtime).map(String).sort()).toEqual(["stop", "supervision"]);
    expect(Reflect.ownKeys(runtime.supervision).map(String)).not.toEqual(expect.arrayContaining(["authority", "issuer", "operation", "ports", "facts", "paths", "stores", "writer"]));
  });

  it("rejects a second authority operation for one completed admission", async () => {
    const { runtime } = fixture();
    await runtime.supervision.start();
    issueMountedArtifactAuthorityOperationForFactory(runtime);
    expect(() => issueMountedArtifactAuthorityOperationForFactory(runtime)).toThrow(/already issued/i);
  });

  it("invalidates authority before stop returns", async () => {
    const { runtime } = fixture();
    await runtime.supervision.start();
    const operation = issueMountedArtifactAuthorityOperationForFactory(runtime);
    await runtime.stop();
    expect(() => inspectMountedArtifactAuthorityOperation(operation)).toThrow();
  });

  it("rejects structural caller handles before installing a runtime", () => {
    const { handle } = fixture();
    expect(() => createWakeSupervisorRuntime({
      runtimeHandle: { ...handle } as LocalRuntimeHandle,
      actor: { id: "agent_wake_runtime", kind: "agent", label: "Wake runtime" },
      supervisorEpoch: "epoch_wake_runtime",
      policy: { policyVersion: "policy.v1", policyDigest: "sha256:policy", lockStateDigest: "sha256:lock" },
      now: () => "2026-07-16T00:00:00.000Z",
      createSafeId: (kind) => `${kind}_wake_runtime`
    })).toThrow(/factory-issued|runtime handle/i);
  });

  it("does not admit an operation after authority loss during a later lifecycle command", async () => {
    const { runtime } = fixture();
    await runtime.supervision.start();
    await runtime.stop();
    await expect(runtime.supervision.resume({ schemaVersion: "resident-wake-command.v1", commandId: "resume_after_stop", sourceEventIds: [], requestedAt: "2026-07-16T00:00:00.000Z", causation: { causationId: "evt_resume_after_stop", correlationId: "corr_resume_after_stop" } }))
      .resolves.toMatchObject({ outcome: "blocked" });
  });

  it("has no fallback storage or public authority constructor input", () => {
    const { runtime } = fixture();
    expect(JSON.stringify(runtime)).not.toMatch(/ledger|path|fallback|authority|operation/i);
  });
});
