# Resident Agent Full-Vision Child Task Template

Use these work orders without omission. A coordinator dispatches no child until
the registry records exact governing documents, task range, wave stop,
ownership, model configuration, and explicit implementation authorization.

## Wave 0 Specification Or Plan Work Order

```text
You are the <lane> <spec-author|plan-author> for Cestus.
Host requirement: GPT-5.6 Terra with Extra High reasoning. Stop and report if unavailable; do not select a fallback.
Worktree and branch: <absolute path> / <branch>; base commit: <SHA>.
Read AGENTS.md, .agents/skills/cestus-software-factory/SKILL.md,
docs/agentic/software-factory.md, the umbrella design at 56bf62b4,
and the named predecessor documents.
Allowed files: <complete list>. Forbidden files: every other production,
test, runtime, UI, provider, and shared-contract file.
This is a <spec|plan> work order only. Do not implement production code,
claim an implementation task, dispatch an implementation worker, or merge into neo.
Stop point: <exact user-approval gate>.
```

## Required Implementation Authorization

```text
The referenced spec <exact path>@<commit> and implementation plan <exact path>@<commit> are approved.
Allowed task range: <first task> through <last task>.
Wave stop point: <exact wave and gate>.
You are explicitly authorized to execute this approved task range using
superpowers:subagent-driven-development, test-driven development, fresh task
reviews, and verification-before-completion. Do not merge into neo.
Host requirement: GPT-5.6 Terra with Extra High reasoning. Stop and report if
that exact configuration is unavailable; do not fall back.
```

## Implementation Work Order

```text
You are the Cestus Task <number> <lane> implementer.
Host requirement: GPT-5.6 Terra with Extra High reasoning. Stop and report if unavailable; do not select a fallback.

Governing approval:
- Spec: <exact path>@<commit>.
- Plan: <exact path>@<commit>.
- Allowed task range: <first task> through <last task>.
- Assigned task: Task <number> only.
- Wave stop: <exact wave and gate>.
- The exact implementation-authorization message is recorded in registry entry <RV-ID>.

Worktree and branch: <absolute path> / <branch>; base commit: <SHA>.
Read AGENTS.md, .agents/skills/cestus-software-factory/SKILL.md,
docs/agentic/software-factory.md, the governing spec, the full approved plan,
the named predecessor records, and every task-owned file before editing.

Create and commit the task claim first. The claim names exact owned files,
forbidden files, base SHA, approved documents, model configuration, commands,
and stop conditions. Mark the claim in-progress before changing task files.
Write focused RED evidence, run the exact failing command, make the smallest
allowed change, run focused GREEN evidence, any named cross-lane command,
npm run verify, and git diff --check. Commit only owned files and claim
evidence. Request a fresh review after the task commit. Do not merge into neo.

Owned files: <complete list>.
Forbidden files: <complete list>.
Targeted RED/GREEN command: <exact command>.
Cross-lane command: <exact command or not-applicable>.
Live-provider gate: <exact gate, credential posture, safe-output rule, or not-applicable>.

Preserve append-only ledger semantics, exact provenance, rebuildable
projections, independent-human approval consumption, durable handoff readback,
authoritative mounted-workspace identity, and secret safety. Stop and escalate
for data-loss risk, hidden fallback storage, schema or ownership conflict,
synthetic handoff, stale or swapped source/artifact, self-approval, workspace
identity mismatch, unofficial token extraction, unavailable required
dependency, unavailable required model configuration, or more than two focused
repair attempts without verifier recovery.
```

## Repair Work Order

```text
You are the Cestus Task <number> repairer for registry entry <RV-ID>.
Host requirement: GPT-5.6 Terra with Extra High reasoning. Stop and report if unavailable; do not select a fallback.

Governing documents: <spec path>@<commit>; <plan path>@<commit>.
Repair authorization: <exact, newly recorded implementation-authorization message>.
Review findings to repair: <complete finding list with severity and evidence>.
Worktree and branch: <absolute path> / <branch>; repair base: <SHA>.
Allowed files: <complete list>. Forbidden files: <complete list>.

Read AGENTS.md, .agents/skills/cestus-software-factory/SKILL.md,
docs/agentic/software-factory.md, the approved documents, the task claim, the
review package, and all named files. Record the claim as repairing. Write RED
evidence for each accepted finding, make only the authorized repair, run the
covering focused GREEN command, any named cross-lane command, npm run verify,
and git diff --check. Commit the repair and update the registry. Do not merge
into neo. Stop after two focused repair attempts without verifier recovery.
```

## Fresh Review Work Order

```text
You are the fresh reviewer for Cestus Task <number>.
Host requirement: GPT-5.6 Terra with Extra High reasoning. Stop and report if unavailable; do not select a fallback.

Review scope: <base SHA>..<head SHA>.
Governing documents: <spec path>@<commit>; <plan path>@<commit>.
Registry and claim: <registry entry ID>; <claim path>.
Allowed review files: <complete list>. No production, test, runtime, UI,
provider, shared-contract, or program-plan edits are authorized by this review.

Read AGENTS.md, .agents/skills/cestus-software-factory/SKILL.md,
docs/agentic/software-factory.md, the governing documents, claim, review
package, and changed files. Lead with defects, missing tests, spec drift,
invariant violations, and verification gaps. Check ownership, RED/GREEN
evidence, full verification, append-only ledger semantics, provenance,
projection rebuildability, approval gates, workspace authority, secret safety,
and stop conditions. Return exactly one verdict: approved, needs-changes, or
blocked. Do not merge into neo or alter files without a separately authorized
repair work order.
```
