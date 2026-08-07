# Text And Image Derivation With OpenPlanter Candidate Extraction

Status: approved.

## Desired Behavior

Every artifact imported by Specification 17 enters a typed, provenance-bound,
per-artifact derivation pipeline. Cestus parses ordinary text/document formats
locally, sends every image and every PDF through Mistral OCR, normalizes the
results into one derivative contract, and asks the mounted resident's active
configured model to extract evidence-linked ontology candidates. It creates no
ontology truth; review and acceptance belong to Specification 19.

The resident uses the same active backend and model that drives it. A resident
configured through Nous Portal uses that exact configured Nous model; a
resident configured through ChatGPT authentication uses that exact specified
model; a local resident uses its exact local model. There is no silent model,
provider, or modality fallback.

Local deterministic adapters produce stable anchors:

- Markdown/plain text: byte/character range, line, heading, and section;
- CSV/TSV: record, row, column, and header identity;
- DOCX: part, heading, paragraph, table, row, and cell;
- XLSX: workbook, sheet, row, cell, formula, and cached value;
- eligible JSON: JSON Pointer and value range.

Adapters treat embedded links, formulas, field codes, macros, HTML, filenames,
and relationship targets as untrusted data. They never execute active content,
fetch a link, evaluate a formula, load an external relationship, or fall back to
another parser. Output is canonical normalized text plus an anchor map, parser
identity/version, parent evidence hash, output hash, and safe diagnostics.

Every admitted image and every PDF uses the Mistral Document AI OCR endpoint
with model alias `mistral-ocr-latest`. Cestus sends the artifact inline as a
base64 data URL; it creates no public URL and no persistent Mistral upload.
Requests enable structured blocks, bounding boxes, Markdown table output, and
word-level confidence, without requesting response-embedded image bytes. The
response is strictly validated and normalized as untrusted evidence.

Mistral OCR is mandatory and has no per-artifact or per-batch approval. The
Specification 17 import preview must prominently disclose that every selected
image and PDF will be transferred automatically to Mistral after import.
Selecting and approving that exact import batch supplies this narrow transfer
authority. It does not authorize any other provider transfer. A configured
Mistral credential is still required and remains an opaque existing secret
reference; the resident cannot create, read, display, or replace it.

Mistral setup supports a human-configured page/request budget and bounded
concurrency. The initial concurrency is two OCR calls. A human may change the
budget, change concurrency within safe runtime limits, or explicitly disable
the budget. The resident cannot. Budget enforcement occurs before byte
transfer. Import preview shows selected image/PDF counts and an estimated page
envelope but adds no second approval. Exhaustion blocks new OCR calls rather
than spending beyond the configured limit.

OCR provenance records the requested `mistral-ocr-latest` alias, invocation
time and ID, endpoint/adapter schema, provider-returned resolved model identity,
usage, page dimensions, Markdown, structural blocks, bounding boxes,
confidence, canonical response hash, and derivative hash. Because the alias is
intentionally mutable, a resolved-model change creates a new derivative
identity but does not require a local model-update approval. Invalid or missing
resolved identity is recorded as unavailable; missing required content/usage
schema fails the artifact closed.

Each normalized artifact becomes stable bounded chunks. The resident semantic
invocation receives the derivative text and exact source anchors. If the active
provider declares image input, a standalone image's raw artifact is also sent
with its OCR derivative. If it declares native PDF/document input, a PDF's raw
artifact is also sent with its OCR derivative. Image and document capabilities
are distinct, must come from the current provider capability contract, and are
never inferred. Cestus does not rasterize a PDF merely to bypass unsupported
document input.

A remote resident provider still requires Cestus's existing exact
provider-byte-transfer approval for derivative chunks and any raw artifacts.
The automatic Mistral OCR exception does not weaken that gate. A local resident
requires no external transfer approval. A missing approval blocks semantic
extraction while any already authorized Mistral OCR derivative remains valid.

Resident output is schema-constrained. Every candidate includes subject (when
known), predicate, scalar object, confidence, evidence/derivative/source
anchors, rationale, alternatives, uncertainty, and model invocation identity.
Cestus rejects unknown or unsupported anchors, out-of-bundle evidence, invalid
types, secret-bearing safe fields, or output outside the schema. OCR is evidence,
not truth. If OCR confidence is low or direct visual/document interpretation
conflicts with OCR, the candidate is `review-only`, preserves both evidence
paths, and states the disagreement. Neither provider silently wins.

Per-artifact pipelining begins as soon as each approved import completes. Local
parsing and Mistral OCR use separate bounded queues. Every job terminates as
`derived`, `review-only`, `blocked-credential`, `blocked-transfer-approval`,
`blocked-budget`, `blocked-capability`, `failed-input`, or `failed-provider`.
Completed derivatives are immutable and reused only when parent hash, adapter,
request contract, and provider-result identity match. Changed provider/model/
adapter input creates a new derivative, never an in-place mutation.

Explicit provider throttling may honor bounded `Retry-After`. Ambiguous network
failure is not blindly retried because it could duplicate a billable call.
There is no local OCR, resident-vision, older-Mistral, or other provider
fallback. One artifact's terminal failure does not stall successful siblings.

The derivative envelope also defines a future `derived-transcript` kind with a
parent audio/video evidence hash and exact time-range anchors. This slice does
not transcribe, send, parse, or semantically ingest audio/video. A later
transcription adapter can produce that envelope and enter the same chunking and
candidate path without changing evidence or ontology semantics.

## Observable Acceptance Examples

- Markdown, CSV, DOCX, XLSX, and eligible JSON fixtures produce deterministic
  canonical text and exact source anchors across repeated runs. External links,
  formulas, macros, and relationships are never executed or fetched.
- Each PNG/JPEG/WebP/HEIC/TIFF fixture and every PDF fixture creates exactly one
  accepted OCR derivation identity using `mistral-ocr-latest`, inline bytes,
  structured blocks, Markdown tables, and word confidence. No public URL,
  uploaded-file object, or response-embedded image copy is created.
- An import preview for selected images/PDFs discloses automatic Mistral
  transfer and estimated pages. After that import approval, OCR starts per
  artifact without another decision. An unselected image receives no call.
- Missing Mistral binding, exhausted enabled budget, invalid response schema,
  explicit provider rejection, or ambiguous transport failure terminates only
  that artifact and invokes no fallback. Disabling the budget through an
  authenticated human configuration permits calls without a budget check;
  resident attempts to change it fail.
- The returned `model` field is stored with the requested alias and output
  hashes. A later alias resolution creates a distinct immutable derivative
  without rewriting the first.
- A text-only resident receives OCR-derived text but no image/PDF bytes. An
  image-capable resident receives an image plus its OCR derivative. A
  document-capable resident receives a PDF plus its OCR derivative. Capability
  omission or mismatch blocks raw modality input without inferred fallback.
- A remote resident receives no derivative or raw bytes without its existing
  exact provider-transfer approval. A local resident proceeds without that
  remote gate. The automatic OCR authority cannot be reused for resident,
  Nous, ChatGPT, or another provider transfer.
- A fake resident returning a candidate with a nonexistent page/block/cell,
  another artifact's anchor, unapproved evidence, invalid scalar, or malformed
  schema produces no candidate artifact.
- Low-confidence OCR and an OCR/direct-vision disagreement produce a
  `review-only` candidate containing both anchored interpretations and explicit
  uncertainty.
- Restarting or duplicating scheduler wake reuses exact completed derivatives
  and creates no duplicate provider call for a known successful invocation.
  An ambiguous call remains blocked until an explicit resume decision rather
  than being charged again automatically.
- A synthetic future transcript envelope with time anchors passes contract and
  chunking tests. No audio/video provider or transcription implementation is
  added.
- Standard verification uses fake Mistral and resident adapters, synthetic
  artifacts, and fake credential references. It never reads the SSD, uses a
  real credential, calls Mistral/Nous/ChatGPT, spends money, starts a live
  runtime, binds a socket, sends a PRR, or publishes.

## Allowed Scope

- `packages/ingestion/src/**` only for typed derivative envelopes, local format
  adapters, canonical anchors/chunks, OCR result normalization, per-artifact
  job identity, terminality, and transcript-envelope compatibility.
- `packages/ingestion/test/**` for deterministic format fixtures, malicious
  active-content fixtures, anchor maps, OCR normalization, idempotency,
  terminality, and transcript-contract tests.
- `packages/agent/src/provider.ts`, provider capability/selection modules, and
  focused tests only to declare and validate separate `text`, `image`, and
  `document` input modalities and carry hash-bound artifact inputs. Existing
  remote transfer approval remains mandatory.
- `packages/agent/src/**` only for derivative chunk context, active resident
  model invocation, strict OpenPlanter candidate validation, anchored
  uncertainty/conflict output, and exact provider-transfer consumption.
- `packages/agent/test/**` for same-model selection, modality routing, transfer
  gates, invalid output/anchor rejection, and fake candidate extraction.
- `packages/ontology-bootstrap/src/**` only for the minimum evidence-linked
  candidate/dossier contract needed by Specification 19; do not append proposed
  or accepted ontology events in this slice.
- `packages/local-runtime/src/**` only for Mistral OCR adapter/configuration,
  opaque credential-reference use, optional budget/concurrency configuration,
  per-artifact queues, import-disclosure integration, and mounted dependency
  wiring.
- `packages/local-runtime/test/**` for fake OCR/provider, credential boundary,
  budget, disclosure, scheduling, restart, secret-safety, and zero-live-effect
  tests.
- `package.json` and `package-lock.json` only for bounded document-parser or API
  protocol dependencies justified by this specification.
- Do not modify accepted ontology truth/entity/relationship behavior, boundary
  selection, raw import authority beyond the automatic-OCR disclosure, LFM
  redaction policy, UI, audio/video processing, PRR, legal, export, publication,
  destructive operations, or historical product-design material.

## Relevant Context Entry Points

- `AGENTS.md`
- `docs/agentic/software-factory.md`
- `.agents/skills/cestus-software-factory/SKILL.md`
- `docs/agentic/specifications/16-on-device-secret-redaction.md`
- `docs/agentic/specifications/17-approved-source-scan-import.md`
- `packages/ingestion/src/runtime.ts`
- `packages/ingestion/src/read-api.ts`
- `packages/agent/src/provider.ts`
- `packages/agent/src/provider-registry.ts`
- `packages/agent/src/provider-selection.ts`
- `packages/agent/src/adapters/provider-byte-transfer.ts`
- `packages/agent/src/ontology-bootstrap-workflow.ts`
- `packages/ontology-bootstrap/src/contracts.ts`
- `packages/local-runtime/src/agent-provider-configuration.ts`
- `packages/local-runtime/src/ingestion-http-routes.ts`
- `packages/local-runtime/src/runtime-factory.ts`

## Risk Lane

Red. This slice automatically transfers selected image/PDF bytes to a billable
external OCR provider and may transfer imported evidence to a configured remote
resident provider. Import selection explicitly discloses and authorizes only
automatic Mistral OCR; Mistral credential configuration and remote resident
byte transfer retain their exact human gates. Build verification performs no
real provider call.

## Targeted Verification

- `npm test -- packages/ingestion/test/artifact-derivatives.test.ts packages/ingestion/test/local-document-adapters.test.ts packages/ingestion/test/mistral-ocr-derivative.test.ts packages/ingestion/test/derivation-terminality.test.ts packages/ingestion/test/transcript-derivative-contract.test.ts`
- `npm test -- packages/agent/test/provider-capability-modalities.test.ts packages/agent/test/openplanter-candidate-extraction.test.ts packages/agent/test/provider-byte-transfer.test.ts`
- `npm test -- packages/ontology-bootstrap/test/contracts.test.ts`
- `npm test -- packages/local-runtime/test/mistral-ocr-adapter.test.ts packages/local-runtime/test/mistral-ocr-budget.test.ts packages/local-runtime/test/resident-artifact-derivation.test.ts packages/local-runtime/test/agent-resident-source-import-routes.test.ts`
- `npm run typecheck`
- `npm run ui:build`
- `npm run factory:check`

Success means all commands exit zero and prove deterministic local derivation,
mandatory automatic latest-alias OCR for every image/PDF, exact provenance,
optional human-controlled budget, no public/persistent upload, declared
dual-modality resident input, preserved remote resident transfer approval,
strict anchored candidates, terminal recovery, and zero live/external effect.

## Integration Verification

Build only after Specification 17 is integrated. Update the candidate normally
against latest `neo`, obtain a fresh Sol `ship` verdict on the final diff, then
run `npm run verify` once on the final merged candidate. Compare with the
current recorded baseline and latest `neo` CI; reject any new or worsened
failure. Integrate with normal Git history, push only configured `origin`,
observe CI, do not open a pull request, and do not force-push. Real Mistral
credential binding and calls remain separate live human actions.

## Escalation Conditions

Escalate for replacing `mistral-ocr-latest`, a persistent/public upload,
permitting OCR without an approved selected import, extending automatic
transfer beyond image/PDF OCR, removing the resident provider-transfer gate,
automatic provider/model fallback, executing document active content, enabling
audio/video processing, model output becoming truth, real credential/provider
use during build, changed external retention/region requirements, unavailable
required format/provider capability, or the same concrete failure surviving
two focused repair attempts.
