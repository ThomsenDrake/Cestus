# Resident Agent MVP Factory Retrospective

Date: 2026-07-10

## Purpose

This retrospective records durable lessons from the first integrated resident-agent MVP. It is evidence for future Cestus design, planning, implementation, and review work. It is not a readiness claim and does not make currently blocked specialist execution available.

The integration covered the scheduler/resumer, domain adapter registry and adapters, resident memory/context surfaces, specialist workflow contracts and runners, the agent cockpit, and live Nous Portal acceptance. The implementation was split across task worktrees and fresh reviewer sessions, then integrated into `neo` and verified from the deployed checkout.

## Architectural Lessons

### Approval Is Evidence-Bound Execution Proof

An approval event is necessary but insufficient. Consume-time execution must independently verify:

- The approver is a human independent from the requesting actor.
- Approval class, preview hash, causation, and request stream are exact.
- Current source event IDs, artifact hashes, provenance refs, locks, and policy state still match.
- Duplicate or forged request records cannot split projection state from stream validation.
- The execution claim and lease apply to the exact request being consumed.

Fresh scheduler reviews found self-approval, swapped-reference, and duplicate-request-stream paths that passed earlier happy-path tests. Those paths were repaired before merge. Future approval tests must include forged actor kinds, duplicate stream events, unchanged preview hashes with changed provenance, and stale source/artifact arrays.

### Domain Services Remain Authoritative

Agent adapters translate approved requests into domain commands; they do not become alternate PRR, ontology, ingestion, governance, export, or repair services. A successful adapter result is valid only after ledger readback proves the exact expected committed event and actor. Event-shaped values returned by injected services are untrusted until that readback succeeds.

Adapters must fail closed when the authoritative domain executor does not exist. An inert approval request can describe work for human review, but it must not make readiness appear executable and must not be presented as a resumable domain effect.

### Returned DTOs Are Not Durable Workflow State

Workflow handoffs, artifacts, and terminal-looking return values must be reconstructible from ledger events and content-addressed artifacts after restart. Every runner needs one of these durable outcomes:

- A completed terminal event with exact output bindings.
- A failed terminal event with safe failure details and partial-effect accounting.
- An explicitly resumable blocked/waiting state with exact next requirements.

Late blob or artifact-store failures must produce durable failure state. Previously written but unreferenced blobs must be diagnosable; a returned failed handoff alone does not repair a run left as `running` in projection state.

### Untrusted Structure Must Be Snapshotted Once

Public DTOs, adapter inputs, provider outputs, and service results can be hostile through structure as well as values. Repeated reads of getters, accessor-backed arrays, custom prototypes, symbols, sparse arrays, or mutable objects across `await` boundaries can change a hash or provenance binding after validation.

Boundary code should normalize into plain own-data snapshots, reject unsupported structure, freeze the snapshot, and use only that snapshot for preview construction, persistence, provider invocation, and event append.

### Readiness Must Match Exact Capabilities

Readiness cannot infer support from a broad tool prefix or a vaguely related adapter family. Each specialist must name and verify its exact:

- Tool IDs and versions.
- Domain adapter families.
- Context-pack producers and current source high-water marks.
- Prompt template and version.
- Provider capability and byte-transfer posture.
- Approval requirements, active locks, and provenance requirements.
- Durable runner and handoff projection availability.

The contradiction workflow exposed the failure mode: accepted-graph review cannot stand in for contradiction/claim review. Missing capabilities must remain explicit blockers.

### Product Controls Must Match Real Effects

The cockpit is an operational view over runtime truth. A button that only appends `run.started` metadata does not execute a specialist and must not be labeled as a start control. Current safe behavior is queue-only task creation, approval decisions, navigation, refresh, and truthful readiness display.

Audit counts, handoffs, model invocations, staleness, omissions, and provenance must come from their canonical fields. The UI must not synthesize handoffs, infer counts from neighboring objects, or show details from a run other than the selected task/run/type tuple.

### Providers Need Live Acceptance

Deterministic credential-free tests remain the standard suite, but provider behavior requires a real secret-safe acceptance check. The Nous Portal smoke exposed required request tags, reasoning defaults, nullable message content, and additional OpenAI-compatible response fields that fixtures did not reveal.

Live smoke output may include only safe provider/model IDs, hashes, event IDs, counts, categories, and fixed markers. It must not print prompt text, provider response text, credentials, or raw errors.

## Factory Lessons

### Dependency Order

The effective resident-agent implementation order is:

1. Scheduler and resumer contracts.
2. Authoritative domain adapter descriptors and consume-time execution.
3. Specialist runners and durable handoffs.
4. Cockpit and cross-domain bridges.

Design and planning can proceed in parallel against stable DTOs. Dependent implementation should not claim executable readiness before upstream contracts land. Rebase dependent worktrees after upstream merges, then run cross-boundary suites before full verification.

### Reviews Need Fresh Eyes And Bounded Loops

Fresh reviewers repeatedly found issues the implementing context missed: self-approval, forged provenance, duplicate request streams, nonterminal successful runs, getter-based hash changes, fabricated readiness, and browser/runtime DTO drift.

Reviewer loops should remain bounded and task-scoped. Test totals are historical snapshots, not durable contracts; do not churn central readiness documents after every added regression test. Record exact commands and commit IDs in per-slice claims, and keep `docs/agentic/software-factory.md` primarily as an index.

### Worktrees And Deployment Are Separate Verification Boundaries

A child worktree can pass verification while the root runtime serves an older ignored `dist`. Before deployment acceptance:

- Build from the checkout that will be served.
- Confirm the runtime and static assets come from the same commit.
- Inspect the live route DTOs and rendered UI at desktop and mobile widths.
- Rerun environment-blocked tests in the unrestricted coordinator checkout.
- Restore incidental lockfile churn caused only by dependency setup.

### Subagent Session Hygiene

Subagent-driven development creates visible implementation and review sessions. Name each session with its parent lane, task number, and role. The coordinator should record the primary session IDs and any meaningful repair/review IDs in the handoff. Archive subordinate sessions only after branch ancestry, worktree cleanliness, verification evidence, and final answers agree.

Primary resident-agent MVP sessions:

- Scheduler: `019f4453-60ff-7601-b9fe-3cd222796cd3`
- Domain adapters: `019f4453-612d-74a0-94c5-35017e8c7eb9`
- Specialist workflows: `019f4453-628f-7fb0-9248-d9b5038b46f1`
- Memory/context: `019f4453-63b5-7400-a3ae-e7bb6bdb4a14`
- Cockpit: `019f4453-6473-73d1-a1f8-d94f3f8234e9`

## Current Product Truth

The integrated MVP has a resident-agent identity model, append-only task/run/tool events, scheduler/resumer contracts, domain adapter discovery, working memory, provider readiness, live Nous Portal acceptance, queue-only task creation, approval surfaces, audit views, and specialist registry/readiness contracts.

It does not yet provide general autonomous specialist execution. The remaining blockers are:

- Production context-pack builders and staleness sources.
- Registered prompt templates for each specialist mode.
- Scheduler-to-specialist runner dispatch.
- Durable handoff production and projection for every runner.
- Contradiction/claim review events, service, projection, and adapter.
- Continuous resident behaviors such as PRR monitoring, deadline watching, evidence-gap detection, and investigation planning triggers.

These blockers must remain visible in readiness and the cockpit. They must not be replaced by placeholder prompts, synthetic handoffs, inert approval requests presented as executable, or lifecycle-only run controls.

## Verification Snapshot

The integrated `neo` verification snapshot at the end of this work was:

- `npm run verify`: typecheck, 170 passed and 3 skipped test files, 1713 passed and 3 skipped tests, UI build, and factory readiness.
- Live Nous Portal smoke: provider `provider_nous_portal`, model `tencent/hy3:free`, marker `cestus-live-provider-ok`.
- Tailnet runtime and browser inspection from the root checkout at desktop and 390-pixel mobile widths with no page-level horizontal overflow.

These counts are historical evidence only. Future agents should run current commands and trust fresh output rather than editing this retrospective to maintain exact totals.
