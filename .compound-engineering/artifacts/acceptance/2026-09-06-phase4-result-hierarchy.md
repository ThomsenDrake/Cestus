# Phase 4 comparison results hierarchy

The investigator could not immediately distinguish the actual comparison from
setup, source coverage, history, and saved notes. The result now occupies a
prominent first panel in the investigation workspace.

## Behavior

- **Comparison results** appears before setup and history. Its **Read comparison**
  action opens the latest completed result by recorded creation time; it only
  reads saved output. **Comparison history** retains explicit access to older
  results and pending-job controls.
- Opening a result moves keyboard focus and scroll position to the result panel.
  The summary comes first, followed by numbered possible patterns. Source
  passages expand beside the summary or pattern they support. Differences,
  challenges, ordinary explanations, and limitations remain visible.
- **Start a new comparison** opens case/question setup and the existing exact
  preview, approval, and run controls. Opening a saved preview or selecting a
  saved case set opens this disclosure too.
- The original question and examined scope remain available under disclosures.
  A separate **Investigation notebook** heading identifies the timeline, search,
  saved writing, and request history below the comparison.
- Provider instructions/output, authority filtering, source identities, and
  ledger data are unchanged. No provider invocation was made for this change.

## Evidence

An initial regression failed because the result entry panel did not exist.
The updated UI suite passes seven tests, including the new DOM order/focus
check and read-only opening of a completed result. Existing approval, citation,
correction, source dependency, and manual-record history checks still pass.

Built UI inspection at 1280×720 and 390×844 confirmed the prominent entry panel,
summary and pattern order, focused result panel at the top of the viewport,
and initially collapsed setup. Opening setup reveals the case/question controls.
Opening an older comparison from history closes setup, focuses the result,
and retains the evidence-change warning. Expanding summary sources exposes working
citation links; a link resolved to its real source and passage. No horizontal
page overflow occurred. This inspection used retained completed comparisons;
it did not run the provider or rewrite their historical prose.

Three CE simplification lenses completed. Removed a redundant copy of an
already filtered job list. Kept the bounded timestamp sort instead of adding
a custom maximum-reduction loop; no measured performance concern justified it.

CE code review completed with six local lenses and no actionable findings or
reported gaps. Receipt: `20260906-200534-results-first`. No external review
was routed. `npm run verify` passed after the final code change: 277 test files passed,
3 skipped; 4,221 tests passed, 5 skipped; typecheck, assurance checks, and the
production build passed. The test suite took 284 seconds. Existing TypeScript
source-map, Node local-storage, and bundle-size warnings were non-fatal.
The updated built demo was opened in the desktop browser; its runtime remains
running. No separate CE compound solution article was warranted for this
focused presentation change; the workflow and evidence are recorded here and
in the operator runbook.
Private browser screenshots and logs remain outside Git.
