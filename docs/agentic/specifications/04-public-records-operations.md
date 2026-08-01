# Public Records Operations Workspace

Status: approved.

## Desired Behavior

Cestus provides a runtime-backed Requests operations board for drafting and
tracking public-records requests, deadlines, correspondence, fees, production,
denial, appeal posture, and diagnostics. It helps the investigator decide the
next action while keeping outbound sends and legal escalation behind exact
human gates. This slice prepares and tracks work but performs no external send.

## Observable Acceptance Examples

- Opening `Requests` loads current request projections grouped into the
  approved action lanes and does not fall back to demo requests on failure.
- Creating a draft through the six-step builder appends a replayable request
  event and the new draft appears after reload without a duplicate stream.
- A request detail view shows estimated versus confirmed deadline basis,
  correspondence summaries, fee/scope pressure, productions, evidence IDs,
  diagnostics, and event-backed timeline entries.
- A routine follow-up draft may be prepared from an estimated deadline, but
  the UI cannot arm an external send without review of the exact body,
  recipients, subject, citations, attachments, evidence, and provider state.
- Legal-pressure language remains locked until confirmed deadline or stalling
  basis, cited guidance, correspondence evidence, and explicit human
  confirmation are all present.
- Adapter, matching, projection, or pack errors render secret-safe diagnostics
  rather than silently changing request state.

## Allowed Scope

- `packages/prr/src/**` and `packages/prr/test/**`.
- Narrow PRR routes and adapters in `packages/local-runtime/src/**` plus focused
  tests.
- `packages/ui/src/requests/**`, minimum routing in `packages/ui/src/App.tsx`,
  and focused request UI tests.
- No live Gmail, IMAP/SMTP, Himalaya, mailbox credentials, external send,
  appeal filing, or legal action.

## Relevant Context Entry Points

- `AGENTS.md`
- `packages/prr/src/runtime.ts`
- `packages/prr/src/projection.ts`
- `packages/prr/src/read-api.ts`
- `packages/prr/src/deadlines.ts`
- `packages/prr/src/stalling.ts`
- `packages/ui/src/requests/RequestWorkspace.tsx`
- `packages/ui/src/requests/RequestDetailModal.tsx`

## Risk Lane

Yellow. This is ordinary reversible domain and UI work; all sends, legal
actions, credentials, and live-provider effects remain outside the slice.

## Targeted Verification

- `npm test -- packages/prr/test/lifecycle.test.ts packages/prr/test/deadlines.test.ts packages/prr/test/stalling.test.ts packages/prr/test/projection.test.ts packages/prr/test/read-api.test.ts packages/prr/test/escalation-gate.test.ts`
- `npm test -- packages/ui/test/request-board.test.tsx packages/ui/test/request-builder.test.tsx packages/ui/test/request-detail-modal.test.tsx packages/ui/test/app-smoke.test.tsx`
- `npm run typecheck`

Success means request state replays deterministically and no test performs an
external effect.

## Integration Verification

Run `npm run verify` against latest `neo` with no new failure relative to
`docs/agentic/baselines/2026-08-01-integration-verification.md`.

## Escalation Conditions

Escalate before any live mailbox/provider use, credential access, PRR send,
appeal or legal action, changed legal product claim, weakened approval gate,
irreversible migration, unavailable dependency, or the same concrete failure
remaining after two focused repair attempts.
