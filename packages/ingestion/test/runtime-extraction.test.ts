import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createIngestionRuntime } from "../src/runtime.js";
import { buildIngestionProjection } from "../src/projection.js";
import { LocalParseService } from "../src/parser.js";
import { extractionArtifactSchema } from "../../ontology/src/extraction-contracts.js";
import { createFakeMountedWorkspace } from "./runtime-test-helpers.js";
const actor = { id: "actor_extraction_test", kind: "human" as const, label: "Extraction test" };
const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { force: true, recursive: true })));
async function prepared() {
  const workspace = createFakeMountedWorkspace(); roots.push(workspace.rootDir);
  const sourceRoot = join(workspace.rootDir, "source"); mkdirSync(sourceRoot);
  writeFileSync(join(sourceRoot, "a.txt"), "A hidden phrase beyond filenames.");
  writeFileSync(join(sourceRoot, "copy.txt"), "A hidden phrase beyond filenames.");
  const runtime = createIngestionRuntime({ mountedWorkspace: workspace, actor });
  await runtime.registerSource({ sourceCollectionId: "src_test", label: "Synthetic", rootUri: `file://${sourceRoot}`, sourceRoot });
  await importVersion(runtime, "one");
  return { workspace, runtime, sourceRoot };
}
async function importVersion(runtime: ReturnType<typeof createIngestionRuntime>, version: string) {
  const command = { sourceCollectionId: "src_test", scanBatchId: `scan_${version}`, importBatchId: `imp_${version}` };
  expect(await runtime.dryRunScan({ sourceCollectionId: command.sourceCollectionId, scanBatchId: command.scanBatchId })).toMatchObject({ ok: true });
  expect(await runtime.approveRawImport({ ...command, approvedBy: actor.id })).toMatchObject({ ok: true });
  expect(await runtime.importApproved(command)).toMatchObject({ ok: true });
}
describe("queued local extraction through ingestion runtime", () => {
  it("deduplicates originals, persists extraction and review, preserves old citations after change", async () => {
    const { workspace, runtime, sourceRoot } = await prepared();
    expect(await runtime.runParseJobs({ sourceCollectionId: "src_test" })).toMatchObject({ ok: true });
    let projection = buildIngestionProjection(await workspace.ledger.readAll());
    expect(projection.evidenceById.size).toBe(1);
    expect(projection.occurrencesById.size).toBe(2);
    const oldJob = [...projection.parseJobs.values()][0]!;
    const oldBytes = await workspace.derivativeStore.get(oldJob.outputHash as `sha256:${string}`);
    const artifact = extractionArtifactSchema.parse(JSON.parse(oldBytes.toString()));
    expect(artifact.passages[0]?.text).toContain("hidden phrase");
    const reopened = createIngestionRuntime({ mountedWorkspace: workspace, actor });
    expect(await reopened.readReview({ sourceCollectionId: "src_test" })).toMatchObject({ ok: true, review: { importCompleted: true, approvedImportBatchId: "imp_one" } });
    const before = await workspace.ledger.readAll();
    await Promise.all([runtime.runParseJobs({}), reopened.runParseJobs({})]);
    expect(await workspace.ledger.readAll()).toEqual(before);
    writeFileSync(join(sourceRoot, "a.txt"), "Changed source text.");
    await importVersion(reopened, "two"); await reopened.runParseJobs({});
    projection = buildIngestionProjection(await workspace.ledger.readAll());
    expect(projection.evidenceById.size).toBe(2);
    expect(await workspace.derivativeStore.get(oldJob.outputHash as `sha256:${string}`)).toEqual(oldBytes);
  });
  it("keeps interrupted jobs failed until explicit retry, then creates exactly one result", async () => {
    const { workspace, runtime } = await prepared();
    const job = [...buildIngestionProjection(await workspace.ledger.readAll()).parseJobs.values()][0]!;
    const parser = new LocalParseService({ ledger: workspace.ledger, derivativeStore: workspace.derivativeStore, actor });
    await parser.startParseJob({ parseJobId: job.parseJobId, evidenceId: job.evidenceId, importBatchId: job.importBatchId, sourceCollectionId: job.sourceCollectionId, parser: job.parser });
    const recovered = await runtime.runParseJobs({});
    expect(recovered).toMatchObject({ ok: true, jobs: expect.arrayContaining([expect.objectContaining({ jobId: job.parseJobId, state: "failed", retryable: true, message: expect.stringContaining("interrupted") })]) });
    await runtime.runParseJobs({});
    expect((await workspace.ledger.readAll()).filter((event) => event.type === "ingestion.parse.completed")).toHaveLength(0);
    expect(await runtime.retryJob({ jobId: job.parseJobId })).toMatchObject({ ok: true, job: { state: "succeeded", retryable: false } });
    expect((await workspace.ledger.readAll()).filter((event) => event.type === "ingestion.parse.completed")).toHaveLength(1);
  });
  it("reports corrupt originals without a derivative and denies derivative-write-limited mounts", async () => {
    const { workspace, runtime } = await prepared();
    const item = [...buildIngestionProjection(await workspace.ledger.readAll()).evidenceById.values()][0]!;
    const stored = await workspace.blobStore.put(Buffer.from("A hidden phrase beyond filenames."));
    writeFileSync(stored.path, "corruption");
    expect(await runtime.runParseJobs({})).toMatchObject({ ok: true, jobs: expect.arrayContaining([expect.objectContaining({ evidenceId: item.evidenceId, state: "failed", retryable: true, message: expect.stringContaining("content hash") })]) });
    expect((await workspace.ledger.readAll()).some((event) => event.type === "ingestion.parse.completed")).toBe(false);
    const blocked = createIngestionRuntime({ mountedWorkspace: { ...workspace, capabilities: { ...workspace.capabilities, canWriteDerivatives: false } }, actor });
    expect(await blocked.runParseJobs({})).toMatchObject({ ok: false, error: { code: "INGESTION_WORKSPACE_NOT_WRITABLE" } });
  });
});
