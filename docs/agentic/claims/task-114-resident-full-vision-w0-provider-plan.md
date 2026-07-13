# Task 114 Claim: Resident Full-Vision Wave 0B Provider and Credentials Plan

- Approved umbrella design:
  \`docs/superpowers/specs/2026-07-12-resident-agent-full-vision-program-design.md@c7dc10b9dd351fc76df083df8f2222252ba73d89\`.
- Approved program plan:
  \`docs/superpowers/plans/2026-07-12-resident-agent-full-vision-program-implementation.md@0b5726ec975bdc0aae97e540472ef3be4379b358\`.
- Approved Lane P design:
  \`docs/superpowers/specs/2026-07-12-resident-agent-provider-credentials-design.md@285657a7879cdc47e321152c2bc5feb0ebe6088f\`.
- Task and lane: Task 114 / P / Wave 0B provider-plan structural recovery.
- Status: ready-for-review (host verification blocked; documentation contract
  and whitespace checks complete).
- Worker: fresh Codex Task 114 provider-plan recovery author.
- Branch: \`codex/task-114-resident-full-vision-w0-provider-plan-structural-recovery\`.
- Worktree: \`/tmp/cestus-task114-provider-structural\`.
- Base commit: \`aa06cb4792b5afdfec11bd5e520c787f2f654aa9\`.
- Model configuration: reported GPT-5; the coordinator/user has confirmed it
  satisfies GPT-5.6 Terra / Extra High for this task.

## Scoped Authorization And Ownership

The coordinator authorizes structural documentation recovery only: create this
claim and
\`docs/superpowers/plans/2026-07-12-resident-agent-provider-credentials-implementation.md\`,
run documentation RED/GREEN plus feasible verification, commit the two owned
files once, and stop for a fresh review. The authorization permits
\`superpowers:subagent-driven-development\`, documentation RED/GREEN as TDD,
fresh review, and verification-before-completion.

Tasks 126--130, 133, and 139; CF-1; production/provider/configuration/registry
work; credential provisioning; provider invocation; child dispatch; self-review;
and merge into \`neo\` remain forbidden. No file besides this claim and the
provider implementation plan is in scope.

## Documentation RED And Structural GREEN

RED ran before the plan existed:

\`\`\`bash
node --input-type=module --eval 'import { readFileSync } from "node:fs"; readFileSync("docs/superpowers/plans/2026-07-12-resident-agent-provider-credentials-implementation.md", "utf8")'
\`\`\`

Observed result: exit 1 with the expected \`ENOENT\` for the missing plan.

The plan's one section-local structural contract now uses exact heading
extraction and an explicitly keyed map of full Markdown rows. It requires
owner, interface, RED, GREEN, fresh-review, rollback, and acceptance entries;
strict secret-free portable state and no-fallback clauses; official Codex/xAI
posture; and separate deterministic versus coordinator-only live Nous evidence.
The GREEN command directly mutates each required local row and rejects any
variant accepted because of incidental wording elsewhere. The first GREEN
result was:

\`\`\`text
GREEN: Task 114 structural provider-plan contract passed (33 direct local mutations rejected).
\`\`\`

## Verification Evidence And Host Blocks

- Structural GREEN: PASS — the plan command reported 33 direct local mutations
  rejected.
- Factory readiness: BLOCKED — \`npm run factory:check\` exits 1 before
  evaluating plan content because the Node process cannot \`spawnSync git\`
  (\`EPERM\`), although direct shell \`git --version\` succeeds.
- Full verification: BLOCKED — \`npm run verify\` exits 127 immediately because
  \`tsc\` is not found and \`node_modules/.bin/tsc\` is absent. This task does
  not install or modify dependencies.
- Cached whitespace check: PASS after staging only the two owned files. A
  coordinator environment with unrestricted child-process creation and the
  lockfile-defined dependencies must rerun \`npm run factory:check\` and
  \`npm run verify\`.

## Required Stop Point

After one documentation commit, stop before Tasks 126--130, 133, or 139. A
fresh reviewer must lead with defects, missing tests, spec drift, and
verification gaps; the author cannot self-approve or self-merge.
