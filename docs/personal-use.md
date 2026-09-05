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

The implemented operation summarizes a selected set of extracted passages and requires exact quotations pointing to those passages. Its result is **unreviewed**, not an accepted investigative fact. It uses an OpenAI-compatible chat-completions HTTP endpoint; provider compatibility and live accounting must be evaluated against the endpoint you choose. No provider is selected when configuration is missing.

Before starting the server, explicitly configure these environment variables in the server's shell or your private credential environment:

```text
CESTUS_DOCUMENT_PROVIDER_ENDPOINT            Full chat-completions endpoint URL
CESTUS_DOCUMENT_PROVIDER_MODEL               Exact model ID
CESTUS_DOCUMENT_PROVIDER_API_KEY             Private provider credential
CESTUS_DOCUMENT_PROVIDER_INPUT_USD_PER_MILLION
CESTUS_DOCUMENT_PROVIDER_OUTPUT_USD_PER_MILLION
```

Prices are required numeric USD rates from your provider agreement. The endpoint must use HTTPS; loopback HTTP is allowed for synthetic protocol tests. Credentials stay server-side. Do not place them in source files, browser storage, screenshots, or shared commands. The document-processing service reads its explicit server environment; the repository `.env` is not an implicit fallback for this path. The browser shows safe readiness information and the destination/model, never the key.

For a live evaluation, first choose the provider/model, an authorized document selection, and an evaluation budget. Then:

1. Read the evidence. If it is unclassified, use **Initial classification** with a deliberate tag and rationale, then **Record human classification and review**. Use the existing **Governance review** for subsequent changes. Only evidence explicitly reviewed as `public_safe`, with no active restricted tags or applied redaction, is eligible. Do not label sensitive content public-safe merely to enable a call.
2. Under **External document processing**, select up to 24 passages (at most 32 KiB of selected passage data), enter a **Maximum budget (USD)** and output-token limit, then **Preview exact transfer**. Review the outgoing text/instructions, source and extraction hashes, destination/model, operation, byte volume, conservative token estimate, operator-supplied prices, and limits.
3. Click **Approve this transfer**, then **Run approved operation**. Approval alone makes no external request. Cestus checks exact content, current governance, authority, configuration, and approval again immediately before transfer. Changes require a new preview and approval.
4. Read the persisted job state and **Read result** after completion. Follow its supporting passage links. Saved previews and validated results reopen after restart.

One invocation runs at a time. Budgets are per invocation (maximum $100); there is no automatic evaluation campaign or aggregate account spending control. Output limits are 64–2048 tokens, 64 KiB response bytes, and a 30-second timeout. Token/cost estimates use the supplied pricing and bounded text; actual billing depends on the provider. Incorrect prices or a provider that ignores requested limits cannot be made into a provider-side spending guarantee. Set the provider account's own limits for a live evaluation.

Queued work runs only after **Run approved operation**. A submitted request that times out, loses its response, is canceled, or is interrupted by restart remains **uncertain**. Cestus never automatically resubmits it. Check the provider's records before **Prepare potentially billable retry**, which creates a new invocation requiring a new approval. The generic chat endpoint offers no assumed idempotency guarantee; local invocation identity prevents repeating a completed local run, and an explicit retry may still be charged again. Explicit rejected statuses (400, 401, 403, 404, 405, 406, 410, 413, 415, 422, 429) become **failed / provider-rejected**. A fully read HTTP 200 response with invalid JSON, envelope, usage, or cited output becomes **failed / invalid-output** and is not published. Other statuses (including 408, 409, 5xx, deferred or partial responses), disconnects, and response limits reached before completion remain **uncertain**. A failed request may still have incurred charges: **failed does not mean unbilled**. Neither failed nor uncertain work is automatically resubmitted; both require a fresh preview, budget, and explicit approval for a potentially billable retry.

## Acceptance boundaries

The synthetic local import/read/search journey and synthetic loopback provider protocol have separate acceptance evidence under `.compound-engineering/artifacts/acceptance/2026-09-05-phase2-evidence.md`. A live provider operation has **not** been validated. The user-selected real-record folder, required formats/scan requirements, intended provider/endpoint/model, and authorized live budget remain pending. No personal records were selected or transferred during implementation.

The next phase's shared contract is in `packages/ontology/src/extraction-contracts.ts`: workspace-wide evidence/extraction identities, source and extraction hashes, precise locators, typed values/entity references, time qualifiers, provenance, and candidate review state. The full shared ontology, cases, cross-case discovery, and competing-explanation investigation engine remain later work.
