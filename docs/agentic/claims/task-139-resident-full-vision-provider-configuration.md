# Task139-P1 — Resident Full-Vision Provider Configuration

## Claim

- Status: in-progress.
- Card: `Task139-P1`.
- Exact base: `0ba731d3845706dcb0fc0cf0f47726c9d7229e55`.
- Branch: `codex/task139-p1-provider-configuration`.
- Worktree: `/home/drake/.codex/worktrees/e06e/Cestus`.
- Authority: `docs/superpowers/plans/2026-07-12-resident-agent-provider-credentials-implementation.md`, `docs/agentic/contracts/task136-bounded-assurance-v4.json`, and `docs/agentic/resident-agent-full-vision-contract-freeze.md`.
- Owned paths:
  - `packages/local-runtime/src/agent-provider-configuration.ts`
  - `packages/local-runtime/test/agent-provider-configuration.test.ts`
  - `docs/agentic/claims/task-139-resident-full-vision-provider-configuration.md`

Task-scoped subagent-driven development and test-driven development are explicitly approved for this task.

## Frozen Scope

P1 is credential-free, data-only configuration normalization. It must not mint,
export, or structurally emulate the Task126 current-posture reader or any
mounted authority; Task139-PM solely owns that later mounted-authority adapter.
It performs no provider/network call, secret resolution, ledger or portable
write, factory mutation, process-global registration, readiness authority mint,
or fallback.

## GREEN Evidence

- The preserved causal RED commit `92423e6d85f3e70ec1ba961afa34b7af1be28e8f`
  failed solely because this production module was absent.
- Coordinator-adjudicated GREEN-only fixture corrections replace the one
  credential-marker safe label and three credential-marker source-event IDs
  with secret-safe equivalents. The intentionally secret-bearing
  `Bearer secret value` rejection remains unchanged.
- `npm test -- packages/local-runtime/test/agent-provider-configuration.test.ts`
  passed: 1 file / 4 tests. The configuration result is immutable data only and
  validates exact capability, credential-reference, endpoint-policy, current
  feasibility, model-scope, lane, provenance, and hostile-shape constraints.

## Authorized Repair RED

- Coordinator authorization: one causal repair RED followed by one minimal
  repair GREEN, preserving candidate `8aed2a4c32d4d38de8e3ad6ab1a7ca1374905884`
  and all earlier history.
- Production source remained byte-identical in RED:
  `167ccc7fdcaa1c52202c3a606bdc15dd4e95bd0b` both at `HEAD` and in the
  worktree.
- The focused command `npm test --
  packages/local-runtime/test/agent-provider-configuration.test.ts` failed
  causally with 1 failed file / 6 failed and 3 passed tests. The six failures
  prove the candidate admitted an extra unassessed model, unrelated feasibility
  provenance, `wss://10.0.0.1/socket` data-handling material, a missing BYOK
  transfer-approval diagnostic, an extra local API-key requirement, and lax
  official-harness classifications.
- Typed fixture helpers remove all focused-test TypeScript diagnostics. The RED
  `npm run typecheck` output contains only the two known production narrowing
  diagnostics in `agent-provider-configuration.ts`.

## Authorized Repair GREEN

- The sole repair keeps P1 data-only and introduces no reader, mounted
  authority, provider call, network call, credential dereference, or durable
  mutation.
- It uses credential schemas and typed hash/event predicates for the two
  production narrowing repairs, without casts, assertions, suppressions, or API
  widening.
- It requires one capability model per exact feasibility model, one-to-one
  capability/reference/policy/feasibility cardinality, deterministic exact
  provenance, URI/IP-safe capability text, canonical OpenAI-compatible BYOK,
  canonical local-engine, and canonical official-harness facts.
- `npm test -- packages/local-runtime/test/agent-provider-configuration.test.ts`
  passed: 1 file / 9 tests. `npm run typecheck` passed.

## RV-1-E-732 Recovery RED

- Coordinator recovery authority: `RV-1-E-732` at program
  `7cea1f2c889ab213f92886d61826dffe22553cc7`. The preserved candidate base
  is `d3abf6122c9430ae8e2a9fa2c9da4c345701b4a5`; this recovery remains limited
  to this claim, the Task139-P1 focused test, and its production source.
- The RED changes only this claim and the focused test. The production source
  blob remained byte-identical to the candidate before and after the RED:
  `3e7f45f215d553ae33886c4258a6cd1af94b84c0`.
- Released Task129/Task130 harness interfaces require either
  `subscription-oauth` or `device-code-oauth` with
  `harness-execution`; BYOK and local facts retain exact
  `model-inference` scope. The typed RED fixtures also cover the anchored
  `provider_openai_codex_<suffix>` and `provider_xai_<suffix>` families,
  representative `provider_openai_codex_primary` and `provider_xai_grok`
  identities, and lookalike rejection.
- The exact focused command `npm test --
  packages/local-runtime/test/agent-provider-configuration.test.ts` exited
  `1` with **1 failed file / 5 failed and 9 passed tests (14)**. The five
  causal failures were the updated official-harness positive exception, both
  released provider-family/OAuth combinations, exact lane-specific credential
  scopes, TLD-independent URI/IP/localhost/DNS text material, and centralized
  configuration-wide text-material coverage. The established nine semantics
  remained passing.
- The URI/IP/DNS RED includes scheme URLs, IPv4, IPv6, localhost,
  `api.example.xyz`, and `api.service.corp`; its typed mutation table covers
  capability, credential-reference safe label and version, endpoint-policy
  version, feasibility version, and official-evidence ID fields without casts,
  assertions, suppression directives, `any`, or `unknown` laundering.
- `npm run typecheck` exited `0` from the RED bytes, confirming the focused
  fixtures introduce no TypeScript diagnostics.
