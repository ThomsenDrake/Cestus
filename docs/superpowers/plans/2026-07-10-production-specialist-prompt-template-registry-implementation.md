# Production Specialist Prompt Template Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved production prompt-template registry, output contracts, production renderers, prompt-artifact bindings, readiness enforcement, and gated Nous acceptance for the six MVP specialist workflows.

**Architecture:** This lane consumes the operational resolved-context-pack contract and does not own the generic resolver. The agent package owns production template registrations, renderer identity, output schemas, applicability evaluation, and production prompt rendering. Runner preparation changes atomically from fallback prompt synthesis to production renderer verification, so no commit can invoke a provider from synthesized or ref-only prompt text.

**Tech Stack:** TypeScript, Node.js 26, Vitest, Zod, Cestus event ledger, existing agent prompt artifact/runtime/provider approval modules, and the Nous OpenAI-compatible provider for gated live acceptance.

## Global Constraints

- Approved spec: `docs/superpowers/specs/2026-07-10-production-specialist-prompt-template-registry-design.md`.
- Start implementation only after the operational resolved-context-pack lane has landed callable `ContextPackPayloadResolver`, `ContextPackRegistry.buildResolved(id): Promise<VerifiedResolvedContextPack>`, `VerifiedResolvedContextPack`, and `assertResolvedContextPacksForExecution(refs, resolvedPacks): readonly VerifiedResolvedContextPack[]`.
- Resolved payloads consumed by prompt preparation must be pack-parser verified by the registered context-pack system after hash and size verification through registry-owned `buildResolved()` and ordered `assertResolvedContextPacksForExecution(refs, resolvedPacks)`.
- Do not create a generic context-pack payload resolver in this lane. Consume the landed operational exports; if they are absent or incompatible, stop before editing production code.
- Do not create a competing context-pack parser registry in this lane.
- Prompt code must not manufacture or trust caller-supplied verification metadata. It may record audit rows derived from authoritative verified envelopes.
- Prompt artifacts are the sole provider text boundary.
- Production renderers consume ordered, hash-verified resolved context payload envelopes and render canonical bounded provider-safe content, not only refs, hashes, or `safeSummary`.
- Ledger events, audit DTOs, cockpit DTOs, diagnostics, claims, readiness notes, and logs store refs, hashes, counts, statuses, and safe summaries only; they never store resolved payloads, production prompt text, or provider response text.
- Model output is untrusted structured input and cannot accept ontology truth, send PRRs, escalate legally, export, clear locks, transfer new provider bytes, or execute repairs.
- Deterministic tests are credential-free. Real Nous checks are separately gated by `CESTUS_AGENT_LIVE_NOUS=1`, must be safe to record, and are required for completion of this implementation.
- The workflow descriptor applicability change, fallback removal, resolved payload readiness enforcement, and production prompt readiness enforcement must land in one implementation commit.
- Each implementation task requires a claim file in `docs/agentic/claims/`, RED test evidence, targeted GREEN evidence, `npm run verify`, a task commit, then review.

---

## File Structure

- Create `packages/agent/src/production-specialist-output-contracts.ts`: strict Zod output schemas and validators for all six provider output contracts.
- Create `packages/agent/src/production-specialist-prompts.ts`: production prompt-template registrations, renderer canonical material hashes, applicability evaluation, deterministic rendering, supplied-artifact verification, and narrow registry snapshot.
- Create `packages/agent/test/production-specialist-prompts.test.ts`: registry, renderer, applicability, resolved payload, supplied artifact, and output-contract tests.
- Modify `packages/agent/src/prompt-artifacts.ts`: production prompt-artifact binding metadata, rendered prompt hash, resolved payload retention in local envelopes, audit metadata without payload/text, and serialization/hash verification.
- Modify `packages/agent/test/prompt-artifacts.test.ts`: production binding, tamper, audit redaction, and payload-local-only tests.
- Modify `packages/agent/src/specialist-workflows.ts`: descriptor context requirement mode, provider output schema ID/version, handoff schema ID/version, and conditional PRR requirements.
- Modify `packages/agent/src/specialists.ts`: execution-status output for always and conditional context requirements.
- Modify `packages/agent/src/specialist-readiness.ts`: production prompt readiness and evaluated applicability/payload verification inputs without leaking payloads.
- Modify `packages/agent/test/specialist-workflows.test.ts`: exact descriptor applicability and schema identity assertions.
- Modify `packages/agent/test/specialist-readiness.test.ts`: PRR-linked and non-PRR readiness, payload verification, and test-only rejection tests.
- Modify `packages/agent/src/specialist-runner-kernel.ts`: require production registry, resolved payload resolver, production render or supplied artifact verification, and remove fallback provider prompt synthesis.
- Modify `packages/agent/test/specialist-runner-kernel.test.ts`: missing template, missing payload, mismatched payload, non-PRR omission, ref-only rejection, and provider-not-invoked tests.
- Modify `packages/agent/src/adapters/provider-byte-transfer.ts`: approval preview and consume-time checks for production prompt binding fields.
- Modify `packages/agent/test/provider-byte-transfer-adapter.test.ts`: rendered prompt hash, applicability, and resolved payload verification staleness tests.
- Modify `packages/agent/src/runtime.ts`, `packages/agent/src/projection.ts`, and `packages/agent/src/projection-types.ts`: audit projection parity for new prompt artifact metadata without payload/text.
- Modify `packages/agent/test/runtime.test.ts` and `packages/agent/test/projection.test.ts`: audit metadata projection and leakage tests.
- Modify `packages/agent/src/prr-negotiation-workflow.ts`, `packages/agent/src/evidence-triage-workflow.ts`, and `packages/agent/src/investigation-planner-workflow.ts`: route provider output through strict production output validators before local derivative artifacts or review requests are created.
- Modify `packages/agent/test/prr-negotiation-workflow.test.ts`, `packages/agent/test/evidence-triage-workflow.test.ts`, and `packages/agent/test/investigation-planner-workflow.test.ts`: unsafe authority claim rejection and permitted narrative text tests.
- Modify `packages/agent/test/evidence-triage-nous-live.test.ts`: production renderer live acceptance with safe sentinel payload content and non-PRR imported-evidence evidence triage.
- Modify `packages/agent/test/prr-negotiation-nous-live.test.ts`: production prompt artifact audit fixture parity after the prompt binding changes.
- Modify `packages/agent/src/index.ts`: export the new production prompt and output contract modules.

## Shared Interfaces Expected From The Operational Lane

Workers must consume these from the landed operational resolved-context contract. If these exports are absent or incompatible, stop and ask the coordinator to map the final registry-owned equivalent before editing this lane.

```ts
export interface ResolvedContextPack {
  readonly ref: ContextPackRef;
  readonly payload: AgentContextPackJsonValue;
}

declare const verifiedResolvedContextPackBrand: unique symbol;

export type VerifiedResolvedContextPack = ResolvedContextPack & {
  readonly [verifiedResolvedContextPackBrand]: true;
};

export type ContextPackPayloadResolver = (ref: ContextPackRef) =>
  | AgentContextPackJsonValue
  | ResolvedContextPack
  | Promise<AgentContextPackJsonValue | ResolvedContextPack>;

export interface ContextPackRegistry {
  buildResolved(contextPackId: string): Promise<VerifiedResolvedContextPack>;
}

export function assertResolvedContextPacksForExecution(
  refs: readonly ContextPackRef[],
  resolvedPacks: readonly ResolvedContextPack[]
): readonly VerifiedResolvedContextPack[];
```

The operational resolver owns local loading and content addressing. The operational registry owns stable JSON hashing, byte-size verification, exact pack-specific parser validation keyed by `contextPackId` and version, and the opaque/branded `VerifiedResolvedContextPack` result. Prompt code may call a `ContextPackPayloadResolver` as `resolver(ref)` only for local bytes, but a callable resolver result is not execution-ready by itself. Production prompt preparation must obtain registry-owned verified envelopes, usually with `ContextPackRegistry.buildResolved(id)`, pass the expected refs and verified envelopes to `assertResolvedContextPacksForExecution(refs, resolvedPacks)`, and send only that authoritative assertion result to production renderers. Prompt code must not manufacture verification, trust a plain verification metadata field, accept plain reloaded envelopes, or widen the branded type to a constructible plain object shape. This lane may perform production-template-specific checks against the verified resolved envelope, but it must not create alternate file, network, hash-to-text, provider-side, or parser-registry resolvers.

## Task 0: Dependency Gate And Claim Discipline

**Files:**
- Create during execution: `docs/agentic/claims/task-0-production-specialist-dependency-gate.md`

**Interfaces:**
- Consumes: operational `ResolvedContextPack`, `VerifiedResolvedContextPack`, callable `ContextPackPayloadResolver`, `ContextPackRegistry.buildResolved`, and `assertResolvedContextPacksForExecution` exports from `packages/agent/src/context-packs.ts`.
- Produces: committed claim and confirmation that implementation can begin after the operational lane.

- [ ] **Step 1: Create the task claim**

Create `docs/agentic/claims/task-0-production-specialist-dependency-gate.md`:

```markdown
# Task 0 Claim: Production Specialist Prompt Dependency Gate

Plan: docs/superpowers/plans/2026-07-10-production-specialist-prompt-template-registry-implementation.md
Task: Task 0 - Dependency Gate And Claim Discipline
Worker: codex-production-specialist-task-0
Branch: codex/production-specialist-prompt-template-registry-implementation
Worktree: /home/drake/.codex/worktrees/cde7/Cestus
Claimed At: 2026-07-10T00:00:00Z
Status: in-progress

Owned Files:
- docs/agentic/claims/task-0-production-specialist-dependency-gate.md

Verification:
- Pending dependency export check.
```

Commit the claim:

```bash
git add docs/agentic/claims/task-0-production-specialist-dependency-gate.md
git commit -m "chore: claim production specialist dependency gate"
```

- [ ] **Step 2: Verify the operational resolved-context contract is present**

Run:

```bash
rg -n "ResolvedContextPack|VerifiedResolvedContextPack|ContextPackPayloadResolver|assertResolvedContextPacksForExecution|buildResolved\\(contextPackId: string\\)|=> AgentContextPackJsonValue" packages/agent/src/context-packs.ts packages/agent/src/index.ts
```

Expected: matches for the operational exported local resolved envelope type, opaque verified envelope type, callable resolver type, registry `buildResolved` method, authoritative execution assertion, and index export. If this command has no matches, stop before editing this lane.

- [ ] **Step 3: Verify the operational context-pack suite still passes**

Run:

```bash
npm test -- packages/agent/test/context-packs.test.ts
```

Expected: PASS.

- [ ] **Step 4: Mark the claim ready for review**

Update the claim status to `ready-for-review`, record the command output names, then commit:

```bash
git add docs/agentic/claims/task-0-production-specialist-dependency-gate.md
git commit -m "docs: record production specialist dependency gate"
```

Review gate: spec review confirms this lane is sequenced after the operational resolved-context contract and did not duplicate resolver ownership.

## Task 1: Production Registrations And Output Contracts

**Files:**
- Create: `packages/agent/src/production-specialist-output-contracts.ts`
- Create: `packages/agent/src/production-specialist-prompts.ts`
- Create: `packages/agent/test/production-specialist-prompts.test.ts`
- Modify: `packages/agent/src/index.ts`
- Create during execution: `docs/agentic/claims/task-1-production-specialist-registrations.md`

**Interfaces:**
- Consumes: `AgentSpecialistRunType`, `ContextPackRef`, `AgentContextPackJsonValue`, operational `VerifiedResolvedContextPack`.
- Produces:
  - `productionSpecialistPromptRegistrations: readonly ProductionSpecialistPromptRegistration[]`
  - `productionSpecialistPromptRegistrationFor(runType: Exclude<AgentSpecialistRunType, "ontology-bootstrap">): ProductionSpecialistPromptRegistration`
  - `validateProductionSpecialistProviderOutput(input: { runType: AgentSpecialistRunType; value: unknown }): ProductionSpecialistProviderOutput`

- [ ] **Step 1: Claim the task**

Create `docs/agentic/claims/task-1-production-specialist-registrations.md` with owned files from this task, status `in-progress`, and commit:

```bash
git add docs/agentic/claims/task-1-production-specialist-registrations.md
git commit -m "chore: claim production specialist registrations"
```

- [ ] **Step 2: Write the failing registry and output-contract tests**

Create `packages/agent/test/production-specialist-prompts.test.ts` with tests that assert:

```ts
import { describe, expect, it } from "vitest";
import {
  productionSpecialistPromptRegistrationFor,
  productionSpecialistPromptRegistrations,
  validateProductionSpecialistProviderOutput
} from "../src/production-specialist-prompts.js";

describe("production specialist prompt registrations", () => {
  it("registers exactly the six approved production templates", () => {
    expect(productionSpecialistPromptRegistrations.map((registration) => registration.promptTemplateId)).toEqual([
      "prr-negotiation.review.v1",
      "evidence-triage.classify.v1",
      "timeline-builder.sourced-timeline.v1",
      "contradiction-finder.candidates.v1",
      "investigation-planner.next-steps.v1",
      "report-builder.packet-draft.v1"
    ]);
    for (const registration of productionSpecialistPromptRegistrations) {
      expect(registration.promptTemplateVersion).toBe(1);
      expect(registration.rendererVersion).toBe(1);
      expect(registration.providerOutputSchemaVersion).toBe(1);
      expect(registration.handoffSchemaVersion).toBe(1);
      expect(registration.safetyClass).toBe("provider-approved");
      expect(registration.transferApprovalClass).toBe("provider-byte-transfer");
      expect(registration.rendererHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    }
  });

  it("requires selected PRR context only where the approved spec requires it", () => {
    const prr = productionSpecialistPromptRegistrationFor("prr-negotiation");
    expect(prr.contextRequirements).toEqual(expect.arrayContaining([
      expect.objectContaining({ contextPackId: "prr-read-model.v1", requirementMode: "always" }),
      expect.objectContaining({ contextPackId: "jurisdiction-pack-summary.v1", requirementMode: "always" })
    ]));

    for (const runType of ["evidence-triage", "timeline-builder", "contradiction-finder", "investigation-planner", "report-builder"] as const) {
      const registration = productionSpecialistPromptRegistrationFor(runType);
      expect(registration.contextRequirements).toEqual(expect.arrayContaining([
        expect.objectContaining({
          contextPackId: "prr-read-model.v1",
          requirementMode: "when-scope-associated-prr",
          omissionWhenNotApplicable: "no-associated-prr"
        })
      ]));
    }
  });

  it("validates untrusted provider output without blanket rejecting narrative command-like evidence text", () => {
    const parsed = validateProductionSpecialistProviderOutput({
      runType: "evidence-triage",
      value: {
        dossierSummary: "Imported command policy evidence needs review.",
        safeSummaries: ["Public instructions mention curl as evidence text, not an action."],
        governanceFlags: [],
        duplicateGroups: [],
        evidenceGaps: [],
        assertionCandidates: [],
        requestProviderParseApproval: false,
        requestGovernanceReview: false,
        requestQuarantineReview: false,
        requestAssertionProposalReview: false
      }
    });
    expect(parsed.runType).toBe("evidence-triage");
  });

  it("rejects provider output that claims external effects or accepted ontology truth", () => {
    expect(() => validateProductionSpecialistProviderOutput({
      runType: "report-builder",
      value: {
        reportPacketId: "packet_unsafe_001",
        outlineRefs: [],
        draftSectionRefs: [],
        citationMapRefs: [],
        includedEvidenceIds: [],
        excludedEvidenceIds: [],
        governancePolicyRefs: [],
        sensitiveOptInRequirements: [],
        legalReviewFlags: [],
        exportPublicationApprovalRefs: [],
        packetSummary: "The report was published and the accepted graph was updated."
      }
    })).toThrow(/authority|external effect|ontology/i);
  });
});
```

- [ ] **Step 3: Run RED**

Run:

```bash
npm test -- packages/agent/test/production-specialist-prompts.test.ts
```

Expected: FAIL because `../src/production-specialist-prompts.js` does not exist.

- [ ] **Step 4: Implement production registration and output-contract modules**

Create `packages/agent/src/production-specialist-output-contracts.ts` with strict schemas for:

```ts
export type ProductionSpecialistProviderOutput =
  | { readonly runType: "prr-negotiation"; readonly value: PrrNegotiationReviewOutput }
  | { readonly runType: "evidence-triage"; readonly value: EvidenceTriageClassifyOutput }
  | { readonly runType: "timeline-builder"; readonly value: TimelineBuilderSourcedTimelineOutput }
  | { readonly runType: "contradiction-finder"; readonly value: ContradictionFinderCandidatesOutput }
  | { readonly runType: "investigation-planner"; readonly value: InvestigationPlannerNextStepsOutput }
  | { readonly runType: "report-builder"; readonly value: ReportBuilderPacketDraftOutput };

export function validateProductionSpecialistProviderOutput(input: {
  readonly runType: Exclude<AgentSpecialistRunType, "ontology-bootstrap">;
  readonly value: unknown;
}): ProductionSpecialistProviderOutput;
```

The schemas must be strict, per-field, and reject authority claims with a shared helper that detects claims of completed send, export, legal escalation, repair execution, ontology acceptance, entity resolution, relationship acceptance, lock clearing, or provider byte-transfer approval.

Create `packages/agent/src/production-specialist-prompts.ts` with:

```ts
export type ProductionContextRequirementMode = "always" | "when-scope-associated-prr";
export type ProductionPromptOmissionCategory =
  | "context-budget"
  | "policy-redaction"
  | "raw-content-local-only"
  | "quarantine-or-lock"
  | "optional-pack-unavailable"
  | "no-associated-prr";

export interface ProductionContextRequirement {
  readonly contextPackId: string;
  readonly order: number;
  readonly requirementMode: ProductionContextRequirementMode;
  readonly omissionWhenNotApplicable?: "no-associated-prr";
}

export interface ProductionSpecialistPromptRegistration {
  readonly runType: Exclude<AgentSpecialistRunType, "ontology-bootstrap">;
  readonly promptTemplateId: string;
  readonly promptTemplateVersion: 1;
  readonly rendererId: string;
  readonly rendererVersion: 1;
  readonly rendererHash: `sha256:${string}`;
  readonly providerOutputSchemaId: string;
  readonly providerOutputSchemaVersion: 1;
  readonly handoffSchemaId: string;
  readonly handoffSchemaVersion: 1;
  readonly contextRequirements: readonly ProductionContextRequirement[];
  readonly allowedOmissions: readonly ProductionPromptOmissionCategory[];
  readonly safetyClass: "provider-approved";
  readonly transferApprovalClass: "provider-byte-transfer";
}
```

Export all six immutable registrations with the exact IDs from the spec. Compute `rendererHash` from canonical stable JSON material in the module, not from compiled JavaScript or runtime state.

Modify `packages/agent/src/index.ts`:

```ts
export * from "./production-specialist-output-contracts.js";
export * from "./production-specialist-prompts.js";
```

- [ ] **Step 5: Run GREEN and full verification**

Run:

```bash
npm test -- packages/agent/test/production-specialist-prompts.test.ts
npm run verify
```

Expected: both commands PASS.

- [ ] **Step 6: Commit and review**

Update the claim with RED/GREEN/verify evidence and status `ready-for-review`, then commit:

```bash
git add packages/agent/src/production-specialist-output-contracts.ts packages/agent/src/production-specialist-prompts.ts packages/agent/test/production-specialist-prompts.test.ts packages/agent/src/index.ts docs/agentic/claims/task-1-production-specialist-registrations.md
git commit -m "feat: register production specialist prompt contracts"
```

Review gate: spec review checks exact six registrations, context requirements, schema IDs, output authority restrictions, and renderer hash determinism.

## Task 2: Production Prompt Artifact Binding

**Files:**
- Modify: `packages/agent/src/prompt-artifacts.ts`
- Modify: `packages/agent/test/prompt-artifacts.test.ts`
- Modify: `packages/agent/test/production-specialist-prompts.test.ts`
- Create during execution: `docs/agentic/claims/task-2-production-prompt-artifact-binding.md`

**Interfaces:**
- Consumes: operational `VerifiedResolvedContextPack`, production registration metadata from Task 1.
- Produces:
  - `PromptArtifactProductionBinding`
  - `PromptArtifactResolvedPayloadAudit`
  - production-aware `buildPromptArtifact()`
  - production-aware `promptArtifactAuditMetadata()` that excludes text and payloads.

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-2-production-prompt-artifact-binding.md`:

```bash
git add docs/agentic/claims/task-2-production-prompt-artifact-binding.md
git commit -m "chore: claim production prompt artifact binding"
```

- [ ] **Step 2: Write RED tests**

Extend `packages/agent/test/prompt-artifacts.test.ts` with assertions that:

```ts
it("binds production renderer metadata and resolved payload audits without exposing payloads in audit metadata", async () => {
  const verifiedResolvedEvidenceSummary = await contextPackRegistry.buildResolved("evidence-summary.v1");
  const contextPackRef = verifiedResolvedEvidenceSummary.ref;
  const verifiedResolvedContextPacks = assertResolvedContextPacksForExecution(
    [contextPackRef],
    [verifiedResolvedEvidenceSummary]
  );
  expect(verifiedResolvedContextPacks).toHaveLength(1);
  expect(verifiedResolvedContextPacks[0]).toBe(verifiedResolvedEvidenceSummary);
  const envelope = buildPromptArtifact({
    promptTemplateId: "evidence-triage.classify.v1",
    promptTemplateVersion: 1,
    generatedAt: "2026-07-10T12:00:00.000Z",
    runType: "evidence-triage",
    safetyClass: "provider-approved",
    transferApprovalClass: "provider-byte-transfer",
    contextPackRefs: [contextPackRef],
    text: "Rendered prompt contains bounded payload content.",
    safeSummary: "Provider-approved evidence triage prompt artifact.",
    production: {
      rendererId: "evidence-triage.classify.renderer",
      rendererVersion: 1,
      rendererHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      renderedPromptHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      providerOutputSchemaId: "evidence-triage.classify-output.v1",
      providerOutputSchemaVersion: 1,
      handoffSchemaId: "evidence-triage-handoff.v1",
      handoffSchemaVersion: 1,
      scopeApplicabilityHash: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      evaluatedContextRequirements: [{
        contextPackId: "evidence-summary.v1",
        requirementMode: "always",
        status: "applicable",
        contentHash: contextPackRef.contentHash
      }],
      resolvedPayloadAudits: [{
        contextPackId: "evidence-summary.v1",
        contentHash: contextPackRef.contentHash,
        sizeBytes: contextPackRef.sizeBytes,
        schemaId: "evidence-summary.v1"
      }]
    },
    resolvedContextPacks: [verifiedResolvedEvidenceSummary]
  });

  const audit = promptArtifactAuditMetadata(envelope);
  expect(audit.production?.renderedPromptHash).toMatch(/^sha256:/);
  expect(JSON.stringify(audit)).not.toContain("payload-only-fact");
  expect(JSON.stringify(audit)).not.toContain("Rendered prompt contains bounded payload content");
});
```

Add tamper tests that mutate `text`, `production.renderedPromptHash`, and `production.scopeApplicabilityHash` in a serialized envelope and assert `parsePromptArtifactEnvelope()` rejects the tampered bytes.
The `contextPackRegistry.buildResolved()` fixture and `assertResolvedContextPacksForExecution(refs, resolvedPacks)` call must come from the final operational contract confirmed in Task 0. Do not create verified envelopes with a plain object literal, `verifyResolvedContextPack()`, serialized/reloaded data, or a caller-supplied marker in this lane.

- [ ] **Step 3: Run RED**

Run:

```bash
npm test -- packages/agent/test/prompt-artifacts.test.ts packages/agent/test/production-specialist-prompts.test.ts
```

Expected: FAIL because production binding fields are unsupported.

- [ ] **Step 4: Extend prompt artifact manifest and audit metadata**

Modify `packages/agent/src/prompt-artifacts.ts` to add:

```ts
export interface PromptArtifactResolvedPayloadAudit {
  readonly contextPackId: string;
  readonly contentHash: string;
  readonly sizeBytes: number;
  readonly schemaId: string;
}

export interface PromptArtifactEvaluatedContextRequirement {
  readonly contextPackId: string;
  readonly requirementMode: "always" | "when-scope-associated-prr";
  readonly status: "applicable" | "not-applicable";
  readonly contentHash?: string;
  readonly omissionReason?: "no-associated-prr";
}

export interface PromptArtifactProductionBinding {
  readonly rendererId: string;
  readonly rendererVersion: number;
  readonly rendererHash: string;
  readonly renderedPromptHash: string;
  readonly providerOutputSchemaId: string;
  readonly providerOutputSchemaVersion: number;
  readonly handoffSchemaId: string;
  readonly handoffSchemaVersion: number;
  readonly scopeApplicabilityHash: string;
  readonly evaluatedContextRequirements: readonly PromptArtifactEvaluatedContextRequirement[];
  readonly resolvedPayloadAudits: readonly PromptArtifactResolvedPayloadAudit[];
}
```

Add optional `production?: PromptArtifactProductionBinding` to `PromptArtifactManifest`, `PromptArtifactAuditMetadata`, and `BuildPromptArtifactInput`. Add optional local-only `resolvedContextPacks?: readonly VerifiedResolvedContextPack[]` to `PromptArtifactEnvelope` and `BuildPromptArtifactInput`; keep it out of `PromptArtifactAuditMetadata`.

Hashing and parsing rules:

- `inputArtifactHash` covers the manifest, production binding, omissions, safe summary, and prompt text.
- `renderedPromptHash` covers prompt text bytes only.
- `resolvedContextPacks` may be serialized in local envelopes but never appears in audit metadata.
- `assertPromptArtifactCanTransferToRemoteProvider()` requires `provider-approved`, `provider-byte-transfer`, and a complete `production` binding when `runType` is one of the six MVP specialist modes.
- Production prompt artifact construction accepts only authoritative verified resolved context envelopes returned by `assertResolvedContextPacksForExecution(refs, resolvedPacks)` over registry-owned branded results. It must not accept caller-supplied plain objects that merely contain matching metadata.
- `resolvedPayloadAudits` are derived from the authoritative verified envelopes after construction; they are not a verification proof and must not be accepted as a substitute for the operational verified envelope.

- [ ] **Step 5: Run GREEN and full verification**

Run:

```bash
npm test -- packages/agent/test/prompt-artifacts.test.ts packages/agent/test/production-specialist-prompts.test.ts
npm run verify
```

Expected: PASS.

- [ ] **Step 6: Commit and review**

Update claim evidence and commit:

```bash
git add packages/agent/src/prompt-artifacts.ts packages/agent/test/prompt-artifacts.test.ts packages/agent/test/production-specialist-prompts.test.ts docs/agentic/claims/task-2-production-prompt-artifact-binding.md
git commit -m "feat: bind production prompt artifact metadata"
```

Review gate: code-quality review checks prompt text and resolved payloads do not enter audit metadata.

## Task 3: Deterministic Production Renderers

**Files:**
- Modify: `packages/agent/src/production-specialist-prompts.ts`
- Modify: `packages/agent/test/production-specialist-prompts.test.ts`
- Create during execution: `docs/agentic/claims/task-3-production-specialist-renderers.md`

**Interfaces:**
- Consumes: production registrations, prompt artifact production binding, operational resolved context envelopes.
- Produces:
  - `evaluateProductionContextRequirements(input): EvaluatedProductionContext`
  - `renderProductionSpecialistPrompt(input): PromptArtifactEnvelope`
  - `verifyProductionSpecialistPromptArtifact(input): PromptArtifactEnvelope`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-3-production-specialist-renderers.md`:

```bash
git add docs/agentic/claims/task-3-production-specialist-renderers.md
git commit -m "chore: claim production specialist renderers"
```

- [ ] **Step 2: Write RED renderer tests**

Extend `packages/agent/test/production-specialist-prompts.test.ts` to assert:

```ts
it("renders payload-only sentinel content and keeps clock changes out of rendered prompt hash", async () => {
  const resolved = resolvedPack("evidence-summary.v1", {
    evidence: [{ evidenceId: "ev_imported_001", safeFact: "PAYLOAD_SENTINEL_CITY_LEDGER_427" }]
  }, "Evidence summary does not include the sentinel.");

  const first = renderProductionSpecialistPrompt({
    runType: "evidence-triage",
    runId: "run_render_001",
    taskId: "task_render_001",
    generatedAt: "2026-07-10T12:00:00.000Z",
    scope: { kind: "imported-evidence", refs: ["ev_imported_001"] },
    resolvedContextPacks: resolvedEvidenceTriagePacks([resolved]),
    omissions: []
  });
  const second = renderProductionSpecialistPrompt({
    runType: "evidence-triage",
    runId: "run_render_001",
    taskId: "task_render_001",
    generatedAt: "2026-07-10T12:05:00.000Z",
    scope: { kind: "imported-evidence", refs: ["ev_imported_001"] },
    resolvedContextPacks: resolvedEvidenceTriagePacks([resolved]),
    omissions: []
  });

  expect(first.text).toContain("PAYLOAD_SENTINEL_CITY_LEDGER_427");
  expect(first.text).not.toContain("Evidence summary does not include the sentinel.");
  expect(first.manifest.production?.renderedPromptHash).toBe(second.manifest.production?.renderedPromptHash);
  expect(first.manifest.inputArtifactHash).not.toBe(second.manifest.inputArtifactHash);
});
```

Add RED tests for:

- `no-associated-prr` omission for non-PRR evidence triage, planner, and report builder.
- PRR-linked evidence triage, planner, and report builder requiring `prr-read-model.v1`.
- matching-hash and matching-size payloads with invalid pack-specific shape rejected by `assertResolvedContextPacksForExecution(refs, resolvedPacks)` before the renderer receives an envelope.
- forged plain objects that imitate the verified envelope shape rejected before render.
- supplied artifact rejected on renderer hash, rendered prompt hash, payload audit, scope hash, output schema, handoff schema, safety class, transfer class, and omission mismatch.
- renderer with only refs/hashes/summaries rejected by `verifyProductionSpecialistPromptArtifact()`.

- [ ] **Step 3: Run RED**

Run:

```bash
npm test -- packages/agent/test/production-specialist-prompts.test.ts
```

Expected: FAIL because renderer functions are absent.

- [ ] **Step 4: Implement renderer and verification functions**

Implement in `packages/agent/src/production-specialist-prompts.ts`:

```ts
export interface ProductionRunScope {
  readonly kind: string;
  readonly refs: readonly string[];
  readonly associatedPrrRequestId?: string;
}

export interface EvaluatedProductionContext {
  readonly scopeApplicabilityHash: `sha256:${string}`;
  readonly requirements: readonly PromptArtifactEvaluatedContextRequirement[];
  readonly applicableContextPackIds: readonly string[];
  readonly omissions: readonly PromptArtifactOmission[];
}

export interface RenderProductionSpecialistPromptInput {
  readonly runType: Exclude<AgentSpecialistRunType, "ontology-bootstrap">;
  readonly runId: string;
  readonly taskId: string;
  readonly generatedAt: string;
  readonly scope: ProductionRunScope;
  readonly resolvedContextPacks: readonly VerifiedResolvedContextPack[];
  readonly omissions?: readonly PromptArtifactOmission[];
}
```

Rendering rules:

- Resolve registration by `runType`.
- Evaluate applicability before rendering.
- Require one resolved payload envelope for every applicable context requirement in registered order.
- Accept only verified envelopes returned by `assertResolvedContextPacksForExecution(refs, resolvedPacks)` over registry-owned branded results, then verify each envelope's `ref.contentHash`, `ref.sizeBytes`, `ref.contextPackId`, and `ref.version` against the expected requirement and payload.
- Render deterministic prompt text from package-owned template material and canonical payload field renderers.
- Include provider-output JSON schema instructions and authority restrictions in every template.
- Build `PromptArtifactEnvelope` with production binding and resolved payload local envelope retention.
- Reject prompt text that omits all provider-useful payload content for an applicable pack.

Verification rules:

- Re-evaluate context requirements from the current scope.
- Re-render from current resolved payloads.
- Compare renderer identity, renderer hash, rendered prompt hash, prompt artifact hash, context order, context hashes, scope applicability hash, omission reasons, output schema, handoff schema, safety class, and transfer class.

- [ ] **Step 5: Run GREEN and full verification**

Run:

```bash
npm test -- packages/agent/test/production-specialist-prompts.test.ts
npm run verify
```

Expected: PASS.

- [ ] **Step 6: Commit and review**

Update claim evidence and commit:

```bash
git add packages/agent/src/production-specialist-prompts.ts packages/agent/test/production-specialist-prompts.test.ts docs/agentic/claims/task-3-production-specialist-renderers.md
git commit -m "feat: render production specialist prompts"
```

Review gate: spec review checks renderer ownership, deterministic hashes, payload sentinel coverage, and ref-only rejection.

## Task 4: Atomic Workflow Applicability, Readiness, And Fallback Closure

**Files:**
- Modify: `packages/agent/src/specialist-workflows.ts`
- Modify: `packages/agent/src/specialists.ts`
- Modify: `packages/agent/src/specialist-readiness.ts`
- Modify: `packages/agent/src/specialist-runner-kernel.ts`
- Modify: `packages/agent/test/specialist-workflows.test.ts`
- Modify: `packages/agent/test/specialist-readiness.test.ts`
- Modify: `packages/agent/test/specialist-runner-kernel.test.ts`
- Create during execution: `docs/agentic/claims/task-4-production-readiness-fallback-closure.md`

**Interfaces:**
- Consumes: Task 3 production registry/renderers, operational `ContextPackRegistry.buildResolved`, callable `ContextPackPayloadResolver`, and `assertResolvedContextPacksForExecution`.
- Produces: no reachable fallback provider prompt synthesis, conditional PRR applicability in workflow descriptors, and production prompt readiness enforcement.

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-4-production-readiness-fallback-closure.md`:

```bash
git add docs/agentic/claims/task-4-production-readiness-fallback-closure.md
git commit -m "chore: claim production readiness fallback closure"
```

- [ ] **Step 2: Write RED descriptor, readiness, and runner tests**

Update `packages/agent/test/specialist-workflows.test.ts` to assert:

- `prr-negotiation` has `prr-read-model.v1` and `jurisdiction-pack-summary.v1` as `requirementMode: "always"`.
- the other five modes have `prr-read-model.v1` as `requirementMode: "when-scope-associated-prr"` and `omissionWhenNotApplicable: "no-associated-prr"`.
- prompt descriptors expose distinct `promptTemplateId`, `providerOutputSchemaId`, and `handoffSchemaId`.

Update `packages/agent/test/specialist-readiness.test.ts` with:

```ts
it("treats absent PRR context as a bounded omission for non-PRR imported evidence readiness", () => {
  const descriptor = specialistWorkflowDescriptorFor("evidence-triage");
  const readiness = projectSpecialistWorkflowReadiness(readyInput(descriptor, {
    scope: { kind: "imported-evidence", refs: ["ev_imported_001"] },
    contextPackRefs: refsFor(descriptor).filter((ref) => ref.contextPackId !== "prr-read-model.v1"),
    resolvedContextPacks: resolvedRefsFor(descriptor).filter((resolved) => resolved.ref.contextPackId !== "prr-read-model.v1")
  }));
  expect(readiness.contextReady).toBe(true);
  expect(readiness.missingContextPackIds).toEqual([]);
  expect(readiness.contextOmissions).toEqual(expect.arrayContaining([
    expect.objectContaining({ reason: "no-associated-prr", sourceRef: "prr-read-model.v1" })
  ]));
});
```

Add readiness tests for:

- PRR-linked evidence triage, planner, and report builder block without `prr-read-model.v1`.
- non-PRR evidence triage, planner, and report builder are not blocked by absent `prr-read-model.v1`.
- missing resolved payload verification blocks readiness.
- `production: false`, test-only, or thin prompt registrations do not satisfy prompt readiness.

Update `packages/agent/test/specialist-runner-kernel.test.ts` with:

- `prepareSpecialistRun()` rejects missing production registration before provider invocation.
- `prepareSpecialistRun()` rejects missing payload resolver before provider invocation.
- `prepareSpecialistRun()` rejects payload hash mismatch before provider invocation.
- `prepareSpecialistRun()` rejects a matching-hash payload whose pack-specific shape is invalid because `assertResolvedContextPacksForExecution(refs, resolvedPacks)` fails before returning a verified envelope.
- `prepareSpecialistRun()` rejects forged plain resolved-payload objects before provider invocation.
- non-PRR evidence triage render records `no-associated-prr`.
- a fake runtime spy is not called when preparation fails.
- a supplied test prompt artifact with matching hashes but no production binding is rejected.

- [ ] **Step 3: Run RED**

Run:

```bash
npm test -- packages/agent/test/specialist-workflows.test.ts packages/agent/test/specialist-readiness.test.ts packages/agent/test/specialist-runner-kernel.test.ts
```

Expected: FAIL because descriptors, readiness, and runner still use flat required packs and fallback prompt synthesis.

- [ ] **Step 4: Implement the atomic migration**

Modify `packages/agent/src/specialist-workflows.ts`:

- Replace `required: boolean` with `requirementMode: "always" | "when-scope-associated-prr"`.
- Add `omissionWhenNotApplicable?: "no-associated-prr"`.
- Add prompt descriptor fields `providerOutputSchemaId`, `providerOutputSchemaVersion`, `handoffSchemaId`, and `handoffSchemaVersion`.
- Update the six descriptors according to the approved spec.

Modify `packages/agent/src/specialists.ts`:

- Preserve browser-safe status output.
- Include always-applicable context IDs and conditional context IDs separately.
- Do not mark conditional PRR absence as missing.

Modify `packages/agent/src/specialist-readiness.ts`:

- Add `scope: ProductionRunScope`.
- Add production registrations from Task 1.
- Add `resolvedContextPacks: readonly VerifiedResolvedContextPack[]` derived from `ContextPackRegistry.buildResolved(id)` and `assertResolvedContextPacksForExecution(refs, resolvedPacks)`.
- Evaluate applicability with Task 3 helpers.
- Report bounded omissions without payloads.
- Reject missing production registration, test-only registration, missing resolved payload audit, stale ref, stale payload, operational assertion pack-specific parser failure, forged verified-envelope objects, active locks, missing approvals, and provider posture gaps.

Modify `packages/agent/src/specialist-runner-kernel.ts`:

- Add `productionPromptRegistry` or imported package-owned registry from Task 1.
- Add `contextPacks: ContextPackRegistry` or the existing injected registry capability to `SpecialistRunnerBaseInput`; do not replace it with an unbranded local payload resolver.
- Build context refs, evaluate applicability, resolve every applicable pack through `contextPacks.buildResolved(contextPackId)`, call `assertResolvedContextPacksForExecution(refs, resolvedPacks)`, pass only the returned verified envelopes to the renderer, render or verify a production prompt artifact, then return prepared data. If a `ContextPackPayloadResolver` is used inside an operational fixture, call it as `resolver(ref)`, never `resolver.resolve(ref)`, and never treat its plain result as verified.
- Treat operational assertion parser failures as preparation failures before model invocation, even when the payload hash and size match the ref.
- Remove the generated workspace-safe fallback from provider execution. Delete or isolate `promptText()` so no provider path can call it.
- Require production prompt artifact binding before `invokeSpecialistModel()`.

- [ ] **Step 5: Run GREEN and full verification**

Run:

```bash
npm test -- packages/agent/test/specialist-workflows.test.ts packages/agent/test/specialist-readiness.test.ts packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/production-specialist-prompts.test.ts
npm run verify
```

Expected: PASS.

- [ ] **Step 6: Search for unreachable fallback provider synthesis**

Run:

```bash
rg -n "safe context-pack references only|Use only safe context-pack identifiers|promptText\\(" packages/agent/src packages/agent/test
```

Expected: no reachable production provider prompt synthesis. Test fixture references are allowed only when asserting rejection.

- [ ] **Step 7: Commit and review**

Update claim evidence and commit:

```bash
git add packages/agent/src/specialist-workflows.ts packages/agent/src/specialists.ts packages/agent/src/specialist-readiness.ts packages/agent/src/specialist-runner-kernel.ts packages/agent/test/specialist-workflows.test.ts packages/agent/test/specialist-readiness.test.ts packages/agent/test/specialist-runner-kernel.test.ts docs/agentic/claims/task-4-production-readiness-fallback-closure.md
git commit -m "feat: enforce production specialist prompt readiness"
```

Review gate: spec review checks this commit is atomic for descriptor applicability, fallback removal, resolved payload readiness, and production prompt enforcement.

## Task 5: Provider Transfer Approval And Audit Projection Binding

**Files:**
- Modify by coordinator-approved support: `packages/ontology/src/contracts.ts`
- Modify by coordinator-approved support: `packages/ontology/test/agent-contracts.test.ts`
- Modify: `packages/agent/src/adapters/provider-byte-transfer.ts`
- Modify: `packages/agent/test/provider-byte-transfer-adapter.test.ts`
- Modify: `packages/agent/src/runtime.ts`
- Modify: `packages/agent/src/projection.ts`
- Modify: `packages/agent/src/projection-types.ts`
- Modify: `packages/agent/test/runtime.test.ts`
- Modify: `packages/agent/test/projection.test.ts`
- Create during execution: `docs/agentic/claims/task-5-production-prompt-approval-binding.md`

**Interfaces:**
- Consumes: production prompt artifact audit metadata from Task 2.
- Produces: provider byte-transfer approval and model invocation audit binding for exact rendered bytes, applicability, context hashes, and payload verification statuses.

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-5-production-prompt-approval-binding.md`:

```bash
git add docs/agentic/claims/task-5-production-prompt-approval-binding.md
git commit -m "chore: claim production prompt approval binding"
```

- [ ] **Step 2: Write RED approval and audit tests**

Coordinator-approved support after schema-conflict stop:

- Add optional strict `production` audit binding to `agent.model-invocation.requested` v1 in `packages/ontology/src/contracts.ts` so old ledger events remain replay-valid.
- Mirror only safe `PromptArtifactProductionBinding` fields: renderer ID/version/hash, rendered prompt hash, provider output schema ID/version, handoff schema ID/version, scope applicability hash, evaluated context requirement ID/mode/status/contentHash-or-`no-associated-prr`, and resolved payload audit contextPackId/contentHash/sizeBytes/schemaId.
- Use strict nested schemas, hash patterns, bounded safe IDs, nonnegative sizes, positive versions, and applicable/not-applicable cross-field rules. Reject unknown fields and generic metadata bags.
- Runtime must require this production binding for the six MVP production run types; ontology parsing must keep it optional for historical replay.
- Add ontology RED/GREEN tests for valid production audit metadata, unknown/nested unsafe fields, invalid requirement status combinations, and backward-compatible old events.
- Provider-transfer preview/freshness, runtime append, projection DTOs, and consume-time approval checks must bind the same normalized production audit object without prompt text, provider response text, resolved payload values, credentials, request bodies, hidden paths, or generic metadata bags.

Extend `packages/agent/test/provider-byte-transfer-adapter.test.ts` to assert:

- preview output includes `renderedPromptHash`, `scopeApplicabilityHash`, `providerOutputSchemaId`, `handoffSchemaId`, and resolved payload verification status.
- preview idempotency changes when `renderedPromptHash`, `scopeApplicabilityHash`, evaluated context requirement status, or resolved payload verification status changes.
- `rebuildProviderByteTransferCurrentPreview()` marks prompt artifact freshness false when the current audit differs in any production binding field.
- preview JSON does not contain prompt text, resolved payload text, provider response text, raw request body, or hidden local paths.

Extend `packages/agent/test/runtime.test.ts` and `packages/agent/test/projection.test.ts` to assert:

- `agent.model-invocation.requested` records production audit metadata only.
- projection DTOs include refs/hashes/statuses only.
- serialized projection output does not include resolved payload sentinel or prompt text.

- [ ] **Step 3: Run RED**

Run:

```bash
npm test -- packages/ontology/test/agent-contracts.test.ts packages/agent/test/provider-byte-transfer-adapter.test.ts packages/agent/test/runtime.test.ts packages/agent/test/projection.test.ts
```

Expected: FAIL because the production prompt audit fields are not yet bound.

- [ ] **Step 4: Implement audit binding**

Modify `packages/agent/src/adapters/provider-byte-transfer.ts`:

- Extend prompt audit parsing to accept the production binding object.
- Include production fields in preview affected refs, provenance refs, idempotency hash, freshness checks, and consume-time comparison.
- Reject unsupported production audit fields and reject missing production binding for the six MVP specialist run types.

Modify `packages/agent/src/runtime.ts`, `packages/agent/src/projection.ts`, and `packages/agent/src/projection-types.ts`:

- Carry production audit metadata in model invocation events and projections.
- Project only refs, hashes, versions, statuses, and safe summaries.
- Keep prompt text, provider output text, and resolved payloads out of events and DTOs.

- [ ] **Step 5: Run GREEN and full verification**

Run:

```bash
npm test -- packages/ontology/test/agent-contracts.test.ts packages/agent/test/provider-byte-transfer-adapter.test.ts packages/agent/test/runtime.test.ts packages/agent/test/projection.test.ts
npm run verify
```

Expected: PASS.

- [ ] **Step 6: Commit and review**

Update claim evidence and commit:

```bash
git add packages/ontology/src/contracts.ts packages/ontology/test/agent-contracts.test.ts packages/agent/src/adapters/provider-byte-transfer.ts packages/agent/test/provider-byte-transfer-adapter.test.ts packages/agent/src/runtime.ts packages/agent/src/projection.ts packages/agent/src/projection-types.ts packages/agent/test/runtime.test.ts packages/agent/test/projection.test.ts docs/agentic/claims/task-5-production-prompt-approval-binding.md
git commit -m "feat: bind provider transfer to production prompt audit"
```

Review gate: code-quality review checks approval staleness and DTO leakage.

## Task 6: Workflow Output Validation Integration

**Files:**
- Modify: `packages/agent/src/prr-negotiation-workflow.ts`
- Modify: `packages/agent/src/evidence-triage-workflow.ts`
- Modify: `packages/agent/src/investigation-planner-workflow.ts`
- Modify: `packages/agent/test/prr-negotiation-workflow.test.ts`
- Modify: `packages/agent/test/evidence-triage-workflow.test.ts`
- Modify: `packages/agent/test/investigation-planner-workflow.test.ts`
- Modify: `packages/agent/test/production-specialist-prompts.test.ts`
- Create during execution: `docs/agentic/claims/task-6-production-output-validation.md`

**Interfaces:**
- Consumes: `validateProductionSpecialistProviderOutput()` from Task 1.
- Produces: strict output validation before local derivatives, review requests, or approval requests are produced.

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-6-production-output-validation.md`:

```bash
git add docs/agentic/claims/task-6-production-output-validation.md
git commit -m "chore: claim production output validation"
```

- [ ] **Step 2: Write RED workflow validation tests**

Add tests to the three existing workflow test files:

- PRR negotiation rejects model output that claims a follow-up was sent, legal escalation was completed, or a lock was cleared.
- Evidence triage rejects output that claims an assertion was proposed, accepted, or added to the accepted graph.
- Investigation planner rejects output that claims tasks were created, portals were crawled, or provider bytes were transferred.
- Each workflow accepts command-like text when it is bounded narrative evidence text inside the allowed field.

Add renderer-level tests in `packages/agent/test/production-specialist-prompts.test.ts` for timeline builder, contradiction finder, and report builder output contracts, because those runner dispatch paths are outside this lane.

- [ ] **Step 3: Run RED**

Run:

```bash
npm test -- packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/test/evidence-triage-workflow.test.ts packages/agent/test/investigation-planner-workflow.test.ts packages/agent/test/production-specialist-prompts.test.ts
```

Expected: FAIL because existing workflows do not use the production output validators.

- [ ] **Step 4: Integrate validators**

In each existing workflow, validate provider output immediately after JSON parse and before any derivative artifact write, tool request, approval request, or handoff creation. Convert validation failures to the existing safe failure path with category `model-output-invalid` and no provider output text in diagnostics.

The integration points must preserve existing local-only behavior:

- PRR negotiation may create local advisory artifacts and approval requests only through existing gates.
- Evidence triage may create local triage artifacts and review suggestions only through existing gates.
- Investigation planner may create local plan artifacts and PRR draft candidates only through existing gates.

- [ ] **Step 5: Run GREEN and full verification**

Run:

```bash
npm test -- packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/test/evidence-triage-workflow.test.ts packages/agent/test/investigation-planner-workflow.test.ts packages/agent/test/production-specialist-prompts.test.ts
npm run verify
```

Expected: PASS.

- [ ] **Step 6: Commit and review**

Update claim evidence and commit:

```bash
git add packages/agent/src/prr-negotiation-workflow.ts packages/agent/src/evidence-triage-workflow.ts packages/agent/src/investigation-planner-workflow.ts packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/test/evidence-triage-workflow.test.ts packages/agent/test/investigation-planner-workflow.test.ts packages/agent/test/production-specialist-prompts.test.ts docs/agentic/claims/task-6-production-output-validation.md
git commit -m "feat: validate production specialist model outputs"
```

Review gate: spec review checks no output validator grants ontology truth or external effects.

## Task 7: Gated Live Nous Acceptance With Payload Sentinel

**Files:**
- Modify: `packages/agent/test/evidence-triage-nous-live.test.ts`
- Modify: `packages/agent/test/prr-negotiation-nous-live.test.ts`
- Create during execution: `docs/agentic/claims/task-7-production-specialist-nous-acceptance.md`

**Interfaces:**
- Consumes: production renderer and prompt artifact binding from earlier tasks.
- Produces: gated live acceptance proving the real provider sees bounded payload content, including the non-PRR imported-evidence path.

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-7-production-specialist-nous-acceptance.md`:

```bash
git add docs/agentic/claims/task-7-production-specialist-nous-acceptance.md
git commit -m "chore: claim production specialist nous acceptance"
```

- [ ] **Step 2: Write RED live-test changes**

Modify `packages/agent/test/evidence-triage-nous-live.test.ts` so the live test:

- creates a non-PRR run scope such as `{ kind: "imported-evidence", refs: ["ev_live_imported_non_prr_001"] }`;
- omits `prr-read-model.v1`;
- includes `no-associated-prr` in the prompt artifact omissions;
- uses `renderProductionSpecialistPrompt()` instead of hand-written prompt text;
- puts safe sentinel text such as `PAYLOAD_SENTINEL_CITY_LEDGER_427` only in the resolved `evidence-summary.v1` payload;
- keeps the sentinel out of that pack's `safeSummary`;
- asserts the structured provider output reflects the sentinel in an allowed safe field;
- asserts visible test output and serialized ledger/handoff data do not include prompt text, provider response text, credentials, raw request body, or resolved payload text beyond the fixed sentinel assertion in process memory.

- [ ] **Step 3: Run deterministic live-test compile path**

Run without the live flag:

```bash
npm test -- packages/agent/test/evidence-triage-nous-live.test.ts packages/agent/test/prr-negotiation-nous-live.test.ts
```

Expected: PASS with live suites skipped unless `CESTUS_AGENT_LIVE_NOUS=1` is set.

- [ ] **Step 4: Run gated live Nous acceptance**

Run in the repository's shared live-provider environment:

```bash
CESTUS_AGENT_LIVE_NOUS=1 npm test -- packages/agent/test/prr-negotiation-nous-live.test.ts packages/agent/test/evidence-triage-nous-live.test.ts
```

Expected: PASS. Visible output may include provider ID, model ID, hashes, event IDs, counts, categories, and fixed markers only.

Missing Nous credentials, provider unavailability, or live-provider setup failure is a stop condition. Escalate to the coordinator; do not mark this task complete, do not substitute deterministic fakes, and do not record a live acceptance pass.

- [ ] **Step 5: Run full verification**

Run:

```bash
npm run verify
```

Expected: PASS.

- [ ] **Step 6: Commit and review**

Update claim evidence and commit:

```bash
git add packages/agent/test/evidence-triage-nous-live.test.ts packages/agent/test/prr-negotiation-nous-live.test.ts docs/agentic/claims/task-7-production-specialist-nous-acceptance.md
git commit -m "test: add production specialist nous payload acceptance"
```

Review gate: review checks the live test is gated, secret-safe, includes non-PRR imported evidence, and proves payload-only sentinel use.

## Task 8: Final Verification, Factory Evidence, And Reviews

**Files:**
- Modify during execution: `docs/agentic/claims/task-8-production-specialist-final-verification.md`
- Modify if needed: `docs/agentic/software-factory.md`

**Interfaces:**
- Consumes: all task commits.
- Produces: final verification evidence and review handoff.

- [ ] **Step 1: Claim final verification**

Create and commit `docs/agentic/claims/task-8-production-specialist-final-verification.md`:

```bash
git add docs/agentic/claims/task-8-production-specialist-final-verification.md
git commit -m "chore: claim production specialist final verification"
```

- [ ] **Step 2: Run focused deterministic suite**

Run:

```bash
npm test -- packages/agent/test/production-specialist-prompts.test.ts packages/agent/test/prompt-artifacts.test.ts packages/agent/test/specialist-workflows.test.ts packages/agent/test/specialist-readiness.test.ts packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/provider-byte-transfer-adapter.test.ts packages/agent/test/runtime.test.ts packages/agent/test/projection.test.ts packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/test/evidence-triage-workflow.test.ts packages/agent/test/investigation-planner-workflow.test.ts packages/agent/test/evidence-triage-nous-live.test.ts packages/agent/test/prr-negotiation-nous-live.test.ts
```

Expected: PASS with live suites skipped unless the live flag is set. This deterministic command does not satisfy the required live Nous completion gate.

- [ ] **Step 3: Run repository verification**

Run:

```bash
npm run verify
```

Expected: PASS with `typecheck passed`, test pass summary, build pass if present, and `factory-readiness passed`.

- [ ] **Step 4: Run leakage and fallback scans**

Run:

```bash
rg -n "safe context-pack references only|Use only safe context-pack identifiers|promptText\\(" packages/agent/src packages/agent/test
rg -n "PAYLOAD_SENTINEL_CITY_LEDGER_427|resolved payload text|provider response text|raw request body" docs/agentic docs/superpowers packages/agent/src packages/agent/test
```

Expected:

- first command has no reachable production fallback prompt synthesis;
- second command finds only intentional test assertions or plan/spec references, never logs, DTO fixtures, claims, or readiness evidence that expose resolved payload bodies.

- [ ] **Step 5: Record final evidence**

Update the final claim with:

- focused deterministic suite result,
- live Nous result,
- `npm run verify` result,
- fallback scan result,
- leakage scan result,
- final commit range.

If `docs/agentic/software-factory.md` is updated, append a short readiness entry with command names and safe results only.

- [ ] **Step 6: Commit final evidence**

Run:

```bash
git add docs/agentic/claims/task-8-production-specialist-final-verification.md docs/agentic/software-factory.md
git commit -m "docs: record production specialist prompt verification"
```

If `docs/agentic/software-factory.md` was not changed, omit it from `git add`.

- [ ] **Step 7: Request reviews**

Run or dispatch reviews according to the active factory coordinator:

- Spec review: inspect commits against `docs/superpowers/specs/2026-07-10-production-specialist-prompt-template-registry-design.md`.
- Code-quality review: inspect tests, architecture boundaries, output schemas, and prompt/audit leakage.
- Verification review: confirm targeted commands, live-gated result, `npm run verify`, fallback scan, and leakage scan.

Do not merge until all blocking review findings are resolved with new commits and `npm run verify` remains green.

## Rollback And Escalation

- Stop before implementation if the operational resolved-context contract is absent or incompatible.
- Stop on prompt leakage, resolved payload leakage into audit surfaces, provider credential exposure, output-schema ambiguity, unsafe external-effect semantics, schema conflict, or repeated verifier failure.
- If Task 4 cannot keep descriptor applicability, fallback removal, and readiness enforcement atomic, stop and ask the coordinator to split the migration behind a provider-invocation kill switch.
- If live Nous credentials or provider availability fail, stop and escalate. Deterministic fakes cannot substitute for the required live Nous sentinel gate.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-10-production-specialist-prompt-template-registry-implementation.md`. After coordinator approval, execute with `superpowers:subagent-driven-development` so each task gets a fresh worker, task claim, RED/GREEN evidence, commit, and review gate.
