# Task 1: Selected Request PRR Read Model Context Pack

Plan path: `docs/superpowers/plans/2026-07-10-prr-jurisdiction-context-packs-implementation.md`
Task heading: `Task 1: Selected Request PRR Read Model Context Pack`
Worker identity: Codex
Branch: `codex/prr-context-pack-design`
Worktree path: `/home/drake/.codex/worktrees/3076/Cestus`
Claimed at UTC: `2026-07-10T22:10:35Z`
Status: `in-progress`

## Owned Files

- `packages/agent/src/prr-context-packs.ts`
- `packages/agent/test/prr-context-packs.test.ts`

## Evidence

- Red command: `npm test -- packages/agent/test/prr-context-packs.test.ts` failed as expected because `../src/prr-context-packs.js` did not exist.
- Green command: `npm test -- packages/agent/test/prr-context-packs.test.ts` passed: 1 test file, 5 tests.
- Full verification: `npm run verify` passed: typecheck and repository verification completed with exit code 0.
- Review fix verification: `npm test -- packages/agent/test/prr-context-packs.test.ts` passed with 8 tests; `npm run verify` passed after the provenance and citation hardening.
- Reverse-provenance verification: `npm test -- packages/agent/test/prr-context-packs.test.ts` passed with 10 tests; `npm run verify` passed after binding emitted hashes and evidence IDs to selected source refs.
- Trusted-source-ref verification: `npm test -- packages/agent/test/prr-context-packs.test.ts` passed with 11 tests; `npm run verify` passed after binding exact source-ref identities and correspondence body mappings into resolved provenance.

## Review

- Review status: fixes implemented; self-reviewed
- Concerns: none recorded
