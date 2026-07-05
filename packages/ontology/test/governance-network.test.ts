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
    expect(event.payload).toMatchObject({
      sessionId: "devsess_reporter_phone",
      deviceLabel: "Reporter phone",
      approvedBy: "actor_investigator",
      exposureId: "netexp_tailnet_002",
      capabilities: ["read", "write"],
      policy
    });
    expect(ledger.appendOptions[0]).toEqual({ expectedNextSequence: 1 });
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
