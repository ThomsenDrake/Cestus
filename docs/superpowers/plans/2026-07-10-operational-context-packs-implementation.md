# Operational Context Packs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to execute this plan task-by-task. Each task also requires `superpowers:test-driven-development`, review skills, and `superpowers:verification-before-completion` before completion.

**Goal:** Implement provider-safe resolved context-pack envelopes, registry payload resolution, deterministic operational pack builders, package-level registration, and readiness handoff inputs for `workspace-runtime-status.v1`, `task-run-history.v1`, and the canonical evolved `agent-memory-summary.v1`.

**Architecture:** Start in `packages/agent/src/context-packs.ts` so all context-pack producers can return or resolve a verified `ResolvedContextPack` envelope. Keep ref-only `ContextPackRegistry.build()` compatible for readiness/cockpit consumers, add `buildResolved()` for prompt/provider execution, then build the operational packs on that generic contract. Operational sources remain capability-oriented, async, bounded, and independent of local-runtime/SQLite/cockpit imports.

**Tech Stack:** TypeScript, Vitest, existing `ContextPackRef`/`ContextPackRegistry` helpers, append-only agent projection DTOs, and factory claim docs.

## Global Constraints

- Approved spec: `docs/superpowers/specs/2026-07-10-operational-context-packs-design.md`.
- Use branch `codex/operational-context-packs-spec` unless the coordinator assigns a successor branch before implementation starts.
- Read the approved spec, this plan, `AGENTS.md`, `.agents/skills/cestus-software-factory/SKILL.md`, and `docs/agentic/software-factory.md` before editing.
- Builders are deterministic for identical injected inputs. `generatedAt` is caller-supplied; builders do not read wall-clock time, process state, filesystem state, network state, random values, or environment variables.
- Scope, policy version, size budget, and projection high-water marks are mandatory typed fields for every operational pack, including explicit empty-projection cases.
- Every production context-pack builder in this lane returns a `ResolvedContextPack` or raw build input that the registry normalizes into one. Ref-only builders are compatibility fixtures and cannot satisfy production provider execution.
- `ContextPackRegistry.build()` remains truly ref-only compatible: it accepts validated legacy `ContextPackRef` builder results and never requires payload resolution or a payload parser.
- `ContextPackRegistry.buildResolved()` requires a returned/raw payload envelope or a configured typed resolver; a legacy ref-only builder without resolver support fails with `blocked.missing-payload`.
- `ResolvedContextPack.ref.contentHash` and `ref.sizeBytes` must exactly match the canonical UTF-8 payload bytes.
- Payload resolution is by full `ContextPackRef` and verified canonical bytes. Do not add arbitrary hash-to-text callbacks.
- Production payload resolution also requires an exact pack-specific parser keyed by `contextPackId` and `version`; matching hash/size alone is not sufficient.
- Parser functions are builder/registry capabilities, not descriptor DTO fields, and are never serialized into snapshots, ledger events, diagnostics, cockpit DTOs, or logs.
- Verification authority is an authoritative registry method or opaque/branded in-memory result, not a serializable field such as `parserVerification: "ok"`.
- Serialized or reloaded envelopes must pass through canonical hash/size verification and the registered ID/version parser again before production rendering.
- Do not expose payload bodies in ledger events, diagnostics, cockpit DTOs, public logs, readiness summaries, or browser/operator DTOs.
- Empty memory and empty task/run history are valid only with explicit empty-projection proof, current high-water mark, scope, source event count, and staleness inputs.
- No pack includes raw portable paths, raw provider errors, prompts, model output, credentials, provider runtime material, unrestricted local paths, or private source bodies.
- Memory remains non-authoritative and source-linked. No implementation may infer ontology truth from memory, runtime facts, task history, model output, or an empty projection.
- Task/run history preserves terminal, blocked, denied, failed, executing, approved, requested, queued, running, and pending states without raw model output.
- Provider interfaces are capability-oriented, async, and independent of SQLite, local-runtime, HTTP, filesystem, React, and cockpit imports.
- Provider contracts must support bounded, scope-aware snapshots or paged queries with total counts, deterministic ordering, cursor/window metadata, source high-water marks, and aggregate omission codes.
- Operational pack construction must not require materializing, copying, or serializing an unbounded full `AgentProjection`; adapting the current projection in a test/runtime adapter is allowed only behind the bounded provider contract.
- Stable omission and blocking reason codes are machine-readable; human copy belongs to presentation layers.
- Registration is idempotent by deterministic provider registration key and rejects conflicting duplicate pack IDs, versions, descriptors, or builders.
- Each implementation task must claim a task file, commit the claim, write RED tests before production code, run the exact targeted command, make the smallest production change, run targeted GREEN, run `npm run verify`, commit, and pass review before the next dependent task.

## Owned Files

Create:
- `packages/agent/src/operational-context-packs.ts`
- `packages/agent/test/operational-context-packs.test.ts`
- `packages/agent/test/fixtures/resolved-context-pack-sentinel.ts`
- `docs/agentic/claims/task-1-resolved-context-pack-envelope.md`
- `docs/agentic/claims/task-2-operational-context-pack-contracts.md`
- `docs/agentic/claims/task-3-operational-memory-builder.md`
- `docs/agentic/claims/task-4-operational-pack-builders.md`
- `docs/agentic/claims/task-5-operational-pack-registration.md`
- `docs/agentic/claims/task-6-operational-context-pack-readiness.md`

Modify:
- `packages/agent/src/context-packs.ts`
- `packages/agent/src/memory.ts`
- `packages/agent/src/index.ts`
- `packages/agent/test/context-packs.test.ts`
- `packages/agent/test/memory.test.ts`

Optional final evidence-only file, if the coordinator asks for central readiness indexing:
- `docs/agentic/software-factory.md`

Do not edit:
- `packages/local-runtime/src/agent-http-routes.ts`
- `packages/local-runtime/src/agent-runtime-factory.ts`
- `packages/local-runtime/src/agent-prompt-artifacts.ts`
- `packages/agent/src/cockpit.ts`
- `packages/agent/src/specialist-runner-kernel.ts`
- `packages/agent/src/specialist-handoffs.ts`
- PRR pack, evidence pack, accepted-graph pack, governance, jurisdiction, timeline, contradiction, prompt-template, orchestrator, runtime adapter, cockpit route, or UI files

## Claim Template

Each task claim must record the concrete worker/session, branch, worktree, timestamp, owned files, targeted command, RED evidence, GREEN evidence, full-verify evidence, and review status. Use shell output to fill these values:

```bash
git branch --show-current
pwd -P
date -u +"%Y-%m-%dT%H:%M:%SZ"
```

Use statuses in this order: `claimed`, `in-progress`, `ready-for-review`, `reviewed`, `complete`.

## Shared Contracts To Implement

Generic context-pack core:

- `ResolvedContextPack`: `{ readonly ref: ContextPackRef; readonly payload: AgentContextPackJsonValue }`.
- `VerifiedResolvedContextPack`: opaque/branded result produced only by registry/execution verification after hash/size and exact parser checks.
- `buildResolvedContextPack(input: BuildContextPackRefInput): ResolvedContextPack`.
- `serializeContextPackPayload(payload: AgentContextPackJsonValue): Uint8Array`.
- `ContextPackPayloadParser`: `(payload: AgentContextPackJsonValue) => AgentContextPackJsonValue`.
- `verifyResolvedContextPack(envelope: ResolvedContextPack, parser?: ContextPackPayloadParser): ResolvedContextPack`.
- `ContextPackPayloadResolver`: `resolve(ref: ContextPackRef): Promise<ResolvedContextPack>`.
- `assertResolvedContextPacksForExecution(input: { readonly refs: readonly ContextPackRef[]; readonly resolved: readonly ResolvedContextPack[] }): readonly VerifiedResolvedContextPack[]`.
- `ContextPackBuilder.parsePayload?: ContextPackPayloadParser`.
- `ContextPackRegistry.buildResolved(contextPackId: string): Promise<ResolvedContextPack>`.
- `createContextPackRegistry(input?: { readonly payloadResolver?: ContextPackPayloadResolver }): ContextPackRegistry`.
- Shared internal normalization functions may stay private, but tests must pin behavior for ref-only and resolved paths.

Operational module:

- `OperationalContextPackId`: the union of `workspace-runtime-status.v1`, `task-run-history.v1`, and `agent-memory-summary.v1`.
- `OperationalContextPackCapability`: `workspace-runtime-status`, `task-run-history`, and `agent-memory-summary`.
- `OperationalContextPackOmissionCode`: machine-readable codes including `omitted.raw-paths`, `omitted.raw-provider-errors`, `omitted.prompts`, `omitted.model-output`, `omitted.credentials`, `omitted.raw-source-content`, `omitted.out-of-scope`, and `omitted.size-budget`.
- `OperationalContextPackBlockingCode`: machine-readable codes including `blocked.missing-scope`, `blocked.missing-high-water-mark`, `blocked.missing-empty-proof`, `blocked.projection-stale`, `blocked.projection-source-mismatch`, `blocked.size-budget`, `blocked.unsafe-diagnostic`, `blocked.unbounded-source`, `blocked.missing-payload`, `blocked.missing-payload-parser`, `blocked.payload-hash-mismatch`, `blocked.payload-schema-mismatch`, `blocked.invalid-payload-shape`, and `blocked.conflicting-registration`.
- `OperationalContextPackSizeBudgets`: per-pack byte budgets.
- `OperationalEmptyProjectionProof`: projection name, scope, projection high-water mark, source event count, generatedAt, and empty reason code.
- `OperationalBoundedWindow`: deterministic `order`, `limit`, optional `cursor`, `hasMore`, `totalCount`, and `omissionCodes`.
- `OperationalTaskRunHistorySnapshot`: bounded task, run, model invocation, and tool request summaries plus source high-water mark, aggregate counts, source event IDs, artifact hashes, window metadata, and empty proof.
- `OperationalAgentMemorySnapshot`: bounded active-memory summaries plus source high-water mark, aggregate counts, source event IDs, artifact hashes, window metadata, and empty proof.
- `OperationalWorkspaceRuntimeSource`: safe runtime facts plus runtime high-water mark, provider state summaries, diagnostics, and omission codes.
- `OperationalContextPackProvider`: async methods `workspaceRuntimeStatus()`, `taskRunHistorySnapshot()`, and `agentMemorySnapshot()`, plus provider metadata, scope, policy version, generatedAt, and size budgets.
- `OperationalContextPackRegistrationResult`: registered pack IDs plus deterministic registration key.
- `OperationalContextPackReadinessInputs`: resolved context packs, refs, current projection high-water marks, descriptors, blocking codes, and omission codes.

The deterministic provider registration key is the joined string:

```text
operational-context-packs:providerId:policyVersion:scopeKind:scopeId:sortedCapabilities
```

Implementation requirements:
- Secret-check every key segment.
- Reject empty capability lists.
- Sort and de-duplicate capabilities before key derivation.
- Treat two different provider objects with the same key and same descriptor set as idempotent duplicate registration.
- Reject a duplicate pack ID/version/builder registration when the deterministic key or descriptor set differs.

## Task 1: Resolved Context Pack Envelope And Registry Capability

**Files:**
- Create `docs/agentic/claims/task-1-resolved-context-pack-envelope.md`
- Modify `packages/agent/src/context-packs.ts`
- Modify `packages/agent/src/index.ts`
- Modify `packages/agent/test/context-packs.test.ts`
- Create `packages/agent/test/fixtures/resolved-context-pack-sentinel.ts`

**RED tests first:**
- `buildResolvedContextPack()` returns a frozen envelope with `payload`, `ref`, matching `contentHash`, and matching `sizeBytes`.
- `buildContextPackRef(input)` returns the same ref as `buildResolvedContextPack(input).ref` for the same payload.
- `serializeContextPackPayload()` canonicalizes object keys, rejects unsafe DTOs, and produces the bytes hashed in the ref.
- `verifyResolvedContextPack()` rejects forged hashes, byte-size mismatches, unsafe payloads, context ID/version mismatches, and untrusted ref-only material.
- `verifyResolvedContextPack(envelope, parser)` rejects an attacker-controlled payload/ref pair whose hash and size match but whose pack-specific shape is invalid.
- A forged serialized field such as `parserVerification: "ok"` or `verified: true` does not bypass parser validation.
- Serializing and reloading a resolved envelope strips any in-memory verified authority; production execution must call the registry/execution verifier again.
- A parser registered for `task-run-history.v1@1` cannot satisfy resolution of `workspace-runtime-status.v1@1`.
- `createContextPackRegistry().buildResolved(id)` returns a verified envelope when a builder returns raw build input or `ResolvedContextPack`.
- `createContextPackRegistry().build(id)` remains ref-only compatible and returns the expected ref for raw build input, resolved envelopes, and validated legacy ref-only builders.
- `build()` never calls the configured resolver and does not require a payload parser.
- A legacy ref-only builder regression fixture proves `build()` succeeds, `buildResolved()` fails with `blocked.missing-payload` without a resolver, and `buildResolved()` succeeds with an exact resolver and exact parser.
- A resolver keyed by full `ContextPackRef` can resolve a ref-only builder result, and the registry rejects resolver payload hash/size mismatches.
- `buildResolved()` fails with `blocked.missing-payload-parser` when a payload is available but no exact parser exists for the builder's `contextPackId` and `version`.
- Descriptor snapshots and registry snapshots do not serialize `parsePayload` functions.
- `assertResolvedContextPacksForExecution()` rejects missing payloads, duplicate refs, mismatched hashes, and extra unresolved refs.
- Sentinel fixture has safe fact `payload_sentinel_case_budget_review_window_42` only in payload, never in `safeSummary`; execution assertion can retrieve the sentinel through resolved payloads, while ref-only summaries cannot.

**Targeted RED command:**

```bash
npm test -- packages/agent/test/context-packs.test.ts
```

Expected RED failure: missing `ResolvedContextPack`, `buildResolvedContextPack`, `buildResolved`, parser, resolver, execution assertion, and sentinel fixture exports.

**Implementation steps:**
- Add the generic envelope interfaces to `packages/agent/src/context-packs.ts`.
- Factor existing payload normalization/stable JSON into exported canonical serialization helpers without weakening DTO safety.
- Implement `buildResolvedContextPack(input)` and keep `buildContextPackRef(input)` byte-compatible by returning that envelope's ref.
- Expand `ContextPackBuilderResult` to support `ResolvedContextPack`, raw `BuildContextPackRefInput`, and compatibility `ContextPackRef`.
- Add optional `parsePayload` to `ContextPackBuilder`, outside the descriptor DTO.
- Add separate internal normalization paths: one for `build()` that accepts refs directly and never resolves payloads, and one for `buildResolved()` that requires payload bytes or resolver readback.
- Add `buildResolved()` to registry; keep `build()` returning refs without resolver/parser requirements.
- Add optional resolver injection to `createContextPackRegistry({ payloadResolver })`.
- Implement `verifyResolvedContextPack()` with optional parser validation and `assertResolvedContextPacksForExecution()`.
- Represent verified execution-ready envelopes with an opaque/branded return type or registry-owned method result that cannot be manufactured by JSON fields.
- Ensure reload paths treat serialized envelopes as unverified input and rerun parser validation.
- Add the sentinel fixture in `packages/agent/test/fixtures/resolved-context-pack-sentinel.ts`.
- Export new generic APIs from `packages/agent/src/index.ts`.

**Targeted GREEN command:**

```bash
npm test -- packages/agent/test/context-packs.test.ts
```

**Full verification:**

```bash
npm run verify
```

**Commit sequence:**
- Commit claim after `Status: claimed`.
- Commit claim after `Status: in-progress`.
- Commit implementation and evidence with message `feat: resolve context pack payload envelopes`.

**Review gate:**
- Reviewers confirm ref-only readiness compatibility remains intact, `buildResolved()` is strict about payload/resolver/parser availability, pack-specific schema validation rejects matching-hash invalid payloads, no payloads are added to ledger/cockpit/log DTOs, and no arbitrary hash-to-text callback exists.

## Task 2: Operational Provider Contracts And Descriptors

**Files:**
- Create `docs/agentic/claims/task-2-operational-context-pack-contracts.md`
- Create `packages/agent/src/operational-context-packs.ts`
- Modify `packages/agent/src/index.ts`
- Create `packages/agent/test/operational-context-packs.test.ts`

**RED tests first:**
- `operationalContextPackDescriptors` exposes exactly the three package-owned descriptors, all version `1`.
- Descriptor provenance requirements include event or empty-projection provenance as appropriate.
- `operationalContextPackProviderRegistrationKey()` is stable across capability order and uses the exact deterministic key format.
- Provider metadata validation rejects unsafe scope IDs such as `/home/drake/private/workspace`, raw provider-error text, credential-shaped text, empty capabilities, and unknown capabilities.
- Provider contract tests compile against bounded methods `workspaceRuntimeStatus()`, `taskRunHistorySnapshot()`, and `agentMemorySnapshot()`, not a required full `agentProjection()` method.
- Operational builder return types are `ResolvedContextPack` or raw build inputs that the registry can normalize into `ResolvedContextPack`.
- Operational registration supplies exact parser capabilities for `workspace-runtime-status.v1@1`, `task-run-history.v1@1`, and `agent-memory-summary.v1@1`; those parser functions are not serialized into descriptors.

**Targeted RED command:**

```bash
npm test -- packages/agent/test/operational-context-packs.test.ts packages/agent/test/context-packs.test.ts
```

Expected RED failure: missing `../src/operational-context-packs.js` exports.

**Implementation steps:**
- Add the operational shared types and descriptor constants in `packages/agent/src/operational-context-packs.ts`.
- Add `assertOperationalContextPackProviderMetadata()`.
- Add exact payload parsers for the three operational pack payload schemas.
- Add `operationalContextPackProviderRegistrationKey()`.
- Export the module from `packages/agent/src/index.ts`.
- Keep the new module free of local-runtime, SQLite, filesystem, HTTP, React, and cockpit imports.

**Targeted GREEN command:**

```bash
npm test -- packages/agent/test/operational-context-packs.test.ts packages/agent/test/context-packs.test.ts
```

**Full verification:**

```bash
npm run verify
```

**Commit sequence:**
- Commit claim after `Status: claimed`.
- Commit claim after `Status: in-progress`.
- Commit implementation and evidence with message `feat: add operational context pack contracts`.

**Review gate:**
- Reviewers confirm the provider boundary is bounded and capability-oriented, descriptor IDs do not collide with parallel lanes, return types support resolved envelopes, payload parsers are exact and non-serialized, and registration-key validation has no object-identity dependency.

## Task 3: Canonical Memory Builder Evolution

**Files:**
- Create `docs/agentic/claims/task-3-operational-memory-builder.md`
- Modify `packages/agent/src/memory.ts`
- Modify `packages/agent/test/memory.test.ts`
- Modify `packages/agent/test/context-packs.test.ts`
- Modify `packages/agent/test/operational-context-packs.test.ts`

**Compatibility rule:** Evolve `buildAgentMemorySummaryContextPack()` as a ref-only compatibility wrapper over one canonical memory payload/envelope implementation. Do not create a second competing production implementation for `agent-memory-summary.v1`.

**RED tests first:**
- Existing non-empty memory-pack tests still call `buildAgentMemorySummaryContextPack()` and pass mandatory `generatedAt`, `policyVersion`, `scope`, `projectionHighWaterMark`, and `sizeBudgetBytes`.
- Add `buildAgentMemorySummaryResolvedContextPack()` or an equivalent exported resolved builder that returns `ResolvedContextPack`.
- Ref wrapper and resolved builder produce the same `ContextPackRef`.
- Non-empty memory pack includes exact upstream `sourceEventIds`, artifact hashes, `projectionHighWaterMark`, scope, policy version, size budget, and staleness input value equal to the high-water mark, not the item count.
- Empty memory without `emptyMemoryProof` throws `blocked.missing-empty-proof` or an error matching `missing-empty-proof`.
- Empty memory with `emptyMemoryProof` returns a stable `agent-memory-summary.v1` ref with provenance ref `empty-projection:agent.projection.memory:workspace:ws_case_001:hwm:0`.
- Empty proof scope/high-water mismatches throw `blocked.projection-source-mismatch`.
- Memory payload and safe summary preserve `authoritativeForOntology: false` and never claim accepted ontology truth.
- Compatibility test verifies callers can pass a bounded `memorySnapshot` instead of a full projection.
- Scalability test constructs a small bounded memory snapshot with `totalCount: 10_000`, `hasMore: true`, and unrelated omitted history counts. Increasing `totalCount` and unrelated omitted counts must not change item output length, must not require a full `AgentProjection`, and may only affect aggregate count/omission metadata.

**Targeted RED command:**

```bash
npm test -- packages/agent/test/memory.test.ts packages/agent/test/context-packs.test.ts packages/agent/test/operational-context-packs.test.ts
```

Expected RED failure: old memory-builder input contract accepts optional scope/high-water fields, empty memory emits legacy `agent.projection.memory.empty`, bounded snapshot input is unsupported, and no resolved memory builder exists.

**Implementation steps:**
- Extend memory-builder input to require `generatedAt`, `policyVersion`, `scope`, `projectionHighWaterMark`, and `sizeBudgetBytes`.
- Add a bounded input option for active-memory items, counts, omissions, window metadata, source event IDs, artifact hashes, and optional empty proof.
- Keep any projection adapter as a compatibility path that immediately normalizes into the bounded shape.
- Implement one canonical memory payload/envelope path; make the ref-only function return `.ref` from that path.
- Validate proof scope, projection name, generatedAt, source event count, and high-water mark.
- Use `projectionHighWaterMark` in both returned `ContextPackRef.projectionHighWaterMark` and `stalenessInputs`.
- Keep `sourceEventIds` limited to upstream source event IDs, and use memory lifecycle event IDs only in safe provenance refs when needed.
- Enforce size budget through `buildResolvedContextPack()` and surface `omitted.size-budget` or `blocked.size-budget` according to whether a bounded safe payload remains possible.
- Update existing test call sites in `context-packs.test.ts` to the stricter input contract.

**Targeted GREEN command:**

```bash
npm test -- packages/agent/test/memory.test.ts packages/agent/test/context-packs.test.ts packages/agent/test/operational-context-packs.test.ts
```

**Full verification:**

```bash
npm run verify
```

**Commit sequence:**
- Commit claim after `Status: claimed`.
- Commit claim after `Status: in-progress`.
- Commit implementation and evidence with message `feat: require proven operational memory packs`.

**Review gate:**
- Reviewers confirm there is one canonical memory-summary implementation, empty memory is authoritative only with proof, source links remain exact, resolved payloads are available, and scalability tests do not materialize unbounded projection history.

## Task 4: Workspace Runtime Status And Task/Run History Builders

**Files:**
- Create `docs/agentic/claims/task-4-operational-pack-builders.md`
- Modify `packages/agent/src/operational-context-packs.ts`
- Modify `packages/agent/test/operational-context-packs.test.ts`

**RED tests first for `workspace-runtime-status.v1`:**
- Builder is deterministic for identical injected safe runtime facts.
- Builder returns `ResolvedContextPack`; ref hash/size match payload bytes.
- Returned ref includes `projectionHighWaterMark`, scope, policy version, size budget, staleness input, omission codes, and safe provenance refs.
- Payload includes workspace-mounted flag, safe workspace ID, storage strategy category, bind/auth posture, provider states, diagnostic IDs, diagnostic categories, runtime high-water mark, and omission codes.
- Payload excludes raw paths, raw provider errors, prompts, model output, credentials, authorization headers, provider bodies, environment variables, and unrestricted local paths.
- Unsafe storage strategy or diagnostic text such as `/home/drake/private/workspace`, `Bearer secret`, raw stack traces, or prompt/model-output text throws `blocked.unsafe-diagnostic` or a secret-safe validation error.

**RED tests first for `task-run-history.v1`:**
- Builder consumes a bounded `OperationalTaskRunHistorySnapshot`, not a required full `AgentProjection`.
- Builder returns `ResolvedContextPack`; ref hash/size match payload bytes.
- Snapshot preserving completed, blocked, denied, failed, executing, approved, requested, queued, running, and pending states produces a deterministic ref with exact source event IDs.
- Include exact event IDs for representative terminal/blocked/denied/failed/pending facts, including `evt_agent_task_completed`, `evt_agent_task_blocked`, `evt_agent_tool_denied`, `evt_agent_tool_failed`, and `evt_agent_model_failed`.
- Include artifact hashes referenced by tool/model/task summaries.
- Exclude raw model output, raw prompt text, raw provider errors, raw tool stdout/stderr, raw paths, and credentials.
- Empty history without proof throws `blocked.missing-empty-proof`.
- Empty history with proof returns provenance ref `empty-projection:agent.projection.task-run-history:workspace:ws_case_001:hwm:0`.
- Scalability test creates a snapshot window of recent or safety-relevant items with `totalCount: 50_000`, deterministic cursor/window metadata, and aggregate omitted counts. Adding unrelated completed historical runs outside the window must not increase pack output size, output item count, or require a full `AgentProjection`.
- Budget test proves size-budget trimming preserves safety-relevant failed, blocked, denied, and pending states before lower-priority completed history; if no safety-relevant source can fit, builder throws `blocked.size-budget`.

**Targeted RED command:**

```bash
npm test -- packages/agent/test/operational-context-packs.test.ts packages/agent/test/projection.test.ts packages/agent/test/context-packs.test.ts
```

Expected RED failure: missing runtime/status/history builder exports.

**Implementation steps:**
- Add `buildWorkspaceRuntimeStatusContextPack(input)`.
- Add `buildTaskRunHistoryContextPack(input)`.
- Normalize arrays by stable IDs and state priority before hashing.
- Require bounded snapshot metadata: source high-water mark, total counts, item limit, deterministic order, cursor/window, hasMore, and aggregate omission codes.
- Preserve exact safe event IDs and artifact hashes from bounded summaries.
- Use empty-proof helper for authoritative empty history.
- Secret-check all payload strings and provenance refs before calling `buildResolvedContextPack()`.
- Keep adapters from `AgentProjection` out of the production builder contract. If a helper adapter is useful for tests or future runtime wiring, make it an explicit bounded adapter that accepts a limit/window and never exposes raw full projection output as pack input.

**Targeted GREEN command:**

```bash
npm test -- packages/agent/test/operational-context-packs.test.ts packages/agent/test/projection.test.ts packages/agent/test/context-packs.test.ts
```

**Full verification:**

```bash
npm run verify
```

**Commit sequence:**
- Commit claim after `Status: claimed`.
- Commit claim after `Status: in-progress`.
- Commit implementation and evidence with message `feat: build operational runtime and history packs`.

**Review gate:**
- Reviewers confirm no raw prompt/model/provider/path/credential material leaks, task/run states are preserved, high-water marks match staleness inputs, resolved payloads are verified, and scalability tests prove bounded construction.

## Task 5: Registration And Readiness Handoff

**Files:**
- Create `docs/agentic/claims/task-5-operational-pack-registration.md`
- Modify `packages/agent/src/operational-context-packs.ts`
- Modify `packages/agent/test/operational-context-packs.test.ts`

**RED tests first:**
- `registerOperationalContextPackBuilders(registry, provider)` registers the three descriptors/builders and returns the deterministic registration key.
- Registered builders produce `ResolvedContextPack` via `registry.buildResolved(id)` and refs via `registry.build(id)`.
- Registered builders include exact pack-specific payload parsers, and `registry.buildResolved(id)` rejects matching-hash payloads that fail those parsers.
- Re-registering with a different provider object but identical deterministic metadata and descriptor set is idempotent.
- Re-registering with a different `policyVersion`, different scope, different capability set, or altered descriptor for an already registered operational pack ID throws `blocked.conflicting-registration`.
- Registration conflict behavior does not rely on object identity.
- Builders registered through the helper call async bounded provider methods and produce the same resolved envelopes as direct builder calls.
- `buildOperationalContextPackReadinessInputs(provider)` returns exactly three resolved packs, three refs, descriptors, no blocking codes for healthy inputs, aggregate omission codes, and current projection high-water marks keyed by operational pack IDs.
- Readiness helper works with async sources and never imports or requires SQLite/local-runtime.
- Readiness helper accepts provider methods returning bounded snapshots with `totalCount`, deterministic window metadata, and omissions; it does not require an `AgentProjection`.

**Targeted RED command:**

```bash
npm test -- packages/agent/test/operational-context-packs.test.ts packages/agent/test/specialist-readiness.test.ts
```

Expected RED failure: missing registration and readiness helper exports.

**Implementation steps:**
- Add `registerOperationalContextPackBuilders(registry, provider)`.
- Track registration state by deterministic provider key and pack ID. Use module-private registry state, such as a `WeakMap<ContextPackRegistry, Map<OperationalContextPackId, string>>`, plus descriptor comparison, not object identity alone.
- Register builders that delegate to `workspaceRuntimeStatus()`, `taskRunHistorySnapshot()`, and `agentMemorySnapshot()` and then call the production pack builders.
- Attach exact `parsePayload` functions to every operational builder registration.
- Add `buildOperationalContextPackReadinessInputs(provider)` that builds all available operational resolved envelopes and returns resolved envelopes, refs, descriptors, high-water marks, blocking codes, and omission codes.
- If a provider lacks a required capability for this lane, return or throw a machine-readable blocking code according to the final function contract; tests must pin the chosen behavior.

**Targeted GREEN command:**

```bash
npm test -- packages/agent/test/operational-context-packs.test.ts packages/agent/test/specialist-readiness.test.ts
```

**Full verification:**

```bash
npm run verify
```

**Commit sequence:**
- Commit claim after `Status: claimed`.
- Commit claim after `Status: in-progress`.
- Commit implementation and evidence with message `feat: register operational context pack providers`.

**Review gate:**
- Reviewers confirm package-level registration is narrow, deterministic, idempotent, conflict-detecting, async-capable, resolved-envelope aware, exact-parser aware, and ready for a later runtime integration lane without editing shared integration files.

## Task 6: Final Verification And Runtime Integration Handoff

**Files:**
- Create `docs/agentic/claims/task-6-operational-context-pack-readiness.md`
- Optionally modify `docs/agentic/software-factory.md` only for central evidence indexing

**Final targeted command:**

```bash
npm test -- packages/agent/test/context-packs.test.ts packages/agent/test/operational-context-packs.test.ts packages/agent/test/memory.test.ts packages/agent/test/specialist-readiness.test.ts
```

**Final full verification:**

```bash
npm run verify
```

**Acceptance fixture to record in the claim:**
- The sentinel fact is exactly `payload_sentinel_case_budget_review_window_42`.
- The sentinel fact appears in `ResolvedContextPack.payload`.
- The sentinel fact does not appear in `ContextPackRef.safeSummary`, descriptor labels, omission summaries, readiness summaries, diagnostics, or public logs.
- The sentinel payload fixture passes only through the parser for its exact context pack ID/version.
- `assertResolvedContextPacksForExecution()` accepts the sentinel fixture when the matching resolved envelope is present.
- `assertResolvedContextPacksForExecution()` rejects the same ref when only a ref-only fixture is supplied.
- A forged `parserVerification: "ok"` marker in the serialized payload does not satisfy execution readiness.
- Prompt-template/prompt-runner lane must consume this fixture in its production or live-provider acceptance test and prove provider-visible prompt text can observe the sentinel payload fact.

**Runtime integration handoff to record in the claim:**
- Later local-runtime/cockpit integration should adapt authoritative local-runtime state into `OperationalContextPackProvider`.
- The adapter may use `buildAgentProjection(await ledger.readAll())` today, but it must immediately produce bounded `OperationalTaskRunHistorySnapshot` and `OperationalAgentMemorySnapshot` windows with source high-water marks, total counts, deterministic ordering/cursor/window metadata, and aggregate omissions.
- The adapter supplies caller-owned `generatedAt`, `scope`, `policyVersion`, and `sizeBudgets`.
- The integration task registers a restart-safe `ContextPackPayloadResolver` or content-addressed payload store and calls `registry.buildResolved(id)` for provider execution.
- The integration task registers exact pack-specific parsers for every operational, PRR, evidence, graph, governance, jurisdiction, timeline, and contradiction pack ID/version it resolves.
- The integration task calls `buildOperationalContextPackReadinessInputs(provider)`.
- The integration task passes returned `contextPackRefs` and `currentProjectionHighWaterMarks` to existing specialist readiness/cockpit integration points.
- The integration task passes returned `resolvedContextPacks` or equivalent resolver capability to the prompt lane.
- The integration task composes these operational refs/envelopes with PRR, evidence, graph, governance, jurisdiction, timeline, and contradiction refs/envelopes from their package-owned lanes.
- Specialist execution remains disabled until prompt-template, handoff, and workflow-runner lanes consume resolved envelopes and are separately approved.

**Files intentionally not edited by this lane:**
- `packages/local-runtime/src/agent-http-routes.ts`
- `packages/local-runtime/src/agent-runtime-factory.ts`
- `packages/local-runtime/src/agent-prompt-artifacts.ts`
- `packages/agent/src/cockpit.ts`
- `packages/agent/src/specialist-runner-kernel.ts`
- UI adapters and components

**Commit sequence:**
- Commit readiness claim after `Status: claimed`.
- Commit readiness claim after `Status: in-progress`.
- Commit final evidence with message `docs: record operational context pack readiness`.

**Review gate:**
- Run fresh spec-compliance and code-quality reviews against the approved spec, this plan, all implementation diff, and all claims.
- Reviewers confirm no shared local-runtime/cockpit/prompt-runner files were edited, one canonical memory builder exists, empty projections require proof, registration uses deterministic keys, pack construction is bounded, payload resolution is production-ready, and the handoff does not claim specialist execution readiness.

## Completion Criteria

Implementation is complete only when:

- Every task has a committed claim.
- RED tests are committed or recorded before production changes.
- Every targeted command passes.
- `npm run verify` passes after the final task.
- Review gates pass or record accepted non-blocking findings.
- The final diff owns only package-level context-pack core, operational context-pack files, tests, fixtures, claims/readiness docs, optional central evidence indexing, and `packages/agent/src/index.ts`.
- The final handoff names exact integration inputs for the later runtime/cockpit and prompt lanes.
- Scalability tests prove unrelated historical growth does not increase operational pack output or force unbounded full-projection materialization.
- Resolved-envelope tests prove production execution cannot proceed from refs and safe summaries alone.
- Legacy ref-only tests prove ordinary readiness builds still work without payload resolution.
- Pack-specific parser tests prove matching-hash invalid payloads cannot become production-resolved envelopes.
- Forged verification marker tests prove serialized payload fields cannot create trusted parser-verification authority.
