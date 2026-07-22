# Task 117A: Runtime Handle Capture Freeze

Status: ready-for-review

Owner: Task117A contract author

Source plan:
`docs/superpowers/plans/2026-07-14-resident-agent-factory-authority-recovery-implementation.md`

<!-- task-117a-dispatch-v3:start -->
sourceBaseSha=f7652acecb25431ead8954e03f990b4e4d23f10f
freezeSha256=63bc52aa306f3da6bc58b9e91047c4a945111b25f5cc55eb1642241a3ba5e807
auditSha256=85f4ca5f2cd1c1397eeebf36bf29b93db36d1c326578be33086cc7cf217958ba
<!-- task-117a-dispatch-v3:end -->

## Scope

Amend only
`docs/agentic/resident-agent-full-vision-contract-freeze.md` with the two
Task117A-governed rows and their independent literal audit oracle. Preserve the
immutable dispatch block above byte-for-byte. Evidence may be appended below
after the claim-only dispatch commit.

## Authority

The exact intended freeze is coordinator-prepared outside the repository. Its
complete bytes and extracted authenticated audit are bound by the two hashes
above. The separately issued coordinator registry attestation is the external
dispatch trust root and will be pinned literally in the worker command.

## Evidence

- Awaiting the coordinator-issued attestation and worker RED/GREEN record.
- RED (causal): the byte-identical materialized `CESTUS_CF1R25_TASK117A` command, with its sole `COORDINATOR_ATTESTATION_SHA` token replaced by external attestation `1cde7adb1a3b9fb1621b75410c203eec631a45ba`, syntax-checked successfully (`SHA-256: f15730c33db21bc427eec991820eda0d25be17cbf85ae29e1563c94b9802199e`) and exited 1 before the freeze change. The source complete-freeze SHA-256 was `3cfe7507daac12090012518259d8246bc03ddd7b97aebe4a47895394185875b0`, which did not match pinned intended SHA-256 `63bc52aa306f3da6bc58b9e91047c4a945111b25f5cc55eb1642241a3ba5e807`; this is the required pinned-freeze-hash-mismatch RED.
- Intended complete-freeze SHA-256: `63bc52aa306f3da6bc58b9e91047c4a945111b25f5cc55eb1642241a3ba5e807`; extracted authenticated-audit SHA-256: `85f4ca5f2cd1c1397eeebf36bf29b93db36d1c326578be33086cc7cf217958ba`.
- GREEN command: `/tmp/cestus-task117a-d29cf3bb-command.sh` (the materialized CF-1R25 command above, including audit, `git diff --check`, `npm run factory:check`, and terminal authority revalidation).
- The coordinator-supplied exact diff adds only `CF1-R-MOUNTED-CAPTURE` and `W2-135D` to both governed matrices and their two literal `canonicalRows` entries to the independent audit; the audit directly rejects W ownership of each new row.
- GREEN (pre-commit): the same materialized command exited 0, ran the authenticated full-row `canonicalRows` audit (863 direct recomputed-hash counterfactual mutations rejected), `git diff --check`, `npm run factory:check` (`factory-readiness passed`), and its terminal authority revalidation. The complete freeze SHA-256 is `63bc52aa306f3da6bc58b9e91047c4a945111b25f5cc55eb1642241a3ba5e807`; its uniquely extracted audit SHA-256 is `85f4ca5f2cd1c1397eeebf36bf29b93db36d1c326578be33086cc7cf217958ba`.
- Contract inspection: the amendment adds `CF1-R-MOUNTED-CAPTURE` and `W2-135D` to both governed Markdown matrices and adds their two literal `canonicalRows` oracle entries. The audit directly mutates and rejects `W owns CF1-R-MOUNTED-CAPTURE` and `W owns W2-135D`, preserving R-only runtime-factory ownership.
