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

## Review follow-up — 2026-09-05

Continued the same branch from clean `c12c84fd`, after confirming `f82b80a7` and `71b9b9c9`. The earlier observations above describe the original run; this section supersedes its rejection of all textless PDF pages and its unmeasured search-readiness assumption. Real source-folder/format/scan and live endpoint/model/selection/budget requests remain unanswered. No personal-folder search, real records, live provider call, or paid timeout experiment occurred. **Phase 2 remains pending real-record and live-provider acceptance.**

### Fixed behavior and regressions

- Five production service/real HTTP transport characterization cases reproduced incorrect `uncertain` outcomes for explicit rejection or fully received invalid responses. A small safe adapter outcome contract now distinguishes explicit rejection, invalid completed response, and unknown completion. HTTP 400/401/403/404/405/406/410/413/415/422/429 → failed/provider-rejected; completed HTTP 200 with invalid JSON/envelope/usage → failed/invalid-output. Ambiguous statuses including 408/409/5xx/202/206, timeouts, disconnects/truncation, and response caps reached before EOF remain uncertain. No response bodies enter diagnostics. Neither failed nor uncertain means unbilled; neither is automatically resubmitted. Production HTTP regressions verify persistence, zero repeat submissions, and a fresh approval for retries.
- Three PDF characterization cases reproduced loss of readable pages. Local extractor 1.1.0 now records additive immutable per-page text coverage. Valid text/blank/text and text/raster/text fixtures retain page-3 citations; no-text pages are explicitly unextracted. A fully image-only fixture yields partial coverage and zero passages, not OCR success. `pdfimages -list` confirms the raster fixture has an actual page-2 inline 2×2 RGB image; the genuinely blank fixture has no images and an empty content stream. Cestus itself does not infer blankness from either. Text on every page still does not claim visual-content coverage. Reader, search cards, exact approval preview, and job labels carry this distinction.
- Completed legacy 1.0 outputs and citation IDs remain byte-identical. An old queued extractor fails with explicit scan → review → approve → import recovery, instead of falsely describing a new extractor as 1.0. Coverage-free legacy PDF derivatives remain readable with unknown coverage. New parse IDs distinguish the upgraded extractor.
- Search retains canonical-original and derivative hash reads every query, transactionally rebuilds disposable FTS, and rechecks every indexed document's current governance after awaited storage I/O. It now builds request-scoped projections instead of replaying the full ledger per document. Focused regressions check a revocation during storage reads removes both counts and snippets, unreadable originals/derivatives cannot return cached snippets, page-3 results carry partial coverage, and transfer selections bind that coverage.

### Measured search readiness

A separate disposable production HTTP server imported/extracted **100 synthetic UTF-8 documents, 1,240,176 original bytes, 6,000 passages**. No injected runtime or storage fake was used. Filenames were `record-000.txt` through `record-099.txt`; one paragraph contained `quartz transit exception`, all passages contained `municipal review`. Times use the same machine and collection; these are individual observations, not statistical throughput or capacity guarantees.

| HTTP operation | Before | After | Results |
| --- | ---: | ---: | ---: |
| First rare phrase query | 15,151 ms | 326 ms | 1 |
| Repeated rare phrase query | 14,134 ms | 266 ms | 1 |
| Common phrase query, paginated | 15,125 ms | 265 ms | 6,000 |
| No-match query | 14,370 ms | 235 ms | 0 |
| Evidence/extraction passage retrieval | 145 ms | 153 ms | correct passage |

Raw counts/times: [before](phase2-evidence/followup/search-before.json), [after](phase2-evidence/followup/search-after.json). The 14–15 second baseline prevented practical use even at this modest size, justifying the bounded replay reduction. No long-lived authorization cache, scheduler, incremental indexing framework, or large-corpus guarantee was added. Scratch measurement script/workspace: `/tmp/cestus-phase2-followup.gc9HEt/measure.mts` and `measurement-workspace`.

### Built UI and production acceptance

Used the installed agent-browser driver and Chromium against the built UI and production local-runtime CLI at **127.0.0.1:28795**, with an explicit private config, portable SQLite workspace, empty inherited environment, no development seed, and no injected runtime fakes. All records and credentials were synthetic under `/tmp/cestus-phase2-followup.gc9HEt`. The separate HTTP protocol fixture used loopback port **28796**. No running user workspace was changed.

| Journey | Result and evidence |
| --- | --- |
| Register/select/scan/review/approve/import/extract | Pass: six selected files, five canonical byte sequences, duplicate text occurrences retained; text and CSV readable, two mixed PDFs partial, corrupt PDF failed. |
| Blank and actual image-only middle pages | Pass: readable pages 1/3 retained, original page 2 visibly unextracted. [Blank control](phase2-evidence/followup/blank-reader.png), [image-page control and page-3 passage](phase2-evidence/followup/image-page3.png). This is coverage validation, not scanned-page reading/OCR. |
| Content phrase → search result → correct passage | Pass: `ochre windmill` (absent from filenames) opened image-containing PDF page 3/block 1; result and reader displayed page-2 gap. |
| Exact partial-document preview/approval | Pass: one selected page-3 passage plus coverage metadata; original PDF/image bytes excluded. 894 input bytes including instructions, 1,406 conservative input-token bound, 512 output-token cap, $0.001918 estimated maximum using synthetic $1/M rates, explicit $0.01 per-invocation budget. [Preview](phase2-evidence/followup/partial-preview.png). |
| Fully received invalid JSON | Pass: preview request count 0, approval count 0, Run count 1; invocation `inv_90a63cb2824b4a2bbd1733b72bda8f4d` became failed/invalid-output, with billing caveat and explicit retry. [Failure](phase2-evidence/followup/failed-output.png). Restart retained failed and count 1. |
| Explicit retry → cited result | Pass: new budget/preview/approval still count 1; Run count 2. New invocation `inv_d9e6a18d5895465db6be0639891a085c` completed once, 100 input/60 output tokens reported by local fixture; monetary cost actually $0. [Unreviewed cited result](phase2-evidence/followup/cited-result.png) linked to page 3. This does not establish real-provider response compatibility or billing. |
| Source changes and older citations | Pass: changed only disposable copied PDF, scanned/reviewed/approved/imported/extracted; `vermilion arch` opened new page 3. [New version](phase2-evidence/followup/changed-page3.png). Saved older evidence/extraction/passage URL still displayed `ochre windmill`. |
| Restart/reopen persisted work | Pass: fresh session reopened saved source review, older citation and failed job. A further restart without provider configuration reopened the completed cited result too; fixture count remained exactly 2. |
| Narrow reading | Pass after correcting long job-button wrapping: 390×844 viewport, document width 390px, no browser errors. [Narrow UI](phase2-evidence/followup/final-mobile-fixed.png). |
| Required real formats/records and actual live provider | Pending: exact authorized path, required formats/scans, endpoint/model, private credential configuration location, bounded live selection and budget absent. No scope change inferred. |

Production service/transport tests cover the larger rejection/ambiguity matrix and zero-request governance/approval denials. Local protocol evidence covers ambiguous timeout/restart behavior; no deliberately ambiguous paid experiment was attempted. Disposable browser/server processes were stopped after checking; source originals and append-only workspace history retained.

### Final checks

CE simplification reviewed reuse, quality, and efficiency: removed one now-unreachable search result-count fallback; retained all safety checks. Native read-only correctness/security review found no actionable findings. No automatic cross-provider review ran. The existing runbook, regression tests, and this acceptance record preserve the reasoning, so the CE compounding gate did not warrant a separate duplicate solution document.

Final `npm run verify` after the final responsive code change: **exit 0; typecheck passed; 4,047 tests passed, 5 skipped, across 266 passed test files and 3 skipped files; both assurance tests passed; production build passed**. Session log: `/tmp/cestus-phase2-followup.gc9HEt/verify-final.log`. Local implementation commits: `d42dcf46` (provider transport outcome contract) and `6afca116` (coverage, processing integration, measured search, UI, and regressions). No package lock or dependency changes. Existing build chunk/browser-externalized-module and dependency-source-map warnings remain distinct from test failures.
