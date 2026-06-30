# Ontology Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first event-sourced, AI-legible Cestus ontology foundation with validated event contracts, a SQLite-backed ledger, rebuildable projections, domain packs, provenance-first assertions, and autonomous software-factory guardrails.

**Architecture:** The canonical source of truth is an append-only knowledge ledger. SQLite is the solo-mode event store; projections, graph views, search/export views, and diagnostics are rebuildable read models. The repo begins with an agent-readable factory harness so future coding agents can claim tasks, run verification, and stop only at explicit escalation points.

**Tech Stack:** TypeScript, Node.js 26, npm, Vitest, Zod, Node built-in `node:sqlite`, JSON files for domain-pack manifests, Markdown for agent operating instructions.

---

## Research Basis

This plan uses the following software-factory patterns from current AI coding-agent practice:

- [Steipete, "Just Talk To It"](https://steipete.me/posts/just-talk-to-it): keep feedback loops short, make agent instructions durable, and let agents operate from explicit context instead of fragile one-off prompting.
- [Steipete, "Essential Reading for AI Coding"](https://steipete.me/posts/2025/essential-reading): treat AI coding as a workflow discipline with task breakdown, review, and repeatable verification rather than a chat habit.
- [Factory AI, "Software Factory"](https://factory.ai/news/software-factory): route work through an autonomous factory model with signals, assigned workers, quality gates, and persistent execution.
- [Factory AI, "Missions Architecture"](https://factory.ai/news/missions-architecture): break complicated work into durable missions with clear state, constraints, and multi-agent coordination.
- [OpenAI Codex Best Practices](https://developers.openai.com/codex/learn/best-practices): keep repo-local instructions, run tests from explicit commands, preserve context in files, and ask agents for small reviewable changes.
- [OpenAI Codex Execution Plans](https://developers.openai.com/cookbook/articles/codex_exec_plans): use implementation plans as executable task ledgers with verification after each slice.
- [Anthropic Claude Code Best Practices](https://www.anthropic.com/engineering/claude-code-best-practices): explore, plan, code, test, commit; give the agent ways to verify work and keep shared context in repo docs.
- [Anthropic Claude Code Hooks](https://docs.anthropic.com/en/docs/claude-code/hooks): use automated checks and stop conditions around agent activity so autonomy is bounded by verifiable gates.

## Software Factory Operating Model

Every task in this plan is a work order. A worker agent must:

1. Read `AGENTS.md`, this plan, and the ontology spec before editing.
2. Create or use a task-scoped branch/worktree.
3. Write the failing test first.
4. Run the targeted test and confirm the expected failure.
5. Write the smallest production change that satisfies the test.
6. Run the targeted test, then the full local verification command.
7. Commit only the files listed in that task.
8. Hand off to a reviewer agent or an inline review pass before the next task starts.

Autonomous execution stops only when one of these explicit escalation conditions is met:

- A test failure remains after two focused repair attempts.
- A dependency install fails because the package is unavailable or incompatible with Node.js 26.
- A schema or ontology choice conflicts with the approved design spec.
- A change would weaken append-only ledger semantics, provenance requirements, or projection rebuildability.
- A migration or storage change risks data loss.
- A task needs credentials, external services, or unavailable production data.

The standard verification command after each task is:

```bash
npm run verify
```

Expected successful output includes:

```text
typecheck passed
tests passed
factory-readiness passed
```

## File Structure

- `AGENTS.md`: cross-agent operating instructions for Codex, Claude Code, Opencode, and future Cestus agents.
- `CLAUDE.md`: thin pointer to `AGENTS.md` for Claude Code.
- `.opencode/AGENTS.md`: thin pointer to the root agent contract for Opencode-style agents.
- `docs/agentic/software-factory.md`: autonomous factory model, worker/reviewer roles, gates, and stop conditions.
- `docs/agentic/task-template.md`: copyable task work-order shape.
- `docs/agentic/review-template.md`: reviewer checklist for code and ontology changes.
- `scripts/check-agent-readiness.mjs`: repo-local readiness check for instructions, plans, contracts, examples, and forbidden unfinished markers.
- `package.json`: npm scripts and dependency manifest.
- `tsconfig.json`: strict TypeScript configuration.
- `vitest.config.ts`: Vitest configuration.
- `packages/ontology/src/contracts.ts`: event, primitive, and contract schemas.
- `packages/ontology/src/event-ledger.ts`: event ledger interface and in-memory implementation.
- `packages/ontology/src/sqlite-event-ledger.ts`: SQLite event store.
- `packages/ontology/src/blob-store.ts`: content-addressed local blob store.
- `packages/ontology/src/domain-packs.ts`: pack contract, registry, scopes, and core pack.
- `packages/ontology/src/evidence-service.ts`: raw evidence intake service.
- `packages/ontology/src/assertion-service.ts`: assertion proposal and review service.
- `packages/ontology/src/graph-projection.ts`: rebuildable graph projection.
- `packages/ontology/src/diagnostics.ts`: structured diagnostic event helper.
- `packages/ontology/src/jsonld-export.ts`: JSON-LD export boundary.
- `packages/ontology/src/index.ts`: public ontology package exports.
- `packages/ontology/test/*.test.ts`: focused tests for each unit.
- `packages/ontology/test/fixtures/golden-ledger.ts`: replayable ledger fixture.
- `.github/workflows/verify.yml`: CI gate that runs the same verification command.

## Scope Boundary For This Plan

This plan builds the solo-mode ontology foundation and the storage interface that a Postgres team-mode adapter must satisfy. The Postgres adapter belongs in the next storage plan after the SQLite event store, shared ledger contract tests, and projection replay behavior are stable.

## Task 1: Bootstrap The Agent-Ready TypeScript Workspace

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `packages/ontology/src/index.ts`
- Create: `packages/ontology/test/smoke.test.ts`

- [ ] **Step 1: Write the failing smoke test**

Create `packages/ontology/test/smoke.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ontologyPackageName } from "../src/index.js";

describe("ontology package", () => {
  it("exposes a stable package name", () => {
    expect(ontologyPackageName).toBe("@cestus/ontology");
  });
});
```

- [ ] **Step 2: Run the smoke test to verify it fails**

Run:

```bash
npm test -- packages/ontology/test/smoke.test.ts
```

Expected:

```text
Could not read package.json
```

- [ ] **Step 3: Create the workspace manifest and TypeScript config**

Create `package.json`:

```json
{
  "name": "cestus",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run && echo 'tests passed'",
    "typecheck": "tsc --noEmit && echo 'typecheck passed'",
    "factory:check": "node scripts/check-agent-readiness.mjs",
    "verify": "npm run typecheck && npm test && npm run factory:check"
  },
  "dependencies": {
    "zod": "^4.2.0"
  },
  "devDependencies": {
    "@types/node": "^26.0.0",
    "typescript": "^5.9.0",
    "vitest": "^4.0.0"
  }
}
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "rootDir": ".",
    "outDir": "dist"
  },
  "include": ["packages/**/*.ts", "vitest.config.ts"]
}
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts"]
  }
});
```

Create `packages/ontology/src/index.ts`:

```ts
export const ontologyPackageName = "@cestus/ontology";
```

- [ ] **Step 4: Install dependencies**

Run:

```bash
npm install
```

Expected:

```text
added
```

- [ ] **Step 5: Run the smoke test**

Run:

```bash
npm test -- packages/ontology/test/smoke.test.ts
```

Expected:

```text
1 passed
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts packages/ontology/src/index.ts packages/ontology/test/smoke.test.ts
git commit -m "chore: bootstrap ontology workspace"
```

## Task 2: Add Software Factory Instructions And Readiness Check

**Files:**
- Create: `AGENTS.md`
- Create: `CLAUDE.md`
- Create: `.opencode/AGENTS.md`
- Create: `docs/agentic/software-factory.md`
- Create: `docs/agentic/task-template.md`
- Create: `docs/agentic/review-template.md`
- Create: `scripts/check-agent-readiness.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write the failing readiness test**

Create `scripts/check-agent-readiness.mjs`:

```js
import { existsSync, readFileSync } from "node:fs";

const requiredFiles = [
  "AGENTS.md",
  "CLAUDE.md",
  ".opencode/AGENTS.md",
  "docs/agentic/software-factory.md",
  "docs/agentic/task-template.md",
  "docs/agentic/review-template.md",
  "docs/superpowers/specs/2026-06-30-ontology-layer-design.md",
  "docs/superpowers/plans/2026-06-30-ontology-layer-implementation.md"
];

const forbiddenWords = [
  "T" + "BD",
  "TO" + "DO",
  "FIX" + "ME",
  "implement " + "later",
  "fill in " + "details",
  "add " + "appropriate",
  "similar to " + "Task"
];
const forbidden = new RegExp(`\\b(${forbiddenWords.join("|")})\\b`, "i");
const failures = [];

for (const file of requiredFiles) {
  if (!existsSync(file)) {
    failures.push(`missing ${file}`);
    continue;
  }
  const text = readFileSync(file, "utf8");
  if (forbidden.test(text)) {
    failures.push(`forbidden unfinished marker in ${file}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("factory-readiness passed");
```

- [ ] **Step 2: Run readiness check to verify it fails**

Run:

```bash
npm run factory:check
```

Expected:

```text
missing AGENTS.md
```

- [ ] **Step 3: Create the root agent contract**

Create `AGENTS.md`:

```md
# Cestus Agent Contract

This repository is designed for autonomous AI coding agents. Treat repo files as durable shared state.

## Required Reading

Before editing, read:

1. `docs/superpowers/specs/2026-06-30-ontology-layer-design.md`
2. `docs/superpowers/plans/2026-06-30-ontology-layer-implementation.md`
3. `docs/agentic/software-factory.md`

## Work Rules

- Use a task-scoped branch or worktree.
- Change only files listed by the current task unless a verifier requires a small supporting edit.
- Write failing tests before production code.
- Run the exact targeted command in the task.
- Run `npm run verify` before committing.
- Commit after each completed task.
- Do not weaken append-only ledger semantics, provenance requirements, or projection rebuildability.
- Stop and escalate on data-loss risk, schema conflict, unavailable dependency, or repeated verifier failure.

## Review Rules

Reviewer agents lead with defects, missing tests, and spec drift. A change is complete only when the tests, typecheck, and factory readiness check pass.
```

Create `CLAUDE.md`:

```md
# Claude Code Instructions

Follow `AGENTS.md`. It is the canonical agent contract for this repository.
```

Create `.opencode/AGENTS.md`:

```md
# Opencode Instructions

Follow `../AGENTS.md`. It is the canonical agent contract for this repository.
```

Create `docs/agentic/software-factory.md`:

```md
# Cestus Software Factory

Cestus uses an autonomous software-factory workflow.

## Roles

- Worker: implements one task from the active plan.
- Reviewer: checks the worker's diff against the spec, tests, and plan.
- Gatekeeper: runs `npm run verify` and confirms no forbidden unfinished marker remains.

## Work Order Lifecycle

1. Claim one unchecked task.
2. Read the files named in that task.
3. Write the failing test.
4. Run the targeted failing command.
5. Write the production change.
6. Run the targeted passing command.
7. Run `npm run verify`.
8. Commit the task.
9. Hand off to review.

## Stop Conditions

Stop when a dependency is unavailable, a verifier fails after two focused repair attempts, a schema choice conflicts with the ontology spec, a storage change risks data loss, or a task needs credentials or unavailable external services.
```

Create `docs/agentic/task-template.md`:

```md
# Task Work Order Template

## Task

Name the single task and link the plan section.

## Files

List every file to create, modify, and test.

## Acceptance

State the exact command and expected result.

## Handoff

Record changed files, verification output, commit hash, and reviewer notes.
```

Create `docs/agentic/review-template.md`:

```md
# Review Template

## Findings

List bugs, spec drift, missing tests, unsafe migrations, and verification gaps first.

## Verification

Record the exact commands run and whether they passed.

## Decision

Use one outcome: approved, needs changes, or blocked by escalation condition.
```

- [ ] **Step 4: Run readiness check**

Run:

```bash
npm run factory:check
```

Expected:

```text
factory-readiness passed
```

- [ ] **Step 5: Run full verification**

Run:

```bash
npm run verify
```

Expected:

```text
factory-readiness passed
```

- [ ] **Step 6: Commit**

```bash
git add AGENTS.md CLAUDE.md .opencode/AGENTS.md docs/agentic scripts/check-agent-readiness.mjs package.json
git commit -m "chore: add autonomous factory guardrails"
```

## Task 3: Define AI-Legible Event Contracts

**Files:**
- Create: `packages/ontology/src/contracts.ts`
- Create: `packages/ontology/test/contracts.test.ts`
- Modify: `packages/ontology/src/index.ts`

- [ ] **Step 1: Write the failing contract tests**

Create `packages/ontology/test/contracts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  eventContracts,
  validateKnowledgeEvent,
  type KnowledgeEvent
} from "../src/contracts.js";

const context = {
  actor: { id: "actor_system", kind: "system", label: "test runner" },
  occurredAt: "2026-06-30T17:00:00.000Z",
  correlationId: "corr_contracts",
  coreVersion: "0.1.0",
  packVersions: { core: "0.1.0" }
} as const;

describe("event contracts", () => {
  it("contains agent guidance for every event contract", () => {
    for (const contract of Object.values(eventContracts)) {
      expect(contract.description.length).toBeGreaterThan(20);
      expect(contract.agentGuidance.length).toBeGreaterThan(20);
      expect(contract.invariants.length).toBeGreaterThan(0);
    }
  });

  it("validates a self-describing evidence.ingested event", () => {
    const event: KnowledgeEvent = {
      id: "evt_000000000000000000000001",
      type: "evidence.ingested",
      version: 1,
      streamId: "evidence_ev_001",
      sequence: 1,
      context,
      payload: {
        evidenceId: "ev_001",
        source: { kind: "file", label: "invoice.pdf" },
        contentHash: "sha256:9f2c8b7a5f4e3d2c1b0a99887766554433221100ffeeddccbbaa998877665544",
        mediaType: "application/pdf",
        sizeBytes: 128
      }
    };

    expect(validateKnowledgeEvent(event).success).toBe(true);
  });

  it("rejects an assertion without provenance", () => {
    const result = validateKnowledgeEvent({
      id: "evt_000000000000000000000002",
      type: "assertion.proposed",
      version: 1,
      streamId: "assertion_as_001",
      sequence: 1,
      context,
      payload: {
        assertionId: "as_001",
        predicate: "agency.name",
        object: "Example Agency",
        confidence: 0.91,
        reviewState: "proposed"
      }
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toContain("payload.evidenceId");
    }
  });
});
```

- [ ] **Step 2: Run the contract tests to verify they fail**

Run:

```bash
npm test -- packages/ontology/test/contracts.test.ts
```

Expected:

```text
Failed to resolve import "../src/contracts.js"
```

- [ ] **Step 3: Create the contract module**

Create `packages/ontology/src/contracts.ts`:

```ts
import { z } from "zod";

export const actorRefSchema = z.object({
  id: z.string().min(3),
  kind: z.enum(["human", "extractor", "system"]),
  label: z.string().min(1)
});

export const eventContextSchema = z.object({
  actor: actorRefSchema,
  occurredAt: z.string().datetime(),
  causationId: z.string().regex(/^evt_[a-zA-Z0-9_-]+$/).optional(),
  correlationId: z.string().min(3),
  coreVersion: z.string().min(1),
  packVersions: z.record(z.string(), z.string())
});

const sourceRefSchema = z.object({
  kind: z.enum(["file", "url", "dataset", "message", "annotation", "manual"]),
  label: z.string().min(1),
  uri: z.string().optional()
});

const evidenceIngestedPayloadSchema = z.object({
  evidenceId: z.string().regex(/^ev_[a-zA-Z0-9_-]+$/),
  source: sourceRefSchema,
  contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  mediaType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative()
});

const assertionProposedPayloadSchema = z.object({
  assertionId: z.string().regex(/^as_[a-zA-Z0-9_-]+$/),
  evidenceId: z.string().regex(/^ev_[a-zA-Z0-9_-]+$/),
  subjectRef: z.string().optional(),
  predicate: z.string().min(1),
  object: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  confidence: z.number().min(0).max(1),
  reviewState: z.literal("proposed")
});

const assertionAcceptedPayloadSchema = z.object({
  assertionId: z.string().regex(/^as_[a-zA-Z0-9_-]+$/),
  acceptedBy: z.string().min(3),
  rationale: z.string().min(1)
});

const entityResolvedPayloadSchema = z.object({
  entityId: z.string().regex(/^ent_[a-zA-Z0-9_-]+$/),
  assertionIds: z.array(z.string().regex(/^as_[a-zA-Z0-9_-]+$/)).min(1),
  canonicalLabel: z.string().min(1),
  entityType: z.string().min(1)
});

const relationshipAcceptedPayloadSchema = z.object({
  relationshipId: z.string().regex(/^rel_[a-zA-Z0-9_-]+$/),
  fromEntityId: z.string().regex(/^ent_[a-zA-Z0-9_-]+$/),
  toEntityId: z.string().regex(/^ent_[a-zA-Z0-9_-]+$/),
  relationshipType: z.string().min(1),
  assertionIds: z.array(z.string().regex(/^as_[a-zA-Z0-9_-]+$/)).min(1)
});

const claimCreatedPayloadSchema = z.object({
  claimId: z.string().regex(/^cl_[a-zA-Z0-9_-]+$/),
  investigationId: z.string().regex(/^inv_[a-zA-Z0-9_-]+$/),
  statement: z.string().min(1)
});

const diagnosticRecordedPayloadSchema = z.object({
  diagnosticId: z.string().regex(/^diag_[a-zA-Z0-9_-]+$/),
  severity: z.enum(["info", "warning", "error"]),
  category: z.enum(["ingestion", "validation", "projection", "migration", "deduplication"]),
  message: z.string().min(1),
  repairHint: z.object({
    contract: z.string().min(1),
    violatedPath: z.string().min(1),
    allowedActions: z.array(z.string().min(1)).min(1)
  })
});

const ontologyPackInstalledPayloadSchema = z.object({
  packName: z.string().min(1),
  packVersion: z.string().min(1),
  scope: z.enum(["core", "org", "investigation"])
});

const projectionCheckpointedPayloadSchema = z.object({
  projectionName: z.string().min(1),
  highWaterMark: z.number().int().nonnegative(),
  status: z.enum(["ready", "rebuilding", "failed"])
});

export const payloadSchemas = {
  "evidence.ingested": evidenceIngestedPayloadSchema,
  "assertion.proposed": assertionProposedPayloadSchema,
  "assertion.accepted": assertionAcceptedPayloadSchema,
  "entity.resolved": entityResolvedPayloadSchema,
  "relationship.accepted": relationshipAcceptedPayloadSchema,
  "claim.created": claimCreatedPayloadSchema,
  "diagnostic.recorded": diagnosticRecordedPayloadSchema,
  "ontology.pack.installed": ontologyPackInstalledPayloadSchema,
  "projection.checkpointed": projectionCheckpointedPayloadSchema
} as const;

export type KnowledgeEventType = keyof typeof payloadSchemas;

export interface EventContract {
  type: KnowledgeEventType;
  version: 1;
  description: string;
  agentGuidance: string;
  invariants: string[];
}

export const eventContracts: Record<KnowledgeEventType, EventContract> = {
  "evidence.ingested": {
    type: "evidence.ingested",
    version: 1,
    description: "Records that raw evidence entered Cestus with source metadata and a content hash.",
    agentGuidance: "Use this before any assertion is proposed. Store large payloads outside the ledger and reference them by hash.",
    invariants: ["contentHash must be sha256", "evidenceId must be stable"]
  },
  "assertion.proposed": {
    type: "assertion.proposed",
    version: 1,
    description: "Records a candidate fact extracted or written from evidence before human or policy review.",
    agentGuidance: "Never create this without evidenceId. Use reviewState proposed and let review events promote it.",
    invariants: ["evidenceId is required", "confidence is between 0 and 1"]
  },
  "assertion.accepted": {
    type: "assertion.accepted",
    version: 1,
    description: "Records review acceptance of a previously proposed assertion.",
    agentGuidance: "Use this only when a reviewer or trusted policy accepts a specific assertion.",
    invariants: ["assertionId must reference a proposed assertion", "rationale is required"]
  },
  "entity.resolved": {
    type: "entity.resolved",
    version: 1,
    description: "Records that assertions resolve into a durable shared entity.",
    agentGuidance: "Use after evidence-backed assertions justify the entity identity.",
    invariants: ["at least one assertionId is required"]
  },
  "relationship.accepted": {
    type: "relationship.accepted",
    version: 1,
    description: "Records an accepted relationship between two resolved entities.",
    agentGuidance: "Use only when relationship evidence is represented by accepted assertions.",
    invariants: ["fromEntityId and toEntityId are required", "assertionIds cannot be empty"]
  },
  "claim.created": {
    type: "claim.created",
    version: 1,
    description: "Records an investigation-specific claim or hypothesis.",
    agentGuidance: "Use claims for uncertain or investigation-local reasoning instead of polluting shared graph truth.",
    invariants: ["investigationId is required", "statement is required"]
  },
  "diagnostic.recorded": {
    type: "diagnostic.recorded",
    version: 1,
    description: "Records structured operational or investigative diagnostics tied to ontology work.",
    agentGuidance: "Use when validation, ingestion, projection, migration, or deduplication produces inspectable failure state.",
    invariants: ["repairHint must include allowed actions"]
  },
  "ontology.pack.installed": {
    type: "ontology.pack.installed",
    version: 1,
    description: "Records installation of a core, organization, or investigation ontology pack.",
    agentGuidance: "Use for governed ontology changes. Do not mutate pack scope silently.",
    invariants: ["packName and packVersion are required"]
  },
  "projection.checkpointed": {
    type: "projection.checkpointed",
    version: 1,
    description: "Records projection high-water mark and rebuild status.",
    agentGuidance: "Use to make projection state inspectable and rebuildable from the ledger.",
    invariants: ["highWaterMark cannot be negative"]
  }
};

export interface KnowledgeEvent {
  id: string;
  type: KnowledgeEventType;
  version: 1;
  streamId: string;
  sequence: number;
  context: z.infer<typeof eventContextSchema>;
  payload: Record<string, unknown>;
}

export const knowledgeEventSchema: z.ZodType<KnowledgeEvent> = z.object({
  id: z.string().regex(/^evt_[a-zA-Z0-9_-]+$/),
  type: z.custom<KnowledgeEventType>((value) => typeof value === "string" && value in payloadSchemas),
  version: z.literal(1),
  streamId: z.string().min(3),
  sequence: z.number().int().positive(),
  context: eventContextSchema,
  payload: z.record(z.string(), z.unknown())
}).superRefine((event, ctx) => {
  const payloadSchema = payloadSchemas[event.type];
  const payload = payloadSchema.safeParse(event.payload);
  if (!payload.success) {
    for (const issue of payload.error.issues) {
      ctx.addIssue({ ...issue, path: ["payload", ...issue.path] });
    }
  }
});

export function validateKnowledgeEvent(event: unknown) {
  return knowledgeEventSchema.safeParse(event);
}
```

Modify `packages/ontology/src/index.ts`:

```ts
export const ontologyPackageName = "@cestus/ontology";
export * from "./contracts.js";
```

- [ ] **Step 4: Run contract tests**

Run:

```bash
npm test -- packages/ontology/test/contracts.test.ts
```

Expected:

```text
3 passed
```

- [ ] **Step 5: Run verification**

Run:

```bash
npm run verify
```

Expected:

```text
factory-readiness passed
```

- [ ] **Step 6: Commit**

```bash
git add packages/ontology/src/contracts.ts packages/ontology/src/index.ts packages/ontology/test/contracts.test.ts
git commit -m "feat: add ontology event contracts"
```

## Task 4: Add Append-Only In-Memory Event Ledger

**Files:**
- Create: `packages/ontology/src/event-ledger.ts`
- Create: `packages/ontology/test/event-ledger.test.ts`
- Modify: `packages/ontology/src/index.ts`

- [ ] **Step 1: Write the failing ledger tests**

Create `packages/ontology/test/event-ledger.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { InMemoryEventLedger, type AppendableKnowledgeEvent } from "../src/event-ledger.js";

const context = {
  actor: { id: "actor_system", kind: "system" as const, label: "test runner" },
  occurredAt: "2026-06-30T17:00:00.000Z",
  correlationId: "corr_ledger",
  coreVersion: "0.1.0",
  packVersions: { core: "0.1.0" }
};

function evidenceEvent(evidenceId: string): AppendableKnowledgeEvent {
  return {
    type: "evidence.ingested",
    version: 1,
    streamId: `evidence_${evidenceId}`,
    context,
    payload: {
      evidenceId,
      source: { kind: "file", label: `${evidenceId}.pdf` },
      contentHash: "sha256:9f2c8b7a5f4e3d2c1b0a99887766554433221100ffeeddccbbaa998877665544",
      mediaType: "application/pdf",
      sizeBytes: 128
    }
  };
}

describe("InMemoryEventLedger", () => {
  it("assigns event ids and stream sequences", async () => {
    const ledger = new InMemoryEventLedger();
    const first = await ledger.append(evidenceEvent("ev_001"));
    const second = await ledger.append(evidenceEvent("ev_001"));

    expect(first.id).toMatch(/^evt_/);
    expect(first.sequence).toBe(1);
    expect(second.sequence).toBe(2);
  });

  it("enforces optimistic concurrency", async () => {
    const ledger = new InMemoryEventLedger();
    await ledger.append(evidenceEvent("ev_002"), { expectedNextSequence: 1 });

    await expect(
      ledger.append(evidenceEvent("ev_002"), { expectedNextSequence: 1 })
    ).rejects.toThrow("Concurrency conflict");
  });

  it("returns immutable snapshots", async () => {
    const ledger = new InMemoryEventLedger();
    const event = await ledger.append(evidenceEvent("ev_003"));
    (event.payload as { sizeBytes: number }).sizeBytes = 999;

    const stored = await ledger.readStream("evidence_ev_003");
    expect((stored[0]?.payload as { sizeBytes: number }).sizeBytes).toBe(128);
  });
});
```

- [ ] **Step 2: Run ledger tests to verify they fail**

Run:

```bash
npm test -- packages/ontology/test/event-ledger.test.ts
```

Expected:

```text
Failed to resolve import "../src/event-ledger.js"
```

- [ ] **Step 3: Create the in-memory ledger**

Create `packages/ontology/src/event-ledger.ts`:

```ts
import { randomUUID } from "node:crypto";
import { validateKnowledgeEvent, type KnowledgeEvent } from "./contracts.js";

export type AppendableKnowledgeEvent = Omit<KnowledgeEvent, "id" | "sequence">;

export interface AppendOptions {
  expectedNextSequence?: number;
}

export interface EventLedger {
  append(event: AppendableKnowledgeEvent, options?: AppendOptions): Promise<KnowledgeEvent>;
  readStream(streamId: string): Promise<KnowledgeEvent[]>;
  readAll(): Promise<KnowledgeEvent[]>;
}

function cloneEvent<T>(value: T): T {
  return structuredClone(value);
}

export class InMemoryEventLedger implements EventLedger {
  private readonly events: KnowledgeEvent[] = [];

  async append(event: AppendableKnowledgeEvent, options: AppendOptions = {}): Promise<KnowledgeEvent> {
    const currentStreamLength = this.events.filter((stored) => stored.streamId === event.streamId).length;
    const nextSequence = currentStreamLength + 1;

    if (options.expectedNextSequence !== undefined && options.expectedNextSequence !== nextSequence) {
      throw new Error(`Concurrency conflict for ${event.streamId}: expected sequence ${options.expectedNextSequence}, next sequence ${nextSequence}`);
    }

    const committed: KnowledgeEvent = {
      ...cloneEvent(event),
      id: `evt_${randomUUID().replaceAll("-", "")}`,
      sequence: nextSequence
    };

    const result = validateKnowledgeEvent(committed);
    if (!result.success) {
      throw new Error(`Invalid knowledge event: ${result.error.message}`);
    }

    this.events.push(cloneEvent(committed));
    return cloneEvent(committed);
  }

  async readStream(streamId: string): Promise<KnowledgeEvent[]> {
    return this.events
      .filter((event) => event.streamId === streamId)
      .map((event) => cloneEvent(event));
  }

  async readAll(): Promise<KnowledgeEvent[]> {
    return this.events.map((event) => cloneEvent(event));
  }
}
```

Modify `packages/ontology/src/index.ts`:

```ts
export const ontologyPackageName = "@cestus/ontology";
export * from "./contracts.js";
export * from "./event-ledger.js";
```

- [ ] **Step 4: Run ledger tests**

Run:

```bash
npm test -- packages/ontology/test/event-ledger.test.ts
```

Expected:

```text
3 passed
```

- [ ] **Step 5: Run verification**

Run:

```bash
npm run verify
```

Expected:

```text
factory-readiness passed
```

- [ ] **Step 6: Commit**

```bash
git add packages/ontology/src/event-ledger.ts packages/ontology/src/index.ts packages/ontology/test/event-ledger.test.ts
git commit -m "feat: add append-only event ledger"
```

## Task 5: Add SQLite Event Store For Solo Mode

**Files:**
- Create: `packages/ontology/src/sqlite-event-ledger.ts`
- Create: `packages/ontology/test/sqlite-event-ledger.test.ts`
- Modify: `packages/ontology/src/index.ts`

- [ ] **Step 1: Write the failing SQLite tests**

Create `packages/ontology/test/sqlite-event-ledger.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SQLiteEventLedger } from "../src/sqlite-event-ledger.js";
import type { AppendableKnowledgeEvent } from "../src/event-ledger.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cestus-ledger-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const context = {
  actor: { id: "actor_system", kind: "system" as const, label: "test runner" },
  occurredAt: "2026-06-30T17:00:00.000Z",
  correlationId: "corr_sqlite",
  coreVersion: "0.1.0",
  packVersions: { core: "0.1.0" }
};

function evidenceEvent(evidenceId: string): AppendableKnowledgeEvent {
  return {
    type: "evidence.ingested",
    version: 1,
    streamId: `evidence_${evidenceId}`,
    context,
    payload: {
      evidenceId,
      source: { kind: "file", label: `${evidenceId}.pdf` },
      contentHash: "sha256:9f2c8b7a5f4e3d2c1b0a99887766554433221100ffeeddccbbaa998877665544",
      mediaType: "application/pdf",
      sizeBytes: 128
    }
  };
}

describe("SQLiteEventLedger", () => {
  it("persists and reopens committed events", async () => {
    const dbPath = join(dir, "ontology.db");
    const ledger = new SQLiteEventLedger(dbPath);
    const committed = await ledger.append(evidenceEvent("ev_sqlite_001"));
    ledger.close();

    const reopened = new SQLiteEventLedger(dbPath);
    const events = await reopened.readAll();
    reopened.close();

    expect(events).toHaveLength(1);
    expect(events[0]?.id).toBe(committed.id);
    expect(events[0]?.sequence).toBe(1);
  });

  it("enforces stream sequence uniqueness", async () => {
    const ledger = new SQLiteEventLedger(join(dir, "ontology.db"));
    await ledger.append(evidenceEvent("ev_sqlite_002"), { expectedNextSequence: 1 });

    await expect(
      ledger.append(evidenceEvent("ev_sqlite_002"), { expectedNextSequence: 1 })
    ).rejects.toThrow("Concurrency conflict");

    ledger.close();
  });
});
```

- [ ] **Step 2: Run SQLite tests to verify they fail**

Run:

```bash
npm test -- packages/ontology/test/sqlite-event-ledger.test.ts
```

Expected:

```text
Failed to resolve import "../src/sqlite-event-ledger.js"
```

- [ ] **Step 3: Create the SQLite ledger**

Create `packages/ontology/src/sqlite-event-ledger.ts`:

```ts
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { validateKnowledgeEvent, type KnowledgeEvent } from "./contracts.js";
import type { AppendableKnowledgeEvent, AppendOptions, EventLedger } from "./event-ledger.js";

export class SQLiteEventLedger implements EventLedger {
  private readonly db: DatabaseSync;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ontology_events (
        global_sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL,
        version INTEGER NOT NULL,
        stream_id TEXT NOT NULL,
        stream_sequence INTEGER NOT NULL,
        context_json TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        committed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(stream_id, stream_sequence)
      );
    `);
  }

  async append(event: AppendableKnowledgeEvent, options: AppendOptions = {}): Promise<KnowledgeEvent> {
    const current = this.db
      .prepare("SELECT COUNT(*) as count FROM ontology_events WHERE stream_id = ?")
      .get(event.streamId) as { count: number };
    const nextSequence = current.count + 1;

    if (options.expectedNextSequence !== undefined && options.expectedNextSequence !== nextSequence) {
      throw new Error(`Concurrency conflict for ${event.streamId}: expected sequence ${options.expectedNextSequence}, next sequence ${nextSequence}`);
    }

    const committed: KnowledgeEvent = {
      ...structuredClone(event),
      id: `evt_${randomUUID().replaceAll("-", "")}`,
      sequence: nextSequence
    };

    const result = validateKnowledgeEvent(committed);
    if (!result.success) {
      throw new Error(`Invalid knowledge event: ${result.error.message}`);
    }

    this.db
      .prepare(`
        INSERT INTO ontology_events (id, type, version, stream_id, stream_sequence, context_json, payload_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        committed.id,
        committed.type,
        committed.version,
        committed.streamId,
        committed.sequence,
        JSON.stringify(committed.context),
        JSON.stringify(committed.payload)
      );

    return structuredClone(committed);
  }

  async readStream(streamId: string): Promise<KnowledgeEvent[]> {
    return this.readRows("WHERE stream_id = ?", [streamId]);
  }

  async readAll(): Promise<KnowledgeEvent[]> {
    return this.readRows("", []);
  }

  close(): void {
    this.db.close();
  }

  private async readRows(whereClause: string, params: unknown[]): Promise<KnowledgeEvent[]> {
    const rows = this.db
      .prepare(`
        SELECT id, type, version, stream_id, stream_sequence, context_json, payload_json
        FROM ontology_events
        ${whereClause}
        ORDER BY global_sequence ASC
      `)
      .all(...params) as Array<{
        id: string;
        type: KnowledgeEvent["type"];
        version: 1;
        stream_id: string;
        stream_sequence: number;
        context_json: string;
        payload_json: string;
      }>;

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      version: row.version,
      streamId: row.stream_id,
      sequence: row.stream_sequence,
      context: JSON.parse(row.context_json) as KnowledgeEvent["context"],
      payload: JSON.parse(row.payload_json) as KnowledgeEvent["payload"]
    }));
  }
}
```

Modify `packages/ontology/src/index.ts`:

```ts
export const ontologyPackageName = "@cestus/ontology";
export * from "./contracts.js";
export * from "./event-ledger.js";
export * from "./sqlite-event-ledger.js";
```

- [ ] **Step 4: Run SQLite tests**

Run:

```bash
npm test -- packages/ontology/test/sqlite-event-ledger.test.ts
```

Expected:

```text
2 passed
```

- [ ] **Step 5: Run verification**

Run:

```bash
npm run verify
```

Expected:

```text
factory-readiness passed
```

- [ ] **Step 6: Commit**

```bash
git add packages/ontology/src/sqlite-event-ledger.ts packages/ontology/src/index.ts packages/ontology/test/sqlite-event-ledger.test.ts
git commit -m "feat: add sqlite event ledger"
```

## Task 6: Add Content-Addressed Evidence Blob Store

**Files:**
- Create: `packages/ontology/src/blob-store.ts`
- Create: `packages/ontology/test/blob-store.test.ts`
- Modify: `packages/ontology/src/index.ts`

- [ ] **Step 1: Write the failing blob-store tests**

Create `packages/ontology/test/blob-store.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileBlobStore } from "../src/blob-store.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cestus-blobs-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("FileBlobStore", () => {
  it("stores content by sha256 and reads it back", async () => {
    const store = new FileBlobStore(dir);
    const saved = await store.put(Buffer.from("public record"));
    const loaded = await store.get(saved.contentHash);

    expect(saved.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(saved.sizeBytes).toBe(13);
    expect(loaded.toString("utf8")).toBe("public record");
  });

  it("deduplicates identical content", async () => {
    const store = new FileBlobStore(dir);
    const first = await store.put(Buffer.from("same"));
    const second = await store.put(Buffer.from("same"));

    expect(second.contentHash).toBe(first.contentHash);
    expect(second.path).toBe(first.path);
  });
});
```

- [ ] **Step 2: Run blob-store tests to verify they fail**

Run:

```bash
npm test -- packages/ontology/test/blob-store.test.ts
```

Expected:

```text
Failed to resolve import "../src/blob-store.js"
```

- [ ] **Step 3: Create the blob store**

Create `packages/ontology/src/blob-store.ts`:

```ts
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface StoredBlob {
  contentHash: `sha256:${string}`;
  sizeBytes: number;
  path: string;
}

export class FileBlobStore {
  constructor(private readonly rootDir: string) {}

  async put(content: Buffer): Promise<StoredBlob> {
    const digest = createHash("sha256").update(content).digest("hex");
    const contentHash = `sha256:${digest}` as const;
    const bucket = digest.slice(0, 2);
    const dir = join(this.rootDir, "sha256", bucket);
    const path = join(dir, digest);
    mkdirSync(dir, { recursive: true });
    try {
      writeFileSync(path, content, { flag: "wx" });
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code !== "EEXIST") {
        throw error;
      }
    }
    return { contentHash, sizeBytes: content.byteLength, path };
  }

  async get(contentHash: `sha256:${string}`): Promise<Buffer> {
    const digest = contentHash.replace("sha256:", "");
    const path = join(this.rootDir, "sha256", digest.slice(0, 2), digest);
    const content = readFileSync(path);
    const actual = createHash("sha256").update(content).digest("hex");
    if (actual !== digest) {
      throw new Error(`Blob hash mismatch for ${contentHash}`);
    }
    return content;
  }
}
```

Modify `packages/ontology/src/index.ts`:

```ts
export const ontologyPackageName = "@cestus/ontology";
export * from "./contracts.js";
export * from "./event-ledger.js";
export * from "./sqlite-event-ledger.js";
export * from "./blob-store.js";
```

- [ ] **Step 4: Run blob-store tests**

Run:

```bash
npm test -- packages/ontology/test/blob-store.test.ts
```

Expected:

```text
2 passed
```

- [ ] **Step 5: Run verification**

Run:

```bash
npm run verify
```

Expected:

```text
factory-readiness passed
```

- [ ] **Step 6: Commit**

```bash
git add packages/ontology/src/blob-store.ts packages/ontology/src/index.ts packages/ontology/test/blob-store.test.ts
git commit -m "feat: add content-addressed blob store"
```

## Task 7: Add Domain Pack Contracts And Core Pack

**Files:**
- Create: `packages/ontology/src/domain-packs.ts`
- Create: `packages/ontology/test/domain-packs.test.ts`
- Modify: `packages/ontology/src/index.ts`

- [ ] **Step 1: Write the failing pack tests**

Create `packages/ontology/test/domain-packs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { corePack, DomainPackRegistry } from "../src/domain-packs.js";

describe("DomainPackRegistry", () => {
  it("accepts the AI-legible core pack", () => {
    const registry = new DomainPackRegistry();
    registry.install(corePack);
    expect(registry.get("core")?.version).toBe("0.1.0");
  });

  it("rejects packs without agent guidance", () => {
    const registry = new DomainPackRegistry();
    expect(() =>
      registry.install({
        name: "bad-pack",
        version: "0.1.0",
        scope: "org",
        description: "Missing guidance",
        agentGuide: "",
        entityTypes: [],
        relationshipTypes: []
      })
    ).toThrow("agentGuide");
  });

  it("keeps investigation packs scoped locally", () => {
    const registry = new DomainPackRegistry();
    registry.install({
      name: "investigation-local-test",
      version: "0.1.0",
      scope: "investigation",
      description: "Local investigation extension for a test inquiry.",
      agentGuide: "Use only inside the owning investigation until promoted by a reviewed ontology event.",
      entityTypes: [{ name: "TemporaryLead", description: "A lead that has not been promoted." }],
      relationshipTypes: []
    });

    expect(registry.sharedPacks().map((pack) => pack.name)).not.toContain("investigation-local-test");
  });
});
```

- [ ] **Step 2: Run pack tests to verify they fail**

Run:

```bash
npm test -- packages/ontology/test/domain-packs.test.ts
```

Expected:

```text
Failed to resolve import "../src/domain-packs.js"
```

- [ ] **Step 3: Create domain pack registry**

Create `packages/ontology/src/domain-packs.ts`:

```ts
import { z } from "zod";

export const domainPackSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  scope: z.enum(["core", "org", "investigation"]),
  description: z.string().min(20),
  agentGuide: z.string().min(20),
  entityTypes: z.array(z.object({
    name: z.string().min(1),
    description: z.string().min(10)
  })),
  relationshipTypes: z.array(z.object({
    name: z.string().min(1),
    from: z.string().min(1),
    to: z.string().min(1),
    description: z.string().min(10)
  }))
});

export type DomainPack = z.infer<typeof domainPackSchema>;

export const corePack: DomainPack = {
  name: "core",
  version: "0.1.0",
  scope: "core",
  description: "Core Cestus ontology primitives required for evidence, assertions, entities, relationships, claims, investigations, packs, projections, and diagnostics.",
  agentGuide: "Use core primitives for provenance-first knowledge. Do not create domain-specific government concepts here; put those in org or investigation packs.",
  entityTypes: [
    { name: "Evidence", description: "A raw source artifact or extracted record with provenance." },
    { name: "Assertion", description: "A provenance-backed candidate fact or reviewed fact." },
    { name: "Entity", description: "A resolved real-world object built from assertions." },
    { name: "Claim", description: "An investigation-specific hypothesis or statement." },
    { name: "Investigation", description: "A scoped body of accountability work." }
  ],
  relationshipTypes: [
    { name: "supports", from: "Assertion", to: "Claim", description: "Links evidence-backed assertions that support a claim." },
    { name: "contradicts", from: "Assertion", to: "Claim", description: "Links evidence-backed assertions that contradict a claim." },
    { name: "derivedFrom", from: "Assertion", to: "Evidence", description: "Links assertions to source evidence." }
  ]
};

export class DomainPackRegistry {
  private readonly packs = new Map<string, DomainPack>();

  install(pack: DomainPack): void {
    const result = domainPackSchema.safeParse(pack);
    if (!result.success) {
      throw new Error(result.error.message);
    }
    this.packs.set(pack.name, result.data);
  }

  get(name: string): DomainPack | undefined {
    const pack = this.packs.get(name);
    return pack ? structuredClone(pack) : undefined;
  }

  sharedPacks(): DomainPack[] {
    return [...this.packs.values()]
      .filter((pack) => pack.scope !== "investigation")
      .map((pack) => structuredClone(pack));
  }
}
```

Modify `packages/ontology/src/index.ts`:

```ts
export const ontologyPackageName = "@cestus/ontology";
export * from "./contracts.js";
export * from "./event-ledger.js";
export * from "./sqlite-event-ledger.js";
export * from "./blob-store.js";
export * from "./domain-packs.js";
```

- [ ] **Step 4: Run pack tests**

Run:

```bash
npm test -- packages/ontology/test/domain-packs.test.ts
```

Expected:

```text
3 passed
```

- [ ] **Step 5: Run verification**

Run:

```bash
npm run verify
```

Expected:

```text
factory-readiness passed
```

- [ ] **Step 6: Commit**

```bash
git add packages/ontology/src/domain-packs.ts packages/ontology/src/index.ts packages/ontology/test/domain-packs.test.ts
git commit -m "feat: add ontology domain packs"
```

## Task 8: Add Evidence Ingestion Service

**Files:**
- Create: `packages/ontology/src/evidence-service.ts`
- Create: `packages/ontology/test/evidence-service.test.ts`
- Modify: `packages/ontology/src/index.ts`

- [ ] **Step 1: Write the failing evidence service test**

Create `packages/ontology/test/evidence-service.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileBlobStore } from "../src/blob-store.js";
import { InMemoryEventLedger } from "../src/event-ledger.js";
import { EvidenceService } from "../src/evidence-service.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cestus-evidence-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("EvidenceService", () => {
  it("stores raw content and appends an evidence.ingested event", async () => {
    const ledger = new InMemoryEventLedger();
    const service = new EvidenceService(ledger, new FileBlobStore(dir));

    const event = await service.ingest({
      evidenceId: "ev_invoice_001",
      content: Buffer.from("invoice body"),
      mediaType: "text/plain",
      source: { kind: "file", label: "invoice.txt" },
      actor: { id: "actor_reporter", kind: "human", label: "Reporter" }
    });

    expect(event.type).toBe("evidence.ingested");
    expect(event.payload.evidenceId).toBe("ev_invoice_001");
    expect(event.payload.contentHash).toMatch(/^sha256:/);
    expect(await ledger.readAll()).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run evidence service test to verify it fails**

Run:

```bash
npm test -- packages/ontology/test/evidence-service.test.ts
```

Expected:

```text
Failed to resolve import "../src/evidence-service.js"
```

- [ ] **Step 3: Create evidence service**

Create `packages/ontology/src/evidence-service.ts`:

```ts
import type { FileBlobStore } from "./blob-store.js";
import type { KnowledgeEvent } from "./contracts.js";
import type { EventLedger } from "./event-ledger.js";

export interface IngestEvidenceInput {
  evidenceId: string;
  content: Buffer;
  mediaType: string;
  source: { kind: "file" | "url" | "dataset" | "message" | "annotation" | "manual"; label: string; uri?: string };
  actor: { id: string; kind: "human" | "extractor" | "system"; label: string };
}

export class EvidenceService {
  constructor(
    private readonly ledger: EventLedger,
    private readonly blobStore: FileBlobStore
  ) {}

  async ingest(input: IngestEvidenceInput): Promise<KnowledgeEvent> {
    const stored = await this.blobStore.put(input.content);
    const event = await this.ledger.append({
      type: "evidence.ingested",
      version: 1,
      streamId: `evidence_${input.evidenceId}`,
      context: {
        actor: input.actor,
        occurredAt: new Date().toISOString(),
        correlationId: `corr_${input.evidenceId}`,
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0" }
      },
      payload: {
        evidenceId: input.evidenceId,
        source: input.source,
        contentHash: stored.contentHash,
        mediaType: input.mediaType,
        sizeBytes: stored.sizeBytes
      }
    });

    return event;
  }
}
```

Modify `packages/ontology/src/index.ts`:

```ts
export const ontologyPackageName = "@cestus/ontology";
export * from "./contracts.js";
export * from "./event-ledger.js";
export * from "./sqlite-event-ledger.js";
export * from "./blob-store.js";
export * from "./domain-packs.js";
export * from "./evidence-service.js";
```

- [ ] **Step 4: Run evidence service test**

Run:

```bash
npm test -- packages/ontology/test/evidence-service.test.ts
```

Expected:

```text
1 passed
```

- [ ] **Step 5: Run verification**

Run:

```bash
npm run verify
```

Expected:

```text
factory-readiness passed
```

- [ ] **Step 6: Commit**

```bash
git add packages/ontology/src/evidence-service.ts packages/ontology/src/index.ts packages/ontology/test/evidence-service.test.ts
git commit -m "feat: add evidence ingestion service"
```

## Task 9: Add Assertion Proposal And Review Service

**Files:**
- Create: `packages/ontology/src/assertion-service.ts`
- Create: `packages/ontology/test/assertion-service.test.ts`
- Modify: `packages/ontology/src/index.ts`

- [ ] **Step 1: Write the failing assertion service tests**

Create `packages/ontology/test/assertion-service.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { AssertionService } from "../src/assertion-service.js";
import { InMemoryEventLedger } from "../src/event-ledger.js";

describe("AssertionService", () => {
  it("proposes assertions with required evidence provenance", async () => {
    const ledger = new InMemoryEventLedger();
    const service = new AssertionService(ledger);

    const event = await service.propose({
      assertionId: "as_001",
      evidenceId: "ev_001",
      predicate: "agency.name",
      object: "Example Agency",
      confidence: 0.92,
      actor: { id: "actor_extractor", kind: "extractor", label: "fixture extractor" }
    });

    expect(event.type).toBe("assertion.proposed");
    expect(event.payload.reviewState).toBe("proposed");
  });

  it("accepts a proposed assertion with review rationale", async () => {
    const ledger = new InMemoryEventLedger();
    const service = new AssertionService(ledger);
    await service.propose({
      assertionId: "as_002",
      evidenceId: "ev_002",
      predicate: "vendor.name",
      object: "Example Vendor",
      confidence: 0.88,
      actor: { id: "actor_extractor", kind: "extractor", label: "fixture extractor" }
    });

    const accepted = await service.accept({
      assertionId: "as_002",
      acceptedBy: "actor_editor",
      rationale: "Evidence text directly names the vendor.",
      actor: { id: "actor_editor", kind: "human", label: "Editor" }
    });

    expect(accepted.type).toBe("assertion.accepted");
    expect(accepted.context.causationId).toMatch(/^evt_/);
  });
});
```

- [ ] **Step 2: Run assertion service tests to verify they fail**

Run:

```bash
npm test -- packages/ontology/test/assertion-service.test.ts
```

Expected:

```text
Failed to resolve import "../src/assertion-service.js"
```

- [ ] **Step 3: Create assertion service**

Create `packages/ontology/src/assertion-service.ts`:

```ts
import type { KnowledgeEvent } from "./contracts.js";
import type { EventLedger } from "./event-ledger.js";

type ActorInput = { id: string; kind: "human" | "extractor" | "system"; label: string };

export interface ProposeAssertionInput {
  assertionId: string;
  evidenceId: string;
  subjectRef?: string;
  predicate: string;
  object: string | number | boolean | null;
  confidence: number;
  actor: ActorInput;
}

export interface AcceptAssertionInput {
  assertionId: string;
  acceptedBy: string;
  rationale: string;
  actor: ActorInput;
}

export class AssertionService {
  constructor(private readonly ledger: EventLedger) {}

  async propose(input: ProposeAssertionInput): Promise<KnowledgeEvent> {
    return this.ledger.append({
      type: "assertion.proposed",
      version: 1,
      streamId: `assertion_${input.assertionId}`,
      context: {
        actor: input.actor,
        occurredAt: new Date().toISOString(),
        correlationId: `corr_${input.assertionId}`,
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0" }
      },
      payload: {
        assertionId: input.assertionId,
        evidenceId: input.evidenceId,
        subjectRef: input.subjectRef,
        predicate: input.predicate,
        object: input.object,
        confidence: input.confidence,
        reviewState: "proposed"
      }
    });
  }

  async accept(input: AcceptAssertionInput): Promise<KnowledgeEvent> {
    const streamId = `assertion_${input.assertionId}`;
    const proposed = (await this.ledger.readStream(streamId)).find((event) => event.type === "assertion.proposed");
    if (!proposed) {
      throw new Error(`Cannot accept missing assertion ${input.assertionId}`);
    }

    return this.ledger.append({
      type: "assertion.accepted",
      version: 1,
      streamId,
      context: {
        actor: input.actor,
        occurredAt: new Date().toISOString(),
        causationId: proposed.id,
        correlationId: proposed.context.correlationId,
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0" }
      },
      payload: {
        assertionId: input.assertionId,
        acceptedBy: input.acceptedBy,
        rationale: input.rationale
      }
    });
  }
}
```

Modify `packages/ontology/src/index.ts`:

```ts
export const ontologyPackageName = "@cestus/ontology";
export * from "./contracts.js";
export * from "./event-ledger.js";
export * from "./sqlite-event-ledger.js";
export * from "./blob-store.js";
export * from "./domain-packs.js";
export * from "./evidence-service.js";
export * from "./assertion-service.js";
```

- [ ] **Step 4: Run assertion service tests**

Run:

```bash
npm test -- packages/ontology/test/assertion-service.test.ts
```

Expected:

```text
2 passed
```

- [ ] **Step 5: Run verification**

Run:

```bash
npm run verify
```

Expected:

```text
factory-readiness passed
```

- [ ] **Step 6: Commit**

```bash
git add packages/ontology/src/assertion-service.ts packages/ontology/src/index.ts packages/ontology/test/assertion-service.test.ts
git commit -m "feat: add assertion review service"
```

## Task 10: Add Rebuildable Graph Projection

**Files:**
- Create: `packages/ontology/src/graph-projection.ts`
- Create: `packages/ontology/test/graph-projection.test.ts`
- Create: `packages/ontology/test/fixtures/golden-ledger.ts`
- Modify: `packages/ontology/src/index.ts`

- [ ] **Step 1: Write the failing graph projection test**

Create `packages/ontology/test/graph-projection.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildGraphProjection } from "../src/graph-projection.js";
import { goldenLedgerEvents } from "./fixtures/golden-ledger.js";

describe("buildGraphProjection", () => {
  it("rebuilds accepted assertions and their evidence trace", () => {
    const graph = buildGraphProjection(goldenLedgerEvents);

    expect(graph.assertions.get("as_agency_name")?.reviewState).toBe("accepted");
    expect(graph.assertions.get("as_agency_name")?.evidenceId).toBe("ev_agency_pdf");
    expect(graph.entities.get("ent_example_agency")?.canonicalLabel).toBe("Example Agency");
    expect(graph.provenanceForAssertion("as_agency_name")).toEqual({
      assertionId: "as_agency_name",
      evidenceId: "ev_agency_pdf",
      acceptedByEventId: "evt_accept_agency_name",
      proposedByEventId: "evt_propose_agency_name"
    });
  });
});
```

Create `packages/ontology/test/fixtures/golden-ledger.ts`:

```ts
import type { KnowledgeEvent } from "../../src/contracts.js";

const context = {
  actor: { id: "actor_system", kind: "system" as const, label: "fixture" },
  occurredAt: "2026-06-30T17:00:00.000Z",
  correlationId: "corr_golden",
  coreVersion: "0.1.0",
  packVersions: { core: "0.1.0" }
};

export const goldenLedgerEvents: KnowledgeEvent[] = [
  {
    id: "evt_evidence_agency_pdf",
    type: "evidence.ingested",
    version: 1,
    streamId: "evidence_ev_agency_pdf",
    sequence: 1,
    context,
    payload: {
      evidenceId: "ev_agency_pdf",
      source: { kind: "file", label: "agency.pdf" },
      contentHash: "sha256:9f2c8b7a5f4e3d2c1b0a99887766554433221100ffeeddccbbaa998877665544",
      mediaType: "application/pdf",
      sizeBytes: 128
    }
  },
  {
    id: "evt_propose_agency_name",
    type: "assertion.proposed",
    version: 1,
    streamId: "assertion_as_agency_name",
    sequence: 1,
    context,
    payload: {
      assertionId: "as_agency_name",
      evidenceId: "ev_agency_pdf",
      predicate: "agency.name",
      object: "Example Agency",
      confidence: 0.95,
      reviewState: "proposed"
    }
  },
  {
    id: "evt_accept_agency_name",
    type: "assertion.accepted",
    version: 1,
    streamId: "assertion_as_agency_name",
    sequence: 2,
    context: { ...context, causationId: "evt_propose_agency_name" },
    payload: {
      assertionId: "as_agency_name",
      acceptedBy: "actor_editor",
      rationale: "The agency name is explicit in the source document."
    }
  },
  {
    id: "evt_resolve_agency",
    type: "entity.resolved",
    version: 1,
    streamId: "entity_ent_example_agency",
    sequence: 1,
    context: { ...context, causationId: "evt_accept_agency_name" },
    payload: {
      entityId: "ent_example_agency",
      assertionIds: ["as_agency_name"],
      canonicalLabel: "Example Agency",
      entityType: "GovernmentAgency"
    }
  }
];
```

- [ ] **Step 2: Run graph projection test to verify it fails**

Run:

```bash
npm test -- packages/ontology/test/graph-projection.test.ts
```

Expected:

```text
Failed to resolve import "../src/graph-projection.js"
```

- [ ] **Step 3: Create graph projection**

Create `packages/ontology/src/graph-projection.ts`:

```ts
import type { KnowledgeEvent } from "./contracts.js";

export interface ProjectedAssertion {
  assertionId: string;
  evidenceId: string;
  predicate: string;
  object: string | number | boolean | null;
  confidence: number;
  reviewState: "proposed" | "accepted";
  proposedByEventId: string;
  acceptedByEventId?: string;
}

export interface ProjectedEntity {
  entityId: string;
  canonicalLabel: string;
  entityType: string;
  assertionIds: string[];
}

export interface AssertionProvenance {
  assertionId: string;
  evidenceId: string;
  proposedByEventId: string;
  acceptedByEventId?: string;
}

export interface GraphProjection {
  assertions: Map<string, ProjectedAssertion>;
  entities: Map<string, ProjectedEntity>;
  provenanceForAssertion(assertionId: string): AssertionProvenance | undefined;
}

export function buildGraphProjection(events: KnowledgeEvent[]): GraphProjection {
  const assertions = new Map<string, ProjectedAssertion>();
  const entities = new Map<string, ProjectedEntity>();

  for (const event of events) {
    if (event.type === "assertion.proposed") {
      const payload = event.payload as {
        assertionId: string;
        evidenceId: string;
        predicate: string;
        object: string | number | boolean | null;
        confidence: number;
      };
      assertions.set(payload.assertionId, {
        assertionId: payload.assertionId,
        evidenceId: payload.evidenceId,
        predicate: payload.predicate,
        object: payload.object,
        confidence: payload.confidence,
        reviewState: "proposed",
        proposedByEventId: event.id
      });
    }

    if (event.type === "assertion.accepted") {
      const payload = event.payload as { assertionId: string };
      const existing = assertions.get(payload.assertionId);
      if (existing) {
        assertions.set(payload.assertionId, {
          ...existing,
          reviewState: "accepted",
          acceptedByEventId: event.id
        });
      }
    }

    if (event.type === "entity.resolved") {
      const payload = event.payload as {
        entityId: string;
        assertionIds: string[];
        canonicalLabel: string;
        entityType: string;
      };
      entities.set(payload.entityId, payload);
    }
  }

  return {
    assertions,
    entities,
    provenanceForAssertion(assertionId: string) {
      const assertion = assertions.get(assertionId);
      if (!assertion) {
        return undefined;
      }
      const provenance: AssertionProvenance = {
        assertionId,
        evidenceId: assertion.evidenceId,
        proposedByEventId: assertion.proposedByEventId
      };
      if (assertion.acceptedByEventId) {
        provenance.acceptedByEventId = assertion.acceptedByEventId;
      }
      return provenance;
    }
  };
}
```

Modify `packages/ontology/src/index.ts`:

```ts
export const ontologyPackageName = "@cestus/ontology";
export * from "./contracts.js";
export * from "./event-ledger.js";
export * from "./sqlite-event-ledger.js";
export * from "./blob-store.js";
export * from "./domain-packs.js";
export * from "./evidence-service.js";
export * from "./assertion-service.js";
export * from "./graph-projection.js";
```

- [ ] **Step 4: Run graph projection test**

Run:

```bash
npm test -- packages/ontology/test/graph-projection.test.ts
```

Expected:

```text
1 passed
```

- [ ] **Step 5: Run verification**

Run:

```bash
npm run verify
```

Expected:

```text
factory-readiness passed
```

- [ ] **Step 6: Commit**

```bash
git add packages/ontology/src/graph-projection.ts packages/ontology/src/index.ts packages/ontology/test/graph-projection.test.ts packages/ontology/test/fixtures/golden-ledger.ts
git commit -m "feat: add rebuildable graph projection"
```

## Task 11: Add Structured Diagnostics

**Files:**
- Create: `packages/ontology/src/diagnostics.ts`
- Create: `packages/ontology/test/diagnostics.test.ts`
- Modify: `packages/ontology/src/index.ts`

- [ ] **Step 1: Write the failing diagnostics test**

Create `packages/ontology/test/diagnostics.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { recordValidationDiagnostic } from "../src/diagnostics.js";
import { InMemoryEventLedger } from "../src/event-ledger.js";

describe("recordValidationDiagnostic", () => {
  it("records repair hints as diagnostic events", async () => {
    const ledger = new InMemoryEventLedger();
    const event = await recordValidationDiagnostic(ledger, {
      diagnosticId: "diag_missing_evidence",
      message: "Assertion proposal did not include evidenceId.",
      contract: "assertion.proposed",
      violatedPath: "payload.evidenceId",
      actor: { id: "actor_system", kind: "system", label: "validator" }
    });

    expect(event.type).toBe("diagnostic.recorded");
    expect(event.payload.repairHint.allowedActions).toContain("add evidenceId");
  });
});
```

- [ ] **Step 2: Run diagnostics test to verify it fails**

Run:

```bash
npm test -- packages/ontology/test/diagnostics.test.ts
```

Expected:

```text
Failed to resolve import "../src/diagnostics.js"
```

- [ ] **Step 3: Create diagnostics helper**

Create `packages/ontology/src/diagnostics.ts`:

```ts
import type { KnowledgeEvent } from "./contracts.js";
import type { EventLedger } from "./event-ledger.js";

export interface ValidationDiagnosticInput {
  diagnosticId: string;
  message: string;
  contract: string;
  violatedPath: string;
  actor: { id: string; kind: "human" | "extractor" | "system"; label: string };
}

export async function recordValidationDiagnostic(
  ledger: EventLedger,
  input: ValidationDiagnosticInput
): Promise<KnowledgeEvent> {
  return ledger.append({
    type: "diagnostic.recorded",
    version: 1,
    streamId: `diagnostic_${input.diagnosticId}`,
    context: {
      actor: input.actor,
      occurredAt: new Date().toISOString(),
      correlationId: `corr_${input.diagnosticId}`,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0" }
    },
    payload: {
      diagnosticId: input.diagnosticId,
      severity: "error",
      category: "validation",
      message: input.message,
      repairHint: {
        contract: input.contract,
        violatedPath: input.violatedPath,
        allowedActions: ["add evidenceId", "reject assertion proposal", "request human review"]
      }
    }
  });
}
```

Modify `packages/ontology/src/index.ts`:

```ts
export const ontologyPackageName = "@cestus/ontology";
export * from "./contracts.js";
export * from "./event-ledger.js";
export * from "./sqlite-event-ledger.js";
export * from "./blob-store.js";
export * from "./domain-packs.js";
export * from "./evidence-service.js";
export * from "./assertion-service.js";
export * from "./graph-projection.js";
export * from "./diagnostics.js";
```

- [ ] **Step 4: Run diagnostics test**

Run:

```bash
npm test -- packages/ontology/test/diagnostics.test.ts
```

Expected:

```text
1 passed
```

- [ ] **Step 5: Run verification**

Run:

```bash
npm run verify
```

Expected:

```text
factory-readiness passed
```

- [ ] **Step 6: Commit**

```bash
git add packages/ontology/src/diagnostics.ts packages/ontology/src/index.ts packages/ontology/test/diagnostics.test.ts
git commit -m "feat: add structured ontology diagnostics"
```

## Task 12: Add JSON-LD Export Boundary

**Files:**
- Create: `packages/ontology/src/jsonld-export.ts`
- Create: `packages/ontology/test/jsonld-export.test.ts`
- Modify: `packages/ontology/src/index.ts`

- [ ] **Step 1: Write the failing JSON-LD export test**

Create `packages/ontology/test/jsonld-export.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildGraphProjection } from "../src/graph-projection.js";
import { exportGraphToJsonLd } from "../src/jsonld-export.js";
import { goldenLedgerEvents } from "./fixtures/golden-ledger.js";

describe("exportGraphToJsonLd", () => {
  it("exports accepted graph state with provenance references", () => {
    const graph = buildGraphProjection(goldenLedgerEvents);
    const jsonld = exportGraphToJsonLd(graph);

    expect(jsonld["@context"]).toEqual({
      cestus: "https://cestus.local/ontology#",
      evidence: "cestus:evidence",
      assertion: "cestus:assertion"
    });
    expect(jsonld["@graph"]).toContainEqual({
      "@id": "ent_example_agency",
      "@type": "GovernmentAgency",
      "cestus:label": "Example Agency",
      "cestus:supportedBy": ["as_agency_name"]
    });
  });
});
```

- [ ] **Step 2: Run JSON-LD export test to verify it fails**

Run:

```bash
npm test -- packages/ontology/test/jsonld-export.test.ts
```

Expected:

```text
Failed to resolve import "../src/jsonld-export.js"
```

- [ ] **Step 3: Create JSON-LD exporter**

Create `packages/ontology/src/jsonld-export.ts`:

```ts
import type { GraphProjection } from "./graph-projection.js";

export interface JsonLdDocument {
  "@context": Record<string, string>;
  "@graph": Array<Record<string, unknown>>;
}

export function exportGraphToJsonLd(graph: GraphProjection): JsonLdDocument {
  return {
    "@context": {
      cestus: "https://cestus.local/ontology#",
      evidence: "cestus:evidence",
      assertion: "cestus:assertion"
    },
    "@graph": [
      ...[...graph.entities.values()].map((entity) => ({
        "@id": entity.entityId,
        "@type": entity.entityType,
        "cestus:label": entity.canonicalLabel,
        "cestus:supportedBy": entity.assertionIds
      })),
      ...[...graph.assertions.values()].map((assertion) => ({
        "@id": assertion.assertionId,
        "@type": "cestus:Assertion",
        "cestus:predicate": assertion.predicate,
        "cestus:object": assertion.object,
        "cestus:evidence": assertion.evidenceId,
        "cestus:reviewState": assertion.reviewState
      }))
    ]
  };
}
```

Modify `packages/ontology/src/index.ts`:

```ts
export const ontologyPackageName = "@cestus/ontology";
export * from "./contracts.js";
export * from "./event-ledger.js";
export * from "./sqlite-event-ledger.js";
export * from "./blob-store.js";
export * from "./domain-packs.js";
export * from "./evidence-service.js";
export * from "./assertion-service.js";
export * from "./graph-projection.js";
export * from "./diagnostics.js";
export * from "./jsonld-export.js";
```

- [ ] **Step 4: Run JSON-LD export test**

Run:

```bash
npm test -- packages/ontology/test/jsonld-export.test.ts
```

Expected:

```text
1 passed
```

- [ ] **Step 5: Run verification**

Run:

```bash
npm run verify
```

Expected:

```text
factory-readiness passed
```

- [ ] **Step 6: Commit**

```bash
git add packages/ontology/src/jsonld-export.ts packages/ontology/src/index.ts packages/ontology/test/jsonld-export.test.ts
git commit -m "feat: add json-ld export boundary"
```

## Task 13: Add CI Verification Gate

**Files:**
- Create: `.github/workflows/verify.yml`

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/verify.yml`:

```yaml
name: verify

on:
  pull_request:
  push:
    branches:
      - master
      - main

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "26"
          cache: "npm"
      - run: npm ci
      - run: npm run verify
```

- [ ] **Step 2: Run local verification**

Run:

```bash
npm run verify
```

Expected:

```text
factory-readiness passed
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/verify.yml
git commit -m "ci: add ontology verification gate"
```

## Task 14: Factory Readiness Review

**Files:**
- Modify: `docs/agentic/software-factory.md`
- Modify: `docs/superpowers/plans/2026-06-30-ontology-layer-implementation.md`

- [ ] **Step 1: Run the final verification command**

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

- [ ] **Step 2: Perform reviewer pass**

Use `docs/agentic/review-template.md` and verify:

```text
All ontology event types validate through Zod contracts.
Every accepted assertion traces to evidence.
The SQLite ledger persists events and enforces stream sequence uniqueness.
The graph projection rebuilds from golden ledger events.
The JSON-LD export is derived from the projection, not used as source of truth.
Factory readiness passes without forbidden unfinished markers.
```

- [ ] **Step 3: Commit final review adjustments**

```bash
git add package.json docs/agentic/software-factory.md docs/superpowers/plans/2026-06-30-ontology-layer-implementation.md
git commit -m "docs: record ontology factory readiness"
```

## Completion Criteria

The ontology foundation is complete when:

- `npm run verify` passes locally.
- Every task has a commit.
- The event ledger is append-only and replayable.
- SQLite persists and reopens events.
- Evidence content is stored outside the ledger by content hash.
- Assertion proposal and acceptance events preserve provenance.
- The graph projection rebuilds from golden ledger events.
- Domain packs include agent-facing guidance and scoped governance.
- Diagnostics include structured repair hints.
- JSON-LD export is a boundary projection.
- Agent factory docs and readiness checks exist in the repo.
