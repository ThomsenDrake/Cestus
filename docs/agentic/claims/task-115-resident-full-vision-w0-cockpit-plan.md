# Task 115 Claim: Resident Full-Vision Wave 0B Cockpit Implementation Plan

- Approved umbrella design:
  docs/superpowers/specs/2026-07-12-resident-agent-full-vision-program-design.md@c7dc10b9dd351fc76df083df8f2222252ba73d89.
- Approved program plan:
  docs/superpowers/plans/2026-07-12-resident-agent-full-vision-program-implementation.md@0b5726ec975bdc0aae97e540472ef3be4379b358.
- Approved Lane U design:
  docs/superpowers/specs/2026-07-12-resident-agent-cockpit-design.md@754f89466a8321f853b60f4465a989e3bff03d89.
- Task/lane/wave: Task 115 / U / Wave 0B cockpit implementation plan.
- Worker: fresh Codex Task 115 cockpit-plan author.
- Branch/worktree: codex/task-115-resident-full-vision-w0-cockpit-plan /
  /home/drake/.codex/worktrees/task-115-resident-full-vision-w0-cockpit-plan.
- Base commit: beff02c05d3472cc79e7ccf411f77c33b7b64342.
- Restart authorization: RV-0-U-005 supersedes only RV-0-U-004 stopped-before-edit execution.
- Model configuration: user-confirmed host-reported GPT-5 satisfies required GPT-5.6 Terra / Extra High.
- Status: ready-for-review. The scoped plan, documentation audit, whitespace,
  factory, and full verification gates are complete; a different fresh review
  and the coordinator's integration decision remain required.

## Ownership And Stop

This task creates only:

- docs/superpowers/plans/2026-07-12-resident-agent-cockpit-implementation.md
- docs/agentic/claims/task-115-resident-full-vision-w0-cockpit-plan.md

Every other tracked file is forbidden, including production, test, runtime, UI,
provider, shared-contract, specification, registry, template, and acceptance
files. This work order permits one documentation plan/claim commit, then a
different fresh review. It does not authorize CF-1, Tasks 131 or 141,
production/provider/browser/tailnet work, worker dispatch, rebase, integration,
or merge into neo.

The coordinator explicitly permits Task 115 documentation work using
superpowers:subagent-driven-development where relevant, documentation RED/GREEN
as TDD, fresh review, and verification-before-completion. Stop and return
structured evidence for data-loss/fallback risk, schema/file-owner conflict,
credential/external dependency need, secret exposure, external-effect expansion,
or repeated verifier failure. Repair exhaustion is the coordinator root-cause
checkpoint, not a user prompt.

## Documentation RED Evidence

Before the plan existed, the focused planned audit exited 1 because the file
was absent.

~~~text
ENOENT: no such file or directory, open
'docs/superpowers/plans/2026-07-12-resident-agent-cockpit-implementation.md'
documentation-red-exit=1
~~~

The command read the required plan and required anchors for plain-own-data
parsing, exact supported-command binding, no browser secret field, local-only
provider setup, exact task/attempt/run, handoff readback, one resident identity,
and CF-1. The missing file accurately proves the plan and these requirements
were absent before this documentation change.

## Documentation GREEN And Verification Record

- The embedded Task 115 section-local audit exited 0 and printed: GREEN: Task
  115 cockpit plan audit passed (36 direct local mutations rejected). Its loop
  directly removed every safety/provenance/no-secret/no-effect row and required
  the scoped validator to reject it.
- Whitespace: git diff --check exited 0 with no output.
- Factory: npm run factory:check exited 0 and printed factory-readiness passed.
- Initial full verification correctly failed before typecheck with exit 127 and
  sh: line 1: tsc: command not found. The isolated worktree had no installed
  dependencies; npm ci restored lockfile-pinned ignored dependencies without
  tracked-file changes.
- Full verification rerun: npm run verify exited 0. Typecheck passed; 189 test
  files passed with 3 skipped; 2,228 tests passed with 5 skipped; Vite built
  successfully with the existing chunk-size warning; and factory-readiness
  passed.
- Scope/self-review: exactly the two permitted new tracked documentation files
  are present. The plan remains pre-CF-1, reserves only future Task 131/141
  files, specifies no shared schema as canonical, and authorizes no provider,
  browser, tailnet, UI, runtime, production, or external-effect work.
- Live-provider gate: not-applicable. No secret, credential, provider,
  browser, tailnet, or production invocation occurred.

## Handoff

On passing documentation GREEN and repository gates, commit only the two owned
files and stop for a different fresh reviewer. The author neither self-reviews
nor merges; the visible coordinator alone records review and integration state,
and never integrates this child into neo without explicit instruction.
