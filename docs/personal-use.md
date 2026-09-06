# Cestus personal-use startup, evidence, and recovery

Use Node 24 or newer with built-in `node:sqlite`, and this repository's installed dependencies (`npm ci` for a fresh checkout). The existing production server serves both the built UI and APIs. No service manager, installer, Tailscale, provider account, or development seed is required.

## First disposable workspace

Run from `/home/drake/Projects/Cestus`. These commands keep the config, generated test credential, and portable workspace outside the checkout:

```bash
export CESTUS_TRIAL_DIR="$(mktemp -d /tmp/cestus-trial.XXXXXX)"
export CESTUS_LOCAL_CONFIG_PATH="$CESTUS_TRIAL_DIR/runtime.config.json"
npm run ui:build
npm run local:workspace:create -- --workspace "$CESTUS_TRIAL_DIR/workspace" --label "Personal trial" --created-by "local-operator"
npm run local:runtime:configure -- --storage portable-workspace --workspace "$CESTUS_TRIAL_DIR/workspace" --operator-label "Local investigator" --bind loopback --port 8787 --no-dev-seed --log-dir "$CESTUS_TRIAL_DIR/logs"
npm run local:runtime
```

Open the **browser session URL printed by the server**. It grants the configured operator's session, is usable once, and expires after ten minutes. Keep it private. The HttpOnly, SameSite=Strict session expires after eight hours or a server restart. Restart and open the new link to sign in again. A plain visit to the server displays session-required guidance. Use the same host as the printed link; the cookie is host-specific.

On Command, click **New request**. Choose the applicable jurisdiction pack, fill **Agency name**, **Requester name**, and **Request text**, then choose **Create draft**. Email and phone are optional. An empty submission names the three required fields. An unfiled draft needs no agency receipt timestamp: it appears under **Drafting** with **No deadline**. No correspondence is sent.

Reload, open **Requests**, and confirm the draft remains. Then stop with Ctrl-C, wait for exit, run `npm run local:runtime` again in the same shell, open the new session URL, and find the same draft under Requests, still with **No deadline**. The old browser session stops working after restart; this is expected.

For a durable daily workspace, choose a persistent path instead of `/tmp`. Keep `CESTUS_LOCAL_CONFIG_PATH` outside the portable workspace and set it again in each new shell. `configure` preserves the operator ID and credential unless credential rotation is requested. `--operator-label` changes its display name without changing identity. Do not recreate an existing workspace.

```bash
npm run local:runtime:health
npm run local:runtime:config
```

`health` contacts the configured server with a timeout and exits nonzero when unreachable or storage is unavailable. `config` only prints configuration with the credential redacted. In the browser, **Refresh workspace status** checks the active workspace, operator, and durable location; the status also refreshes every 15 seconds. Existing operator diagnostics remain available on Command.

## Storage and session recovery

- **Backend unavailable:** start the server, check the configured host/port, and check for a port conflict. A saved configuration does not mean Cestus is running.
- **Session required:** use the current unused session URL. Restart for a fresh link if needed. Do not put bearer credentials in browser storage or URLs.
- **Workspace unavailable:** stop Cestus; reconnect the drive or restore the complete workspace; verify the configured root and workspace identity; restart. Cestus latches a detected storage loss until restart. It never switches a missing portable workspace to repository-local SQLite. A missing ledger must be restored, not recreated as an empty database.
- **No portable workspace mounted:** configure the documented portable path and restart. Legacy storage modes lack the portable-workspace guarantees.
- **Credential rotation:** stop Cestus, repeat `local:runtime:configure` with the same config path plus `--rotate-auth-token`, then restart. Keep the mode-0600 config private and outside backups intended to carry evidence only.

Authenticated tailnet access remains optional using the existing `--bind tailnet --host <assigned-tailnet-IP>` configuration. Browser origins must exactly match the serving address and port. Phase 1 verification uses loopback only; it does not test or authorize external exposure.

## Stopped-runtime copy and restore

Practice this with disposable data before using real investigations. Stop every runtime and CLI writer first and wait for exit. Copy the **entire workspace**, including manifest, ledger, originals, derivatives, and metadata, into a new destination. Do not copy over an existing target. Keep the credential-bearing runtime config outside the copy.

```bash
# After Ctrl-C has stopped Cestus; these names must not already exist:
cp -a -- "$CESTUS_TRIAL_DIR/workspace" "$CESTUS_TRIAL_DIR/backup"
diff -qr -- "$CESTUS_TRIAL_DIR/workspace" "$CESTUS_TRIAL_DIR/backup"
cp -a -- "$CESTUS_TRIAL_DIR/backup" "$CESTUS_TRIAL_DIR/restored"
diff -qr -- "$CESTUS_TRIAL_DIR/backup" "$CESTUS_TRIAL_DIR/restored"
npm run local:runtime:configure -- --storage portable-workspace --workspace "$CESTUS_TRIAL_DIR/restored" --no-dev-seed
npm run local:runtime
```

Open the new session link and recover the draft. Configure reads and pins the restored workspace ID. This is a manual stopped-copy procedure, not online backup automation or a power-loss/disk-full recovery guarantee. If a copy fails, retain the source and use a new empty destination for the next attempt.

## Import, read, and search documents (Phase 2)

Local extraction supports UTF-8 `.txt` and `.csv` files and text-bearing `.pdf` files. PDFs require the local Poppler `pdfinfo` and `pdftotext` executables on `PATH`. Check with `pdfinfo -v` and `pdftotext -v`; install your operating system's Poppler package if unavailable. OCR, image files, Office documents, and encrypted PDFs are **not supported**. PDF extraction preserves readable pages and original page numbering. Pages with no extracted text remain explicitly **unextracted**, whether blank, scanned, or otherwise unsupported; Cestus does not infer blankness. Such PDFs have **partial text extraction**, including image-only PDFs with no readable passages. Even text on every page does not establish that all visual content was extracted. The reader, search results, and exact transfer previews show coverage. Older PDF artifacts without page metadata show unknown coverage and retain their citation identities.

For a reproducible disposable trial, use the workspace/startup procedure above, then copy the representative synthetic fixtures before registering them:

```bash
cp -a -- test-data/phase2-records "$CESTUS_TRIAL_DIR/records"
```

The fixture folder contains valid text, CSV, and a two-page text PDF, plus duplicate bytes, a corrupt PDF, an empty-page PDF control, an unsupported binary file, and two three-page PDFs with a middle blank or actual raster-image-only page. Neither image fixture demonstrates OCR. No records are automatically seeded. In the actual browser:

1. Open **Ingestion**. Enter a **Source label** and the absolute **Source folder path** (the value of `$CESTUS_TRIAL_DIR/records` for this trial). Click **Register source folder**. Registration identifies the folder; it does not import its files.
2. Choose the **Registered source**, then **Scan source folder**. Review **Documents in this scan**, skipped files, sizes, and duplicates. Scanning does not modify the source. Approval covers the entire displayed scan; use a separate selected folder if you need a smaller batch.
3. Click **Approve raw import**, then **Run approved import**. Cestus copies immutable originals, deduplicates equal canonical bytes, and retains each source occurrence. The trial has nine files and eight distinct byte sequences.
4. Click **Extract queued documents**. Text, CSV, and the text PDF succeed. The empty-page and mixed PDFs show partial text extraction; corrupt and unsupported files remain visibly failed. Open **Read** on a successful evidence item, or open **Evidence** and select it. The reader shows provenance, extraction identity, and stable blocks, PDF pages, or CSV cells. **Open immutable original** displays plain text or downloads binary originals for your own viewer.
5. Search **Phrase in document contents** for `amber bridge`, then choose its result: it opens page 2 of `minutes.pdf`. Search `silver observatory` to reach CSV row 2, cell 3, or `cobalt lantern` to reach text block 2. Search `indigo causeway` or `ochre windmill` to reach page 3 of a mixed PDF, and inspect its page-2 gap notice. These phrases are absent from the filenames. Source and format filters narrow results; pagination uses 20 results per page.
6. Click a passage's page/block/cell location link and save the resulting browser URL. Reload it. Stop the server, restart with the same configuration, authenticate using its new session link, and reopen the saved URL. In Ingestion, select the saved source and **Reopen saved review** to recover the scan/import state.
7. To check source versioning with disposable records, edit only the copied `record.txt`, scan again, approve the new scan, import, and extract. Changed bytes create a new evidence version. The saved citation continues to resolve the older immutable bytes and extraction. The original `duplicate.txt` remains an occurrence of those older bytes.

Do not register private folders until you have chosen and authorized the exact path. Cestus reads the folder selected by you; registering one does not authorize external processing.

### Extraction and search recovery

- **Partial text extraction:** read the available pages and inspect each unextracted page in the immutable original. Search covers extracted text only; no match is not proof of absence. OCR is not enabled and original pages are not sent by passage processing.
- **Extractor version changed:** an old queued job fails safely with rescan guidance. Scan, review, approve, import, and extract with the current version; completed older extractions remain immutable.
- **Failed:** read the job's safe diagnostic. Corrupt, unsupported, encrypted, invalid UTF-8/CSV, or incomplete files require a repaired/converted copy imported as a new version. Originals remain intact. Missing Poppler, storage interruption, and timeouts have explicit recovery guidance.
- **Interrupted local parse:** after a restart, select the source and choose **Recover interrupted extraction**. This records the abandoned attempt as failed; choose its explicit **Retry** control to execute the local retry. Use **Extract queued documents** for any other queued work. A completed local job is not duplicated by another run.
- **Unavailable content:** restore the complete mounted workspace and restart. Evidence ID and current governance authorize reads; supplying a hash or filesystem path does not grant access. Quarantine, tombstone, credential risk, and applied redaction can block originals, derivatives, and snippets. A supported safe redacted derivative is not implemented; import a separately redacted copy when appropriate.
- **Search:** the SQLite index is disposable and rebuilt from verified originals and persisted extractions. It is not authoritative. Each query uses request-scoped ledger projections and a fresh governance check after blob reads. A synthetic 100-document collection (1,240,176 original bytes, 6,000 passages) demonstrated 235–326 ms HTTP queries and 153 ms passage retrieval on the development machine. This is a modest-corpus observation, not a capacity guarantee; large-corpus performance is not validated.

Extraction limits are 32 MiB per original, 8,000,000 text characters (PDF subprocess output also bounded), 500 PDF pages, and 100,000 passages. Each PDF subprocess has a 30-second timeout. Source scanning and import retain their existing filesystem protections.

## Explicit external document processing

The browser extracts proposed entities, typed facts, relationships and occurrences from selected passages using the reviewed active vocabulary (initially `investigation.v1`) and exact quotations. Its result is **unreviewed**, not an accepted investigative fact. Historical Phase 2 summary operations and artifacts remain readable. Choose the explicit ChatGPT subscription path below or an OpenAI-compatible chat-completions endpoint. Neither path accepts its own output. Missing or invalid configuration never selects a fallback provider.

For the API endpoint path, before starting the server explicitly configure these environment variables in the server's shell or your private credential environment:

```text
CESTUS_DOCUMENT_PROVIDER_ENDPOINT            Full chat-completions endpoint URL
CESTUS_DOCUMENT_PROVIDER_MODEL               Exact model ID
CESTUS_DOCUMENT_PROVIDER_API_KEY             Private provider credential
CESTUS_DOCUMENT_PROVIDER_INPUT_USD_PER_MILLION
CESTUS_DOCUMENT_PROVIDER_OUTPUT_USD_PER_MILLION
```

Prices are required numeric USD rates from your provider agreement. The endpoint must use HTTPS; loopback HTTP is allowed for synthetic protocol tests. Credentials stay server-side. Do not place them in source files, browser storage, screenshots, or shared commands. The document-processing service reads its explicit server environment; the repository `.env` is not an implicit fallback for this path. The browser shows safe readiness information and the destination/model, never the key.

### ChatGPT subscription with GPT-6 Astra

The selected subscription transport uses official Codex CLI **0.153.4** and exactly **gpt-6-astra**. Official references: [ChatGPT authentication](https://developers.openai.com/codex/auth), [Codex models](https://developers.openai.com/codex/models), and [app-server integration](https://developers.openai.com/codex/app-server). Sign in using `codex login` and verify with `codex login status`; the CLI manages ChatGPT authentication. Before starting Cestus:

```bash
export CESTUS_DOCUMENT_PROVIDER_TRANSPORT=codex-chatgpt
npm run local:runtime
```

The official executable must be on `PATH`; `CESTUS_DOCUMENT_CODEX_BIN` may select its absolute path. The adapter uses the private official file-backed sign-in at `$HOME/.codex/auth.json`, or a directory explicitly selected with `CESTUS_DOCUMENT_CODEX_AUTH_HOME`. The file must be private to its owner. Never paste credentials or convert subscription tokens to API keys. Keyring-only authentication is not supported by this isolated adapter. It copies the official authentication file opaquely into a private temporary Codex home, lets Codex manage it, and deletes the temporary copy. It does not edit the original account configuration.

Readiness checks authentication, the exact model listing, binary/version and official model catalog without making an analysis invocation. Cestus pins the unchanged official catalog and verifies the installed CLI's request against an anonymous loopback fixture. It disables inherited repository instructions, skills, hooks, MCP, shell execution, web access and additional filesystem context. Codex's mandatory wrapper definitions are shown in the exact preview; the execution host is disabled and user questions are never relayed. A changed binary, catalog, schema or selection requires a new approval. Unsupported CLI versions, unavailable Astra or a boundary that cannot be verified stop processing; there is no model switch or paid API fallback.

Subscription approval permits **one Codex turn**, with a 120-second local deadline and 64 KiB accepted response limit. There is no fabricated USD estimate or hard generation-token cap. One turn may involve multiple internal protocol requests, and subscription quotas still apply. This is not unlimited or guaranteed free. Tool continuation output cannot become an accepted result. Cancellation terminates local execution but cannot retract a submitted request or recover quota. Explicit quota failures stop; uncertain completion is never retried automatically. A deliberate retry consumes another invocation and needs a fresh preview and approval.

### Review the exact selection

For a live evaluation, choose a small authorized document selection and a bounded invocation count (or API budget). Then:

1. Read the evidence. If it is unclassified, use **Initial classification** with a deliberate tag and rationale, then **Record human classification and review**. Use the existing **Governance review** for subsequent changes. Only evidence explicitly reviewed as `public_safe`, with no active restricted tags or applied redaction, is eligible. Do not label sensitive content public-safe merely to enable a call.
2. Under **External document processing**, select up to 24 passages (at most 32 KiB of selected passage data). Subscription processing shows its one-turn limit; API processing requires a **Maximum budget (USD)** and output-token limit. Choose **Preview exact transfer**. Review the outgoing text/instructions, source and extraction hashes, destination/model, the **Reviewed extraction vocabulary** snapshot, operation, byte volume and limits. For API processing, also inspect the conservative token estimate and operator-supplied prices; for subscription processing, inspect the official CLI/catalog identity and mandatory definitions.
3. Click **Approve this transfer**, then **Run approved operation**. Approval alone makes no external request. Cestus checks exact content, current governance, authority, configuration, and approval again immediately before transfer. Changes require a new preview and approval.
4. Read the persisted job state and **Read result** after completion. Compare actual values with quotations, then **Import proposals for human review**. Open **Ontology** and review the proposals there; importing never accepts them. Saved previews and validated results reopen after restart.

One invocation runs at a time. For the API path, budgets are per invocation (maximum $100); there is no automatic evaluation campaign or aggregate account spending control. Output limits are 64–2048 tokens, 64 KiB response bytes, and a 30-second timeout. Token/cost estimates use the supplied pricing and bounded text; actual billing depends on the provider. Incorrect prices or a provider that ignores requested limits cannot be made into a provider-side spending guarantee. Set the provider account's own limits for a live evaluation.

For the API transport, queued work runs only after **Run approved operation**. A submitted request that times out, loses its response, is canceled, or is interrupted by restart remains **uncertain**. Cestus never automatically resubmits it. Check the provider's records before **Prepare potentially billable retry**, which creates a new invocation requiring a new approval. The generic chat endpoint offers no assumed idempotency guarantee; local invocation identity prevents repeating a completed local run, and an explicit retry may still be charged again. Explicit rejected statuses (400, 401, 403, 404, 405, 406, 410, 413, 415, 422, 429) become **failed / provider-rejected**. A fully read HTTP 200 response with invalid JSON, envelope, usage, or cited output becomes **failed / invalid-output** and is not published. Other statuses (including 408, 409, 5xx, deferred or partial responses), disconnects, and response limits reached before completion remain **uncertain**. A failed request may still have incurred charges: **failed does not mean unbilled**. Neither failed nor uncertain work is automatically resubmitted; both require a fresh preview, budget, and explicit approval for a potentially billable retry.

## Acceptance boundaries

The synthetic Phase 2 journey is recorded separately in `.compound-engineering/artifacts/acceptance/2026-09-05-phase2-evidence.md`. On September 6, the built Phase 3 product completed one authorized **real ChatGPT subscription / GPT-6 Astra** run over seven selected passages from a copied public legacy procurement notice. Two PDFs and one derived legacy briefing were imported through normal controls. The private briefing was classified and blocked from external processing; its generated claims remain unreviewed. The live result produced 13 cited proposals: review accepted ten, rejected three involving an incorrectly typed solicitation, and manually added a corrected identity and grounded written date. This is a bounded successful live trial, not a general accuracy or scanned-document evaluation.

Phase 3 adds shared cases and human-reviewed knowledge using those same evidence identities, persisted schema snapshots and append-only decisions. Cross-case automatic pattern discovery and competing explanations/evidence pursuit remain Phases 4 and 5. Phase 3 evidence, including the real trial and its limits, is recorded in `.compound-engineering/artifacts/acceptance/2026-09-05-phase3-ontology.md`. The initial live-transfer blocker is resolved for that sample; broader corpus usefulness, live quota/refresh behavior and scanned/visual coverage remain unverified.


## Build and correct a small shared ontology (Phase 3)

Build with `npm run ui:build`, start the production server with the same private configuration, and open its current session URL. Import and extract selected documents through Ingestion first. No provider configuration is needed for this manual journey. To repeat the fictional multi-case trial, copy `test-data/phase3-records` to a selected disposable folder before registering it:

```bash
cp -a -- test-data/phase3-records "$CESTUS_TRIAL_DIR/phase3-records"
```

The five files contain two independent registers, a same-name person with a different identifier, a byte-identical duplicate and a derivative report. They contain no accepted facts or preloaded cases.

1. Open **Ontology → Create an investigation**. Enter a title, question and scope, then **Create investigation**. Select it in **Current investigation**. Open **Evidence memberships** and check its documents. Create a second investigation the same way. The same document can belong to both; unchecking membership does not delete evidence or retract knowledge.
2. In **Propose knowledge from a source**, choose **Supporting source**, select a passage, and inspect **Exact supporting quote**. Click **Add supporting passage**. Choose **Entity mention**, a type, and its literal name as **Proposed value**; click **Save unreviewed proposal**. Repeat for each participant. Enter a **Decision rationale**, select the proposal checkboxes and **Accept selected proposals**. Acceptance creates separate identities unless you explicitly bind them.
3. Choose **Typed fact**, its predicate and **Subject source mention**. Enter the source value, such as identifier `AV-101` or amount `1200`, and save. For several supporting documents, select each source and **Add supporting passage** before saving this one proposal. Numbers and any unit must be supported by the quotes. Dates accept literal `YYYY`, `YYYY-MM` or `YYYY-MM-DD` and the bounded written-date interpretation described below; retain the source precision.
4. Choose **Relationship** with the subject mention and related mention as its value. For **Real-world occurrence**, choose its predicate and literal description, add participants with roles and optional typed attributes, and enter occurrence time separately from publication time. Blank time means unknown. Reuse a reviewed **Occurrence identity** when another source describes that same event; unresolved groups are not independent event totals.
5. Review the value next to its quotations, then **Accept** or **Reject**. **Sources and history …** opens the evidence, review decisions and memberships. **Open source passage** opens the immutable extraction at the saved location. A model score is only the provider's score. Unknown vocabulary cannot be accepted. Use the bounded vocabulary addition below if a new term is necessary, then explicitly revise the proposal and review it separately.
6. To share a verified actor between cases, open the accepted entity mention's **Sources and history …**. Inspect suggested matches and both sources. Choose **Verified entity identity** explicitly and **Save identity binding or repair**. Verify with identifiers or attributes; a similar name alone is insufficient. To repair a wrong link, select **Create a distinct identity** or the correct existing identity and explain the correction. Dependent current facts, relationships and occurrence participants follow the new binding; prior bindings stay in history.
7. To correct a fact, use **Edit as new proposal**, replace its value and supporting passages, and save. Reopen the old fact's history, choose **Correction replacement**, explain the correction and **Supersede with correction**. Replacement acceptance and supersession commit together. **Withdraw** removes current support without deleting the proposal; **Preserve dispute** adds your explanation while retaining contradictory evidence. Rejected proposals remain available for inspection and editing.
8. Under **Source lineage and independence**, mark only reviewed independent origins as independent. For a report quoting another record, select **Derived from another source** and its **Shared origin**. Unknown is appropriate when origin is unresolved. Identical files share canonical evidence; repeat mentions and case membership do not add corroboration. Dossiers show source records separately from reviewed independent origins.
9. Select **All cases · workspace view** for cross-case entity search and dossiers. Select a case to filter by its memberships. Relationship tables expose actual endpoints and an **Inspect** action; a selected dossier has a bounded one-step neighborhood. **Legacy provenance** preserves the earlier graph view and honest whole-document citations for v1 material.
10. Restart with the same workspace/configuration, authenticate with the new session link and reopen Ontology. Cases, proposals, accepted knowledge, citations, lineage and review history replay from the ledger. If a decision fails, read its error: **Retry exact decision** preserves its identity; for a stale review, **Refresh shared ontology**, inspect the changes, then make a fresh decision. An exact retry cannot duplicate an accepted decision.

For provider-assisted proposals, use **Evidence → External document processing** with the configured provider, classification review, exact passage selection and explicit per-invocation budget described above. Approval, invocation, importing proposals and accepting knowledge are separate actions. The server supplies provider provenance and verifies actual stored evidence; browser-supplied citation strings and actor IDs cannot grant authority. Changing original files requires a new import/extraction; old citations continue to describe the old immutable version.


## Add a necessary vocabulary term

In **Ontology → Add a vocabulary term**, choose an entity type or typed predicate. Use a unique lowercase name with underscores, such as `cooperative` or `registered_on`. For a predicate, choose its value type and any allowed subject/participant types; relationships require reviewed subject and object types. Entity label and occurrence predicates use string values. A fact restricted to entity subjects is not an occurrence attribute. Existing definitions cannot be replaced or changed here.

1. Enter **Why this term is needed**, then **Preview vocabulary addition**. Inspect the concrete definition, endpoint constraints and schema revision.
2. Click **Approve this vocabulary addition** only after reviewing it. This records your authenticated decision and a new immutable schema snapshot. It does not accept any knowledge.
3. For an existing unknown-term proposal, use **Edit as new proposal**, check the value and supporting passages, then **Save unreviewed proposal**. The new proposal references the active schema and its original proposal; the original remains unchanged.
4. Separately enter a **Decision rationale** and **Accept** the revised proposal. Previously accepted records retain their original schema meaning.

A changed workspace revision makes an addition preview stale: refresh and inspect a new preview. A vocabulary extension also requires a fresh provider preview/approval and explicit revision of older proposals before acceptance. Models cannot add vocabulary or approve their own proposals. Schema snapshots and vocabulary review history recover after restart.

## Review a written date

For a fictional example, copy `test-data/phase3-followup-records` into a disposable selected folder and import/extract it normally. Create and review a `cooperative` entity mention for Harbor Circle, then add a typed date fact `registered_on` restricted to cooperative subjects using the workflow above.

Choose **Typed fact**, `registered_on`, the Harbor Circle source mention, and add the register's supporting passage. The selected quotations must also identify the subject: add its name or supported identifier passage if the date passage does not include it. Enter the written expression **September 5, 2026** as **Proposed value** (entering only an ISO conversion does not record normalization provenance). The form shows its interpretation as **2026-09-05**. Save, inspect the original expression, day precision and exact supporting quotation beside the proposal, then separately **Accept**. **Sources and history** retains the interpretation method and quotation reference; **Open source passage** opens the saved extraction locator.

The shared manual/provider rule supports unambiguous English month names and common abbreviations, for example `5 September 2026`, `September 5, 2026`, and `September 2026`. The last retains month precision as `2026-09`; a year-only ISO value retains year precision. Invalid calendar dates, ambiguous numeric order, missing years, relative dates, unsupported locales and time-zone guesses are not normalized. Keep these unresolved; do not invent missing detail. There is no free-form override that turns an arbitrary date into grounded evidence.

Occurrence time and publication time have separate controls and separate interpretation records. An interval may have mixed precision; it is rejected when even the earliest possible start is later than the latest possible end. Overlapping partial bounds retain their precision and uncertainty rather than gaining invented days. Check the uncertainty box where appropriate. The exact source expression must occur in its identified supporting quotation and normalize to the stated value; an unrelated number is insufficient. Unknown or partial extraction coverage remains visible and is not complete visual coverage.

Use **Edit as new proposal** and **Supersede with correction** to correct a date while keeping the original value, quotation and decisions. Historical accepted records remain withdrawable and disputable under current evidence authorization; stricter rules apply to new proposals and acceptances. Manual vocabulary review and date correction work without a configured provider.


### Reopen the bounded legacy-record trial

The disposable trial is retained at `/tmp/cestus-phase3-real.jMasWV`; it is temporary storage, not a durable backup. Its private `source-provenance.json` records original paths, hashes and the byte-identical Markdown-to-TXT copy. Original drive files were only read. Do not register the entire legacy root or copy its credentials/runtime sessions.

```bash
cd /home/drake/Projects/Cestus
npm run ui:build
CESTUS_LOCAL_CONFIG_PATH=/tmp/cestus-phase3-real.jMasWV/runtime.config.json CESTUS_DOCUMENT_PROVIDER_TRANSPORT=codex-chatgpt npm run local:runtime
```

Open the newly printed local session URL. In **Ontology**, select **RFQ 23-003 — notice review** and open the solicitation dossier. Inspect the accepted notice date, its written expression and **Sources and history**; the earlier rejected proposals remain available under **Show all knowledge**. The vocabulary history contains the reviewed `solicitation` type and `notice_issued_on` date predicate restricted to that type. The **Legacy Scout briefing — unverified** case holds the local-only derived artifact with unknown independence. In **Evidence**, the completed Astra result is readable after restart; reading it does not invoke the provider again.

A governance rationale may be withheld by the browser metadata safety check while the evidence remains visible. This changes only its display; the original decision, classification, ledger history and transfer policy remain intact. Actual credential-valued governance history still fails closed.
