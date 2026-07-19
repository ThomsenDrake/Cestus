# Task139-P2 — Resident-Loop Provider Posture

## Claim

- Status: candidate admission pending final-commit verification.
- Card: `Task139-P2`, the strict V4 card immediately following released
  Task136-FC-Core record 19.
- Worker: Codex `gpt-5.6-terra` / `xhigh`.
- Branch: `codex/task139-p2-resident-loop-provider-posture`.
- Exact dispatch base: `4b92a56928761ef3e3e719a68b6d7d147cd56f6f`.
- RV-1-E-775 recovery head before the causal-RED correction:
  `b27c03aca71fe5306aa18a55a105b6a8e9dd3a58`.
- Current corrected record-19 comparison base:
  `f7d7711d6f286e6cc322fa2994de005c223d7fe4`.
- Released prerequisite evidence:
  - `T120-R`: `0b5185f0d0dd276164ec70d5db150f5f6ccb3a79`.
  - `Task139-P1`: `0ca25161e07f2df22109a6cab8da9545d0d0b4a5`.
  - `Task139-PM`: `dbc1debd9d59931b6bcbab0db7c0490cebb9a047`.
  - `Task136-FC-Core`: `6adba773c67948135f848d080eeea79f3d82719b`.

## Exclusive Scope

1. `packages/local-runtime/src/resident-loop-provider-posture.ts`
2. `packages/local-runtime/test/resident-loop-provider-posture.test.ts`
3. `docs/agentic/claims/task-139-resident-loop-provider-posture.md`

No registry, assurance fixture, factory, mounted-authority issuer, `neo`,
provider, credential, network, durable-storage, or external-service path is
in scope.

## Intended API And Gates

The new module will expose one async, fail-closed P-owned posture derivation
capability. It accepts only normalized immutable P1 configuration data plus the
exact opaque PM-issued mounted authority and an exact run/task/attempt/resident
binding; it rereads PM authority around each async boundary and returns only a
frozen, credential-free provider-posture snapshot. The snapshot will bind the
exact selected provider/model/capability/provenance/reference/feasibility/
policy/approval facts to current canonical `ws_*` workspace, mount, admission,
policy, lock, and high-water readback facts. P1 and all request currentness are
data only, never authority; no P2 call independently authenticates request
task, attempt, run, prompt, or approval values. Substitutes,
stale/burned/swapped authority, hostile input, fallbacks, and
secret/endpoint/host material fail closed.

P2 is independent of Task126-R. It will neither import nor mint, alias, adapt,
or call Task126's private `createByokProviderAuthorityReader`; the owned test
pins that source separation. PM remains the sole mounted-authority issuer and
inspector. FC-Core is regression evidence for the mounted fixture only, not a
structural P2 readback capability.

The causal RED precedes any production source and uses the card command:

```bash
npm test -- packages/local-runtime/test/resident-loop-provider-posture.test.ts
```

The recorded cross-boundary command is:

```bash
npm test -- packages/local-runtime/test/resident-loop-provider-posture.test.ts packages/agent/test/byok-provider.test.ts packages/local-runtime/test/agent-provider-configuration.test.ts packages/local-runtime/test/mounted-provider-authority.test.ts packages/local-runtime/test/resident-loop-factory-composition.test.ts packages/local-runtime/test/resident-loop-factory-composition-imports.test.ts
```

It covers the new posture capability, Task126's current-posture consumer, P1
configuration, PM mounted authority, and the FC-Core runtime composition and
import boundary. The final candidate will be verified from committed bytes with
these commands, typecheck, full-test/verify differential, V4 contract and
repository modes, factory readiness, scope and cleanliness checks, and real
local dependency evidence.

## Causal RED

The RED adds only the focused test and this claim; the P2 production module is
absent. It derives its real fixture through FC-Core's started wake composition,
the factory-issued mounted operation, PM's opaque locator, and Core's exact
PM/H bind readback. The three named cases require a frozen, secret-safe BYOK
posture with exact run and mounted bindings; rejection of hostile envelopes,
copied authority, mismatched currentness, and caller substitution; and PM
reinspection after the mounted runtime closes.

From the RED bytes, the exact focused command exited `1` with **1 failed file
/ 3 failed tests**. Every failure is the intentional API-presence assertion at
`postureApi` (`expected false to be true`) because
`resident-loop-provider-posture.ts` is absent; no fixture, dependency, or
TypeScript failure occurred. The RED test has no production edit.

## RV-1-E-775 Causal RED Correction

The corrected RED keeps the first RED commit and changes only this claim and
the owned test before production exists. Its real mounted fixtures and accepted
request currentness use canonical `ws_*` IDs; a separate public-boundary case
rejects provisional `workspace_*` IDs without translation. It adds exact
request comparisons for mount, admission, policy, lock, and high-water facts,
and adversarial copied/swapped authority, accessor, proxy, custom-prototype,
symbol, sparse-array, and extra-index cases. The source-separation assertion
runs only after the missing P2 API is present, so the correction's RED remains
causal rather than failing on the intentionally absent module.

## RV-1-E-776 Causal Secret-Safety Oracle Correction

The output's released `credentialKind: "api-key-bearer"` enum is safe posture
metadata, not credential material. The earlier broad word scanner could not
both require that exact enum and reject its words after GREEN. This correction
therefore preserves the enum and tests precise unsafe forms instead:
secret-bearing output keys; credential-value and authorization-header syntax;
bearer/basic values; URL/URI, localhost, DNS-host, and IP material. It neither
weakens P1 secret safety nor permits a raw credential, endpoint, host, token,
or authorization value. The missing-module RED remains the only failure before
the P2 source exists.

## Fixture Bootstrap Repair

The first executed GREEN fixture proved the released resident bootstrap rejects
bootstrap actor IDs and labels containing `provider`. The mounted fixture now
uses neutral resident bootstrap actor data while retaining its canonical
`ws_provider_posture_*` workspace identity and all P2 provider facts. This is
fixture construction only: it neither changes the workspace ID nor grants a
provider identity or any additional authority.

## RV-1-E-778 Causal P1-Parity And Exact-Binding RED

P2 accepts immutable structural P1-shaped data as data, never authority, and
therefore must independently enforce the released P1 hostile-text classifier at
every normalized configuration string. This RED passes frozen structural copies
with arbitrary URI schemes, arbitrary DNS suffixes, IDNA-dot lookalikes,
bracketed/scoped IPv6, and standard numeric URL-host forms in multiple
configuration text locations; none may be accepted because P1 originally
created the surrounding shape. It also requires a frozen output `binding`
member containing exact `promptArtifactHash` and `approvalPreviewHash`. Those
are caller binding data only—neither prompt/approval proof nor new authority—
but readers with different values must not emit byte-identical posture data.
The same RED pins non-text structural parity: a frozen P1-shaped reference that
claims `healthy` while carrying `revokedAt` must fail before posture creation.
P2 will retain its strict immutable envelope but reuse the released P1 creator
on version-stripped arrays, so it does not silently omit P1 temporal,
credential-reference, scope, capability, endpoint, or feasibility invariants.

From the source-byte-identical RED, the focused command exited `1` with **1
failed file / 4 failed and 2 passed tests (6 total)**. The existing positive
snapshot and the new exact-binding case fail only because `buildPosture` omits
the required binding member; the hostile-text case fails because the first
frozen structural P1-shaped URI/DNS input is accepted; and the independent
healthy-plus-revoked reference is accepted. Fixture construction, PM
currentness, P1 configuration construction, and the prior adversarial cases
all execute successfully.

## RV-1-E-778 GREEN

GREEN is `50f5975e5398d95aa70d032d466f97cc814f9203` and changes only
`resident-loop-provider-posture.ts`. It retains P2's frozen/plain-data input
envelope, then sends the version-stripped capabilities, credential references,
endpoint policies, and feasibility arrays through the released
`createAgentProviderConfiguration` validator before selecting its exact BYOK
posture. This preserves P1's complete capability, reference, temporal, scope,
endpoint, and feasibility rules for structural copies without treating the
copy as authority. P2's source-local finite hostile-text classifier also
rejects P1's URI, DNS, Unicode-dot, IPv6, and numeric-host classes across each
configuration text boundary while preserving P1's canonical timestamps and
released dotted versions. The frozen, safe snapshot now carries a frozen
`binding` member with exact `promptArtifactHash` and `approvalPreviewHash` as
data only.

From the GREEN parent commit, the focused command passed **1 file / 6 tests**;
the recorded six-file cross-boundary command passed **6 files / 53 tests**;
and typecheck, factory readiness, and all four V4 contract markers passed.
Relative to the clean record-19 base, P2 adds one focused file and six tests:
the named positive cases are `derives immutable secret-safe BYOK posture from
one P1 configuration, binding data, and current PM authority` and `retains
exact prompt and approval hashes as immutable binding data`. The remaining
four cases are adversarial rejection/currentness coverage. Final admission is
rerun from the claim-only candidate commit, against detached `f7d7711d`, before
this claim is handed off.

## RV-1-E-779 Causal Compiler RED

The coordinator forwarded this branch at
`a2483dea13770ffc2b3a6e1fe8df64c31b205940` with RV-1-E-779 authorization.
This RED changes this claim only. The production blob is still
`f5b0c16f960aa33b49f81b682882661e01310392` and the focused-test blob is still
`dd799c19c46d391ce9bb78c94de9eb65f83c71b6`; neither runtime nor test behavior
is changed.

Before this claim commit, `npm run typecheck` exited `2` with exactly these
three diagnostics:

```text
packages/local-runtime/src/resident-loop-provider-posture.ts(33,6): error TS2456: Type alias 'NormalizedValue' circularly references itself.
packages/local-runtime/src/resident-loop-provider-posture.ts(622,3): error TS2322: Type 'string' is not assignable to type '`sha256:${string}`'.
packages/local-runtime/src/resident-loop-provider-posture.ts(667,3): error TS2322: Type 'string' is not assignable to type '`sha256:${string}`'.
```

The causal compiler GREEN will make the type representation explicit through
readonly recursive interfaces and use a real hash predicate at both return
sites. It will not alter P2 runtime normalization, selection, authority,
binding, output, or test behavior.

## RV-1-E-779 Compiler GREEN

This GREEN replaces the directly recursive alias with explicit readonly array
and readonly string-indexed record interfaces, and preserves the existing
record runtime condition through a normalized-record predicate so strict
TypeScript can narrow the union. It also adds `isHash`, a real template-literal
type predicate, and uses it at both `requiredHash` return sites. There are no
casts, assertions, `any`, or `unknown` laundering, and no test edit. The
pre-commit `npm run typecheck` exits `0`; all final-SHA admission commands are
rerun after this commit.
