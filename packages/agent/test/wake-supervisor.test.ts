import { describe, expect, it } from "vitest";
import { createWakeSupervisor } from "../src/wake-supervisor.js";

describe("bounded wake supervisor", () => {
  it("coalesces duplicate finite signals into one bounded wake admission", async () => {
    const calls: string[] = [];
    const supervisor = createWakeSupervisor({
      residentId: "agent_default",
      supervisorEpoch: "epoch_a",
      workspaceId: "workspace_a",
      policyVersion: "policy.v1",
      policyDigest: "sha256:policy_a",
      lockStateDigest: "sha256:locks_a",
      authority: {
        async revalidate() {
          calls.push("authority.revalidate");
          return {
            ok: true,
            admission: {
              identityAndMount: {
                workspaceId: "workspace_a",
                residentId: "agent_default",
                supervisorEpoch: "epoch_a",
                workspaceIdentityEventId: "evt_identity_a",
                mountEvidenceId: "evt_mount_a",
                authorityEvidenceId: "evt_authority_a"
              }
            }
          } as const;
        }
      },
      lease: {
        async readOrAcquire() {
          calls.push("lease.readOrAcquire");
          return {
            outcome: "acquired-and-read-back",
            readback: {
              workspaceId: "workspace_a",
              residentId: "agent_default",
              supervisorEpoch: "epoch_a",
              workspaceIdentityEventId: "evt_identity_a",
              mountEvidenceId: "evt_mount_a",
              authorityEvidenceId: "evt_authority_a",
              policyVersion: "policy.v1",
              policyDigest: "sha256:policy_a",
              lockStateDigest: "sha256:locks_a",
              highWaterMark: "event:42",
              leaseEventId: "evt_lease_a",
              readbackEventId: "evt_lease_readback_a"
            }
          } as const;
        }
      },
      runtime: {
        async wakeOnce() {
          calls.push("runtime.wakeOnce");
          return { outcome: "completed" } as const;
        }
      }
    });

    await Promise.all([
      supervisor.signal({ source: "event", idempotencyKey: "signal_a" }),
      supervisor.signal({ source: "event", idempotencyKey: "signal_a" })
    ]);

    expect(calls).toEqual(["authority.revalidate", "lease.readOrAcquire", "runtime.wakeOnce"]);
    await expect(supervisor.status()).resolves.toMatchObject({ supervisorState: "running" });
  });

  it("closes intake after a pause command until a typed pause readback completes", async () => {
    const calls: string[] = [];
    const supervisor = createWakeSupervisor({
      residentId: "agent_default", supervisorEpoch: "epoch_pause", workspaceId: "workspace_a",
      policyVersion: "policy.v1", policyDigest: "sha256:policy_a", lockStateDigest: "sha256:locks_a",
      authority: { async revalidate() { return unavailableAdmission(); } },
      lease: { async readOrAcquire() { throw new Error("pause must not acquire a lease"); } },
      runtime: { async wakeOnce() { calls.push("runtime.wakeOnce"); } },
      lifecycle: { async pauseAndReadBack() { calls.push("lifecycle.pauseAndReadBack"); return { ok: true } as const; } }
    });

    await expect(supervisor.pause({ commandId: "pause_1" })).resolves.toMatchObject({ outcome: "accepted" });
    await expect(supervisor.status()).resolves.toMatchObject({ supervisorState: "paused" });
    await expect(supervisor.signal({ source: "event", idempotencyKey: "late" })).resolves.toMatchObject({ outcome: "blocked" });
    expect(calls).toEqual(["lifecycle.pauseAndReadBack"]);
  });
});

function unavailableAdmission() {
  return {
    ok: true,
    admission: { identityAndMount: {
      workspaceId: "workspace_a", residentId: "agent_default", supervisorEpoch: "epoch_pause",
      workspaceIdentityEventId: "evt_identity_a", mountEvidenceId: "evt_mount_a", authorityEvidenceId: "evt_authority_a"
    } }
  } as const;
}
