# Central Florida ICE Legacy Engineering Preview Claim

- Design: `docs/superpowers/specs/2026-07-27-central-fl-ice-engineering-preview-design.md`
- Plan: `docs/superpowers/plans/2026-07-27-central-fl-ice-engineering-preview-implementation.md`
- Mission level: Level 2 bounded feature; dual fresh review required at durable/provenance/human-gate boundaries
- Owner: `/root`
- Branch: `codex/central-fl-ice-engineering-preview`
- Worktree: `/home/drake/Projects/Cestus/.worktrees/central-fl-ice-engineering-preview`
- Exact base: `dc05c43c4b9a592d0396acd034bfc32e177fd09a`
- Status: claimed

## Scope

Deliver the independent Central Florida ICE legacy engineering preview specified in the initiating prompt. Reuse existing portable workspace, importer, ontology bootstrap, evidence triage, and investigation planner contracts. Add only preview-specific development code/tests plus a verifier-only evidence-triage fixture repair.

The Wave 0–5 production program, Task136 runtime-factory/wake-supervisor/bounded-loop files, record 29, production routes, daemons, automatic triggers, accepted graph, pack promotion, PRR send, legal escalation, portal crawl, publication, destructive actions, and other worktrees are outside this claim.

## Safety Identity

- Source: `/mnt/cestus_legacy_ssd/Cestus/central-fl-ice-workspace`
- Source mount: `/dev/sda2` at `/mnt/cestus_legacy_ssd`, APFS
- Required options observed before implementation: `ro,nosuid,nodev,noexec,uid=1000,gid=1000`
- Destination: `/home/drake/.local/share/cestus/previews/central-fl-ice-engineering-preview`
- Destination parent observed before implementation: internal `/dev/nvme0n1p2[/@home]`, Btrfs, read-write
- Initial destination collision: absent
- Source/destination filesystem device IDs: distinct

No destination workspace has been created at claim time.

## Baseline Verification

Command:

```bash
TMPDIR=/dev/shm npm test -- \
  packages/ingestion/test/legacy-inspector.test.ts \
  packages/ingestion/test/legacy-report.test.ts \
  packages/ingestion/test/legacy-runtime.test.ts \
  packages/ingestion/test/legacy-staging.test.ts \
  packages/ontology-bootstrap/test/dossier-builder.test.ts \
  packages/ontology-bootstrap/test/fake-runtime.test.ts \
  packages/agent/test/evidence-triage-workflow.test.ts \
  packages/agent/test/investigation-planner-workflow.test.ts
```

Result on exact base: 8 files executed, 7 passed and 1 failed; 97 tests executed, 90 passed and 7 failed. All failures are in `evidence-triage-workflow.test.ts` at the same fail-closed `prepareSpecialistRun` check because the fixture does not supply the current mounted production prompt readback witness. Git history shows the witness requirement entered in the mounted preapproval prompt work while this fixture was not updated. No runtime fix has been attempted.

## Durable Transitions

- `claimed`: worktree and exact remote base verified; design, plan, mission level, owned files, gates, and safety identity recorded.

## Owned Files

- `docs/superpowers/specs/2026-07-27-central-fl-ice-engineering-preview-design.md`
- `docs/superpowers/plans/2026-07-27-central-fl-ice-engineering-preview-implementation.md`
- `docs/agentic/claims/central-fl-ice-engineering-preview.md`
- `packages/ingestion/src/central-fl-ice-preview.ts`
- `packages/ingestion/src/central-fl-ice-preview-cli.ts`
- `packages/ingestion/test/central-fl-ice-preview.test.ts`
- `packages/agent/test/evidence-triage-workflow.test.ts` (verifier-only fixture edit)
