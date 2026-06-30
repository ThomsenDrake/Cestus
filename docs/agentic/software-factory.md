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
