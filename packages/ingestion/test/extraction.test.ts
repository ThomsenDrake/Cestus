import { describe, expect, it } from "vitest";
import { extractDocument, ExtractionFailure } from "../src/extraction.js";
import { syntheticPdf } from "./fixtures/synthetic-pdf.js";
const base = { evidenceId: "ev_test", extractionId: "parse_test", sourceContentHash: `sha256:${"a".repeat(64)}` };
describe("bounded actual local extraction", () => {
  it("keeps stable text spans and CSV cell coordinates", async () => {
    const text = await extractDocument({ ...base, mediaType: "text/plain", content: Buffer.from("first\n\nThe hidden phrase is here.") });
    expect(text.passages[1]).toEqual({ locator: { kind: "text", block: 2, start: 7, end: 33 }, text: "The hidden phrase is here." });
    const csv = await extractDocument({ ...base, mediaType: "text/csv", content: Buffer.from('name,note\r\nA,"quoted, cell"\r\nB,"two\nlines"') });
    expect(csv.passages).toContainEqual({ locator: { kind: "csv", row: 2, column: 2 }, text: "quoted, cell" });
    expect(csv.passages).toContainEqual({ locator: { kind: "csv", row: 3, column: 2 }, text: "two\nlines" });
  });
  it("extracts real PDF bytes with page locators", async () => {
    const result = await extractDocument({ ...base, mediaType: "application/pdf", content: syntheticPdf(["Page one", "Needle behind the harbor"]) });
    expect(result.passages).toContainEqual(expect.objectContaining({ locator: expect.objectContaining({ kind: "pdf", page: 2 }), text: "Needle behind the harbor" }));
    expect(result.extractor.engine).toBe("poppler-pdftotext");
  });
  it.each(["blank", "image-only"] as const)("keeps readable PDF pages when another page is %s without claiming the gap is blank", async (kind) => {
    const content = syntheticPdf(["First page evidence", kind === "blank" ? "" : { imageOnly: true }, "Third page evidence"]);
    const result = await extractDocument({ ...base, mediaType: "application/pdf", content });
    expect(result.pdfCoverage).toEqual({ status: "partial", pages: [{ page: 1, status: "text-extracted" }, { page: 2, status: "unextracted" }, { page: 3, status: "text-extracted" }] });
    expect(result.passages.map((passage) => passage.locator)).toEqual([
      expect.objectContaining({ kind: "pdf", page: 1 }), expect.objectContaining({ kind: "pdf", page: 3 })
    ]);
    expect(result.text).toContain("Third page evidence");
  });
  it("persists an explicit coverage gap when no PDF page has readable text", async () => {
    const result = await extractDocument({ ...base, mediaType: "application/pdf", content: syntheticPdf([{ imageOnly: true }]) });
    expect(result.pdfCoverage).toEqual({ status: "partial", pages: [{ page: 1, status: "unextracted" }] });
    expect(result.passages).toEqual([]);
    expect(result.text).toBe("");
  });
  it("fails closed on invalid UTF8, incomplete CSV, corrupt PDFs and unsupported formats", async () => {
    for (const [mediaType, content] of [["text/plain", Buffer.from([0xff])], ["text/csv", Buffer.from('a,"unclosed')], ["application/pdf", Buffer.from("%PDF-1.4 broken")], ["application/octet-stream", Buffer.from("binary")]] as const) {
      await expect(extractDocument({ ...base, mediaType, content })).rejects.toBeInstanceOf(ExtractionFailure);
    }
  });
});
