# Public Records Request Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend/domain public records request workflow with event contracts, lifecycle services, jurisdiction packs, correspondence adapter boundaries, evidence linkage, extraction queue contracts, and rebuildable read models.

**Architecture:** PRR state is append-only and replayable through the existing ontology ledger style. The PRR package owns request lifecycle logic, jurisdiction rules, adapter contracts, evidence bridge behavior, projections, and UI-facing DTOs; the UI itself remains a separate collaborative track.

**Tech Stack:** TypeScript, Node.js 26, npm, Vitest, Zod, existing `@cestus/ontology` event ledger/blob/evidence primitives, Markdown factory work orders.

---

## Required Reading

Before editing, every worker reads:

1. `AGENTS.md`
2. `docs/superpowers/specs/2026-06-30-ontology-layer-design.md`
3. `docs/superpowers/plans/2026-06-30-ontology-layer-implementation.md`
4. `docs/superpowers/specs/2026-07-01-public-records-request-workflow-design.md`
5. `docs/agentic/software-factory.md`

## Software Factory Rules

Every task is a work order:

1. Claim the task with a durable file at `docs/agentic/claims/task-<number>-<slug>.md`.
2. Commit the claim before editing task files.
3. Write the failing test first.
4. Run the targeted command and confirm the expected failure.
5. Write the smallest production change that satisfies the test.
6. Run the targeted command again.
7. Run `npm run verify`.
8. Commit only the files listed by the task.
9. Hand off to review.

Stop when a task needs live credentials, live mailbox access, production legal language, a data-loss migration, a schema conflict with the spec, or a verifier still fails after two focused repair attempts.

## File Structure

- `packages/prr/src/index.ts`: public PRR package exports.
- `packages/prr/src/types.ts`: shared PRR IDs, status unions, actor helpers, and value types.
- `packages/prr/src/lifecycle.ts`: request lifecycle command service and transition rules.
- `packages/prr/src/jurisdiction-packs.ts`: jurisdiction pack schema, registry, Federal FOIA pack, and Florida pack.
- `packages/prr/src/deadlines.ts`: deadline calculators, deadline precedence, and legal escalation gate checks.
- `packages/prr/src/stalling.ts`: possible stalling signal detector and user confirmation command.
- `packages/prr/src/correspondence-adapter.ts`: provider-neutral email adapter contract, fakes, and capability model.
- `packages/prr/src/correspondence-service.ts`: draft, review, one-click send, inbound sync, and uncertain-match commands.
- `packages/prr/src/evidence-bridge.ts`: conversion from PRR artifacts to ontology evidence ingestion inputs.
- `packages/prr/src/extraction-queue.ts`: assertion extraction queue item schema and in-memory queue.
- `packages/prr/src/projection.ts`: deterministic PRR read model builder.
- `packages/prr/src/read-api.ts`: UI-facing DTO builders from projections.
- `packages/prr/src/diagnostics.ts`: PRR diagnostic helper functions that avoid secrets.
- `packages/prr/test/*.test.ts`: focused unit tests.
- `packages/prr/test/fixtures/golden-prr-ledger.ts`: replayable PRR fixture.
- `packages/ontology/src/contracts.ts`: extend knowledge event contracts with PRR events.
- `packages/ontology/test/contracts.test.ts`: add PRR contract coverage.
- `packages/ontology/src/index.ts`: already exports contracts; modify only if new exports require it.
- `docs/agentic/software-factory.md`: final readiness evidence update.
- `scripts/check-agent-readiness.mjs`: include this plan/spec in required files after plan implementation begins.

## Task 1: Bootstrap The PRR Package

**Files:**
- Create: `packages/prr/src/index.ts`
- Create: `packages/prr/test/smoke.test.ts`
- Modify: `tsconfig.json`

- [ ] **Step 1: Write the failing smoke test**

Create `packages/prr/test/smoke.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { prrPackageName } from "../src/index.js";

describe("prr package", () => {
  it("exposes a stable package name", () => {
    expect(prrPackageName).toBe("@cestus/prr");
  });
});
```

- [ ] **Step 2: Run the smoke test to verify it fails**

Run:

```bash
npm test -- packages/prr/test/smoke.test.ts
```

Expected:

```text
Failed to resolve import "../src/index.js"
```

- [ ] **Step 3: Create the PRR package entrypoint**

Create `packages/prr/src/index.ts`:

```ts
export const prrPackageName = "@cestus/prr";
```

Confirm `tsconfig.json` already includes `packages/**/*.ts`. If it does not, set:

```json
{
  "include": ["packages/**/*.ts", "vitest.config.ts"]
}
```

- [ ] **Step 4: Run the smoke test**

Run:

```bash
npm test -- packages/prr/test/smoke.test.ts
```

Expected:

```text
1 passed
```

- [ ] **Step 5: Run full verification**

Run:

```bash
npm run verify
```

Expected:

```text
typecheck passed
tests passed
factory-readiness passed
```

- [ ] **Step 6: Commit**

Run:

```bash
git add tsconfig.json packages/prr/src/index.ts packages/prr/test/smoke.test.ts
git commit -m "chore: bootstrap prr package"
```

## Task 2: Add PRR Event Contracts To The Knowledge Ledger

**Files:**
- Modify: `packages/ontology/src/contracts.ts`
- Modify: `packages/ontology/test/contracts.test.ts`
- Create: `packages/prr/src/types.ts`
- Modify: `packages/prr/src/index.ts`

- [ ] **Step 1: Write failing PRR contract tests**

Append these tests to `packages/ontology/test/contracts.test.ts`:

```ts
describe("public records request event contracts", () => {
  it("validates a prr.request.created event", () => {
    const event = {
      id: "evt_prr_created_001",
      type: "prr.request.created",
      version: 1,
      streamId: "prr_req_001",
      sequence: 1,
      context,
      payload: {
        prrRequestId: "prr_req_001",
        jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
        agency: { name: "Example Agency", email: "foia@example.gov" },
        requester: { name: "Investigator", email: "investigator@example.org" },
        requestText: "Please provide contracts with Example Vendor from 2024.",
        status: "draft"
      }
    };

    expect(validateKnowledgeEvent(event).success).toBe(true);
  });

  it("rejects unknown keys in PRR payloads", () => {
    const result = validateKnowledgeEvent({
      id: "evt_prr_created_002",
      type: "prr.request.created",
      version: 1,
      streamId: "prr_req_002",
      sequence: 1,
      context,
      payload: {
        prrRequestId: "prr_req_002",
        jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
        agency: { name: "Example Agency" },
        requester: { name: "Investigator" },
        requestText: "Please provide records.",
        status: "draft",
        secretToken: "never-store-this"
      }
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toContain("payload");
    }
  });

  it("requires human approval before a prr.followup.sent event", () => {
    const result = validateKnowledgeEvent({
      id: "evt_prr_followup_001",
      type: "prr.followup.sent",
      version: 1,
      streamId: "prr_req_001",
      sequence: 2,
      context,
      payload: {
        prrRequestId: "prr_req_001",
        correspondenceId: "corr_prr_001",
        provider: "gmail",
        providerMessageId: "msg_123",
        subject: "Follow-up",
        bodyHash: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        sentAt: "2026-07-01T16:00:00.000Z"
      }
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toContain("payload.approvedBy");
    }
  });
});
```

- [ ] **Step 2: Run the targeted test to verify it fails**

Run:

```bash
npm test -- packages/ontology/test/contracts.test.ts
```

Expected:

```text
expected true to be false
```

or:

```text
expected false to be true
```

The failure proves the PRR event contracts are not present yet.

- [ ] **Step 3: Create shared PRR types**

Create `packages/prr/src/types.ts`:

```ts
export const prrStatuses = [
  "draft",
  "sent",
  "acknowledged",
  "inNegotiation",
  "awaitingProduction",
  "partiallyProduced",
  "produced",
  "denied",
  "appealed",
  "closed"
] as const;

export type PrrStatus = (typeof prrStatuses)[number];

export const correspondenceProviders = ["gmail", "imap-smtp", "himalaya"] as const;
export type CorrespondenceProvider = (typeof correspondenceProviders)[number];

export interface JurisdictionPackRef {
  name: string;
  version: string;
}

export interface ContactRef {
  name: string;
  email?: string;
  phone?: string;
}
```

- [ ] **Step 4: Extend ontology contract schemas**

In `packages/ontology/src/contracts.ts`, import no PRR package code. Define PRR schemas locally near the existing payload schemas:

```ts
const prrStatusSchema = z.enum([
  "draft",
  "sent",
  "acknowledged",
  "inNegotiation",
  "awaitingProduction",
  "partiallyProduced",
  "produced",
  "denied",
  "appealed",
  "closed"
]);

const correspondenceProviderSchema = z.enum(["gmail", "imap-smtp", "himalaya"]);

const jurisdictionPackRefSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1)
}).strict();

const prrContactSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().min(3).optional()
}).strict();

const prrRequestCreatedPayloadSchema = z.object({
  prrRequestId: z.string().regex(/^prr_[a-zA-Z0-9_-]+$/),
  jurisdictionPack: jurisdictionPackRefSchema,
  agency: prrContactSchema,
  requester: prrContactSchema,
  requestText: z.string().min(1),
  status: z.literal("draft")
}).strict();

const prrRequestSentPayloadSchema = z.object({
  prrRequestId: z.string().regex(/^prr_[a-zA-Z0-9_-]+$/),
  correspondenceId: z.string().regex(/^corr_[a-zA-Z0-9_-]+$/),
  provider: correspondenceProviderSchema,
  providerMessageId: z.string().min(1),
  subject: z.string().min(1),
  bodyHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  sentAt: z.string().datetime(),
  approvedBy: z.string().min(3)
}).strict();

const prrCorrespondenceReceivedPayloadSchema = z.object({
  prrRequestId: z.string().regex(/^prr_[a-zA-Z0-9_-]+$/),
  correspondenceId: z.string().regex(/^corr_[a-zA-Z0-9_-]+$/),
  provider: correspondenceProviderSchema,
  providerMessageId: z.string().min(1),
  providerThreadId: z.string().min(1).optional(),
  subject: z.string().min(1),
  from: prrContactSchema,
  receivedAt: z.string().datetime(),
  bodyHash: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional(),
  evidenceIds: z.array(z.string().regex(/^ev_[a-zA-Z0-9_-]+$/)).default([])
}).strict();
```

Define these common schemas:

```ts
const prrRequestRefSchema = z.object({
  prrRequestId: z.string().regex(/^prr_[a-zA-Z0-9_-]+$/)
}).strict();

const citedRuleSchema = z.object({
  jurisdictionPack: jurisdictionPackRefSchema,
  label: z.string().min(1),
  citation: z.string().min(1),
  url: z.string().url().optional()
}).strict();
```

Define the remaining payload schemas with these exact field names:

```ts
const prrFollowupDraftedPayloadSchema = prrRequestRefSchema.extend({
  correspondenceId: z.string().regex(/^corr_[a-zA-Z0-9_-]+$/),
  subject: z.string().min(1),
  bodyHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  citedRules: z.array(citedRuleSchema)
}).strict();

const prrFollowupSentPayloadSchema = prrRequestRefSchema.extend({
  correspondenceId: z.string().regex(/^corr_[a-zA-Z0-9_-]+$/),
  provider: correspondenceProviderSchema,
  providerMessageId: z.string().min(1),
  subject: z.string().min(1),
  bodyHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  sentAt: z.string().datetime(),
  approvedBy: z.string().min(3)
}).strict();

const prrDeadlineEstimatedPayloadSchema = prrRequestRefSchema.extend({
  deadlineDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  confidence: z.enum(["statutory", "workflow"]),
  explanation: z.string().min(1),
  citedRules: z.array(citedRuleSchema).min(1)
}).strict();

const prrDeadlineConfirmedPayloadSchema = prrRequestRefSchema.extend({
  deadlineDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  confirmedBy: z.string().min(3),
  rationale: z.string().min(1),
  citedRules: z.array(citedRuleSchema).min(1)
}).strict();

const prrFeeEstimatedPayloadSchema = prrRequestRefSchema.extend({
  amountCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
  sourceEvidenceId: z.string().regex(/^ev_[a-zA-Z0-9_-]+$/).optional()
}).strict();

const prrFeeChallengedPayloadSchema = prrRequestRefSchema.extend({
  feeChallengeId: z.string().regex(/^fee_challenge_[a-zA-Z0-9_-]+$/),
  amountCents: z.number().int().nonnegative(),
  rationale: z.string().min(1),
  approvedBy: z.string().min(3),
  citedRules: z.array(citedRuleSchema)
}).strict();

const prrScopeNarrowingProposedPayloadSchema = prrRequestRefSchema.extend({
  narrowingId: z.string().regex(/^narrow_[a-zA-Z0-9_-]+$/),
  proposedScope: z.string().min(1),
  proposedBy: z.string().min(3),
  sourceEvidenceId: z.string().regex(/^ev_[a-zA-Z0-9_-]+$/).optional()
}).strict();

const prrScopeNarrowingAcceptedPayloadSchema = prrRequestRefSchema.extend({
  narrowingId: z.string().regex(/^narrow_[a-zA-Z0-9_-]+$/),
  acceptedScope: z.string().min(1),
  acceptedBy: z.string().min(3),
  rationale: z.string().min(1)
}).strict();

const prrProductionReceivedPayloadSchema = prrRequestRefSchema.extend({
  productionId: z.string().regex(/^prod_[a-zA-Z0-9_-]+$/),
  label: z.string().min(1),
  receivedAt: z.string().datetime(),
  evidenceIds: z.array(z.string().regex(/^ev_[a-zA-Z0-9_-]+$/)).min(1)
}).strict();

const prrExemptionClaimedPayloadSchema = prrRequestRefSchema.extend({
  exemptionId: z.string().regex(/^exemption_[a-zA-Z0-9_-]+$/),
  claimedBy: z.string().min(1),
  citedRules: z.array(citedRuleSchema).min(1),
  sourceEvidenceId: z.string().regex(/^ev_[a-zA-Z0-9_-]+$/).optional()
}).strict();

const prrDenialRecordedPayloadSchema = prrRequestRefSchema.extend({
  denialId: z.string().regex(/^denial_[a-zA-Z0-9_-]+$/),
  receivedAt: z.string().datetime(),
  reason: z.string().min(1),
  sourceEvidenceId: z.string().regex(/^ev_[a-zA-Z0-9_-]+$/).optional()
}).strict();

const prrAppealCreatedPayloadSchema = prrRequestRefSchema.extend({
  appealId: z.string().regex(/^appeal_[a-zA-Z0-9_-]+$/),
  correspondenceId: z.string().regex(/^corr_[a-zA-Z0-9_-]+$/),
  filedAt: z.string().datetime(),
  approvedBy: z.string().min(3),
  citedRules: z.array(citedRuleSchema)
}).strict();

const stallingSignalSchema = z.object({
  kind: z.enum([
    "deadline-breached",
    "repeated-vague-delays",
    "high-fee-estimate",
    "silence-after-followup",
    "narrowing-pressure",
    "exemption-review-needed"
  ]),
  explanation: z.string().min(1)
}).strict();

const prrStallingDetectedPayloadSchema = prrRequestRefSchema.extend({
  detectedAt: z.string().datetime(),
  signals: z.array(stallingSignalSchema).min(1)
}).strict();

const prrStallingConfirmedPayloadSchema = prrRequestRefSchema.extend({
  confirmedBy: z.string().min(3),
  rationale: z.string().min(1),
  signalKinds: z.array(stallingSignalSchema.shape.kind).min(1)
}).strict();

const prrLegalEscalationConfirmedPayloadSchema = prrRequestRefSchema.extend({
  confirmedBy: z.string().min(3),
  rationale: z.string().min(1),
  citedRules: z.array(citedRuleSchema).min(1),
  evidenceIds: z.array(z.string().regex(/^ev_[a-zA-Z0-9_-]+$/)).min(1)
}).strict();

const prrRequestClosedPayloadSchema = prrRequestRefSchema.extend({
  closedAt: z.string().datetime(),
  closedBy: z.string().min(3),
  reason: z.enum(["fulfilled", "withdrawn", "abandoned", "denied-final", "merged"])
}).strict();
```

Add every PRR payload schema to `payloadSchemas`, and add every PRR event to `eventContracts` with description, agent guidance, and invariants. Include these invariants for send and escalation:

```ts
invariants: ["approvedBy is required", "bodyHash records the rendered body"]
```

```ts
invariants: ["confirmedBy is required", "citedRules cannot be empty", "legal escalation is never autonomous"]
```

- [ ] **Step 5: Export PRR types**

Modify `packages/prr/src/index.ts`:

```ts
export const prrPackageName = "@cestus/prr";
export * from "./types.js";
```

- [ ] **Step 6: Run the targeted test**

Run:

```bash
npm test -- packages/ontology/test/contracts.test.ts
```

Expected:

```text
1 passed
```

within the contract test file summary.

- [ ] **Step 7: Run full verification**

Run:

```bash
npm run verify
```

Expected:

```text
typecheck passed
tests passed
factory-readiness passed
```

- [ ] **Step 8: Commit**

Run:

```bash
git add packages/ontology/src/contracts.ts packages/ontology/test/contracts.test.ts packages/prr/src/types.ts packages/prr/src/index.ts
git commit -m "feat: add prr event contracts"
```

## Task 3: Add Lifecycle Service And Transition Rules

**Files:**
- Create: `packages/prr/src/lifecycle.ts`
- Create: `packages/prr/test/lifecycle.test.ts`
- Modify: `packages/prr/src/index.ts`

- [ ] **Step 1: Write failing lifecycle tests**

Create `packages/prr/test/lifecycle.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { PrrLifecycleService } from "../src/lifecycle.js";

const actor = { id: "actor_investigator", kind: "human" as const, label: "Investigator" };

describe("PrrLifecycleService", () => {
  it("creates a draft request event", async () => {
    const ledger = new InMemoryEventLedger();
    const service = new PrrLifecycleService({ ledger, actor });

    const event = await service.createRequest({
      prrRequestId: "prr_req_001",
      jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
      agency: { name: "Example Agency", email: "foia@example.gov" },
      requester: { name: "Investigator", email: "investigator@example.org" },
      requestText: "Please provide contracts with Example Vendor from 2024."
    });

    expect(event.type).toBe("prr.request.created");
    expect(event.streamId).toBe("prr_req_001");
    expect(event.payload.status).toBe("draft");
  });

  it("prevents sending a request before a draft exists", async () => {
    const ledger = new InMemoryEventLedger();
    const service = new PrrLifecycleService({ ledger, actor });

    await expect(
      service.markRequestSent({
        prrRequestId: "prr_req_missing",
        correspondenceId: "corr_prr_001",
        provider: "gmail",
        providerMessageId: "msg_123",
        subject: "Records Request",
        bodyHash: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        sentAt: "2026-07-01T16:00:00.000Z",
        approvedBy: "actor_investigator"
      })
    ).rejects.toThrow("Cannot send request prr_req_missing before it is created");
  });
});
```

- [ ] **Step 2: Run the lifecycle tests to verify they fail**

Run:

```bash
npm test -- packages/prr/test/lifecycle.test.ts
```

Expected:

```text
Failed to resolve import "../src/lifecycle.js"
```

- [ ] **Step 3: Implement the lifecycle service**

Create `packages/prr/src/lifecycle.ts`:

```ts
import type { z } from "zod";
import {
  actorRefSchema,
  type AppendableKnowledgeEvent,
  type KnowledgeEvent,
  type KnowledgeEventOf
} from "../../ontology/src/contracts.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";
import type { CorrespondenceProvider, JurisdictionPackRef, ContactRef } from "./types.js";

type ActorRef = z.infer<typeof actorRefSchema>;

interface PrrLifecycleDependencies {
  ledger: EventLedger;
  actor: ActorRef;
}

interface CreateRequestInput {
  prrRequestId: string;
  jurisdictionPack: JurisdictionPackRef;
  agency: ContactRef;
  requester: ContactRef;
  requestText: string;
}

interface MarkRequestSentInput {
  prrRequestId: string;
  correspondenceId: string;
  provider: CorrespondenceProvider;
  providerMessageId: string;
  subject: string;
  bodyHash: string;
  sentAt: string;
  approvedBy: string;
}

export class PrrLifecycleService {
  constructor(private readonly dependencies: PrrLifecycleDependencies) {}

  async createRequest(input: CreateRequestInput): Promise<KnowledgeEventOf<"prr.request.created">> {
    const event: AppendableKnowledgeEvent<"prr.request.created"> = {
      type: "prr.request.created",
      version: 1,
      streamId: input.prrRequestId,
      context: this.context(`corr_${input.prrRequestId}`),
      payload: {
        ...input,
        status: "draft"
      }
    };
    return this.appendTyped(event, "prr.request.created");
  }

  async markRequestSent(input: MarkRequestSentInput): Promise<KnowledgeEventOf<"prr.request.sent">> {
    const events = await this.dependencies.ledger.readStream(input.prrRequestId);
    const created = events.find((event) => event.type === "prr.request.created");
    if (!created) {
      throw new Error(`Cannot send request ${input.prrRequestId} before it is created`);
    }

    const event: AppendableKnowledgeEvent<"prr.request.sent"> = {
      type: "prr.request.sent",
      version: 1,
      streamId: input.prrRequestId,
      context: this.context(created.context.correlationId, created.id),
      payload: input
    };
    return this.appendTyped(event, "prr.request.sent", events.length + 1);
  }

  private context(correlationId: string, causationId?: string): AppendableKnowledgeEvent["context"] {
    return {
      actor: this.dependencies.actor,
      occurredAt: new Date().toISOString(),
      ...(causationId === undefined ? {} : { causationId }),
      correlationId,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0" }
    };
  }

  private async appendTyped<Type extends KnowledgeEvent["type"]>(
    event: AppendableKnowledgeEvent<Type>,
    expectedType: Type,
    expectedNextSequence?: number
  ): Promise<KnowledgeEventOf<Type>> {
    const appended = await this.dependencies.ledger.append(
      event,
      expectedNextSequence === undefined ? {} : { expectedNextSequence }
    );
    if (appended.type !== expectedType) {
      throw new Error(`Unexpected event type ${appended.type}`);
    }
    return appended as KnowledgeEventOf<Type>;
  }
}
```

- [ ] **Step 4: Export lifecycle service**

Modify `packages/prr/src/index.ts`:

```ts
export const prrPackageName = "@cestus/prr";
export * from "./types.js";
export * from "./lifecycle.js";
```

- [ ] **Step 5: Run lifecycle tests**

Run:

```bash
npm test -- packages/prr/test/lifecycle.test.ts
```

Expected:

```text
2 passed
```

- [ ] **Step 6: Run full verification**

Run:

```bash
npm run verify
```

Expected:

```text
typecheck passed
tests passed
factory-readiness passed
```

- [ ] **Step 7: Commit**

Run:

```bash
git add packages/prr/src/lifecycle.ts packages/prr/src/index.ts packages/prr/test/lifecycle.test.ts
git commit -m "feat: add prr lifecycle service"
```

## Task 4: Add Jurisdiction Packs And Deadline Calculators

**Files:**
- Create: `packages/prr/src/jurisdiction-packs.ts`
- Create: `packages/prr/src/deadlines.ts`
- Create: `packages/prr/test/jurisdiction-packs.test.ts`
- Create: `packages/prr/test/deadlines.test.ts`
- Modify: `packages/prr/src/index.ts`

- [ ] **Step 1: Write failing jurisdiction pack tests**

Create `packages/prr/test/jurisdiction-packs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  floridaPublicRecordsPack,
  jurisdictionPackSchema,
  usFederalFoiaPack
} from "../src/jurisdiction-packs.js";

describe("jurisdiction packs", () => {
  it("ships US Federal FOIA and Florida starter packs with agent guidance", () => {
    expect(jurisdictionPackSchema.parse(usFederalFoiaPack).rules.length).toBeGreaterThan(0);
    expect(jurisdictionPackSchema.parse(floridaPublicRecordsPack).rules.length).toBeGreaterThan(0);
    expect(usFederalFoiaPack.agentGuidance).toContain("20 working days");
    expect(floridaPublicRecordsPack.agentGuidance).toContain("workflow estimate");
  });

  it("rejects packs without citations", () => {
    const result = jurisdictionPackSchema.safeParse({
      ...usFederalFoiaPack,
      rules: [{ ...usFederalFoiaPack.rules[0], citations: [] }]
    });

    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Write failing deadline tests**

Create `packages/prr/test/deadlines.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  calculateEstimatedDeadline,
  chooseActiveDeadline
} from "../src/deadlines.js";
import { floridaPublicRecordsPack, usFederalFoiaPack } from "../src/jurisdiction-packs.js";

describe("deadline calculators", () => {
  it("calculates a federal FOIA 20-working-day estimate", () => {
    const result = calculateEstimatedDeadline(usFederalFoiaPack, {
      prrRequestId: "prr_req_001",
      receivedAt: "2026-07-01T12:00:00.000Z"
    });

    expect(result.deadlineDate).toBe("2026-07-29");
    expect(result.confidence).toBe("statutory");
    expect(result.citedRules[0]?.citation).toContain("5 U.S.C. 552");
  });

  it("labels Florida deadlines as workflow estimates", () => {
    const result = calculateEstimatedDeadline(floridaPublicRecordsPack, {
      prrRequestId: "prr_req_002",
      receivedAt: "2026-07-01T12:00:00.000Z"
    });

    expect(result.confidence).toBe("workflow");
    expect(result.explanation).toContain("not a fixed statutory response-day deadline");
  });

  it("prefers confirmed deadlines over estimates", () => {
    expect(
      chooseActiveDeadline({
        estimated: { deadlineDate: "2026-07-29", source: "estimated" },
        confirmed: { deadlineDate: "2026-07-25", source: "confirmed" }
      })
    ).toEqual({ deadlineDate: "2026-07-25", source: "confirmed" });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
npm test -- packages/prr/test/jurisdiction-packs.test.ts packages/prr/test/deadlines.test.ts
```

Expected:

```text
Failed to resolve import "../src/jurisdiction-packs.js"
```

- [ ] **Step 4: Create jurisdiction pack schemas and packs**

Create `packages/prr/src/jurisdiction-packs.ts`:

```ts
import { z } from "zod";

const citationSchema = z.object({
  label: z.string().min(1),
  citation: z.string().min(1),
  url: z.string().url()
}).strict();

const ruleSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(["deadline", "fee", "exemption", "appeal", "enforcement"]),
  description: z.string().min(20),
  citations: z.array(citationSchema).min(1),
  agentWarning: z.string().min(20)
}).strict();

export const jurisdictionPackSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  jurisdiction: z.string().min(1),
  description: z.string().min(20),
  agentGuidance: z.string().min(20),
  rules: z.array(ruleSchema).min(1)
}).strict();

export type JurisdictionPack = z.infer<typeof jurisdictionPackSchema>;

export const usFederalFoiaPack: JurisdictionPack = jurisdictionPackSchema.parse({
  name: "us-federal-foia",
  version: "0.1.0",
  jurisdiction: "US Federal",
  description: "Starter pack for federal Freedom of Information Act request lifecycle guidance.",
  agentGuidance:
    "Use the 20 working days rule for determinations when receipt date is known. Do not treat this pack as legal advice.",
  rules: [
    {
      id: "federal-determination-20-working-days",
      label: "20 working days determination estimate",
      kind: "deadline",
      description:
        "Federal FOIA generally requires an agency determination within 20 working days after receipt, subject to statutory conditions.",
      citations: [
        {
          label: "5 U.S.C. 552(a)(6)(A)(i)",
          citation: "5 U.S.C. 552(a)(6)(A)(i)",
          url: "https://www.justice.gov/oip/freedom-information-act-5-usc-552"
        }
      ],
      agentWarning:
        "Confirm tolling, unusual circumstances, and receipt date before using legal escalation language."
    }
  ]
});

export const floridaPublicRecordsPack: JurisdictionPack = jurisdictionPackSchema.parse({
  name: "florida-public-records",
  version: "0.1.0",
  jurisdiction: "Florida state and local",
  description: "Starter pack for Florida Chapter 119 public records request workflow guidance.",
  agentGuidance:
    "Use workflow estimate language for Florida because Chapter 119 does not provide one universal fixed response-day deadline.",
  rules: [
    {
      id: "florida-prompt-response-workflow-estimate",
      label: "Prompt response workflow estimate",
      kind: "deadline",
      description:
        "Florida public records law requires prompt access and good-faith handling; Cestus estimates review dates for operations.",
      citations: [
        {
          label: "Florida Statutes 119.07",
          citation: "Fla. Stat. 119.07",
          url: "https://www.flsenate.gov/laws/statutes/2025/119.07"
        },
        {
          label: "Florida Attorney General public records guide",
          citation: "Florida Attorney General public records citizen guide",
          url: "https://www.myfloridalegal.com/open-government/citizens"
        }
      ],
      agentWarning:
        "Label Florida dates as workflow estimates unless a human confirms a specific legal basis."
    }
  ]
});
```

- [ ] **Step 5: Create deadline calculators**

Create `packages/prr/src/deadlines.ts`:

```ts
import type { JurisdictionPack } from "./jurisdiction-packs.js";

type DeadlineConfidence = "statutory" | "workflow";

interface DeadlineCalculationInput {
  prrRequestId: string;
  receivedAt: string;
}

interface CitedRule {
  label: string;
  citation: string;
  url: string;
}

export interface EstimatedDeadline {
  prrRequestId: string;
  deadlineDate: string;
  confidence: DeadlineConfidence;
  explanation: string;
  citedRules: CitedRule[];
}

export interface ActiveDeadlineCandidate {
  deadlineDate: string;
  source: "estimated" | "confirmed";
}

export function calculateEstimatedDeadline(
  pack: JurisdictionPack,
  input: DeadlineCalculationInput
): EstimatedDeadline {
  if (pack.name === "us-federal-foia") {
    const rule = pack.rules[0];
    return {
      prrRequestId: input.prrRequestId,
      deadlineDate: addWorkingDays(input.receivedAt, 20),
      confidence: "statutory",
      explanation: "Federal FOIA determination estimate based on 20 working days after receipt.",
      citedRules: rule.citations
    };
  }

  const rule = pack.rules[0];
  return {
    prrRequestId: input.prrRequestId,
    deadlineDate: addCalendarDays(input.receivedAt, 10),
    confidence: "workflow",
    explanation:
      "Florida estimate is an operational review date, not a fixed statutory response-day deadline.",
    citedRules: rule.citations
  };
}

export function chooseActiveDeadline(input: {
  estimated?: ActiveDeadlineCandidate;
  confirmed?: ActiveDeadlineCandidate;
}): ActiveDeadlineCandidate | undefined {
  return input.confirmed ?? input.estimated;
}

function addCalendarDays(isoDateTime: string, days: number): string {
  const date = new Date(isoDateTime);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addWorkingDays(isoDateTime: string, days: number): string {
  const date = new Date(isoDateTime);
  let remaining = days;
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) {
      remaining -= 1;
    }
  }
  return date.toISOString().slice(0, 10);
}
```

- [ ] **Step 6: Export pack and deadline modules**

Modify `packages/prr/src/index.ts`:

```ts
export const prrPackageName = "@cestus/prr";
export * from "./types.js";
export * from "./lifecycle.js";
export * from "./jurisdiction-packs.js";
export * from "./deadlines.js";
```

- [ ] **Step 7: Run targeted tests**

Run:

```bash
npm test -- packages/prr/test/jurisdiction-packs.test.ts packages/prr/test/deadlines.test.ts
```

Expected:

```text
2 passed
3 passed
```

- [ ] **Step 8: Run full verification**

Run:

```bash
npm run verify
```

Expected:

```text
typecheck passed
tests passed
factory-readiness passed
```

- [ ] **Step 9: Commit**

Run:

```bash
git add packages/prr/src/jurisdiction-packs.ts packages/prr/src/deadlines.ts packages/prr/src/index.ts packages/prr/test/jurisdiction-packs.test.ts packages/prr/test/deadlines.test.ts
git commit -m "feat: add prr jurisdiction packs"
```

## Task 5: Add Legal Escalation Gate And Stalling Detection

**Files:**
- Modify: `packages/prr/src/deadlines.ts`
- Create: `packages/prr/src/stalling.ts`
- Create: `packages/prr/test/escalation-gate.test.ts`
- Create: `packages/prr/test/stalling.test.ts`
- Modify: `packages/prr/src/index.ts`

- [ ] **Step 1: Write failing escalation gate tests**

Create `packages/prr/test/escalation-gate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { evaluateLegalEscalationGate } from "../src/deadlines.js";

describe("legal escalation gate", () => {
  it("blocks escalation when no human confirmation exists", () => {
    const result = evaluateLegalEscalationGate({
      prrRequestId: "prr_req_001",
      hasConfirmedDeadlineBasis: true,
      hasUserConfirmedStalling: false,
      citedRules: [{ label: "FOIA", citation: "5 U.S.C. 552(a)(6)(A)(i)" }],
      evidenceIds: ["ev_correspondence_001"],
      userConfirmedEscalation: false
    });

    expect(result.ready).toBe(false);
    expect(result.missing).toContain("userConfirmedEscalation");
  });

  it("allows escalation only with basis, citation, evidence, and user confirmation", () => {
    const result = evaluateLegalEscalationGate({
      prrRequestId: "prr_req_001",
      hasConfirmedDeadlineBasis: true,
      hasUserConfirmedStalling: false,
      citedRules: [{ label: "FOIA", citation: "5 U.S.C. 552(a)(6)(A)(i)" }],
      evidenceIds: ["ev_correspondence_001"],
      userConfirmedEscalation: true
    });

    expect(result).toEqual({ ready: true, missing: [] });
  });
});
```

- [ ] **Step 2: Write failing stalling tests**

Create `packages/prr/test/stalling.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { detectStallingSignals } from "../src/stalling.js";

describe("stalling detection", () => {
  it("detects possible stalling without confirming it", () => {
    const result = detectStallingSignals({
      prrRequestId: "prr_req_001",
      activeDeadlineDate: "2026-07-01",
      today: "2026-07-10",
      responseCountAfterDeadline: 0,
      vagueDelayCount: 2,
      feeEstimateAmountCents: 450000
    });

    expect(result.possibleStalling).toBe(true);
    expect(result.confirmedStalling).toBe(false);
    expect(result.signals.map((signal) => signal.kind)).toEqual([
      "deadline-breached",
      "repeated-vague-delays",
      "high-fee-estimate"
    ]);
  });
});
```

- [ ] **Step 3: Run targeted tests to verify they fail**

Run:

```bash
npm test -- packages/prr/test/escalation-gate.test.ts packages/prr/test/stalling.test.ts
```

Expected:

```text
Failed to resolve import "../src/stalling.js"
```

- [ ] **Step 4: Extend deadline module with gate check**

Add to `packages/prr/src/deadlines.ts`:

```ts
interface LegalEscalationGateInput {
  prrRequestId: string;
  hasConfirmedDeadlineBasis: boolean;
  hasUserConfirmedStalling: boolean;
  citedRules: Array<{ label: string; citation: string }>;
  evidenceIds: string[];
  userConfirmedEscalation: boolean;
}

interface LegalEscalationGateResult {
  ready: boolean;
  missing: string[];
}

export function evaluateLegalEscalationGate(input: LegalEscalationGateInput): LegalEscalationGateResult {
  const missing: string[] = [];
  if (!input.hasConfirmedDeadlineBasis && !input.hasUserConfirmedStalling) {
    missing.push("confirmedDeadlineOrStallingBasis");
  }
  if (input.citedRules.length === 0) {
    missing.push("citedRules");
  }
  if (input.evidenceIds.length === 0) {
    missing.push("evidenceIds");
  }
  if (!input.userConfirmedEscalation) {
    missing.push("userConfirmedEscalation");
  }
  return { ready: missing.length === 0, missing };
}
```

- [ ] **Step 5: Create stalling detector**

Create `packages/prr/src/stalling.ts`:

```ts
type StallingSignalKind =
  | "deadline-breached"
  | "repeated-vague-delays"
  | "high-fee-estimate"
  | "silence-after-followup";

interface StallingDetectionInput {
  prrRequestId: string;
  activeDeadlineDate?: string;
  today: string;
  responseCountAfterDeadline: number;
  vagueDelayCount: number;
  feeEstimateAmountCents?: number;
  daysSinceFollowup?: number;
}

interface StallingSignal {
  kind: StallingSignalKind;
  explanation: string;
}

interface StallingDetectionResult {
  prrRequestId: string;
  possibleStalling: boolean;
  confirmedStalling: false;
  signals: StallingSignal[];
}

export function detectStallingSignals(input: StallingDetectionInput): StallingDetectionResult {
  const signals: StallingSignal[] = [];
  if (
    input.activeDeadlineDate !== undefined &&
    input.today > input.activeDeadlineDate &&
    input.responseCountAfterDeadline === 0
  ) {
    signals.push({
      kind: "deadline-breached",
      explanation: "Active deadline has passed without a recorded adequate response."
    });
  }
  if (input.vagueDelayCount >= 2) {
    signals.push({
      kind: "repeated-vague-delays",
      explanation: "Agency sent repeated vague delay messages."
    });
  }
  if ((input.feeEstimateAmountCents ?? 0) >= 100000) {
    signals.push({
      kind: "high-fee-estimate",
      explanation: "Fee estimate is high enough to need user review."
    });
  }
  if ((input.daysSinceFollowup ?? 0) >= 10 && input.responseCountAfterDeadline === 0) {
    signals.push({
      kind: "silence-after-followup",
      explanation: "No response has been recorded after a follow-up window."
    });
  }
  return {
    prrRequestId: input.prrRequestId,
    possibleStalling: signals.length > 0,
    confirmedStalling: false,
    signals
  };
}
```

- [ ] **Step 6: Export stalling module**

Modify `packages/prr/src/index.ts`:

```ts
export const prrPackageName = "@cestus/prr";
export * from "./types.js";
export * from "./lifecycle.js";
export * from "./jurisdiction-packs.js";
export * from "./deadlines.js";
export * from "./stalling.js";
```

- [ ] **Step 7: Run targeted tests**

Run:

```bash
npm test -- packages/prr/test/escalation-gate.test.ts packages/prr/test/stalling.test.ts
```

Expected:

```text
2 passed
1 passed
```

- [ ] **Step 8: Run full verification**

Run:

```bash
npm run verify
```

Expected:

```text
typecheck passed
tests passed
factory-readiness passed
```

- [ ] **Step 9: Commit**

Run:

```bash
git add packages/prr/src/deadlines.ts packages/prr/src/stalling.ts packages/prr/src/index.ts packages/prr/test/escalation-gate.test.ts packages/prr/test/stalling.test.ts
git commit -m "feat: add prr escalation gate"
```

## Task 6: Add Correspondence Adapter Contracts And Fakes

**Files:**
- Create: `packages/prr/src/correspondence-adapter.ts`
- Create: `packages/prr/test/correspondence-adapter.test.ts`
- Modify: `packages/prr/src/index.ts`

- [ ] **Step 1: Write failing adapter contract tests**

Create `packages/prr/test/correspondence-adapter.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { FakeCorrespondenceAdapter } from "../src/correspondence-adapter.js";

describe("CorrespondenceAdapter", () => {
  it("sends only through the human-approved send path", async () => {
    const adapter = new FakeCorrespondenceAdapter({ provider: "gmail" });
    const result = await adapter.sendApprovedMessage({
      idempotencyKey: "send_prr_req_001_corr_001",
      from: "investigator@example.org",
      to: ["foia@example.gov"],
      subject: "Records Request",
      body: "Please provide records.",
      approvedBy: "actor_investigator",
      attachments: []
    });

    expect(result.provider).toBe("gmail");
    expect(result.providerMessageId).toBe("fake_msg_send_prr_req_001_corr_001");
  });

  it("surfaces capabilities without requiring live credentials", async () => {
    const adapter = new FakeCorrespondenceAdapter({ provider: "himalaya" });

    await expect(adapter.capabilities()).resolves.toMatchObject({
      provider: "himalaya",
      canSend: true,
      canSync: true
    });
  });
});
```

- [ ] **Step 2: Run adapter tests to verify they fail**

Run:

```bash
npm test -- packages/prr/test/correspondence-adapter.test.ts
```

Expected:

```text
Failed to resolve import "../src/correspondence-adapter.js"
```

- [ ] **Step 3: Create adapter contract and fake**

Create `packages/prr/src/correspondence-adapter.ts`:

```ts
import type { CorrespondenceProvider } from "./types.js";

export interface AdapterCapabilities {
  provider: CorrespondenceProvider;
  canSend: boolean;
  canSync: boolean;
  canFetchAttachments: boolean;
  credentialMode: "cestus-oauth" | "external-secret" | "external-config";
}

export interface ApprovedMessageInput {
  idempotencyKey: string;
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  approvedBy: string;
  attachments: Array<{ filename: string; contentHash: string }>;
}

export interface SentMessageResult {
  provider: CorrespondenceProvider;
  providerMessageId: string;
  providerThreadId?: string;
  sentAt: string;
  rawMetadata: Record<string, string>;
}

export interface SyncedMessage {
  provider: CorrespondenceProvider;
  providerMessageId: string;
  providerThreadId?: string;
  from: string;
  to: string[];
  subject: string;
  receivedAt: string;
  body?: string;
}

export interface CorrespondenceAdapter {
  capabilities(): Promise<AdapterCapabilities>;
  sendApprovedMessage(input: ApprovedMessageInput): Promise<SentMessageResult>;
  syncSince(checkpoint?: string): Promise<{ checkpoint: string; messages: SyncedMessage[] }>;
}

export class FakeCorrespondenceAdapter implements CorrespondenceAdapter {
  constructor(private readonly options: { provider: CorrespondenceProvider }) {}

  async capabilities(): Promise<AdapterCapabilities> {
    return {
      provider: this.options.provider,
      canSend: true,
      canSync: true,
      canFetchAttachments: true,
      credentialMode:
        this.options.provider === "gmail"
          ? "cestus-oauth"
          : this.options.provider === "himalaya"
            ? "external-config"
            : "external-secret"
    };
  }

  async sendApprovedMessage(input: ApprovedMessageInput): Promise<SentMessageResult> {
    if (input.approvedBy.length < 3) {
      throw new Error("approvedBy is required for one-click send");
    }
    return {
      provider: this.options.provider,
      providerMessageId: `fake_msg_${input.idempotencyKey}`,
      providerThreadId: `fake_thread_${input.idempotencyKey}`,
      sentAt: "2026-07-01T16:00:00.000Z",
      rawMetadata: { idempotencyKey: input.idempotencyKey }
    };
  }

  async syncSince(checkpoint = "start"): Promise<{ checkpoint: string; messages: SyncedMessage[] }> {
    return { checkpoint: `after_${checkpoint}`, messages: [] };
  }
}
```

- [ ] **Step 4: Export adapter module**

Modify `packages/prr/src/index.ts`:

```ts
export const prrPackageName = "@cestus/prr";
export * from "./types.js";
export * from "./lifecycle.js";
export * from "./jurisdiction-packs.js";
export * from "./deadlines.js";
export * from "./stalling.js";
export * from "./correspondence-adapter.js";
```

- [ ] **Step 5: Run targeted test**

Run:

```bash
npm test -- packages/prr/test/correspondence-adapter.test.ts
```

Expected:

```text
2 passed
```

- [ ] **Step 6: Run full verification**

Run:

```bash
npm run verify
```

Expected:

```text
typecheck passed
tests passed
factory-readiness passed
```

- [ ] **Step 7: Commit**

Run:

```bash
git add packages/prr/src/correspondence-adapter.ts packages/prr/src/index.ts packages/prr/test/correspondence-adapter.test.ts
git commit -m "feat: add prr correspondence adapter contract"
```

## Task 7: Add Provider Adapter Implementations

**Files:**
- Create: `packages/prr/src/provider-adapters.ts`
- Create: `packages/prr/test/provider-adapters.test.ts`
- Modify: `packages/prr/src/index.ts`

- [ ] **Step 1: Write failing provider adapter tests**

Create `packages/prr/test/provider-adapters.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  GmailCorrespondenceAdapter,
  HimalayaCliAdapter,
  ImapSmtpCorrespondenceAdapter
} from "../src/provider-adapters.js";

describe("provider correspondence adapters", () => {
  it("wraps a Gmail client without exposing OAuth tokens", async () => {
    const adapter = new GmailCorrespondenceAdapter({
      accountEmail: "investigator@example.org",
      client: {
        async send(input) {
          expect(input.body).toBe("Please provide records.");
          return {
            providerMessageId: "gmail_msg_001",
            providerThreadId: "gmail_thread_001",
            sentAt: "2026-07-01T16:00:00.000Z"
          };
        },
        async syncSince() {
          return { checkpoint: "gmail_checkpoint_001", messages: [] };
        }
      }
    });

    expect(await adapter.capabilities()).toMatchObject({
      provider: "gmail",
      credentialMode: "cestus-oauth"
    });
    await expect(
      adapter.sendApprovedMessage({
        idempotencyKey: "send_001",
        from: "investigator@example.org",
        to: ["foia@example.gov"],
        subject: "Records Request",
        body: "Please provide records.",
        approvedBy: "actor_investigator",
        attachments: []
      })
    ).resolves.toMatchObject({ providerMessageId: "gmail_msg_001" });
  });

  it("wraps IMAP and SMTP ports with external-secret credential mode", async () => {
    const adapter = new ImapSmtpCorrespondenceAdapter({
      accountEmail: "investigator@example.org",
      smtp: {
        async send() {
          return {
            providerMessageId: "smtp_msg_001",
            sentAt: "2026-07-01T16:00:00.000Z"
          };
        }
      },
      imap: {
        async syncSince() {
          return { checkpoint: "imap_checkpoint_001", messages: [] };
        }
      }
    });

    expect(await adapter.capabilities()).toMatchObject({
      provider: "imap-smtp",
      credentialMode: "external-secret"
    });
  });

  it("detects Himalaya CLI capabilities through a command runner", async () => {
    const commands: string[][] = [];
    const adapter = new HimalayaCliAdapter({
      profile: "records",
      runCommand: async (command, args) => {
        commands.push([command, ...args]);
        if (args.includes("--version")) {
          return { stdout: "himalaya 1.2.0\n", stderr: "" };
        }
        return {
          stdout: JSON.stringify({ id: "himalaya_msg_001", threadId: "himalaya_thread_001" }),
          stderr: ""
        };
      }
    });

    expect(await adapter.capabilities()).toMatchObject({
      provider: "himalaya",
      credentialMode: "external-config"
    });

    await adapter.sendApprovedMessage({
      idempotencyKey: "send_002",
      from: "investigator@example.org",
      to: ["foia@example.gov"],
      subject: "Records Request",
      body: "Please provide records.",
      approvedBy: "actor_investigator",
      attachments: []
    });

    expect(commands[0]).toEqual(["himalaya", "--version"]);
    expect(commands[1]?.[0]).toBe("himalaya");
  });
});
```

- [ ] **Step 2: Run provider adapter tests to verify they fail**

Run:

```bash
npm test -- packages/prr/test/provider-adapters.test.ts
```

Expected:

```text
Failed to resolve import "../src/provider-adapters.js"
```

- [ ] **Step 3: Create provider adapter implementations**

Create `packages/prr/src/provider-adapters.ts`:

```ts
import type {
  ApprovedMessageInput,
  CorrespondenceAdapter,
  SentMessageResult,
  SyncedMessage
} from "./correspondence-adapter.js";

interface ProviderSendResult {
  providerMessageId: string;
  providerThreadId?: string;
  sentAt: string;
}

export interface GmailClientPort {
  send(input: ApprovedMessageInput): Promise<ProviderSendResult>;
  syncSince(checkpoint?: string): Promise<{ checkpoint: string; messages: SyncedMessage[] }>;
}

export interface SmtpClientPort {
  send(input: ApprovedMessageInput): Promise<ProviderSendResult>;
}

export interface ImapClientPort {
  syncSince(checkpoint?: string): Promise<{ checkpoint: string; messages: SyncedMessage[] }>;
}

export class GmailCorrespondenceAdapter implements CorrespondenceAdapter {
  constructor(private readonly options: { accountEmail: string; client: GmailClientPort }) {}

  async capabilities() {
    return {
      provider: "gmail" as const,
      canSend: true,
      canSync: true,
      canFetchAttachments: true,
      credentialMode: "cestus-oauth" as const
    };
  }

  async sendApprovedMessage(input: ApprovedMessageInput): Promise<SentMessageResult> {
    const sent = await this.options.client.send(input);
    return {
      provider: "gmail",
      ...sent,
      rawMetadata: { accountEmail: this.options.accountEmail }
    };
  }

  async syncSince(checkpoint?: string) {
    return this.options.client.syncSince(checkpoint);
  }
}

export class ImapSmtpCorrespondenceAdapter implements CorrespondenceAdapter {
  constructor(
    private readonly options: {
      accountEmail: string;
      smtp: SmtpClientPort;
      imap: ImapClientPort;
    }
  ) {}

  async capabilities() {
    return {
      provider: "imap-smtp" as const,
      canSend: true,
      canSync: true,
      canFetchAttachments: true,
      credentialMode: "external-secret" as const
    };
  }

  async sendApprovedMessage(input: ApprovedMessageInput): Promise<SentMessageResult> {
    const sent = await this.options.smtp.send(input);
    return {
      provider: "imap-smtp",
      ...sent,
      rawMetadata: { accountEmail: this.options.accountEmail }
    };
  }

  async syncSince(checkpoint?: string) {
    return this.options.imap.syncSince(checkpoint);
  }
}

interface CommandResult {
  stdout: string;
  stderr: string;
}

export class HimalayaCliAdapter implements CorrespondenceAdapter {
  constructor(
    private readonly options: {
      profile: string;
      runCommand: (command: string, args: string[]) => Promise<CommandResult>;
    }
  ) {}

  async capabilities() {
    await this.options.runCommand("himalaya", ["--version"]);
    return {
      provider: "himalaya" as const,
      canSend: true,
      canSync: true,
      canFetchAttachments: true,
      credentialMode: "external-config" as const
    };
  }

  async sendApprovedMessage(input: ApprovedMessageInput): Promise<SentMessageResult> {
    const result = await this.options.runCommand("himalaya", [
      "--account",
      this.options.profile,
      "message",
      "send",
      "--from",
      input.from,
      "--to",
      input.to.join(","),
      "--subject",
      input.subject,
      "--body",
      input.body,
      "--output",
      "json"
    ]);
    const parsed = JSON.parse(result.stdout) as { id?: string; threadId?: string };
    if (!parsed.id) {
      throw new Error("Himalaya send output did not include a message id");
    }
    return {
      provider: "himalaya",
      providerMessageId: parsed.id,
      ...(parsed.threadId === undefined ? {} : { providerThreadId: parsed.threadId }),
      sentAt: new Date().toISOString(),
      rawMetadata: { profile: this.options.profile }
    };
  }

  async syncSince(checkpoint = "start") {
    const result = await this.options.runCommand("himalaya", [
      "--account",
      this.options.profile,
      "envelope",
      "list",
      "--output",
      "json"
    ]);
    JSON.parse(result.stdout || "[]");
    return { checkpoint, messages: [] };
  }
}
```

- [ ] **Step 4: Export provider adapters**

Modify `packages/prr/src/index.ts`:

```ts
export const prrPackageName = "@cestus/prr";
export * from "./types.js";
export * from "./lifecycle.js";
export * from "./jurisdiction-packs.js";
export * from "./deadlines.js";
export * from "./stalling.js";
export * from "./correspondence-adapter.js";
export * from "./provider-adapters.js";
```

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npm test -- packages/prr/test/provider-adapters.test.ts
```

Expected:

```text
3 passed
```

- [ ] **Step 6: Run full verification**

Run:

```bash
npm run verify
```

Expected:

```text
typecheck passed
tests passed
factory-readiness passed
```

- [ ] **Step 7: Commit**

Run:

```bash
git add packages/prr/src/provider-adapters.ts packages/prr/src/index.ts packages/prr/test/provider-adapters.test.ts
git commit -m "feat: add prr provider adapters"
```

## Task 8: Add Correspondence Service

**Files:**
- Create: `packages/prr/src/correspondence-service.ts`
- Create: `packages/prr/test/correspondence-service.test.ts`
- Modify: `packages/prr/src/index.ts`

- [ ] **Step 1: Write failing correspondence service tests**

Create `packages/prr/test/correspondence-service.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { FakeCorrespondenceAdapter } from "../src/correspondence-adapter.js";
import { PrrCorrespondenceService } from "../src/correspondence-service.js";
import { PrrLifecycleService } from "../src/lifecycle.js";

const actor = { id: "actor_investigator", kind: "human" as const, label: "Investigator" };

describe("PrrCorrespondenceService", () => {
  it("one-click sends after human approval and records a request sent event", async () => {
    const ledger = new InMemoryEventLedger();
    const lifecycle = new PrrLifecycleService({ ledger, actor });
    await lifecycle.createRequest({
      prrRequestId: "prr_req_001",
      jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
      agency: { name: "Example Agency", email: "foia@example.gov" },
      requester: { name: "Investigator", email: "investigator@example.org" },
      requestText: "Please provide records."
    });

    const service = new PrrCorrespondenceService({
      ledger,
      actor,
      adapters: { gmail: new FakeCorrespondenceAdapter({ provider: "gmail" }) }
    });

    const event = await service.sendInitialRequest({
      prrRequestId: "prr_req_001",
      correspondenceId: "corr_req_001",
      provider: "gmail",
      from: "investigator@example.org",
      to: ["foia@example.gov"],
      subject: "Records Request",
      body: "Please provide records.",
      approvedBy: "actor_investigator"
    });

    expect(event.type).toBe("prr.request.sent");
    expect(event.payload.providerMessageId).toBe("fake_msg_send_prr_req_001_corr_req_001");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- packages/prr/test/correspondence-service.test.ts
```

Expected:

```text
Failed to resolve import "../src/correspondence-service.js"
```

- [ ] **Step 3: Create correspondence service**

Create `packages/prr/src/correspondence-service.ts`:

```ts
import { createHash } from "node:crypto";
import type { z } from "zod";
import { actorRefSchema } from "../../ontology/src/contracts.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";
import type { CorrespondenceAdapter } from "./correspondence-adapter.js";
import { PrrLifecycleService } from "./lifecycle.js";
import type { CorrespondenceProvider } from "./types.js";

type ActorRef = z.infer<typeof actorRefSchema>;

type AdapterMap = Partial<Record<CorrespondenceProvider, CorrespondenceAdapter>>;

interface PrrCorrespondenceDependencies {
  ledger: EventLedger;
  actor: ActorRef;
  adapters: AdapterMap;
}

interface SendInitialRequestInput {
  prrRequestId: string;
  correspondenceId: string;
  provider: CorrespondenceProvider;
  from: string;
  to: string[];
  subject: string;
  body: string;
  approvedBy: string;
}

export class PrrCorrespondenceService {
  constructor(private readonly dependencies: PrrCorrespondenceDependencies) {}

  async sendInitialRequest(input: SendInitialRequestInput) {
    const adapter = this.dependencies.adapters[input.provider];
    if (!adapter) {
      throw new Error(`No correspondence adapter configured for ${input.provider}`);
    }
    const idempotencyKey = `send_${input.prrRequestId}_${input.correspondenceId}`;
    const sent = await adapter.sendApprovedMessage({
      idempotencyKey,
      from: input.from,
      to: input.to,
      subject: input.subject,
      body: input.body,
      approvedBy: input.approvedBy,
      attachments: []
    });
    const lifecycle = new PrrLifecycleService({
      ledger: this.dependencies.ledger,
      actor: this.dependencies.actor
    });
    return lifecycle.markRequestSent({
      prrRequestId: input.prrRequestId,
      correspondenceId: input.correspondenceId,
      provider: input.provider,
      providerMessageId: sent.providerMessageId,
      subject: input.subject,
      bodyHash: sha256(input.body),
      sentAt: sent.sentAt,
      approvedBy: input.approvedBy
    });
  }
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
```

- [ ] **Step 4: Export correspondence service**

Modify `packages/prr/src/index.ts`:

```ts
export const prrPackageName = "@cestus/prr";
export * from "./types.js";
export * from "./lifecycle.js";
export * from "./jurisdiction-packs.js";
export * from "./deadlines.js";
export * from "./stalling.js";
export * from "./correspondence-adapter.js";
export * from "./provider-adapters.js";
export * from "./correspondence-service.js";
```

- [ ] **Step 5: Run targeted test**

Run:

```bash
npm test -- packages/prr/test/correspondence-service.test.ts
```

Expected:

```text
1 passed
```

- [ ] **Step 6: Run full verification**

Run:

```bash
npm run verify
```

Expected:

```text
typecheck passed
tests passed
factory-readiness passed
```

- [ ] **Step 7: Commit**

Run:

```bash
git add packages/prr/src/correspondence-service.ts packages/prr/src/index.ts packages/prr/test/correspondence-service.test.ts
git commit -m "feat: add prr correspondence service"
```

## Task 9: Add Evidence Bridge And Extraction Queue

**Files:**
- Create: `packages/prr/src/evidence-bridge.ts`
- Create: `packages/prr/src/extraction-queue.ts`
- Create: `packages/prr/test/evidence-bridge.test.ts`
- Create: `packages/prr/test/extraction-queue.test.ts`
- Modify: `packages/prr/src/index.ts`

- [ ] **Step 1: Write failing evidence bridge test**

Create `packages/prr/test/evidence-bridge.test.ts`:

```ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FileBlobStore } from "../../ontology/src/blob-store.js";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { PrrEvidenceBridge } from "../src/evidence-bridge.js";

const actor = { id: "actor_system", kind: "system" as const, label: "PRR evidence bridge" };

describe("PrrEvidenceBridge", () => {
  it("ingests a production file as evidence with PRR source metadata", async () => {
    const ledger = new InMemoryEventLedger();
    const blobStore = new FileBlobStore(join(mkdtempSync(join(tmpdir(), "prr-bridge-")), "blobs"));
    const bridge = new PrrEvidenceBridge({ ledger, blobStore, actor });

    const event = await bridge.ingestProductionArtifact({
      prrRequestId: "prr_req_001",
      evidenceId: "ev_prr_production_001",
      filename: "contracts.pdf",
      mediaType: "application/pdf",
      content: Buffer.from("contract bytes")
    });

    expect(event.type).toBe("evidence.ingested");
    expect(event.payload.source.label).toBe("PRR production contracts.pdf");
    expect(event.payload.source.uri).toBe("cestus:prr/prr_req_001/productions/contracts.pdf");
  });
});
```

- [ ] **Step 2: Write failing extraction queue test**

Create `packages/prr/test/extraction-queue.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { InMemoryAssertionExtractionQueue } from "../src/extraction-queue.js";

describe("AssertionExtractionQueue", () => {
  it("queues production evidence for future assertion extraction", async () => {
    const queue = new InMemoryAssertionExtractionQueue();

    await queue.enqueue({
      queueItemId: "q_prr_001",
      prrRequestId: "prr_req_001",
      evidenceId: "ev_prr_production_001",
      jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
      extractionMode: "production-metadata",
      priority: "normal"
    });

    expect(await queue.list()).toEqual([
      {
        queueItemId: "q_prr_001",
        prrRequestId: "prr_req_001",
        evidenceId: "ev_prr_production_001",
        jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
        extractionMode: "production-metadata",
        priority: "normal"
      }
    ]);
  });
});
```

- [ ] **Step 3: Run targeted tests to verify they fail**

Run:

```bash
npm test -- packages/prr/test/evidence-bridge.test.ts packages/prr/test/extraction-queue.test.ts
```

Expected:

```text
Failed to resolve import "../src/evidence-bridge.js"
```

- [ ] **Step 4: Create evidence bridge**

Create `packages/prr/src/evidence-bridge.ts`:

```ts
import type { z } from "zod";
import { actorRefSchema } from "../../ontology/src/contracts.js";
import type { FileBlobStore } from "../../ontology/src/blob-store.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";
import { EvidenceService } from "../../ontology/src/evidence-service.js";

type ActorRef = z.infer<typeof actorRefSchema>;

interface PrrEvidenceBridgeDependencies {
  ledger: EventLedger;
  blobStore: FileBlobStore;
  actor: ActorRef;
}

interface ProductionArtifactInput {
  prrRequestId: string;
  evidenceId: string;
  filename: string;
  mediaType: string;
  content: Buffer;
}

export class PrrEvidenceBridge {
  private readonly evidenceService: EvidenceService;

  constructor(private readonly dependencies: PrrEvidenceBridgeDependencies) {
    this.evidenceService = new EvidenceService({
      ledger: dependencies.ledger,
      blobStore: dependencies.blobStore
    });
  }

  async ingestProductionArtifact(input: ProductionArtifactInput) {
    return this.evidenceService.ingest({
      evidenceId: input.evidenceId,
      content: input.content,
      mediaType: input.mediaType,
      actor: this.dependencies.actor,
      source: {
        kind: "file",
        label: `PRR production ${input.filename}`,
        uri: `cestus:prr/${input.prrRequestId}/productions/${input.filename}`
      }
    });
  }
}
```

- [ ] **Step 5: Create extraction queue**

Create `packages/prr/src/extraction-queue.ts`:

```ts
import { z } from "zod";

export const assertionExtractionQueueItemSchema = z.object({
  queueItemId: z.string().regex(/^q_[a-zA-Z0-9_-]+$/),
  prrRequestId: z.string().regex(/^prr_[a-zA-Z0-9_-]+$/),
  evidenceId: z.string().regex(/^ev_[a-zA-Z0-9_-]+$/),
  jurisdictionPack: z.object({
    name: z.string().min(1),
    version: z.string().min(1)
  }).strict(),
  extractionMode: z.enum(["production-metadata", "correspondence-metadata"]),
  priority: z.enum(["low", "normal", "high"])
}).strict();

export type AssertionExtractionQueueItem = z.infer<typeof assertionExtractionQueueItemSchema>;

export class InMemoryAssertionExtractionQueue {
  private readonly items: AssertionExtractionQueueItem[] = [];

  async enqueue(item: AssertionExtractionQueueItem): Promise<void> {
    const parsed = assertionExtractionQueueItemSchema.parse(item);
    if (this.items.some((existing) => existing.queueItemId === parsed.queueItemId)) {
      throw new Error(`Extraction queue item ${parsed.queueItemId} already exists`);
    }
    this.items.push(structuredClone(parsed));
  }

  async list(): Promise<AssertionExtractionQueueItem[]> {
    return this.items.map((item) => structuredClone(item));
  }
}
```

- [ ] **Step 6: Export evidence bridge and queue**

Modify `packages/prr/src/index.ts`:

```ts
export const prrPackageName = "@cestus/prr";
export * from "./types.js";
export * from "./lifecycle.js";
export * from "./jurisdiction-packs.js";
export * from "./deadlines.js";
export * from "./stalling.js";
export * from "./correspondence-adapter.js";
export * from "./provider-adapters.js";
export * from "./correspondence-service.js";
export * from "./evidence-bridge.js";
export * from "./extraction-queue.js";
```

- [ ] **Step 7: Run targeted tests**

Run:

```bash
npm test -- packages/prr/test/evidence-bridge.test.ts packages/prr/test/extraction-queue.test.ts
```

Expected:

```text
1 passed
1 passed
```

- [ ] **Step 8: Run full verification**

Run:

```bash
npm run verify
```

Expected:

```text
typecheck passed
tests passed
factory-readiness passed
```

- [ ] **Step 9: Commit**

Run:

```bash
git add packages/prr/src/evidence-bridge.ts packages/prr/src/extraction-queue.ts packages/prr/src/index.ts packages/prr/test/evidence-bridge.test.ts packages/prr/test/extraction-queue.test.ts
git commit -m "feat: add prr evidence bridge"
```

## Task 10: Add Rebuildable PRR Projection

**Files:**
- Create: `packages/prr/src/projection.ts`
- Create: `packages/prr/test/projection.test.ts`
- Create: `packages/prr/test/fixtures/golden-prr-ledger.ts`
- Modify: `packages/prr/src/index.ts`

- [ ] **Step 1: Write failing golden fixture and projection test**

Create `packages/prr/test/fixtures/golden-prr-ledger.ts` with a `prr.request.created`, `prr.request.sent`, `prr.deadline.estimated`, `prr.correspondence.received`, and `prr.production.received` sequence using validated `KnowledgeEvent[]`.

Create `packages/prr/test/projection.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateKnowledgeEvent } from "../../ontology/src/contracts.js";
import { buildPrrProjection } from "../src/projection.js";
import { goldenPrrLedgerEvents } from "./fixtures/golden-prr-ledger.js";

describe("buildPrrProjection", () => {
  it("rebuilds request state from golden PRR ledger events", () => {
    for (const event of goldenPrrLedgerEvents) {
      expect(validateKnowledgeEvent(event).success).toBe(true);
    }

    const projection = buildPrrProjection(goldenPrrLedgerEvents);
    expect(projection.requests.get("prr_req_001")).toMatchObject({
      prrRequestId: "prr_req_001",
      status: "awaitingProduction",
      agencyName: "Example Agency",
      activeDeadline: { deadlineDate: "2026-07-29", source: "estimated" }
    });
    expect(projection.timelineForRequest("prr_req_001").map((entry) => entry.type)).toEqual([
      "prr.request.created",
      "prr.request.sent",
      "prr.deadline.estimated",
      "prr.correspondence.received",
      "prr.production.received"
    ]);
  });
});
```

- [ ] **Step 2: Run projection test to verify it fails**

Run:

```bash
npm test -- packages/prr/test/projection.test.ts
```

Expected:

```text
Failed to resolve import "../src/projection.js"
```

- [ ] **Step 3: Create projection builder**

Create `packages/prr/src/projection.ts`:

```ts
import type { KnowledgeEvent } from "../../ontology/src/contracts.js";
import type { PrrStatus } from "./types.js";

interface PrrRequestReadModel {
  prrRequestId: string;
  status: PrrStatus;
  agencyName: string;
  activeDeadline?: { deadlineDate: string; source: "estimated" | "confirmed" };
  possibleStalling: boolean;
  confirmedStalling: boolean;
  productionEvidenceIds: string[];
}

interface TimelineEntry {
  eventId: string;
  type: KnowledgeEvent["type"];
  occurredAt: string;
}

export interface PrrProjection {
  requests: Map<string, PrrRequestReadModel>;
  timelineForRequest(prrRequestId: string): TimelineEntry[];
}

export function buildPrrProjection(events: readonly KnowledgeEvent[]): PrrProjection {
  const requests = new Map<string, PrrRequestReadModel>();
  const timelines = new Map<string, TimelineEntry[]>();

  for (const event of events) {
    const prrRequestId = requestIdFromEvent(event);
    if (!prrRequestId) {
      continue;
    }
    const timeline = timelines.get(prrRequestId) ?? [];
    timeline.push({ eventId: event.id, type: event.type, occurredAt: event.context.occurredAt });
    timelines.set(prrRequestId, timeline);

    if (event.type === "prr.request.created") {
      requests.set(prrRequestId, {
        prrRequestId,
        status: "draft",
        agencyName: event.payload.agency.name,
        possibleStalling: false,
        confirmedStalling: false,
        productionEvidenceIds: []
      });
    }

    const current = requests.get(prrRequestId);
    if (!current) {
      continue;
    }

    if (event.type === "prr.request.sent") {
      current.status = "sent";
    }
    if (event.type === "prr.correspondence.received") {
      current.status = "acknowledged";
    }
    if (event.type === "prr.deadline.estimated") {
      current.activeDeadline = { deadlineDate: event.payload.deadlineDate, source: "estimated" };
    }
    if (event.type === "prr.deadline.confirmed") {
      current.activeDeadline = { deadlineDate: event.payload.deadlineDate, source: "confirmed" };
    }
    if (event.type === "prr.production.received") {
      current.status = "awaitingProduction";
      current.productionEvidenceIds.push(...event.payload.evidenceIds);
    }
    if (event.type === "prr.stalling.detected") {
      current.possibleStalling = true;
    }
    if (event.type === "prr.stalling.confirmed") {
      current.confirmedStalling = true;
    }
  }

  return {
    requests,
    timelineForRequest(prrRequestId) {
      return [...(timelines.get(prrRequestId) ?? [])];
    }
  };
}

function requestIdFromEvent(event: KnowledgeEvent): string | undefined {
  const payload = event.payload as { prrRequestId?: unknown };
  return typeof payload.prrRequestId === "string" ? payload.prrRequestId : undefined;
}
```

- [ ] **Step 4: Export projection**

Modify `packages/prr/src/index.ts`:

```ts
export const prrPackageName = "@cestus/prr";
export * from "./types.js";
export * from "./lifecycle.js";
export * from "./jurisdiction-packs.js";
export * from "./deadlines.js";
export * from "./stalling.js";
export * from "./correspondence-adapter.js";
export * from "./provider-adapters.js";
export * from "./correspondence-service.js";
export * from "./evidence-bridge.js";
export * from "./extraction-queue.js";
export * from "./projection.js";
```

- [ ] **Step 5: Run targeted test**

Run:

```bash
npm test -- packages/prr/test/projection.test.ts
```

Expected:

```text
1 passed
```

- [ ] **Step 6: Run full verification**

Run:

```bash
npm run verify
```

Expected:

```text
typecheck passed
tests passed
factory-readiness passed
```

- [ ] **Step 7: Commit**

Run:

```bash
git add packages/prr/src/projection.ts packages/prr/src/index.ts packages/prr/test/projection.test.ts packages/prr/test/fixtures/golden-prr-ledger.ts
git commit -m "feat: add prr projection"
```

## Task 11: Add UI-Facing Read API Contracts

**Files:**
- Create: `packages/prr/src/read-api.ts`
- Create: `packages/prr/test/read-api.test.ts`
- Modify: `packages/prr/src/index.ts`

- [ ] **Step 1: Write failing read API test**

Create `packages/prr/test/read-api.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildPrrProjection } from "../src/projection.js";
import { buildRequestQueueRows } from "../src/read-api.js";
import { goldenPrrLedgerEvents } from "./fixtures/golden-prr-ledger.js";

describe("PRR read API DTOs", () => {
  it("builds request queue rows without UI business logic", () => {
    const projection = buildPrrProjection(goldenPrrLedgerEvents);

    expect(buildRequestQueueRows(projection)).toEqual([
      {
        prrRequestId: "prr_req_001",
        agencyName: "Example Agency",
        status: "awaitingProduction",
        deadlineDate: "2026-07-29",
        deadlineSource: "estimated",
        possibleStalling: false,
        confirmedStalling: false,
        productionCount: 1
      }
    ]);
  });
});
```

- [ ] **Step 2: Run read API test to verify it fails**

Run:

```bash
npm test -- packages/prr/test/read-api.test.ts
```

Expected:

```text
Failed to resolve import "../src/read-api.js"
```

- [ ] **Step 3: Create read API DTO builder**

Create `packages/prr/src/read-api.ts`:

```ts
import type { PrrProjection } from "./projection.js";
import type { PrrStatus } from "./types.js";

export interface RequestQueueRow {
  prrRequestId: string;
  agencyName: string;
  status: PrrStatus;
  deadlineDate?: string;
  deadlineSource?: "estimated" | "confirmed";
  possibleStalling: boolean;
  confirmedStalling: boolean;
  productionCount: number;
}

export function buildRequestQueueRows(projection: PrrProjection): RequestQueueRow[] {
  return [...projection.requests.values()]
    .map((request) => ({
      prrRequestId: request.prrRequestId,
      agencyName: request.agencyName,
      status: request.status,
      ...(request.activeDeadline === undefined
        ? {}
        : {
            deadlineDate: request.activeDeadline.deadlineDate,
            deadlineSource: request.activeDeadline.source
          }),
      possibleStalling: request.possibleStalling,
      confirmedStalling: request.confirmedStalling,
      productionCount: request.productionEvidenceIds.length
    }))
    .sort((left, right) => left.prrRequestId.localeCompare(right.prrRequestId));
}
```

- [ ] **Step 4: Export read API**

Modify `packages/prr/src/index.ts`:

```ts
export const prrPackageName = "@cestus/prr";
export * from "./types.js";
export * from "./lifecycle.js";
export * from "./jurisdiction-packs.js";
export * from "./deadlines.js";
export * from "./stalling.js";
export * from "./correspondence-adapter.js";
export * from "./provider-adapters.js";
export * from "./correspondence-service.js";
export * from "./evidence-bridge.js";
export * from "./extraction-queue.js";
export * from "./projection.js";
export * from "./read-api.js";
```

- [ ] **Step 5: Run targeted test**

Run:

```bash
npm test -- packages/prr/test/read-api.test.ts
```

Expected:

```text
1 passed
```

- [ ] **Step 6: Run full verification**

Run:

```bash
npm run verify
```

Expected:

```text
typecheck passed
tests passed
factory-readiness passed
```

- [ ] **Step 7: Commit**

Run:

```bash
git add packages/prr/src/read-api.ts packages/prr/src/index.ts packages/prr/test/read-api.test.ts
git commit -m "feat: add prr read api contracts"
```

## Task 12: Add PRR Diagnostics Helpers

**Files:**
- Create: `packages/prr/src/diagnostics.ts`
- Create: `packages/prr/test/diagnostics.test.ts`
- Modify: `packages/prr/src/index.ts`

- [ ] **Step 1: Write failing diagnostics test**

Create `packages/prr/test/diagnostics.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createPrrDiagnostic } from "../src/diagnostics.js";

describe("PRR diagnostics", () => {
  it("records repair hints without secrets", () => {
    expect(
      createPrrDiagnostic({
        diagnosticId: "diag_prr_001",
        prrRequestId: "prr_req_001",
        category: "adapter",
        message: "Himalaya command failed",
        violatedPath: "adapter.himalaya.command",
        allowedActions: ["check Himalaya profile", "use another adapter"]
      })
    ).toEqual({
      diagnosticId: "diag_prr_001",
      prrRequestId: "prr_req_001",
      category: "adapter",
      message: "Himalaya command failed",
      repairHint: {
        violatedPath: "adapter.himalaya.command",
        allowedActions: ["check Himalaya profile", "use another adapter"]
      }
    });
  });
});
```

- [ ] **Step 2: Run diagnostics test to verify it fails**

Run:

```bash
npm test -- packages/prr/test/diagnostics.test.ts
```

Expected:

```text
Failed to resolve import "../src/diagnostics.js"
```

- [ ] **Step 3: Create diagnostics helper**

Create `packages/prr/src/diagnostics.ts`:

```ts
type PrrDiagnosticCategory =
  | "contract"
  | "lifecycle"
  | "deadline"
  | "adapter"
  | "evidence"
  | "projection"
  | "escalation";

interface PrrDiagnosticInput {
  diagnosticId: string;
  prrRequestId: string;
  category: PrrDiagnosticCategory;
  message: string;
  violatedPath: string;
  allowedActions: string[];
}

export function createPrrDiagnostic(input: PrrDiagnosticInput) {
  assertNoSecretText(input.message);
  for (const action of input.allowedActions) {
    assertNoSecretText(action);
  }
  return {
    diagnosticId: input.diagnosticId,
    prrRequestId: input.prrRequestId,
    category: input.category,
    message: input.message,
    repairHint: {
      violatedPath: input.violatedPath,
      allowedActions: [...input.allowedActions]
    }
  };
}

function assertNoSecretText(value: string): void {
  if (/token|password|refresh secret|client secret/i.test(value)) {
    throw new Error("PRR diagnostics must not contain secrets");
  }
}
```

- [ ] **Step 4: Export diagnostics**

Modify `packages/prr/src/index.ts`:

```ts
export const prrPackageName = "@cestus/prr";
export * from "./types.js";
export * from "./lifecycle.js";
export * from "./jurisdiction-packs.js";
export * from "./deadlines.js";
export * from "./stalling.js";
export * from "./correspondence-adapter.js";
export * from "./provider-adapters.js";
export * from "./correspondence-service.js";
export * from "./evidence-bridge.js";
export * from "./extraction-queue.js";
export * from "./projection.js";
export * from "./read-api.js";
export * from "./diagnostics.js";
```

- [ ] **Step 5: Run targeted test**

Run:

```bash
npm test -- packages/prr/test/diagnostics.test.ts
```

Expected:

```text
1 passed
```

- [ ] **Step 6: Run full verification**

Run:

```bash
npm run verify
```

Expected:

```text
typecheck passed
tests passed
factory-readiness passed
```

- [ ] **Step 7: Commit**

Run:

```bash
git add packages/prr/src/diagnostics.ts packages/prr/src/index.ts packages/prr/test/diagnostics.test.ts
git commit -m "feat: add prr diagnostics"
```

## Task 13: Wire Factory Readiness For PRR Plan And Spec

**Files:**
- Modify: `scripts/check-agent-readiness.mjs`
- Modify: `docs/agentic/software-factory.md`
- Modify: `docs/superpowers/plans/2026-07-01-public-records-request-workflow-implementation.md`

- [ ] **Step 1: Write the failing readiness expectation**

Modify `scripts/check-agent-readiness.mjs` by adding the PRR spec and plan to `requiredFiles`:

```js
  "docs/superpowers/specs/2026-07-01-public-records-request-workflow-design.md",
  "docs/superpowers/plans/2026-07-01-public-records-request-workflow-implementation.md"
```

Temporarily run the check before saving the plan completion evidence:

```bash
npm run factory:check
```

Expected before this task is completed:

```text
factory-readiness passed
```

This check should pass because both files exist by this point.

- [ ] **Step 2: Record PRR factory readiness evidence**

Append a `Public Records Workflow Plan Readiness` section to `docs/agentic/software-factory.md`:

```md
## Public Records Workflow Plan Readiness

The PRR workflow plan was prepared from the approved design spec on 2026-07-01.

Required design and plan files:

- `docs/superpowers/specs/2026-07-01-public-records-request-workflow-design.md`
- `docs/superpowers/plans/2026-07-01-public-records-request-workflow-implementation.md`

Factory scope remains backend/domain work. UI design and build decisions require direct user collaboration.
```

- [ ] **Step 3: Run full verification**

Run:

```bash
npm run verify
```

Expected:

```text
typecheck passed
tests passed
factory-readiness passed
```

- [ ] **Step 4: Commit**

Run:

```bash
git add scripts/check-agent-readiness.mjs docs/agentic/software-factory.md docs/superpowers/plans/2026-07-01-public-records-request-workflow-implementation.md
git commit -m "docs: record prr factory plan readiness"
```

## Completion Criteria

The PRR backend/domain slice is complete when:

- `npm run verify` passes locally.
- Every task has a commit.
- PRR event contracts validate strict payloads.
- Request lifecycle state rebuilds from the ledger.
- Federal FOIA and Florida starter packs produce inspectable deadline outputs.
- Estimated deadlines drive normal follow-ups while legal escalation requires user confirmation.
- Possible stalling is detected separately from confirmed stalling.
- Correspondence adapters share a provider-neutral contract and tests use fakes.
- One-click send records human approval and provider metadata.
- Messages, attachments, and productions can enter the evidence bridge.
- Extraction queue items are validated and do not create accepted graph assertions.
- PRR projections rebuild from golden ledger events.
- UI-facing DTOs expose request queue state without owning business logic.
- Diagnostics do not contain secrets.
- Factory readiness includes the PRR spec and implementation plan.
