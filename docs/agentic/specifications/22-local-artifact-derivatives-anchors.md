# Local Artifact Derivatives And Canonical Anchors

Status: approved.

## Desired Behavior

Cestus produces deterministic local derivatives for admitted text, Markdown,
redacted `.env`, CSV/TSV, eligible JSON, DOCX, and XLSX evidence. It extracts
supported embedded raster images as immutable child artifacts and defines
provider-neutral blocks with canonical source anchors. It does not call OCR,
invoke the resident, accept ontology truth, execute active content, or process
audio/video.

Specifications 19 and 20 inventory every supported embedded OOXML raster and
bind its parent/part/digest/bytes into the exact selection and automatic OCR
authority. Selecting a DOCX/XLSX parent selects the complete child inventory;
children cannot be omitted or independently selected. Unsupported, malformed,
encrypted, animated, excessive, or uninventoryable child media makes the
parent unselectable. Children remain derivatives of parent evidence, not
independent top-level evidence.

Each derivative binds parent evidence ID/content hash, source media type,
parser/adapter identity/version, canonicalization-policy version, ordered block
sequence/hashes, anchor-map hash, child-artifact manifest hash, complete
derivative hash, and safe diagnostics. The same parent bytes and adapter
version produce byte-identical derivative/anchor serialization. A parser or
policy change creates a new immutable derivative and never rewrites a prior
one.

Normalization removes an initial UTF-8 BOM and converts CRLF/CR to LF. Every
other Unicode scalar, whitespace, punctuation, case distinction, and ordering
is preserved. Cestus performs no Unicode normalization, trimming, whitespace
collapse, spell correction, translation, or inferred completion. Every
normalized range maps to exact original source bytes or a structural locator.

Canonical blocks are semantic source units, not model-token chunks. Each has a
stable ordinal, kind, canonical text, source anchors, parent/child
relationships, and safe flags such as `untrusted-literal`,
`formula-without-cache`, or `review-required`. Blocks are capped at 64 KiB
canonical UTF-8. Oversized units split at deterministic structural, line, then
Unicode-scalar boundaries without losing source coverage. One derivative is
capped at 250,000 blocks/anchors and 128 MiB canonical text. Exact checked-in
limits also bound parser memory/CPU, nesting, relationships, rows, columns,
cells, strings, and output. Exceeding a cap fails closed without truncation or
fallback.

Specification 24 performs model-specific token packing. A resident/model
change creates a new invocation bundle, not new canonical blocks or anchors.

Every anchor contains anchor-contract version, parent evidence/derivative,
media-kind discriminator, exact structural locator, normalized derivative byte
range, original source byte range where available, deterministic ordinal, and
optional parent anchor. Ranges are zero-based and half-open. The contract fixes
one base convention for lines, rows, columns, pages, and tables. Unknown,
out-of-bounds, cross-evidence, or invalidly overlapping anchors are rejected.

Adapters provide:

- Plain text: original byte/scalar and line ranges with deterministic
  paragraph/section ordinals.
- Markdown: original byte/scalar/line ranges, AST node kind/path, heading
  ancestry, and section/paragraph/list/quote/code/table identities. Inline HTML
  and link targets are bounded untrusted literals and are never rendered or
  fetched.
- Redacted `.env`: derivative byte/line range, assignment-name identity, and
  comment/assignment discriminator. Fixed redaction tokens remain literal
  evidence; original values are never recovered.
- CSV/TSV: physical record, logical row, column, raw byte range, header plus
  duplicate-header occurrence, and quoted-newline/empty-cell distinctions.
- JSON: RFC 6901 pointer, source byte range, value type, and array/object
  ordinal. Property order is preserved; duplicate keys remain prohibited.
- DOCX: package part URI; body/header/footer/footnote/endnote/comment identity;
  paragraph/run, heading ancestry, table/row/cell, list, hyperlink display, and
  relationship locator.
- XLSX: workbook/sheet identity/ordinal, row, A1 cell, value type, table/range,
  and separately anchored formula text/stored cached value. Formulas are
  explicitly untrusted and never evaluated or recalculated. Missing cached
  values become `formula-without-cache` and review-required.
- Embedded raster: parent OOXML evidence/derivative, part URI, relationship ID,
  containing paragraph/cell anchor, media type, byte count, and digest.

Raw child-image bytes are installed as immutable content-addressed derivative
artifacts linked to the parent. They are not `evidence.ingested` records. Child
publication verifies the exact Specification 19 inventory and parent evidence
hash; any missing/changed child fails the complete parent derivative.

Parsers receive verified evidence bytes rather than source paths and have no
network or credential access. External relationships, hyperlinks, remote
templates, DTDs/entities, field codes, formulas, macros, scripts, and embedded
objects are never executed, fetched, dereferenced, or evaluated. Relationship
targets and formulas may appear only as bounded explicitly untrusted literals.
OOXML ZIP safety/content inventory is revalidated against the manifest.

An OOXML parent permits at most 1,000 raster children, 64 MiB compressed/member
bytes per child, and 512 MiB total raster child bytes. Every child also passes
Specification 19's standalone signature, dimension, pixel, frame, and metadata
limits. Selecting the parent authorizes extraction and later mandatory OCR of
all inventoried children; this specification performs no transfer.

For PDFs and standalone images, this specification produces only validated
parent identity envelopes. It performs no competing local text extraction.
Canonical OCR text/visual derivatives and page/bounding-box anchors belong to
Specification 23.

The anchor union reserves a versioned `derived-transcript` kind with parent
audio/video evidence hash, segment identity, half-open start/end milliseconds,
optional channel/speaker, transcript-engine identity, confidence, and text
hash. V1 validates synthetic envelopes only and does not admit, decode,
transcribe, transfer, or semantically process audio/video.

A derivative becomes visible only after complete parsing, cap enforcement,
anchor validation, child-manifest verification, canonical serialization, and
hash verification. Publication is conditional on current parent evidence/
provenance and exact adapter version. Identical replay is idempotent;
conflicting identity reuse fails closed. Artifact-local derivative failure does
not affect successful siblings. No partial publication or parser fallback
exists.

## Observable Acceptance Examples

- UTF-8 fixtures differing only by CRLF/CR normalize to LF with exact source
  maps. Other whitespace/Unicode remains unchanged; repeated parsing yields
  identical blocks, anchors, serialization, and hashes.
- Oversized blocks split at the specified boundaries with complete,
  non-overlapping source coverage. Block/anchor/text/resource cap overflow
  fails without partial output.
- Markdown headings/lists/code/tables, CSV duplicate headers/quoted newlines,
  JSON pointers, DOCX parts/tables, and XLSX formulas/cached values produce the
  exact locator kinds above.
- An XLSX formula is never executed. Its literal and cached value are distinct;
  a missing cache is explicitly review-required and receives no invented value.
- HTML, hyperlinks, remote relationships/templates, DTD/entities, macros,
  scripts, field codes, and embedded objects are never rendered, fetched, or
  executed.
- A DOCX/XLSX with supported embedded rasters produces exact child derivatives
  linked to part and containing anchor. Added/missing/mismatched/excessive child
  bytes fail the parent; no child becomes top-level evidence or triggers OCR in
  this slice.
- PDF/image fixtures produce identity envelopes without local extracted text.
- A synthetic transcript envelope validates time anchors while real audio/
  video input remains unsupported.
- Standard verification uses synthetic stored evidence and fake derivative
  storage. It does not read the SSD, use a credential, run a model/provider,
  bind a socket, send a PRR, publish, or change ontology truth.

## Allowed Scope

- `packages/ingestion/src/**` only for derivative envelopes, canonical blocks/
  anchors, local format adapters, parser isolation/caps, child-artifact
  extraction/storage, identity envelopes, and transcript-contract validation.
- `packages/ingestion/test/**` for deterministic format fixtures, source maps,
  anchors, canonical serialization, block splitting, malicious active content,
  caps, embedded children, idempotency, and transcript compatibility.
- `packages/ontology/src/contracts.ts` and focused tests only for immutable
  derivative/anchor/child references needed by existing evidence provenance;
  no assertion/ontology truth behavior.
- `packages/local-runtime/src/**` only for per-artifact local derivative queue
  wiring and safe read projection; no provider behavior.
- `packages/local-runtime/test/**` for parser isolation, stored-parent binding,
  child storage, artifact-local failure, and zero-external-effect tests.
- `package.json` and `package-lock.json` only for bounded non-executing document
  parser dependencies justified by this specification.
- `docs/agentic/specifications/19-descriptor-confined-source-scan.md` and
  `docs/agentic/specifications/20-exact-import-approval-evidence-admission.md`
  only for the approved embedded-raster inventory/authority amendment.
- Do not modify OCR/provider invocation, resident selection/prompting,
  model-specific packing, ontology candidates/truth, audio/video processing,
  secret redaction, source-boundary authority, UI, PRR, legal, export,
  publication, or destructive operations.

## Relevant Context Entry Points

- `AGENTS.md`
- `docs/agentic/software-factory.md`
- `.agents/skills/cestus-software-factory/SKILL.md`
- `docs/agentic/specifications/19-descriptor-confined-source-scan.md`
- `docs/agentic/specifications/20-exact-import-approval-evidence-admission.md`
- `docs/agentic/specifications/21-protected-import-scheduling-recovery.md`
- `packages/ontology/src/contracts.ts`
- `packages/ingestion/src/parser.ts`
- `packages/ingestion/src/runtime.ts`
- `packages/ingestion/src/read-api.ts`
- `packages/local-runtime/src/runtime-factory.ts`

## Risk Lane

Yellow. This slice parses untrusted admitted documents and creates immutable
local derivatives but performs no external transfer or ontology truth change.
Live parsing remains bounded by the exact approved evidence and non-executing
adapter contract.

## Targeted Verification

- `npm test -- packages/ingestion/test/artifact-derivative-contract.test.ts packages/ingestion/test/canonical-text-anchors.test.ts packages/ingestion/test/canonical-table-anchors.test.ts packages/ingestion/test/local-document-adapters.test.ts packages/ingestion/test/embedded-raster-derivatives.test.ts packages/ingestion/test/transcript-derivative-contract.test.ts`
- `npm test -- packages/ontology/test/contracts.test.ts`
- `npm test -- packages/local-runtime/test/local-artifact-derivation.test.ts`
- `npm run typecheck`
- `npm run ui:build`
- `npm run factory:check`

Success means every command exits zero and proves provider-neutral deterministic
derivatives, exact source anchors, bounded non-executing parsing, formula/cache
semantics, complete approved embedded-raster children, PDF/image identity-only
handling, transcript compatibility without processing, and zero external/live
effects.

## Integration Verification

Build only after Specifications 19 through 21 are integrated. Update the
candidate normally against latest `neo`, obtain a fresh Sol `ship` verdict on
the final diff, then run `npm run verify` once on the final merged candidate.
Compare with the current recorded baseline and latest `neo` CI; reject any new
or worsened failure. Integrate with normal Git history, push only configured
`origin`, observe CI, do not open a pull request, and do not force-push. Real
OCR/provider execution remains separately gated.

## Escalation Conditions

Escalate for a new source format, lossy normalization, formula/macro/script
execution, external fetch, partial/truncated derivative publication, changed
caps, embedded media omitted from OCR authority, independent top-level child
evidence, local PDF/image OCR competing with Specification 23, audio/video
processing, live provider/credential use during build, unavailable required
parser isolation, or the same concrete failure surviving two focused repair
attempts.
