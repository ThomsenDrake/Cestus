# Evidence-Backed Report Draft And Public-Safe Preview

Status: approved.

## Desired Behavior

The resident agent can assemble a local report packet from accepted facts,
reviewed claims and notes, sourced timelines, contradiction candidates, PRR
history, and governed evidence. The packet contains an outline, draft sections,
citation map, unresolved-risk notes, excluded-evidence list, and public-safe
export preview. It remains local and unpublishable until separate human export,
sensitive-opt-in, and legal gates are satisfied.

## Observable Acceptance Examples

- Every factual draft passage maps to accepted assertion or reviewed-claim
  references and evidence/content hashes; missing citations block readiness.
- Unresolved contradictions and uncertainty appear as risk notes rather than
  being smoothed into confident prose.
- Default preview excludes evidence that is not currently `public_safe` and
  lists excluded IDs/categories without leaking the restricted content.
- Including private, source-protected, legal-risk, or export-restricted
  evidence produces an exact human opt-in requirement and does not change the
  preview until that separate decision is valid.
- The packet and citation map reconstruct identically from ledger and mounted
  derivative artifacts after restart.
- No standard test writes a shareable export, publishes, invokes a provider,
  or exposes raw secret/private material in a browser DTO.

## Allowed Scope

- Report-builder workflow, governed context, handoff, artifact, and runner
  files under `packages/agent/src/**` plus focused tests.
- Existing governance export-filter/read APIs under `packages/ontology/src/**`
  only where a missing safe preview interface blocks this vertical.
- Narrow local-runtime report handoff DTOs and Agent cockpit preview rendering
  plus focused tests.
- No durable external export, publication, legal action, credential/provider
  use, sensitive opt-in consumption, or factory changes.

## Relevant Context Entry Points

- `AGENTS.md`
- `packages/agent/src/specialist-workflows.ts`
- `packages/agent/src/specialist-runner-kernel.ts`
- `packages/agent/src/specialist-handoffs.ts`
- `packages/ontology/src/governance-projection.ts`
- `packages/ontology/src/jsonld-export.ts`
- `packages/ui/src/agent/AgentRunCockpit.tsx`

## Risk Lane

Yellow. The implementation produces local drafts and previews only; every
external, sensitive, legal, and publication action remains outside the slice.

## Targeted Verification

- `npm test -- packages/agent/test/specialist-workflows.test.ts packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/specialist-handoffs.test.ts`
- `npm test -- packages/ontology/test/governance-export.test.ts packages/ontology/test/governance-projection.test.ts packages/ui/test/agent-run-cockpit.test.tsx`
- `npm run typecheck`

Success means citations, exclusions, replay, and all human gates remain intact.

## Integration Verification

Run `npm run verify` against the latest `neo` and add no failure beyond
`docs/agentic/baselines/2026-08-01-integration-verification.md`.

## Escalation Conditions

Escalate for actual export/publication, sensitive-evidence opt-in, legal action,
provider/credential use, new report product behavior, weakened provenance or
governance, unavailable dependency, or the same failure after two focused
repair attempts.
