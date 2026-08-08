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

The approved boundary's exact `included` set is authoritative. Before every
candidate content open, including consume-time reopen, Cestus proves membership
of the normalized path identity in that set and absence from its exact human-
excluded set. A human-excluded path may receive only the boundary's already-
authorized safe metadata; it is never opened, sniffed, hashed, parsed, or
committed even when its extension would otherwise be eligible.

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

The initial exact table is serialized as
`packages/ingestion/policy/source-classification-policy.v1.json`; its hash is
part of every scan attempt/manifest. It contains only these version-one rules:

- excluded component basenames: `.git`, `.hg`, `.svn`, `.idea`, `.vscode`,
  `.cestus`, `node_modules`, `vendor`, `bower_components`, `.cache`, `cache`,
  `__pycache__`, `.pytest_cache`, `.mypy_cache`, `.ruff_cache`, `.tox`, `.nox`,
  `.venv`, `venv`, `dist`, `build`, `out`, `target`, `coverage`,
  `.nyc_output`, `tmp`, `temp`, `.tmp`, `.Trash`, `$RECYCLE.BIN`, and
  `System Volume Information`;
- excluded leaf basenames: `package.json`, `package-lock.json`, `yarn.lock`,
  `pnpm-lock.yaml`, `bun.lock`, `bun.lockb`, `Cargo.toml`, `Cargo.lock`,
  `go.mod`, `go.sum`, `pyproject.toml`, `poetry.lock`, `Pipfile`,
  `Pipfile.lock`, `requirements.txt`, `Gemfile`, `Gemfile.lock`,
  `composer.json`, `composer.lock`, `tsconfig.json`, `jsconfig.json`,
  `config.json`, `settings.json`, `credentials.json`, `secrets.json`,
  `service-account.json`, `manifest.json`, `launch.json`, `tasks.json`,
  `.editorconfig`, `.gitignore`, `.gitattributes`, `.npmrc`, `.yarnrc`,
  `.pypirc`, `.netrc`, `Dockerfile`, `docker-compose.yml`,
  `docker-compose.yaml`, `Makefile`, and `CMakeLists.txt`;
- excluded leaf rules: every dot-prefixed leaf except `.env` and `.env.*`;
  suffixes `.yaml`, `.yml`, `.toml`, `.ini`, `.cfg`, `.conf`, `.config`,
  `.xml`, `.properties`, `.lock`, `.log`, `.tmp`, `.temp`, `.swp`, `.swo`,
  `.bak`, `.zip`, `.tar`, `.gz`, `.tgz`, `.bz2`, `.xz`, `.7z`, `.rar`,
  `.iso`, `.dmg`, `.exe`, `.dll`, `.so`, `.dylib`, `.bin`, `.appimage`,
  `.msi`, `.deb`, `.rpm`, `.apk`, `.jar`, `.class`, `.wasm`, `.sh`,
  `.bash`, `.zsh`, `.fish`, `.ps1`, `.bat`, `.cmd`, `.py`, `.js`, `.jsx`,
  `.ts`, `.tsx`, `.rb`, `.php`, `.pl`, and `.lua`; and terminal suffix `~`.

The machine-readable table must equal this list after canonical serialization;
it may not add a name, prefix, suffix, glob, signature, or heuristic during
implementation.

Excluded and over-limit entries receive safe path/stat metadata and a fixed
reason only. They are never opened, hashed, signature-sniffed, parsed,
committed, or passed to a model.

Candidates are limited to:

- `.md`, `.markdown`, `.txt`, `.csv`, and `.tsv`;
- `.pdf`, `.docx`, and `.xlsx`;
- static `.png`, `.jpg`, `.jpeg`, and `.webp`;
- `.json`; and
- protected `.env` and `.env.*` exceptions.

Extension, signature, encoding, and structure must agree. Mismatch is excluded,
not guessed. Plain text, Markdown, CSV, and TSV require valid UTF-8 with an
optional UTF-8 BOM. CSV/TSV must parse consistently with the extension's
delimiter and bounded row/field rules.

PDF requires a bounded valid PDF structure and records an exact locally
validated page count for later OCR planning. Encryption/password protection,
embedded-file containers, active launch/JavaScript actions, malformed
cross-reference structures, and trailing polyglots are excluded. DOCX/XLSX
must be bounded valid OOXML ZIP packages with required content types and parts.
OOXML rejects encryption, macros, executable payloads, traversal names, links,
duplicate/colliding entries, overlapping ranges, undeclared parts, excessive
entries/expansion, and unsupported external content. Classification inventories
every supported embedded raster by parent entry, package part URI,
relationship identity, media type, byte count, and SHA-256. Unsupported,
malformed, encrypted, animated, excessive, or uninventoryable embedded media
makes the parent unselectable; embedded images cannot be silently omitted from
later mandatory OCR.

Images require a matching supported signature and bounded metadata decode.
Animated WebP and malformed or decompression-over-limit images are excluded.
HEIC, HEIF, TIFF, BMP, AVIF, SVG, GIF, archives, and generic ZIP are excluded
in version one so every selectable image uses Specification 23's exact inline
OCR transport allowlist.

Recognized JSON configuration paths are excluded before open. Remaining JSON
is subject to one enforceable 1 MiB stat cap before open and uses duplicate-key
rejection and strict depth/node limits. Private or
symmetric JWK/JWKS is protected for Specification 18; public-only JWK/JWKS is
ordinary. Arrays and explicit export envelopes are ordinary content
candidates. Standalone content objects are eligible as `review-required` and
never preselected. Their preview summary contains only structural counts/types
and recognized-envelope information, never values or credential-like content.
Malformed or structurally ambiguous JSON is excluded.

Initial byte/page limits use decimal provider-facing bytes where stated:

- 64 MiB per text or tabular artifact;
- 1 MiB per JSON artifact, whether ordinary or protected;
- 1 MiB per protected `.env`;
- 50,000,000 bytes and 1,000 pages per PDF;
- 256 MiB per OOXML document;
- 20,000,000 bytes per static image;
- 100,000 discovered directory entries; and
- 50 GiB total eligible bytes represented by one manifest.

CSV/TSV additionally permits at most 1,000,000 logical rows, 16,384 columns,
10,000,000 cells, 1 MiB decoded UTF-8 bytes per field, and 8 MiB per physical
record. Ordinary JSON permits depth 32, 10,000 total nodes, and 1 MiB decoded
UTF-8 bytes per string. PDF permits at most 2,000,000 indirect objects, 256
cross-reference sections, page-tree depth 128, object/array nesting depth 256,
10,000 objects per object stream, 64 MiB decoded bytes per stream, 512 MiB
aggregate decoded stream bytes, and 100:1 per-stream and aggregate compression
ratios. A parser cannot substitute a larger library default.

OOXML permits at most 10,000 ZIP members, 1 GiB total expanded bytes, 256 MiB
per non-raster member, 64 MiB central-directory bytes, 100:1 per-member and
aggregate compression ratios, 16 MiB per XML part, XML depth 64, 256 attributes
per element, 8 MiB per text node, and 100,000 relationships. Images permit
width/height at most 32,768 pixels, 100,000,000 decoded pixels, one frame,
400 MiB decoded RGBA bytes, and 8 MiB metadata. These values and the pathname
table are the complete initial machine-readable policy. Changing one is a
product boundary change. Exceeding the global entry/byte cap makes the manifest
incomplete and therefore unapprovable; traversal cannot silently truncate
authority.

An OOXML parent additionally permits at most 1,000 embedded raster children,
64 MiB compressed/member bytes per child, and 512 MiB total embedded raster
bytes. Every child also passes the standalone image signature, dimension,
pixel, frame, and metadata policy. Child bytes and hashes are consumed from the
same parent descriptor observation used for package classification.

After a candidate passes approved-included membership and stat-only checks,
Cestus opens it exactly once through
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

The full manifest, including normalized relative paths, remains only in
protected mounted derivative storage with authenticated human readback. It has
an internal RFC 8785 canonical SHA-256 identity that never leaves that protected
surface. The protected canonical manifest and each protected canonical entry
are UTF-8 RFC 8785 bytes with no BOM or trailing LF; the full manifest also
uses normalized-relative-path byte ordering. At manifest creation Cestus also
generates one random 256-bit public manifest ID and one random 256-bit public
entry ID per entry. It calls Specification 16's non-exporting
`source-manifest-authority.v1` profile, never a generic commitment operation:
the manifest frame carries record class `manifest`, workspace/source/boundary,
the raw canonical-policy SHA-256, public manifest ID, and exact protected
canonical manifest bytes; each entry frame carries record class `entry`, those
same workspace/source/boundary/policy/manifest bindings, its public entry ID,
and exact protected canonical entry bytes. Public IDs and keyed commitments,
not raw hashes of path-bearing data, are used in ordinary bindings. Guessing a
path therefore cannot be verified without the workspace key. Ordinary ledger
events, diagnostics, resident projections, and logs expose only those opaque
path-free IDs/commitments, aggregate counts, and safe reasons.
Protected manifest entries are ordered by normalized relative-path bytes. Each
contains fixed-version safe path identity, source/stat identity, detected type, size,
eligibility/reason, review requirement, and an ordinary digest or protected
commitment. An OOXML entry also contains its ordered embedded-raster child
inventory and child-manifest hash. Excluded entries contain no content-derived identifier. The
manifest receives its protected SHA-256 identity. The public manifest/entry
commitments are exactly the Specification 16
`source-manifest-authority.v1` profile records above. Raw paths, protected
SHA-256 identities, and unkeyed path-derived hashes never enter an ordinary
preview, event, projection, diagnostic, log, or resident surface.

Each explicit scan request first conditionally claims one durable scan-attempt
identity bound to boundary/root/policy. Only its lease holder may observe an
entry. Before opening any candidate content, it reserves that entry's final
random public ID and, for a protected entry, its observation nonce in the
protected manifest draft, flushes the draft and directory, and advances the
lease only after the reservation is durable. The content open must reuse that
reserved identity/nonce. After EOF and validation, the result is separately
checkpointed and flushed before the lease advances; a crash between reservation
and result can resume only with the same nonce and exact descriptor observation,
never by allocating a replacement nonce. Completed per-entry results are
durably checkpointed in the protected manifest draft before the lease advances.
Identical replay returns that attempt's existing result; concurrent or
conflicting reuse fails before a second authoritative observation. A new scan
request uses a new attempt identity and therefore may create fresh protected
nonces.

The manifest is append-only and immutable. It cannot gain entries, change a
classification, or expand selection. Specification 20 may attach exactly one
terminal decision: rejection or approval of one exact subset. Additional files
require a new scan and manifest. Concurrent creation of the same manifest is
idempotent; conflicting identity reuse fails closed.

## Observable Acceptance Examples

- A missing, denied, stale, replaced, remounted, or agent-approved-only
  Specification 15 boundary permits no directory or content open.
- A path present under the root but absent from the human-approved `included`
  set, or present in the human-excluded set, remains metadata-only during scan
  and consume even when it has an eligible extension.
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
- PDF fixtures record deterministic page counts without extracting competing
  local text; malformed or excessive page trees are excluded.
- JSON arrays/exports are ordinary, standalone content objects are
  `review-required`, known config is pre-open excluded, private JWK/JWKS is
  protected, and public-only JWK/JWKS is ordinary.
- An OOXML fixture with supported embedded rasters records every exact child;
  unsupported, excessive, mismatched, or omitted child media makes the parent
  unselectable.
- A changed file becomes `changed-during-scan` while stable siblings remain in
  the manifest. Root, mount, boundary, or confinement replacement invalidates
  the entire result.
- Consume-time mutation, truncation, growth, inode replacement, EOF/count
  mismatch, or classification/digest/commitment mismatch prevents downstream
  publication without a second path open.
- Repeated stable scans yield canonical entry ordering and serialization.
  Entry/global cap overflow produces an incomplete, unapprovable manifest.
- Dictionary guesses against known relative paths cannot reproduce any public
  manifest/entry commitment without the injected workspace key; ordinary
  preview/event/log captures contain no protected SHA-256 or path-derived hash.
- Manifest and entry fixtures use Specification 16's named closed profile and
  exact frame branches. A generic profile, wrong record class, policy hash,
  public manifest/entry ID, or canonical protected bytes fails without a path
  or protected SHA-256 reaching an ordinary surface.
- Duplicate/concurrent wakes for one scan-attempt identity reuse checkpointed
  protected nonces/results and produce one manifest; conflicting reuse performs
  no second content observation.
- Crash injection after durable nonce reservation, after content open, and
  before/after result flush proves resume reuses the reserved nonce and never
  performs a second authoritative observation with a replacement nonce.
- Standard verification uses synthetic temporary/virtual trees and injected
  syscall adapters. It does not read the attached SSD, create evidence, use a
  credential, run a model, invoke a provider, bind a socket, send a PRR, or
  publish.

## Allowed Scope

- `packages/ingestion/src/**` only for approved-root descriptor binding,
  confined traversal/observation, pre-open pathname policy, deterministic
  format classification, bounded streaming digest/commitment, canonical
  immutable manifests, and the consume-time observation port.
- `packages/ingestion/policy/source-classification-policy.v1.json` only for the
  exact canonical pathname/container/image cap table stated here.
- `packages/ingestion/test/**` for injected syscall/confinement, virtual tree,
  exclusion/no-open, classification, malicious container, cap, mutation,
  manifest, scan-attempt fencing, path privacy, and consume-time fixtures.
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
