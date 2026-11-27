# Decision memo: finish Cestus

Date: 2026-11-27. Assessed tree: `16045d2c` (HEAD of `main`). Research only. No product code changed.

## Recommendation

Finish the investigation on the ledger Cestus already has. Keep `packages/ontology` as the append-only source of truth (`SECURITY.md`). Above that ledger, use FollowTheMoney as the entity model and nomenklatura for resolution. Leave Aleph, Datashare, and Helix Foundry off the host. HelixDB stays a later option if vector or ad-hoc graph queries are still missing after the FollowTheMoney projection exists. The survey is below.

The work is a fix of the product plus a small new projection. `main` is already the neo successor (`af7d08e9`, "Replace main with neo"). Rewriting the host application again spends the year on scaffolding. The year at 5 hours a week is 260 hours.

Done stays the owner's definition: one completed I-4 Corridor ICE detention investigation, an ontology that can relate productions across agencies, gap work that drives the next request, high-volume public-records requests with fee negotiation and escalation when an estimate is unreasonable, a report, and a tagged v1.0.

## Helix verdict

HelixDB is a store, not the milestone-1 ontology. Do not adopt Helix Foundry as Cestus's ontology. The survey below moves milestone 1 onto FollowTheMoney and nomenklatura. HelixDB remains the least-bad permissive graph-and-vector store if that projection later needs similarity search.

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
| `workspace-ops` | CLI (`npm run workspace:ops`): verify, disk usage, detect drive, diagnostics, manifest export, backup check, projection rebuild. Rebuild writes a placeholder artifact (`workspace-ops.projection-placeholder.v1`). | **Keep.** The placeholder is not the FollowTheMoney projection. |
| `local-runtime` | `configure` then `serve`. HTTP groups: health, operator status, agent, ingestion, investigation, document processing, evidence, ontology/knowledge, PRR workspace and drafts. Static UI from `dist/`. Default mounted specialist path uses `FakeModelProvider` unless `CESTUS_AGENT_NOUS_API_KEY` is set. | **Keep.** It is the only process that serves the UI and the APIs together. |
| `agent` | Ledger-backed runtime, task orchestrator, tool gateway, wake supervisor, specialist workflows including `prr-negotiation` (draft artifacts and approval classes, including fee notes and legal-escalation review). OpenAI-compatible Nous HTTP client exists. xAI and Codex paths are harnesses. No package CLI. | **Keep.** Helix does not provide the human gates. Live model behavior was not executed. |
| `operator-status` | Zod contracts only. `GET /api/operator/status` is implemented in `local-runtime`. | **Keep.** |
| `prr` | Ledger drafts, Florida Chapter 119 workflow-estimate pack (two deadline rules; the pack schema allows fee and appeal rules and this pack defines none), federal FOIA 20-working-day estimate, stalling signals (high fee is `>= 100000` cents, and `confirmedStalling` is hard-coded `false`), legal-escalation gate that checks human confirmation and citations, correspondence send that requires `approvedBy`. `POST /api/requests/send` and `POST /api/requests/legal-escalation` return 404 (`auth-and-seed.test.ts`). No elected-official packet. Fee events are projected from fixtures and seed data; no service in this package appends `prr.fee.estimated`. | **Keep.** Fee negotiation and escalation get built here, as human-gated drafts. They are not a Helix feature. |
| `ui` | Hash modules: command, requests, evidence, investigation, ontology, agents, ingestion. Adapters call the local API. No screen creates a portable workspace. Investigate can show cross-case comparison output. Command can show an "Ontology gaps" metric from the ontology DTO. Vitest UI tests passed inside the two runs. This session did not click through a browser. The production bundle builds. | **Keep.** |

Gap analysis, as the owner defined it (see a hole, infer what is likely in it from its shape, investigate on that basis), is not implemented. The closest code is PDF page coverage, missing-evidence prompts in the bootstrap dossier, fail-closed governance diagnostics, and cross-case structural comparison of assertions that already exist. Nothing infers the contents of a missing record.

Cross-investigation pattern tracking across unrelated matters is not implemented. Cross-case comparison runs on cases already loaded into one knowledge workspace.

## First milestone

**Ingest the produced I-4 documents through the existing Cestus importer, emit FollowTheMoney entities with document-level mentions, resolve them with nomenklatura, and run cross-agency and missing-property queries. 36 hours. Target 2027-01-16.**

This replaces the earlier HelixDB milestone. The date and the hour budget stay. The store install and the hand-written Helix schema come out. A Python virtualenv for nomenklatura comes in. No model calls.

Planning assumption, unverified because the files are not in the repo: the produced Seminole, Orange, and partial Osceola set fits on one disk, and at least half of the PDFs have a text layer. A scan-heavy set adds about 20 hours and an OCR tool. Cestus, Foundry, FollowTheMoney, and nomenklatura do not OCR. Datashare does, and it is not this milestone.

| Hours | Work |
|---|---|
| 8 | A small FollowTheMoney subset: Document, Person, Organization, Event, Mention. Validate with the Python model or the MIT JavaScript model `@alephdata/followthemoney` (npm 3.8.4, 2025-05-13). |
| 10 | Same ingest path as the probe: register, dry-run, human approve, import, `runParseJobs`. List partial-coverage PDFs and stop. Map extracted passages to FtM JSON. Each entity carries the Cestus evidence id and content hash on the ledger event. FtM `Mention` links a name to a `Document` and an optional resolved entity (`followthemoney/schema/Mention.yaml`). It has no character offset, so the Cestus passage locator stays on the ledger event. |
| 8 | `nomenklatura xref` and `dedupe` on that entity file. A person makes the merge judgements. Do not send the corpus to OpenSanctions or yente in this milestone. |
| 6 | Append canonical ids and judgements as new ledger events. Three shared-entity queries across agencies and three missing-property queries (Person with no affiliation, Document with no date, Event with no location). Each hit checked against the source file. |
| 4 | Write down what came back, including entities nomenklatura refused to merge. |

"Infer what is likely in the gap" means a person reading those missing properties and naming the record to request next. It does not mean a model filling in the missing document. Dropping the nomenklatura sqlite file and reloading from the ledger must reproduce the entity file.

## Sequence to v1.0

5 hours a week from 2026-11-27 is 260 hours through 2027-11-26. The sequence uses 256.

| When | Hours | Outcome |
|---|---|---|
| 2027-01-16 | 36 | Milestone 1, above. |
| 2027-03-13 | 40 | Human accepts or rejects extracted entities. Gap list names the next record type to request. Scans get an OCR pass only if milestone 1 showed they dominate. |
| 2027-05-22 | 50 | One real request round on the existing PRR package: record the agency's fee estimate, draft a challenge, draft an escalation to an elected official when the estimate is unreasonable. A person sends. Florida deadline rules stay labeled as workflow estimates. |
| 2027-08-14 | 60 | Later productions loaded the same way. Patterns that survive review are appended to the ledger. The FollowTheMoney file is rebuilt from it. A graph store (HelixDB unless a better permissive one is obvious then) is added only if similarity search is still missing. |
| 2027-11-20 | 70 | The investigation report, grounded in ledger events and evidence ids, and a `v1.0` tag. |

Four hours of slack remain. A scan-heavy corpus consumes that slack. So does standing up Aleph, Datashare, or HelixDB inside milestone 1. FollowTheMoney has had no commits in the eight weeks through 2026-11-22, so the schema is something to pin, not something to wait on.

## Risks

**Second rewrite.** The host application is large, tested, and already a replacement of an earlier Cestus. Foundry is a third system: its own UI, its own database (MySQL), its own ontology lifecycle, and a Rust agent whose source is not in the public repo (open issue #381). Adopting it as the ontology means migrating evidence, approvals, and the UI, and then still building requests, fees, escalation, and the report. That is the year.

**FollowTheMoney is idle, and Aleph is sunset.** The schema to pin is `v3.8.2` / npm 3.8.4. nomenklatura is the maintained half. Aleph Pro may replace the open model later. That is a reason to keep FtM JSON as a projection the ledger can rebuild, and a reason not to import Aleph's database.

**Helix maturity and lock-in.** The engine is active and on v3.7.0, with a container tag line still at v0.0.19 and a TypeScript client on npm (3.2.0) that does not match `main` (4.0.0). Foundry is seven weeks old, has no GitHub release, and one account has the large majority of commits. The query DSL is Helix's. Cypher is a documented partial profile, not a promise that existing Cypher will run. Lock-in stays tolerable while Helix is a projection: the ledger can rebuild it. Lock-in becomes the product if Foundry's MySQL store or the agent's schema is the source of truth.

**License.** Both repositories are Apache-2.0, confirmed in the repo `LICENSE` files and GitHub license metadata. Foundry's README says the three container images are Apache-2.0 as well. The ontology-agent image is published; its source repository is an open request. No copyleft term showed up in the files read. Helix Cloud terms of service were not read. They can differ from the Apache code.

**Privacy of the records.** These are detention records. Foundry's local defaults phone home query shape and product-usage events. The local app has no authentication, so any tunnel is a full compromise, which its own README states. Helix Cloud and `foundry.helix-db.com` put the corpus on Helix's infrastructure. The corpus stays in an account the owner controls, telemetry off, no sample-company upload, no Foundry Cloud account for these files. Cestus's ledger rules (append-only, secret-safe logs, human send) stay in force for whatever is loaded.

**AWS cost.** Startup credits can pay for one small VM and a disk or an S3 bucket. They do not, on any evidence gathered here, pay a Helix Cloud or OpenSanctions invoice. Milestone 1 is a Python tool and the existing ledger. It does not need a new database server. The cost that will matter later is model calls if an extractor or an ontology agent is pointed at the productions.

## OSS ontology survey (2026-11-27)

Question: what already exists that Cestus can project into, instead of growing its own ontology past the ledger. Nothing here was executed. Facts are from GitHub metadata, READMEs, and the files named below. Hour figures are planning estimates for a projection beside the ledger, not a replacement of it. Contributor counts are the length of GitHub's contributor list (`per_page=1`, last page). That list includes bots.

Investigative tools first. OCCRP's open Aleph is sunset. `alephdata/aleph` `README.rst` says maintenance ended after 2025-12-31, the team rewrote Aleph for Aleph Pro, and the default branch `develop` is unreleased. Last release `4.1.7` (2025-10-27). Zero commits in the eight weeks through 2026-11-22. 79 contributors, 371 open issues, MIT. Compose (`docker-compose.yml`) runs Postgres 10, Elasticsearch, Redis, RabbitMQ, `ingest-file` image 4.1.2, the API, and a UI. Source contains `aleph/authz.py` and `aleph/oauth.py`. `requirements.txt` pins `followthemoney==3.5.9`. `alephdata/ingest-file` is AGPL-3.0, archived, and carries the same sunset notice. Its README describes extractors that emit FollowTheMoney entities from text, images, HTML, PDF, email, and archives. This pass did not find an OCR call in that README. Adopting the Aleph application would be another host, on a codebase its authors have left.

The part that is still the domain model is FollowTheMoney (`alephdata/followthemoney`, MIT). Last release `v3.8.2` (2025-03-24). The JavaScript model on npm is `@alephdata/followthemoney` 3.8.4 (2025-05-13). Zero commits in those same eight weeks. 35 contributors. Schemas include Person, Company, Organization, Document, Event, CourtCase, and Mention. `Mention.yaml` requires `document` and `name`, and may point `resolved` at a `LegalEntity`. `Document.yaml` stores `contentHash` and `bodyText`. `Interval.yaml` warns that intervals are not graph edges. There is no character-offset field on Mention.

Resolution is `opensanctions/nomenklatura` (MIT). Release `4.17.3` (2026-10-21). Still committing (2 commits in the week of 2026-11-22). 18 contributors. README: xref candidates, a SQLite resolver of same/not-same judgements, a console dedupe UI, export of merged FtM JSON. It does not extract entities and it does not OCR. `opensanctions/yente` (MIT, `v5.5.1`, 2026-10-30, 19 contributors, pushed 2026-11-26) is a FastAPI service for search and match of FtM entities, including custom watchlists, over Elasticsearch or OpenSearch. Its README says a commercial context may need an OpenSanctions data license separate from the MIT code. OpenTelemetry export is opt-in via `opentelemetry-instrument`. Milestone 1 does not call yente.

Datashare (`ICIJ/datashare`) is the live journalism document tool. AGPL-3.0. Release `21.27.0` (2026-11-26). 95 commits in the week of 2026-11-22. 20 contributors. README: self-hosted ingest of PDFs, email, spreadsheets, images, and archives; text extraction including OCR; named entities; REST API. `TesseractOCRParserWrapper.java` wraps Apache Tika's `TesseractOCRParser`. `NamedEntity.java` exists. Stack in the README: Elasticsearch 8, Postgres, Redis, Java, Vue client in `ICIJ/datashare-client`. `COOKBOOK.md` is referenced for OAuth. No graph query language and no missing-edge API showed up in the README sections read. Running it is a second platform. Linking it into the Cestus process would raise AGPL obligations; a separate unmodified server is a smaller surface, and that legal reading was not reviewed by counsel.

| Rank | Project | License | Last release / activity | What it actually covers | Hours beside the ledger |
|---|---|---|---|---|---|
| 1 | FollowTheMoney + nomenklatura | MIT / MIT | FtM `v3.8.2` (2025-03-24), idle 8 weeks. nomenklatura `4.17.3` (2026-10-21), active | Investigative schemas, document and mention links, human entity resolution. No OCR. No passage offsets. JS model plus a Python resolver. No telemetry found in the READMEs read | 36, and this is milestone 1 |
| 2 | Datashare | AGPL-3.0 | `21.27.0` (2026-11-26); ~50–160 commits most recent weeks | OCR (Tesseract), NER, search, REST, self-host. Auth/OAuth documented as a cookbook topic. Not a graph | 50–80 to operate the sidecar and map hits back. Not milestone 1 |
| 3 | HelixDB (prior section) | Apache-2.0 | Engine `v3.7.0` (2026-11-11); container tags `v0.0.x`; npm client lags `main` | Graph, vector, BM25, TS DSL, HTTP. No ingest, no OCR, no resolver, no investigative schema | Was 36 for a hand-written schema. Now later, and only for similarity search |
| — | Aleph (the app) | MIT, depends on AGPL ingest-file | Sunset after 2025-12-31. `4.1.7` | Full investigative UI: collections, xref, auth. Postgres, ES, Redis, RabbitMQ | Do not start. The authors stopped |
| — | yente | MIT | `v5.5.1` (2026-10-30), active | HTTP match against FtM datasets and custom watchlists. Needs ES/OpenSearch. Data license is separate | 15–25 later, for a watchlist check. Not the I-4 merge |
| — | Graphiti (`getzep/graphiti`) | Apache-2.0 | `v0.32.1` (2026-11-24), "Kuzu removal". 33 commits the week of 2026-11-22. 66 contributors. 586 open issues | Temporal edges, episode provenance, custom Pydantic types. Stores: Neo4j, FalkorDB, Neptune, Relate. `examples/gliner2/gliner2_neo4j.py` still constructs `GeminiClient` and `GeminiEmbedder`. No OCR | 40–60, plus a store and a model. Text leaves the machine unless a fully local path is proven. That path was not proven |
| — | Cognee | Apache-2.0 | `v1.6.11` (2026-11-26). Hundreds of commits a week. 339 contributors | Local GLiNER extraction when no LLM key is set (README). Agent memory, not an investigative schema. `TELEMETRY_DISABLED` turns telemetry off. Cloud contract says cloud events omit customer content. The OSS payload is a larger profile; its fields were not inventoried | 40, and the default telemetry has to be turned off before any detention text is loaded |
| — | Microsoft GraphRAG | MIT | `v3.3.0` (2026-10-08). README: maintenance mode, no new features. ~1 commit most weeks. 51 contributors | LLM pipeline from text to a graph used for Q&A. No OCR. No HTTP product. No resolver | 30 to index a corpus and ask questions. Wrong shape for a ledger projection a person audits |
| — | LightRAG | MIT | `v1.5.8` (2026-11-23). Commit counts for the weeks of 2026-11-08, 2026-11-15, and 2026-11-22: 524, 840, 499. 426 contributors | Server, REST, Docker. README: binds `0.0.0.0` with authentication off until `LIGHTRAG_API_KEY` or `AUTH_ACCOUNTS` is set. LLM. MinerU/docling optional for parsing | 25–40. Auth-off default is disqualifying for this corpus until configured. Still an answer engine |
| — | LlamaIndex PropertyGraph | MIT (repo) | llama_index `v0.14.26` (2026-11-13). 2012 contributors on the monorepo | Python `llama-index-core/.../property_graph`. LLM extraction into a store you bring. A TypeScript PropertyGraph equivalent was not verified | 30, and you still need a store and a model |
| — | Neo4j Community + neosemantics | GPL-3.0 server (`neo4j/neo4j` `LICENSE.txt`). n10s Apache-2.0, Neo4j Labs, "not part of Neo4j's supported product". Driver `neo4j-driver` 6.3.2 Apache-2.0 | n10s `2025.06.1` (2026-06-16). 24 contributors | Cypher, RDF import/export, SHACL. No OCR, no NER. AWS is Docker or commercial Aura | 30–40. GPL on the server is a worse fit than Helix for the same "empty schema" job |
| — | TerminusDB | Apache-2.0 | Stable `v12.0.9` (2026-10-28). `v12.1.0-rc5` is a prerelease. 50 contributors | Versioned document graph, WOQL/Datalog, TS client `@terminusdb/terminusdb-client` 12.0.0. No OCR, no NER | 40. Versioning is not a reason to leave the Cestus ledger |
| — | Apache Jena / Fuseki | Apache-2.0 | Tag `jena-5.6.0` (2025-10-10). `main` still moves (8 commits the week of 2026-11-22). 152 contributors. GitHub Releases is empty; tags are the release record | SPARQL HTTP, RDF, OWL, SHACL. `FILTER NOT EXISTS` can express missing edges. No OCR, no NER. No investigative schema | 40. Right tool for publishing linked data later. Wrong first schema |
| — | Weaviate | BSD-3-Clause outside `wl/`; `wl/` is an enterprise license (`LICENSE`) | `v1.41.0` (2026-11-23). 192 contributors | Vector database with object filters and references. Official `weaviate-client` (BSD-3-Clause). Not an ontology. Outbound generative modules were not inventoried | 25 for embeddings of passages. Does not resolve entities |
| — | Kuzu | MIT, archived 2025-10-10, last release `v0.11.3` the same day | Dead | Embedded Cypher, vector, FTS | 0. Do not adopt. Graphiti's `v0.32.1` notes say Kuzu was removed |
| — | Ladybug (Kuzu successor) | MIT | Repo created 2025-10-07. `v0.23.0` (2026-11-25). Pushed 2026-11-27 | Embedded Cypher, FTS, vector, object storage (README). No ontology, no OCR | 20 for a store. Younger than Helix and not a schema |
| — | OpenCTI Community | Apache-2.0 community; enterprise separate (`LICENSE`) | `7.261127.0` (2026-11-27). 223 contributors. TypeScript | STIX threat-intel graph, connectors, dedup, a large UI. Elastic, Redis, RabbitMQ, MinIO. Auth exists because it is a multi-user app; the auth design was not read | 80 or more, and the ontology is the wrong domain |
| — | TypeDB | MPL-2.0 | `3.15.0` (2026-11-16). 97 contributors | TypeQL, strong schema, reasoning. No OCR, no NER. A TypeScript driver was not verified in this pass | 40 |
| — | FalkorDB | SSPL-1.0 or AGPL-3.0, either (`LICENSE`) | `v4.22.5` (2026-11-26). 82 contributors | Cypher graph aimed at GraphRAG. No investigative schema | Reject on license for a host. Graphiti offers it as a backend |
| — | Apache AGE | Apache-2.0 | Latest tag seen is prerelease `PG15/v1.8.0-rc0` (2026-09-19). 118 contributors | openCypher subset inside Postgres. No OCR, no NER | 25 if Postgres is already wanted. It is not |
| — | Memgraph | Business Source License 1.1, text dated 2026-01-01, change date printed as `2030-21-10` | `v3.14.0` (2026-10-21). 90 contributors | In-memory Cypher. The grant forbids offering it as a database service and forbids a competing product | Reject. The change date is not a real calendar date; the restriction is |

Ranked three: FollowTheMoney plus nomenklatura, then Datashare, then HelixDB.

Against the Helix projection plan: Helix still has the cleanest permissive TypeScript API for graph plus vector search, and it still has no entity model and no resolver. FollowTheMoney already is the model investigative desks use, and nomenklatura already stores human same/not-same decisions. That is the gap Cestus would otherwise spend the 36 hours inventing. Datashare is the only candidate here with verified Tesseract OCR, and adopting it means an AGPL Java/Elasticsearch platform for a job a later `tesseract` or `ocrmypdf` pass can do in the 20 hours already set aside for scans. Graphiti, Cognee, GraphRAG, LightRAG, and PropertyGraph all want a model in the extraction path. GraphRAG's own README says it is in maintenance mode. LightRAG's server is open until auth is configured. Cognee phones home unless disabled.

The recommendation changes in one place. Milestone 1 targets FollowTheMoney and nomenklatura. The ledger stays canonical. Aleph the application, Datashare, Foundry, and a hand-written Helix schema stay out of those 36 hours. HelixDB moves to the August milestone, and only if shared-entity queries are not enough.

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
- Every candidate in the survey was read, not run. No xref, no Tesseract pass, no SPARQL query, no Graphiti ingest.
- Whether `ingest-file` performs OCR. The README lists images and PDFs and does not say Tesseract. Aleph's user docs were not re-read for the OCR claim.
- Aleph outbound telemetry. `aleph/metrics.py` exists. What it exports was not read.
- The field list of Cognee's non-cloud telemetry payload. `TELEMETRY_DISABLED` is documented. The cloud contract's "no customer content" rule is for `TELEMETRY_ORIGIN=cloud`.
- A fully local Graphiti extraction path. The GLiNER2 example still constructs Gemini clients.
- A TypeScript LlamaIndex PropertyGraph, and a TypeScript TypeDB driver.
- OpenSanctions data-license terms for a non-commercial investigation. yente's code license is MIT; the README separates the data license.
- Aleph Pro's terms. The sunset notice points at a commercial platform. Those terms were not read.
- Counsel's reading of AGPL if an unmodified Datashare server is queried from Cestus.
- Weaviate phone-home behavior.
- Ladybug contributor count and whether its object-storage mode is production-ready. README claims were not executed.
- Memgraph's change date `2030-21-10` is printed that way in `licenses/BSL.txt`. What the licensor meant is unverified. The use restrictions in the same file are plain.

## Sources

- Cestus `16045d2c`. `SECURITY.md`. Package sources cited above. Two `npm run verify` logs, plus separate assurance and UI build. Ingest probe under `/tmp`, not committed.
- `HelixDB/helix-foundry` `750f616`: `README.md`, `LICENSE`, `compose.yaml`, `local/compose.yaml`, `backend/ontology/ontology.go`, `backend/document/read/pdf.go`.
- GitHub API, 2026-11-27: repo metadata, releases, contributors, `commit_activity`, open issues, `ghcr.io/helixdb/helixdb` versions.
- npm registry: `@helix-db/helix-db` versions through 3.2.0.
- `HelixDB/helix-db` README and `sdks/typescript/package.json` via the GitHub contents API on the default branch.
- Survey, GitHub API on 2026-11-27, plus the files named in the survey section: Aleph `README.rst` and `docker-compose.yml`; `ingest-file` README and license; FollowTheMoney `Mention.yaml`, `Document.yaml`, `Interval.yaml`; nomenklatura and yente READMEs; Datashare README and `TesseractOCRParserWrapper.java`; Graphiti README and `examples/gliner2/gliner2_neo4j.py`; Cognee `exception_telemetry.py` and `docs/cloud-telemetry-contract.md`; GraphRAG README (maintenance-mode notice); LightRAG README (bind and auth); Neo4j `LICENSE.txt`; neosemantics README; Weaviate, OpenCTI, FalkorDB, and Memgraph license files; Kuzu archive notice; Ladybug README. npm: `@alephdata/followthemoney`, `neo4j-driver`, `weaviate-client`, `@terminusdb/terminusdb-client`.
