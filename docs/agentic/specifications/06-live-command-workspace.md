# Live Command Workspace

> **Development authority:** This is a non-authoritative product-requirement
> source. Historical status, execution, role, risk, repair, review, integration,
> and verification text below does not govern current work. Follow \`AGENTS.md\`,
> Compound Engineering, and \`SECURITY.md\`.

Status: implemented product-behavior reference.

## Desired Behavior

The Cestus Command screen is the investigator's runtime-backed daily entry
point. It presents urgent PRR work, new evidence, ingestion and projection
diagnostics, ontology gaps, resident-agent status, and safe next actions in the
approved Tactical Product Console visual language. Fixtures remain test inputs
only; production rendering must not claim healthy or urgent state that the
local runtime did not provide.

## Observable Acceptance Examples

- Command metrics and priority rows are derived from injected or HTTP runtime
  DTOs for PRR, evidence/ingestion, ontology/operator status, and resident agent.
- Selecting a priority row shows source IDs, timestamps, confidence or deadline
  basis, provenance references, uncertainty, and a supported next action.
- If one subsystem is unavailable, the remaining verified sections render and
  the failed section displays a safe degraded diagnostic; no demo fixture fills
  the gap.
- Navigation opens every implemented module and marks no unavailable module as
  operational.
- Desktop and mobile layouts preserve priority scanning, keyboard selection,
  visible focus, reduced motion, and text labels in addition to signal colors.
- Visual contract tests preserve hard geometry, tactical signal tokens, no
  protected fictional names/symbols, no generic slate/blue theme, and no
  unreadably small body copy.

## Allowed Scope

- `packages/operator-status/**` for missing aggregate read contracts only.
- `packages/local-runtime/src/operator-status*` and focused tests.
- `packages/ui/src/workspace/**`, the minimum integration in
  `packages/ui/src/App.tsx`, `packages/ui/src/styles.css`, and focused UI tests.
- Do not change PRR, ingestion, ontology, governance, or agent domain truth;
  consume their existing browser-safe read boundaries.

## Relevant Context Entry Points

- `AGENTS.md`
- `packages/ui/src/workspace/command-model.ts`
- `packages/ui/src/workspace/command-fixtures.ts`
- `packages/ui/src/workspace/OpsShell.tsx`
- `packages/local-runtime/src/operator-status.ts`
- `packages/ui/src/App.tsx`

## Risk Lane

Yellow. This is an ordinary cross-boundary read-model and UI integration with
no external or irreversible effect.

## Targeted Verification

- `npm test -- packages/operator-status/test/contracts.test.ts packages/local-runtime/test/operator-status.test.ts packages/local-runtime/test/operator-status-routes.test.ts`
- `npm test -- packages/ui/test/command-model.test.ts packages/ui/test/dashboard.test.tsx packages/ui/test/shell.test.tsx packages/ui/test/visual-contract.test.ts packages/ui/test/app-smoke.test.tsx`
- `npm run typecheck`

Success means runtime state, degraded state, accessibility, and visual
contracts all pass without production fixture fallback.

## Integration Verification

Run `npm run verify` against the latest `neo` and introduce no failure relative
to `docs/agentic/baselines/2026-08-01-integration-verification.md`.

## Escalation Conditions

Escalate only for a genuinely new navigation or product-information decision,
changes to a domain safety/truth contract, external service or credential use,
new dependency unavailable to the repository, or the same failure persisting
after two focused repair attempts.
