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
});
