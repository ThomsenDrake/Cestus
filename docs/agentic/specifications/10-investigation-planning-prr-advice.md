# Investigation Planning And PRR Advice

Status: implemented product-behavior reference.

## Desired Behavior

The resident agent can turn reviewed evidence gaps, timeline uncertainty,
contradiction candidates, accepted graph context, and current request posture
into a local investigation plan and PRR-advice bundle. It may propose tasks,
request drafts, narrowing options, deadline review, fee/stalling notes, and
safe next steps, but it cannot create an external task in another system,
crawl a portal, send correspondence, or unlock legal escalation.

## Observable Acceptance Examples

- A scoped investigation run produces prioritized gap IDs, linked evidence,
  timeline and contradiction references, rationale, dependencies, and local
  task suggestions.
- A PRR-advice run produces a request-linked draft artifact, deadline and
  jurisdiction references, narrowing or fee options, unresolved questions,
  and an exact send-approval request when an external message is proposed.
- Legal-pressure material remains locked review content until the existing
  human legal gate is satisfied; this slice never consumes that action.
- Plans and drafts contain hashes and provenance and remain advisory after
  replay; memory cannot silently turn them into accepted fact.
- A stale request projection, missing jurisdiction pack, missing evidence, or
  governance lock produces a browser-safe blocked handoff.
- Standard tests use local/fake execution and make no network or provider call.

## Allowed Scope

- Investigation planner and PRR negotiation workflow/runner/context/handoff
  files under `packages/agent/src/**` and focused tests.
- Existing PRR read/draft boundaries under `packages/prr/src/**` only where a
  missing safe interface blocks the vertical, plus focused tests.
- Narrow local-runtime runner composition and Agent cockpit rendering plus
  their focused tests.
- No portal crawling, external task system, mailbox, correspondence send,
  legal action, credential, accepted graph review, or factory change.

## Relevant Context Entry Points

- `AGENTS.md`
- `packages/agent/src/investigation-planner-workflow.ts`
- `packages/agent/src/prr-negotiation-workflow.ts`
- `packages/agent/src/prr-context-packs.ts`
- `packages/agent/src/specialist-runner-kernel.ts`
- `packages/prr/src/read-api.ts`
- `packages/prr/src/deadlines.ts`

## Risk Lane

Yellow. All outputs are local drafts and advisory suggestions; exact external,
legal, credential, and provider actions remain excluded.

## Targeted Verification

- `npm test -- packages/agent/test/investigation-planner-workflow.test.ts packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/test/prr-context-packs.test.ts packages/agent/test/specialist-runner-kernel.test.ts`
- `npm test -- packages/prr/test/deadlines.test.ts packages/prr/test/escalation-gate.test.ts packages/local-runtime/test/agent-runtime-specialist-runners.test.ts`
- `npm run typecheck`

Success means the artifacts are provenance-bound, proposal-only, and blocked
before every external or legal effect.

## Integration Verification

Run `npm run verify` on the latest `neo` with no regression relative to the
recorded baseline.

## Escalation Conditions

Escalate for new investigation scope, live portal/mail/provider use,
credentials, PRR send, legal action, external task creation, accepted truth
mutation, unavailable dependency, or two failed focused repairs.
