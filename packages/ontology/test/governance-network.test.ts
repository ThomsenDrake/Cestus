import { describe, expect, it } from "vitest";
import { type AppendableKnowledgeEvent, type KnowledgeEvent } from "../src/contracts.js";
import { type AppendOptions, type EventLedger, InMemoryEventLedger } from "../src/event-ledger.js";
import { buildGovernanceProjection } from "../src/governance-projection.js";
import { GovernanceService } from "../src/governance-service.js";
import { goldenGovernanceLedgerEvents } from "./fixtures/golden-governance-ledger.js";

const actor = { id: "actor_investigator", kind: "human" as const, label: "Investigator" };
const classifier = { id: "actor_classifier", kind: "extractor" as const, label: "Governance classifier" };
const policy = { policyId: "gov_policy_default", version: "0.1.0" } as const;

class RecordingLedger implements EventLedger {
  private readonly ledger = new InMemoryEventLedger();
  readonly appendOptions: AppendOptions[] = [];

  async append(event: AppendableKnowledgeEvent, options: AppendOptions = {}): Promise<KnowledgeEvent> {
    this.appendOptions.push(options);
    return this.ledger.append(event, options);
  }

  async readStream(streamId: string): Promise<KnowledgeEvent[]> {
    return this.ledger.readStream(streamId);
  }

  async readAll(): Promise<KnowledgeEvent[]> {
    return this.ledger.readAll();
  }
}

describe("network exposure and device approval governance", () => {
  it("projects visible LAN or tailnet exposure state", () => {
    const projection = buildGovernanceProjection(goldenGovernanceLedgerEvents);
    expect(projection.networkExposure.activeExposure).toMatchObject({
      exposureId: "netexp_tailnet_001",
      mode: "tailnet",
      visibleWarning: true
    });
  });

  it("requires local approval before a session is trusted", () => {
    const projection = buildGovernanceProjection(goldenGovernanceLedgerEvents);
    expect(projection.isSessionApproved("devsess_reporter_laptop")).toBe(true);
    expect(projection.isSessionApproved("devsess_unapproved")).toBe(false);
  });

  it("revocation removes current session approval without deleting the approval event", () => {
    const projection = buildGovernanceProjection(goldenGovernanceLedgerEvents);
    expect(projection.isSessionApproved("devsess_revoked_tablet")).toBe(false);
    expect(projection.deviceSessions.get("devsess_revoked_tablet")?.approvalEventId).toBe("evt_device_tablet_approved");
    expect(projection.deviceSessions.get("devsess_revoked_tablet")?.revocationEventId).toBe("evt_device_tablet_revoked");
  });

  it("clears active exposure when the latest matching exposure event disables it", () => {
    const projection = buildGovernanceProjection([
      ...goldenGovernanceLedgerEvents,
      {
        id: "evt_network_tailnet_disabled",
        type: "network.exposure.disabled",
        version: 1,
        streamId: "network_exposure_netexp_tailnet_001",
        sequence: 2,
        context: {
          actor,
          occurredAt: "2026-07-05T15:20:00.000Z",
          causationId: "evt_network_tailnet_enabled",
          correlationId: "corr_golden_governance",
          coreVersion: "0.1.0",
          packVersions: { core: "0.1.0" }
        },
        payload: {
          exposureId: "netexp_tailnet_001",
          disabledBy: "actor_investigator",
          disabledAt: "2026-07-05T15:20:00.000Z",
          reason: "Tailnet sharing closed after review."
        }
      }
    ]);

    expect(projection.networkExposure.activeExposure).toBeUndefined();
  });

  it("returns immutable network exposure and device session snapshots", () => {
    const projection = buildGovernanceProjection(goldenGovernanceLedgerEvents);
    const laptop = projection.deviceSessions.get("devsess_reporter_laptop");

    expect(() => {
      (projection.networkExposure as { activeExposure?: unknown }).activeExposure = undefined;
    }).toThrow();
    expect(() => projection.deviceSessions.set("devsess_mutated", laptop!)).toThrow(
      "GovernanceProjection.deviceSessions is read-only"
    );
    expect(() => (laptop?.capabilities as ("read" | "write")[]).push("read")).toThrow();
  });

  it("enables network exposure with a visible warning and human actor", async () => {
    const ledger = new RecordingLedger();
    const service = new GovernanceService({ ledger, actor });

    const event = await service.enableNetworkExposure({
      exposureId: "netexp_tailnet_002",
      mode: "tailnet",
      bindScope: "tailnet",
      enabledBy: "actor_investigator",
      policy
    });

    expect(event.type).toBe("network.exposure.enabled");
    expect(event.streamId).toBe("network_exposure_netexp_tailnet_002");
    expect(event.sequence).toBe(1);
    expect(event.context.actor).toEqual(actor);
    expect(event.payload).toMatchObject({
      exposureId: "netexp_tailnet_002",
      mode: "tailnet",
      bindScope: "tailnet",
      enabledBy: "actor_investigator",
      visibleWarning: true,
      policy
    });
    expect(ledger.appendOptions[0]).toEqual({ expectedNextSequence: 1 });
  });

  it("approves a device session with a human actor and safe device label", async () => {
    const ledger = new RecordingLedger();
    const service = new GovernanceService({ ledger, actor });
    const exposure = await service.enableNetworkExposure({
      exposureId: "netexp_tailnet_002",
      mode: "tailnet",
      bindScope: "tailnet",
      enabledBy: "actor_investigator",
      policy
    });

    const event = await service.approveDeviceSession({
      sessionId: "devsess_reporter_phone",
      deviceLabel: "Reporter phone",
      approvedBy: "actor_investigator",
      exposureId: "netexp_tailnet_002",
      capabilities: ["read", "write"],
      policy
    });

    expect(event.type).toBe("device.session.approved");
    expect(event.streamId).toBe("device_session_devsess_reporter_phone");
    expect(event.sequence).toBe(1);
    expect(event.context.actor).toEqual(actor);
    expect(event.context.causationId).toBe(exposure.id);
    expect(event.payload).toMatchObject({
      sessionId: "devsess_reporter_phone",
      deviceLabel: "Reporter phone",
      approvedBy: "actor_investigator",
      exposureId: "netexp_tailnet_002",
      capabilities: ["read", "write"],
      policy
    });
    expect(ledger.appendOptions[1]).toEqual({ expectedNextSequence: 1 });
  });

  it("rejects device approval without a current exposure event before append", async () => {
    const ledger = new InMemoryEventLedger();
    const service = new GovernanceService({ ledger, actor });

    await expect(
      service.approveDeviceSession({
        sessionId: "devsess_reporter_phone",
        deviceLabel: "Reporter phone",
        approvedBy: "actor_investigator",
        exposureId: "netexp_tailnet_002",
        capabilities: ["read"],
        policy
      })
    ).rejects.toThrow("Cannot approve device session without an active network exposure");

    expect(await ledger.readAll()).toHaveLength(0);
  });

  it("rejects device approval when the requested exposure was disabled before append", async () => {
    const ledger = new InMemoryEventLedger();
    const service = new GovernanceService({ ledger, actor });
    const exposure = await service.enableNetworkExposure({
      exposureId: "netexp_tailnet_002",
      mode: "tailnet",
      bindScope: "tailnet",
      enabledBy: "actor_investigator",
      policy
    });
    await ledger.append(
      {
        type: "network.exposure.disabled",
        version: 1,
        streamId: "network_exposure_netexp_tailnet_002",
        context: {
          actor,
          occurredAt: "2026-07-05T15:20:00.000Z",
          causationId: exposure.id,
          correlationId: "corr_network_exposure_netexp_tailnet_002",
          coreVersion: "0.1.0",
          packVersions: { core: "0.1.0" }
        },
        payload: {
          exposureId: "netexp_tailnet_002",
          disabledBy: "actor_investigator",
          disabledAt: "2026-07-05T15:20:00.000Z",
          reason: "Tailnet sharing closed after review."
        }
      },
      { expectedNextSequence: 2 }
    );

    await expect(
      service.approveDeviceSession({
        sessionId: "devsess_reporter_phone",
        deviceLabel: "Reporter phone",
        approvedBy: "actor_investigator",
        exposureId: "netexp_tailnet_002",
        capabilities: ["read"],
        policy
      })
    ).rejects.toThrow("Cannot approve device session without an active network exposure");

    expect(await ledger.readStream("device_session_devsess_reporter_phone")).toHaveLength(0);
  });

  it("rejects non-human service actors before exposure or approval append", async () => {
    const ledger = new InMemoryEventLedger();
    const service = new GovernanceService({ ledger, actor: classifier });

    await expect(
      service.enableNetworkExposure({
        exposureId: "netexp_tailnet_002",
        mode: "tailnet",
        bindScope: "tailnet",
        enabledBy: "actor_classifier",
        policy
      })
    ).rejects.toThrow("requires a human service actor");

    await expect(
      service.approveDeviceSession({
        sessionId: "devsess_reporter_phone",
        deviceLabel: "Reporter phone",
        approvedBy: "actor_classifier",
        exposureId: "netexp_tailnet_002",
        capabilities: ["read"],
        policy
      })
    ).rejects.toThrow("requires a human service actor");

    expect(await ledger.readAll()).toHaveLength(0);
  });

  it("rejects secret-bearing device labels before append", async () => {
    const ledger = new InMemoryEventLedger();
    const service = new GovernanceService({ ledger, actor });

    await expect(
      service.approveDeviceSession({
        sessionId: "devsess_reporter_phone",
        deviceLabel: "Phone with access_token=abc123",
        approvedBy: "actor_investigator",
        exposureId: "netexp_tailnet_002",
        capabilities: ["read"],
        policy
      })
    ).rejects.toThrow("Governance text must not contain secrets");

    expect(await ledger.readAll()).toHaveLength(0);
  });
});
