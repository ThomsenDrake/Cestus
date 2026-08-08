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
capped independently at 250,000 blocks and 250,000 anchors, plus 128 MiB
canonical text. Every parser runs
without network, credentials, or subprocesses under a 2 GiB memory, 120 CPU-
second, 180 wall-second, 64-file-descriptor, 1-process, and 512 MiB private-
temporary-output limit.

Markdown permits depth 64, 1,000,000 AST nodes, and 8 KiB link targets. CSV/TSV
permits 1,000,000 rows, 16,384 columns, 10,000,000 occupied cells, 1 MiB fields,
and 8 MiB physical records. JSON retains Specification 19's 1 MiB input,
depth-32, 10,000-node limits and adds 1 MiB per string. DOCX permits 250,000
paragraphs, 1,000,000 runs/cells combined, 10,000 tables, 250,000 rows, 100,000
relationships, XML depth 64, and 1 MiB text nodes. XLSX permits 1,024 sheets,
1,048,576 addressable rows and 16,384 columns per sheet, but at most 1,000,000
occupied cells, 10,000 tables, 100,000 relationships, 1,000,000 shared strings,
128 MiB total shared-string text, and 1 MiB per string. Specification 19's ZIP/
XML/child caps also apply. Exceeding any cap fails closed without truncation or
fallback.

Specification 24 performs model-specific token packing. A resident/model
change creates a new invocation bundle, not new canonical blocks or anchors.

Every anchor contains anchor-contract version, parent evidence/derivative,
media-kind discriminator, exact structural locator, normalized derivative byte
range, original source byte range where available, deterministic ordinal, and
optional parent anchor. UTF-8 byte/scalar offsets, line indexes, physical/
logical rows, columns, pages, sheets, tables, OOXML paragraphs/runs/rows/cells,
array ordinals, and relationship ordinals are zero-based; ranges use their
named unit and are half-open. XLSX `A1` is retained as a display locator using
conventional one-based row numbers/letters but always carries the equivalent
zero-based row/column pair. Empty ranges are allowed only for an explicitly
empty source unit with a nonempty structural locator. Sibling source ranges
must be disjoint and ordered; overlap is allowed only for declared parent/child
containment or separately tagged formula/cached-value views of one cell. Unknown,
out-of-bounds, cross-evidence, or invalidly overlapping anchors are rejected.

Anchor serialization is RFC 8785 JCS UTF-8 JSON with exactly one trailing LF.
RFC 8785's UTF-16 code-unit member ordering is the field order and its escaping,
Unicode, and integer rules are authoritative; integers must also be safe JSON
integers. Hashes are lowercase hexadecimal. Every anchor object has exactly
`anchorVersion`, `anchorKind`, `parentEvidenceId`, `parentDerivativeId`,
`ordinal`, `normalizedRange`, `originalRange`, `parentAnchorId`, and `locator`;
nullable unavailable ranges/parents are explicit JSON `null`, not omitted.
`anchorKind` is exactly one of `text-range`, `markdown-node`, `env-entry`,
`tabular-cell`, `json-pointer`, `docx-node`, `xlsx-cell`, `embedded-raster`,
`ocr-page-block`, or `derived-transcript`.

`normalizedRange` and non-null `originalRange` contain exactly `unit`, `start`,
and `end`; units are `utf8-byte`, `unicode-scalar`, or `millisecond` as required
by the kind. Locator objects are closed tagged unions: `text-range` has
`lineStart,lineEnd,scalarStart,scalarEnd`; `markdown-node` has
`nodeKind,nodePath,headingPath,lineStart,lineEnd`; `env-entry` has
`assignmentName,line`; `tabular-cell` has
`physicalRecord,logicalRow,column,headerOccurrence`; `json-pointer` has
`pointer,valueType,ordinal`; `docx-node` has
`partUri,nodeKind,paragraph,run,table,row,column,relationshipId`;
`xlsx-cell` has `sheetOrdinal,row,column,a1,valueView,tableRange`;
`embedded-raster` has
`partUri,relationshipId,containingAnchorId,mediaType,byteCount,digest`;
`ocr-page-block` has
`page,blockOrdinal,blockType,box,markdownRange,tableLocator,wordRange,
wordConfidence,dimensions,invocationId,windowId`; and
`derived-transcript` has
`segmentId,startMs,endMs,channel,speaker,engineId,confidence,textHash`.
Each locator contains exactly its listed members, using explicit `null` for an
inapplicable optional member. Locator strings use RFC 6901 JSON pointers,
absolute OOXML part URIs, and normalized A1 uppercase columns; no platform path
appears. Extra union tags/members, duplicate JSON members, and non-JCS encodings
are rejected.

For `ocr-page-block`, `page` and `blockOrdinal` are zero-based safe integers;
`blockType` is the exact versioned Specification 23 compatibility-policy block
type; `box` is `null` or exactly `{x0,y0,x1,y1}` with finite JSON numbers and
`x0 <= x1`, `y0 <= y1`; `markdownRange` is exactly
`{unit:"utf8-byte",start,end}` with half-open safe-integer offsets into that
page's canonical Markdown; and `tableLocator` is `null` or exactly
`{tableOrdinal,rowStart,rowEnd,columnStart,columnEnd}`, all zero-based safe
integers with half-open row/column ranges. `wordRange` is exactly
`{start,end}` with zero-based half-open safe-integer ordinals into the page's
canonical word sequence; `wordConfidence` is an array whose length is exactly
`end - start` and whose finite JSON numbers are each in `[0,1]`; `dimensions`
is exactly `{width,height}` of positive safe-integer pixels. `invocationId` and
`windowId` are distinct required opaque immutable identities: the former names
the Specification 23 artifact invocation and the latter its exact page window.
An adapter normalizes provider fields to these names before JCS serialization;
missing, conflated, out-of-range, or extra OCR locator data is rejected.

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
extraction is an independently recoverable sub-derivative: each child is
staged, flushed, installed no-replace, and verified against the Specification
19 inventory; after all children exist, one atomic child-manifest commit makes
the complete set visible to Specification 23. A crash exposes no child manifest
or the exact complete one; replay verifies/reuses installed child blobs.
Missing/changed children fail this child sub-derivative without deleting valid
blobs.

The semantic DOCX/XLSX block derivative consumes the committed child manifest
but is a separate publication. An unrelated semantic parse/cap failure does not
hide or invalidate the already-authorized complete child manifest, so mandatory
OCR can proceed. Neither individual uncommitted children nor a partial child
set is visible to OCR.

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

A semantic or child-manifest derivative becomes visible only after its own
complete parsing/extraction, cap enforcement,
anchor validation, child-manifest verification, canonical serialization, and
hash verification. Publication is conditional on current parent evidence/
provenance and exact adapter version. Identical replay is idempotent;
conflicting identity reuse fails closed. Artifact-local derivative failure does
not affect successful siblings. There is no partial publication within either
derivative kind and no parser fallback.

## Observable Acceptance Examples

- UTF-8 fixtures differing only by CRLF/CR normalize to LF with exact source
  maps. Other whitespace/Unicode remains unchanged; repeated parsing yields
  identical blocks, anchors, serialization, and hashes.
- Oversized blocks split at the specified boundaries with complete,
  non-overlapping source coverage. Block/anchor/text/resource cap overflow
  fails without partial output.
- Exact line/row/column/page/table bases, empty anchors, A1 dual locators,
  canonical serialization, permitted containment overlaps, and rejected sibling
  overlaps have deterministic fixtures for every adapter.
- Cross-adapter RFC 8785 golden fixtures cover every closed `anchorKind`/
  locator union, null member, escaping case, safe-integer boundary, extra-field
  rejection, and the independent 250,000-block/250,000-anchor caps.
- OCR anchor fixtures prove closed `ocr-page-block` serialization carries page,
  block ordinal/type, box, Markdown range, table locator, word range and
  confidence, dimensions, and distinct invocation/window identities. Missing,
  conflated, out-of-range, or extra fields fail before publication.
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
- A semantic OOXML cap failure after a complete child-manifest commit leaves
  that exact child set available for mandatory OCR; crash at every child stage/
  manifest boundary exposes the complete set or none.
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
