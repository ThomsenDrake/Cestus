import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileBlobStore } from "../../ontology/src/blob-store.js";
import { validateKnowledgeEvent } from "../../ontology/src/contracts.js";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { buildIngestionProjection } from "../src/projection.js";
import { LocalParseService } from "../src/parser.js";

let dir: string;

const actor = { id: "actor_system", kind: "system" as const, label: "Local parser" };
const parserRef = { name: "local-text", version: "0.1.0" };

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cestus-parser-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("LocalParseService", () => {
  it("creates and completes a local parse job with derivative output hash", async () => {
    const ledger = new InMemoryEventLedger();
    const derivatives = new FileBlobStore(dir);
    const parser = new LocalParseService({
      ledger,
      derivativeStore: derivatives,
      actor
    });

    const created = await parser.createLocalParseJob({
      parseJobId: "parse_001",
      sourceCollectionId: "src_drive_001",
      importBatchId: "imp_001",
      evidenceId: "ev_ing_001",
      parser: parserRef
    });
    const completed = await parser.completeTextParse({
      parseJobId: "parse_001",
      sourceCollectionId: "src_drive_001",
      importBatchId: "imp_001",
      evidenceId: "ev_ing_001",
      text: "extracted text",
      parser: parserRef
    });

    expect(created.type).toBe("ingestion.parse.job.created");
    expect(created.payload).toMatchObject({
      lane: "local",
      state: "queued"
    });
    expect(completed.type).toBe("ingestion.parse.completed");
    expect(completed.context.causationId).toBe(created.id);
    expect(completed.payload.outputHash).toMatch(/^sha256:/);
    expect(completed.payload.outputMediaType).toBe("text/plain");
    await expect(derivatives.get(completed.payload.outputHash as `sha256:${string}`)).resolves.toEqual(
      Buffer.from("extracted text")
    );

    const events = await ledger.readAll();
    const projection = buildIngestionProjection(events);
    expect(events.every((event) => validateKnowledgeEvent(event).success)).toBe(true);
    expect(projection.parseJobs.get("parse_001")).toMatchObject({
      parseJobId: "parse_001",
      state: "succeeded",
      outputHash: completed.payload.outputHash,
      outputMediaType: "text/plain"
    });
  });

  it("records local parse failures with a secret-safe message", async () => {
    const ledger = new InMemoryEventLedger();
    const parser = new LocalParseService({
      ledger,
      derivativeStore: new FileBlobStore(dir),
      actor
    });

    const created = await parser.createLocalParseJob({
      parseJobId: "parse_002",
      sourceCollectionId: "src_drive_001",
      importBatchId: "imp_001",
      evidenceId: "ev_ing_002",
      parser: parserRef
    });
    const failed = await parser.failParseJob({
      parseJobId: "parse_002",
      sourceCollectionId: "src_drive_001",
      importBatchId: "imp_001",
      evidenceId: "ev_ing_002",
      parser: parserRef,
      retryable: true,
      message: "Provider error: token=secret-123 password=hunter2 stack=/tmp/raw"
    });

    expect(failed.type).toBe("ingestion.parse.failed");
    expect(failed.context.causationId).toBe(created.id);
    expect(failed.payload).toMatchObject({
      lane: "local",
      retryable: true
    });
    expect(failed.payload.message).toBe("Local parse failed; details were redacted.");
    expect(failed.payload.message).not.toMatch(/secret-123|hunter2|token|password|Provider error/i);
    expect((await ledger.readAll()).every((event) => validateKnowledgeEvent(event).success)).toBe(true);
  });
});
