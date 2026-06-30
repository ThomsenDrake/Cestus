# Cestus Software Factory

Cestus uses an autonomous software-factory workflow.

## Roles

- Worker: implements one task from the active plan.
- Reviewer: checks the worker's diff against the spec, tests, and plan.
- Gatekeeper: runs `npm run verify` and confirms no forbidden unfinished marker remains.

## Durable Task Claims

Concurrent workers claim tasks in repo-local files so the assignment survives chat context, process restarts, and worktree handoffs.

- Claim file path: `docs/agentic/claims/task-<number>-<short-slug>.md`.
- Claim before editing task files by creating the claim file and committing it with `chore: claim task <number>`.
- Include the plan path, task heading, worker identity, branch, worktree path, claimed-at timestamp in UTC, owned files, and current status.
- Use statuses `claimed`, `in-progress`, `blocked`, `ready-for-review`, `released`, and `merged`.
- A task is available only when no claim file exists for it, or when the latest committed claim status is `released`, `blocked`, or `merged`.
- Do not edit another worker's claim except to record a reviewer decision or coordinator handoff.
- Release a claim by changing its status to `released`, recording the reason, and committing that update before another worker takes over.

## Work Order Lifecycle

1. Claim one unchecked task using a durable task-claim file.
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
