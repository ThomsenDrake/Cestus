# Cestus Executable Product Specification

Status: template. A copied specification must say `Status: approved` before an
agent starts implementation.

Replace the guidance below with concrete, directly testable content. Keep the
specification short enough for one generic coding agent to execute as a
complete bounded ticket. This is the only required task input artifact.

## Desired Behavior

Describe the user-visible or contract-visible outcome. State what changes and
what must remain unchanged.

## Observable Acceptance Examples

Give exact examples an agent can reproduce or assert. Prefer inputs and
expected outputs, visible UI states, API responses, durable records, or
before/after behavior over implementation instructions.

## Allowed Scope

List the subsystem and exact files or directories the agent may change. Name
explicit non-goals when nearby behavior must remain untouched.

## Relevant Context Entry Points

List only the repository instructions, source contracts, nearby tests, and
dependency manifests needed to begin. The worker may expand context only when
a concrete dependency or failing check requires it.

## Risk Lane

Choose one: Green, Yellow, or Red. Explain the risk in one sentence. For Red,
name the exact action that remains human-gated.

## Targeted Verification

List exact commands for implementation feedback and the expected success
signal.

## Integration Verification

List the exact broader command to run against the latest integration tip and
how to compare any recorded unrelated baseline failures.

## Escalation Conditions

List only conditions that require a new product/scope decision, changed safety
invariant, credential, irreversible or data-loss choice, changed external
behavior, unavailable dependency, or exception after two focused repair
attempts. Do not add routine approval checkpoints.
