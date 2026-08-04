# Cestus Software Factory

Status: authoritative.

This is the operating contract for one approved Cestus product slice. The
approved specification is product and design authority; Git is durable
execution state; the branch and diff are the candidate. Tests, types, lint,
builds, contract checks, and CI provide backpressure. Humans decide genuine
exceptions and execute red-lane external or irreversible actions.

`$sol-advisor:orchestration` is the preferred coordinator and role router. It
composes with this lightweight contract and creates no Cestus plans, missions,
claims, registries, amendments, or lifecycle records.

## Delivery Line

```text
approved executable specification
→ bounded context and isolated worktree
→ Terra / High implementation
→ focused automated backpressure
→ fresh Sol verdict when commitment-boundary review is required
→ at most two focused repairs
→ primary Sol / High integration verification and acceptance
→ normal history-preserving integration or exact risk exception
```

No custom scheduler, mission service, event stream, projection, selector, or
registry is required.

## One Input Artifact

Every slice starts from one directly readable Markdown specification using
`docs/agentic/executable-spec-template.md`. It states desired behavior,
observable examples, allowed scope, relevant entry points, risk lane,
targeted and integration verification, and genuine escalation conditions. It
may link product contracts and source files, but is never a lifecycle database.

Approval supplies design authority. Do not add generic brainstorming,
design-reapproval, implementation-plan, program-management, or swarm
workflows unless an escalation condition exposes a genuinely new product
choice.

## Roles

### Builder

The builder defines product behavior, scope, and guardrails. Kickoff approval
bounds green and yellow work through integration.

### Primary Sol / High

Primary Sol / High owns architecture interpretation, primary verification,
acceptance, and integration. It routes work through `$sol-advisor:orchestration`,
keeps context bounded, serializes integration, and returns genuine exceptions.

### Terra / High

Terra / High is the sole native implementation lane. It owns one bounded
candidate, changes only allowed files, runs focused checks, and presents its
diff and evidence.

### Fresh Sol verdict

A fresh Sol verdict replaces the generic independent-review flow. It is needed
only at a commitment boundary: red work, consequential architecture,
migration, public API, or genuinely wide change. It receives the
specification, relevant contracts, diff, and verification evidence, and leads
with defects, scope drift, weakened safety controls, and verification gaps.

Luna task lane is never used unless explicitly requested.

## Bounded Context And Git State

Give the implementation lane only `AGENTS.md`, this contract, the Cestus
skill, the approved specification, instructions inside scope, named source and
tests, exact commands, base commit, and relevant diff. Do not add historical
claims, amendments, freezes, registries, acceptance matrices, mission records,
plans, unrelated worktrees, or optional references without a concrete need.

Use one task-scoped branch and isolated worktree. Verify the integration branch
and configured remote before starting; the integration branch is `neo`,
tracking `origin/neo`. Never overwrite a dirty checkout or inspect unrelated
parked worktrees. Normal merge or fast-forward integration preserves history;
never reconstruct accepted work by copying commits.

## Automated Backpressure

Run the smallest focused check that can reject the change. For verbatim source
snapshots, check hashes and exclude only named immutable files from formatting.
At the integration boundary, primary Sol / High updates against the current
integration tip and runs the specification's broader verification once. The
repository default is:

```bash
npm run verify
```

Known unrelated failures require the latest recorded baseline; a candidate may
not add or worsen one. CI in `.github/workflows/verify.yml` observes `neo`.

## Risk Lanes

### Green

Documentation, tests, mechanical refactoring, dependency-neutral maintenance,
isolated well-tested defects, and behavior-neutral cleanup.

Flow: Terra / High implementation → focused checks → integration verification
→ normal integration.

### Yellow

Ordinary product/UI/domain behavior, non-destructive APIs, reversible internal
schema additions, and bounded cross-package changes.

Flow: approved specification → test-first implementation → focused and
cross-boundary checks → bounded repair → integration verification → normal
integration.

### Red

Credentials, secrets, auth/trust boundaries, destructive or irreversible
migrations, production routes, external effects, PRR sends, legal actions,
publication/releases, data-loss risk, and genuine new product or scope choices.

Agents may prepare and test red work. The exact irreversible, externally acting,
or exceptional step stays human-gated. It receives a fresh Sol verdict.

## Repair And Exception Routing

No candidate receives more than two focused repair attempts. An attempt fixes
a concrete failed check or finding within approved scope. A correction can
receive the fresh Sol verdict its commitment boundary requires; this never
expands the two-focused-repair maximum. After two failed attempts, preserve the
branch and evidence and return an exception to primary Sol / High.

Ask the user only for a new product or scope choice, safety-invariant change,
credentials, irreversible/data-loss choice, or changed external behavior.
Dependency absence, repeated verification failure, and ordinary merge conflicts
are coordinator exceptions unless their resolution requires one of those
decisions.

## Product Safety Invariants

The delivery process never weakens product controls:

- the ledger remains append-only, and corrections/reversals are new events;
- provenance and accepted-graph traceability remain mandatory;
- projections remain rebuildable from the ledger;
- stored approvals are revalidated at consumption;
- diagnostics and boundaries remain secret-safe and fail closed;
- PRR sends and legal actions remain human-gated;
- destructive operations keep explicit safeguards; and
- portable or canonical storage never falls back to an unintended write path.

## Mandatory Overhead Limits

- One Terra / High implementation lane per ordinary slice; no swarm.
- Commitment-boundary review only uses a fresh Sol verdict.
- At most two focused repair attempts.
- One durable product specification per slice.
- No factory-only claims, amendments, registries, lifecycle events, plans, or
  commits; do not report polling, retries, waiting, unchanged state, or
  reviewer heartbeats.
- Targeted checks while implementing; broad verification once at integration
  unless the risk lane requires more.
- No re-audit, historical-worktree inventory, selector migration, or
  differential acceptance encyclopedia.
- No further human approval after green/yellow kickoff.

## Integration Decision

Primary Sol / High accepts a candidate only when it remains in specification
and risk lane, focused checks pass, any required fresh Sol verdict has no
material unresolved finding, no more than two repairs were used, integration
verification adds no regression over baseline, and the latest integration tip
has no unresolved overlap. Integrate with normal Git ancestry, push only the
configured remote, and observe CI.

## Historical Factory Implementations

Factory V1 and Factory V2 are preserved as history only. They are not present
as active artifacts, workflow authority, task context, or default gates.
Optional reference material remains non-authoritative. Git history is the only
archive for retired coordination artifacts and completed implementation plans.

## Reporting

Report only commits, changed files, check results, fresh Sol verdict findings,
integration status, or genuine exceptions. Do not create a metrics platform or
report polling, waiting, unchanged state, heartbeats, retries, or individual
commands.
