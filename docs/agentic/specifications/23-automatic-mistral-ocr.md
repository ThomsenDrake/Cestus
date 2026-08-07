# Automatic Mistral OCR Authority, Budget, And Scheduler

Status: approved.

## Desired Behavior

Cestus automatically OCRs every approved standalone image, every page of every
approved PDF, and every approved embedded raster child. It produces canonical
OCR derivatives/anchors and owns OCR budget reservation, concurrency,
invocation state, and ambiguous-billing recovery. It does not perform resident
semantic extraction, accept ontology truth, use file uploads, or create public
URLs.

A Specification 20 version-two approval is required. Before credential access
or byte encoding, Cestus revalidates exact evidence/child identity/content hash,
selected or embedded-child membership, endpoint-policy revision,
`mistral-ocr-latest`, adapter/request schema, opaque credential-reference
identity, region/retention disclosure, budget/concurrency revisions, and the
page-window/repeated-transfer plan. Changed or missing binding blocks without
credential use or transfer. Authority applies only to Mistral OCR for those
exact bytes and cannot authorize resident or another provider transfer.

The endpoint is HTTPS `POST https://api.mistral.ai/v1/ocr`; redirects are
disabled. The credential comes only from the bound opaque secret reference and
never enters arguments, URLs, logs, events, diagnostics, projections, or
model-visible content. The human-configured endpoint policy records current
provider region/retention disclosures rather than claiming zero retention.

Every request uses `model: "mistral-ocr-latest"`,
`table_format: "markdown"`, `include_blocks: true`,
`include_image_base64: false`, `confidence_scores_granularity: "word"`,
`extract_header: true`, and `extract_footer: true`. It supplies no annotation
prompt or annotation schema.

Standalone/embedded images use `document.type: "image_url"` and an inline
`data:<exact-media-type>;base64,...` value. PDFs use
`document.type: "document_url"` and inline
`data:application/pdf;base64,...`. No public URL, file upload, signed URL,
provider library, persistent provider file, or response image copy is created.
Base64 is streamed without an additional whole-artifact encoded copy.

PDF pages are locally counted by Specification 19 and partitioned into
canonical zero-based windows of at most 50 pages. Each request supplies its
exact `pages` range and streams the original PDF bytes inline. Specification
20 discloses call count and repeated-transfer total. All windows compose into
one final artifact derivative.

Optional budget enforcement is a per-workspace UTC calendar-month page cap. A
standalone/embedded image reserves one page; a PDF reserves its complete local
page count. The whole artifact reservation appends atomically before first
transfer, and concurrent jobs cannot oversubscribe it. Each response reconciles
`usage_info.pages_processed` with its exact window. Usage above reservation or
inconsistent accounting stops safely.

Only a human may configure/disable the budget. Disabled enforcement retains
usage records and displays an unbounded-spend warning. The resident may
recommend a change but cannot make it. Unused reservation releases only after
a provider response proves rejection before processing; ambiguous outcomes
retain reservation.

OCR concurrency defaults to two calls. An authenticated human may configure
one through four. The resident cannot change it. Windows for one artifact stay
ordered; different artifacts pipeline within the global limit.

Invocation states are `planned`, `reserved`, `sending`, `response-received`,
`validating`, `committed`, `blocked-credential`, `blocked-budget`,
`blocked-policy`, `failed-input`, `failed-provider`, `billing-uncertain`, and
`abandoned`. Every window has deterministic client identity and compare-and-
append transitions. Duplicate wakes cannot create another call after
`sending`.

Timeout, post-send reset, malformed/incomplete success, 5xx, or any potentially
processed outcome receives no automatic retry. It becomes
`billing-uncertain`, retains reservation, and blocks the artifact. Because the
provider documents no OCR idempotency guarantee, one possible duplicate-
billing retry requires explicit human acknowledgment bound to that exact
window; the human may instead abandon the artifact. An explicit unprocessed
throttling response with bounded `Retry-After` may schedule at most two
throttle retries without sleeping a worker or making a new reservation. Counts
survive restart. No Batch API, upload, older model, local OCR, resident vision,
or alternate-provider fallback exists.

A valid response contains every requested page index exactly once, valid
Markdown/dimensions, supported ordered blocks and bounded boxes, Markdown table
structures when present, word/page confidence within `[0,1]`, matching
`usage_info.pages_processed`, and a nonempty concrete `model` different from
`mistral-ocr-latest`.

The adapter rejects missing/alias-only model identity; missing, duplicate, or
unrequested pages; invalid dimensions/boxes/confidence/tables/blocks/
hyperlinks; response-embedded base64 image data; fields outside the versioned
compatibility policy; credential-shaped safe metadata; unsafe errors; usage
mismatch; responses over 128 MiB per window; Markdown over 8 MiB per page;
more than 50,000 blocks per page; or more than 500,000 word-confidence records
per window. OCR text/links remain untrusted evidence and are never actively
rendered or fetched.

Every window records the requested alias and provider-returned concrete model.
All windows of one PDF must resolve to the same concrete identity; mid-artifact
model drift prevents composition. Concrete model, endpoint policy, adapter,
request/response hashes, invocation, usage, and time enter provenance.

Replay of one committed invocation returns the exact stored result without a
call. A newly requested derivation run always calls `mistral-ocr-latest`; an old
cached derivative cannot be presented as current latest.

Publication waits for every required window. Canonical composition orders by
original page and creates Specification 22 anchors containing parent evidence/
child identity, page, block ordinal/type, box, Markdown range, table locator,
word range/confidence, dimensions, and invocation/window identity. Images use
page zero. A PDF has no partial visible derivative. Committed provenance stores
canonical response/derivative hashes, never credentials or request base64.
Artifact-local failure does not block successful siblings.

## Observable Acceptance Examples

- A selected PNG sends one exact inline `image_url` request. A selected 120-
  page PDF plans ranges `0-49`, `50-99`, and `100-119`, discloses three complete
  PDF transfers, reserves 120 pages, and publishes one derivative only after
  all three validate.
- A selected DOCX child raster uses its exact parent/part/digest binding. An
  unselected, changed, added, or omitted child permits no credential access or
  call.
- Endpoint, alias, adapter, credential reference, region/retention, budget,
  concurrency, page count, or window-plan drift blocks before byte encoding.
- No request follows a redirect, uses a public/uploaded file, or requests
  response image bytes.
- Concurrent reservations cannot exceed the monthly cap. UTC rollover,
  disabled enforcement, usage reconciliation, ambiguous retained reservation,
  and configuration actor authority are deterministic.
- Duplicate wakes after `sending` produce no second call. A documented
  unprocessed throttle may schedule two bounded retries; ambiguous results do
  not retry until exact human acknowledgment.
- Missing/alias-only model, mixed concrete models across windows, schema/cap/
  usage failures, invalid anchors, unsafe metadata, and response image data
  prevent derivative publication.
- Same-invocation replay reuses exact output. A new derivation request invokes
  the latest alias again rather than claiming a cache is latest.
- Standard verification uses fake HTTP/secret/budget/clock/storage adapters and
  synthetic artifacts. It uses no real credential, provider call, spending,
  SSD read, socket bind, resident invocation, PRR, publication, or ontology
  mutation.

## Allowed Scope

- `packages/ingestion/src/**` only for OCR job/invocation envelopes, response
  validation/normalization, canonical page/block/table/word anchors,
  composition, hashes, and safe terminal states.
- `packages/ingestion/test/**` for exact request/response fixtures, anchors,
  caps, resolved-model drift, composition, idempotency, and no-cache new runs.
- `packages/ontology/src/contracts.ts` and focused tests only for immutable OCR
  derivative, invocation, budget, and provenance records; no ontology truth.
- `packages/local-runtime/src/**` only for Mistral endpoint policy, opaque
  credential use, streaming inline adapter, page budget/configuration,
  concurrency scheduler, retry acknowledgment/abandonment, and dependency
  wiring.
- `packages/local-runtime/test/**` for fake OCR/credential, authority, request
  shape, budget, concurrency, restart, ambiguity, secret-safety, and zero-live-
  effect tests.
- `packages/agent/src/**` only for safe OCR progress and resident
  recommendation/request forwarding; no provider authority.
- `packages/agent/test/**` for budget/concurrency recommendation non-authority
  and content-free status.
- `docs/agentic/specifications/19-descriptor-confined-source-scan.md` and
  `docs/agentic/specifications/20-exact-import-approval-evidence-admission.md`
  only for the approved page-count/window/transfer amendment.
- `package.json` and `package-lock.json` only for a bounded HTTP/PDF metadata
  dependency justified by this specification.
- Do not modify resident semantic provider transfer, local parser semantics,
  source/import/redaction authority, ontology candidates/truth, audio/video,
  UI, PRR, legal, export, publication, or destructive operations.

## Relevant Context Entry Points

- `AGENTS.md`
- `docs/agentic/software-factory.md`
- `.agents/skills/cestus-software-factory/SKILL.md`
- `docs/agentic/specifications/20-exact-import-approval-evidence-admission.md`
- `docs/agentic/specifications/22-local-artifact-derivatives-anchors.md`
- `packages/ingestion/src/runtime.ts`
- `packages/ingestion/src/parser.ts`
- `packages/agent/src/provider.ts`
- `packages/local-runtime/src/agent-provider-configuration.ts`
- `packages/local-runtime/src/ingestion-http-routes.ts`
- `packages/local-runtime/src/runtime-factory.ts`
- `https://docs.mistral.ai/api/endpoint/ocr`
- `https://docs.mistral.ai/studio-api/document-processing/basic_ocr`
- `https://docs.mistral.ai/resources/known-limitations`
- `https://docs.mistral.ai/resources/changelogs`

## Risk Lane

Red. This slice automatically transfers approved artifact bytes to a billable
external provider using a real credential. Exact import/OCR authority,
credential configuration, budget/concurrency changes, ambiguous retry, and
abandonment remain authenticated human actions; build verification uses only
fakes and performs no call.

## Targeted Verification

- `npm test -- packages/ingestion/test/mistral-ocr-contract.test.ts packages/ingestion/test/mistral-ocr-normalization.test.ts packages/ingestion/test/mistral-ocr-anchors.test.ts packages/ingestion/test/mistral-ocr-composition.test.ts`
- `npm test -- packages/agent/test/mistral-ocr-authority.test.ts`
- `npm test -- packages/local-runtime/test/mistral-ocr-adapter.test.ts packages/local-runtime/test/mistral-ocr-budget.test.ts packages/local-runtime/test/mistral-ocr-scheduler.test.ts packages/local-runtime/test/mistral-ocr-ambiguity.test.ts`
- `npm run typecheck`
- `npm run ui:build`
- `npm run factory:check`

Success means every command exits zero and proves exact approval-bound inline
OCR for every required artifact/page, 50-page planning, atomic optional budget,
bounded human-controlled concurrency, non-retrying ambiguous billing, strict
resolved-model/schema provenance, canonical anchors/composition, latest-alias
cache semantics, secret safety, and zero live/external effects.

## Integration Verification

Build only after Specifications 20 and 22 are integrated. Update the candidate
normally against latest `neo`, obtain a fresh Sol `ship` verdict on the final
diff, then run `npm run verify` once on the final merged candidate. Compare with
the current recorded baseline and latest `neo` CI; reject any new or worsened
failure. Integrate with normal Git history, push only configured `origin`,
observe CI, do not open a pull request, and do not force-push. Real credential
binding, OCR calls, spending, retry acknowledgment, and abandonment remain
separately human-gated live actions.

## Escalation Conditions

Escalate for a different endpoint/model alias, public/persistent upload,
missing exact transfer authority, response image retention, agent-controlled
budget/concurrency/retry, an automatic ambiguous retry, changed page/window/
output caps, unresolved/mixed model provenance, cache reuse as current latest,
provider fallback, live credential/call during build, unavailable required
endpoint/schema behavior, or the same concrete failure surviving two focused
repair attempts.
