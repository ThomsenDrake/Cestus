import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractionArtifactSchema, localExtractorIdentity, type ExtractionArtifact } from "../../ontology/src/extraction-contracts.js";

export const extractionFailureMessages = {
  unsupported: "This format is not supported by the local extractor. Use UTF-8 text, CSV, or a text-bearing PDF.",
  invalidText: "Text is not valid UTF-8 or contains binary control characters. Convert a copy to UTF-8 and import it as a new source version.",
  invalidCsv: "CSV is incomplete or malformed. Repair a copy and import it as a new source version.",
  invalidPdf: "PDF is corrupt, incomplete, or encrypted. Import a complete, readable copy as a new source version.",
  scan: "This PDF has a page without extractable text. Scanned-page OCR is not supported; no complete extraction was produced.",
  limit: "Document exceeds local extraction limits (32 MiB input, 8 MiB text, 500 PDF pages, 100000 passages).",
  unavailable: "Local PDF tools are unavailable. Install Poppler pdfinfo and pdftotext, then retry.",
  interrupted: "Local extraction was interrupted. Retry explicitly; the original remains preserved.",
  timeout: "Local extraction exceeded its time limit. Retry explicitly after checking the document.",
  policy: "Current evidence governance blocks local processing. Resolve the governance restriction before retrying.",
  storage: "Original bytes are unavailable or fail their stored content hash. Restore canonical storage before retrying."
} as const;
export class ExtractionFailure extends Error {
  constructor(readonly code: keyof typeof extractionFailureMessages, readonly retryable = false) { super(extractionFailureMessages[code]); }
}
const maxOutput = 8_000_000;
export async function extractDocument(input: { evidenceId: string; extractionId: string; sourceContentHash: string; content: Buffer; mediaType: string }): Promise<ExtractionArtifact> {
  if (input.content.length > 32 * 1024 * 1024) throw new ExtractionFailure("limit");
  let format: ExtractionArtifact["format"];
  let passages: ExtractionArtifact["passages"];
  let extractor: ExtractionArtifact["extractor"] = { ...localExtractorIdentity };
  if (input.mediaType === "application/pdf") {
    format = "pdf";
    const result = await extractPdf(input.content);
    passages = result.passages;
    extractor = { ...extractor, engine: "poppler-pdftotext", engineVersion: result.version };
  } else if (["text/plain", "text/csv", "application/csv"].includes(input.mediaType)) {
    const text = decodeText(input.content);
    format = input.mediaType === "text/plain" ? "text" : "csv";
    passages = format === "csv" ? csvPassages(text) : textPassages(text);
  } else throw new ExtractionFailure("unsupported");
  const text = passages.map((passage) => passage.text).join("\n\n");
  if (text.length > maxOutput || passages.length > 100_000) throw new ExtractionFailure("limit");
  return extractionArtifactSchema.parse({ schemaVersion: "evidence-extraction.v1", extractionId: input.extractionId, evidenceId: input.evidenceId, sourceContentHash: input.sourceContentHash, extractor, format, text, passages });
}
function decodeText(content: Buffer): string {
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(content); } catch { throw new ExtractionFailure("invalidText"); }
  if (/[\x00-\x08\x0b\x0e-\x1f]/.test(text)) throw new ExtractionFailure("invalidText");
  if (text.length > maxOutput) throw new ExtractionFailure("limit");
  return text;
}
function textPassages(text: string, page?: number): ExtractionArtifact["passages"] {
  const passages: ExtractionArtifact["passages"] = [];
  // Offsets refer to decoded original text (or that PDF page's extracted text), in UTF-16 code units.
  for (const match of text.matchAll(/[^\r\n]+(?:\r?\n(?!\r?\n)[^\r\n]+)*/g)) {
    if (!match[0].trim()) continue;
    const locator = { block: passages.length + 1, start: match.index, end: match.index + match[0].length };
    passages.push({ locator: page === undefined ? { kind: "text", ...locator } : { kind: "pdf", page, ...locator }, text: match[0] });
  }
  return passages;
}
function csvPassages(text: string): ExtractionArtifact["passages"] {
  const passages: ExtractionArtifact["passages"] = [];
  let row = 1, column = 1, value = "", quoted = false, closed = false;
  const push = () => { passages.push({ locator: { kind: "csv", row, column }, text: value }); value = ""; closed = false; if (passages.length > 100_000) throw new ExtractionFailure("limit"); };
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"') { if (text[i + 1] === '"') { value += '"'; i++; } else { quoted = false; closed = true; } } else value += char;
    } else if (char === '"') {
      if (value !== "" || closed) throw new ExtractionFailure("invalidCsv");
      quoted = true;
    } else if (char === ",") { push(); column++; }
    else if (char === "\r" || char === "\n") { push(); row++; column = 1; if (char === "\r" && text[i + 1] === "\n") i++; }
    else { if (closed) throw new ExtractionFailure("invalidCsv"); value += char; }
  }
  if (quoted) throw new ExtractionFailure("invalidCsv");
  if (value !== "" || closed || column > 1) push();
  return passages;
}
async function runTool(tool: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(tool, args, { timeout: 30_000, maxBuffer: maxOutput, encoding: "utf8", env: { PATH: process.env.PATH, LC_ALL: "C" } }, (error, stdout, stderr) => {
      if (error) {
        const code = (error as NodeJS.ErrnoException).code;
        reject(new ExtractionFailure(code === "ENOENT" ? "unavailable" : error.killed ? "timeout" : code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" ? "limit" : "invalidPdf", code === "ENOENT" || error.killed));
      } else resolve({ stdout, stderr });
    });
  });
}
async function extractPdf(content: Buffer): Promise<{ passages: ExtractionArtifact["passages"]; version: string }> {
  if (!content.subarray(0, 8).toString("ascii").startsWith("%PDF-") || !/%%EOF\s*$/.test(content.subarray(-2048).toString("latin1"))) throw new ExtractionFailure("invalidPdf");
  const directory = await mkdtemp(join(tmpdir(), "cestus-local-extraction-"));
  try {
    const path = join(directory, "original.pdf");
    await writeFile(path, content, { mode: 0o600, flag: "wx" });
    const info = await runTool("pdfinfo", [path]);
    const pageCount = Number(/^Pages:\s+(\d+)/m.exec(info.stdout)?.[1]);
    if (info.stderr.trim() || !Number.isInteger(pageCount) || pageCount < 1 || /^Encrypted:\s+yes/m.test(info.stdout)) throw new ExtractionFailure("invalidPdf");
    if (pageCount > 500) throw new ExtractionFailure("limit");
    const output = await runTool("pdftotext", ["-enc", "UTF-8", "-layout", path, "-"]);
    if (output.stderr.trim()) throw new ExtractionFailure("invalidPdf");
    const pages = output.stdout.split("\f");
    if (pages.at(-1)?.trim() === "") pages.pop();
    if (pages.length !== pageCount) throw new ExtractionFailure("invalidPdf");
    if (pages.some((page) => !page.trim())) throw new ExtractionFailure("scan");
    const versionResult = await runTool("pdftotext", ["-v"]);
    const version = /pdftotext version ([\w.-]+)/.exec(versionResult.stderr + versionResult.stdout)?.[1] ?? "unknown";
    return { passages: pages.flatMap((page, index) => textPassages(page, index + 1)), version };
  } finally { await rm(directory, { recursive: true, force: true }); }
}
