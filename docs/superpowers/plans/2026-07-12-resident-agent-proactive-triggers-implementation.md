# Resident Agent Proactive Triggers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use
> `superpowers:subagent-driven-development` only after the coordinator sends
> an exact scoped authorization naming the approved Lane T design, this
> approved plan, the allowed task range, and the wave stop. Steps use checkbox
> (`- [ ]`) syntax for tracking.

**Goal:** Persist one deduplicated, provenance-bound advisory request for the
single resident when a verified mounted-workspace fact is eligible, without
constructing a prompt, invoking a provider, creating a task claim, or causing
a domain effect.

**Architecture:** CF-1 freezes the proposed Lane T request event, capability,
and writer order. Task 118 then implements a pure evaluator, one mounted
conditional append boundary, and a replayable projection. Tasks 149--151 are
metadata-only adapters for PRR, ingestion, and investigation-cadence facts.
Every decision is rebuilt from mounted authority: fingerprints, request IDs,
dedupe keys, admission scopes, cooldowns, budgets, high-water marks, and
readback are never process-memory truth.

**Tech Stack:** TypeScript (strict), Zod, Vitest, Node SHA-256, the existing
append-only `EventLedger`, mounted-workspace authority capabilities, and
credential-free deterministic fakes.

## Global Constraints

- Approved Lane T design:
  `docs/superpowers/specs/2026-07-12-resident-agent-proactive-triggers-design.md@9a571f628bef9c53725e20263cb687ec44dd9cd8`.
- Governing program plan:
  `docs/superpowers/plans/2026-07-12-resident-agent-full-vision-program-implementation.md@0b5726ec975bdc0aae97e540472ef3be4379b358`.
- Plan approval is not implementation authority. CF-1 must merge first, each
  implementer must rebase to its recorded SHA, and the coordinator must issue
  a new exact authorization before every executable task or repair.
- The only resident identity is `agent_default`. A trigger cannot create an
  identity, task claim, lease, run, approval, handoff, or completion.
- The mounted workspace identity, ledger, immutable policy artifact, active
  locks, source records, and projection readback are authoritative. A missing,
  swapped, stale, malformed, or unreadable authority returns a safe no-append
  result and writes no fallback ledger, projection, artifact, derivative,
  cache, queue, or high-water record.
- The ledger is append-only. The request event is Lane T's only durable
  mutation. A correction, disablement, or supersession is later evidence;
  high-water state is rebuilt only from verified request events.
- Normalize boundary values to plain own-data snapshots before an `await` or
  append. Reject inherited values, accessors, symbols, sparse/custom arrays,
  unknown keys, raw source bytes, unsafe paths, prompt values, credentials,
  provider data, and hostile errors.
- Evaluation has no provider, model, prompt, parser, tool, artifact,
  domain-service, approval, scheduler, or fallback-store capability. It is a
  policy-and-provenance reducer over verified metadata.
- Cooldown and request budgets are policy admission controls, not model, tool,
  approval, or external-effect budgets. A denial does not advance high-water.
- Deterministic suites use no credentials. No provider or Nous call is
  applicable to Lane T; a later PRR path is a deterministic no-send proof,
  not a skipped provider pass.
- Every implementation, repair, and reviewer uses the user-confirmed GPT-5.6
  Terra / Extra High configuration, TDD, fresh review,
  verification-before-completion, and no self-merge into `neo`.

## Task 113 Documentation Audit

Run this delimiter-safe, section-local command from the repository root for
RED and GREEN. Its outer single quotes contain no single quote; all audit
tokens are single-line literals. The audit extracts each `##` section before
checking it, so a duplicate word elsewhere in the plan cannot satisfy a
missing local requirement. It then removes every occurrence of one required
token at a time within that extracted section and
requires each counterfactual to fail validation; an accepted counterfactual is
a failing audit, not a GREEN result.

```bash
node --input-type=module --eval 'import { readFileSync } from "node:fs"; const file="docs/superpowers/plans/2026-07-12-resident-agent-proactive-triggers-implementation.md"; const plan=readFileSync(file,"utf8"); const section=(doc,heading)=>{const start=doc.indexOf(`## ${heading}`);if(start<0)throw new Error(`missing section: ${heading}`);const end=doc.indexOf("\n## ",start+4);return doc.slice(start,end<0?doc.length:end)}; const need=(doc,heading,tokens)=>{const block=section(doc,heading);for(const token of tokens)if(!block.includes(token))throw new Error(`${heading}: missing ${token}`)}; const mutate=(doc,heading,token)=>{const block=section(doc,heading);const changed=block.split(token).join("removed");if(changed===block)throw new Error(`counterfactual setup failed: ${token}`);return doc.replace(block,changed)}; const validate=(doc)=>{need(doc,"CF-1 Contract Gate And Conflict Resolution",["CF-1","Task 118","invalid-scope","contracts.ts","rebase"]);need(doc,"File Ownership And Dependency Order",["Task 118","Task 149","Task 150","Task 151","packages/agent/src/proactive-triggers.ts","packages/agent/src/trigger-projection.ts","packages/agent/src/prr-proactive-trigger.ts","packages/agent/src/ingestion-proactive-trigger.ts","packages/agent/src/investigation-proactive-trigger.ts"]);need(doc,"Task 118: Trigger Core, Request Event, And Rebuildable Projection",["appendRequestedIfCurrent","deriveAdmissionScope","buildTriggerRequestFingerprint","buildTriggerGateKey","readbackTriggerDecision","cooldown-active","high-water","inputText","no provider","no append"]);need(doc,"Task 149: PRR Deadline, Fee, Correspondence, And Stalling Trigger",["prr-proactive-trigger.ts","no send","dedupe","cooldown"]);need(doc,"Task 150: Ingestion New-Production And Evidence-Readiness Trigger",["ingestion-proactive-trigger.ts","no parse/provider/graph","no provider"]);need(doc,"Task 151: Investigation-Cadence Trigger",["investigation-proactive-trigger.ts","high-water","cooldown","budget"]);need(doc,"Failure Injection, Acceptance, And Live-Gate Matrix",["same semantics at different append times","same dedupe key, different fingerprint","Equal scope, different source high-water","not-applicable","no provider or Nous call"]);need(doc,"Merge, Rebase, Rollback, And Stop Conditions",["CF-1","Task 118","append-only","forward source commit","provider"])}; validate(plan); for(const [heading,token] of [["CF-1 Contract Gate And Conflict Resolution","invalid-scope"],["File Ownership And Dependency Order","packages/agent/src/trigger-projection.ts"],["Task 118: Trigger Core, Request Event, And Rebuildable Projection","appendRequestedIfCurrent"],["Task 118: Trigger Core, Request Event, And Rebuildable Projection","readbackTriggerDecision"],["Task 118: Trigger Core, Request Event, And Rebuildable Projection","inputText"],["Task 149: PRR Deadline, Fee, Correspondence, And Stalling Trigger","no send"],["Task 150: Ingestion New-Production And Evidence-Readiness Trigger","no parse/provider/graph"],["Task 151: Investigation-Cadence Trigger","high-water"],["Failure Injection, Acceptance, And Live-Gate Matrix","not-applicable"],["Merge, Rebase, Rollback, And Stop Conditions","forward source commit"]]){let rejected=false;try{validate(mutate(plan,heading,token))}catch{rejected=true}if(!rejected)throw new Error(`counterfactual accepted: ${heading} / ${token}`)} console.log("GREEN: Task 113 section-local plan audit passed (8 section checks; 10 counterfactuals rejected).")'
```

Run this additional recovery-specific audit with the audit above. It guards the
semantic-identity, equal-scope loser-retry, complete no-effect, and independently
approved adoption clauses introduced by this repair. Its counterfactual loop has
the same fail polarity: accepting a variant with any selected local requirement
removed exits nonzero.

```bash
node --input-type=module --eval 'import { readFileSync } from "node:fs"; const plan=readFileSync("docs/superpowers/plans/2026-07-12-resident-agent-proactive-triggers-implementation.md","utf8"); const section=(doc,heading)=>{const start=doc.indexOf(`## ${heading}`);if(start<0)throw new Error(`missing section: ${heading}`);const end=doc.indexOf("\n## ",start+4);return doc.slice(start,end<0?doc.length:end)}; const requirements=[ ["Task 118: Trigger Core, Request Event, And Rebuildable Projection",["reversed sourceRefs","requestFingerprint: forward.requestFingerprint","requestId: forward.requestId","dedupeKey: forward.dedupeKey","expect(secondScope).toEqual(firstScope)","buildTriggerGateKey(secondScope)","freshReadCount()","modelId","approvalId","handoffId","taskId","schedulerId","sourceBytes","rawBytes","model:","approval:","handoff:","task:","scheduler:"]], ["Failure Injection, Acceptance, And Live-Gate Matrix",["Task 136 (L)","packages/agent/test/bounded-agent-loop.test.ts","packages/agent/test/execution-loop.test.ts","independently revalidate the required approval","exact preview hash","effect boundary"]] ]; const validate=(doc)=>{for(const [heading,tokens] of requirements){const block=section(doc,heading);for(const token of tokens)if(!block.includes(token))throw new Error(`${heading}: missing ${token}`)}}; const mutate=(doc,heading,token)=>{const block=section(doc,heading);const changed=block.split(token).join("removed");if(changed===block)throw new Error(`counterfactual setup failed: ${heading} / ${token}`);return doc.replace(block,changed)}; validate(plan); let rejected=0; for(const [heading,tokens] of requirements)for(const token of tokens){let failed=false;try{validate(mutate(plan,heading,token))}catch{failed=true}if(!failed)throw new Error(`counterfactual accepted: ${heading} / ${token}`);rejected++} console.log(`GREEN: Task 113 recovery audit passed (2 section checks; ${rejected} counterfactuals rejected).`)'
```

Run this original-promise/exhaustive-no-effect audit in addition to the two
audits above. It deliberately isolates the executable Task 118 concurrent-race
test body rather than accepting phrases from its surrounding prose. The test
must bind the original `losingPromise` directly to one of its two original
evaluator calls, await that exact value for `loser`, prove its in-promise
source-keyed re-read and no-append result, and prove that both conditional
append attempts use the same evaluator gate key. The isolated body contains
exactly two `evaluateResidentTrigger` calls, so a later independent evaluator
call cannot satisfy the losing path. The audit strips comments before its
line-anchored checks, then directly mutates the await, declaration-only,
later-evaluator, and prose/count-only variants. It also preserves the exhaustive
forbidden input/effect matrix: prompt artifact/resolver, model
messages/invocations, provider requests, subscription/API-key/credential
shapes, harnesses, specialists, domain services, and the scheduler/tool/
parser/approval/task/handoff/artifact/projection/graph boundaries. The audit
parses the sole concrete Task 118 `unsafeShapes` fixture itself, requiring each
exact key/value entry there; prose or another occurrence elsewhere in Task 118
cannot satisfy a fixture field. It directly deletes and mutates each concrete
entry with fail polarity.

```bash
node --input-type=module <<'NODE'
import { readFileSync } from "node:fs";

const plan = readFileSync(
  "docs/superpowers/plans/2026-07-12-resident-agent-proactive-triggers-implementation.md",
  "utf8"
);
const task118Heading = "Task 118: Trigger Core, Request Event, And Rebuildable Projection";
const matrixHeading = "Failure Injection, Acceptance, And Live-Gate Matrix";
const raceMarker = '  it("awaits the original losing concurrent Promise rather than starting a retry", async () => {';
const section = (doc, heading) => {
  const start = doc.indexOf(`## ${heading}`);
  if (start < 0) throw new Error(`missing section: ${heading}`);
  const end = doc.indexOf("\n## ", start + 4);
  return doc.slice(start, end < 0 ? doc.length : end);
};
const raceRange = (doc) => {
  const task = section(doc, task118Heading);
  const taskStart = doc.indexOf(task);
  const start = task.indexOf(raceMarker);
  if (start < 0) throw new Error("race test: missing original-promise test block");
  const end = task.indexOf("\n  });", start);
  if (end < 0) throw new Error("race test: unterminated original-promise test block");
  return { start: taskStart + start, end: taskStart + end + "\n  });".length };
};
const raceBlock = (doc) => {
  const { start, end } = raceRange(doc);
  return doc.slice(start, end);
};
const replaceRace = (doc, mutate) => {
  const { start, end } = raceRange(doc);
  const before = doc.slice(start, end);
  const after = mutate(before);
  if (after === before) throw new Error("counterfactual setup failed");
  return doc.slice(0, start) + after + doc.slice(end);
};
const replaceSection = (doc, heading, token) => {
  const before = section(doc, heading);
  const after = before.split(token).join("");
  if (after === before) throw new Error(`counterfactual setup failed: ${heading} / ${token}`);
  return doc.replace(before, after);
};
const withoutComments = (value) => value
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");
const count = (value, expression) => [...value.matchAll(expression)].length;
const requireMatch = (value, expression, label) => {
  if (!expression.test(value)) throw new Error(`race test: missing executable ${label}`);
};
const triggerBoundaryTokens = [
  "promptArtifact", "promptResolver", "promptArtifactResolver", "modelMessages", "modelInvocation",
  "providerRequest", "subscription", "apiKey", "credential", "credentialRef", "harness", "specialist",
  "domainService", "scheduler", "tool", "parser", "approval", "task", "handoff", "artifactStore",
  "projection", "graph", "sourceBytes", "rawBytes"
];
const matrixTokens = [
  "original losing concurrent evaluator promise", "same evaluator call", "same triggerGateKey",
  "Forbidden trigger input or effect boundary", "prompt artifact/resolver", "model messages/invocations",
  "provider requests", "subscription/API-key/credential", "harnesses", "specialists", "domain services",
  "scheduler, tool, parser, approval, task, handoff, artifact, projection, and graph"
];
const unsafeShapeEntries = new Map([
  ["inputText", '"unsafe prompt"'],
  ["promptArtifact", '{ text: "unsafe prompt artifact" }'],
  ["promptResolver", "{ resolve: sink }"],
  ["promptArtifactResolver", "{ resolve: sink }"],
  ["provider", "{ invoke: sink }"],
  ["providerRequest", "{ execute: sink }"],
  ["model", "{ invoke: sink }"],
  ["modelMessages", '[{ role: "user", content: "unsafe model message" }]'],
  ["modelInvocation", "{ invoke: sink }"],
  ["subscription", "{ authorize: sink }"],
  ["apiKey", '"unsafe-api-key"'],
  ["credential", "{ reveal: sink }"],
  ["credentialRef", "{ resolve: sink }"],
  ["harness", "{ run: sink }"],
  ["specialist", "{ start: sink }"],
  ["domainService", "{ execute: sink }"],
  ["tool", "{ execute: sink }"],
  ["parser", "{ parse: sink }"],
  ["approval", "{ consume: sink }"],
  ["handoff", "{ append: sink }"],
  ["artifactStore", "{ put: sink }"],
  ["projection", "{ mutate: sink }"],
  ["graph", "{ accept: sink }"],
  ["task", "{ claim: sink }"],
  ["scheduler", "{ enqueue: sink }"],
  ["sourceBytes", "new Uint8Array([1])"],
  ["rawBytes", "new Uint8Array([2])"]
]);
const unsafeShapesFixture = (doc) => {
  const task = section(doc, task118Heading);
  const marker = "    const unsafeShapes = {\n";
  if (count(task, /^    const unsafeShapes = \{$/gm) !== 1) {
    throw new Error("unsafeShapes fixture: expected exactly one concrete fixture");
  }
  const start = task.indexOf(marker);
  const end = task.indexOf("\n    };", start);
  if (start < 0 || end < 0) throw new Error("unsafeShapes fixture: missing concrete fixture");
  const fixture = task.slice(start, end + "\n    };".length);
  return { task, fixture, body: task.slice(start + marker.length, end) };
};
const unsafeShapesMap = (doc) => {
  const { body } = unsafeShapesFixture(doc);
  const actual = new Map();
  const lines = body.split("\n");
  for (const [index, line] of lines.entries()) {
    const match = /^      ([A-Za-z][A-Za-z0-9]*): /.exec(line);
    if (!match) throw new Error(`unsafeShapes fixture: malformed entry ${line}`);
    const [, key] = match;
    const requiresTrailingComma = index < lines.length - 1;
    if (line.endsWith(",") !== requiresTrailingComma) {
      throw new Error(`unsafeShapes fixture: malformed delimiter for ${key}`);
    }
    const value = line.slice(match[0].length, requiresTrailingComma ? -1 : undefined);
    if (actual.has(key)) throw new Error(`unsafeShapes fixture: duplicate key ${key}`);
    actual.set(key, value);
  }
  return actual;
};
const validateUnsafeShapesFixture = (doc) => {
  const actual = unsafeShapesMap(doc);
  if (actual.size !== unsafeShapeEntries.size) {
    throw new Error(`unsafeShapes fixture: expected ${unsafeShapeEntries.size} entries, got ${actual.size}`);
  }
  for (const [key, value] of unsafeShapeEntries) {
    if (actual.get(key) !== value) throw new Error(`unsafeShapes fixture: missing or changed ${key}`);
  }
};
const replaceUnsafeShapeEntry = (doc, key, replacement) => {
  const expected = unsafeShapeEntries.get(key);
  if (!expected) throw new Error(`unsafeShapes fixture: unknown expected key ${key}`);
  const { fixture } = unsafeShapesFixture(doc);
  const entry = `      ${key}: ${expected}${key === "rawBytes" ? "" : ","}`;
  if (fixture.split(entry).length !== 2) {
    throw new Error(`unsafeShapes fixture: counterfactual setup failed for ${key}`);
  }
  const changed = fixture.replace(entry, replacement);
  const task = section(doc, task118Heading);
  const taskStart = doc.indexOf(task);
  const fixtureStart = task.indexOf(fixture);
  return doc.slice(0, taskStart + fixtureStart) + changed + doc.slice(taskStart + fixtureStart + fixture.length);
};
const validate = (doc) => {
  const task = section(doc, task118Heading);
  const matrix = section(doc, matrixHeading);
  for (const token of triggerBoundaryTokens) {
    if (!task.includes(token)) throw new Error(`Task 118: missing ${token}`);
  }
  for (const token of matrixTokens) {
    if (!matrix.includes(token)) throw new Error(`matrix: missing ${token}`);
  }
  validateUnsafeShapesFixture(doc);
  const race = withoutComments(raceBlock(doc));
  requireMatch(race, /^\s*const winningPromise = evaluateResidentTrigger\(winningInput\);\s*$/m, "winningPromise binding");
  requireMatch(race, /^\s*const losingPromise = evaluateResidentTrigger\(losingInput\);\s*$/m, "losingPromise binding");
  requireMatch(race, /^\s*const loser = await losingPromise;\s*$/m, "losingPromise await");
  requireMatch(race, /^\s*const winner = await winningPromise;\s*$/m, "winningPromise await");
  requireMatch(race, /expect\(winner\)\.toMatchObject\(\{ kind: "requested" \}\);/, "winning result");
  requireMatch(race, /expect\(loser\)\.toMatchObject\(\{ kind: "budget-exhausted" \}\);/, "losing result");
  requireMatch(race, /expect\(winningGateKey\)\.toBe\(losingGateKey\);/, "same gate derivation");
  requireMatch(race, /expect\(authority\.appendGateKeys\(\)\)\.toEqual\(\[winningGateKey, losingGateKey\]\);/, "same gate append attempts");
  requireMatch(race, /expect\(authority\.readSnapshotCountFor\(losingSource!\.sourceEventId\)\)\.toBe\(2\);/, "losing in-promise reread");
  requireMatch(race, /expect\(authority\.freshReadCount\(\)\)\.toBe\(3\);/, "exact fresh reads");
  if (count(race, /\bevaluateResidentTrigger\(/g) !== 2) {
    throw new Error("race test: must contain exactly the two original evaluator calls");
  }
  const firstAwait = race.indexOf("await losingPromise");
  if (
    race.indexOf("const winningPromise = evaluateResidentTrigger(winningInput);") > firstAwait ||
    race.indexOf("const losingPromise = evaluateResidentTrigger(losingInput);") > firstAwait
  ) {
    throw new Error("race test: both original promises must start before awaiting the losing promise");
  }
};

validate(plan);
const variants = [
  ["await replacement", (doc) => replaceRace(doc, (race) => race.replace(
    "const loser = await losingPromise;", "const loser = await winningPromise;"
  ))],
  ["declaration-only losing promise", (doc) => replaceRace(doc, (race) => race.replace(
    "const loser = await losingPromise;", 'const loser = { kind: "budget-exhausted" };'
  ))],
  ["later evaluator call", (doc) => replaceRace(doc, (race) => race.replace(
    "const loser = await losingPromise;",
    "const loser = await losingPromise;\n    const retry = await evaluateResidentTrigger(losingInput);"
  ))],
  ["prose/count-only tokens", (doc) => replaceRace(doc, (race) => race.replace(
    "const losingPromise = evaluateResidentTrigger(losingInput);",
    'const retriedPromise = evaluateResidentTrigger(losingInput);\n    // const losingPromise = evaluateResidentTrigger(losingInput);\n    const proofTokens = "losingPromise await losingPromise";'
  ))],
  ...triggerBoundaryTokens.map((token) => [
    `Task 118 boundary ${token}`,
    (doc) => replaceSection(doc, task118Heading, token)
  ]),
  ...matrixTokens.map((token) => [
    `matrix ${token}`,
    (doc) => replaceSection(doc, matrixHeading, token)
  ]),
  ...[...unsafeShapeEntries].flatMap(([key]) => [
    [`unsafeShapes fixture removal ${key}`, (doc) => replaceUnsafeShapeEntry(doc, key, "")],
    [`unsafeShapes fixture mutation ${key}`, (doc) => replaceUnsafeShapeEntry(doc, key, `      ${key}: undefined,`)]
  ])
];
for (const [label, mutate] of variants) {
  let rejected = false;
  try { validate(mutate(plan)); } catch { rejected = true; }
  if (!rejected) throw new Error(`counterfactual accepted: ${label}`);
}
console.log(`GREEN: Task 113 original-promise structural audit passed (${variants.length} counterfactuals rejected).`);
NODE
```

The original Task 113 RED result is the `ENOENT` failure while this plan is
absent. Each forward documentation repair must also run the relevant
section-local audit against its baseline and record the expected missing local
requirement before adding it. The Task 113 GREEN result is all applicable
success markers, followed by `git diff --check`, `npm run factory:check`, and
`npm run verify`.

## CF-1 Contract Gate And Conflict Resolution

CF-1 is the only authority that turns the Lane T proposals into canonical
interfaces. Before Task 118 RED, its freeze record must name the final event
literal, Zod schema version, stream format, diagnostic categories,
idempotency index, mounted authority capability, projection parser/version,
fixture owner, source-event bindings, `invalid-scope` category, and one writer
for every shared module. Task 118 does not infer or silently rename a missing
freeze entry.

This plan proposes `agent.trigger.requested.v1`. If CF-1 freezes a different
literal, signature, or module, the coordinator records a bounded plan
correction, rebases the worker to the CF-1 SHA, and reruns the focused suite
before implementation. `invalid-scope` remains a closed decision distinct from
`readback-failed`; it cannot become a successful readback or erase the reason
for rejection.

`packages/ontology/src/contracts.ts` is a shared registry. CF-1 serializes
all writers: the last predecessor merges first, Task 118 rebases, then T is
the sole writer for the trigger event schema and matching metadata. No second
worker edits that registry concurrently. This rebase rule applies again before
every dependent task and review.

## Frozen Interfaces Consumed By Lane T

CF-1 must freeze these signatures or a semantically equivalent revision that
the coordinator records before dispatch. They deliberately expose neither
prompt, provider, tool, scheduler, approval, handoff, raw-byte, nor fallback
store fields.

```ts
export type TriggerFamily =
  | "prr-monitoring"
  | "ingestion-production"
  | "evidence-gap-contradiction"
  | "investigation-cadence"
  | "workspace-recovery";

export type TriggerDecisionKind =
  | "requested"
  | "duplicate"
  | "ineligible"
  | "cooldown-active"
  | "budget-exhausted"
  | "workspace-unavailable"
  | "stale-source"
  | "dedupe-conflict"
  | "invalid-scope"
  | "readback-failed";

export interface ResidentTriggerDescriptor {
  readonly descriptorVersion: "resident-trigger-descriptor.v1";
  readonly triggerId: string;
  readonly triggerFamily: TriggerFamily;
  readonly descriptorRevision: string;
  readonly requestedRunType: string;
  readonly policyRef: {
    readonly policyVersion: string;
    readonly policyArtifactHash: `sha256:${string}`;
  };
  readonly allowedSourceKinds: readonly string[];
}

export interface ProposedTriggerAdmissionScopeV1 {
  readonly admissionScopeVersion: "resident-trigger-admission-scope.v1";
  readonly workspaceId: string;
  readonly residentAgentId: "agent_default";
  readonly triggerId: string;
  readonly policyVersion: string;
  readonly policyArtifactHash: `sha256:${string}`;
  readonly cooldownScopeSelector: "workspace-trigger" | "workspace-trigger-subject";
  readonly budgetScopeSelector: "workspace-trigger" | "workspace-trigger-subject";
  readonly policySubjectScope: "none" | "subject-ref";
  readonly scopedSubjectRef?: TriggerSubjectRef;
  readonly policySourcePartition: string;
}

export interface MountedTriggerAuthority {
  readonly authorityVersion: "mounted-trigger-authority.v1";
  readonly workspaceId: string;
  readonly residentAgentId: "agent_default";
  readSnapshot(input: TriggerAuthorityReadInput): Promise<TriggerAuthoritySnapshot>;
  appendRequestedIfCurrent(input: ConditionalTriggerAppendInput): Promise<ConditionalTriggerAppendResult>;
  readEventById(input: { readonly eventId: string }): Promise<unknown>;
}

export interface TriggerEvaluationInput {
  readonly descriptor: ResidentTriggerDescriptor;
  readonly candidate: VerifiedTriggerCandidate;
  readonly authority: MountedTriggerAuthority;
}

export type TriggerDecision = Readonly<{
  readonly kind: TriggerDecisionKind;
  readonly requestId?: string;
  readonly requestFingerprint?: `sha256:${string}`;
  readonly eventId?: string;
  readonly notBefore?: string;
  readonly diagnostic: TriggerSafeDiagnostic;
}>;

export function deriveAdmissionScope(
  policy: MountedTriggerPolicy,
  request: VerifiedTriggerRequestFields
): ProposedTriggerAdmissionScopeV1;
export function buildTriggerRequestFingerprint(
  input: ProposedTriggerRequestFingerprintInputV1
): `sha256:${string}`;
export function buildTriggerGateKey(
  scope: ProposedTriggerAdmissionScopeV1
): `sha256:${string}`;
export function evaluateResidentTrigger(input: TriggerEvaluationInput): Promise<TriggerDecision>;
export function buildTriggerRequestProjection(
  events: readonly KnowledgeEvent[],
  policyReader: TriggerPolicyReadback
): TriggerRequestProjectionV1;
```

`ConditionalTriggerAppendInput` includes a frozen candidate, derived scope,
gate key, snapshot revision, policy hash, lock hash, current source/high-water
proof, and proposed request event. It has neither a callback nor a mutable
gate record. `appendRequestedIfCurrent` serializes by `triggerGateKey`,
rereads the entire scope in one mounted-ledger transaction, appends at most one
request, and returns exact readback or a safe conflict/no-append result.

## File Ownership And Dependency Order

| Task | Exclusive production files | Exclusive test files | Depends on | Produces |
| --- | --- | --- | --- | --- |
| Task 118 | Modify `packages/ontology/src/contracts.ts`; create `packages/agent/src/proactive-triggers.ts`; create `packages/agent/src/trigger-projection.ts` | Create `packages/ontology/test/agent-trigger-contracts.test.ts`; create `packages/agent/test/proactive-triggers.test.ts`; create `packages/agent/test/trigger-projection.test.ts` | CF-1; `contracts.ts` writer order; W mounted authority; L policy review | Canonical request event/schema, evaluator, atomic mounted append, replayable projection, evidence-gap/contradiction and workspace-recovery descriptor constructors. |
| Task 149 | Create `packages/agent/src/prr-proactive-trigger.ts` | Create `packages/agent/test/prr-proactive-trigger.test.ts` | Task 118; CF-1 PRR source mapping | PRR deadline, fee, correspondence, and stalling metadata adapter; request only. |
| Task 150 | Create `packages/agent/src/ingestion-proactive-trigger.ts` | Create `packages/agent/test/ingestion-proactive-trigger.test.ts` | Task 118; CF-1 ingestion/evidence/readiness mapping | New-production/evidence-readiness metadata adapter; no parse/provider/graph effect. |
| Task 151 | Create `packages/agent/src/investigation-proactive-trigger.ts` | Create `packages/agent/test/investigation-proactive-trigger.test.ts` | Task 118; CF-1 cadence mapping; L policy review | Investigation-cadence metadata adapter with high-water, cooldown, and budget proof. |

Task 118 owns the two descriptor constructors for the design's
`evidence-gap-contradiction` and `workspace-recovery` families because no
separate vertical owns descriptor-only files. They accept injected verified
facts only; they do not recreate projection, wake, workspace, or source
producers. Tasks 149--151 start only after Task 118 merges, rebase to that
merged SHA, and never edit the core evaluator, projection, ontology registry,
runtime factory, provider configuration, wake code, handoff code, routes, or
UI.

## Task 118: Trigger Core, Request Event, And Rebuildable Projection

**Files:**

- Modify: `packages/ontology/src/contracts.ts`
- Create: `packages/agent/src/proactive-triggers.ts`
- Create: `packages/agent/src/trigger-projection.ts`
- Create: `packages/ontology/test/agent-trigger-contracts.test.ts`
- Create: `packages/agent/test/proactive-triggers.test.ts`
- Create: `packages/agent/test/trigger-projection.test.ts`
- Create: `docs/agentic/claims/task-118-resident-full-vision-trigger-core.md`

**Consumes:** CF-1's event/stream/schema and authority contracts, W's verified
mounted identity/lock snapshot, L-reviewed immutable policy, existing
`EventLedger` types, and normalized source metadata.

**Produces:** the CF-1 request literal, `ResidentTriggerDescriptor`,
deterministic fingerprint/dedupe/admission-scope/gate-key builders,
`evaluateResidentTrigger`, `TriggerRequestProjectionV1`, and safe descriptor
constructors. A requested decision is returned only after exact readback.

- [ ] **Step 1: Claim, rebase, and prove serialized ownership.**

  Commit the Task 118 claim with the exact CF-1 SHA, policy owner,
  `contracts.ts` writer-order record, owned files, and forbidden cross-lane
  files. Rebase to the recorded CF-1 commit. Read the registry to prove no
  active worker owns `packages/ontology/src/contracts.ts`; if it is owned,
  return a blocked claim for coordinator sequencing rather than editing a
  shared registry concurrently.

- [ ] **Step 2: Write focused failing event, evaluator, and projection tests.**

  In `agent-trigger-contracts.test.ts`, make the strict event boundary reject
  another resident and effect-shaped fields:

  ```ts
  it("accepts one complete provenance-bound request and rejects widened payloads", () => {
    expect(validateKnowledgeEvent(triggerRequestedEvent())).toMatchObject({ success: true });
    expect(validateKnowledgeEvent(triggerRequestedEvent({
      payload: { ...triggerRequestedEvent().payload, residentAgentId: "agent_other" }
    }))).toMatchObject({ success: false });
    for (const field of ["inputText", "providerId", "modelId", "approvalId", "handoffId", "taskId", "schedulerId", "sourceBytes", "rawBytes"]) {
      expect(validateKnowledgeEvent(triggerRequestedEvent({
        payload: { ...triggerRequestedEvent().payload, [field]: "unsafe" }
      }))).toMatchObject({ success: false });
    }
  });
  ```

  In `proactive-triggers.test.ts`, require stable semantic identity across
  append times, policy-only admission scope, one conditional append for equal
  scope/different high-water candidates, and no append for bad inputs:

  ```ts
  it("keeps fingerprint request ID and dedupe stable across append times", async () => {
    const authority = mountedAuthority();
    const first = await evaluateResidentTrigger(verifiedEvaluation({ authority, attemptedAt: "2026-07-13T00:00:00.000Z" }));
    const second = await evaluateResidentTrigger(verifiedEvaluation({ authority, attemptedAt: "2026-07-13T00:01:00.000Z" }));
    expect(second).toMatchObject({ kind: "duplicate", requestId: first.requestId, requestFingerprint: first.requestFingerprint });
    expect(authority.appendCount()).toBe(1);
  });

  it("canonicalizes reversed sourceRefs to one fingerprint, request ID, and dedupe key", async () => {
    const forward = canonicalTriggerIdentity(verifiedEvaluation({
      candidate: verifiedCandidate({ sourceRefs: verifiedSourceRefs([4, 5]) })
    }));
    const reversed = canonicalTriggerIdentity(verifiedEvaluation({
      candidate: verifiedCandidate({ sourceRefs: verifiedSourceRefs([5, 4]) })
    }));
    expect(reversed).toEqual(forward);
    expect(reversed).toMatchObject({
      requestFingerprint: forward.requestFingerprint,
      requestId: forward.requestId,
      dedupeKey: forward.dedupeKey
    });
  });

  it("rejects candidate-selected scope before append", async () => {
    const authority = mountedAuthority();
    const result = await evaluateResidentTrigger(verifiedEvaluation({
      authority,
      candidate: { ...verifiedCandidate(), budgetScope: "caller-controlled" } as unknown as VerifiedTriggerCandidate
    }));
    expect(result).toMatchObject({ kind: "invalid-scope" });
    expect(authority.appendCount()).toBe(0);
  });

  it("awaits the original losing concurrent Promise rather than starting a retry", async () => {
    const authority = mountedAuthority({
      maxRequests: 1,
      synchronizeInitialReads: true,
      winningSourceSequence: 4
    });
    const winningInput = verifiedEvaluation({
      authority,
      candidate: verifiedCandidate({ sourceSequence: 4 })
    });
    const losingInput = verifiedEvaluation({
      authority,
      candidate: verifiedCandidate({ sourceSequence: 5 })
    });
    const winningScope = deriveAdmissionScope(authority.policy(), verifiedRequestFields(winningInput));
    const losingScope = deriveAdmissionScope(authority.policy(), verifiedRequestFields(losingInput));
    const firstScope = winningScope;
    const secondScope = losingScope;
    expect(secondScope).toEqual(firstScope);
    expect(buildTriggerGateKey(secondScope)).toBe(buildTriggerGateKey(firstScope));
    const winningGateKey = buildTriggerGateKey(winningScope);
    const losingGateKey = buildTriggerGateKey(losingScope);
    expect(winningGateKey).toBe(losingGateKey);
    const winningPromise = evaluateResidentTrigger(winningInput);
    const losingPromise = evaluateResidentTrigger(losingInput);
    const [losingSource] = losingInput.candidate.sourceRefs;
    expect(losingSource).toBeDefined();
    const loser = await losingPromise;
    const winner = await winningPromise;
    expect(winner).toMatchObject({ kind: "requested" });
    expect(loser).toMatchObject({ kind: "budget-exhausted" });
    expect(authority.readSnapshotCountFor(losingSource!.sourceEventId)).toBe(2);
    expect(authority.freshReadCount()).toBe(3);
    expect(authority.appendGateKeys()).toEqual([winningGateKey, losingGateKey]);
    expect(authority.appendCount()).toBe(1);
  });
  ```

  The synchronized authority fixture holds both first reads until both original
  calls are in flight and deterministically grants source sequence 4 the one
  request slot. It records every conditional-append gate key and reads by the
  original source identity. `losingPromise` is directly assigned from source
  sequence 5's original `evaluateResidentTrigger(losingInput)` call, and
  `loser` is directly assigned from `await losingPromise` before the winner is
  awaited. Its second source-keyed read, exact three fresh reads, same two gate
  keys, and `budget-exhausted` result prove that this same in-flight Promise
  discarded its stale snapshot and re-evaluated from authority. The executable
  test body contains exactly the two original evaluator calls; a later retry,
  a declaration-only Promise, or prose that merely names the Promise cannot
  satisfy the proof.

  In `trigger-projection.test.ts`, write cases for exact requested and
  duplicate readback, cooldown-active and budget-exhausted no append, stale
  source, swapped content hash, mount/policy/lock mismatch, same-dedupe
  different-fingerprint conflict, altered persisted scope/gate key, and
  restart replay. The altered-scope case must assert `invalid-scope`, no
  trusted projection entry, and no high-water advance.

- [ ] **Step 3: Run RED.**

  ```bash
  npm test -- packages/ontology/test/agent-trigger-contracts.test.ts packages/agent/test/proactive-triggers.test.ts packages/agent/test/trigger-projection.test.ts
  ```

  Expected: FAIL because the event schema, evaluator, and projection modules
  are absent. The failure must precede a provider, tool, parser, scheduler,
  task-orchestrator, artifact, approval, or domain-service fake.

- [ ] **Step 4: Implement the smallest strict contract, evaluator, and replay.**

  Add CF-1's strict Zod event schema. Its nested source refs, high-water mark,
  provenance, admission scope, and safe diagnostic are strict objects;
  `residentAgentId` is exactly `agent_default`; source refs are canonically
  sorted; and no raw text or effect identifier is optional.

  Implement the evaluator with the following fixed phase order:

  ```ts
  export async function evaluateResidentTrigger(input: TriggerEvaluationInput): Promise<TriggerDecision> {
    const normalized = normalizeTriggerEvaluationInput(input);
    const snapshot = await normalized.authority.readSnapshot(readInputFor(normalized));
    const verified = verifyMountedCandidate(normalized, snapshot);
    if (!verified.ok) return safeDecision(verified.kind, verified.diagnostic);
    const scope = deriveAdmissionScope(snapshot.policy, verified.request);
    const fingerprint = buildTriggerRequestFingerprint(fingerprintInput(verified.request));
    const proposed = buildProposedTriggerRequest({ verified, scope, fingerprint });
    const append = await normalized.authority.appendRequestedIfCurrent({
      snapshotRevision: snapshot.revision,
      triggerGateKey: buildTriggerGateKey(scope),
      proposed
    });
    return readbackTriggerDecision(normalized.authority, snapshot.policy, append, proposed);
  }
  ```

  `normalizeTriggerEvaluationInput` rejects unknown values before the first
  `await`, including `inputText`, prompt artifact/resolver and
  `promptArtifactResolver`, provider requests, model messages/invocations,
  subscription/API-key/credential shapes, harnesses, specialists, domain
  services, parser, tool, approval, handoff, artifact, projection, graph,
  task, scheduler, `sourceBytes`, and `rawBytes` shapes. The evaluator has no provider
  capability and no effect capability. The focused fixture must prove
  that each rejected shape performs neither a mounted append nor an
  effect-sink invocation. `fingerprintInput` excludes
  append ID/sequence, requested-at, not-before, correlation ID, and request
  ID; source refs sort by stream ID, sequence, then event ID; request IDs use
  `trq_${base32(fingerprint)}`; dedupe uses canonical JSON of its version and
  fingerprint only.

  `deriveAdmissionScope` reads only mounted policy selectors and verified
  request fields, rejects unequal cooldown/budget selectors, and requires the
  exact conditional subject-reference rule. `readbackTriggerDecision`
  reconstructs the scope and gate key from authority; it requires equality of
  persisted/reconstructed scope, resident identity, policy/hash, source IDs,
  high-water, causation, fingerprint, request ID, and gate key. A conflict
  discards the old snapshot, performs at most one fresh authority evaluation,
  and then returns a safe no append result.

  Implement `trigger-projection.ts` as pure replay. It resolves each request's
  immutable policy artifact, reconstructs scope and gate key, orders high-water
  by source sequence/event ID, exposes only verified request records, and
  writes no checkpoint, cache, or fallback state. Add evidence-gap/contradiction
  and workspace-recovery descriptor constructors that accept pre-verified
  metadata only.

- [ ] **Step 5: Run GREEN.**

  ```bash
  npm test -- packages/ontology/test/agent-trigger-contracts.test.ts packages/agent/test/proactive-triggers.test.ts packages/agent/test/trigger-projection.test.ts
  npm run typecheck
  ```

  Expected: PASS. The concurrency fixture has one append under one gate key;
  invalid, stale, unavailable, cooldown-active, and budget-exhausted decisions
  make no append and leave high-water unchanged; replay rebuilds trusted state.

- [ ] **Step 6: Run no-prompt/no-effect and altered-readback counterfactuals.**

  Add this negative test to `proactive-triggers.test.ts`:

  ```ts
  it("rejects every forbidden input or effect shape before append or an effect sink", async () => {
    const authority = mountedAuthority();
    const sink = vi.fn();
    const unsafeShapes = {
      inputText: "unsafe prompt",
      promptArtifact: { text: "unsafe prompt artifact" },
      promptResolver: { resolve: sink },
      promptArtifactResolver: { resolve: sink },
      provider: { invoke: sink },
      providerRequest: { execute: sink },
      model: { invoke: sink },
      modelMessages: [{ role: "user", content: "unsafe model message" }],
      modelInvocation: { invoke: sink },
      subscription: { authorize: sink },
      apiKey: "unsafe-api-key",
      credential: { reveal: sink },
      credentialRef: { resolve: sink },
      harness: { run: sink },
      specialist: { start: sink },
      domainService: { execute: sink },
      tool: { execute: sink },
      parser: { parse: sink },
      approval: { consume: sink },
      handoff: { append: sink },
      artifactStore: { put: sink },
      projection: { mutate: sink },
      graph: { accept: sink },
      task: { claim: sink },
      scheduler: { enqueue: sink },
      sourceBytes: new Uint8Array([1]),
      rawBytes: new Uint8Array([2])
    };
    for (const [field, value] of Object.entries(unsafeShapes)) {
      const result = await evaluateResidentTrigger({
        ...verifiedEvaluation({ authority }),
        [field]: value
      } as unknown as TriggerEvaluationInput);
      expect(result).toMatchObject({ kind: "invalid-scope" });
    }
    expect(authority.appendCount()).toBe(0);
    expect(sink).not.toHaveBeenCalled();
  });
  ```

  Mutate persisted scope, gate key, `agent_default`, policy hash, source event
  ID, source content hash, lock hash, and high-water one at a time. Each must
  fail closed with a secret-safe category; no diagnostic contains hostile
  source, prompt, credential, or provider material.

- [ ] **Step 7: Verify, commit, and request fresh review.**

  ```bash
  git diff --check
  npm run factory:check
  npm run verify
  git add packages/ontology/src/contracts.ts packages/agent/src/proactive-triggers.ts packages/agent/src/trigger-projection.ts packages/ontology/test/agent-trigger-contracts.test.ts packages/agent/test/proactive-triggers.test.ts packages/agent/test/trigger-projection.test.ts docs/agentic/claims/task-118-resident-full-vision-trigger-core.md
  git commit -m "feat: add resident proactive trigger core"
  ```

  A fresh reviewer checks CF-1 event/owner alignment, persisted admission
  scope, canonical hash inputs, conditional append/readback, replay, safe
  diagnostics, and absence of capabilities. Task 118 cannot dispatch Task
  149, Task 150, or Task 151 and cannot self-merge.

## Task 149: PRR Deadline, Fee, Correspondence, And Stalling Trigger

**Files:**

- Create: `packages/agent/src/prr-proactive-trigger.ts`
- Create: `packages/agent/test/prr-proactive-trigger.test.ts`
- Create: `docs/agentic/claims/task-149-resident-full-vision-prr-trigger.md`

**Consumes:** Task 118's evaluator, CF-1 PRR lifecycle/deadline/fee/
correspondence/stalling mappings, verified policy, and mounted authority.
**Produces:** a `prr-monitoring` candidate for a draft-only advisory run type.

- [ ] **Step 1: Write failing source-boundary tests.**

  ```ts
  it("requests a draft-only PRR monitor from a verified deadline event", async () => {
    const result = await evaluatePrrProactiveTrigger({ authority: mountedAuthority(), facts: verifiedPrrDeadlineFacts() });
    expect(result).toMatchObject({ kind: "requested" });
    expect(readRequestedRunType(result)).toBe("prr-monitoring-draft");
  });

  it("makes no send or high-water advance for stale correspondence", async () => {
    const authority = mountedAuthority();
    const send = vi.fn();
    const result = await evaluatePrrProactiveTrigger({ authority, facts: stalePrrCorrespondenceFacts(), send } as never);
    expect(result).toMatchObject({ kind: "stale-source" });
    expect(authority.appendCount()).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });
  ```

  Cover deadline, fee, correspondence, and stalling independently. Reject
  wrong workspace, changed request/source/content binding, absent policy,
  active lock, duplicate, cooldown, and budget exhaustion.

- [ ] **Step 2: Run RED.**

  ```bash
  npm test -- packages/agent/test/prr-proactive-trigger.test.ts packages/agent/test/proactive-triggers.test.ts
  ```

  Expected: FAIL because `evaluatePrrProactiveTrigger` is absent.

- [ ] **Step 3: Implement only metadata adaptation.**

  ```ts
  export function evaluatePrrProactiveTrigger(input: PrrProactiveTriggerInput): Promise<TriggerDecision> {
    return evaluateResidentTrigger({
      descriptor: prrMonitoringDescriptor(),
      candidate: verifiedPrrCandidate(input),
      authority: input.authority
    });
  }
  ```

  `verifiedPrrCandidate` consumes only CF-1 event identity/sequence, a safe
  request reference, required content hash, policy-bound high-water facts, and
  mounted identity. It rejects raw correspondence, transport/send/escalation
  capabilities, and unverified status; it does not call a PRR service.

- [ ] **Step 4: Run GREEN, verify, commit, and review.**

  ```bash
  npm test -- packages/agent/test/prr-proactive-trigger.test.ts packages/agent/test/proactive-triggers.test.ts
  git diff --check
  npm run factory:check
  npm run verify
  git add packages/agent/src/prr-proactive-trigger.ts packages/agent/test/prr-proactive-trigger.test.ts docs/agentic/claims/task-149-resident-full-vision-prr-trigger.md
  git commit -m "feat: add PRR proactive trigger"
  ```

  Fresh review verifies request-only, dedupe, cooldown, and no send behavior.
  Lane A later proves durable draft handoff and no send; no provider or Nous
  call is applicable.

## Task 150: Ingestion New-Production And Evidence-Readiness Trigger

**Files:**

- Create: `packages/agent/src/ingestion-proactive-trigger.ts`
- Create: `packages/agent/test/ingestion-proactive-trigger.test.ts`
- Create: `docs/agentic/claims/task-150-resident-full-vision-ingestion-trigger.md`

**Consumes:** Task 118's evaluator, CF-1 ingestion completion/evidence/
readiness mappings, and verified mounted authority. **Produces:** an
`ingestion-production` candidate for advisory evidence triage or local review.

- [ ] **Step 1: Write failing no-parse/provider/graph tests.**

  ```ts
  it("requests advisory evidence triage from read-back completion metadata", async () => {
    const result = await evaluateIngestionProactiveTrigger({ authority: mountedAuthority(), facts: verifiedIngestionFacts() });
    expect(result).toMatchObject({ kind: "requested" });
    expect(readRequestedRunType(result)).toBe("evidence-triage");
  });

  it("has no parse/provider/graph effect", async () => {
    const parse = vi.fn();
    const provider = vi.fn();
    const graph = vi.fn();
    const result = await evaluateIngestionProactiveTrigger({ authority: mountedAuthority(), facts: verifiedIngestionFacts(), parse, provider, graph } as never);
    expect(result).toMatchObject({ kind: "invalid-scope" });
    expect(parse).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
    expect(graph).not.toHaveBeenCalled();
  });
  ```

  Add stale completion, swapped evidence hash, malformed readiness, duplicate,
  cooldown, budget, mount mismatch, and replay coverage. An exact request
  readback is the only event that can advance high-water.

- [ ] **Step 2: Run RED.**

  ```bash
  npm test -- packages/agent/test/ingestion-proactive-trigger.test.ts packages/agent/test/proactive-triggers.test.ts
  ```

  Expected: FAIL because `evaluateIngestionProactiveTrigger` is absent.

- [ ] **Step 3: Implement a metadata-only adapter.**

  ```ts
  export function evaluateIngestionProactiveTrigger(input: IngestionProactiveTriggerInput): Promise<TriggerDecision> {
    return evaluateResidentTrigger({
      descriptor: ingestionProductionDescriptor(),
      candidate: verifiedIngestionCandidate(input),
      authority: input.authority
    });
  }
  ```

  Validate source IDs, stream ordering, safe evidence references, required
  content hash, readiness revision, policy binding, and workspace identity.
  The input schema has no parser, provider, artifact, graph, or raw-byte
  field; the adapter has no provider capability.

- [ ] **Step 4: Run GREEN, verify, commit, and review.**

  ```bash
  npm test -- packages/agent/test/ingestion-proactive-trigger.test.ts packages/agent/test/proactive-triggers.test.ts
  git diff --check
  npm run factory:check
  npm run verify
  git add packages/agent/src/ingestion-proactive-trigger.ts packages/agent/test/ingestion-proactive-trigger.test.ts docs/agentic/claims/task-150-resident-full-vision-ingestion-trigger.md
  git commit -m "feat: add ingestion proactive trigger"
  ```

  Fresh review rejects any parse, provider, or graph path. Lane A later runs a
  production-shaped fixture; no provider or Nous call is applicable.

## Task 151: Investigation-Cadence Trigger

**Files:**

- Create: `packages/agent/src/investigation-proactive-trigger.ts`
- Create: `packages/agent/test/investigation-proactive-trigger.test.ts`
- Create: `docs/agentic/claims/task-151-resident-full-vision-investigation-trigger.md`

**Consumes:** Task 118's evaluator, CF-1 cadence/prior-request mapping, and
L's frozen policy interpretation. **Produces:** an `investigation-cadence`
candidate for advisory planning only.

- [ ] **Step 1: Write failing cadence, budget, and high-water tests.**

  ```ts
  it("shares one policy scope across different cadence high-water candidates", async () => {
    const authority = mountedAuthority({ cooldownMs: 60_000, maxRequests: 1 });
    const decisions = await Promise.all([12, 13].map((sourceSequence) =>
      evaluateInvestigationProactiveTrigger({ authority, facts: verifiedCadenceFacts({ sourceSequence }) })));
    expect(decisions.filter(({ kind }) => kind === "requested")).toHaveLength(1);
    expect(authority.appendCount()).toBe(1);
  });

  it("does not advance high-water during cooldown", async () => {
    const authority = mountedAuthority({ activeCooldown: true });
    const result = await evaluateInvestigationProactiveTrigger({ authority, facts: verifiedCadenceFacts() });
    expect(result).toMatchObject({ kind: "cooldown-active" });
    expect(buildTriggerRequestProjection(await authority.events(), authority.policyReader()).highWaterMarks).toEqual({});
  });
  ```

  Add selector mismatch, subject-scope mismatch, altered persisted scope,
  stale cadence record, lock, restart replay, duplicate, and safe `notBefore`
  tests. Assert that no scheduler or task claim is callable.

- [ ] **Step 2: Run RED.**

  ```bash
  npm test -- packages/agent/test/investigation-proactive-trigger.test.ts packages/agent/test/proactive-triggers.test.ts
  ```

  Expected: FAIL because `evaluateInvestigationProactiveTrigger` is absent.

- [ ] **Step 3: Implement policy-bound candidate construction.**

  ```ts
  export function evaluateInvestigationProactiveTrigger(
    input: InvestigationProactiveTriggerInput
  ): Promise<TriggerDecision> {
    return evaluateResidentTrigger({
      descriptor: investigationCadenceDescriptor(),
      candidate: verifiedCadenceCandidate(input),
      authority: input.authority
    });
  }
  ```

  Require the exact policy-authorized cadence record and prior verified request
  high-water. The adapter never schedules a loop, creates a task, or changes
  execution budgets; those remain later L/scheduler responsibilities after
  independent adoption.

- [ ] **Step 4: Run GREEN, verify, commit, and review.**

  ```bash
  npm test -- packages/agent/test/investigation-proactive-trigger.test.ts packages/agent/test/proactive-triggers.test.ts
  git diff --check
  npm run factory:check
  npm run verify
  git add packages/agent/src/investigation-proactive-trigger.ts packages/agent/test/investigation-proactive-trigger.test.ts docs/agentic/claims/task-151-resident-full-vision-investigation-trigger.md
  git commit -m "feat: add investigation cadence trigger"
  ```

  Fresh review verifies one gate for equal policy scopes, cooldown/budget
  preservation of high-water, and no scheduler, claim, or provider path.

## Failure Injection, Acceptance, And Live-Gate Matrix

| Case | Owner task | Deterministic proof | Required result |
| --- | --- | --- | --- |
| same semantics at different append times | Task 118 | `proactive-triggers.test.ts` | One stable fingerprint, request ID, and dedupe key; exact duplicate readback. |
| same dedupe key, different fingerprint | Task 118 | collision fixture | `dedupe-conflict`, no append, safe diagnostic. |
| Equal scope, different source high-water | Task 118 and Task 151 | synchronized concurrent evaluator fixture using the original losing concurrent evaluator promise | Both original calls derive the same triggerGateKey. One conditional append is allowed; the original `losingPromise`, not a later evaluator call, is awaited for its `budget-exhausted` no-append result after its source-keyed re-read and re-evaluation within the same evaluator call. |
| Candidate-selected scope, selector, or key | Task 118 | normalization counterfactual | `invalid-scope`, no append, no high-water movement. |
| Altered persisted scope, gate, source, policy, mount, or lock | Task 118 | projection/readback counterfactual | Exact reconstruction fails closed and excludes the record. |
| Cooldown or request budget | Task 118 and Task 151 | policy-window fixture | No append; high-water unchanged; `notBefore` only for cooldown. |
| Stale PRR or ingestion source | Task 149 and Task 150 | swapped event/hash fixture | No request and no send/parse/provider/graph action. |
| Disconnect, unreadable policy, swapped mount | Task 118 | mounted-authority fake | Safe unavailable/stale category, no fallback write. |
| Forbidden trigger input or effect boundary | Task 118 | strict public-boundary fixture with one counterfactual per shape | Reject prompt artifact/resolver, model messages/invocations, provider requests, subscription/API-key/credential shapes, harnesses, specialists, domain services, scheduler, tool, parser, approval, task, handoff, artifact, projection, and graph shapes before append or any sink invocation. |
| Adoption after truth changes | Task 136 (L), exclusively `packages/agent/test/bounded-agent-loop.test.ts` | `npm test -- packages/agent/test/bounded-agent-loop.test.ts packages/agent/test/execution-loop.test.ts` | Re-read the mounted request and reject identity/policy/source/high-water/lock mismatch; independently revalidate the effect-specific approval before consuming it. |

Lane A A-05 runs:

```bash
npm test -- packages/agent/test/prr-proactive-trigger.test.ts packages/agent/test/prr-negotiation-draft-only.test.ts
```

It proves idempotency, cooldown, budget, durable draft handoff, and no send;
no provider or Nous call is applicable to Tasks 118, 149, 150, or 151. The
coordinator records `not-applicable`, not a provider skip. Any future model
invocation needs a different approved plan, explicit provider authorization,
and a coordinator-only real Nous gate.

Trigger adoption is separately owned by Task 136 (L), not by Task 118 or the
metadata adapters. Its exact owned test is
`packages/agent/test/bounded-agent-loop.test.ts`, run with:

```bash
npm test -- packages/agent/test/bounded-agent-loop.test.ts packages/agent/test/execution-loop.test.ts
```

That test must read the pending request back from mounted storage and revalidate
the current resident identity, policy version/hash, source availability and
high-water, active locks, bounded-loop descriptor/tool/budget constraints, and
the request provenance before adoption. For every later gated effect it must
also independently revalidate the required approval: actor/class, exact preview hash,
causation/provenance, current locks, and source hashes at the
effect boundary before consuming that approval. A trigger request cannot
satisfy, request, or consume an approval, and a failed revalidation produces no
run, effect, handoff, or projection mutation.

## Merge, Rebase, Rollback, And Stop Conditions

1. The coordinator merges CF-1 before Task 118, records the SHA and
   `contracts.ts` writer order, then rebases Task 118 and runs its focused
   suite. Task 118 merges before Tasks 149--151; each adapter rebases to its
   merged SHA and runs its own focused suite before fresh review.
2. The coordinator records every source-contract or policy rebase as a new
   registry record. A stale branch is neither reviewed nor merged. T never
   edits R's default runtime factory, P's provider configuration, W's mount,
   H's handoff code, L's execution loop, U's routes/UI, or A's acceptance
   files.
3. Rollback is append-only: never delete a request event or mutate
   high-water. Disable a descriptor through a later mounted policy artifact
   and preserve request/provenance history. Repair a broken implementation by
   a forward source commit; readback classifies prior malformed records as
   untrusted rather than rewriting them.
4. Stop the child and return structured evidence for an event/schema/owner
   conflict, unavailable authority dependency, fallback-storage risk,
   data-loss risk, required credential or provider use, inability to express
   atomic mounted conditional append, or a verifier failure after two focused
   repairs. Under standing delegation, the coordinator records root cause,
   changes tactic or worker, and issues a new bounded authorization. Human
   escalation is only for a necessary product, safety, ontology-truth,
   data-loss, credential, or external-behavior decision.

## Plan Self-Review

- [x] Design coverage: deterministic fingerprints, dedupe, persisted admission
  scope, equal-selector policy, shared gate serialization, exact readback and
  replay, cooldown/budget/high-water, five trigger families, source provenance,
  adoption separation, mounted authority, no fallback, safe diagnostics, and
  failure injection all map to a task or acceptance row.
- [x] Interface consistency: Tasks 118, 149, 150, and 151 share CF-1's
  `TriggerDecision`, `MountedTriggerAuthority`, scope, fingerprint, gate key,
  and projection contracts; adapters construct verified candidates only.
- [x] Ownership safety: Task 118 is the serialized `contracts.ts` writer;
  core and adapters have disjoint files; no task writes another lane's
  runtime/provider/wake/handoff/UI boundary.
- [x] Verification: every task has actual RED/GREEN code and command evidence,
  counterfactual coverage, `git diff --check`, `npm run factory:check`,
  `npm run verify`, fresh review, rebase evidence, and a live posture.
- [x] Scope: this plan neither implements production code nor freezes CF-1,
  invokes a provider, dispatches a child, self-approves, or merges into `neo`.

## Execution Handoff

After fresh Task 113 review and coordinator Lane T plan approval, the
coordinator may authorize Task 118 only by a new exact message naming this
reviewed plan commit, CF-1 SHA, Task 118, its wave stop, the user-confirmed
GPT-5.6 Terra / Extra High configuration,
`superpowers:subagent-driven-development`, TDD, fresh review,
verification-before-completion, and no merge into `neo`. Tasks 149--151 need
their own later messages and never begin from Task 118 authorization alone.
