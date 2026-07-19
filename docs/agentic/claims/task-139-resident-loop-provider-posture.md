# Task139-P2 — Resident-Loop Provider Posture

## Claim

- Status: claimed.
- Card: `Task139-P2`, the strict V4 card immediately following released
  Task136-FC-Core record 19.
- Worker: Codex `gpt-5.6-terra` / `xhigh`.
- Branch: `codex/task139-p2-resident-loop-provider-posture`.
- Exact dispatch base: `4b92a56928761ef3e3e719a68b6d7d147cd56f6f`.
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
capability. It accepts only normalized P1 configuration data plus the exact
opaque PM-issued mounted authority and an exact run/task/attempt/resident
binding; it rereads PM authority around each async boundary and returns only a
frozen, credential-free provider-posture snapshot. The snapshot will bind the
exact selected provider/model/capability/provenance/reference/feasibility/
policy/approval facts to current workspace, mount, admission, policy, lock,
and high-water readback facts. P1 or caller-copied currentness is data only,
never authority; substitutes, stale/burned/swapped authority, hostile input,
fallbacks, and secret/endpoint/host material fail closed.

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
