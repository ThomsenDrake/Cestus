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

  it("allows a retryable failed local parse job to later complete on the same deterministic job stream", async () => {
    const ledger = new InMemoryEventLedger();
    const derivatives = new FileBlobStore(dir);
    const parser = new LocalParseService({
      ledger,
      derivativeStore: derivatives,
      actor
    });
    const input = {
      parseJobId: "parse_003",
      sourceCollectionId: "src_drive_001",
      importBatchId: "imp_001",
      evidenceId: "ev_ing_003",
      parser: parserRef
    };

    const created = await parser.createLocalParseJob(input);
    const failed = await parser.failParseJob({
      ...input,
      retryable: true,
      message: "temporary extraction tool failure"
    });
    const completed = await parser.completeTextParse({
      ...input,
      text: "retried text"
    });

    expect(completed.context.causationId).toBe(failed.id);
    expect(completed.sequence).toBe(3);
    expect(completed.payload.outputHash).toMatch(/^sha256:/);
    await expect(derivatives.get(completed.payload.outputHash as `sha256:${string}`)).resolves.toEqual(
      Buffer.from("retried text")
    );

    const events = await ledger.readAll();
    const projection = buildIngestionProjection(events);
    expect(events.map((event) => event.type)).toEqual([
      "ingestion.parse.job.created",
      "ingestion.parse.failed",
      "ingestion.parse.completed"
    ]);
    expect(created.sequence).toBe(1);
    expect(failed.sequence).toBe(2);
    expect(events.every((event) => validateKnowledgeEvent(event).success)).toBe(true);
    expect(projection.parseJobs.get("parse_003")).toMatchObject({
      parseJobId: "parse_003",
      state: "succeeded",
      outputHash: completed.payload.outputHash,
      outputMediaType: "text/plain"
    });
  });

  it("keeps completeTextParse idempotent after a local parse already completed", async () => {
    const ledger = new InMemoryEventLedger();
    const parser = new LocalParseService({
      ledger,
      derivativeStore: new FileBlobStore(dir),
      actor
    });
    const input = {
      parseJobId: "parse_004",
      sourceCollectionId: "src_drive_001",
      importBatchId: "imp_001",
      evidenceId: "ev_ing_004",
      parser: parserRef
    };

    await parser.createLocalParseJob(input);
    const firstCompleted = await parser.completeTextParse({
      ...input,
      text: "first extracted text"
    });
    const retryCompleted = await parser.completeTextParse({
      ...input,
      text: "different text should not create another completion"
    });

    const events = await ledger.readAll();
    expect(retryCompleted).toEqual(firstCompleted);
    expect(events.filter((event) => event.type === "ingestion.parse.completed")).toHaveLength(1);
    expect(events).toHaveLength(2);
  });

  it("does not allow a non-retryable local parse failure to later complete", async () => {
    const ledger = new InMemoryEventLedger();
    const parser = new LocalParseService({
      ledger,
      derivativeStore: new FileBlobStore(dir),
      actor
    });
    const input = {
      parseJobId: "parse_005",
      sourceCollectionId: "src_drive_001",
      importBatchId: "imp_001",
      evidenceId: "ev_ing_005",
      parser: parserRef
    };

    await parser.createLocalParseJob(input);
    await parser.failParseJob({
      ...input,
      retryable: false,
      message: "unsupported file type"
    });

    await expect(
      parser.completeTextParse({
        ...input,
        text: "should not be written"
      })
    ).rejects.toThrow(/non-retryable/i);

    const events = await ledger.readAll();
    expect(events.map((event) => event.type)).toEqual([
      "ingestion.parse.job.created",
      "ingestion.parse.failed"
    ]);
  });
});
