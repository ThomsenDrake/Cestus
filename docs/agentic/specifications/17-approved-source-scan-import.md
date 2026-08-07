# Approved Source Scan And Import

Status: approved.

## Desired Behavior

The mounted resident consumes one current, human-approved Specification 15
source boundary and turns it into an exact, selectable, resumable import batch.
Boundary approval authorizes a read-only local scan, including content
classification and hashing inside the exact boundary. It does not authorize a
durable import. One separate authenticated human approval selects the exact
manifest entries that may enter one destination workspace.

Before every scan and import, Cestus revalidates the portable workspace,
mounted source collection, source identity, canonical root, device/mount
identity, approved protected discovery artifact, boundary manifest, approval,
and included/excluded partition. A changed or unavailable binding fails closed.
The resident may request a new boundary revision but cannot create or approve
one.

Traversal opens only regular files through no-follow semantics, revalidates
device/inode identity after open, never follows symlinks, and never crosses a
nested mount. It excludes archives and compressed containers, executable files,
devices, sockets, pipes, animated images, SVG, version-control data, dependency
trees, caches, editor state, lockfiles, package manifests, recognized
application state, and recognized configuration. It neither expands nor
recursively interprets an excluded file.

The initial eligible document allowlist is:

- `.md`, `.markdown`, `.txt`, `.csv`, and `.tsv`;
- text-bearing or image-bearing `.pdf`;
- `.docx` and `.xlsx`;
- `.png`, `.jpg`, `.jpeg`, `.webp`, `.heic`, `.heif`, `.tif`, and `.tiff`;
- ordinary `.json` only when deterministic structure identifies content or an
  exported data artifact rather than configuration/application state.

Extension, file signature, encoding, and structure must agree. Ambiguous files
are excluded. `.env` and `.env.*` are narrow configuration exceptions routed
through Specification 16. Example/template variants are routed only when they
contain credential-like values. JSON containing private JWT signing material
is routed through Specification 16. Public-only JWT verification keys are
eligible unchanged. Other JSON config, manifests, and state remain excluded.

Initial hard admission limits are 64 MiB per plain-text/tabular/JSON artifact,
256 MiB per office document or PDF, 512 MiB per image, 100,000 discovered
entries, and 50 GiB per proposed import batch. Over-limit entries appear only
as excluded metadata. Changing a limit requires a human-approved boundary
revision; the resident cannot silently split or expand authority to bypass it.

Scanning produces one immutable protected manifest. Each entry contains its
normalized relative path, safe source identity, detected type, size,
modification identity, eligibility/exclusion reason, and either a normal
content digest for ordinary artifacts or Specification 16's per-observation
keyed commitment for secret-bearing candidates. Protected exact paths are
available only through authenticated mounted human readback. Ordinary resident,
ledger, diagnostic, and progress surfaces remain content-free and secret-safe.

The human checks an exact subset in one import preview. Approval binds the
workspace, destination, source/boundary revisions, protected manifest and
preview hashes, selected entry identities, expected bytes/types, redaction
readiness, and human actor. Unchecked, new, changed, missing, excluded,
quarantined, or over-limit entries receive no authority.

Import reopens and revalidates every selected file at consume time. Unchanged
ordinary files stream into canonical immutable evidence storage. Protected
files pass through Specification 16; raw bytes are never stored, and only a
clean derivative is automatically ingested. Each stored artifact records
append-only provenance linking the source observation, exact approval,
detected media type, transformation status, derivative/content hash, import
batch, and destination workspace. This slice does not parse semantic content,
invoke a resident or OCR provider, propose ontology candidates, or accept
ontology truth.

Every selected entry terminates as `imported`, `skipped-changed`,
`skipped-missing`, `excluded`, or `quarantined`. A batch terminates as
`completed`, `completed-with-exceptions`, `cancelled`, or
`stopped-safety-failure`. Isolated file failures do not roll back successful
append-only imports and do not stop siblings. Boundary/mount/approval/model
readiness loss, ledger failure, storage-integrity failure, or destination
replacement stops new work immediately. Human cancellation takes effect at the
next bounded file boundary. Resume revalidates all authority and never trusts
cached eligibility.

Stable idempotency keys derived from the destination, approval, manifest entry,
and admitted artifact identity prevent duplicate evidence across retries,
crashes, and concurrent scheduler wakeups. Canonical storage has no fallback
path.

## Observable Acceptance Examples

- An approved Specification 15 fixture boundary permits a scan without another
  approval. A missing, denied, stale, replaced, mismatched, or agent-approved
  boundary permits no content open or hash.
- A fixture tree containing Markdown, CSV, text and scanned PDFs, DOCX, XLSX,
  admitted image formats, ordinary exported-data JSON, config JSON, `.git`,
  `node_modules`, a ZIP, SVG, FIFO, executable, symlink, and nested mount admits
  only the exact allowlisted regular artifacts and classifies every discovered
  entry exactly once.
- A symlink race, rename after enumeration, inode/device substitution, mount
  replacement, traversal path, case/normalization collision, or open outside
  the canonical root fails before a manifest entry or evidence write.
- A plain JWK/JWKS with only public verification members is admitted unchanged.
  A private JWK/JWKS or service-account signing-key JSON receives a protected
  commitment and can only yield a Specification 16 derivative. Ordinary data
  JSON is admitted; recognized config/manifest/state JSON is excluded.
- A 64 MiB text artifact is eligible and a larger one is excluded; equivalent
  boundary tests cover each exact file, count, and batch cap. Limits cannot be
  bypassed by extension changes or batch splitting without revised authority.
- The protected manifest shows exact paths to an authenticated human. Its safe
  preview contains counts, byte totals, type/exclusion totals, hashes, and
  approval bindings but no root, relative path, content, secret, or credential.
- The human selects two of three eligible unchanged files. Only those two may
  import. Changing one after approval yields `skipped-changed`; a newly added
  fourth file is invisible to the permit.
- A protected file with a clean redacted derivative is automatically ingested
  without a second routine approval. A redaction failure creates quarantine
  metadata only, while unrelated selected files finish.
- Repeating, resuming, or concurrently waking the same approved batch creates
  at most one evidence item and occurrence for each selected identity.
- Losing the mount or destination stops the batch; an isolated corrupt DOCX
  marks only that entry terminal and safe siblings continue.
- Standard verification uses virtual or temporary fixtures only. It never reads
  the attached SSD, invokes the real redaction model, starts a live runtime,
  binds a socket, uses a credential, calls Mistral or another provider, sends a
  PRR, publishes, or performs another external effect.

## Allowed Scope

- `packages/ingestion/src/**` only for approved-boundary consumption, safe file
  opening/revalidation, media/config classification, immutable manifest and
  preview construction, exact batch approvals, streaming import, idempotency,
  terminal scheduling, protected readback, and Specification 16 integration.
- `packages/ingestion/test/**` for temporary/virtual traversal, classification,
  size, race, manifest, selection, mutation, partial completion, cancellation,
  resume, and no-fallback fixtures.
- `packages/ontology/src/contracts.ts` and focused tests only for the minimum
  structured scan/import approval and provenance binding required by existing
  events; do not add ontology truth behavior.
- `packages/agent/src/**` only for resident scan/import request construction,
  exact tool preview/binding, human-only approval, terminal scheduler handling,
  and safe progress projection.
- `packages/agent/test/**` for actor, approval, stale binding, selection,
  terminal replay, idempotency, and secret-safety tests.
- `packages/local-runtime/src/**` only for authenticated mounted scan, protected
  manifest readback, import preview/decision, run/cancel/resume, and dependency
  wiring through existing ingestion and approval services.
- `packages/local-runtime/test/**` for mounted route/authentication, replacement,
  protected readback, actor, scheduler, and no-external-effect tests.
- `package.json` and `package-lock.json` only when a bounded dependency is
  necessary for signature/office-format classification; do not add a provider
  or parsing service in this slice.
- Do not modify semantic text/image derivation, Mistral OCR, provider selection
  or credentials, ontology candidate/truth behavior, UI, PRR, legal, export,
  publication, destructive operations, or historical product-design material.

## Relevant Context Entry Points

- `AGENTS.md`
- `docs/agentic/software-factory.md`
- `.agents/skills/cestus-software-factory/SKILL.md`
- `docs/agentic/specifications/15-resident-source-boundary.md`
- `docs/agentic/specifications/16-on-device-secret-redaction.md`
- `packages/ingestion/src/local-filesystem.ts`
- `packages/ingestion/src/mount-contract.ts`
- `packages/ingestion/src/runtime.ts`
- `packages/ingestion/src/import-service.ts`
- `packages/ingestion/src/runtime.ts`
- `packages/ingestion/src/read-api.ts`
- `packages/agent/src/tool-gateway.ts`
- `packages/agent/src/scheduler.ts`
- `packages/local-runtime/src/ingestion-http-routes.ts`
- `packages/local-runtime/src/runtime-factory.ts`

## Risk Lane

Red. This slice reads human-approved source contents and creates durable
evidence. Exact import selection remains human-gated. Live SSD access and real
import remain separate human actions; implementation and verification may use
only synthetic fixtures.

## Targeted Verification

- `npm test -- packages/ingestion/test/approved-source-scan.test.ts packages/ingestion/test/approved-source-classification.test.ts packages/ingestion/test/approved-source-import.test.ts packages/ingestion/test/approved-source-import-terminality.test.ts`
- `npm test -- packages/agent/test/resident-source-import.test.ts packages/agent/test/scheduler.test.ts packages/agent/test/projection.test.ts`
- `npm test -- packages/ontology/test/contracts.test.ts`
- `npm test -- packages/local-runtime/test/agent-resident-source-import-routes.test.ts packages/local-runtime/test/ingestion-http-routes.test.ts packages/local-runtime/test/portable-workspace-lifecycle.test.ts`
- `npm run typecheck`
- `npm run ui:build`
- `npm run factory:check`

Success means every command exits zero and the named suites prove exact current
boundary authority, safe traversal/classification, selectable hash-bound import,
protected-file derivative-only storage, mutation rejection, partial terminality,
idempotent recovery, secret-safe surfaces, and zero live/external effects.

## Integration Verification

Build only after Specification 16 is integrated. Update the candidate normally
against latest `neo`, obtain a fresh Sol `ship` verdict on the final diff, then
run `npm run verify` once on the final merged candidate. Compare with the
current recorded baseline and latest `neo` CI; reject any new or worsened
failure. Integrate with normal Git history, push only configured `origin`,
observe CI, do not open a pull request, and do not force-push. Live SSD scanning
and import remain separately human-gated.

## Escalation Conditions

Escalate for a new media type, archive expansion, symlink or cross-mount
following, changed hard limits, content access without an approved boundary,
durable import without exact human selection, raw storage of a protected file,
fallback storage, live SSD access during build, provider/OCR/ontology behavior,
credential use, destructive or data-loss behavior, an unavailable required
dependency, or the same concrete failure surviving two focused repair attempts.
