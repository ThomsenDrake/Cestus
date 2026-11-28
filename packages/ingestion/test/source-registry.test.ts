import { describe, expect, it } from "vitest";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { IngestionSourceRegistry } from "../src/source-registry.js";

const actor = { id: "actor_investigator", kind: "human" as const, label: "Investigator" };

describe("IngestionSourceRegistry", () => {
  it("registers a read-only local source collection", async () => {
    const ledger = new InMemoryEventLedger();
    const registry = new IngestionSourceRegistry({ ledger, actor });

    const event = await registry.registerLocalSource({
      sourceCollectionId: "src_drive_001",
      label: "External investigation archive",
      rootUri: "file:///mnt/source",
      workspaceUri: "file:///mnt/cestus-workspace"
    });

    expect(event.type).toBe("ingestion.source.registered");
    expect(event.payload.mode).toBe("read-only");
    expect(event.payload.adapter).toEqual({ name: "local-filesystem", version: "0.1.0" });
    expect(await ledger.readStream("ingestion_source_src_drive_001")).toHaveLength(1);
  });

  it("rejects duplicate source collection registration before appending", async () => {
    const ledger = new InMemoryEventLedger();
    const registry = new IngestionSourceRegistry({ ledger, actor });
    const input = {
      sourceCollectionId: "src_drive_001",
      label: "External investigation archive",
      rootUri: "file:///mnt/source",
      workspaceUri: "file:///mnt/cestus-workspace"
    };

    await registry.registerLocalSource(input);

    await expect(registry.registerLocalSource(input)).rejects.toThrow(
      "Source collection src_drive_001 is already registered"
    );
    expect(await ledger.readStream("ingestion_source_src_drive_001")).toHaveLength(1);
  });

  it("appends ingestion.source.label.updated at next sequence without rewriting registration", async () => {
    const ledger = new InMemoryEventLedger();
    const registry = new IngestionSourceRegistry({ ledger, actor });

    const registered = await registry.registerLocalSource({
      sourceCollectionId: "src_osceola_county",
      label: "Osceola County",
      rootUri: "file:///mnt/osceola",
      workspaceUri: "file:///mnt/cestus-workspace"
    });

    const updated = await registry.updateSourceLabel({
      sourceCollectionId: "src_osceola_county",
      label: "Osceola County Sheriff's Office",
      rationale: "Correct agency name from county shorthand"
    });

    expect(updated.type).toBe("ingestion.source.label.updated");
    expect(updated.sequence).toBe(2);
    expect(updated.streamId).toBe("ingestion_source_src_osceola_county");
    expect(updated.context.causationId).toBe(registered.id);
    expect(updated.payload).toEqual({
      sourceCollectionId: "src_osceola_county",
      label: "Osceola County Sheriff's Office",
      previousLabel: "Osceola County",
      rationale: "Correct agency name from county shorthand",
      actor
    });

    const updatedAgain = await registry.updateSourceLabel({
      sourceCollectionId: "src_osceola_county",
      label: "Osceola County Sheriff's Office (FL)"
    });
    expect(updatedAgain.sequence).toBe(3);
    expect(updatedAgain.context.causationId).toBe(updated.id);
    expect(updatedAgain.payload.previousLabel).toBe("Osceola County Sheriff's Office");
    expect(updatedAgain.payload.rationale).toBeUndefined();

    const stream = await ledger.readStream("ingestion_source_src_osceola_county");
    expect(stream).toHaveLength(3);
    expect(stream[0]).toEqual(registered);
  });

  it("refuses label updates for unregistered sources or unchanged labels", async () => {
    const ledger = new InMemoryEventLedger();
    const registry = new IngestionSourceRegistry({ ledger, actor });

    await expect(
      registry.updateSourceLabel({
        sourceCollectionId: "src_missing",
        label: "Missing Agency"
      })
    ).rejects.toThrow("Source collection src_missing is not registered");

    await registry.registerLocalSource({
      sourceCollectionId: "src_osceola_county",
      label: "Osceola County Sheriff's Office",
      rootUri: "file:///mnt/osceola",
      workspaceUri: "file:///mnt/cestus-workspace"
    });

    await expect(
      registry.updateSourceLabel({
        sourceCollectionId: "src_osceola_county",
        label: "Osceola County Sheriff's Office"
      })
    ).rejects.toThrow("already has that label");
    expect(await ledger.readStream("ingestion_source_src_osceola_county")).toHaveLength(1);
  });
});
