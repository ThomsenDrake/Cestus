# Resident Supervision And Cockpit

> **Development authority:** This is a non-authoritative product-requirement
> source. Historical status, execution, role, risk, repair, review, integration,
> and verification text below does not govern current work. Follow \`AGENTS.md\`,
> Compound Engineering, and \`SECURITY.md\`.

Status: implemented product-behavior reference.

## Desired Behavior

The resident agent continues bounded local work under a supervised local
service while the browser is closed, and the Agent cockpit displays the
service's actual durable state. The user can see and invoke supported pause,
resume, retry, cancel, and exact-preview approval actions. Disconnecting or
changing the portable workspace stops new work and writes without inventing a
fallback continuation.

## Observable Acceptance Examples

- Closing the browser does not stop an admitted bounded local task; restarting
  the local runtime reconstructs its durable claim or resumable checkpoint.
- Disconnecting the portable workspace prevents new claims, provider calls,
  tool effects, and artifact writes and exposes `workspace-unavailable` with a
  safe next action.
- Reconnecting the same verified workspace resumes through normal recovery;
  connecting a different workspace identity remains blocked.
- The Agent cockpit shows wake state, next wake, task/run identity, selected-run
  plan and observation history, current approval, handoff artifacts,
  provenance, retry/cancel state, and workspace availability from runtime DTOs.
- The selected-run panels do not substitute the active queue run when detailed
  data is unavailable; they explicitly show the missing-data diagnostic.
- Approval binds the exact current preview and consumes no effect in React.

## Allowed Scope

- `packages/agent/src/wake-supervisor.ts`, scheduler/trigger/projection files,
  approval cockpit DTOs, and focused tests.
- `packages/local-runtime/src/wake-supervisor-runtime.ts`,
  `packages/local-runtime/src/portable-workspace-lifecycle.ts`, agent routes and
  handoff projection, plus focused tests.
- `packages/ui/src/agent/**`, minimum `packages/ui/src/App.tsx` integration, and
  focused UI tests.
- No new scheduler platform, provider credential work, external effect,
  accepted graph mutation, or factory control plane.

## Relevant Context Entry Points

- `AGENTS.md`
- `packages/agent/src/wake-supervisor.ts`
- `packages/local-runtime/src/wake-supervisor-runtime.ts`
- `packages/local-runtime/src/portable-workspace-lifecycle.ts`
- `packages/local-runtime/src/agent-handoff-projection.ts`
- `packages/ui/src/agent/AgentRunCockpit.tsx`
- `packages/ui/src/agent/AgentApprovalCockpit.tsx`

## Risk Lane

Yellow. This completes supervised local and UI behavior while retaining all
external, credential, destructive, and irreversible gates.

## Targeted Verification

- `npm test -- packages/agent/test/wake-supervisor.test.ts packages/agent/test/scheduler.test.ts packages/agent/test/approval-cockpit.test.ts`
- `npm test -- packages/local-runtime/test/wake-supervisor-runtime.test.ts packages/local-runtime/test/portable-workspace-lifecycle.test.ts packages/local-runtime/test/agent-handoff-projection.test.ts packages/ui/test/agent-run-cockpit.test.tsx packages/ui/test/agent-app-integration.test.tsx`
- `npm run typecheck`

Success means browser-independent recovery, disconnect fail-closed behavior,
and production-shaped cockpit state pass deterministically.

## Integration Verification

Run `npm run verify` against latest `neo` with no new failure relative to the
recorded integration baseline.

## Escalation Conditions

Escalate for a changed background-work product policy, network exposure or
authentication, credential access, external effect, hidden fallback writes,
data-loss recovery, changed approval authority, unavailable dependency, or two
failed focused repairs for the same cause.
