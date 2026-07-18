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

## RV-1-E-733 Corrected Recovery RED

- Coordinator root-cause authority: `RV-1-E-733` at program
  `2f678687dc7ab54c47eea52efadc84b7337772ee`. The prior causal RED
  `821d046fe5e64f4f1f13c3d2d1454635b68b1ac7` is preserved permanently.
- The sole fixture defect was contract-determined: the representative
  `provider_xai_grok` fact retained `openai-codex-harness` rather than the
  released `xai-harness` backend. The corrected fixture chooses
  `xai-harness` for the `provider_xai_` family only; no other RED semantic or
  production byte changes in this commit.
- The uncommitted partial GREEN source remains intentionally outside this RED
  commit. The corrected RED is reproduced from its exact committed bytes in a
  detached temporary checkout before that source patch is resumed.

## RV-1-E-734 Anchored-Family Recovery RED

- Coordinator tactic authority: `RV-1-E-734` at program
  `e62e5af61bf70d65c8ee7900fe03d8d23a9d557f`. The preceding corrected RED
  `88201283e9728543ced7c67308bc1643f3202431` remains preserved.
- The prior negative `provider_xai_grokish` assertion was invalid because it
  exactly satisfies the released `provider_xai_<nonempty suffix>` predicate.
  This RED replaces that ad hoc assumption with a typed anchored-family table.
- The table admits four matching-backend family members:
  `provider_openai_codex_primary`, `provider_openai_codex_review_2`,
  `provider_xai_grok`, and `provider_xai_grokish`; it rejects only
  outer-schema-valid empty-suffix, missing-delimiter, and near-prefix values
  outside both released predicates. All other focused-test semantics, including
  the corrected xAI backend, remain unchanged. The retained source GREEN patch
  remains unstaged and outside this RED commit.

## RV-1-E-734 Recovery GREEN

- The exact committed-byte RED was reproduced in a detached temporary
  checkout with a real non-symlinked hardlinked dependency directory. `npm
  test -- packages/local-runtime/test/agent-provider-configuration.test.ts`
  exited `1` with **1 failed file / 6 failed and 8 passed tests (14)**: the
  updated official exception, both-OAuth positive family matrix, anchored
  boundary table, lane-specific scope, TLD-independent text material, and
  configuration-wide text boundary all failed causally. `npm run typecheck`
  exited `0`. The temporary checkout was removed after the evidence run.
- The minimal source implementation accepts only anchored nonempty
  alphanumeric-led `provider_openai_codex_` and `provider_xai_` suffixes with
  matching backends; either released OAuth kind; exact
  `harness-execution` official scope; and exact `model-inference` BYOK/local
  scope. It has no reader, mounted authority, credential resolution, provider
  call, network operation, fallback, durable write, or process-global effect.
- A single normalization-time text-material boundary examines every
  configuration string before lane construction. It rejects URI schemes,
  IPv4/IPv6, localhost, and alphabetic-terminal DNS hosts without a finite TLD
  list while preserving hashes, event IDs, ISO timestamps, and `*.v1` policy or
  adapter versions. Existing secret-safety, hostile-shape, exact provenance,
  cardinality, and immutable-data boundaries remain in force.
- From these GREEN source bytes, the focused command passed: **1 file / 14
  tests**. The focused test remains byte-identical to the anchored-family RED.

## RV-1-E-735 Compressed-IPv6 Recovery RED

- Coordinator root-cause authority: `RV-1-E-735` at program
  `1dcf36ffe815dca0fb20d914f430452fb1aa4c6a`. The preserved candidate base is
  `8c397cbbc829ebe8ffbe8ac2315e90e5127764ce`.
- An otherwise valid BYOK configuration with `dataHandlingNotes: "::1"` is
  admitted by that candidate, despite the all-IP material boundary. This RED
  extends the existing text-material test without changing its 14-test shape:
  it requires rejection of unbracketed compressed, documented, scoped, and
  IPv4-mapped IPv6, bracketed IPv6, and IPv4 material, while positively
  retaining ISO timestamps and ordinary `policy.v1`/`adapter.v1` prose.
- This RED changes only this claim and the focused test. Production remains
  byte-identical to the preserved candidate until the causal proof is committed
  and reproduced from exact clean bytes.

## RV-1-E-735 Compressed-IPv6 Recovery GREEN

- The RED focused command exited `1` with **1 failed file / 1 failed and 13
  passed tests (14)**. Its sole failure reported `accepted: ["::1"]` with the
  ISO timestamp and ordinary version-prose control still accepted. The source
  blob was `7c9685b5a54353fb281b5cd37b39b7e1572844ef` both in the worktree and
  at the preserved `8c397cbb` candidate. `npm run typecheck` exited `0`.
- GREEN replaces only the bespoke IP regexes with standard-library
  `node:net` `isIP` classification over extracted bracketed, scoped, IPv6, and
  IPv4-shaped strings. It is local string classification only: it performs no
  socket, DNS, provider, credential, or other network operation.
- The focused command now passes: **1 file / 14 tests**. It rejects `::1`,
  `2001:db8::1`, `fe80::1%lo0`, `::ffff:192.0.2.128`, bracketed IPv6, and
  IPv4 while retaining ISO timestamps and ordinary `policy.v1`/`adapter.v1`
  prose. The focused test is unchanged from this RED.

## RV-1-E-737 Deterministic-Provenance Recovery RED

- Coordinator root-cause authority: `RV-1-E-737` at program
  `8f796ef9de05037b0541639d0788e0411777416e`. The preserved candidate base is
  `f614549d4c4c8ec886641ccb6651b17bacc4cfc4`.
- Two canonical official configurations may carry opposite multi-event orders
  in credential-reference, endpoint-policy, and official-evidence producer
  arrays while sharing the same canonically sorted feasibility aggregate.
  Both validate today, but their immutable snapshots serialize differently.
- This RED adds one named focused test (15 total) that proves the two accepted
  snapshots must deep-equal and retain exact sorted nested producer arrays. It
  changes only this claim and the focused test; production remains byte-for-byte
  identical to the preserved candidate until the causal proof is committed.

## RV-1-E-737 Deterministic-Provenance Recovery GREEN

- The causal RED focused command exited `1` with **1 failed file / 1 failed
  and 14 passed tests (15)**. Both canonical official inputs were accepted, but
  the deep-equality diff isolated only credential-reference, endpoint-policy,
  and official-evidence producer event-array order. Its production blob was
  `18250b71faed9fb13bd718046e031182e1d6c706`, exact to `f614549d`; `npm run
  typecheck` exited `0`.
- GREEN sorts credential-reference event IDs before
  `createCredentialReference`, and the shared event-ID freezer sorts endpoint,
  feasibility, and official-evidence arrays before immutable output. Duplicate
  rejection, exact sorted provenance-aggregate comparison, secret safety,
  hostile-shape validation, family/scope/text/IP boundaries, and data-only
  behavior remain unchanged.
- The RED test is byte-identical in GREEN. Its exact focused command passes:
  **1 file / 15 tests**, including deep-equal snapshots with exact sorted nested
  event arrays for opposite valid producer orders.

## RV-1-E-738 Compiler Recovery GREEN

- Standing compile-only recovery authority: `RV-1-E-738`. The preserved causal
  compiler RED is `4bee902eb8b08200b5e473ecf2dad9276cca4fe4`.
- Its only compiler defect was fixture inference: `feasibilitySources` widened
  to `string[]`, producing the two `TS2322` assignment diagnostics. This GREEN
  changes that local fixture declaration only to `EventId[]`; it introduces no
  cast, assertion, suppression, API change, or production modification.
- `npm test -- packages/local-runtime/test/agent-provider-configuration.test.ts`
  passes: **1 file / 15 tests**. `npm run typecheck` exits `0`.

## RV-1-E-740 Dual-Review Recovery RED

- Standing dual-review recovery authority: `RV-1-E-740`. The preserved clean
  candidate is `b3520865bba54c8cb54b28d149d1354549f5c3a9`; this RED changes
  only the focused test and this claim. Its production source blob remains
  `3099b28f9d11b617dd3a67e2137648f7197b3985`, byte-identical to both
  `b3520865` and the earlier compiler RED candidate `4bee902e`.
- The focused RED command `npm test --
  packages/local-runtime/test/agent-provider-configuration.test.ts` exits `1`
  with **1 failed file / 3 failed and 15 passed tests (18)**. It proves that
  the candidate admits standard-parser-recognized noncanonical IPv4 host
  spellings `127.1`, `2130706433`, `0x7f000001`, `127.0.1`, and `0x7f.1`;
  the same named coverage retains the standards-recognized octal
  `0177.0.0.1` rejection. It also proves the exact opaque safe-label
  `reference_https:opaque` is admitted while other delimiter controls remain
  rejected, and that `localeCompare` orders valid case-distinct released IDs
  `provider_openai_codex_a` before `provider_openai_codex_A` rather than in
  bytewise canonical order.
- The named RED retains the existing ISO timestamp and ordinary
  `policy.v1`/`adapter.v1` positive controls. `npm run typecheck` exits `0`
  from the RED bytes without TypeScript diagnostics.

## RV-1-E-740 Dual-Review Recovery GREEN

- GREEN changes only the production source and this claim; the focused test is
  byte-identical to RED `7ec6807d2be94e500253030a818f1406785e58dc`.
- The centralized text boundary now extracts safely bounded numeric/hex/octal
  host-like tokens and passes them through the local standards-based `URL`
  parser before rejecting canonical IPv4 hostnames. It tightens URI detection
  so `_` cannot hide an opaque scheme and replaces the sole locale-sensitive
  configuration sort with the existing bytewise comparator. These are local
  deterministic string operations only: no DNS, socket, provider, credential,
  or other external action occurs.
- `npm test -- packages/local-runtime/test/agent-provider-configuration.test.ts`
  passes: **1 file / 18 tests**. `npm run typecheck` exits `0`.

## RV-1-E-742 Bare-Scheme Recovery RED

- Standing recovery authority: `RV-1-E-742`. The preserved clean candidate is
  `294929b2d60fb226ed947bbdf068d9b4add803dc`; this RED changes only the
  focused test and this claim. The production source blob remains
  `d7164b2b39eee0648c067fb1406b0b294002d657`, byte-identical to that
  candidate.
- The focused RED command `npm test --
  packages/local-runtime/test/agent-provider-configuration.test.ts` exits `1`
  with **1 failed file / 1 failed and 18 passed tests (19)**. Its named
  capability/free-text and credential-safe-label matrix proves the candidate
  admits payload-empty `mailto:`, `urn:`, `data:`, `file:`, `http:`, and
  `https:` schemes at both centralized recursive text boundaries (12 invalid
  admissions). The same test explicitly confirms the released ISO timestamp,
  `policy.v1`, and `adapter.v1` controls remain accepted.
- `npm run typecheck` exits `0` from the RED bytes without diagnostics.

## RV-1-E-742 Bare-Scheme Recovery GREEN

- GREEN changes only production source and this claim; the focused test is
  byte-identical to RED `a33364adef8a4ee75d26ef7094951462a2453b04`.
- The centralized URI grammar now rejects a valid scheme separator independent
  of payload presence. It preserves underscore/other delimiter detection and
  the released ISO timestamp, `policy.v1`, and `adapter.v1` controls without
  altering the existing local URL/IP parser, provider-family/scope/binding,
  provenance, hostile-shape, secret-safety, immutability, or data-only
  boundaries.
- `npm test -- packages/local-runtime/test/agent-provider-configuration.test.ts`
  passes: **1 file / 19 tests**. `npm run typecheck` exits `0`.

## RV-1-E-744 DNS-and-Revocation Recovery RED

- Standing recovery authority: `RV-1-E-744`. The preserved clean candidate is
  `b5cbe5d7f5491c5350c99b01085e8ce59f7f146c`; this RED changes only the
  focused test and this claim. The production source blob remains
  `7bf376b62fb7c132cc5afe2fe6d3208f073879c7`, byte-identical to that
  candidate.
- The focused RED command `npm test --
  packages/local-runtime/test/agent-provider-configuration.test.ts` exits `1`
  with **1 failed file / 2 failed and 19 passed tests (21)**. The named
  capability/free-text and credential-safe-label matrix proves that `api.x`
  and `a.b` are accepted at all four DNS text boundaries despite their
  single-character alphabetic terminal labels; its `policy.v1` and
  `adapter.v1` controls remain accepted. The second named test proves that an
  otherwise valid `healthy` BYOK reference with prior `revokedAt` returns a
  current feasibility result instead of failing closed, while an unrevoked
  healthy reference remains admitted.
- `npm run typecheck` exits `0` from the RED bytes without diagnostics.

## RV-1-E-744 DNS-and-Revocation Recovery GREEN

- GREEN changes only production source and this claim; the focused test is
  byte-identical to RED `57e40c518b7ae37dd639f7f3816e784e9c23f342`.
- The centralized DNS text boundary now classifies every alphabetic terminal
  label without a length or TLD spelling list, while terminal digits continue
  to preserve `policy.v1` and `adapter.v1`. Credential-reference normalization
  now rejects any `revokedAt` before a reference can participate in current
  feasibility binding; healthy, unrevoked references and the existing
  expiration-at-assessment rule remain unchanged.
- `npm test -- packages/local-runtime/test/agent-provider-configuration.test.ts`
  passes: **1 file / 21 tests**. `npm run typecheck` exits `0`.

## RV-1-E-745 Delimiter-and-Authorization Recovery RED

- Standing recovery authority: `RV-1-E-745`. The preserved clean candidate is
  `4b1a7c8e95e500b61e621fa2dec5b9c1dc67de94`; this RED changes only the
  focused test and this claim. The production source blob remains
  `6804e113d1d68ed7873f2d55b1c0e7dbf47f03e5`, byte-identical to that
  candidate.
- The focused RED command `npm test --
  packages/local-runtime/test/agent-provider-configuration.test.ts` exits `1`
  with **1 failed file / 2 failed and 21 passed tests (23)**. Its named
  capability/free-text and credential-safe-label matrix admits
  `reference_127.1_suffix` and `reference-0x7f000001` at both boundaries;
  the same matrix retains canonical, port-style, `1.2`, exact ISO timestamp,
  `policy.v1`, and `adapter.v1` rejection/positive controls. The second
  named test proves a healthy, unexpired, unrevoked credential authorized
  after feasibility assessment is incorrectly admitted, while equality,
  earlier authorization, expiry-boundary, and prior-revocation controls remain
  covered.
- `npm run typecheck` exits `0` from the RED bytes without diagnostics.

## RV-1-E-745 Delimiter-and-Authorization Recovery GREEN

- GREEN changes only production source and this claim; the focused test is
  byte-identical to RED `f585ec8c868f630e721b6005710fb855d6fe779e`.
- Host token extraction now uses every non-alphanumeric delimiter, while its
  standards-parser candidate grammar remains structural rather than a version
  exception: dotted, `0x`-prefixed, and compact raw numeric IPv4 forms are
  classified locally. A valid exact ISO timestamp is narrowly exempted so the
  released timestamp controls remain accepted; `policy.v1` and `adapter.v1`
  remain ordinary safe prose, while dotted `1.2` remains rejected as IP
  material.
- Current-reference evaluation now requires authorization at or before
  feasibility assessment, absence of revocation, and expiration strictly after
  assessment. It preserves existing credential normalization, data-only
  behavior, and no-effect boundaries.
- `npm test -- packages/local-runtime/test/agent-provider-configuration.test.ts`
  passes: **1 file / 23 tests**. `npm run typecheck` exits `0`.

## RV-1-E-747 Unicode-DNS-and-Canonical-Shape Recovery RED

- Standing recovery authority: `RV-1-E-747`. The preserved clean candidate is
  `b8c7469d9f8f3189062639cf14ee704760477815`; this RED changes only the
  focused test and this claim. The production source blob remains
  `b89cb4ba96023ee803d798cb34a53e2aca47a30e`, byte-identical to that
  candidate.
- The focused RED command `npm test --
  packages/local-runtime/test/agent-provider-configuration.test.ts` exits `1`
  with **1 failed file / 3 failed and 23 passed tests (26)**. The named
  capability/free-text and credential-safe-label matrix proves that
  `api.a1`, `api.3com`, `service.123`, `x.y9`, `api.例子`, and each of `0`,
  `1`, `01`, `127`, `1:80`, and `127:443` are admitted at both recursive
  text boundaries, while the released `adapter.v1` and `policy.v1` controls
  remain admitted. The second named proof admits prose `assessedAt`
  `July 18, 2026 12:00:00 UTC`. The third accepts semantically identical
  configurations with reversed capability modalities and diagnostic contract
  arrays but returns byte-different snapshots; it also pins duplicate
  rejection for those set-like arrays.
- `npm run typecheck` exits `0` from the RED bytes without diagnostics.
