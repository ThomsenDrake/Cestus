# Resident Source Boundary

Status: approved.

## Desired Behavior

A mounted workspace's resident Cestus Agent can prepare one human-selected
local source for later ingestion without reading file contents. The slice
creates a stable workflow, a protected metadata discovery artifact, one exact
protected boundary manifest, and an existing `human-review` approval or denial
for that boundary. It ends at the boundary decision. Scanning, content hashes,
import permits, raw evidence import, ontology proposals, and ontology truth are
separate later slices.

Each attempt has a stable `workflowId` bound to the mounted workspace, source
collection, source identity, selected source root, discovery artifact, boundary
manifest, and boundary approval request. Exact source roots and relative paths
exist only in authenticated mounted derivative storage and authenticated human
protected readback. Ordinary ledger events, resident events, diagnostics, and
safe previews contain only secret-safe identifiers, hashes, counts, byte totals,
file-type totals, and approval references.

An authenticated human selects the source root. Discovery uses directory
enumeration and filesystem metadata only: relative paths, regular-file type,
size, modification time, device, inode, and symlink status. It does not open a
file, hash file contents, expand an archive, parse evidence, invoke a provider,
or follow a symlink. It rejects traversal and out-of-root entries. The protected
discovery artifact is immutable and content-addressed; its public preview is
path-free and content-free.

The resident prepares an exact boundary proposal from that protected discovery.
Every discovered regular file is partitioned exactly once into included or
excluded relative paths. Omitted, duplicated, overlapping, undiscovered,
absolute, escaping, symlink, device, socket, or directory entries fail closed.
This slice supports archive policy `reject` only; archive files cannot be
included. The protected boundary manifest binds the workflow, workspace,
source collection, source identity, a secret-safe source-root hash, discovery
artifact and hash, exact included and excluded metadata, archive policy,
counts, byte totals, and a stable manifest hash.

The resident creates one `ingestion.source-boundary.approve` tool request using
the existing `human-review` approval class. Its durable structured binding
contains the workflow, workspace, source collection, source identity,
source-root hash, discovery artifact/hash, manifest artifact/hash, and safe
counts. The request contains no raw path. An authenticated human can review the
exact protected boundary and approve or deny that exact current preview through
the existing agent approval routes. The resident cannot approve or deny it. A
mismatched workflow, workspace, source, root hash, discovery, manifest, preview,
actor, duplicate decision, stale mount, or replaced derivative artifact creates
no authority.

Approval and denial are terminal for the exact request. Repeating an identical
human decision returns the existing terminal result or fails safely without a
second authority event. A denial creates no scan, permit, import approval,
blob, evidence item, occurrence, parse job, or completion event. Approval
authorizes only the later scanning slice; this slice exposes no scan, import,
run, resume, provider, or ontology-acceptance action.

Portable-workspace identity, append-only ledger behavior, projection
rebuildability, evidence provenance, secret safety, consume-time approval
validation, provider-byte-transfer approval, PRR-send gates, legal locks, and
no-fallback-write behavior remain unchanged.

## Observable Acceptance Examples

- A virtual fixture advertises `notes/finding.md`, `tables/rows.csv`,
  `settings.json`, and a symlink through metadata seams.
  The advertised files do not exist on disk, and any content-read, content-hash,
  archive, parser, or provider seam throws. Discovery still succeeds using only
  directory enumeration and `lstat`, excludes the symlink, stores exact metadata
  only in the mounted derivative artifact, and emits a path-free safe preview.
  A separate virtual directory entry that resolves outside the selected root is
  rejected before any protected artifact or ledger event is written.
- Protected discovery readback is unavailable without local-runtime
  authentication, to an agent actor, after workspace replacement, or when the
  derivative artifact does not belong to the mounted workspace. An authenticated
  human receives the exact relative-path metadata needed to review a boundary.
- A proposal includes `notes/finding.md` and `tables/rows.csv` and excludes
  `settings.json`. Omitting `settings.json`, including it and excluding it,
  adding an undiscovered path, selecting a symlink, or including `archive.zip`
  is rejected before an approval request is appended.
- The safe boundary preview contains the workflow ID, source identity,
  source-root hash, discovery and manifest hashes, file counts, and byte totals,
  but contains no source root, relative path, raw content, credential, or
  provider detail. The protected authenticated human review shows the exact
  include/exclude set.
- An agent approval or denial attempt is rejected. A human decision for another
  workflow, workspace, source identity, root hash, discovery artifact, manifest
  artifact, or preview hash appends no decision authority.
- Repeating the same authenticated human approval after an interrupted response
  creates at most one `agent.tool.approved` event. Approval followed by denial,
  denial followed by approval, or a second different human decision fails
  closed without changing the terminal decision.
- After either decision, there are no file-content reads, content hashes,
  scans, import permits, canonical import approvals, blobs, evidence items,
  occurrence links, parse jobs, imports, provider calls, or network effects.
- Standard verification uses temporary or virtual fixtures only and never reads
  the attached SSD, starts a live runtime, binds a socket, looks up a credential,
  invokes a provider, sends a PRR, publishes, or performs an external transfer.

## Allowed Scope

- `packages/ingestion/src/**` only for metadata-only discovery, protected
  discovery and boundary artifacts, canonical path confinement, immutable safe
  previews, and authenticated mounted readback.
- `packages/ingestion/test/**` for virtual metadata-only, traversal, symlink,
  exact partition, archive rejection, protected-storage, replacement, and
  no-fallback fixtures.
- `packages/ontology/src/contracts.ts` only for the minimum structured resident
  boundary binding required on the existing agent tool request, plus focused
  contract tests.
- `packages/agent/src/**` only for resident boundary request construction,
  exact current-preview validation, and reuse of the existing tool approval and
  denial gateway.
- `packages/agent/test/**` for focused structured-binding, non-human decision,
  stale/mismatched decision, terminal replay, and secret-safety tests.
- `packages/local-runtime/src/**` only for authenticated mounted discovery and
  protected discovery/boundary review and proposal composition. Reuse the
  existing agent approval and denial routes for the human decision; do not add a
  second decision path. No scan, import-run, or resume route may be added.
- `packages/local-runtime/test/**` for authenticated mounted workflow,
  actor-boundary, replacement, read-only/unavailable mount, protected readback,
  secret-safety, denial, terminal replay, and no-fallback fixtures.
- Reuse the existing mounted derivative store, `human-review` approval class,
  tool gateway, ledger, resident identity, authentication policy, and portable
  workspace composition. Do not add a generic approval service, ledger, blob
  store, scanner, scheduler, resident identity, or fallback storage path.
- Do not modify the ingestion import service, canonical import execution,
  scheduler execution, UI workflow presentation, ontology proposal or accepted
  truth, provider credentials or selection, provider transfer, PRR, legal,
  export, publication, destructive repair, or unrelated product-design
  references.
- Do not inspect or copy implementation from Specification 14's preserved
  candidate branch. Implement from the current `neo` contracts and this
  specification only.

## Relevant Context Entry Points

- `AGENTS.md`
- `docs/agentic/software-factory.md`
- `.agents/skills/cestus-software-factory/SKILL.md`
- `docs/agentic/specifications/02-portable-ingestion-evidence-corpus.md`
- `docs/agentic/specifications/07-resident-agent-mounted-task.md`
- `packages/ingestion/src/local-filesystem.ts`
- `packages/ingestion/src/mount-contract.ts`
- `packages/agent/src/tool-gateway.ts`
- `packages/agent/src/projection.ts`
- `packages/local-runtime/src/ingestion-http-routes.ts`
- `packages/local-runtime/src/http-handler.ts`
- `packages/local-runtime/src/runtime-factory.ts`

## Risk Lane

Red. This slice changes resident and human authority around local filesystem
metadata and protected path disclosure. Exact source-root selection and boundary
approval remain human-gated. Any content read, scan, live SSD access, import,
credential use, provider invocation, or external effect is outside this slice
and remains separately human-gated.

## Targeted Verification

- `npm test -- packages/ingestion/test/resident-source-boundary.test.ts packages/ingestion/test/local-filesystem.test.ts`
- `npm test -- packages/ontology/test/contracts.test.ts packages/agent/test/resident-source-boundary.test.ts packages/agent/test/resident-loop-tool-gateway.test.ts`
- `npm test -- packages/local-runtime/test/agent-resident-source-boundary-routes.test.ts packages/local-runtime/test/ingestion-http-routes.test.ts packages/local-runtime/test/portable-workspace-lifecycle.test.ts packages/local-runtime/test/agent-http-routes.test.ts`
- `npm run typecheck`
- `npm run ui:build`
- `npm run factory:check`

Success means the named suites prove metadata-only discovery, exact protected
partitioning, structured boundary authority, authenticated exact readback,
human-only approve/deny, terminal replay, mount replacement and no-fallback
rejection, secret-safe ordinary surfaces, and zero content, import, provider,
network, or external effects. Typecheck, build, and factory readiness must all
exit zero before review.

## Integration Verification

Update the candidate normally against the latest `neo`, obtain a fresh Sol
`ship` verdict on the final diff, then run `npm run verify` once on the final
merged candidate. Compare it with
`docs/agentic/baselines/2026-08-01-integration-verification.md` and the latest
`neo` CI; reject any new or worsened failure. Integrate only with normal Git
history. Push only configured `origin` and observe CI; do not open a pull
request or force-push.

## Escalation Conditions

Escalate for a source-root choice the human has not made, any content read or
hash before boundary approval, archive expansion, automatic or standing
boundary approval, unauthenticated exact-path disclosure, a new approval class,
fallback storage, live SSD access, scanning or import behavior, credentials or
provider access, external byte transfer, ontology truth changes,
PRR/legal/export/publication behavior, destructive migration or data loss, an
unavailable dependency, or the same concrete failure surviving two focused
repair attempts.
