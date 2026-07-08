# Resident Agent Prompt Artifact Context Resolver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hash-only prompt resolution with explicit, durable, auditable context-pack and prompt-artifact assemblies so resident-agent model providers receive stable, provenance-backed, secret-safe input text only when policy permits provider transfer.

**Architecture:** Keep the ontology ledger as the audit source, durable artifact envelopes as inspectable provider input, and content hashes as artifact identity. Extend context pack refs so every pack names source events, artifact hashes, projection high-water marks, policy version, scope, size budget, and staleness inputs. Add prompt-artifact contracts that assemble ordered context pack refs plus omission records, prompt template metadata, safety class, provider-transfer approval metadata, and final provider text into a hash-addressed artifact envelope stored outside the ledger; runtime model invocation records only safe manifest metadata in `agent.model-invocation.requested`, passes artifact text to providers only after policy checks, and the local runtime replaces its placeholder resolver with durable prompt artifacts.

**Tech Stack:** TypeScript, Zod, Vitest, existing `packages/agent` context pack and secret-safety helpers, existing ontology event contracts, existing local-runtime SQLite handle, OpenAI-compatible provider adapters, and the live Nous Portal provider configured through ignored local settings.

## Global Constraints

- Preserve append-only ledger semantics, provenance requirements, and projection rebuildability.
- Do not store production prompt text, raw evidence bodies, credentials, provider secrets, credential-setting names, raw provider errors, or secret-shaped values in ledger events, DTOs, diagnostics, docs, tests, logs, or claim files.
- Context-pack text must be secret-safe and raw-content-free unless the prompt artifact carries `safetyClass: "provider-approved"` and an explicit `transferApprovalClass: "provider-byte-transfer"` for that provider call.
- OpenAI-compatible and Nous provider calls must keep the required Nous request tags, `include_reasoning: false`, and `reasoning: { effort: "none" }`.
- Approval remains separate from execution. This slice records and enforces prompt-transfer policy but does not execute PRR sends, provider byte-transfer tools, legal escalation, export/publication, destructive repair, or accepted graph review.
- Use deterministic unit tests for pure contracts, but treat the live Nous Portal smoke as the authoritative model/provider acceptance path for this slice. Do not substitute fake provider output for model-facing behavior.
- The shared ignored local settings are expected to provide the Nous endpoint/model/credential. Do not print those settings, the key value, or raw provider errors.
- Stop on data-loss risk, schema conflict, unavailable dependency, missing Nous provider settings, live provider failure after two focused repair attempts, or repeated verifier failure.

---

## Spec Amendment Decision

No separate spec amendment is required before implementation. The approved execution/approval design already requires explicit context packs, content-addressed prompt/input artifacts, model invocation audit metadata, provider-transfer gating, and secret-safe DTOs. This plan implements that approved behavior and includes a narrow ontology schema extension so `agent.model-invocation.requested` can record safe prompt-artifact metadata instead of only `inputArtifactHash`.

## Artifact Boundary Model

- Context pack descriptors are reusable recipes: they name a pack ID, source projection, size budget, redaction policy, and required provenance kinds.
- Context pack refs are produced inputs: they bind descriptor ID/version to source event IDs, artifact hashes, projection high-water marks, policy version, scope, size budget, staleness inputs, safe summary, and content hash.
- Prompt artifact envelopes are durable assemblies: they contain the provider text plus a manifest that names ordered context pack refs, template metadata, run type, omission records, transfer policy, safe summary, and the input artifact hash.
- Model invocation events are ledger audit entries: they record provider/model/credential refs and prompt artifact manifest metadata, never prompt text.
- Provider output artifacts are separate derivative outputs: completion events record output artifact hashes and safe usage metadata, never treating model output as accepted graph truth.
- Future cockpit surfaces should be able to show which context was used, what was omitted due to budget or policy, what hash proves the assembly, and which staleness inputs must be rechecked before reuse.

## File Structure

- `packages/agent/src/context-packs.ts`: richer context pack refs with source event IDs, artifact hashes, policy version, scope, size budget, staleness inputs, and omission-safe metadata.
- `packages/agent/src/prompt-artifacts.ts`: prompt artifact manifest/envelope schemas, stable hashing, durable serialization, policy checks, audit metadata projection, template registry, and artifact resolver.
- `packages/agent/test/prompt-artifacts.test.ts`: red/green contract tests for stable hashes, context pack binding, durable envelopes, omissions, staleness inputs, specialist template registry, secret safety, policy checks, and resolver mismatch failures.
- `packages/ontology/src/contracts.ts`: strict optional prompt artifact metadata on `agent.model-invocation.requested`.
- `packages/ontology/test/agent-contracts.test.ts`: event contract tests for context pack refs, prompt template metadata, policy values, strict unknown-field rejection, and unsafe text rejection.
- `packages/agent/src/projection-types.ts`: model invocation audit DTO types, if the projection needs to expose prompt metadata.
- `packages/agent/src/projection.ts`: replay of model invocation metadata from requested, completed, and failed events, if exposed by projection DTOs.
- `packages/agent/test/projection.test.ts`: replay tests for prompt artifact metadata, if projection DTOs are extended.
- `packages/agent/src/provider.ts`: provider request type updated to accept runtime-provided `inputText`.
- `packages/agent/src/openai-compatible-provider.ts`: OpenAI-compatible provider uses `request.inputText` instead of an adapter-local hash resolver.
- `packages/agent/test/provider.test.ts`: local provider compatibility tests after request type changes.
- `packages/agent/test/openai-compatible-provider.test.ts`: deterministic provider request-shape tests proving provider body uses artifact text, keeps Nous tags, and rejects missing/unsafe text.
- `packages/agent/src/runtime.ts`: remote-provider prompt artifact enforcement, safe model invocation request metadata, and no-provider-call failures for missing or disallowed artifact text.
- `packages/agent/src/runtime-types.ts`: browser-safe runtime DTO additions only if status exposes invocation audit.
- `packages/agent/test/runtime.test.ts`: red/green tests for missing prompt artifact, hash mismatch, disallowed remote transfer, and successful audited remote invocation.
- `packages/agent/src/index.ts`: exports `prompt-artifacts.ts`.
- `packages/local-runtime/src/agent-prompt-artifacts.ts`: deterministic local prompt artifact builder, durable blob-backed artifact repository, and resolver for runtime/provider use.
- `packages/local-runtime/src/agent-nous-smoke.ts`: live Nous Portal smoke that exercises runtime, prompt artifact, provider, and ledger audit path without printing model text or credentials.
- `packages/local-runtime/src/agent-runtime-factory.ts`: removes placeholder `resolveInputTextForLocalRuntime` and wires OpenAI-compatible providers to runtime-supplied artifact text.
- `packages/local-runtime/test/agent-prompt-artifacts.test.ts`: local context-pack and prompt artifact tests proving no placeholder hash-only prompt remains.
- `packages/local-runtime/test/agent-nous-smoke.test.ts`: smoke command redaction and output-shape tests with injected non-live dependencies.
- `packages/local-runtime/test/agent-http-routes.test.ts`: route/status regression tests remain credential-safe after factory changes.
- `package.json`: adds an explicit live Nous smoke command.
- `docs/agentic/claims/task-1-agent-prompt-artifacts.md` through `docs/agentic/claims/task-5-agent-prompt-artifact-readiness.md`: one task claim per implementation task.

## Review Gates

- Gate A after Task 1: context pack and prompt artifact contract review for hashing, durable envelope reconstruction, text safety, raw-content policy, provenance, omission/staleness metadata, specialist template extensibility, and resolver trust boundaries.
- Gate B after Task 2: ontology/runtime audit review for event schema compatibility, strict DTO safety, and projection replay behavior.
- Gate C after Tasks 3 and 4: provider/local-runtime review for no placeholder prompt text, no raw provider errors, no credential leakage, no provider call when policy blocks transfer, and a live Nous smoke path that does not expose model text or secrets.
- Gate D after Task 5: final factory readiness review before merge.

## Task 1: Context Pack And Prompt Artifact Contracts

**Files:**
- Create: `docs/agentic/claims/task-1-agent-prompt-artifacts.md`
- Create: `packages/agent/src/prompt-artifacts.ts`
- Create: `packages/agent/test/prompt-artifacts.test.ts`
- Modify: `packages/agent/src/context-packs.ts`
- Modify: `packages/agent/test/context-packs.test.ts`
- Modify: `packages/agent/src/index.ts`

**Interfaces:**
- Consumes: `ContextPackRef`, `hashAgentContextPack`, `assertAgentSecretSafeText` from `packages/agent/src/context-packs.ts` and `packages/agent/src/secret-safety.ts`.
- Produces: richer `ContextPackRef` metadata, `PromptArtifactManifest`, `PromptArtifactEnvelope`, `PromptArtifactAuditMetadata`, `PromptArtifactOmission`, `PromptArtifactStalenessInput`, `buildPromptArtifact(input)`, `serializePromptArtifactEnvelope(envelope)`, `parsePromptArtifactEnvelope(bytes)`, `assertPromptArtifactCanTransferToRemoteProvider(envelope)`, `createPromptArtifactResolver(envelopes)`, `createPromptArtifactTemplateRegistry()`, and `promptArtifactAuditMetadata(envelope)`.

- [ ] **Step 1: Claim the task**

Create `docs/agentic/claims/task-1-agent-prompt-artifacts.md` with status `claimed`, this plan path, branch name, owned files, worker identity, and claimed timestamp. Commit the claim:

```bash
git add docs/agentic/claims/task-1-agent-prompt-artifacts.md
git commit -m "chore: claim task 1 agent prompt artifacts"
```

- [ ] **Step 2: Write failing prompt artifact tests**

First modify `packages/agent/test/context-packs.test.ts` with failing cases for context pack refs that include source event IDs, artifact hashes, policy version, scope, size budget, and staleness inputs. Then create `packages/agent/test/prompt-artifacts.test.ts` with tests shaped like:

```ts
import { describe, expect, it } from "vitest";
import { buildContextPackRef } from "../src/context-packs.js";
import {
  assertPromptArtifactCanTransferToRemoteProvider,
  buildPromptArtifact,
  createPromptArtifactResolver,
  createPromptArtifactTemplateRegistry,
  promptArtifactAuditMetadata
} from "../src/prompt-artifacts.js";

const contextPackRef = buildContextPackRef({
  contextPackId: "task-run-history.v1",
  version: 1,
  generatedAt: "2026-07-08T12:00:00.000Z",
  payload: { events: ["evt_agent_task_created"] },
  safeSummary: "One resident-agent task event.",
  provenanceRefs: ["evt_agent_task_created"],
  sourceEventIds: ["evt_agent_task_created"],
  artifactHashes: [],
  policyVersion: "agent-policy-v1",
  scope: { kind: "workspace", id: "ws_case_001" },
  sizeBudgetBytes: 16_384,
  stalenessInputs: [{
    kind: "projection-high-water-mark",
    ref: "agent.projection",
    value: "42"
  }]
});

describe("resident agent prompt artifacts", () => {
  it("binds durable prompt envelopes to context pack refs and audit metadata", () => {
    const envelope = buildPromptArtifact({
      promptTemplateId: "resident-agent-context-pack.v1",
      promptTemplateVersion: 1,
      generatedAt: "2026-07-08T12:01:00.000Z",
      runType: "evidence-triage",
      safetyClass: "provider-approved",
      transferApprovalClass: "provider-byte-transfer",
      contextPackRefs: [contextPackRef],
      text: "Use the listed context pack summaries to answer with provenance.",
      safeSummary: "Provider-approved resident-agent prompt artifact.",
      omissions: [{
        reason: "budget",
        sourceRef: "evidence-summary.v1",
        safeSummary: "One evidence pack was omitted because the size budget was reached."
      }]
    });

    expect(envelope.manifest.inputArtifactHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(promptArtifactAuditMetadata(envelope)).toEqual({
      inputArtifactHash: envelope.manifest.inputArtifactHash,
      promptTemplateId: "resident-agent-context-pack.v1",
      promptTemplateVersion: 1,
      runType: "evidence-triage",
      safetyClass: "provider-approved",
      transferApprovalClass: "provider-byte-transfer",
      contextPackRefs: [contextPackRef],
      omissions: envelope.manifest.omissions,
      safeSummary: "Provider-approved resident-agent prompt artifact."
    });
  });

  it("rejects unsafe prompt text before it can reach a provider", () => {
    expect(() =>
      buildPromptArtifact({
        promptTemplateId: "resident-agent-context-pack.v1",
        promptTemplateVersion: 1,
        generatedAt: "2026-07-08T12:01:00.000Z",
        runType: "evidence-triage",
        safetyClass: "provider-approved",
        transferApprovalClass: "provider-byte-transfer",
        contextPackRefs: [contextPackRef],
        text: unsafeCredentialLikeText(),
        safeSummary: "Unsafe artifact."
      })
    ).toThrow(/secret-safe/i);
  });

  it("blocks raw-content transfer unless provider byte transfer approval is encoded", () => {
    const localOnly = buildPromptArtifact({
      promptTemplateId: "resident-agent-context-pack.v1",
      promptTemplateVersion: 1,
      generatedAt: "2026-07-08T12:01:00.000Z",
      runType: "evidence-triage",
      safetyClass: "sensitive-local-only",
      transferApprovalClass: "none",
      contextPackRefs: [contextPackRef],
      text: "Summarize locally from safe context pack metadata only.",
      safeSummary: "Local-only prompt artifact."
    });

    expect(() => assertPromptArtifactCanTransferToRemoteProvider(localOnly)).toThrow(/provider transfer/i);
  });

  it("resolves only exact known artifact hashes", async () => {
    const envelope = buildPromptArtifact({
      promptTemplateId: "resident-agent-context-pack.v1",
      promptTemplateVersion: 1,
      generatedAt: "2026-07-08T12:01:00.000Z",
      runType: "evidence-triage",
      safetyClass: "provider-approved",
      transferApprovalClass: "provider-byte-transfer",
      contextPackRefs: [contextPackRef],
      text: "Provider-approved prompt text with safe summaries only.",
      safeSummary: "Provider-approved prompt artifact."
    });
    const resolver = createPromptArtifactResolver([envelope]);

    await expect(resolver.resolve(envelope.manifest.inputArtifactHash)).resolves.toMatchObject({
      manifest: { inputArtifactHash: envelope.manifest.inputArtifactHash }
    });
    await expect(
      resolver.resolve("sha256:9999999999999999999999999999999999999999999999999999999999999999")
    ).rejects.toThrow(/not found/i);
  });

  it("registers prompt templates for all approved specialist run types", () => {
    const registry = createPromptArtifactTemplateRegistry();
    for (const runType of [
      "ontology-bootstrap",
      "prr-negotiation",
      "evidence-triage",
      "timeline-builder",
      "contradiction-finder",
      "investigation-planner",
      "report-builder"
    ] as const) {
      registry.register({
        runType,
        promptTemplateId: `${runType}.context-pack.v1`,
        promptTemplateVersion: 1,
        label: `Context pack assembly for ${runType}`
      });
    }

    expect(registry.snapshot().templates.map((template) => template.runType)).toEqual([
      "ontology-bootstrap",
      "prr-negotiation",
      "evidence-triage",
      "timeline-builder",
      "contradiction-finder",
      "investigation-planner",
      "report-builder"
    ]);
  });
});

function unsafeCredentialLikeText(): string {
  return ["Author", "ization", ": ", "Bear", "er", " ", "raw-provider-material"].join("");
}
```

- [ ] **Step 3: Run the targeted failing tests**

Run:

```bash
npm test -- packages/agent/test/prompt-artifacts.test.ts packages/agent/test/context-packs.test.ts
```

Expected before implementation:

```text
prompt artifact module is missing and context pack refs reject the richer provenance fields
```

- [ ] **Step 4: Implement prompt artifact contracts**

Modify `packages/agent/src/context-packs.ts`:

- Add optional `sourceEventIds`, `artifactHashes`, `policyVersion`, `scope`, `sizeBudgetBytes`, and `stalenessInputs` to `ContextPackRef` and `BuildContextPackRefInput`.
- Validate and freeze the new nested fields without invoking getters.
- Require `sizeBudgetBytes` to be a positive integer when present and not smaller than the resulting context pack `sizeBytes`.
- Keep old context pack refs valid so existing execution/approval tests continue to pass.

Create `packages/agent/src/prompt-artifacts.ts` with:

```ts
export type PromptArtifactSafetyClass =
  | "workspace-safe"
  | "public-safe"
  | "sensitive-local-only"
  | "provider-approved";

export type PromptArtifactTransferApprovalClass = "none" | "provider-byte-transfer";

export interface PromptArtifactManifest {
  readonly inputArtifactHash: string;
  readonly promptTemplateId: string;
  readonly promptTemplateVersion: number;
  readonly runType: AgentSpecialistRunType;
  readonly generatedAt: string;
  readonly safetyClass: PromptArtifactSafetyClass;
  readonly transferApprovalClass: PromptArtifactTransferApprovalClass;
  readonly contextPackRefs: readonly ContextPackRef[];
  readonly omissions: readonly PromptArtifactOmission[];
  readonly safeSummary: string;
}

export interface PromptArtifactEnvelope {
  readonly manifest: PromptArtifactManifest;
  readonly text: string;
}

export interface PromptArtifactAuditMetadata {
  readonly inputArtifactHash: string;
  readonly promptTemplateId: string;
  readonly promptTemplateVersion: number;
  readonly runType: AgentSpecialistRunType;
  readonly safetyClass: PromptArtifactSafetyClass;
  readonly transferApprovalClass: PromptArtifactTransferApprovalClass;
  readonly contextPackRefs: readonly ContextPackRef[];
  readonly omissions: readonly PromptArtifactOmission[];
  readonly safeSummary: string;
}
```

Implementation requirements:

- Compute `inputArtifactHash` from stable JSON over the complete artifact envelope: template metadata, run type, safety class, transfer approval class, context pack IDs/hashes, staleness inputs, omissions, prompt text, and safe summary.
- Serialize prompt artifacts as durable JSON envelopes and parse them back with the same hash; reject envelopes whose computed hash differs from the manifest hash.
- Validate prompt text and every string key/value with existing secret-safety rules without invoking getters.
- Freeze artifacts, nested arrays, nested context pack refs, and audit metadata.
- `promptArtifactAuditMetadata()` must omit `text`.
- `assertPromptArtifactCanTransferToRemoteProvider()` must allow only `provider-approved` with `provider-byte-transfer` for live Nous/OpenAI-compatible calls, and reject `workspace-safe`, `public-safe`, or `sensitive-local-only`.
- `createPromptArtifactResolver()` must reject duplicate hashes and unknown hashes.
- `createPromptArtifactTemplateRegistry()` must accept every approved specialist run type and reject unknown run types or duplicate template IDs.

- [ ] **Step 5: Export the prompt artifact surface**

Modify `packages/agent/src/index.ts`:

```ts
export * from "./prompt-artifacts.js";
```

Preserve all existing exports.

- [ ] **Step 6: Run targeted tests**

Run:

```bash
npm test -- packages/agent/test/prompt-artifacts.test.ts packages/agent/test/context-packs.test.ts
```

Expected:

```text
Test Files  2 passed
```

- [ ] **Step 7: Commit**

Run:

```bash
git add packages/agent/src/prompt-artifacts.ts packages/agent/src/context-packs.ts packages/agent/src/index.ts packages/agent/test/prompt-artifacts.test.ts packages/agent/test/context-packs.test.ts docs/agentic/claims/task-1-agent-prompt-artifacts.md
git commit -m "feat: add agent prompt artifact contracts"
```

**Acceptance Criteria:**

- Context pack refs carry source event IDs, artifact hashes, projection high-water marks, policy version, scope, size budget, and staleness inputs when available.
- Prompt artifact envelopes are durable, parseable, hash-addressed, and bound to context pack refs plus prompt text.
- Prompt text is secret-safe before any provider can receive it.
- Audit metadata is raw-text-free.
- Remote transfer policy fails closed unless the artifact is provider-approved for provider byte transfer.
- Prompt template registration is extensible across all approved resident-agent specialist run types.

**Rollback/Escalation:**

- Revert only Task 1 files if prompt artifact DTO safety conflicts with existing context-pack normalization.
- Escalate if a prompt artifact needs raw evidence text without an explicit provider-byte-transfer approval class.

## Task 2: Model Invocation Audit Metadata

**Files:**
- Create: `docs/agentic/claims/task-2-agent-model-invocation-audit.md`
- Modify: `packages/ontology/src/contracts.ts`
- Modify: `packages/ontology/test/agent-contracts.test.ts`
- Modify: `packages/agent/src/runtime.ts`
- Modify: `packages/agent/test/runtime.test.ts`
- Modify: `packages/agent/src/projection-types.ts`
- Modify: `packages/agent/src/projection.ts`
- Modify: `packages/agent/test/projection.test.ts`

**Interfaces:**
- Consumes: `PromptArtifactEnvelope`, `PromptArtifactAuditMetadata`, `promptArtifactAuditMetadata()`, and `assertPromptArtifactCanTransferToRemoteProvider()`.
- Produces: audited `agent.model-invocation.requested` payloads with context pack refs, prompt template metadata, run type, omission records, stale-input metadata, and transfer approval class. The event records the prompt artifact manifest only; prompt text remains in the durable artifact envelope outside the ledger.

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-2-agent-model-invocation-audit.md` with status `claimed`.

- [ ] **Step 2: Write failing ontology contract tests**

Modify `packages/ontology/test/agent-contracts.test.ts` to add cases that:

- Accept `agent.model-invocation.requested` with `contextPackRefs`, `promptTemplateId`, `promptTemplateVersion`, `runType`, `safePromptSummary`, `omissions`, and `transferApprovalClass`.
- Reject prompt metadata containing credential header markers, private-key markers, credential-setting names, or unknown context pack fields. Construct unsafe samples from split strings inside tests so the source file does not contain credential-shaped literals.
- Preserve strict rejection of unrelated unknown fields.

Run:

```bash
npm test -- packages/ontology/test/agent-contracts.test.ts
```

Expected before implementation:

```text
model invocation prompt metadata is rejected by the strict payload schema
```

- [ ] **Step 3: Extend ontology event schema**

Modify `packages/ontology/src/contracts.ts`:

- Add `agentContextPackRefSchema` matching the safe subset of `ContextPackRef`: `contextPackId`, `version`, `contentHash`, `sizeBytes`, `generatedAt`, `safeSummary`, `provenanceRefs`, optional `projectionHighWaterMark`, `sourceEventIds`, `artifactHashes`, `policyVersion`, `scope`, `sizeBudgetBytes`, and `stalenessInputs`.
- Add prompt metadata fields to `agentModelInvocationRequestedPayloadSchema`:

```ts
contextPackRefs: z.array(agentContextPackRefSchema).optional(),
promptTemplateId: secretSafeStringSchema.min(1).optional(),
promptTemplateVersion: z.number().int().positive().optional(),
runType: agentSpecialistRunTypeSchema.optional(),
safePromptSummary: secretSafeTextSchema.optional(),
omissions: z.array(agentPromptArtifactOmissionSchema).optional(),
transferApprovalClass: z.enum(["none", "provider-byte-transfer"]).optional()
```

- Update `eventContracts["agent.model-invocation.requested"].agentGuidance` to name context pack refs, prompt template ID/version, run type, omission records, safe prompt summary, and transfer approval class as audit metadata.
- Keep `inputArtifactHash` required and keep event version at 1 unless a reviewer identifies a compatibility reason to bump the version.

- [ ] **Step 4: Write failing runtime/projection tests**

Modify `packages/agent/test/runtime.test.ts`:

- Remote provider invocation with no prompt artifact returns `ok: false`, appends `agent.model-invocation.failed`, and does not call the provider.
- Remote provider invocation with mismatched `promptArtifact.manifest.inputArtifactHash` fails with a safe provenance diagnostic and does not call the provider.
- Remote provider invocation with `sensitive-local-only` prompt artifact fails with a safe permission diagnostic and does not call the provider.
- Remote provider invocation with `provider-approved` artifact records context pack refs, prompt template metadata, omission records, and transfer approval class in `agent.model-invocation.requested`.

Modify `packages/agent/test/projection.test.ts` only if projection DTOs expose model invocation audit records.

Run:

```bash
npm test -- packages/agent/test/runtime.test.ts packages/agent/test/projection.test.ts
```

Expected before implementation:

```text
runtime accepts hash-only remote invocation and projection has no prompt audit metadata
```

- [ ] **Step 5: Implement runtime policy and projection replay**

Modify `packages/agent/src/runtime.ts`:

- Add `promptArtifact?: PromptArtifactEnvelope` to `InvokeAgentModelInput`.
- Before calling a non-`local-engine` provider, require `promptArtifact`.
- Require `promptArtifact.manifest.inputArtifactHash === command.inputArtifactHash`.
- Call `assertPromptArtifactCanTransferToRemoteProvider(promptArtifact)` for remote providers.
- Include prompt audit metadata in `agent.model-invocation.requested`: context pack refs, prompt template ID/version, run type, safe prompt summary, omissions, and transfer approval class.
- Pass `inputText: promptArtifact.text` to the provider request only after the checks pass.
- If checks fail after a safe request event can be appended, append `agent.model-invocation.failed` with existing schema-compatible categories: `provenance-missing` for absent/mismatched artifact, `permission-denied` for transfer policy failure, and `secret-detected` for unsafe prompt artifact parsing.

Modify projection files only if runtime DTOs expose invocation audit details. If adding a projection surface, use a new `modelInvocations` array or map that contains input artifact hashes, context pack refs, prompt template metadata, omission/staleness metadata, safe summaries, status, usage, provider output artifact hash, and event IDs, never prompt text. Keep provider output artifact hashes separate from prompt input artifact hashes.

- [ ] **Step 6: Run targeted tests**

Run:

```bash
npm test -- packages/ontology/test/agent-contracts.test.ts packages/agent/test/runtime.test.ts packages/agent/test/projection.test.ts packages/agent/test/prompt-artifacts.test.ts
```

Expected:

```text
Test Files  4 passed
```

- [ ] **Step 7: Commit**

Run:

```bash
git add packages/ontology/src/contracts.ts packages/ontology/test/agent-contracts.test.ts packages/agent/src/runtime.ts packages/agent/test/runtime.test.ts packages/agent/src/projection-types.ts packages/agent/src/projection.ts packages/agent/test/projection.test.ts docs/agentic/claims/task-2-agent-model-invocation-audit.md
git commit -m "feat: audit model prompt artifacts"
```

**Acceptance Criteria:**

- Model invocation request events remain strict, secret-safe, and raw-text-free.
- Remote providers cannot be invoked through runtime with only an arbitrary `inputArtifactHash`.
- Context pack refs, prompt template metadata, omission records, and staleness inputs are auditable from ledger events or replayed DTOs.
- Provider output artifacts remain distinct from assembled prompt input artifacts.
- Local deterministic provider tests remain supported without live network.

**Rollback/Escalation:**

- Escalate on schema conflicts with existing agent event contracts.
- Revert Task 2 files if optional metadata breaks existing golden replay or strict event validation in a way that cannot be fixed without weakening validation.

## Task 3: Provider Input Text Boundary

**Files:**
- Create: `docs/agentic/claims/task-3-provider-input-text-boundary.md`
- Modify: `packages/agent/src/provider.ts`
- Modify: `packages/agent/src/openai-compatible-provider.ts`
- Modify: `packages/agent/test/provider.test.ts`
- Modify: `packages/agent/test/openai-compatible-provider.test.ts`

**Interfaces:**
- Consumes: runtime-provided `ModelInvocationRequest.inputText`.
- Produces: OpenAI-compatible provider calls that use audited prompt artifact text and never resolve arbitrary hashes internally.

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-3-provider-input-text-boundary.md` with status `claimed`.

- [ ] **Step 2: Write failing provider tests**

Modify `packages/agent/test/openai-compatible-provider.test.ts`:

- Replace the old hash-to-text resolver setup with `inputText` in `provider.invoke(...)`.
- Add a test that `OpenAICompatibleChatProvider.invoke()` rejects a request without `inputText`.
- Add a test that the captured request body contains the exact artifact text and never contains only `Cestus local runtime prompt artifact <hash>`.
- Keep the existing Nous tags assertion for `tags`, `include_reasoning: false`, and `reasoning: { effort: "none" }`.

Run:

```bash
npm test -- packages/agent/test/openai-compatible-provider.test.ts
```

Expected before implementation:

```text
OpenAI-compatible provider still requires the old hash-to-text resolver in constructor and ignores request.inputText
```

- [ ] **Step 3: Update provider request contracts**

Modify `packages/agent/src/provider.ts`:

- Add `inputText?: string` to `ModelInvocationRequest`.
- Extend the Zod request schema to validate `inputText` as non-empty secret-safe text when present.
- Keep `FakeModelProvider` compatible. It may ignore `inputText`, but it must validate it if present and must not include it in ledger-style return objects.

Modify `packages/agent/src/openai-compatible-provider.ts`:

- Remove the hash-to-text resolver from `OpenAICompatibleChatProviderOptions` and `CreateNousPortalProviderInput`.
- Require `request.inputText` in `invoke()`.
- Use `request.inputText` as the user message content.
- Keep all existing safe error messages generic.
- Keep required Nous Portal tags and reasoning settings.

- [ ] **Step 4: Run targeted tests**

Run:

```bash
npm test -- packages/agent/test/openai-compatible-provider.test.ts packages/agent/test/provider.test.ts packages/agent/test/runtime.test.ts
```

Expected:

```text
Test Files  3 passed
```

- [ ] **Step 5: Commit**

Run:

```bash
git add packages/agent/src/provider.ts packages/agent/src/openai-compatible-provider.ts packages/agent/test/provider.test.ts packages/agent/test/openai-compatible-provider.test.ts docs/agentic/claims/task-3-provider-input-text-boundary.md
git commit -m "feat: pass audited prompt text to providers"
```

**Acceptance Criteria:**

- OpenAI-compatible providers no longer accept arbitrary hash-to-text callbacks.
- Provider request bodies use runtime-supplied prompt artifact text.
- Missing provider input text fails closed before a remote request is made.
- Captured request bodies and provider results contain no credentials or raw provider errors.

**Rollback/Escalation:**

- Escalate if deterministic provider tests require secret material or raw provider diagnostics.
- Revert Task 3 files if the provider abstraction cannot accept runtime-provided text without breaking local deterministic-provider contracts.

## Task 4: Local Runtime Prompt Artifact Resolver

**Files:**
- Create: `docs/agentic/claims/task-4-local-runtime-prompt-artifacts.md`
- Create: `packages/local-runtime/src/agent-prompt-artifacts.ts`
- Create: `packages/local-runtime/src/agent-nous-smoke.ts`
- Create: `packages/local-runtime/test/agent-prompt-artifacts.test.ts`
- Create: `packages/local-runtime/test/agent-nous-smoke.test.ts`
- Modify: `packages/local-runtime/src/agent-runtime-factory.ts`
- Modify: `packages/local-runtime/test/agent-http-routes.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `LocalRuntimeHandle`, `buildContextPackRef()`, `buildPromptArtifact()`.
- Produces: `buildLocalRuntimeStatusPromptArtifact(input)`, blob-backed prompt artifact persistence, `createLocalRuntimePromptArtifactResolver(artifacts)`, and a live Nous smoke command that exercises runtime, prompt artifact, provider, and model invocation audit together.

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-4-local-runtime-prompt-artifacts.md` with status `claimed`.

- [ ] **Step 2: Write failing local-runtime tests**

Create `packages/local-runtime/test/agent-prompt-artifacts.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import { createSqlitePrrRuntime } from "../src/runtime-factory.js";
import {
  buildLocalRuntimeStatusPromptArtifact,
  createLocalRuntimePromptArtifactResolver
} from "../src/agent-prompt-artifacts.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("local runtime prompt artifacts", () => {
  it("builds a context-pack-backed prompt artifact without placeholder hash text", async () => {
    const handle = createTestHandle();
    try {
      const envelope = buildLocalRuntimeStatusPromptArtifact({
        handle,
        now: () => "2026-07-08T12:10:00.000Z"
      });

      expect(envelope.manifest.inputArtifactHash).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(envelope.manifest.contextPackRefs.map((ref) => ref.contextPackId)).toEqual(["workspace-runtime-status.v1"]);
      expect(envelope.manifest.safetyClass).toBe("provider-approved");
      expect(envelope.manifest.transferApprovalClass).toBe("provider-byte-transfer");
      expect(envelope.text).toContain("workspace runtime status");
      expect(envelope.text).not.toContain("Cestus local runtime prompt artifact");
      expect(envelope.text).not.toContain(envelope.manifest.inputArtifactHash);
      expect(JSON.stringify(envelope)).not.toMatch(unsafeTextPattern());
    } finally {
      handle.close();
    }
  });

  it("resolves only known local prompt artifacts", async () => {
    const handle = createTestHandle();
    try {
      const envelope = buildLocalRuntimeStatusPromptArtifact({
        handle,
        now: () => "2026-07-08T12:10:00.000Z"
      });
      const resolver = createLocalRuntimePromptArtifactResolver([envelope]);

      await expect(resolver.resolve(envelope.manifest.inputArtifactHash)).resolves.toMatchObject({
        manifest: { inputArtifactHash: envelope.manifest.inputArtifactHash }
      });
      await expect(
        resolver.resolve("sha256:8888888888888888888888888888888888888888888888888888888888888888")
      ).rejects.toThrow(/not found/i);
    } finally {
      handle.close();
    }
  });
});

function createTestHandle() {
  const cwd = mkdtempSync(join(tmpdir(), "cestus-agent-prompt-"));
  tempDirs.push(cwd);
  return createSqlitePrrRuntime({
    config: resolveLocalRuntimeConfig({ cwd, env: {} }),
    actor: { id: "actor_prompt_test", kind: "human", label: "Prompt Test" },
    now: () => "2026-07-08T12:10:00.000Z"
  });
}

function unsafeTextPattern(): RegExp {
  return new RegExp(["pass", "word|private ", "key|author", "ization|bear", "er"].join(""), "i");
}
```

Create `packages/local-runtime/test/agent-nous-smoke.test.ts` with injected non-live dependencies that prove the smoke command:

- prints stable JSON with `ok`, `inputArtifactHash`, `outputArtifactHash`, `invocationEventIds`, `contextPackIds`, and `omissionCount`;
- never prints prompt text, model output text, credential settings, raw provider errors, or secret-shaped values;
- exits nonzero with a generic diagnostic when provider settings are missing.

Modify `packages/local-runtime/test/agent-http-routes.test.ts` so the Nous discovery/status test still passes without the old resolver option and still leaks no credential material.

Run:

```bash
npm test -- packages/local-runtime/test/agent-prompt-artifacts.test.ts packages/local-runtime/test/agent-nous-smoke.test.ts packages/local-runtime/test/agent-http-routes.test.ts
```

Expected before implementation:

```text
local runtime prompt artifact module is missing and factory still has placeholder resolver
```

- [ ] **Step 3: Implement local prompt artifact builder**

Create `packages/local-runtime/src/agent-prompt-artifacts.ts`:

- Build `workspace-runtime-status.v1` with `buildContextPackRef()`.
- Use a deterministic prompt template ID `resident-agent-local-runtime-status.v1`.
- Include only safe runtime facts: storage strategy, bind mode, auth-required boolean, workspace-mounted boolean, safe workspace ID when mounted, and provider labels or IDs that already passed provider descriptor validation.
- Include scope, size budget, policy version, projection high-water mark when available, staleness inputs, and omissions for any context intentionally left out.
- Do not include raw file paths, credentials, provider errors, raw evidence text, PRR message bodies, old-Cestus samples, or credential-setting names.
- Return a `provider-approved` prompt artifact with `transferApprovalClass: "provider-byte-transfer"` for the live Nous model call, even when the assembled text is raw-content-free.
- Persist the prompt artifact envelope to the local blob store when a blob root is available; fall back to an in-memory resolver only in unit tests that explicitly inject it.
- Export `createLocalRuntimePromptArtifactResolver(artifacts)` as a thin wrapper around the agent package resolver.

Create `packages/local-runtime/src/agent-nous-smoke.ts`:

- Load the ignored local Nous settings through the existing local agent env loader without printing setting names or values.
- Create a local runtime over a temporary SQLite ledger.
- Build and persist a provider-approved local runtime prompt artifact.
- Initialize the resident identity, create a smoke task, start an `evidence-triage` run, and call `runtime.invokeModel()` with the live Nous provider and prompt artifact envelope.
- Print JSON containing hashes and event IDs only. Do not print prompt text or model output text.
- On provider failure, print a generic safe diagnostic and exit nonzero without echoing raw provider response material.

Modify `package.json`:

```json
"agent:nous:smoke": "tsx packages/local-runtime/src/agent-nous-smoke.ts"
```

Modify `packages/local-runtime/src/agent-runtime-factory.ts`:

- Remove the placeholder local hash-to-text resolver.
- Construct Nous/OpenAI-compatible providers without a hash resolver.
- Leave local deterministic provider behavior unchanged.

- [ ] **Step 4: Run targeted tests**

Run:

```bash
npm test -- packages/local-runtime/test/agent-prompt-artifacts.test.ts packages/local-runtime/test/agent-nous-smoke.test.ts packages/local-runtime/test/agent-http-routes.test.ts packages/agent/test/openai-compatible-provider.test.ts
```

Expected:

```text
Test Files  4 passed
```

- [ ] **Step 5: Commit**

Run:

```bash
git add packages/local-runtime/src/agent-prompt-artifacts.ts packages/local-runtime/src/agent-nous-smoke.ts packages/local-runtime/src/agent-runtime-factory.ts packages/local-runtime/test/agent-prompt-artifacts.test.ts packages/local-runtime/test/agent-nous-smoke.test.ts packages/local-runtime/test/agent-http-routes.test.ts package.json docs/agentic/claims/task-4-local-runtime-prompt-artifacts.md
git commit -m "feat: build local prompt artifacts from context packs"
```

**Acceptance Criteria:**

- The placeholder string `Cestus local runtime prompt artifact ${inputArtifactHash}` no longer exists in production code.
- Local prompt artifacts are deterministic, durable, secret-safe, raw-content-free, provider-approved for the live Nous call, and context-pack-backed.
- Live Nous smoke command exists and emits only safe hashes, event IDs, context pack IDs, and counts.
- Unknown artifact hashes fail closed.
- Provider readiness/status routes remain read-only and credential-safe.

**Rollback/Escalation:**

- Escalate if a local prompt artifact requires raw workspace paths, raw evidence bodies, provider credentials, or local credential-setting names.
- Revert Task 4 files if removing the placeholder resolver breaks provider readiness in a way that cannot be repaired without adding hash-only prompt text.

## Task 5: Verification And Readiness

**Files:**
- Create: `docs/agentic/claims/task-5-agent-prompt-artifact-readiness.md`
- Modify: `docs/agentic/software-factory.md`
- Modify: `scripts/check-agent-readiness.mjs`
- Modify: `docs/superpowers/plans/2026-07-08-resident-agent-prompt-artifact-context-resolver-implementation.md`

**Interfaces:**
- Consumes: completed Tasks 1 through 4.
- Produces: durable readiness evidence for this prompt artifact/context resolver slice.

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-5-agent-prompt-artifact-readiness.md` with status `claimed`.

- [ ] **Step 2: Run focused verification**

Run:

```bash
npm test -- packages/agent/test/prompt-artifacts.test.ts packages/agent/test/context-packs.test.ts packages/ontology/test/agent-contracts.test.ts packages/agent/test/runtime.test.ts packages/agent/test/projection.test.ts packages/agent/test/provider.test.ts packages/agent/test/openai-compatible-provider.test.ts packages/local-runtime/test/agent-prompt-artifacts.test.ts packages/local-runtime/test/agent-nous-smoke.test.ts packages/local-runtime/test/agent-http-routes.test.ts
```

Expected:

```text
Test Files  10 passed
```

- [ ] **Step 3: Run the live Nous acceptance smoke**

Run:

```bash
npm run agent:nous:smoke
```

Expected:

```text
JSON output with ok true, inputArtifactHash, outputArtifactHash, invocationEventIds, contextPackIds, and omissionCount
```

The command must not print the prompt text, model output text, provider credential, credential-setting names, raw provider response, raw provider error, raw evidence text, or local filesystem paths.

- [ ] **Step 4: Run full verification**

Run:

```bash
npm run verify
```

Expected:

```text
typecheck passed
tests passed
vite build succeeded
factory-readiness passed
```

- [ ] **Step 5: Check whitespace**

Run:

```bash
git diff --check
```

Expected:

```text
no output
```

- [ ] **Step 6: Track the plan and readiness evidence**

Modify `scripts/check-agent-readiness.mjs` to include:

```text
docs/superpowers/plans/2026-07-08-resident-agent-prompt-artifact-context-resolver-implementation.md
```

Append a `Resident Agent Prompt Artifact Context Resolver Readiness` section to `docs/agentic/software-factory.md` with:

- spec paths that authorized the behavior;
- this plan path;
- focused verification command and result;
- live Nous smoke command and safe output result;
- full verification command and result;
- whitespace command result;
- statement that provider prompts now flow through prompt artifacts bound to context pack refs;
- statement that production prompt text is not stored in ledger events, DTOs, diagnostics, docs, tests, or logs;
- statement that the live Nous smoke is an approved provider acceptance check and that no PRR send/follow-up, legal escalation, export/publication, destructive repair, or accepted graph review execution was added.

- [ ] **Step 7: Run factory check**

Run:

```bash
npm run factory:check
```

Expected:

```text
factory-readiness passed
```

- [ ] **Step 8: Commit readiness evidence**

Run:

```bash
git add docs/agentic/software-factory.md scripts/check-agent-readiness.mjs docs/superpowers/plans/2026-07-08-resident-agent-prompt-artifact-context-resolver-implementation.md docs/agentic/claims/task-5-agent-prompt-artifact-readiness.md
git commit -m "docs: record agent prompt artifact resolver readiness"
```

**Acceptance Criteria:**

- Focused tests pass.
- Live Nous smoke passes and emits only safe hashes, event IDs, context pack IDs, and counts.
- `npm run verify` passes.
- `git diff --check` has no output.
- Factory readiness tracks this plan.
- Readiness evidence names the no-raw-prompt-in-ledger and no-hidden-external-effect boundaries.

**Rollback/Escalation:**

- Escalate if full verification fails repeatedly after two focused repair attempts.
- Do not remove readiness checks or weaken secret-safety checks to pass verification.

## Completion Criteria

The slice is complete when:

- Context pack refs carry source event IDs, artifact hashes, projection high-water marks, policy version, scope, size budget, and staleness inputs when available.
- Prompt artifact contracts bind provider input text to context pack refs, template metadata, omissions, stale-input metadata, provider-transfer policy, and a stable sha256 hash.
- Prompt artifacts are durable, parseable envelopes outside the ledger, not opaque strings or transient string cache entries.
- `agent.model-invocation.requested` records safe prompt-artifact audit metadata and never records prompt text.
- Runtime refuses remote provider invocation when prompt artifact provenance is missing, hash mismatched, unsafe, stale, or not provider-approved for remote transfer.
- OpenAI-compatible providers receive runtime-supplied artifact text and no longer resolve arbitrary hash strings internally.
- Local runtime no longer contains placeholder prompt text based only on `inputArtifactHash`.
- Live Nous smoke, targeted verification, `npm run verify`, and `npm run factory:check` pass.
- Every task has a claim commit, implementation commit, and review-ready handoff.

## Task 5 Readiness Marker

Task 5 reached ready-for-review on 2026-07-08. The claim-only commit was recorded, focused verification passed, the live Nous smoke returned `ok: true` with only safe hashes, invocation event IDs, context pack IDs, and counts, full verification passed, whitespace passed, factory readiness passed with the prompt artifact context resolver plan tracked, and sanitized durable evidence was appended to `docs/agentic/software-factory.md`.
