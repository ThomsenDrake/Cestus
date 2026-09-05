# Phase 2 evidence foundation acceptance — 2026-09-05

Status: independently actionable implementation and synthetic acceptance verified. **Phase 2 is not fully accepted**: the selected real-record folder, required formats/scan scope, provider/endpoint/model, and authorized live evaluation budget were requested early and remain unanswered. No personal records or live provider were accessed.

## Baseline and implementation

Started from clean `neo` at `50ae1335`, confirmed to contain Phase 1 commits `beb7594f`, `4450303d`, and `3fe2f10b`. Work is on `codex/phase2-evidence-foundation`. The requested plan was absent in this checkout; its exact available copy from the sibling checkout was preserved in the configured CE artifact root, then bounded implementation design recorded. No roadmap rewrite, push, PR, deployment, correspondence, or external exposure occurred.

The human HTTP mount now has explicit import authority; the resident boundary keeps its existing lack of blob-write authority. Originals remain immutable and deduplicated with each occurrence recorded. Versioned extraction, evidence-ID authorization, governance-aware reads/search, a reader, persisted import review, and an explicit bounded provider invocation path are connected to the production host. Pure shared evidence and processing contracts live under `packages/ontology/src/`; no full ontology, case workflow, discovery engine, scheduler, or service manager was added.

## Actual built browser and production server

Used Chromium through agent-browser against the built Vite UI and the production local-runtime CLI at loopback port 28791. The disposable portable SQLite workspace, runtime config, copied fixtures, logs, and browser artifacts were under `/tmp/cestus-phase2-browser-mz05u21l`. Started from an empty environment with explicit runtime config, no development seed, and no injected runtime/adapters. Private one-use session URLs were consumed without recording their tokens in this artifact. All disposable browser and fixture servers were stopped after acceptance; existing unrelated processes were left alone.

- Registered and selected **Synthetic Phase 2 controls**, scanned the copied `test-data/phase2-records` folder, reviewed seven files/six canonical byte sequences/one duplicate, approved the displayed scan, and ran import through browser controls.
- Ran queued extraction. UTF-8 text, quoted CSV, and a valid two-page PDF succeeded. A truncated PDF, blank-page PDF control, and unsupported binary failed with safe, actionable outcomes. Poppler 26.08.0 performed actual PDF extraction. The blank-page control establishes honest rejection, **not scanned-page OCR**.
- Searched phrases absent from filenames: `cobalt lantern` navigated to text block 2; `silver observatory` to CSV row 2/cell 3; `amber bridge` to PDF page 2/block 1. Original text readback preserved the quoted script literally; `window.syntheticInjection` remained unset. Binary originals use an authenticated download.
- Restarted the production server, authenticated anew, reopened saved source review/import state and immutable citations. Browser acceptance exposed a non-first citation routing bug, fixed with App lifecycle regressions; the rebuilt UI opened the correct older record.
- Changed only the copied `record.txt`, rescanned, reviewed, approved, imported, and extracted. `violet compass` found the new version. The saved older evidence/extraction/block URL still displayed `cobalt lantern`. Seven canonical evidence items existed after this change; duplicate source occurrences remained attached to their original evidence identities.
- Recorded explicit initial human `public_safe` classification/review on a synthetic record through the UI. Missing provider configuration kept transfer controls disabled, with no fake fallback.
- Inspected desktop and 390×844 reading. Fixed overflowing readiness text and the fieldset's intrinsic minimum width; final document scroll width equaled 390px. Browser error collection was empty after the completed journeys.

Screenshots contain synthetic data only:

| Observation | Browser artifact |
| --- | --- |
| CSV search navigation to row 2/cell 3 | [CSV passage](phase2-evidence/csv-passage.png) |
| PDF search navigation to page 2 | [PDF passage](phase2-evidence/pdf-passage-final.png) |
| Searchable changed bytes | [New version](phase2-evidence/changed-version.png) |
| Prior citation still resolves | [Older extraction](phase2-evidence/old-citation-preserved.png) |
| Narrow-screen safe literal reading | [Mobile reader](phase2-evidence/mobile-passage-final.png) |
| Persistent processing failure | [Corrupt PDF](phase2-evidence/visible-failure.png) |
| Exact approved synthetic selection | [Transfer preview](phase2-evidence/synthetic-transfer-preview.png) |
| Completed unreviewed result with citation | [Transfer result](phase2-evidence/synthetic-transfer-result.png) |
| Submitted timeout remains uncertain | [Timeout recovery](phase2-evidence/synthetic-timeout.png) |

## Synthetic external-protocol acceptance

This is **not live-provider validation**. A separate loopback HTTP fixture at port 28792 returned a deterministic JSON summary/quote. The production host used its real environment-based configuration and HTTP transport, model label `synthetic-protocol-fixture`, a synthetic server-side credential, and operator-supplied test prices of $1 per million input/output tokens. No provider/runtime resolver was injected into the browser server.

The browser selected only text block 2 of the older extraction. Preview showed 742 bytes, a conservative 1,254 input-token bound, 512 maximum output tokens, estimated maximum $0.001766, and explicit per-invocation budget $0.01. Actual monetary cost was zero because the destination was the local fixture. Upstream request count remained **0 after preview**, **0 after approval**, became **1 after Run**, and remained **1 after production restart and result reopening**. Invocation `inv_d6a5d7bc68f14e79ab5a58bd4dbe185f` completed once. The result remained explicitly unreviewed and linked to the exact selected quotation. The server was restarted without provider configuration and could still read the persisted, currently authorized result.

A second browser evaluation used a deliberately nonresponding loopback fixture at port 28793. Invocation `inv_9c20047423364ad9a8963664b4617b58` used a separately previewed and approved selection/budget; after the real 30-second deadline its state became **uncertain**, with no result. After production restart the browser reopened that same uncertain job. The timeout endpoint count remained **1**, with no automatic retry or duplicate result. This was a synthetic timeout experiment, not a paid submission.

Production HTTP regression `packages/local-runtime/test/document-processing-journey.test.ts` separately verifies zero calls for unclassified, unapproved, restricted, and stale-after-policy-change selections; one fresh approved call; no repeat submission; unauthorized output 401; and persisted output after restart. Service/transport regressions cover timeout ambiguity, restart recovery, cancellation, concurrency, output/usage/response limits, and authorization revoked during awaited storage access. A submitted timeout is uncertain; no automatic paid retry is performed. Generic chat transport assumes no provider idempotency guarantee.

## Verification and review

- `npm run verify`: exit 0; typecheck passed; **4,017 tests passed, 5 skipped**, across **265 passed test files and 3 skipped files**; assurance checks passed; production build passed. Log during the session: `/tmp/cestus-phase2-verify-delivery.log`.
- Final UI check after small responsive fixes: **13 tests passed across 3 files**, and another production build passed. The real mobile browser confirmed those layout fixes.
- New regressions established failures before fixing local extraction execution/recovery, initial classification routing, delayed original responses, stale search snippets, non-first record/citation selection, post-read processing authorization, and detected-credential PDF original access. Existing resident-boundary, personal-session, and ingestion tests remained part of full verification.
- CE simplify reviewed reuse, quality, and efficiency. Shared locators and pure contract DTOs were centralized; redundant casts and obsolete ingestion provider controls were removed; polling waits for the previous refresh. Small-corpus replay remains deliberately direct.
- Native CE code review (cross-provider routing disabled) found five initial issues plus one subsequent routing interaction, all fixed with regressions and checked in bounded follow-up review. Final review reported no actionable findings. Review scratch: `/tmp/compound-engineering-1000/ce-code-review/20260905-091326-30b60418/`.
- CE compounding gate: no separate solution learning was warranted beyond the preserved plan, focused regression tests, and updated operational runbook; this acceptance record preserves observations and limitations rather than duplicating implementation explanations.

Build warnings included a large chunk and a browser-externalized Node module; tests also logged a missing dependency source map. All checks exited successfully. No large-corpus throughput, power-loss/disk-full recovery, real scans, or provider billing guarantee is claimed.

## Remaining user acceptance

1. Select and authorize a real source-folder path and required formats, including whether scanned pages are required. Only UTF-8 text/CSV and text-bearing PDFs are currently supported. OCR is not implemented.
2. Select the external provider's exact endpoint/model and authorize a bounded live selection and evaluation budget. Configure the private credential server-side, then perform the actual preview → approval → run → cited result journey. Live output compatibility, accounting, and provider behavior remain unverified.
3. Exercise the selected real corpus and any newly agreed formats, preserving the distinction between synthetic pipeline proof and real investigative usefulness.

Use `docs/personal-use.md` for complete startup, import/read/search, recovery, provider configuration, and approval instructions. Full ontology/cases/cross-case discovery/competing-explanation workflows remain outside this phase.
