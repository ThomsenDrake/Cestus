# Decision memo: finish Cestus

Date: 2026-11-27. Assessed tree: `16045d2c` (HEAD of `main`). Research only. No product code changed.

## Recommendation

Finish the investigation on the ledger Cestus already has. Keep `packages/ontology` as the append-only source of truth (`SECURITY.md`). Add HelixDB as a rebuildable graph for cross-document pattern queries and structural gap queries. Leave Helix Foundry off the critical path.

The work is a fix of the product plus a small new projection. `main` is already the neo successor (`af7d08e9`, "Replace main with neo"). Rewriting the host application again spends the year on scaffolding. The year at 5 hours a week is 260 hours.

Done stays the owner's definition: one completed I-4 Corridor ICE detention investigation, an ontology that can relate productions across agencies, gap work that drives the next request, high-volume public-records requests with fee negotiation and escalation when an estimate is unreasonable, a report, and a tagged v1.0.

## Helix verdict

Use HelixDB. Do not adopt Helix Foundry as Cestus's ontology.

HelixDB (source read: GitHub `HelixDB/helix-db` README on `main`, 2026-11-27) is an Apache-2.0 Rust engine: labeled property graph, vector properties with prefiltered nearest-neighbor search, and BM25 full text, in one transactional store. Queries are a TypeScript/Rust/Python/Go DSL posted to `POST /v2/query`. Source builds also expose a documented openCypher profile at `POST /v2/cypher`. Self-host is embedded, a local server (memory or `helix start dev --disk`), or S3-compatible object storage. Helix Cloud is the managed alternative. The published TypeScript client is real: npm `@helix-db/helix-db`, Apache-2.0, Node `>=20`.

Helix Foundry (source read: clone of `HelixDB/helix-foundry` at `750f616`, 2026-11-26) is a separate application: Next.js site, Go API and workers, MySQL, SeaweedFS, a HelixDB container, and an ontology-agent image. It drafts an ontology with a model, loads it into HelixDB, and keeps a quote or table-row citation on values. Its checked-in ontology definition (`backend/ontology/ontology.go`) is entities, relationships, rules, and constraints whose properties must be columns of a synced table. Documents are a second pipeline: PDFium-via-WebAssembly text extraction (`backend/document/read/pdf.go`). A PDF with no text layer is stored and reported as "Scanned PDF: no text to read". There is no OCR in that reader. Local install is one user, no sign-in, bound to localhost, and the README forbids exposing it. Usage telemetry is on unless `FOUNDRY_TELEMETRY=off` or `DO_NOT_TRACK=1`. The bundled HelixDB sends query shape, timing, and success, with values stripped, back to Helix (`local/compose.yaml`).

Foundry does not implement a public-records workflow, a human send gate, an append-only evidence ledger, or fee escalation. Replacing `packages/ontology` with it would discard those and add a second system of record (MySQL plus the agent's schema).

Maturity, from the GitHub API on 2026-11-27:

| | HelixDB | Helix Foundry |
|---|---|---|
| License | Apache-2.0 | Apache-2.0 (repo `LICENSE` and GitHub metadata) |
| Created | 2024-11-23 | 2026-10-07 |
| GitHub releases | v1.0.0 on 2025-02-05 through v3.7.0 on 2026-11-11; 196 release pages at `per_page=1` | 0 |
| Container tags | `ghcr.io/helixdb/helixdb` latest `v0.0.19` (2026-11-26). Foundry compose pins `v0.0.18` | Images `foundry-site:0.1.6`, `foundry:0.1.5`, `ontology-agent:0.1.4` |
| Commit activity | Tens to low hundreds of commits per week through November 2026 (GitHub `commit_activity`) | First non-zero week 2026-10-04; 336, 424, and 353 commits in the three weeks ending 2026-11-22 |
| Contributors | 37 listed; `xav-db` 3671 contributions | 11 listed; `xav-db` 1792 of them |
| Open issues | 24 | 5, including "publish the `ontology-agent` source" (#381, open) |
| Stars | 6323 | 2202 |

The TypeScript package on npm is `3.2.0`, published 2026-09-22. `sdks/typescript/package.json` and the README on `main` say `4.0.0`. That release is not on npm. The container tag sequence (`v0.0.x`) and the engine release sequence (`v3.7.0`) were not matched to each other in this pass.

This session did not run HelixDB or Foundry. Docker is not installed on the assessment machine. The query, vector, and S3 claims above are from the HelixDB README and the Foundry tree, not from an executed query.

## Cestus as it runs today

About 341,000 lines of TypeScript across the ten packages. One npm package at the repo root. Node v22.23.4, npm 10.9.9, `npm ci` from the lockfile.

`npm run verify` was run twice. Both times `tsc --noEmit` printed `typecheck passed`. Both times Vitest reported **278 files passed, 3 skipped, 4350 tests passed, 6 skipped**, then one worker exited unexpectedly and Vitest exited 1 (durations 173s and 181s). The verify script stops there, so it did not reach `test:assurance` or `ui:build`. Run separately: `npm run test:assurance` passed 2/2; `npm run ui:build` transformed 191 modules and wrote `dist/` in 463ms (main JS chunk 935 kB, size warning only). No OOM line was available from `dmesg`. The worker-exit cause is unverified. The pass counts were the same both times. The reporter output did not name the 3 skipped files. Four agent test files skip their suites unless `CESTUS_AGENT_LIVE_NOUS=1`, which was unset. Live model tests were not run.

Ingest probe, after installing `poppler-utils` 24.02.0 (`pdftotext` was not on `PATH` before that). Workspace created with `packages/local-runtime/src/cli.ts create-workspace` at `/tmp/cestus-ingest-ws`. Source: five synthetic files from `test-data/phase2-records` (minutes.pdf, record.txt, table.csv, scan-control.pdf, unreadable.pdf). No agency records are in the repo.

| Step | Result |
|---|---|
| `cestus-ingest register-source` | ok, one ledger event |
| `dry-run` | 5 files, 1733 bytes, all `new` |
| `approve-import` with `--import import_probe_001` | `INGESTION_RUNTIME_INTERNAL`. The id must match `imp_…`. The handler swallows the schema error. |
| `approve-import` with `imp_probe_001` and `--approved-by actor_ingestion_cli` | ok |
| `import` | 5 evidence blobs, 5 local parse jobs queued |
| `runParseJobs` via the package API (no CLI command exists) | text, csv, and minutes.pdf succeeded. minutes.pdf coverage `complete`, both pages `text-extracted`, text "Synthetic meeting record." / "The amber bridge appears on page two." unreadable.pdf failed: corrupt PDF. scan-control.pdf job state `succeeded` with coverage `partial`, the only page `unextracted`, empty text. |
| `cestus-ingest create-workspace` | `INGESTION_COMMAND_UNSUPPORTED` |

`extraction.ts` defines a scan failure message ("Scanned-page OCR is not supported") and nothing in `packages/ingestion` throws it. A page with no text is recorded as partial coverage and the parse job still succeeds. There is no OCR.

The Central Florida ICE preview (`packages/ingestion/src/central-fl-ice-preview.ts`) is a separate state machine aimed at `/mnt/cestus_legacy_ssd/Cestus/central-fl-ice-workspace`, 136 expected files. That path is not mounted here. The preview was not run. A search of `*.ts`, `*.tsx`, `*.md`, and `*.json` found no "Seminole", "Osceola", "Orange County", or "I-4".

What the tests and this probe show, by package, is in the table. The HTTP routes and the UI were not booted in a browser in this session. Route behavior below is from the route modules and from tests that passed inside the Vitest run.

## Per-package decision

| Package | What works end to end | Decision |
|---|---|---|
| `ontology` | Append-only in-memory and SQLite ledgers, content-addressed blobs, evidence ingest, assertion propose/accept, graph and knowledge projections, investigation records, deterministic cross-case comparison (`prepareCaseComparison`: shared identity, relationship structure, event structure, event sequence), governance projection, JSON-LD export. No CLI, no vectors, no embeddings. | **Keep.** HelixDB is a projection rebuilt from this ledger. Replacing the package with Foundry drops the append-only ledger. |
| `ontology-bootstrap` | Pure functions: readiness, a dossier, and tool previews. `runFakeOntologyBootstrapSpecialist` records `sideEffects: []` and calls no model. It writes no ledger events. | **Delete from the plan.** It is a legacy-migration preview, and the first corpus is records agencies have already produced. Leave the files until `central-fl-ice-preview` and the agent workflows that import it are removed. Do not replace it with Foundry. |
| `ingestion` | CLI: register, dry-run, human approve, import, jobs, retry, provider-approval event, diagnostics, and a legacy migration command set. Local extractors: Poppler for text-bearing PDF, UTF-8 text, CSV. Zip expand on scan. Provider OCR is an approval event only; this session found no provider call in the runtime. | **Keep.** This is the ingestion path for the produced PDFs. Foundry's PDFium reader is a second extractor with the same no-OCR limit. |
| `workspace` | Creates and mounts `cestus-workspace.json` plus ledger, blob, derivative, job, projection, cache, and config directories. Rejects secret-like manifest keys. Does not open SQLite. | **Keep.** |
| `workspace-ops` | CLI (`npm run workspace:ops`): verify, disk usage, detect drive, diagnostics, manifest export, backup check, projection rebuild. Rebuild writes a placeholder artifact (`workspace-ops.projection-placeholder.v1`). | **Keep.** The Helix projection should be a real rebuild target later. The placeholder is not that target today. |
| `local-runtime` | `configure` then `serve`. HTTP groups: health, operator status, agent, ingestion, investigation, document processing, evidence, ontology/knowledge, PRR workspace and drafts. Static UI from `dist/`. Default mounted specialist path uses `FakeModelProvider` unless `CESTUS_AGENT_NOUS_API_KEY` is set. | **Keep.** It is the only process that serves the UI and the APIs together. |
| `agent` | Ledger-backed runtime, task orchestrator, tool gateway, wake supervisor, specialist workflows including `prr-negotiation` (draft artifacts and approval classes, including fee notes and legal-escalation review). OpenAI-compatible Nous HTTP client exists. xAI and Codex paths are harnesses. No package CLI. | **Keep.** Helix does not provide the human gates. Live model behavior was not executed. |
| `operator-status` | Zod contracts only. `GET /api/operator/status` is implemented in `local-runtime`. | **Keep.** |
| `prr` | Ledger drafts, Florida Chapter 119 workflow-estimate pack (two deadline rules; the pack schema allows fee and appeal rules and this pack defines none), federal FOIA 20-working-day estimate, stalling signals (high fee is `>= 100000` cents, and `confirmedStalling` is hard-coded `false`), legal-escalation gate that checks human confirmation and citations, correspondence send that requires `approvedBy`. `POST /api/requests/send` and `POST /api/requests/legal-escalation` return 404 (`auth-and-seed.test.ts`). No elected-official packet. Fee events are projected from fixtures and seed data; no service in this package appends `prr.fee.estimated`. | **Keep.** Fee negotiation and escalation get built here, as human-gated drafts. They are not a Helix feature. |
| `ui` | Hash modules: command, requests, evidence, investigation, ontology, agents, ingestion. Adapters call the local API. No screen creates a portable workspace. Investigate can show cross-case comparison output. Command can show an "Ontology gaps" metric from the ontology DTO. Vitest UI tests passed inside the two runs. This session did not click through a browser. The production bundle builds. | **Keep.** |

Gap analysis, as the owner defined it (see a hole, infer what is likely in it from its shape, investigate on that basis), is not implemented. The closest code is PDF page coverage, missing-evidence prompts in the bootstrap dossier, fail-closed governance diagnostics, and cross-case structural comparison of assertions that already exist. Nothing infers the contents of a missing record.

Cross-investigation pattern tracking across unrelated matters is not implemented. Cross-case comparison runs on cases already loaded into one knowledge workspace.

## First milestone

**Ingest the produced I-4 documents into a HelixDB graph that is rebuilt from the Cestus ledger, and run cross-document pattern queries and structural gap queries. 36 hours. Target 2027-01-16.**

Planning assumption, unverified because the files are not in the repo: the produced Seminole, Orange, and partial Osceola set fits on one disk, and at least half of the PDFs have a text layer. A scan-heavy set adds about 20 hours and an OCR tool. Neither Cestus nor Foundry OCRs.

| Hours | Work |
|---|---|
| 6 | One HelixDB process on the owner's machine (`helix start dev --disk`) or one small AWS VM. Telemetry off. Data stays in that account. Schema is hand-written: Agency, Production, Document, Passage, Person, Facility, Date, Request, Gap. |
| 12 | Loader from Cestus extraction artifacts into that schema. Every Helix node carries the Cestus evidence id and content hash. The ledger remains canonical. Dropping the Helix data directory and reloading must reproduce the graph. |
| 10 | Register the produced directory, dry-run, human-approve, import, `runParseJobs`. List partial-coverage PDFs and stop. Do not invent text for them. |
| 8 | Three pattern queries (shared person, facility, or date across two agencies) and three gap queries (production with no facility, booking with no date, request with no production). Each hit checked against the source file. Write down what came back. |

"Infer what is likely in the gap" in this milestone means a person reading those missing edges and naming the record to request next. It does not mean a model filling in the missing document. That inference is a later, human-confirmed step (milestone 2). Foundry's analyst is a model over a load, which is the wrong default for detention records.

## Sequence to v1.0

5 hours a week from 2026-11-27 is 260 hours through 2027-11-26. The sequence uses 256.

| When | Hours | Outcome |
|---|---|---|
| 2027-01-16 | 36 | Milestone 1, above. |
| 2027-03-13 | 40 | Human accepts or rejects extracted entities. Gap list names the next record type to request. Scans get an OCR pass only if milestone 1 showed they dominate. |
| 2027-05-22 | 50 | One real request round on the existing PRR package: record the agency's fee estimate, draft a challenge, draft an escalation to an elected official when the estimate is unreasonable. A person sends. Florida deadline rules stay labeled as workflow estimates. |
| 2027-08-14 | 60 | Later productions loaded the same way. Patterns that survive review are appended to the ledger. The Helix graph is rebuilt from it. |
| 2027-11-20 | 70 | The investigation report, grounded in ledger events and evidence ids, and a `v1.0` tag. |

Four hours of slack remain. A large scan corpus or a breaking Helix client upgrade (npm is already behind `main`) consumes that slack and moves the tag past the year. The slack is not a Foundry evaluation and not a UI rewrite.

## Risks

**Second rewrite.** The host application is large, tested, and already a replacement of an earlier Cestus. Foundry is a third system: its own UI, its own database (MySQL), its own ontology lifecycle, and a Rust agent whose source is not in the public repo (open issue #381). Adopting it as the ontology means migrating evidence, approvals, and the UI, and then still building requests, fees, escalation, and the report. That is the year.

**Helix maturity and lock-in.** The engine is active and on v3.7.0, with a container tag line still at v0.0.19 and a TypeScript client on npm (3.2.0) that does not match `main` (4.0.0). Foundry is seven weeks old, has no GitHub release, and one account has the large majority of commits. The query DSL is Helix's. Cypher is a documented partial profile, not a promise that existing Cypher will run. Lock-in stays tolerable while Helix is a projection: the ledger can rebuild it. Lock-in becomes the product if Foundry's MySQL store or the agent's schema is the source of truth.

**License.** Both repositories are Apache-2.0, confirmed in the repo `LICENSE` files and GitHub license metadata. Foundry's README says the three container images are Apache-2.0 as well. The ontology-agent image is published; its source repository is an open request. No copyleft term showed up in the files read. Helix Cloud terms of service were not read. They can differ from the Apache code.

**Privacy of the records.** These are detention records. Foundry's local defaults phone home query shape and product-usage events. The local app has no authentication, so any tunnel is a full compromise, which its own README states. Helix Cloud and `foundry.helix-db.com` put the corpus on Helix's infrastructure. The corpus stays in an account the owner controls, telemetry off, no sample-company upload, no Foundry Cloud account for these files. Cestus's ledger rules (append-only, secret-safe logs, human send) stay in force for whatever is loaded.

**AWS cost.** Startup credits can pay for one small VM and a disk or an S3 bucket. They do not, on any evidence gathered here, pay a Helix Cloud invoice. Foundry's compose stack is MySQL, SeaweedFS, the site, the API, the agent image, and HelixDB, which is more than this corpus needs. The cost that will matter is model calls if an ontology agent is pointed at the productions (Anthropic, OpenAI, or Bedrock). Milestone 1 uses a hand-written schema and no model.

## Unverified

- HelixDB and Foundry were not executed. No query result, vector search, or BM25 search was run. Docker is absent here, so `docker compose up` was not attempted.
- Mapping of container tag `v0.0.19` to engine release `v3.7.0`.
- Behavior of npm client 3.2.0 against a current server. The README examples are for 4.0.0.
- Exact Helix flags for S3. The README states S3-compatible object storage as a self-host mode. An AWS Terraform, ECS, or EKS recipe was not in the Foundry tree searched (`BYOC`, `terraform`, `ecs`, `eks` as deploy docs). A 2026-11-15 Helix marketing post claims bring-your-own-cloud. That claim is not backed by the Foundry source read here.
- Whether Helix Cloud can be paid with AWS startup credits. Treat that as no.
- Helix Cloud terms of service, and whether query-shape telemetry can be disabled on every self-host path or only via the Foundry compose variables.
- Contents of the `ontology-agent` image beyond issue #381 and the compose pin.
- Size, scan ratio, and sensitivity handling of the already-produced Seminole, Orange, and Osceola files. They are not in this repository.
- The Central Florida ICE preview against its 136-file SSD path.
- Browser behavior of the seven UI modules. The bundle builds. The screens were not clicked.
- Why the Vitest worker exits after a fully passing run. Counts were stable across two runs; `dmesg` showed nothing.
- Live Nous, xAI, Codex, and any remote OCR provider. No API key was used.
- SQL as a Helix query surface. Open HelixDB issues mention SQL in the Python SDK. The README sections read here document the DSL and Cypher.

## Sources

- Cestus `16045d2c`. `SECURITY.md`. Package sources cited above. Two `npm run verify` logs, plus separate assurance and UI build. Ingest probe under `/tmp`, not committed.
- `HelixDB/helix-foundry` `750f616`: `README.md`, `LICENSE`, `compose.yaml`, `local/compose.yaml`, `backend/ontology/ontology.go`, `backend/document/read/pdf.go`.
- GitHub API, 2026-11-27: repo metadata, releases, contributors, `commit_activity`, open issues, `ghcr.io/helixdb/helixdb` versions.
- npm registry: `@helix-db/helix-db` versions through 3.2.0.
- `HelixDB/helix-db` README and `sdks/typescript/package.json` via the GitHub contents API on the default branch.
