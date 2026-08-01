# Preserve Software Factory Reference Articles

Status: approved.

## Desired Behavior

Preserve the two supplied software-factory articles byte-for-byte in Git with
an index that identifies them as optional, non-authoritative reference
material. Do not change Cestus product behavior or make the articles worker
instructions.

## Observable Acceptance Examples

- The ladder-thread snapshot hashes to
  `410f6df3e335f526cf84c92e4325e994119c52104e51adee4bece7db316950b8`.
- The long-form snapshot hashes to
  `3359d557c491f7ce1ee092084a60c4d740d563a447c3320a3358fa59ce8da223`.
- The index says the snapshots are non-authoritative and not ordinary-task
  reading.
- The candidate changes only the three source-material paths.

## Allowed Scope

Only `docs/agentic/references/source-material/README.md` and the two article
snapshots named there. No runtime, package, or product behavior changes.

## Relevant Context Entry Points

- Commit `f06735b3b26b7701842513d677b6589af7f92d8d`
- Parent `baab662fb6ecd79de9a34f1c3801aa76d3428848`
- `docs/agentic/references/source-material/README.md`

## Risk Lane

Green: documentation-only preservation with exact content hashes.

## Targeted Verification

Run `sha256sum` over both committed blobs and inspect
`git diff --stat f06735b3^ f06735b3`. Both hashes and the three-file scope must
match the acceptance examples.

## Integration Verification

Verify `f06735b3` remains a descendant of its stated parent. Run
`git diff --check f06735b3^ f06735b3 -- .` while excluding only the two
verbatim `.txt` snapshots, whose exact hashes are authoritative for preserved
whitespace. Then run `npm run factory:check` after the current factory contract
is present.

## Escalation Conditions

Stop on a hash mismatch, missing reference commit, altered source snapshot,
overlap on the three allowed paths, or any request to make the articles
authoritative. No routine approval is required.
