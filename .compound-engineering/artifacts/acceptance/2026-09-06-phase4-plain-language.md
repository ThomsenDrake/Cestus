# Phase 4 comparison language follow-up

The investigator found the working demo too self-referential: a new reader
should understand a comparison without knowing Cestus’s ontology model.

## Change

- Comparison instructions ask Astra to lead with people, organizations, actions,
  and the evidence, using source-backed names and case titles. Internal IDs stay
  in structured reference fields; reader-facing text explains uncertainty and
  source independence without database terminology.
- Investigation labels describe reviewed facts, source origins, similarities,
  evidence that challenges a pattern, and ordinary explanations. Changed
  evidence has an actionable review warning. Internal run IDs and original
  comparison metadata remain in expandable details.
- Supporting and contradicting fact links display descriptions, preserving
  their original navigation targets and a history fallback for withdrawn facts.
- Historical generated text is not rewritten. New instructions apply to new
  previews; no stored evidence, approvals, ledger events, fingerprints, or
  previously saved analysis were edited for this language change.

## Verification approach

This is a presentation and prompt-writing change. Existing UI regressions were
updated for changed labels; no new tests were added merely to assert copy.
The focused UI/comparison tests passed (16 tests), including separate preview,
approval, and run actions, working citation targets, uncertain dates, correction
warnings and disabled saving, and local record history. The pre-change built
page was captured privately for comparison.

Three CE simplification lenses identified the same repeated fact lookup;
a shared helper now performs one lookup and preserves the history fallback.
A memoized map was not needed for the bounded list. No new provider invocation
was made: the six-attempt Phase 4 acceptance cap remains exhausted. Future
Astra writing quality has not been demonstrated with a fresh live run.

## Runtime validation

`npm run verify` passed after the final code change: 277 test files passed,
3 skipped; 4,220 tests passed, 5 skipped; typecheck, the assurance script, and
production build passed. The full suite took 284 seconds. Existing source-map,
Node local-storage, and bundle-size warnings were non-fatal.

Built UI browser check: `#investigation` passed at 1280×720 and 390×844.
The historical real comparison opens, the new evidence-change warning is
visible, saving old analysis remains disabled, and a withdrawn supporting fact
still links to its history with readable fallback text. The cited passage link
opens the expected evidence document and page/block locator. No horizontal
page overflow at either width; no browser errors reported. This checks the
language presentation against retained real evidence, not a new model output.
Independent/derived source-label branches were reviewed statically; this real
demo exercises unknown source origins. Earlier Phase 4 lineage/deduplication
regressions remain in the full suite.

CE code review completed with six local lenses and no actionable findings.
Receipt: `20260906-192749-plain-language`. Cross-provider review stayed off.
The follow-up has no non-obvious engineering solution requiring a separate
CE compound solution article; the operator wording and verification are
recorded here and in the runbook.
Private screenshots, runtime logs, and authentication state remain outside Git.
