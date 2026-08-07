# Descriptor-Confined Source Scan And Immutable Manifest

Status: approved.

## Desired Behavior

Cestus converts one current Specification 15 source boundary into one
immutable scan manifest and provides the descriptor-confined observation port
used by later import specifications. It does not approve a selection, store
evidence, redact content, derive text/images, invoke a resident/provider, or
alter ontology truth.

A current human-approved Specification 15 boundary is mandatory before any
content open. The scan binds the workspace, source collection, canonical root,
boundary revision, device identity, mount ID, root inode, mount namespace, and
protected discovery artifact. Cestus opens and pins the approved root
descriptor, then revalidates every binding against that descriptor. A missing,
stale, replaced, unmounted, remounted, or mismatched root fails before
traversal. The resident may request a new boundary but cannot create or approve
one.

All traversal and file opens are descriptor-relative. Linux `openat2` is
required with `RESOLVE_BENEATH`, `RESOLVE_NO_SYMLINKS`,
`RESOLVE_NO_MAGICLINKS`, and `RESOLVE_NO_XDEV`. Directories and files use
no-follow, close-on-exec descriptors. There is no string-path reopen or
portability fallback. Absence or failure of the required kernel enforcement
makes scanning unavailable.

Symlinks, magic links, bind/nested mounts, devices, sockets, FIFOs, and
non-regular files are metadata-only exclusions. A regular file whose link
count is greater than one is also metadata-only and is never opened. Invalid
UTF-8 names and Unicode/case-normalization collisions are excluded without
content access.

A checked-in, versioned pathname table excludes before content open:
version-control/IDE state, dependencies/vendors, caches, build output,
temporary/trash directories, package manifests/lockfiles, recognized
application/runtime state, recognized configuration filenames/extensions,
archives/containers other than bounded DOCX/XLSX, executable/script artifacts,
unsupported extensions, and stat-only over-limit entries. Each table entry is
an exact basename, component, suffix, or mode/signature-independent rule with
focused fixtures; implementation may not add heuristic wildcard exclusions.
Protected `.env`/`.env.*` leaf names are the sole configuration-path exception.

Excluded and over-limit entries receive safe path/stat metadata and a fixed
reason only. They are never opened, hashed, signature-sniffed, parsed,
committed, or passed to a model.

Candidates are limited to:

- `.md`, `.markdown`, `.txt`, `.csv`, and `.tsv`;
- `.pdf`, `.docx`, and `.xlsx`;
- `.png`, `.jpg`, `.jpeg`, `.webp`, `.heic`, `.heif`, `.tif`, and `.tiff`;
- `.json`; and
- protected `.env` and `.env.*` exceptions.

Extension, signature, encoding, and structure must agree. Mismatch is excluded,
not guessed. Plain text, Markdown, CSV, and TSV require valid UTF-8 with an
optional UTF-8 BOM. CSV/TSV must parse consistently with the extension's
delimiter and bounded row/field rules.

PDF requires a bounded valid PDF structure. Encryption/password protection,
embedded-file containers, active launch/JavaScript actions, malformed
cross-reference structures, and trailing polyglots are excluded. DOCX/XLSX
must be bounded valid OOXML ZIP packages with required content types and parts.
OOXML rejects encryption, macros, executable payloads, traversal names, links,
duplicate/colliding entries, overlapping ranges, undeclared parts, excessive
entries/expansion, and unsupported external content.

Images require a matching supported signature and bounded metadata decode.
Animated WebP/HEIF and malformed or decompression-over-limit images are
excluded. Multipage TIFF is an image document, not animation. SVG, GIF,
archives, and generic ZIP are excluded.

Recognized JSON configuration paths are excluded before open. Remaining JSON
uses duplicate-key rejection and strict size/depth/node limits. Private or
symmetric JWK/JWKS is protected for Specification 18; public-only JWK/JWKS is
ordinary. Arrays and explicit export envelopes are ordinary content
candidates. Standalone content objects are eligible as `review-required` and
never preselected. Their preview summary contains only structural counts/types
and recognized-envelope information, never values or credential-like content.
Malformed or structurally ambiguous JSON is excluded.

Initial limits are:

- 64 MiB per text, tabular, or ordinary JSON artifact;
- 1 MiB per protected `.env` or private JWK/JWKS;
- 256 MiB per PDF or OOXML document;
- 512 MiB per image;
- 100,000 discovered directory entries; and
- 50 GiB total eligible bytes represented by one manifest.

The checked-in classification policy additionally specifies exact OOXML entry,
expanded-byte, member, and compression-ratio caps and exact image dimension,
decoded-pixel, frame/page, and metadata caps. Changing a cap is a product
boundary change. Exceeding the global entry/byte cap makes the manifest
incomplete and therefore unapprovable; traversal cannot silently truncate
authority.

After a candidate passes stat-only checks, Cestus opens it exactly once through
the pinned root. Classification and digest/commitment consume the same bounded
stream between checked pre-read and post-read descriptor identities. The read
must reach EOF with the expected byte count. Device, mount, inode, type, size,
modification time, change time, and available generation/version fields must
remain equal.

Ordinary observations receive SHA-256 over the observed bytes. Protected
observations receive only Specification 16's nonce-bound commitment; Cestus
does not create a public plain hash for protected bytes. If an individual file
changes during observation, its content-derived result is discarded and the
entry becomes `changed-during-scan`; scanning continues. A root, mount,
boundary, or confinement change invalidates the entire manifest.

At consume time, a later import requests one exact manifest entry through this
specification. Cestus opens it once under the same confinement, repeats all
authority/stat/classification checks, and streams from that descriptor only.
Ordinary bytes flow onward without a full-buffer requirement. Protected bytes
remain within the 1 MiB bound, verify the manifest commitment, and pass from
the same observation directly to Specification 18. Downstream publication
cannot complete until EOF, byte count, post-read identity, classification, and
manifest digest/commitment all match. A changed or missing source is a terminal
per-entry exception; the same attempt never reopens the path to try again.

Manifest entries are ordered by normalized relative-path bytes. Each contains
fixed-version safe path identity, source/stat identity, detected type, size,
eligibility/reason, review requirement, and an ordinary digest or protected
commitment. Excluded entries contain no content-derived identifier. The
manifest uses a versioned canonical serialization with fixed field order,
integer encoding, Unicode rules, and entry ordering, then receives a SHA-256
identity.

The manifest is append-only and immutable. It cannot gain entries, change a
classification, or expand selection. Specification 20 may attach exactly one
terminal decision: rejection or approval of one exact subset. Additional files
require a new scan and manifest. Concurrent creation of the same manifest is
idempotent; conflicting identity reuse fails closed.

## Observable Acceptance Examples

- A missing, denied, stale, replaced, remounted, or agent-approved-only
  Specification 15 boundary permits no directory or content open.
- `openat2` flag capture proves every traversal/consume open uses the required
  resolution flags. Missing kernel support has no path-based fallback.
- Fixture symlinks, magic links, nested mounts, hard links, devices, sockets,
  FIFOs, invalid names, and normalization collisions produce metadata-only
  exclusions and no content-open observation.
- Known config, `.git`, `node_modules`, cache, lockfile, archive, executable,
  unsupported, and over-limit fixtures are never opened, signature-read,
  hashed, or parsed. A protected `.env` leaf remains a narrow exception.
- Every admitted extension has matching signature/structure fixtures; mismatch,
  invalid encoding/delimiters, active/encrypted/polyglot PDF, malicious OOXML,
  animated/decompression-bomb image, generic ZIP, SVG, and GIF are excluded.
- JSON arrays/exports are ordinary, standalone content objects are
  `review-required`, known config is pre-open excluded, private JWK/JWKS is
  protected, and public-only JWK/JWKS is ordinary.
- A changed file becomes `changed-during-scan` while stable siblings remain in
  the manifest. Root, mount, boundary, or confinement replacement invalidates
  the entire result.
- Consume-time mutation, truncation, growth, inode replacement, EOF/count
  mismatch, or classification/digest/commitment mismatch prevents downstream
  publication without a second path open.
- Repeated stable scans yield canonical entry ordering and serialization.
  Entry/global cap overflow produces an incomplete, unapprovable manifest.
- Standard verification uses synthetic temporary/virtual trees and injected
  syscall adapters. It does not read the attached SSD, create evidence, use a
  credential, run a model, invoke a provider, bind a socket, send a PRR, or
  publish.

## Allowed Scope

- `packages/ingestion/src/**` only for approved-root descriptor binding,
  confined traversal/observation, pre-open pathname policy, deterministic
  format classification, bounded streaming digest/commitment, canonical
  immutable manifests, and the consume-time observation port.
- `packages/ingestion/test/**` for injected syscall/confinement, virtual tree,
  exclusion/no-open, classification, malicious container, cap, mutation,
  manifest, and consume-time fixtures.
- `packages/local-runtime/src/**` only for authenticated mounted scan request,
  protected human manifest readback, safe resident projection, and injected
  platform adapter wiring.
- `packages/local-runtime/test/**` for boundary/root binding, actor/readback,
  unavailable-platform, secret-safe projection, and zero-live-effect tests.
- `package.json` and `package-lock.json` only for one bounded syscall binding or
  deterministic format classifier justified by this specification.
- Do not modify import-selection approval, evidence storage, scheduler
  terminality, redaction policy/runtime, local derivatives, provider/OCR
  behavior, resident candidate extraction, ontology truth, UI, PRR, legal,
  export, publication, destructive operations, or historical product-design
  material.

## Relevant Context Entry Points

- `AGENTS.md`
- `docs/agentic/software-factory.md`
- `.agents/skills/cestus-software-factory/SKILL.md`
- `docs/agentic/specifications/15-resident-source-boundary.md`
- `docs/agentic/specifications/16-secret-commitment-backend.md`
- `docs/agentic/specifications/18-protected-secret-redaction.md`
- `packages/ingestion/src/local-filesystem.ts`
- `packages/ingestion/src/mount-contract.ts`
- `packages/ingestion/src/runtime.ts`
- `packages/ingestion/src/read-api.ts`
- `packages/local-runtime/src/ingestion-http-routes.ts`
- `packages/local-runtime/src/runtime-factory.ts`

## Risk Lane

Red. A live scan reads source content within one approved boundary. Boundary
approval remains the exact human gate; build verification may use only
synthetic/virtual trees and must not inspect the attached SSD.

## Targeted Verification

- `npm test -- packages/ingestion/test/descriptor-confined-scan.test.ts packages/ingestion/test/source-path-policy.test.ts packages/ingestion/test/source-classification.test.ts packages/ingestion/test/source-manifest.test.ts packages/ingestion/test/source-observation-consume.test.ts`
- `npm test -- packages/local-runtime/test/agent-resident-source-scan-routes.test.ts packages/local-runtime/test/portable-workspace-lifecycle.test.ts`
- `npm run typecheck`
- `npm run ui:build`
- `npm run factory:check`

Success means every command exits zero and proves current boundary/root
authority, required Linux descriptor confinement, no-open exclusions, exact
bounded classification, single-descriptor observation, per-entry/root mutation
semantics, protected commitment handling, canonical immutable manifests, and
zero live SSD/evidence/provider effects.

## Integration Verification

Build only after Specifications 16 and 18 are integrated. Update the candidate
normally against latest `neo`, obtain a fresh Sol `ship` verdict on the final
diff, then run `npm run verify` once on the final merged candidate. Compare with
the current recorded baseline and latest `neo` CI; reject any new or worsened
failure. Integrate with normal Git history, push only configured `origin`,
observe CI, do not open a pull request, and do not force-push. Live SSD scanning
remains a separately human-gated action under the approved source boundary.

## Escalation Conditions

Escalate for a new media type, archive expansion, hard-link acceptance,
symlink/magic-link/cross-mount following, a path-based confinement fallback,
changed limits or pathname policy, content access without current boundary
authority, public hashing of protected content, live SSD access during build,
evidence/provider/ontology behavior, an unavailable required platform/parser
capability, or the same concrete failure surviving two focused repair attempts.
