import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createFakeMountedWorkspace } from "../../ingestion/test/runtime-test-helpers.js";
import { createIngestionRuntime } from "../../ingestion/src/runtime.js";
import { syntheticPdf } from "../../ingestion/test/fixtures/synthetic-pdf.js";
import { GovernanceService } from "../../ontology/src/governance-service.js";
import { readEvidenceContent, searchEvidence, resolveExternalDocumentSelection } from "../src/evidence-content.js";
const actor = { id: "actor_search", kind: "human" as const, label: "Synthetic search operator" };
const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })); });
async function prepared() {
  const workspace = createFakeMountedWorkspace(); roots.push(workspace.rootDir);
  const sourceRoot = join(workspace.rootDir, "records"); mkdirSync(sourceRoot);
  writeFileSync(join(sourceRoot, "a.pdf"), syntheticPdf(["First page", { imageOnly: true }, "The marigold passage establishes a connection."]));
  writeFileSync(join(sourceRoot, "b.txt"), "The marigold passage appears in a second document.");
  const runtime = createIngestionRuntime({ mountedWorkspace: workspace, actor });
  await runtime.registerSource({ sourceCollectionId: "src_search", label: "Synthetic", rootUri: `file://${sourceRoot}`, sourceRoot });
  const batch = { sourceCollectionId: "src_search", scanBatchId: "scan_search", importBatchId: "imp_search" };
  await runtime.dryRunScan(batch); await runtime.approveRawImport({ ...batch, approvedBy: actor.id }); await runtime.importApproved(batch); await runtime.runParseJobs({});
  return workspace;
}
const query = { q: "marigold passage", limit: 20, offset: 0 };
it("uses two request-scoped ledger reads, preserves PDF page coverage and binds it to the transfer selection", async () => {
  const workspace = await prepared();
  const reads = vi.spyOn(workspace.ledger, "readAll");
  const found = await searchEvidence(workspace, actor, query);
  expect(reads).toHaveBeenCalledTimes(2);
  expect(found.total).toBe(2);
  const pdf = found.results.find(result => result.pdfCoverage)!;
  expect(pdf).toMatchObject({ locator: { kind: "pdf", page: 3 }, pdfCoverage: { status: "partial", pages: [{ page: 1, status: "text-extracted" }, { page: 2, status: "unextracted" }, { page: 3, status: "text-extracted" }] } });
  const content = await readEvidenceContent(workspace, actor, pdf.evidenceId, pdf.extractionId);
  expect(content.extraction?.passages[pdf.passageIndex]?.text).toContain(query.q);
  const governance = new GovernanceService({ ledger: workspace.ledger, actor });
  const policy = { policyId: "gov_policy_default", version: "0.1.0" };
  await governance.classifyEvidence({ evidenceId: pdf.evidenceId, policy, classifier: { actorId: actor.id, kind: "human", label: actor.label }, tags: [{ tag: "public_safe", rationale: "Reviewed synthetic fixture", confidence: 1 }] });
  await governance.reviewEvidenceGovernance({ evidenceId: pdf.evidenceId, policy, reviewedBy: actor.id, decisions: [{ tag: "public_safe", action: "affirm", rationale: "Reviewed synthetic fixture" }] });
  const selection = await resolveExternalDocumentSelection(workspace, actor, { evidenceId: pdf.evidenceId, extractionId: pdf.extractionId, passageIndexes: [pdf.passageIndex] });
  expect(selection.pdfCoverage).toEqual(pdf.pdfCoverage);
});
it("excludes a document revoked during storage reads from both snippets and counts", async () => {
  const workspace = await prepared();
  const initial = await searchEvidence(workspace, actor, query);
  const target = initial.results[0]!.evidenceId;
  const originalGet = workspace.derivativeStore.get.bind(workspace.derivativeStore);
  let revoked = false;
  vi.spyOn(workspace.derivativeStore, "get").mockImplementation(async contentHash => {
    const bytes = await originalGet(contentHash);
    if (!revoked) {
      revoked = true;
      await new GovernanceService({ ledger: workspace.ledger, actor }).quarantineEvidence({ evidenceId: target, quarantineId: "quarantine_during_search", quarantinedBy: actor.id, reason: "Synthetic concurrent revocation", lockLevel: "all" });
    }
    return bytes;
  });
  const found = await searchEvidence(workspace, actor, query);
  expect(found.total).toBe(1);
  expect(found.results.some(result => result.evidenceId === target)).toBe(false);
});
it("does not reuse previous snippets when an original or derivative becomes unreadable", async () => {
  const workspace = await prepared();
  expect((await searchEvidence(workspace, actor, query)).total).toBe(2);
  const originals = vi.spyOn(workspace.blobStore, "get").mockRejectedValue(new Error("Hash mismatch"));
  expect((await searchEvidence(workspace, actor, query)).total).toBe(0);
  originals.mockRestore();
  vi.spyOn(workspace.derivativeStore, "get").mockRejectedValue(new Error("Missing derivative"));
  expect((await searchEvidence(workspace, actor, query)).results).toEqual([]);
});
