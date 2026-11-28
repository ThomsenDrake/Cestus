import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  HelixAppendOnlyError,
  InMemoryHelixGraphTransport,
  sha256ContentHash
} from "../../helix-contrib/src/index.js";
import { FileBlobStore } from "../src/blob-store.js";
import { InMemoryEventLedger } from "../src/event-ledger.js";
import { extractionMediaType, localExtractorIdentity } from "../src/extraction-contracts.js";
import {
  HelixProjectionLagError,
  HelixUnavailableError,
  createCestusHelixWriter,
  readOntologyWorkspaceFromHelix,
  rebuildHelixFromLedger,
  syncLedgerToHelix
} from "../src/helix-adapter.js";
import type { AppendableKnowledgeEvent } from "../src/contracts.js";

const actor = { id: "actor_test", kind: "human" as const, label: "Test Investigator" };
const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

function ctx(correlationId: string, occurredAt = "2026-11-28T00:00:00.000Z") {
  return {
    actor,
    occurredAt,
    correlationId,
    coreVersion: "0.1.0",
    packVersions: { core: "0.1.0" }
  };
}

function makeStores() {
  const dir = mkdtempSync(join(tmpdir(), "cestus-helix-adapter-"));
  tempDirs.push(dir);
  return {
    blobStore: new FileBlobStore(join(dir, "blobs")),
    derivativeStore: new FileBlobStore(join(dir, "derivatives"))
  };
}

describe("ontology helix adapter", () => {
  it("syncs ingested and parsed documents with matching evidenceId, contentHash, and passages", async () => {
    const ledger = new InMemoryEventLedger();
    const { blobStore, derivativeStore } = makeStores();
    const rawBytes = Buffer.from("Seminole detention intake roster entry 2026-03-14.\n", "utf8");
    const storedBlob = await blobStore.put(rawBytes);

    await ledger.append({
      type: "ingestion.source.registered",
      version: 1,
      streamId: "ingestion_source_src_seminole",
      context: ctx("corr_reg"),
      payload: {
        sourceCollectionId: "src_seminole",
        label: "Seminole Sheriff Production",
        mode: "read-only",
        adapter: { name: "local-filesystem", version: "1.0.0" },
        rootUri: "file:///synthetic/seminole",
        workspaceUri: "file:///synthetic/workspace"
      }
    } as AppendableKnowledgeEvent<"ingestion.source.registered">);

    const ingested = await ledger.append({
      type: "evidence.ingested",
      version: 1,
      streamId: "evidence_ev_doc_001",
      context: ctx("corr_ev_001"),
      payload: {
        evidenceId: "ev_doc_001",
        source: { kind: "file", label: "roster.txt", uri: "file:///synthetic/seminole/roster.txt" },
        contentHash: storedBlob.contentHash,
        mediaType: "text/plain",
        sizeBytes: storedBlob.sizeBytes
      }
    } as AppendableKnowledgeEvent<"evidence.ingested">);

    await ledger.append({
      type: "ingestion.evidence.linked",
      version: 1,
      streamId: "ingestion_import_src_seminole_imp_001",
      context: ctx("corr_link"),
      payload: {
        sourceCollectionId: "src_seminole",
        importBatchId: "imp_001",
        evidenceId: "ev_doc_001",
        contentHash: storedBlob.contentHash,
        occurrenceIds: ["occ_001"]
      }
    } as AppendableKnowledgeEvent<"ingestion.evidence.linked">);

    const extractionArtifact = {
      schemaVersion: "evidence-extraction.v1" as const,
      extractionId: "parse_001",
      evidenceId: "ev_doc_001",
      sourceContentHash: storedBlob.contentHash,
      extractor: { ...localExtractorIdentity },
      format: "text" as const,
      text: "Seminole detention intake roster entry 2026-03-14.",
      passages: [
        {
          locator: { kind: "text" as const, block: 1, start: 0, end: 50 },
          text: "Seminole detention intake roster entry 2026-03-14."
        }
      ]
    };
    const storedDerivative = await derivativeStore.put(
      Buffer.from(JSON.stringify(extractionArtifact), "utf8")
    );

    const parsed = await ledger.append({
      type: "ingestion.parse.completed",
      version: 1,
      streamId: "ingestion_parse_parse_001",
      context: ctx("corr_parse"),
      payload: {
        parseJobId: "parse_001",
        sourceCollectionId: "src_seminole",
        importBatchId: "imp_001",
        evidenceId: "ev_doc_001",
        lane: "local",
        parser: { ...localExtractorIdentity },
        outputHash: storedDerivative.contentHash,
        outputMediaType: extractionMediaType,
        completedAt: "2026-11-28T00:01:00.000Z"
      }
    } as AppendableKnowledgeEvent<"ingestion.parse.completed">);

    const transport = new InMemoryHelixGraphTransport();
    const events = await ledger.readAll();
    const sync = await syncLedgerToHelix({
      transport,
      databaseName: "ws_test",
      events,
      blobStore,
      derivativeStore
    });

    expect(sync.documents).toHaveLength(1);
    expect(sync.documents[0]).toMatchObject({
      evidenceId: "ev_doc_001",
      contentHash: storedBlob.contentHash,
      extractionStatus: "extracted",
      unextracted: false,
      passageCount: 1,
      authorityEventId: ingested.id,
      sourceCollectionId: "src_seminole",
      importBatchId: "imp_001"
    });

    const dto = await readOntologyWorkspaceFromHelix({
      transport,
      databaseName: "ws_test",
      ledger
    });
    expect(dto.status).toBe("ready");
    expect(dto.documents).toHaveLength(1);
    expect(dto.documents?.[0]).toMatchObject({
      evidenceId: "ev_doc_001",
      contentHash: storedBlob.contentHash,
      unextracted: false,
      passageCount: 1
    });
    expect(dto.documents?.[0]?.passages[0]).toMatchObject({
      evidenceId: "ev_doc_001",
      contentHash: storedBlob.contentHash,
      text: "Seminole detention intake roster entry 2026-03-14.",
      spanHash: sha256ContentHash("Seminole detention intake roster entry 2026-03-14."),
      authorityEventId: parsed.id
    });

    // Rebuild reproduces identical evidenceId, contentHash, and provenanceDigest.
    const rebuild1 = await rebuildHelixFromLedger({
      transport,
      databaseName: "ws_test",
      events,
      blobStore,
      derivativeStore
    });
    const rebuild2 = await rebuildHelixFromLedger({
      transport,
      databaseName: "ws_test",
      events,
      blobStore,
      derivativeStore
    });
    expect(rebuild2.fingerprint).toEqual(rebuild1.fingerprint);
    expect(rebuild2.documents).toEqual(rebuild1.documents);
    expect((await ledger.readAll()).length).toBe(events.length);
  });

  it("marks an unextracted scanned PDF without fabricating passages", async () => {
    const ledger = new InMemoryEventLedger();
    const { blobStore, derivativeStore } = makeStores();
    const rawPdf = Buffer.from("%PDF-1.4\n% synthetic scan\n%%EOF\n", "utf8");
    const storedBlob = await blobStore.put(rawPdf);

    await ledger.append({
      type: "evidence.ingested",
      version: 1,
      streamId: "evidence_ev_scan_001",
      context: ctx("corr_scan"),
      payload: {
        evidenceId: "ev_scan_001",
        source: { kind: "file", label: "scan.pdf", uri: "file:///synthetic/scan.pdf" },
        contentHash: storedBlob.contentHash,
        mediaType: "application/pdf",
        sizeBytes: storedBlob.sizeBytes
      }
    } as AppendableKnowledgeEvent<"evidence.ingested">);

    const unextractedArtifact = {
      schemaVersion: "evidence-extraction.v1" as const,
      extractionId: "parse_scan_001",
      evidenceId: "ev_scan_001",
      sourceContentHash: storedBlob.contentHash,
      extractor: { ...localExtractorIdentity, engine: "poppler-pdftotext", engineVersion: "24.02.0" },
      format: "pdf" as const,
      text: "",
      pdfCoverage: {
        status: "partial" as const,
        pages: [{ page: 1, status: "unextracted" as const }]
      },
      passages: []
    };
    const storedDerivative = await derivativeStore.put(
      Buffer.from(JSON.stringify(unextractedArtifact), "utf8")
    );

    await ledger.append({
      type: "ingestion.parse.completed",
      version: 1,
      streamId: "ingestion_parse_parse_scan_001",
      context: ctx("corr_scan_parse"),
      payload: {
        parseJobId: "parse_scan_001",
        sourceCollectionId: "src_orange",
        importBatchId: "imp_scan",
        evidenceId: "ev_scan_001",
        lane: "local",
        parser: { ...localExtractorIdentity },
        outputHash: storedDerivative.contentHash,
        outputMediaType: extractionMediaType,
        coverageStatus: "partial",
        completedAt: "2026-11-28T00:02:00.000Z"
      }
    } as AppendableKnowledgeEvent<"ingestion.parse.completed">);

    const transport = new InMemoryHelixGraphTransport();
    await rebuildHelixFromLedger({
      transport,
      databaseName: "ws_scan",
      events: await ledger.readAll(),
      blobStore,
      derivativeStore
    });

    const dto = await readOntologyWorkspaceFromHelix({
      transport,
      databaseName: "ws_scan",
      ledger
    });
    expect(dto.documents).toHaveLength(1);
    expect(dto.documents?.[0]).toMatchObject({
      evidenceId: "ev_scan_001",
      contentHash: storedBlob.contentHash,
      extractionStatus: "unextracted",
      unextracted: true,
      passageCount: 0,
      passages: []
    });
  });

  it("hides tombstoned evidence on rebuild and fails closed when Helix is down or stale", async () => {
    const ledger = new InMemoryEventLedger();
    const { blobStore } = makeStores();
    const storedBlob = await blobStore.put(Buffer.from("sensitive record", "utf8"));

    await ledger.append({
      type: "evidence.ingested",
      version: 1,
      streamId: "evidence_ev_hidden_001",
      context: ctx("corr_hidden"),
      payload: {
        evidenceId: "ev_hidden_001",
        source: { kind: "file", label: "hidden.txt", uri: "file:///synthetic/hidden.txt" },
        contentHash: storedBlob.contentHash,
        mediaType: "text/plain",
        sizeBytes: storedBlob.sizeBytes
      }
    } as AppendableKnowledgeEvent<"evidence.ingested">);

    const transport = new InMemoryHelixGraphTransport();
    await syncLedgerToHelix({
      transport,
      databaseName: "ws_gov",
      events: await ledger.readAll(),
      blobStore
    });

    // Stopping Helix fails closed with HelixUnavailableError.
    transport.setHealthy(false);
    await expect(
      readOntologyWorkspaceFromHelix({ transport, databaseName: "ws_gov", ledger })
    ).rejects.toThrow(HelixUnavailableError);
    transport.setHealthy(true);

    // Appending a tombstone without updating Helix triggers HelixProjectionLagError.
    await ledger.append({
      type: "evidence.tombstoned",
      version: 1,
      streamId: "governance_ev_hidden_001",
      context: ctx("corr_tombstone"),
      payload: {
        evidenceId: "ev_hidden_001",
        tombstoneId: "tombstone_001",
        reason: "Tombstoned in test",
        tombstonedBy: actor.id
      }
    } as AppendableKnowledgeEvent<"evidence.tombstoned">);

    await expect(
      readOntologyWorkspaceFromHelix({ transport, databaseName: "ws_gov", ledger })
    ).rejects.toThrow(HelixProjectionLagError);

    // Rebuilding hides the tombstoned evidence completely.
    const rebuilt = await rebuildHelixFromLedger({
      transport,
      databaseName: "ws_gov",
      events: await ledger.readAll(),
      blobStore
    });
    expect(rebuilt.hiddenEvidenceIds).toEqual(["ev_hidden_001"]);
    expect(rebuilt.documents).toEqual([]);

    const afterRebuild = await readOntologyWorkspaceFromHelix({
      transport,
      databaseName: "ws_gov",
      ledger
    });
    expect(afterRebuild.documents).toEqual([]);
  });

  it("syncs a second import into an existing source and a source label correction incrementally with deterministic rebuild", async () => {
    const ledger = new InMemoryEventLedger();
    const { blobStore } = makeStores();
    const blobFirst = await blobStore.put(Buffer.from("Osceola batch 1 document.\n", "utf8"));
    const blobSecond = await blobStore.put(Buffer.from("Osceola batch 2 document.\n", "utf8"));

    const registered = await ledger.append({
      type: "ingestion.source.registered",
      version: 1,
      streamId: "ingestion_source_src_osceola_county",
      context: ctx("corr_osceola_reg"),
      payload: {
        sourceCollectionId: "src_osceola_county",
        label: "Osceola County",
        mode: "read-only",
        adapter: { name: "local-filesystem", version: "0.1.0" },
        rootUri: "file:///synthetic/osceola",
        workspaceUri: "file:///synthetic/workspace"
      }
    } as AppendableKnowledgeEvent<"ingestion.source.registered">);

    // Deliberately ingest a lexicographically higher evidenceId first (ev_doc_zzz)
    // and a lower evidenceId second (ev_doc_aaa) to reproduce the sort-order bug.
    await ledger.append({
      type: "evidence.ingested",
      version: 1,
      streamId: "evidence_ev_doc_zzz",
      context: ctx("corr_ev_zzz"),
      payload: {
        evidenceId: "ev_doc_zzz",
        source: { kind: "dataset", label: "Public ingestion import src_osceola_county/imp_001" },
        contentHash: blobFirst.contentHash,
        mediaType: "text/plain",
        sizeBytes: blobFirst.sizeBytes
      }
    } as AppendableKnowledgeEvent<"evidence.ingested">);
    await ledger.append({
      type: "ingestion.evidence.linked",
      version: 1,
      streamId: "ingestion_evidence_link_src_osceola_county_scan_001_imp_001",
      context: ctx("corr_link_1"),
      payload: {
        sourceCollectionId: "src_osceola_county",
        importBatchId: "imp_001",
        evidenceId: "ev_doc_zzz",
        contentHash: blobFirst.contentHash,
        occurrenceIds: ["occ_001"]
      }
    } as AppendableKnowledgeEvent<"ingestion.evidence.linked">);

    const transport = new InMemoryHelixGraphTransport();
    const sync1 = await syncLedgerToHelix({
      transport,
      databaseName: "ws_osceola",
      events: await ledger.readAll(),
      blobStore
    });
    expect(sync1.documents).toHaveLength(1);
    expect(sync1.documents[0]?.agencyName).toBe("Osceola County");

    // Second import into the same registered source with an alphabetically earlier evidenceId.
    await ledger.append({
      type: "evidence.ingested",
      version: 1,
      streamId: "evidence_ev_doc_aaa",
      context: ctx("corr_ev_aaa"),
      payload: {
        evidenceId: "ev_doc_aaa",
        source: { kind: "dataset", label: "Public ingestion import src_osceola_county/imp_002" },
        contentHash: blobSecond.contentHash,
        mediaType: "text/plain",
        sizeBytes: blobSecond.sizeBytes
      }
    } as AppendableKnowledgeEvent<"evidence.ingested">);
    await ledger.append({
      type: "ingestion.evidence.linked",
      version: 1,
      streamId: "ingestion_evidence_link_src_osceola_county_scan_002_imp_002",
      context: ctx("corr_link_2"),
      payload: {
        sourceCollectionId: "src_osceola_county",
        importBatchId: "imp_002",
        evidenceId: "ev_doc_aaa",
        contentHash: blobSecond.contentHash,
        occurrenceIds: ["occ_002"]
      }
    } as AppendableKnowledgeEvent<"ingestion.evidence.linked">);

    const sync2 = await syncLedgerToHelix({
      transport,
      databaseName: "ws_osceola",
      events: await ledger.readAll(),
      blobStore
    });
    expect(sync2.documents).toHaveLength(2);
    expect(sync2.nodesSuperseded).toBe(0);

    const dtoAfterSecondImport = await readOntologyWorkspaceFromHelix({
      transport,
      databaseName: "ws_osceola",
      ledger
    });
    expect(dtoAfterSecondImport.status).toBe("ready");
    expect(dtoAfterSecondImport.documents?.map((d) => d.evidenceId)).toEqual(["ev_doc_aaa", "ev_doc_zzz"]);
    expect(dtoAfterSecondImport.documents?.every((d) => d.agencyName === "Osceola County")).toBe(true);

    // Append a source label correction without modifying earlier ledger events.
    const labelUpdated = await ledger.append({
      type: "ingestion.source.label.updated",
      version: 1,
      streamId: "ingestion_source_src_osceola_county",
      context: {
        ...ctx("corr_osceola_label_update"),
        causationId: registered.id
      },
      payload: {
        sourceCollectionId: "src_osceola_county",
        label: "Osceola County Sheriff's Office",
        previousLabel: "Osceola County",
        rationale: "Use official agency name",
        actor
      }
    } as AppendableKnowledgeEvent<"ingestion.source.label.updated">, { expectedNextSequence: 2 });

    const sync3 = await syncLedgerToHelix({
      transport,
      databaseName: "ws_osceola",
      events: await ledger.readAll(),
      blobStore
    });
    expect(sync3.nodesSuperseded).toBe(1);

    const writer = createCestusHelixWriter(transport, "ws_osceola");
    const agencyNode = await writer.findNodeByStableKey("Agency", "agency:src_osceola_county");
    expect(agencyNode?.properties.name).toBe("Osceola County Sheriff's Office");
    expect(agencyNode?.properties.authorityId).toBe(labelUpdated.id);
    expect(agencyNode?.properties.previousName).toBe("Osceola County");
    expect(agencyNode?.properties.labelRevision).toBe(2);

    // Document keeps ingest-time sourceLabel snapshot; read DTO resolves agencyName via Agency node.
    const docNode = await writer.findNodeByStableKey("Document", "doc:ev_doc_zzz");
    expect(docNode?.properties.sourceLabel).toBe("Public ingestion import src_osceola_county/imp_001");
    expect(await writer.findEdgesByLabel("PRODUCED")).toHaveLength(2);

    const dtoAfterLabelUpdate = await readOntologyWorkspaceFromHelix({
      transport,
      databaseName: "ws_osceola",
      ledger
    });
    expect(dtoAfterLabelUpdate.status).toBe("ready");
    expect(dtoAfterLabelUpdate.documents?.every((d) => d.agencyName === "Osceola County Sheriff's Office")).toBe(true);

    // Genuine conflicting overwrite on the Agency node is still refused.
    await expect(
      writer.appendNode({
        label: "Agency",
        stableKey: "agency:src_osceola_county",
        provenance: {
          sourceId: "src_osceola_county",
          contentHash: sha256ContentHash("forged-agency-update"),
          authorityId: "evt_forged_overwrite"
        },
        properties: { role: "producer", sourceCollectionId: "src_osceola_county", name: "Forged Agency" }
      })
    ).rejects.toThrow(HelixAppendOnlyError);

    // Rebuilding twice is deterministic and preserves the corrected Agency name.
    const allEvents = await ledger.readAll();
    const rebuild1 = await rebuildHelixFromLedger({
      transport,
      databaseName: "ws_osceola",
      events: allEvents,
      blobStore
    });
    const rebuild2 = await rebuildHelixFromLedger({
      transport,
      databaseName: "ws_osceola",
      events: allEvents,
      blobStore
    });
    expect(rebuild2.fingerprint).toEqual(rebuild1.fingerprint);
    expect(rebuild2.documents).toEqual(rebuild1.documents);
    expect((await writer.findNodeByStableKey("Agency", "agency:src_osceola_county"))?.properties.name).toBe(
      "Osceola County Sheriff's Office"
    );
  });
});
