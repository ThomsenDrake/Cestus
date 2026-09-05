# Cestus: a usable personal investigation product

Date: 2026-09-04. Status: proposed implementation plan; implementation has not started.

User direction: make Cestus usable for the owner's real investigations, with a functioning **shared ontology that detects recurring patterns across seemingly unrelated cases and events**, **infers plausible explanations for gaps and pursues evidence to test them**, and an **external provider as the primary analysis engine**. This plan does not use the Compound Engineering workflow. It is the single plan for this outcome; older specifications provide requirements and history, not a mandatory sequence of implementation slices.

## The outcome

Starting with an empty workspace and actual records from multiple cases, the investigator can:

1. Create an investigation with a question, scope, notes, and selected records.
2. Import records, read originals and extracted text, and search their contents.
3. Authorize selected content for analysis by a configured external provider.
4. Review proposed facts, entities, and relationships beside their exact source passages; edit, reject, or accept them.
5. Explore the shared ontology across cases, resolve identities, preserve disagreements, and correct mistakes without losing history.
6. Detect recurring actors, relationships, real-world event sequences, and structural patterns across cases; inspect the supporting and contradicting evidence for each proposed pattern.
7. Identify the shape of a missing connection, occurrence, or explanation; compare hypotheses; and run bounded evidence searches that can support or disprove them.
8. Ask evidence-grounded questions, examine connections and timelines, and prepare cited notes, report drafts, and records-request drafts.
9. Restart, back up, restore, and continue the investigations without fixtures, SQL edits, or an agent repairing the environment.

A completed job must produce a useful result or an explicit, inspectable no-result outcome. A saved handoff, valid JSON, or a template with attached evidence IDs is insufficient.

## Scope and settled choices

- One investigator, one active local portable workspace, and named investigations/cases within it. **Cases are working sets and investigative questions over one shared ontology, not separate knowledge stores.** Evidence, entities, assertions, and real-world events may belong to multiple cases without duplication. Sources and canonical artifacts remain local; selected analysis content goes to the approved external provider.
- Use the existing local server to serve both the built UI and APIs. Start with loopback; retain existing authenticated tailnet support as an optional access mode. Do not introduce a hosted backend or require Tailscale for personal local use.
- Keep SQLite, the append-only ledger, content-addressed artifacts, and rebuildable projections. Add the missing product commands and query surfaces around them.
- Start with one external provider/model configuration. Reuse the existing compatible transport where it meets requirements; verify the chosen endpoint's actual structured-output, document/OCR, timeout, and retention behavior before implementation relies on it. If it cannot process scans, add one focused OCR integration or keep scans visibly unsupported until that integration is ready.
- AI proposes knowledge. The investigator controls acceptance, identity decisions, corrections, and schema changes. The manual review/correction path works when the provider is unavailable.
- Evidence-seeking is part of the product: a user-initiated investigation run may search local records and use explicitly enabled public-source research tools within its approved disclosure scope, time/cost limits, and action permissions. Guesses remain hypotheses. The run must search for alternatives and disconfirmation and stop with an honest unresolved result when support is insufficient.
- Provisional corpus: mixed public-records PDFs, scanned pages, CSVs, and text from at least three cases, including apparently unrelated cases. The actual investigations, formats, volume, sensitivity, and desired output are still unspecified. Phase 1 fixes these from the user's example; no claim of general document-format or million-assertion readiness is made. Cross-case analysis is a launch requirement, not a later scale feature.
- Preserve every invariant in [SECURITY.md](../../SECURITY.md). Sending correspondence, publication, legal action, and sensitive transfers keep their applicable human gates. Existing approvals must be revalidated when consumed.

## What is actually built

| Area | Reuse | Gap to personal usefulness |
| --- | --- | --- |
| Workspace and storage | Portable create/mount, SQLite transactions, blobs, configuration, built-UI server | Onboarding is fragmented; loopback currently bypasses authentication and uses a default human actor; some health labels report configuration or hardcoded success rather than live state. |
| Ingestion | CLI import, bounded scans/ZIP handling, hashes, duplicate occurrences, import approvals | Normal HTTP ingestion lacks the mounted resolver; UI lacks source register/select/scan; import queues parse jobs without completing extraction. |
| Evidence | Metadata, provenance, governance, candidate preparation | No document-content viewer, source-passage navigation, or full-text document search. |
| Ontology | Scalar assertion proposal/human acceptance, graph replay, read-only UI | No full review/correction or entity/relationship write workflow; no persisted investigation management; assertion values are omitted from the browser DTO. |
| AI | Real provider transport, approval checks, specialist runners, artifact/handoff storage | Mounted remote work can request approval and remain waiting; production advisory paths use canned results. A configured API key does not complete the execution path. |
| Evidence pursuit | Planning and contradiction output contracts, existing task/tool boundaries | No production corpus-search/public-research tool; inquiry predictions/actions/outcomes are not linked; planner validation currently rejects an empty gap list even though its prompt permits one. |
| Recovery | Layout checks, diagnostics, backup-manifest summaries | No demonstrated backup-copy/restore operation covering the actual investigation. |

These findings are based on production wiring as well as library code. Previous verification of this checkout passed 3,956 tests, with five skipped, plus typecheck and UI build. That is a regression baseline, not proof of the user journey above. The earlier simplification patch remains uncommitted and must be preserved or integrated before implementation diverges.

## 1. Establish a dependable workspace and a real acceptance corpus

**Deliverable:** the owner can start Cestus, create/open a workspace, and identify what is available without interpreting development internals.

- Make the existing portable-workspace configuration and built-UI server the documented personal-use path. Display the active workspace and durable storage location safely. Keep development seed data off.
- Establish an authenticated local operator session before enabling evidence reads, transfer approvals, or ontology writes. Reuse the existing local bootstrap/session mechanisms where suitable, but remove the production loopback authentication bypass: a loopback address is not a human identity. Bind review/approval actions to the configured operator's authenticated session, with browser-origin/CSRF protections and safe credential handling. Retain authenticated tailnet access without requiring it for local use.
- Fix the Command-screen New request action. Remove hardcoded sync-success badges and inert controls; show search only when it performs a search. Remove superseded detail-rail code and write-only state where caller inspection confirms they are unused.
- Make health checks contact the running backend; distinguish stopped, unmounted, unavailable, processing, and ready states. Keep meaningful existing operator diagnostics.
- Select a small copy of the first real corpus with known answers across at least three cases. Include a verified shared actor, a similar event/relationship pattern involving different actors, an unrelated negative-control case, duplicate files, two similarly named people/organizations, a conflicting fact, a changed source, and a corrupt or unsupported file. Add withheld evidence that distinguishes two plausible explanations for a gap, including a result that disproves the initially favored explanation. Include scans if they matter to the investigation. Use public/synthetic supplements where the user's records do not supply a particular control.
- Establish the first corpus's document/page/byte counts and sensitivity. Mark any unsupported format explicitly. Agree a modest growth fixture and collect baseline timings on the owner's machine.
- Document a stopped-runtime copy of the workspace before changes to existing data. New work starts in a disposable workspace until restore has been demonstrated.

**Acceptance:** start through the actual server, establish the local session, create a record, restart, and recover it. Unauthenticated and unauthorized cross-origin requests cannot read protected records, approve external transfer, or append review decisions; client-supplied actor fields cannot impersonate the operator. The default button works. Missing storage produces an actionable unavailable state and no fallback writes. No fixture rows or false health claims appear.

Primary code: `packages/local-runtime/src/{cli,config,config-file,auth,server,http-handler}.ts`, `packages/ui/src/App.tsx`, `packages/ui/src/workspace/*`, `packages/workspace-ops/src/*`.

## 2. Make records readable and searchable, including real extraction

**Deliverable:** import a real source folder, inspect its documents, and find a passage by its contents.

- Wire ordinary HTTP ingestion to the current portable mount, with an appropriate human-import capability. Do not simply reuse the resident-boundary resolver: it deliberately has no blob-write authority.
- Add source register/select/scan, import review, and reopening of persisted source/import state to the UI. Scanning must not alter sources. Reimport deduplicates canonical content while preserving each source occurrence.
- Execute the existing queued parse jobs. Support the formats required by the first corpus: simple local decoding for text/CSV and appropriate PDF extraction/OCR. Do not claim Office, mailbox, or arbitrary archive support without a working path.
- Store original bytes immutably. Store extraction outputs with source hash, parser/provider/model identity, extraction version, and stable locators: page/block/span for documents and row/cell for tables. Source changes create a new version; old citations continue to address the old bytes.
- Expose authorized evidence-ID-based original and derivative reads. A known blob hash or client-supplied filesystem path does not grant access. Render imported content safely and apply current governance on reads.
- Build an evidence reader showing original and extracted content, processing failures, and provenance. Add a rebuildable SQLite full-text index with snippets, filters, pagination, and navigation to exact source locations.
- Implement actual retry/recovery semantics for interrupted parsing. A corrupt, encrypted, unsupported, or incomplete file must not receive a successful extraction label.

### Shared external-processing path

Complete this once for both document processing and the later analysis workflow:

- Configure a real provider server-side and display only safe provider/model/readiness information. Do not silently select the fake provider when configuration is missing.
- Reuse the approval UI and kernel checks. Bind approval to an exact bounded document/page/chunk selection, content identities, destination/model, operation, and budget. Resolve any required mounted/factory authority before enabling the currently blocked transfer path.
- Show what will leave the machine and an honest volume/cost estimate when available. Confidential or secret-bearing material must receive its required classification/redaction/approval before transfer; inability to establish that posture blocks those records.
- Revalidate content, policy, authority, and approval immediately before sending. An exact approved batch may cover its declared chunks; it must not silently authorize later documents or a changed destination.
- Persist queued/running/completed/failed/canceled/uncertain state and invocation identity. Add timeouts, response-size and token/page/cost limits, bounded concurrency, cancellation, and validated output handling.
- On a timeout after submission, preserve uncertain remote completion rather than silently issuing another paid call. Use provider idempotency where available and make potentially billable retries explicit.

**Acceptance:** import and reopen real records through the browser; read text and a scanned page if scans are in scope; search for a phrase absent from the filename; click to the right passage. Duplicate paths share canonical bytes. Changed or unapproved content produces zero external requests. Timeout/restart leaves a recoverable job and no duplicate local proposals.

Primary code: `packages/ingestion/src/{runtime,parser,provider-adapter,read-api}.ts`, `packages/local-runtime/src/{ingestion-http-routes,ingestion-runtime-factory,evidence-http-routes,agent-runtime-mounted-task,agent-provider-readiness}.ts`, `packages/agent/src/{openai-compatible-provider,specialist-runner-kernel}.ts`, UI ingestion/evidence/approval adapters and workspaces.

## 3. Deliver the functioning ontology and AI-to-review path

**Deliverable:** the provider extracts meaningful candidates from records; the investigator turns them into useful, correctable knowledge through the UI.

### Shared knowledge model

Define this bounded contract early in Phase 2 so extraction, review, and graph work agree:

- **Investigation/case:** question, scope, notes, memberships, and claims. Membership organizes shared knowledge; it does not change an entity's identity or turn a case hypothesis into a global fact.
- **Evidence reference:** evidence identity/content hash, extraction/version identity, precise source locator, and the cited passage or table value.
- **Assertion:** subject/entity candidate, typed predicate and value or entity reference, relevant date/time qualifiers, one or more evidence references, proposal/review state, and extraction/review provenance.
- **Entity:** workspace-wide stable identity, type, labels/aliases, reviewed identifying assertions, and explicit bindings from source mentions across cases.
- **Relationship:** typed endpoints, supporting assertions/citations, temporal qualifiers where needed, and human review history.
- **Occurrence:** a real-world event such as an award, payment, appointment, meeting, or ownership change, distinct from a ledger event. Record its type, participants and roles, supported attributes, location/jurisdiction where known, and evidence-backed time or interval. Keep occurrence/valid time separate from publication, discovery, and ingestion time; preserve uncertain dates.
- **Claim:** an investigation hypothesis with explicit supporting/contradicting assertions and investigator notes. Keep hypotheses, proposed model output, and accepted assertions distinct.
- **Pattern hypothesis:** a saved cross-case finding with its scope, query/analysis revision, supporting occurrences/relationships, alternative explanations, counterexamples, citations, and review state. It does not create an accepted causal relationship merely because a model reports a recurrence.
- **Investigation gap:** an explicit unanswered question bound to the current evidence/knowledge revision, the facts surrounding it, the expected-but-unobserved information, and the limits of source coverage. Missing information is not itself evidence that an event occurred or failed to occur.
- **Gap hypothesis and evidence task:** a proposed explanation, its supporting constraints/analogies, competing explanations, predicted observations, disconfirming observations, and specific evidence-acquisition tasks. Track research scope, queries, source provenance, actions, findings, and unresolved status independently of accepted ontology facts.

Ship a small reviewed vocabulary appropriate to the actual corpus, such as people, agencies, organizations, contracts, transactions, and addresses. Enforce predicate value types, relationship endpoint types, references, and required evidence. Permit explicit additive schema changes; unfamiliar model terms remain proposals. Avoid a general ontology editor or inference platform.

### Commands, review, and identity

- Extend the existing ontology services rather than introducing a second agent-owned graph. Manual and provider candidates use the same contract; the UI and agent executor call the same domain commands.
- Deliver minimal persisted case creation/selection and evidence/knowledge membership commands here, before cross-case acceptance. Attaching one record to a second case reuses its canonical identity. Removing a case membership does not retract shared knowledge. Case-specific hypotheses can disagree without overwriting shared reviewed assertions.
- Add authenticated APIs and UI for accept, reject, edit-as-new-proposal, withdraw, supersede/correct, and preserve a dispute. Derive the acting human from the trusted runtime/session; a browser-supplied actor field is not authority.
- Show the assertion's actual value and source passage together. Support an explicit selected group of decisions in one review action, with validation at commit. Ordinary review should not require approving several wrappers around the same decision.
- Suggest possible entity matches across the workspace, using available identifiers and attributes with source support. Let the investigator bind a mention to an existing entity or create a distinct one. Name similarity or model confidence cannot silently merge identities. Distinguish an uncertain possible match from a reviewed shared identity.
- Add entity/relationship write services with validation of endpoint types, exact accepted support, and current schema. Use bounded conditional `appendBatch` transactions where one decision emits several interdependent events; both ledger implementations must provide all-or-none behavior and retry-safe decision identity.
- Provide identity-binding correction at launch, including repairing an incorrect cross-case link and recalculating affected views/findings. Keep duplicates visible. Defer arbitrary bulk entity merge/split machinery until actual records demonstrate the need; shared identity and reversible mention reconciliation are required immediately.

### Real analysis and useful graph views

- Replace production canned triage/planning output with real provider calls over the selected, approved source content and the active schema. Reuse the completed Phase 2 transport and authority path.
- Validate response shape, known types, references, and source anchors before presenting candidates. Ground locators against stored source content; a model-provided citation string is insufficient.
- Record provider/model, prompt/schema version, source set, invocation, and output artifact identity. Treat model confidence as a model score, not a calibrated probability of truth.
- Expand the current ontology interface into workspace-wide entity search, entity dossiers, assertion values, real-world occurrences, filtered relationships, and bounded graph neighborhoods. Show which cases contain each item and offer both within-case and cross-case views. Selecting a fact, occurrence, or edge opens its source passage and review history.
- Maintain one normalized knowledge projection. Withdrawal/correction changes dependent current graph and claim views deterministically while preserving the original events and historical explanation. Contradictory values remain visible.
- Separate source independence from case membership. The same document copied into several cases, several reports quoting one source, and multiple mentions of one occurrence must not inflate corroboration or recurrence counts. Preserve uncertainty when source lineage or occurrence identity cannot be resolved.

### Existing-data compatibility

The current event base and validator hardcode version 1, and assertion payloads permit only one evidence ID and scalar values. Introduce version-aware event decoding before emitting richer assertion versions. Preserve all existing events unchanged; normalize old and new records into the shared projection. Label old whole-document citations honestly rather than inventing passage anchors. Update report/timeline/accepted-graph callers through compatibility adapters. Persist the exact schema snapshots required for replay; schema updates must not silently reinterpret old accepted material.

**Acceptance:** from a fresh workspace and real provider run, review extracted facts, occurrences, and relationships from several cases into one nonempty ontology without fixture injection or SQL edits. A changed amount/name/date changes the proposed fact. A verified actor appearing in two cases has one shared identity and both sets of sources; two unrelated same-name actors remain distinct. Two sources can support one fact, while copied sources do not become independent corroboration. Fabricated citations cannot be accepted. Editing, rejection, correction, retraction, and cross-case identity reassignment survive restart. Stale review or an injected crash cannot leave half a graph decision committed.

Primary code: `packages/ontology/src/{contracts,event-ledger,sqlite-event-ledger,assertion-service,domain-packs,graph-projection,ontology-workspace-read}.ts`, focused new ontology command services, `packages/local-runtime/src/ontology-http-routes.ts`, ontology/evidence UI adapters and workspaces, existing agent extraction/runner/handoff consumers.

## 4. Investigate connections and recurring patterns across cases

**Deliverable:** the investigator can discover a connection they did not already know to search for, compare cases, challenge a proposed pattern, and save a cited work product.

- Extend Phase 3's persisted cases and memberships with notes, hypotheses, supporting/contradicting links, and unresolved questions. Permit selecting all accessible cases or an explicit subset for comparison. Keep this a coherent investigator workspace rather than adding another administrative cockpit.
- Support a bounded question such as “Which vendors connect to this official, and what supports those links?” Retrieve the relevant accepted graph and source passages; show unresolved candidates separately. Return navigable relationships and citations, or explicitly say the evidence is insufficient.
- Build sourced timelines and gap analysis from the same normalized knowledge projection. Remove template outputs from production paths. A suggested next action must refer to a particular unresolved issue in the selected investigation.
- Add a user-triggered **Find patterns across cases** operation. Generate candidate connections using shared reviewed identities, relationship neighborhoods, typed occurrence attributes, temporal sequences, and recurring structural arrangements. This must go beyond shared names or keywords: similar roles and event sequences involving different actors are in scope.
- Use indexed graph/occurrence retrieval and bounded case/occurrence summaries to select comparisons, then use the primary external provider to interpret and explain candidate patterns against exact source passages. On the small launch corpus, examine all eligible cases; on larger corpora, disclose the compared scope and retrieval limits. Never claim absence of a pattern from unexamined cases. Add embeddings only if evaluated semantic-retrieval misses justify them; they are not a prerequisite or evidence of a connection.
- Present each finding with the cases and occurrences involved, timeline/relationship comparison, independent-source and occurrence counts, relevant differences/counterexamples, source citations, and an explanation of why it was flagged. Common addresses, shared industries, reused boilerplate, chronology errors, and sampling bias must be considered as possible mundane explanations. Recurrence alone does not establish coordination or causation.
- Let the investigator dismiss, annotate, preserve, or pursue a pattern hypothesis. Display tentative identity links separately. Reviewing a pattern does not automatically accept its component facts or a causal allegation.
- Bind pattern runs to the exact knowledge/evidence revisions they examined. When new evidence or a correction changes support, mark affected findings stale and offer a scoped rerun. Reuse bounded job execution; a general autonomous agent loop is unnecessary.
- Apply governance during cross-case retrieval, provider transfer, source inspection, and report generation. A case association cannot broaden access or transfer permission for its records; explanations and counts must not reveal excluded material.
- Produce editable local report/brief drafts with passage-level citations, exclusions, contradictions, and unresolved risks. Saving or copying a local draft does not publish it. Apply current governance when generating any export artifact.
- Keep existing PRR draft creation. Add persistent manual recording of requests sent outside Cestus, correspondence/responses, dates, and links to imported evidence as required by the first investigation. A suggested request opens an editable draft; it does not send it.
- Connect global search to records, entities, assertions, and investigations with consistent navigation. Keep graph rendering bounded; searchable dossiers and relationship tables remain usable without a graph canvas.

**Acceptance:** discover a planted shared-actor connection across cases without being given that actor as the query; discover a planted repeated relationship/event structure across cases with different names and filenames; and preserve a clean negative-control case. Explain both patterns through actual source passages and relevant differences. Do not turn a duplicate document, shared registered address, or two same-name people into independent corroboration or a confirmed connection. Changing a relevant accepted fact or correcting an identity marks/revises the affected finding. Respect uncertain event dates. Refuse or qualify an unsupported question. Save and reopen a pattern, cited note/report, and request/response with linked documents.

Primary code: ontology query/claim services, current evidence/ontology/requests UI, `packages/agent/src/{investigation-planner-workflow,prr-negotiation-workflow,specialist-runner-kernel}.ts`, mounted runner composition, existing report and governance-preview boundaries.

## 5. Infer gaps and pursue evidence that can resolve them

**Deliverable:** Cestus can propose what may occupy a gap, explain that guess, and actively seek evidence that tests it through a bounded investigation run.

### Describe the gap before guessing

- Detect and let the investigator create gaps such as a missing participant in an otherwise supported relationship chain, an unexplained interval in an event sequence, a discrepancy between supported totals, incompatible accounts, or a missing record normally produced by a known process.
- Record which facts constrain the gap, why it matters, and what is unknown about document coverage. Distinguish absence from the current corpus, a failed search, an inaccessible source, and evidence that something did not happen.
- Use shared ontology roles, chronology, known processes, and reviewed cross-case patterns to propose plausible explanations. Analogy can guide a search; it cannot supply facts about the current case.

### Make testable, competing hypotheses

- Generate a small set of materially different explanations, including mundane/data-quality explanations when applicable. Each includes the assumptions, known supporting facts, predicted records or observations, evidence that would disprove it, and the next useful acquisition step. Allow “insufficient information to form a useful hypothesis.”
- Fix the existing planner contract mismatch before iteration: the prompt permits no grounded gaps, while `investigationPlannerReferencesAreExact` rejects an empty gap list. A no-actionable-gap result must be a successful, honest outcome rather than a reason to invent another task.
- Keep hypothetical participants, occurrences, and links in a clearly marked hypothesis view. Do not create a real accepted entity/relationship or fabricate a name, event, source, or citation to make a graph look complete.
- Rank proposed research by how well it distinguishes the competing explanations, likely source availability, cost, and importance. Do not merely accumulate confirming material or present uncalibrated model scores as probabilities.
- Let the investigator inspect, revise, dismiss, or authorize pursuit of a hypothesis. Authorizing research does not accept the explanation as truth.

### Pursue the evidence within a concrete scope

- Reuse the existing mounted job execution, tool gateway, provider consent, and artifact/provenance stores for a small tool set: local document search/read, ontology/occurrence queries, approved public web search/fetch, public-record download/import, and preparation of local records-request drafts.
- Implement the missing corpus-search/public-search/public-capture tools explicitly; the existing planner's suggestion tools cannot execute them. Save original/final URLs, retrieval time, query/source lineage, immutable captured bytes/document identity, and cited passages. Enforce a public-address boundary through redirects; no arbitrary local/private network fetches. New records enter normal ingestion/governance/review, not an alternate truth store. Search snippets and model-generated URLs are leads until source material is captured. Imported pages and provider output are untrusted data, not instructions granting further tool authority.
- Before a public-research run, show its question, permitted source scope, outgoing query/context disclosure, and step/time/cost limits. Reuse exact scoped approvals rather than requesting another permission for every harmless local read. A changed or sensitive disclosure, new destination outside scope, paid access, authentication, or other newly gated effect requires its applicable decision.
- Allow the bounded run to choose the next permitted search or source from results and revise its hypotheses. Persist the reasoning summary, executed actions, sources examined, observations, spend/limits, and why it stopped. Prevent repeated no-progress searches; pause on limits, uncertain external completion, or missing authority.
- Store one canonical inquiry record/artifact with hypothesis → predicted evidence → action → observation → revised hypothesis links. UI views and task/request suggestions reference it; do not extend the current duplication of full planner payloads into separate plan/task/PRR copies.
- PRR drafting can propose the specific record, likely custodian, date range, and why it distinguishes hypotheses. Sending, legal representations/escalation, contacting people, publication, and other separately gated effects remain explicit human actions. Source acquisition must not bypass access controls.

### Close the loop without manufacturing certainty

- Compare newly acquired evidence with each hypothesis's predictions and disconfirming conditions. Show what strengthened, weakened, or invalidated the explanation and which alternatives remain.
- Present new facts/identity links for the same ontology review workflow. An acquisition task can finish while its investigation gap remains unresolved. “Gap filled” requires the relevant reviewed evidence, not simply a model answer or successful download.
- Maintain supported, contradicted, partially resolved, evidence unavailable, and unresolved outcomes with source-backed explanations. A newly discovered gap may become a follow-up task within the remaining scope; it must not cause unbounded expansion into other investigations or external actions.
- Feed accepted new knowledge back into cross-case patterns and mark old gap/pattern analyses stale when their foundations change. Preserve previous hypotheses and the evidence that defeated them as investigative history.

**Acceptance:** give the system a bounded case with a deliberately withheld intermediary record. It proposes multiple testable explanations from surrounding facts without inventing a named intermediary; finds the distinguishing record in another local case or an approved public source; and presents supported new candidates for human review. A record already in an imported appendix resolves the inquiry without an unnecessary external call. In a paired case, the acquired record must cause it to reject its initially favored explanation. A corpus gap caused only by missing uploads remains unknown, and a no-actionable-gap input completes without inventing work. Unsupported hypotheses never appear as accepted graph links. Exhausted sources/budget stop the run honestly. Restart resumes its saved state without repeating completed acquisition unnecessarily, and no request is sent to a person or agency by the analysis run.

Primary code: `packages/agent/src/{investigation-planner-workflow,context-packs,execution-loop,permission-policy}.ts`, existing tool gateway and specialist runner interfaces, a focused public-research adapter, mounted execution/recovery, shared ontology hypothesis/query services, and the investigation/Agent review UI. Verify actual production callers before choosing an existing orchestration component; do not enable the dormant generic factory simply because this feature needs a loop.

## 6. Prove it can hold a real investigation

**Deliverable:** a daily-use release with demonstrated recovery, bounded performance, and truthful limitations.

- Implement and document a stopped-runtime backup/restore workflow covering the ledger, originals, citation-critical derivatives, schema snapshots, and required workspace metadata. A summary manifest is not a backup. Keep provider credentials outside the portable backup. Restore into a new empty target and verify hashes, identity, and reconstruction.
- Exercise interrupted import, parsing, provider submission, review, and graph commit; disk-full and storage-disconnect behavior; missing/corrupt artifacts; and browser/server restart. Preserve authority checks and avoid fallback writes.
- Add paginated incremental ledger reads and rebuildable SQLite query tables for the actual hot paths. Consolidate repeated full-history projection work. Use full replay for rebuild/recovery, not every interactive view. No graph database, search cluster, or vector service is needed by default.
- Measure startup, import, search, entity detail, review, and graph-neighborhood latency on the actual corpus and its agreed growth fixture. Provisional local UI targets: ordinary search/detail reads under one second at p95 and ordinary review commits under two seconds, excluding provider work. Record machine and corpus size; revise scope transparently if targets fail.
- Run the entire journey through the built UI and real server without dependency injection. Use synthetic/redacted fixtures in automated tests; use only separately authorized records and budget for live provider acceptance. Keep actual investigation content and credentials out of Git and CI.
- Maintain a small hand-labelled sample of critical facts, identities, occurrences, relationships, conflicts, cross-case patterns, and resolvable/unresolvable gaps with negative controls. Report extraction precision/recall, false identity links, false pattern flags, missed expected patterns, citation failures, acquisition results, and whether disconfirming evidence changed the hypothesis. All emitted source locators must resolve; no model output becomes accepted knowledge automatically. Known critical facts, ambiguity cases, and the cross-case/gap-pursuit acceptance examples must pass before defaulting to the model for daily work.
- Run targeted behavioral checks during implementation and `npm run verify` before delivering each milestone. Test user outcomes and recovery rather than file shapes, marker counts, or the presence of a button.

**Release gate:** the owner completes the nine-step outcome at the top on their selected multi-case corpus, verifies the shared ontology and cross-case findings against known records, pursues a gap to a supported or honestly unresolved outcome, restores a backup into another location, and resumes the investigations. Passing the existing test suite alone does not satisfy this gate.

Primary code: `packages/workspace-ops/src/{backup,ops,node-runner}.ts`, `packages/ontology/src/{event-ledger,sqlite-event-ledger,graph-projection}.ts`, relevant read services, browser/integration tests, and one personal-use operations document.

## Execution order and work that can overlap

Phase 1 comes first. Settle the source-anchor and candidate contract at the start of Phase 2. Then document ingestion/viewing, provider approval/execution, and ontology domain commands can proceed independently against that shared contract. Phase 3 integrates all three through the real UI. Phase 4 supplies cross-case discovery; Phase 5 uses that shared knowledge to investigate gaps and acquire distinguishing evidence. Recovery tests and performance measurements start with the first working slice; Phase 6 closes the release gate.

Useful checkpoints are: **read and search records** after Phase 2; **extract and curate a shared, functioning ontology** after Phase 3; **detect patterns across cases** after Phase 4; **form and investigate gap hypotheses** after Phase 5; and **rely on the complete workflow** after Phase 6. Cross-case discovery and bounded evidence pursuit are part of the requested release, not optional follow-ups. Do not postpone usable evidence review while building general autonomous orchestration.

## Delete, constrain, and defer

- Move fake/template providers into explicit test/demo support once the real path replaces them. Remove production success states backed only by placeholder output.
- Remove inert controls, duplicate status displays, the obsolete detail rail, and unused state. Defer decorative graph features until dossiers, citations, and review work.
- Retire unused generic orchestration entrypoints after checking callers and preserving the active mounted path. Do not activate the dormant bounded-loop factory as a prerequisite. Keep consume-time revalidation; investigate replacing artificial create-and-stop wake lifecycles with a focused authority verifier only after boundary characterization.
- Defer local models, subscription harnesses, multi-provider routing, unattended open-ended reasoning, a generic agent platform, mailbox/contact automation, broad portal automation, public publishing, multi-user roles, ontology marketplaces, unrestricted pack migration, and million-assertion capacity claims. The bounded, user-initiated public research and evidence-pursuit loop in Phase 5 is explicitly in scope.
- Do not implement historical specifications 15–28 simply in numerical order. Implement the particular provenance, redaction, transfer, source-currentness, review, and replay requirements needed by this supported path. Any omitted capability must remain visibly unavailable; no safety boundary is bypassed to shorten the plan.

## Decisions still needed from the first investigation

The external-primary AI preference, cross-case pattern-discovery goal, and gap-hypothesis/evidence-pursuit loop are settled. The remaining inputs are example cases/questions, actual file formats and volume, sensitivity/transfer restrictions, desired first pattern/gap/report deliverable, and provider account/endpoint/model plus an allowed evaluation budget. These refine corpus support and acceptance measurements. Planning does not itself authorize sending records to a provider, creating credentials, contacting people/agencies, or publishing anything.

## Current-state evidence

- [HTTP ingestion wiring](../../packages/local-runtime/src/http-handler.ts), [ingestion UI](../../packages/ui/src/ingestion/IngestionWorkspace.tsx), [queued parsing and refused retry](../../packages/ingestion/src/runtime.ts).
- [Metadata-only evidence routes](../../packages/local-runtime/src/evidence-http-routes.ts), [evidence workspace](../../packages/ui/src/evidence/EvidenceWorkspace.tsx).
- [Assertion proposal/acceptance](../../packages/ontology/src/assertion-service.ts), [v1 event contracts](../../packages/ontology/src/contracts.ts), [graph projection](../../packages/ontology/src/graph-projection.ts), [domain packs](../../packages/ontology/src/domain-packs.ts), [ontology read route](../../packages/local-runtime/src/ontology-http-routes.ts).
- [Mounted template/approval paths](../../packages/local-runtime/src/agent-runtime-mounted-task.ts), [provider configuration/readiness](../../packages/local-runtime/src/agent-provider-readiness.ts), [real transport](../../packages/agent/src/openai-compatible-provider.ts), [transfer authority checks](../../packages/agent/src/specialist-runner-kernel.ts).
- [Whole-ledger reads](../../packages/ontology/src/sqlite-event-ledger.ts), [backup-manifest utilities](../../packages/workspace-ops/src/backup.ts).
- Product intent: [ontology provenance](../agentic/specifications/01-ontology-provenance-workspace.md), [evidence review](../agentic/specifications/03-evidence-review-workspace.md), [investigation planning](../agentic/specifications/10-investigation-planning-prr-advice.md), and [original ontology design](../superpowers/specs/2026-06-30-ontology-layer-design.md). Their historical workflow text is not used by this plan.
