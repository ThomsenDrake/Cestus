import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { SQLiteEventLedger } from "../../ontology/src/sqlite-event-ledger.js";
import { createPrrRuntime } from "../src/runtime.js";
import { goldenPrrLedgerEvents } from "./fixtures/golden-prr-ledger.js";

const fixedNow = () => "2026-07-03T12:00:00.000Z";
const investigatorActor = {
  id: "actor_avery_investigator",
  kind: "human",
  label: "Avery Investigator"
} as const;

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("PRR local runtime", () => {
  it("loads a workspace from an in-memory ledger seeded with golden events", async () => {
    const ledger = new InMemoryEventLedger();
    const runtime = createPrrRuntime({ ledger, actor: investigatorActor, now: fixedNow });

    const seedResult = await runtime.seedIfEmpty(goldenPrrLedgerEvents);
    expect(seedResult.appendedCount).toBe(goldenPrrLedgerEvents.length);
    expect((await runtime.loadWorkspace()).cards.length).toBeGreaterThan(1);

    const secondSeed = await runtime.seedIfEmpty(goldenPrrLedgerEvents);
    expect(secondSeed).toEqual({ appendedCount: 0, skipped: true });
  });

  it("replays the same workspace after SQLite close and reopen", async () => {
    const dbPath = join(tempDir(), "ledger.sqlite");
    const firstLedger = new SQLiteEventLedger(dbPath);
    const firstRuntime = createPrrRuntime({ ledger: firstLedger, actor: investigatorActor, now: fixedNow });
    await firstRuntime.seedIfEmpty(goldenPrrLedgerEvents);
    const firstWorkspace = await firstRuntime.loadWorkspace();
    firstLedger.close();

    const secondLedger = new SQLiteEventLedger(dbPath);
    const secondRuntime = createPrrRuntime({ ledger: secondLedger, actor: investigatorActor, now: fixedNow });
    expect(await secondRuntime.loadWorkspace()).toEqual(firstWorkspace);
    secondLedger.close();
  });

  it("creates a draft request and causally linked estimated deadline", async () => {
    const ledger = new InMemoryEventLedger();
    const runtime = createPrrRuntime({
      ledger,
      actor: investigatorActor,
      now: fixedNow,
      requestIdFactory: () => "prr_new_city_budget"
    });

    const result = await runtime.createDraftRequest({
      jurisdictionPack: { name: "florida-public-records", version: "0.1.0" },
      agency: { name: "City Clerk", email: "clerk@example.gov" },
      requester: { name: "Avery Investigator", email: "avery@example.org" },
      requestText: "All budget amendment memos from January 2026.",
      receivedAt: "2026-07-03T12:00:00.000Z"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.diagnostic.message);
    }
    expect(result.committedEventIds).toHaveLength(2);

    const events = await ledger.readStream("prr_new_city_budget");
    expect(events.map((event) => [event.type, event.sequence])).toEqual([
      ["prr.request.created", 1],
      ["prr.deadline.estimated", 2]
    ]);
    expect(events[1]?.context.causationId).toBe(events[0]?.id);
    expect(result.workspace.cards.some((card) => card.prrRequestId === "prr_new_city_budget")).toBe(true);
  });

  it("returns an inspectable partial failure after draft creation without deleting events", async () => {
    const ledger = new DeleteTrackingLedger();
    const runtime = createPrrRuntime({
      ledger,
      actor: investigatorActor,
      now: fixedNow,
      requestIdFactory: () => "prr_partial_deadline_failure",
      deadlineCalculator() {
        throw new Error("calendar service not available");
      }
    });

    const result = await runtime.createDraftRequest({
      jurisdictionPack: { name: "florida-public-records", version: "0.1.0" },
      agency: { name: "City Clerk", email: "clerk@example.gov" },
      requester: { name: "Avery Investigator", email: "avery@example.org" },
      requestText: "All budget amendment memos from January 2026.",
      receivedAt: "2026-07-03T12:00:00.000Z"
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected deadline estimation to fail after draft creation");
    }
    expect(result.failedStep).toBe("estimate-deadline");
    expect(result.committedEventIds).toHaveLength(1);
    expect(result.workspace.cards.some((card) => card.prrRequestId === "prr_partial_deadline_failure")).toBe(
      true
    );
    expect(await ledger.readStream("prr_partial_deadline_failure")).toHaveLength(1);
    expect(ledger.deleteAttempts).toBe(0);
  });

  it("does not append an event when draft input validation fails", async () => {
    const ledger = new InMemoryEventLedger();
    const runtime = createPrrRuntime({
      ledger,
      actor: investigatorActor,
      now: fixedNow,
      requestIdFactory: () => "not_a_prr_id"
    });

    const result = await runtime.createDraftRequest({
      jurisdictionPack: { name: "florida-public-records", version: "0.1.0" },
      agency: { name: "City Clerk", email: "clerk@example.gov" },
      requester: { name: "Avery Investigator", email: "avery@example.org" },
      requestText: "All budget amendment memos from January 2026.",
      receivedAt: "2026-07-03T12:00:00.000Z"
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected invalid draft input to fail before append");
    }
    expect(result.failedStep).toBe("validate-input");
    expect(result.committedEventIds).toEqual([]);
    expect(await ledger.readAll()).toEqual([]);
  });

  it("rewrites seeded fixture causation ids to committed predecessor ids", async () => {
    const ledger = new InMemoryEventLedger();
    const runtime = createPrrRuntime({ ledger, actor: investigatorActor, now: fixedNow });
    const seedEvents = goldenPrrLedgerEvents.filter(
      (event) => event.streamId === "prr_draft_city_budget"
    );

    await runtime.seedIfEmpty(seedEvents);

    const [created, deadline] = await ledger.readStream("prr_draft_city_budget");
    expect(created?.id).not.toBe("evt_prr_draft_city_budget_created");
    expect(deadline?.context.causationId).toBe(created?.id);
    expect(deadline?.context.causationId).not.toBe("evt_prr_draft_city_budget_created");
  });

  it("exposes committed events for diagnostics", async () => {
    const ledger = new InMemoryEventLedger();
    const runtime = createPrrRuntime({ ledger, actor: investigatorActor, now: fixedNow });
    await runtime.seedIfEmpty(goldenPrrLedgerEvents.slice(0, 2));

    expect(await runtime.readEvents()).toHaveLength(2);
  });
});

class DeleteTrackingLedger extends InMemoryEventLedger {
  deleteAttempts = 0;

  deleteEvent(): void {
    this.deleteAttempts += 1;
  }
}

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "cestus-prr-"));
  tempDirs.push(dir);
  return dir;
}
