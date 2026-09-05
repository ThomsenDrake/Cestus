import type { PdfCoverage } from "../../../ontology/src/extraction-contracts.js";

export type PdfCoverageDisplay = PdfCoverage | { status: "unknown" };

/** Coverage concerns embedded text, never completeness of visual evidence. */
export function PdfCoverageNotice({ coverage }: { coverage: PdfCoverageDisplay }) {
  if (coverage.status === "unknown") return <span className="block text-sm">PDF page coverage is unknown for this extraction. Inspect the original for omitted evidence.</span>;
  const gaps = coverage.pages.filter(page => page.status === "unextracted").map(page => page.page);
  return <span className="block space-y-1 text-sm">
    <strong className="block">{coverage.status === "partial"
      ? `Partial PDF text extraction: text from ${coverage.pages.length - gaps.length} of ${coverage.pages.length} pages.`
      : `PDF text extracted from ${coverage.pages.length} of ${coverage.pages.length} pages.`}</strong>
    {gaps.length > 0 && <>
      <span className="block">Pages without extracted text: {gaps.join(", ")}.</span>
      <span className="block">The extractor cannot establish whether these pages are blank or contain unreadable evidence. Inspect the original.</span>
    </>}
    <span className="block">Images and other visual content are not covered, including on pages with text. No OCR was run.</span>
  </span>;
}
