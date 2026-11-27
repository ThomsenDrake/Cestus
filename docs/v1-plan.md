# Cestus v1.0 Plan

Date: 2026-11-27. Assessed tree: `16045d2c` (`main`). Planning horizon: 2026-11-27 to 2027-11-26 (52 weeks, ~5 hrs/week, 260 hrs total).

## 1. Fixed Decisions and Definition of Done

Owner decisions (2026-11-27), superseding the FollowTheMoney recommendation in `docs/decision-memo-2026-11.md` (draft PR #48, branch `cursor/cestus-overhaul-decision-memo-9afb`) while retaining its codebase audit, Helix maturity findings, and safety constraints:

- **Graph/ontology engine:** Build on **HelixDB** ("embrace and extend", contribute upstream). Do not adopt Helix Foundry, FollowTheMoney, Aleph, or Datashare.
- **Infrastructure:** HelixDB runs on the owner's Linux machine (**T5600**) on the owner's **tailnet**. **AWS startup credits** fund ontology storage/backup and later deployment/dev velocity — not Helix Cloud.
- **v1.0 investigation:** I-4 Corridor ICE detention (Central Florida).
- **Case two (post-v1.0):** Ramifications of Florida Amendment 3. Out of v1.0 execution; shapes cross-matter schema generality only.
- **30-day test (fixed, do not move):**
  - **2026-12-11 checkpoint:** HelixDB running on T5600 with **one produced I-4 document loaded**.
  - **2026-12-27 target:** **All produced I-4 documents** (Seminole Sheriff, Orange County, partial Osceola Corrections) loaded with Cestus evidence IDs + **3 source-checked cross-agency queries**.
- **Existing PRR baseline (from owner mail, 2026-11-27, unverified against raw mailbox):** 24 I-4 requests sent Feb–May 2026; 17 responses; 9 fee estimates (Pinellas County quoted **$646,430.72**, supervisor review unanswered since **2026-05-04**); 8 open; 3 produced records (Seminole Sheriff, Orange County, partial Osceola Corrections). Owner wants a **fresh request round**.
- **Definition of Done (v1.0):** One completed I-4 Corridor ICE detention investigation that used:
  1. an ontology structured to track patterns across seemingly unrelated investigations (proven across I-4 agencies/subcases and schema-verified for a second unrelated matter without rewrite),
  2. **gap analysis** — spotting holes in the corpus, inferring likely content from the gap's shape, and investigating on that basis,
  3. **high-volume public records requests** with fee negotiation and escalation to elected officials when estimates are unreasonable;
  plus a **published report** grounded in ledger events and evidence IDs, and a **tagged `v1.0`**.
- **Product-safety invariants (`SECURITY.md`):** Append-only ledger; mandatory evidence provenance (`evidenceId`, `sha256` content hash, passage locator); rebuildable derived projections; secret-safe logs/artifacts; fail-closed trust boundaries; explicit human gates on PRR sending, legal actions, elected-official escalation, and publication.

Refactor architecture options live in `docs/helix-refactor-plan.md` (to be written after this plan). This document sets the schedule, constraints, and hour caps that refactor plan must obey.

---

## 2. Current Codebase Grounding

Verified directly on `main` (`16045d2c`) unless marked unverified:

| Area | What exists in files | Gaps to v1.0 |
|---|---|---|
| Ledger & ontology | `packages/ontology/src/sqlite-event-ledger.ts` (`SQLiteEventLedger`), `blob-store.ts`, `knowledge-contracts.ts` (`investigation.v1`: `person`, `organization`, `agency`, `contract`, `address`; `investigation.record.saved`, `knowledge.mention.bound`), `case-comparison.ts` (`prepareCaseComparison` capped at 12 cases, 100 assertions, 24 unique passages, 32 KiB text, 100 candidates), `governance-export-preview.ts`, `jsonld-export.ts`. | No HelixDB client, no vector/BM25 query bridge, no cross-matter pattern store beyond loaded workspace cases, no gap-analysis inference model. |
| Projection rebuild | `packages/workspace-ops/src/projection-rebuild.ts` implements temp-dir staging and atomic promote. `node-runner.ts:369` wires only `workspace-ops.projection-placeholder.v1`. | No real HelixDB projection builder wired to `projection rebuild`. |
| Ingestion & OCR | `packages/ingestion/src/extraction.ts` extracts UTF-8 text, CSV, and text-bearing PDFs via Poppler `pdfinfo`/`pdftotext` (32 MiB input, 8 MiB text, 500 pages, 100k passages). Image-only PDF pages mark `pdfCoverage.status: "partial"` with page `unextracted`; no OCR runs. `provider-adapter.ts` has `ProviderParseApprovalService` + `FakeDocumentAiProvider` only. `cli.ts` lacks a `runParseJobs` subcommand (`runtime.ts:384` and `POST /api/ingestion/parse/run` in `packages/local-runtime/src/ingestion-http-routes.ts:212` expose it). | No local OCR engine for scanned PDFs; no CLI subcommand for `runParseJobs`; `approve-import` requires `imp_*` IDs (per PR #48 probe). |
| PRR operations | `packages/ontology/src/contracts.ts:3491-3509` defines all 19 `prr.*` event types including `prr.fee.estimated`, `prr.fee.challenged`, `prr.legal-escalation.confirmed`. `packages/prr/src/projection.ts` projects them, and `workspace-seed.ts` seeds them, but **no service in `packages/prr/src/` appends** fee, narrowing, exemption, denial, appeal, stalling-confirmation, or legal-escalation events. `correspondence-service.ts` + `provider-adapters.ts` (`Gmail`, `ImapSmtp`, `Himalaya`) exist but are not wired to HTTP routes. `packages/local-runtime/src/http-handler.ts:306-322` exposes only `GET /api/requests/workspace` and `POST /api/requests/drafts` (`/api/requests/send` and `/api/requests/legal-escalation` return 404, asserted in `packages/local-runtime/test/auth-and-seed.test.ts:312-313`). `jurisdiction-packs.ts` defines `floridaPublicRecordsPack` with 2 `deadline` rules and 0 `fee`/`exemption`/`appeal`/`enforcement` rules. `stalling.ts` flags `high-fee-estimate` at `>= 100000` cents ($1,000) and hard-codes `confirmedStalling: false`. | Missing PRR write services & HTTP routes for inbound responses, fee estimates/challenges, stalling confirmation, legal/elected-official escalation, and human-gated send/log; missing Florida Ch. 119 fee/appeal rules; no elected-official escalation packet; no batch request tracker for 24+ requests. |
| Agent & document processing | `packages/local-runtime/src/document-processing.ts` (`DocumentProcessingService`) supports user-triggered `document-summary.v1`, `knowledge-extraction.v1`, `case-comparison.v1` via OpenAI-compatible API or `codex-chatgpt`. `packages/agent/src/prr-negotiation-workflow.ts` drafts advisory negotiation artifacts. | No gap-analysis workflow; live providers unverified. |
| Report & governance | `packages/agent/src/report-builder-workflow.ts` builds citation-complete `local-report-packet.v1` with `governance-export-preview.v1` and `truthBoundary: { exportAllowed: false, publicationAllowed: false }`. | No rendered Markdown/HTML export, redaction checklist export, or explicit human publication-approval flow. |
| Runtime, UI, & dead paths | `packages/local-runtime/` supports `--bind tailnet --host <ip>`, `local:preview:check`, one-time session URLs (`docs/operations/tailnet-engineering-preview.md`, `docs/personal-use.md`). `packages/ui/src/workspace/workspace-nav.ts` serves 7 hash modules (`command`, `requests`, `evidence`, `investigation`, `ontology`, `agents`, `ingestion`). `packages/ontology-bootstrap/src/fake-runtime.ts` has `sideEffects: []`; `packages/ingestion/src/central-fl-ice-preview.ts` targets unmounted `/mnt/cestus_legacy_ssd/Cestus/central-fl-ice-workspace` (136 files). | Vitest exits 1 on worker exit after passing 278 files / 4350 tests (per PR #48); UI untested in browser; legacy preview paths still present. |

---

## 3. Workstreams

| # | Workstream | Scope for v1.0 | Hours |
|---|---|---|---|
| W1 | **Ontology / HelixDB** | Stand up HelixDB on T5600 (tailnet-only, telemetry off). Execute refactor chosen in `docs/helix-refactor-plan.md` keeping `SECURITY.md` provenance and rebuildability. Model entities, documents, passages, agencies, events, patterns, and cross-matter links (removing `prepareCaseComparison`'s 100-assertion/24-passage bottleneck via Helix graph + BM25/vector queries). | 44 |
| W2 | **Ingestion + OCR** | Ingest Seminole, Orange, and partial Osceola productions through `packages/ingestion` with content-addressed blobs and `evidenceId`s. Expose `runParseJobs` on CLI (`packages/ingestion/src/cli.ts`). Add local OCR (`ocrmypdf` or `tesseract` on T5600 — no cloud OCR upload) for `pdfCoverage.status === "partial"` PDFs, recording OCR derivatives with explicit provenance. Ingest new M3/M4 productions. | 24 |
| W3 | **Gap Analysis** | Build structured gap detection + hypothesis tracking over HelixDB and ledger: (a) deterministic gap queries (missing dates/custodians/exhibits, broken transfer/billing timelines, partial-OCR pages, unanswered PRR items), (b) human-authored "shape of the gap" inference records (explicitly typed as `hypothesis`, never `accepted` fact), (c) one-click/CLI conversion from gap record to targeted follow-up PRR draft, and (d) resolution tracking when follow-up records confirm or refute the inference. | 26 |
| W4 | **Records Requests + Fee Negotiation + Escalation** | Import the 24 existing Feb–May 2026 requests (17 responses, 9 fee estimates incl. Pinellas $646,430.72, 8 open, 3 produced) into Cestus PRR state. Add missing `packages/prr` services + HTTP routes for recording responses, fee estimates (`prr.fee.estimated`), fee challenges (`prr.fee.challenged`), stalling confirmation, and human-gated correspondence logging/send. Expand `floridaPublicRecordsPack` with Fla. Stat. 119.07(4) special-service-charge / fee-review citations (labeled workflow guidance, not legal advice). Build human-gated **elected-official escalation packet** (request timeline, itemized fee quote, statutory fee notes, comparable agency production costs). Execute Pinellas escalation, chase 8 open requests, send the fresh I-4 request round early (M3), and send gap-driven follow-ups (M4). | 42 |
| W5 | **I-4 Investigation** | Conduct the Central Florida I-4 Corridor ICE detention investigation on the ingested corpus: entity/agency resolution review, cross-agency contract/transfer/custody pattern tracking, testing gap hypotheses against newly produced records, documenting fee-wall and escalation outcomes, and source-checking every finding to `evidenceId` + passage locator + `contentHash`. | 32 |
| W6 | **Report** | Extend `packages/agent/src/report-builder-workflow.ts` with a deterministic Markdown/HTML export renderer gated by `governance-export-preview.ts` and an explicit human publication approval event. Draft, redact PII/sensitive detainee identifiers, verify every citation against original evidence, and publish the I-4 investigation report. | 36 |
| W7 | **Release / Deploy** | Operate Cestus + HelixDB on T5600 behind tailnet ACLs. Use AWS startup credits for encrypted S3 ontology/ledger-metadata backup + restore drill (and optional CI/dev velocity); raw unredacted detention records stay local or client-side encrypted before any S3 sync. Fix the Vitest worker-exit failure so `npm run verify` exits 0; run full HelixDB rebuild drill from ledger; prune or quarantine unused `ontology-bootstrap` / `central-fl-ice-preview` paths; write Case-2 (FL Amendment 3) bootstrap runbook; tag `v1.0`. | 22 |
| W8 | **Upstream HelixDB Contributions** | "Embrace and extend" capped strictly to real blockers hit in M1–M4: minimal reproductions, upstream issues, and targeted PRs (e.g., TypeScript SDK 3.2.0→4.0.0 alignment, container/engine tag docs, query/rebuild fixes). Time-boxed so upstream work never blocks the investigation. | 10 |
| — | **Explicit Slack Reserve** | Unallocated reserve for scan-heavy OCR overrun, HelixDB breaking changes/API drift, or agency legal/fee friction. | 24 |
| | **Total** | | **260** |

---

## 4. Dependencies and Critical Path

### Dependency Graph

- `M1a (T5600 HelixDB + 1 doc)` -> `M1b (All 3 produced sets + 3 cross-agency queries + scan audit)` -> `M2 (Helix refactor + local OCR + import 24 PRRs)`
- `M2 (PRR baseline imported)` -> `M3 (PRR fee/escalation tooling + Pinellas escalation + fresh request round sent)` -> **[External Agency Wait: 4–16 weeks, runs in parallel with M4]** -> `M5 (Ingest new productions + I-4 investigation synthesis)`
- `M2 (Helix refactor + OCR)` -> `M4 (Gap analysis + cross-matter ontology + gap-driven follow-up PRRs)` -> `M5 (Verify gap inferences + complete investigation)`
- `M5 (Source-checked findings)` -> `M6 (Report export gate + drafting + governance/redaction review)` -> `M7 (Publish report + verify green + rebuild drill + v1.0 tag)`
- `M1a–M4 (Helix blockers encountered)` -> `W8 (Upstream HelixDB contributions in M5/M7)` — **off critical path** (droppable without slipping `v1.0`).

### Critical Path

1. **Dec 2026 – Feb 2027 (M1a -> M1b -> M2):** Stand up HelixDB on T5600, load the 3 existing I-4 productions with provenance, complete the bounded Helix refactor and local OCR (if scans > 20%), and import the 24 existing PRRs.
2. **Mar – Aug 2027 (M3 -> External Agency Wait || M4 -> M5):** Ship PRR fee/escalation tooling and send the fresh request round + Pinellas escalation by `2027-04-11` so multi-month agency turnarounds overlap M4 (gap analysis + cross-matter patterns), feeding new productions into M5 synthesis.
3. **Sep – Nov 2027 (M5 -> M6 -> M7):** Close all source-checked findings, build the governance-gated report renderer, complete redaction/publication review, fix `npm run verify`, pass the ledger-to-Helix rebuild drill, publish, and tag `v1.0`.

---

## 5. Dated Milestones and Hour Budget

Total allocated: **236 hrs** across 8 milestones + **24 hrs explicit slack** = **260 hrs** (52 weeks × 5 hrs/wk through `2027-11-26`). Every interval's planned hours fit within `5 hrs/wk` calendar capacity.

| ID | Target Date | Weeks | Hrs | Workstream Split | Measurable Result | Kill / Rescope Criterion |
|---|---|---:|---:|---|---|---|
| **M1a** | **2026-12-11** *(fixed)* | 2.0 | **10** | W1: 8, W2: 2 | HelixDB running on T5600 (tailnet-only, telemetry off) with **1 produced I-4 document** ingested through Cestus and queryable in HelixDB with matching `evidenceId` and `sha256` hash. | If `@helix-db/helix-db` 3.2.0 fails against the running server after 4 hrs, drop the npm SDK and call Helix HTTP (`POST /v2/query` or `/v2/cypher`) directly. If HelixDB fails to persist across T5600 restart by Dec 11, halt refactor work and reassess storage before M2. |
| **M1b** | **2026-12-27** *(fixed)* | 2.3 | **10** | W1: 6, W2: 4 | **All produced I-4 docs** (Seminole Sheriff, Orange County, partial Osceola Corrections) loaded with Cestus `evidenceId`s + **3 source-checked cross-agency queries** verified against original passages + scan-ratio report recorded. | If >50% of PDF pages are `unextracted` scans, load all text-bearing pages + file metadata to hit Dec 27, log scan counts, and activate local OCR in M2 (pulling up to 10 hrs from slack if needed). If HelixDB cannot serve 3 repeatable cross-agency queries, constrain HelixDB strictly to a read-only projection rebuilt from SQLite. |
| **M2** | **2027-02-21** | 8.0 | **36** | W1: 20, W2: 14, W4: 2 | Selected `docs/helix-refactor-plan.md` architecture landed with automated ledger-to-Helix rebuild (`workspace-ops`), `runParseJobs` on CLI, local T5600 OCR producing passages for scanned I-4 PDFs (if needed), and all **24 existing Feb–May 2026 PRRs** (incl. 9 fee estimates and Pinellas $646,430.72) imported into Cestus PRR ledger. | If refactor exceeds 20 hrs in M2 (34 hrs cumulative across M1a–M2), freeze Helix schema and drop secondary features (e.g., vector embeddings) to keep projection-only rebuild working. If OCR is unnecessary (<10% scans), reallocate up to 8 hrs to M3 PRR tooling. |
| **M3** | **2027-04-11** | 7.0 | **34** | W4: 34 | `packages/prr` + `local-runtime` support recording responses, fee estimates (`prr.fee.estimated`), fee challenges (`prr.fee.challenged`), Fla. Stat. 119.07(4) fee guidance, and human-gated elected-official escalation packets; human has **escalated Pinellas ($646,430.72)**, followed up the **8 open requests**, and **sent the fresh I-4 request round**. | If full UI wiring for fee/escalation screens slips past 20 hrs, ship CLI + minimal Requests panel read-back so human sends the fresh request round and Pinellas escalation on time — never delay external PRR sends for UI polish. |
| **M4** | **2027-06-06** | 8.0 | **38** | W1: 10, W3: 22, W4: 6 | Gap-analysis queries + human-reviewed gap-hypothesis records live in HelixDB/ledger; **>= 5 concrete I-4 gaps** documented with shape-based inferences and **>= 3 gap-driven follow-up PRRs sent** by human; cross-matter pattern query passes on I-4 subcases + a synthetic second-matter fixture (FL Amendment 3 shape). | If automated gap-inference suggestions are noisy or slow, ship deterministic structural/temporal gap queries + structured manual hypothesis records (no LLM gap generation). Keep `prepareCaseComparison` untouched as fallback for small subsets. |
| **M5** | **2027-08-15** | 10.0 | **44** | W2: 4, W3: 4, W5: 24, W7: 4, W8: 8 | All productions received through `2027-08-01` ingested + OCR'd + rebuilt into HelixDB; **complete source-checked I-4 evidence matrix** (entities resolved, cross-agency patterns verified, gap hypotheses marked confirmed/refuted/open, fee-wall & escalation log complete); AWS encrypted ontology backup running; **>= 1 upstream HelixDB PR or repro issue** submitted. | If agencies stall and yield zero new productions by `2027-07-15`, proceed with the investigation using existing 3 productions + documented fee-wall/non-response record (the obstruction and $646k quote become core documented findings). Cut upstream Helix PRs to issue reports if investigation hours run tight. |
| **M6** | **2027-10-17** | 9.0 | **40** | W5: 8, W6: 32 | Governance-gated Markdown/HTML export renderer + explicit human publication approval landed on `report-builder-workflow.ts`; **complete I-4 investigation report draft** with 100% factual claims mapped to `evidenceId` + `contentHash`, zero excluded/sensitive evidence leaked, and human privacy/legal review complete. | If automated renderer hits edge cases after 10 hrs, export strict citation-checked Markdown only (drop HTML/styled layout) and format publication manually outside Cestus while preserving ledger-backed citation verification. |
| **M7** | **2027-11-20** | 4.9 | **24** | W6: 4, W7: 18, W8: 2 | **I-4 report published**; `npm run verify` exits 0 cleanly (Vitest worker exit resolved); T5600 full HelixDB rebuild-from-ledger drill and AWS ontology restore drill pass; Case-2 (FL Amendment 3) runbook committed; **`v1.0` git tag** created. | If Vitest worker exit proves to be an upstream Node/Vitest runtime bug after 6 hrs, pin/isolate the failing worker config with CI evidence rather than blocking `v1.0`; never ship `v1.0` without a published, citation-verified report and passing rebuild drill. |
| **Slack** | *(to 2027-11-26)* | 0.8 + float | **24** | Unallocated | Reserve drawn only on documented trigger: scan-heavy OCR (>14h), HelixDB breaking release/API drift, or Pinellas/agency legal-escalation overhead. | Unspent slack remains unused or funds Case-2 (FL Amendment 3) workspace setup after `v1.0` tag. |

---

## 6. Inputs for the Refactor Plan (`docs/helix-refactor-plan.md`)

`docs/helix-refactor-plan.md` will evaluate and select the HelixDB architecture after this plan is accepted. It must answer these questions within these constraints:

### Questions to Answer

1. **System-of-record boundary:** Should HelixDB be (A) a strictly rebuildable derived projection beside `SQLiteEventLedger` (`packages/ontology`), (B) a co-primary query/ontology store synced on write with SQLite retaining raw append-only events, or (C) a direct replacement for `packages/ontology` storage? Show exactly how `SECURITY.md` invariants (append-only ledger, non-rewritable history, rebuildable derived projections, fail-closed authority) hold or break under each option.
2. **Version and client pin:** Given `@helix-db/helix-db` on npm is `3.2.0` while `HelixDB/helix-db` `main` declares `4.0.0`, engine release is `v3.7.0`, and container tags are `v0.0.19` (PR #48), which exact server build (source vs container) and client transport (npm SDK vs direct HTTP `POST /v2/query` or `POST /v2/cypher`) should Cestus pin for M1a?
3. **Entity resolution without FollowTheMoney:** Without FtM/nomenklatura, how are mention-to-entity bindings (`knowledge.mention.bound`), same/not-same human merge judgements, and alias lineages represented in the ledger and projected into HelixDB?
4. **Schema for cross-matter patterns and gap analysis:** How does the HelixDB schema model investigations/matters, agencies, documents, passages (`evidenceId` + `contentHash` + locator), assertions, gap hypotheses (strictly separated from accepted facts), and cross-matter patterns — and how does it lift `prepareCaseComparison`'s 12-case / 100-assertion / 24-passage ceiling?
5. **T5600 + tailnet + telemetry hardening:** How is HelixDB bound strictly to the T5600 tailnet interface (or localhost behind `local-runtime`), how is query-shape/usage telemetry verified disabled across the chosen install path, and how is auth enforced?
6. **AWS ontology storage boundary:** What exact artifact (ledger snapshot, ontology schema/accepted-graph export, or Helix S3 backend) lands on AWS under startup credits, and how are unredacted detention records prevented from leaving T5600 unencrypted?
7. **Package impact:** Which existing modules in `packages/ontology`, `packages/workspace-ops/src/projection-rebuild.ts`, `packages/local-runtime`, and `packages/ui` change, and what stays untouched (confirming `packages/ontology-bootstrap` and `central-fl-ice-preview.ts` are not carried forward)?

### Hard Constraints and Budget Cap

- **Fixed gates:** Must produce a runnable T5600 path that hits **2026-12-11** (Helix running on T5600 + 1 produced I-4 doc loaded) and **2026-12-27** (all 3 produced sets loaded with Cestus `evidenceId`s + 3 source-checked cross-agency queries).
- **Hour budget cap:**
  - **<= 14 hours** for M1a + M1b HelixDB bring-up and query validation (8h in M1a + 6h in M1b).
  - **<= 20 hours** in M2 to finish the refactor and wire rebuildability (**<= 34 hours cumulative** through M2).
  - **<= 10 hours** in M4 for cross-matter pattern queries and schema generalization (**<= 44 hours total** across W1 through v1.0).
  - Any option requiring > 34 hours before M3 or rewriting `packages/prr`, `packages/ingestion`, `packages/local-runtime`, or `packages/ui` is disqualified under the second-rewrite constraint.
- **Safety & privacy:** Must preserve all `SECURITY.md` invariants, disable all outbound telemetry, never upload detention records to Helix Cloud, and never encode dev coordination in the product ledger.

---

## 7. Explicitly Out of v1.0

- **Case two: Florida Amendment 3** (execution, records requests, ingestion, and reporting wait until after `v1.0` tag; only schema generality is checked in M4).
- **Helix Foundry, FollowTheMoney, nomenklatura, Aleph, Datashare, yente, Graphiti, Cognee, Neo4j.**
- **Second host rewrite** of `packages/local-runtime`, `packages/ui`, `packages/prr`, or `packages/ingestion`.
- **Autonomous external actions:** automated PRR sending, automated follow-up emails, automated legal filings, or automated report publication (all remain strictly human-gated per `SECURITY.md`).
- **AI-fabricated gap filling:** using an LLM to hallucinate or assert the contents of missing documents as accepted facts (gap inferences are human-reviewed hypotheses that drive new records requests).
- **Cloud/remote OCR or Helix Cloud** for raw detention records (all OCR and corpus indexing run locally on T5600).
- **Multi-user / public SaaS / RBAC / external web hosting** (single-operator tailnet runtime only for v1.0; AWS credits are limited to encrypted ontology storage/backup and dev/CI velocity).
- **Automated email-inbox polling daemon** if manual/CLI sync of correspondence suffices for the 24 + fresh-round requests.
- **Full `packages/ontology-bootstrap` revival or `central-fl-ice-preview.ts` SSD migration** (first corpus is the already-produced agency records, not legacy-SSD migration).
- **Live resident-agent autonomous scheduler** (`packages/agent` remains strictly human-triggered for drafting/advisory handoffs).

---

## 8. Top Risks and Mitigations

| Risk | Why It Can Kill v1.0 | Mitigation |
|---|---|---|
| **1. Second-rewrite trap** | `main` is already the neo successor (`af7d08e9`, ~341k LoC). Rewriting the host around HelixDB consumes all 260 hrs on scaffolding and ships zero investigation. | Keep `packages/local-runtime`, `packages/ingestion`, `packages/prr`, and `packages/ui` intact. Cap W1 Helix refactor at <= 34 hrs through M2 (<= 44 hrs total). Disqualify any refactor option in `docs/helix-refactor-plan.md` that rewrites host packages. |
| **2. HelixDB maturity & drift** | Engine is `v3.7.0`, container tags are `v0.0.19`, npm SDK is `3.2.0` vs `main` `4.0.0`, and one maintainer (`xav-db`) accounts for the large majority of commits (PR #48). API/storage breakage or query limits can stall M1–M4. | Pin one exact server commit/release and container/binary on T5600; prefer thin HTTP client if npm `3.2.0` mismatches server; keep SQLite append-only ledger as rebuildable authority so HelixDB can be wiped and rebuilt at any time; enforce Dec 11 / Dec 27 kill criteria. |
| **3. Scope creep** | Easy to drift into polishing all 7 UI modules, building autonomous resident-agent loops, chasing upstream Helix features, or starting FL Amendment 3 early. | Enforce Section 7 out-of-scope list and per-milestone kill/rescope criteria. Prefer CLI/minimal UI over full visual polish when hours tighten. Cap upstream Helix contributions (W8) at 10 hrs and keep them off the critical path. |
| **4. Privacy of detention records** | Corpus contains sensitive ICE detention / county corrections records and possible detainee PII. HelixDB/Foundry defaults in PR #48 included query-shape telemetry; unauthenticated listeners or cloud LLM/OCR uploads leak sensitive records. | Run HelixDB and Cestus strictly on T5600 bound to tailnet (or Helix on loopback behind `local-runtime`), verify telemetry is disabled before loading any real file, run OCR locally (`tesseract`/`ocrmypdf`), gate all report exports via `governance-export-preview.ts`, and never put unencrypted raw detention records on AWS S3 or Helix Cloud. |
| **5. Solo 5 hr/wk capacity & external PRR latency** | At 5 hrs/wk, a scan-heavy PDF dump (+15–20 hrs OCR), broken build, or waiting until summer to send PRRs leaves no time for agency turnarounds and report writing. | Hold **24 hrs explicit slack**; pace every milestone <= 5 hrs/wk; send the fresh PRR round and Pinellas escalation early in **M3 (`2027-04-11`)** so agency wait times run in parallel with M4; if agencies stonewall, publish the documented fee-wall and obstruction record as part of the v1.0 findings. |

---

## 9. Unverified Items

Items not verified directly in this repository on 2026-11-27 (must be checked during M1a–M3):

- **Produced I-4 corpus characteristics:** File count, total byte size, PDF scan ratio (`partial` vs `complete`), encryption/redaction state, and PII sensitivity of the Seminole Sheriff, Orange County, and partial Osceola Corrections files (not in repo).
- **Existing 24 PRR records:** Exact request dates, agency contacts, tracking numbers, fee itemizations (including Pinellas's $646,430.72 quote and 2026-05-04 supervisor review), and correspondence threads (known only from owner mail summary on 2026-11-27).
- **T5600 host environment:** OS version, CPU/RAM/disk, Docker/Rust/Poppler/Tesseract availability, and Tailscale ACL rules on the T5600.
- **HelixDB runtime behavior:** Actual execution on T5600, compatibility of npm `@helix-db/helix-db` `3.2.0` vs current HelixDB server, mapping between container tag `v0.0.19` and engine `v3.7.0`, verified telemetry-disable flags on standalone HelixDB, and exact S3 object-storage flags/encryption behavior.
- **AWS startup-credit setup:** Account state, IAM/KMS setup, and exact credit expiry/limits.
- **Vitest worker exit:** Root cause of Vitest exiting 1 after 278 files / 4350 tests pass (reported in PR #48; not re-run in this docs-only pass).
- **Live LLM & email providers:** Runtime behavior of Nous/Codex (`DocumentProcessingService`) and `Himalaya`/`Gmail`/`ImapSmtp` correspondence adapters against live accounts.
- **Florida Ch. 119 legal specifics:** Statutory fee-challenge and elected-official escalation templates require human review (Cestus packs provide workflow guidance only, not legal advice).
