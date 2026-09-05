# Phase 2 implementation boundary

The user's September 5 request accepts Phase 2 of the preserved September 4
product plan. Current instructions override that plan's historical methodology
and status text. Baseline: clean `neo`, `50ae1335`, including Phase 1 commits
`beb7594f`, `4450303d`, and `3fe2f10b`. Work branch:
`codex/phase2-evidence-foundation`. No push or PR.

## Bounded design

1. Extend the existing ingestion runtime with persisted review readback and
   execution of its local parse jobs. Decode UTF-8 text and CSV, and use bounded
   local Poppler extraction for text-bearing PDFs. Preserve original bytes;
   extraction artifacts identify the evidence/hash, parser version and stable
   page/block/span or row/cell locations. Unsupported scans and malformed files
   must fail visibly. Retries remain explicit and local results idempotent.
2. Compose a separate human-import resolver over the server's current portable
   mount and ledger. Keep resident source boundaries without blob-write power.
   Extend the existing ingestion UI with folder registration, source selection,
   scan review, import, extraction, and persisted-state reopening.
3. Authorize content reads using evidence provenance and current governance,
   then resolve canonical storage internally. Add a safe text/page/table reader
   and rebuildable SQLite FTS passage index with phrase queries, source/format
   filters, pagination, and links containing extraction and location identities.
4. Complete one explicit external-processing operation over bounded extracted
   passages. Bind approval to exact identities, selection, operation, endpoint,
   model and budget; hold credentials server-side; validate current authority
   immediately before submission. Persist invocation states in the ledger;
   restart/submission ambiguity never automatically resubmits paid work.
   Reuse existing transport and governance/approval checks where suitable.
5. Define the next phase's evidence-reference and typed candidate contract;
   no ontology editor, case workflow, discovery or investigation engine.

## Verification

Use failing or characterization tests before behavior changes where practical.
Exercise actual SQLite/portable storage and production HTTP boundaries for
deduplication, changed versions, old citations, governance denial, restart,
interrupted parsing, rejected transfers (zero calls), and ambiguous submissions.
Use valid synthetic text, CSV and PDF fixtures, plus corrupt/unsupported inputs.
Run the built UI and production server on loopback with disposable workspace,
test credentials and no runtime injection; inspect desktop/mobile and verify
register → scan → import → extract → read → phrase search → passage navigation,
then restart/reopen. Run `npm run verify`, simplify and review, record evidence,
and commit only task-owned files.

## Inputs and acceptance limits

Source path, required formats/scans, provider/endpoint/model and evaluation
budget were requested before implementation. Until supplied, only synthetic
records are authorized and live-provider/real-record acceptance stays pending.
No missing input authorizes assumptions about personal records or paid calls.

## Parallel ownership

The CE work execution strategy permits independent native workers. Extraction
owns ingestion parser/runtime and new extraction/candidate contract files;
ingestion UI owns only its UI directory and tests. Host owns server composition,
evidence routes/reader/search, shared schema integration, package metadata,
browser sessions and all canonical verification/commits. External processing
is sequenced after its evidence contract is available. Workers never stage,
commit, install dependencies, build, or run the full suite.
