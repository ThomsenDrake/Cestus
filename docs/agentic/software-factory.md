# Cestus Software Factory

Status: authoritative.

This is the sole operating contract for moving one approved Cestus product
specification through delivery. The factory is a thin execution line built
from generic coding agents, bounded context, isolated Git worktrees, automated
backpressure, one independent review, and risk-calibrated integration.

The approved specification is the instruction. Git is durable execution
state. The worktree and branch identify the candidate owner. The diff is the
candidate. Tests, types, lint, builds, contract checks, and CI provide
backpressure. Humans define product direction and handle genuine exceptions.

## Delivery Line

```text
approved executable specification
→ bounded context assembly
→ isolated Git worktree
→ implementation agent
→ automated backpressure
→ independent review agent
→ at most two focused repair attempts
→ integration queue
→ integration verification
→ automatic integration or explicit risk escalation
```

No custom scheduler, mission service, event stream, projection, selector, or
registry is required to run this line. Existing Codex capabilities, Git,
worktrees, repository commands, and CI are the platform.

## One Input Artifact

Every product slice starts from one directly readable Markdown specification.
Use `docs/agentic/executable-spec-template.md`. It contains only:

- desired behavior;
- observable acceptance examples;
- allowed scope or subsystem;
- relevant context entry points;
- risk classification;
- required targeted verification;
- required integration verification;
- genuine escalation conditions.

The specification may link to product contracts and source files, but it must
not become a lifecycle database. It has no claim, registry, projection,
heartbeat, retry, event, selector, amendment, or embedded executable-JavaScript
fields. One approved specification is enough to start.

## Roles

### Builder

The builder defines the problem, observable behavior, allowed scope, and
guardrails. Kickoff approval bounds green and yellow execution through
integration; the builder is not asked to approve routine implementation,
review, repair, or merge decisions again.

### Coordinator

The coordinator is deterministic glue, not a governance layer. It verifies the
current integration tip and configured remote, assembles only relevant
context, creates isolation, chooses the risk lane and exact commands, routes
one candidate to one reviewer, serializes integration, and returns genuine
exceptions. It does not author product repair commits when an implementation
agent can repair its own bounded candidate.

### Implementation agent

One implementation agent owns the complete bounded slice. It reproduces the
behavior, changes only allowed files, runs focused checks, and presents the
branch diff as the candidate.

### Independent review agent

One fresh agent reviews yellow work and any candidate that changes production
code. It leads with defects, missing tests, weakened safety invariants, scope
drift, and verification gaps. Green documentation or tests-only work needs no
review unless the specification requires it. The reviewer does not share the
implementation agent's reasoning context; it receives the specification,
relevant contracts, diff, and verification evidence.

## Bounded Context Assembly

Give a worker only what it needs to execute the specification:

1. `AGENTS.md`, this contract, and the project skill.
2. The approved executable specification.
3. Nested instructions inside the allowed subsystem.
4. The named source, public contracts, nearby tests, and dependency manifests.
5. Exact targeted and integration commands.
6. The current base commit and relevant branch diff.

Do not include historical factory registries, claims, amendments, freezes,
acceptance matrices, mission history, readiness logs, unrelated plans,
unrelated worktrees, or the optional reference articles. Expand context only
when a concrete dependency or failing check requires it.

## Isolation And Git State

- Verify the current integration branch and configured remote before branching.
  At this cutover the integration branch is `neo`, tracking `origin/neo`.
- Use one task-scoped branch and an isolated worktree. Never overwrite a dirty
  checkout or inspect unrelated parked worktrees.
- Commit coherent product changes. A permanent failing-test commit is optional
  only when preserving a difficult or safety-critical reproduction materially
  improves recovery.
- Do not reconstruct accepted work by copying commits. Use normal merge or
  fast-forward integration so ancestry, the specification, candidate commits,
  and repairs remain inspectable.
- After interruption, reconstruct with the approved specification, branch
  name, `git status`, `git log`, `git diff <integration>...HEAD`, and rerun the
  named checks. No parallel lifecycle ledger is needed.

## Automated Backpressure

During implementation, run the smallest checks that can reject the current
mistake: the focused test, typecheck for the touched package, lint, build, or a
specific contract check. Let the implementation agent self-correct routine
failures.

For intentionally verbatim source snapshots, verify exact content hashes and
exclude only those named immutable files from formatting checks. Never rewrite
preserved source bytes merely to satisfy a whitespace formatter.

At the integration boundary, update against the latest integration tip and run
the specification's broader verification once. The repository default is:

```bash
npm run verify
```

If the integration branch has known unrelated failures, use the latest
recorded baseline and CI result. The candidate may integrate only when targeted
checks pass and broad verification adds no failure or worsens no recorded
failure. Record a baseline once; do not make each product task rediscover it or
silently relabel a new regression as old debt.

CI in `.github/workflows/verify.yml` observes the real integration branch.
Local targeted checks accelerate repair; CI and integration verification are
the final automated backpressure.

## Risk Lanes

### Green

Applies to documentation, tests, mechanical refactoring,
dependency-neutral maintenance, isolated well-tested defects, and
behavior-neutral cleanup.

Flow: implementation agent → focused checks → independent review only when
production code changes → integration verification → automatic integration.

### Yellow

Applies to ordinary product behavior, UI and domain features,
non-destructive APIs, reversible internal schema additions, and bounded
cross-package changes.

Flow: approved specification → test-first implementation → focused and
cross-boundary checks → independent review → bounded repair when necessary →
integration verification → automatic integration.

### Red

Applies to credentials or secret handling, authentication and trust
boundaries, destructive or irreversible migrations, production routes,
external side effects, PRR sends, legal actions, publication or releases,
data-loss risk, and genuinely new product or scope decisions.

Agents may prepare, test, and review red work. The exact exceptional,
irreversible, or externally acting step must be presented to the user with its
evidence and rollback boundary before execution.

## Autonomy Posture

Level 3 means the delivery line can autonomously implement, verify, review,
repair, integrate, and observe green or yellow work inside predefined
guardrails. It describes how far the line runs without human coordination; it
does not turn a task into a program, require multiple agents, or add lifecycle
artifacts. Red boundaries remain human-gated regardless of autonomy level.

## Repair And Exception Routing

Two focused repair attempts are the default maximum for one candidate. A
focused attempt addresses a concrete failing check or review finding within the
approved scope. After two failed attempts, preserve the branch and evidence and
return an exception to the coordinator. The coordinator may narrow context,
replace the implementation agent, or change tactics within the same approved
specification.

Ask the user only when continuation requires a new product or scope decision,
a changed safety invariant, credentials, an irreversible or data-loss choice,
or acceptance of changed external behavior. Dependency absence, repeated
verification failure, and ordinary merge conflicts are coordinator exceptions
unless resolving them would require one of those human decisions.

## Product Safety Invariants

The thin development process does not weaken Cestus product controls:

- the product ledger remains append-only;
- corrections and reversals remain new product events;
- evidence provenance and accepted-graph traceability remain mandatory;
- projections remain rebuildable from the product ledger;
- stored approvals are revalidated when consumed;
- diagnostics and boundaries remain secret-safe and fail closed;
- PRR sends and legal actions remain human-gated;
- destructive operations retain explicit safeguards;
- portable or canonical storage never falls back to an unintended write path.

These are product data and execution invariants. Do not mirror them into a
development event-sourcing system.

## Mandatory Overhead Limits

- One implementation agent and one independent reviewer by default; no swarm
  for an ordinary slice.
- At most two focused repair attempts.
- One durable product specification per slice.
- No ordinary-task claim, amendment, registry entry, factory lifecycle event,
  or factory-only commit.
- No events for commands, polling, retries, waiting, unchanged state, or
  reviewer heartbeats.
- No duplicated source of truth and no executable JavaScript embedded in
  mission JSON.
- No mandatory permanent failing-test commit.
- Targeted checks during implementation; broad verification once at
  integration or when the risk specifically requires it.
- No full-repository re-audit, historical-worktree inventory, shadow
  activation, selector migration, or differential acceptance encyclopedia.
- No human approval after kickoff for bounded green or yellow work.
- No prospective implementation of optional accelerators. Automate a repeated
  step only after real runs show the repetition is costly or unsafe.
- Factory improvement work consumes no more than 10–15% of development
  capacity after cutover. A future factory change requires evidence from a
  failed, unsafe, or inefficient real product run.

## Integration Decision

A candidate qualifies for automatic green/yellow integration when:

1. it remains within the approved specification and risk lane;
2. required focused checks pass;
3. required independent review has no material unresolved finding;
4. no more than two repair attempts were used;
5. integration verification passes or matches a recorded unrelated baseline
   without a new regression;
6. the latest integration tip introduces no unresolved overlap; and
7. no red action is being executed.

Integrate with normal Git ancestry, push only the configured remote, and
observe CI. The final commit plus the handoff's exact verification results are
the durable delivery record.

## Historical Factory Implementations

Factory V1 and Factory V2 are preserved as history and have no operating
authority after this cutover.

V1 records include `docs/agentic/contracts/software-factory-mission-state.v1.json`,
its checker and tests, the bounded-assurance contracts, historical claims,
registries, freezes, acceptance matrices, calibration specs/plans, and the
replaced readiness log formerly stored in this file. They are optional
diagnostics or historical evidence only and are absent from the default gate.

V2 remains preserved at the verified cutover tips
`afcbe1a69dacd8312aff152d74048b00a36222e8` on
`codex/software-factory-v2` and
`60c29d2f77a22fc4880c05d6535aa85f6f0750d2` on
`codex/software-factory-v2-coordinator`, including its mission schemas,
lifecycle-event schema, projections, runner profiles, transition table, scope
freeze, migration anchor, acceptance matrix, claim, registry, spec, plan, and
baseline. It was never activated on `neo` and must not be merged, completed,
shadowed, or consulted by ordinary product tasks.

The optional philosophical synthesis is
`docs/agentic/references/software-factory-principles.md`. Its linked article
snapshots are preserved source material, not workflow authority or required
worker context.

## Measuring The Factory

For a completed slice, report only elapsed specification-to-integration time,
human interactions after kickoff, repair attempts, targeted and integration
verification duration, review findings, factory-only artifacts/commits, and
whether Git restart reconstruction succeeded. Do not build a metrics platform.
Success is reliable product delivery, reduced human attention, short cycle
time, low repair cost, and reversible integration—not factory-document volume.
