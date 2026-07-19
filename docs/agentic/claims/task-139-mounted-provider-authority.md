# Task139-PM — Mounted Provider Authority

## Claim

- Status: in-progress.
- Card: `Task139-PM`.
- Exact base: `c160f5ad5b1841a9e7b2ae23d410327592445143` (`docs: release Task139-P1 as record 17`).
- Branch: `codex/task139-pm-mounted-provider-authority`.
- Owned paths:
  - `packages/local-runtime/src/mounted-provider-authority.ts`
  - `packages/local-runtime/test/mounted-provider-authority.test.ts`
  - `docs/agentic/claims/task-139-mounted-provider-authority.md`
- Prerequisites: released `Task126-R`, `Task139-P1`, `Task135D`, `Task137A`, and `T120-R` under `task136-bounded-assurance-v4`.
- Contract authority: `docs/agentic/contracts/task136-bounded-assurance-v4.json`, the resident full-vision contract freeze, RV-1-C-134, RV-1-E-442, RV-1-E-444, RV-1-E-479, RV-1-E-545, and RV-1-E-752.

Task-scoped subagent-driven development and test-driven development are explicitly approved for this task.

## Frozen Role

Task139-P1 remains immutable, credential-free data and cannot mint mounted
authority. Task126-R keeps its private WeakSet reader factory as the trusted
injection seam. The released production import boundary permits no PM import,
re-export, loader, cast, or structural emulation of that factory. PM therefore
owns only the cycle-free, opaque mounted-provider locator staged from the exact
factory-issued mounted authority operation; a later composition owner may
consume the staged capability without treating P1 data or caller snapshots as
authority.

The staged locator must derive every readback from the current mounted runtime
and its durable ledger, bind the exact workspace, mount, admission generation,
policy, lock, and high-water facts, and fail closed after any stale, closed,
remounted, swapped, forged, copied, proxied, or conflicting state. It has no
provider invocation, network/DNS/socket access, credential or secret access,
OAuth, ledger/config mutation, fallback, default-factory edit, process-global
registration, or other external effect.
