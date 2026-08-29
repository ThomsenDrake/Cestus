# Automatic Mistral OCR Authority, Budget, And Scheduler

> **Development authority:** This is a non-authoritative product-requirement
> source. Historical status, execution, role, risk, repair, review, integration,
> and verification text below does not govern current work. Follow \`AGENTS.md\`,
> Compound Engineering, and \`SECURITY.md\`.

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
`data:<exact-media-type>;base64,...` value, where the exact version-one
transport allowlist is `image/png`, `image/jpeg`, and `image/webp`. Image bytes
must satisfy Specification 19's 20,000,000-byte/static-image policy. PDFs use
`document.type: "document_url"` and inline
`data:application/pdf;base64,...` and must satisfy its 50,000,000-byte/1,000-page
policy. No public URL, file upload, signed URL,
provider library, persistent provider file, or response image copy is created.
Base64 is streamed without an additional whole-artifact encoded copy.

PDF pages are locally counted by Specification 19 and partitioned into
canonical zero-based windows of at most 50 pages. Each request supplies its
exact `pages` range and streams the original PDF bytes inline. Specification
20 discloses call count and repeated-transfer total. All windows compose into
one final artifact derivative.

Optional budget enforcement is a per-workspace UTC calendar-month page cap.
Before each call attempt, a standalone/embedded image reserves one page and a
PDF window reserves its exact page count atomically against the UTC month in
which that call will dispatch; concurrent jobs cannot oversubscribe it. If the
month changes after reservation but before dispatch, the unused old-month
reservation is atomically released and the call must reserve the new month
before credential access/encoding. Calls already dispatched retain their
original month attribution. A PDF crossing rollover therefore holds separate
reservations in each actual dispatch month and may pause between windows when
the new month lacks capacity. Each response reconciles
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

An artifact-run identity binds evidence/child, approval, endpoint/policy,
alias, adapter, budget/concurrency revisions, derivation generation, and a
rerun ordinal. The initial run has ordinal zero and no rerun decision. Every
later ordinal requires one authenticated human one-use rerun decision bound to
the prior run/outcome, exact approval/policy/generation, displayed possible
duplicate spend/call/byte plan, and next ordinal; that decision ID is part of
the new run identity and is consumed before any credential access. The resident
cannot request execution as though it were that decision, and replay cannot
create another run. A
window identity adds its exact page range. Each network call attempt adds class
and ordinal: `initial:0`, `throttle:1`, `throttle:2`, or
`human-duplicate:1`. Attempt states are `planned`, `reserved`, `dispatching`,
`response-received`,
`validating`, `committed`, `blocked-credential`, `blocked-budget`,
`blocked-policy`, `failed-input`, `failed-provider`, `billing-uncertain`, and
`abandoned`. Every transition is compare-and-append and durable. The
`dispatching` append consumes that exact call capability before bytes leave;
a crash/reset after it is billing-uncertain and cannot auto-dispatch the same
or another attempt. A committed response is stored durably and replay reuses
it.

Timeout, post-send reset, malformed/incomplete success, 5xx, or any potentially
processed outcome receives no automatic retry. It becomes
`billing-uncertain`, retains reservation, and blocks the artifact. Because the
provider documents no OCR idempotency guarantee, one possible duplicate-
billing retry requires explicit human acknowledgment bound to that exact
window; the human may instead abandon the artifact. An explicit unprocessed
throttling response with bounded `Retry-After` may schedule at most two
throttle attempts without sleeping a worker; a provider-proven unprocessed
throttle releases its attempt reservation before the next attempt reserves in
its actual month. The one human-duplicate acknowledgment is itself one-use and
consumed before dispatch. Thus one window has at most four calls total: initial,
two proven-unprocessed throttle attempts, and one acknowledged possibly
duplicate call. Counts survive restart. No Batch API, upload, older model, local OCR, resident vision,
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

Multiple source occurrences that deduplicate to one evidence identity share
one artifact run and committed derivative only when approval, policy, and
derivation-generation bindings are identical. A different approval, policy,
generation creates a new initial artifact-run identity and performs fresh
latest-alias calls. An explicit rerun creates a new identity only through the
one-use human rerun authority and monotonically next ordinal above.
Window/attempt identities are never reused across runs.

Publication waits for every required window. Canonical composition orders by
original page and creates Specification 22 anchors containing parent evidence/
child identity, page, block ordinal/type, box, Markdown range, table locator,
word range/confidence, dimensions, and distinct invocation and window
identities. Those are exactly Specification 22's closed `ocr-page-block`
locator fields `page`, `blockOrdinal`, `blockType`, `box`, `markdownRange`,
`tableLocator`, `wordRange`, `wordConfidence`, `dimensions`, `invocationId`,
and `windowId`; provider response names are normalized before anchor
serialization. Images use page zero. A PDF has no partial visible derivative.
Committed provenance stores canonical response/derivative hashes, never
credentials or request base64. Artifact-local failure does not block successful
siblings.

## Observable Acceptance Examples

- A selected PNG sends one exact inline `image_url` request. A selected 120-
  page PDF plans ranges `0-49`, `50-99`, and `100-119`, discloses three complete
  PDF transfers, reserves 50/50/20 pages in each call's actual UTC month, and publishes one derivative only after
  all three validate.
- A selected DOCX child raster uses its exact parent/part/digest binding. An
  unselected, changed, added, or omitted child permits no credential access or
  call.
- Endpoint, alias, adapter, credential reference, region/retention, budget,
  concurrency, page count, or window-plan drift blocks before byte encoding.
- No request follows a redirect, uses a public/uploaded file, or requests
  response image bytes.
- Concurrent reservations cannot exceed the monthly cap. A rollover before
  dispatch moves the unused reservation atomically; a cross-month PDF charges
  each window to its dispatch month. UTC rollover,
  disabled enforcement, usage reconciliation, ambiguous retained reservation,
  and configuration actor authority are deterministic.
- Duplicate wakes after `dispatching` produce no second call. Crash after
  dispatch becomes billing-uncertain. A documented unprocessed throttle may
  schedule two bounded attempts; ambiguous results do not retry until the one
  exact human acknowledgment, and total calls never exceed four.
- HEIC/HEIF/TIFF/BMP/AVIF/GIF or over-20,000,000-byte images and
  over-50,000,000-byte/1,000-page
  PDFs are unselectable upstream and never reach credential access.
- Missing/alias-only model, mixed concrete models across windows, schema/cap/
  usage failures, invalid closed `ocr-page-block` locator fields (including
  conflated invocation/window identity), unsafe metadata, and response image
  data prevent derivative publication.
- Same-invocation replay reuses exact output. A new derivation request invokes
  the latest alias again rather than claiming a cache is latest.
- Identical rerun requests are idempotent; only one authenticated human
  one-use decision can create the next ordinal, and resident, stale, skipped-
  ordinal, replayed, or concurrently consumed decisions make no credential or
  network effect.
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

- `npm test -- packages/ingestion/test/mistral-ocr-contract.test.ts packages/ingestion/test/mistral-ocr-normalization.test.ts packages/ingestion/test/mistral-ocr-anchors.test.ts packages/ingestion/test/mistral-ocr-composition.test.ts packages/ingestion/test/mistral-ocr-invocation-identity.test.ts`
- `npm test -- packages/agent/test/mistral-ocr-authority.test.ts`
- `npm test -- packages/local-runtime/test/mistral-ocr-adapter.test.ts packages/local-runtime/test/mistral-ocr-budget.test.ts packages/local-runtime/test/mistral-ocr-scheduler.test.ts packages/local-runtime/test/mistral-ocr-ambiguity.test.ts packages/local-runtime/test/mistral-ocr-dispatch-crash.test.ts`
- `npm run typecheck`
- `npm run ui:build`
- `npm run factory:check`

Success means every command exits zero and proves exact approval-bound inline
OCR for every required artifact/page, 50-page planning, cross-month atomic optional budget,
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
