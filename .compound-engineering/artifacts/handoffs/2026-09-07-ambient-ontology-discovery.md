# Ambient ontology discovery: implementation handoff

Date: 2026-09-07. Resume from the merged `neo` containing this handoff; the finished comparison code was verified at `450cc424`. Fetch and inspect current Git state first. Follow repository `AGENTS.md` and `SECURITY.md`.

The [main product roadmap, Phase 4](../plans/2026-09-04-usable-investigation-product-plan.md#4-discover-patterns-and-gaps-across-the-shared-ontology-and-investigate-them) is the single roadmap. This handoff records reusable implementation and evidence, not another design plan.

## Settled direction and boundaries

Preserve the working manual comparison and its plain-language, results-first presentation. Next, review the whole eligible shared ontology across investigations in the background, surface recurring patterns **and source-grounded gaps within individual investigations**, and update persistent leads after meaningful evidence changes. A timer repeating the current first batch does not meet this requirement.

The user chose **Automatic within configured limits**: a durable, revocable standing permission should allow bounded Astra batches without approval for each batch. Use only the existing official ChatGPT subscription integration and exactly `gpt-6-astra`; no model or API-billing fallback. Configure actual scope, future-record policy, cadence and usage limits before enabling execution. This handoff authorizes no provider calls: the earlier six-attempt live acceptance allowance is exhausted. Phase 5 competing explanations, evidence pursuit and external actions remain separate.

## Reuse these production paths

Paths below are relative to the repository root.

| File | Existing responsibility and continuation constraint |
| --- | --- |
| `packages/ontology/src/case-comparison.ts` | `prepareCaseComparison`, examined context/fingerprints, shared identities, typed relationship/role structures and certain two-event sequences. Current “all” takes the first 12 eligible cases with 100-assertion/24-passage caps; no persisted whole-ontology cursor. Exact predicate matching is not semantic recall. |
| `packages/ontology/src/cross-case-output.ts` | Strict cited findings and provider instructions. Findings require multiple cases; unresolved questions are strings; the prompt excludes gap explanations. Add structured cited single-investigation leads with evidence for why something is expected and honest import/extraction coverage. |
| `packages/ontology/src/investigation-records.ts` | `InvestigationRecordsService`: additive saved records, edits, dismiss/reopen, source/dependency validation and stale findings. Reuse history; separate direct lead support from wider compared scope, and add stable lead identity to suppress duplicates and repeated notifications. |
| `packages/ontology/src/knowledge-{contracts,service,projection}.ts` | Authoritative reviewed ontology, identities, roles, occurrences, memberships, vocabulary and lineage. Keep tentative proposals separate from accepted knowledge. |
| `packages/local-runtime/src/document-processing.ts` | `DocumentProcessingService`: exact previews/manifests, per-run approvals, jobs, concurrency, source/revision revalidation and uncertain-submission recovery. Standing authorization must be distinct and revocable, with durable usage reservations; never simulate human approval. |
| `packages/ontology/src/document-processing-contracts.ts` | Existing processing manifest and job contracts. |
| `packages/local-runtime/src/investigation-http-routes.ts` and `evidence-content.ts` | Investigation controls and current citation/transfer authority. Comparison knowledge currently filters through external-transfer eligibility. Distinguish authorized local ontology coverage from information allowed to leave the machine or appear to a reader. |
| `packages/local-runtime/src/codex-document-provider.ts` | Existing isolated official subscription adapter. Preserve its model and approval boundaries. |
| `packages/local-runtime/src/wake-supervisor-runtime.ts`, `mounted-wake-lifecycle-store.ts`, and `packages/agent/src/wake-supervisor.ts` | Inspect existing leases, recovery and pause/resume primitives before adding lifecycle code. The local-fake execution path is not working ambient Astra discovery. Avoid another graph or generic agent platform. |
| `packages/ui/src/ontology/InvestigationWorkspace.tsx` and `SharedOntologyWorkspace.tsx` | Manual comparison, latest results first, numbered findings, working source links, notebook, timeline, requests/correspondence/responses and ontology correction. Preserve this experience while adding persistent leads. |

## Evidence to carry forward

- [Phase 4 acceptance](../acceptance/2026-09-06-phase4-cross-case-patterns.md): real public records and live Astra demonstrated an unnamed shared actor across two cases concerning the same procurement, grounded roles/time, citations and restart. They did **not** demonstrate independent unrelated recurrence. Clearly labelled synthetic cases plus live Astra demonstrated different-actor recurring relationships, a negative control, duplicate/shared-address/same-name distinctions, stale findings and exclusion. Certain multi-event sequences have automated fixture evidence only. Saved work products and manual request/response records survived restart.
- [Plain-language follow-up](../acceptance/2026-09-06-phase4-plain-language.md) and [result hierarchy follow-up](../acceptance/2026-09-06-phase4-result-hierarchy.md): focused review, UI/browser checks, responsive presentation and final full verification. New provider wording was not exercised with another live call; historical output remains unchanged.
- Final `npm run verify` passed at unchanged product-code commit `450cc424`: 277 test files passed / 3 skipped; 4,221 tests passed / 5 skipped; typecheck, assurance and production build passed. This publication adds documentation only; its PR CI supplies validation of the final publication commit. No skipped third-party review is evidence of completed review.
- Reuse regression files `packages/ontology/test/{case-comparison,investigation-records,investigation-record-dependencies}.test.ts`, `packages/local-runtime/test/{document-processing,investigation-http-routes}.test.ts`, and `packages/ui/test/investigation-workspace.test.tsx`. These do not establish ambient discovery, large-corpus recall, cross-batch coverage or automatic single-investigation gap detection.
- [Operator runbook](../../../docs/personal-use.md) describes the delivered browser workflow. Machine-local demo currently listens at `http://127.0.0.1:28873`; preserve its runtime and `/tmp/cestus-phase4.jqbjcvle` and `/tmp/cestus-phase4-controls.jde5b7av` workspaces. Their records, configs, hashes, conversions and browser evidence remain outside Git. Verify their current state before use; do not copy private evidence into commits or restart the demo unnecessarily.

## First useful checkpoint

Implement one vertical slice: after a relevant reviewed-knowledge change, the running local runtime uses an explicitly configured standing grant and reserved allowance to invoke Astra automatically and persist a cited lead visible after restart, with **no manual comparison click**. Establish failing evidence for authorization, revocation and restart-safe usage before changing those boundaries. Reuse current jobs, source checks and history; discovery's own events must not schedule an endless loop. Do not enable real transfers until the new grant and evaluation allowance are explicitly configured.

Then complete the roadmap's resumable whole-ontology/cross-batch coverage, structured gap, quiet/dismissed lead, correction, exclusion and browser-independent acceptance. Keep direct support separate from comparison coverage; do not equate absent assertions or analogy with a missing real-world event. Use labelled controls when real records cannot establish known answers, and record exactly which outcomes are live, real-record or controlled evidence.
