---
title: Verify personal workspace sessions through production wiring
date: 2026-09-04
last_updated: 2026-09-05
category: integration-issues
module: Local runtime and browser UI
problem_type: integration_issue
component: api_layer
symptoms:
  - "Loopback requests bypassed authentication."
  - "Configuration-only health and static badges implied availability."
  - "The default Command New request action did not open its builder."
  - "An ordinary unfiled draft returned HTTP 400 unless given an agency receipt timestamp."
root_cause: missing_validation
resolution_type: code_fix
severity: high
tags: [local-runtime, authentication, portable-workspace, acceptance]
---

# Verify personal workspace sessions through production wiring

## Problem

Internal route tests and injected UI adapters did not establish that a person could authenticate, create a durable record, and recover it using the production server and built UI. Loopback was treated as authority, while display state could imply a running service without observing one.

## Symptoms

The Command action had no navigation path to the PRR builder. Production Agent status also failed the browser DTO parser: it included an unused orchestration projection, and generic redaction corrupted valid provider-readiness diagnostic identifiers.

## What Didn't Work

Passing component tests alone did not exercise the real status DTO or browser session. Removing an extra DTO field alone did not fix the readiness diagnostic mismatch; the dedicated secret-safe readiness schema also had to validate that portion.

The initial production acceptance supplied `receivedAt` and therefore missed ordinary unfiled drafts. Drake encountered HTTP 400 and correctly challenged why drafting required an agency receipt. This was an acceptance-design miss: supplying extra lifecycle data made the test pass while hiding the normal user's blocked path.

## Solution

- `packages/local-runtime/src/auth.ts` requires a bearer or a random, server-expiring session. The bootstrap link is single-use; restart revokes sessions.
- `packages/local-runtime/src/server.ts` checks browser origin and serving host before dispatch, derives the human actor from configuration, and observes storage before protected operations. Client actor fields cannot replace this identity.
- `packages/local-runtime/src/server-workspace.ts` requires an existing portable ledger and records canonical path identities without creating missing storage. Loss or replacement latches an unavailable state until restart.
- The browser workspace status queries the server. Command navigates to Requests with a pending builder action. The Agent adapter validates the actual production response while excluding the unused orchestration projection.
- The unfiled-draft follow-up removes the receipt input from the builder and allows an omitted `receivedAt` through the HTTP boundary and PRR runtime. That path appends only `prr.request.created` to the request stream; it does not invent a receipt or deadline. Existing explicit-receipt callers retain their deadline behavior.

The automated production-server acceptance tests are in `packages/local-runtime/test/personal-session.test.ts`. They cover authentication, hostile origins, actor impersonation, persistence after restart, missing storage, live health, and the real browser Agent adapter.

## Why This Works

Authentication, durable storage, and browser contracts are checked at their actual boundaries. A saved configuration does not prove a running backend; a running backend does not prove mounted storage; a configured provider does not prove analysis occurred.

Browser acceptance on 2026-09-04 used the actual built UI, production CLI/server, a disposable portable workspace, generated test credentials, and loopback only. It created a synthetic PRR draft from Command, recovered it after restart and a stopped-copy restore, rejected the old session after restart, and displayed unavailable storage without recreating it. Desktop and 390-pixel mobile views had no fixture rows or unsupported sync/live badges. No external provider was invoked.

### Final unfiled-draft acceptance, 2026-09-05

The local implementation commits are `beb7594f` (workspace foundation) and `4450303d` (unfiled drafts); neither was pushed by this session. The final-code closeout required no additional implementation changes. It rebuilt the UI and exercised the documented create/configure/serve CLI path on loopback port 18788 with development seed disabled. The test used a new disposable workspace and an isolated Chromium session. To avoid reading repository-local provider configuration, the CLI ran from the disposable directory with `--ui-dist-dir` pointing to the repository's built `dist`; these are the same CLI entrypoints used by the documented npm scripts. Drake's running trial on port 18787 was left untouched.

| Check | Observed result |
| --- | --- |
| Plain visit without a session | Session-required guidance; protected data unavailable. |
| Printed single-use session URL | Backend running, workspace ready, configured synthetic operator and storage path displayed. |
| Command > New request | Opened the actual builder. Empty submission named Agency name, Requester name, and Request text as required. |
| Ordinary draft | With the default jurisdiction pack and only those three fields filled, Create draft succeeded. No receipt field was present. The only request appeared under Drafting with No deadline. |
| Reload | Opening Requests recovered the same draft, still with No deadline. |
| Stop and restart | The old session was rejected. A new printed session URL restored access to the same draft. |
| Stopped-copy restore | Whole-workspace copies to fresh backup and restored directories matched with `diff -qr`. Reconfiguring to the separate restored path and authenticating recovered the draft with No deadline. |
| Stored history | Read-only inspection of the stopped copy found exactly one PRR event, `prr.request.created`, with no `receivedAt` or deadline event. A separate agent identity initialization event was also present. |

The authenticated browser journey produced no JavaScript errors. Saved/restarted/restored screenshots were inspected or captured locally as `/tmp/cestus-phase1-closeout-{saved,restarted,restored}.png`; these disposable artifacts are not permanent repository evidence. No injected runtime adapters, real records, real credentials, or provider calls were used.

Existing final-code evidence remains applicable: `personal-session.test.ts` covers unauthenticated reads/writes, hostile-origin reads and mutations (including transfer-approval and governance routes), cookie mutations without Origin, server-derived actor identity despite forged client fields, live/unreachable health, and startup/live storage loss without fallback writes. The original browser storage-loss check also remains valid. The draft follow-up adds a real HTTP adapter/server regression for receipt-free creation and restart recovery. The recorded final `npm run verify` after that fix passed typecheck, **3,966 tests with five skipped**, and the production UI build. This documentation-only closeout preserved that result instead of rerunning the full suite; a fresh UI build passed. Existing nonfatal build warnings remain.

The original 2026-09-04 provisional timing observation used Node v26.7.0, an Intel i7-9750H (12 logical CPUs), and 16 GiB RAM: warm server startup after module loading took 21.5 ms; 20 HTTP Requests-workspace reads had median 3.3 ms and p95 4.6 ms. That timestamped-draft workspace held one PRR draft, three ledger events, and no imported evidence. This is neither a cold-start benchmark nor a supported capacity or extraction guarantee. The separate synthetic corpus has three cases and eleven files totaling 2,911 bytes; its formats and proposed growth target remain provisional. Its hashes and byte counts were rechecked on 2026-09-05. The original implementation prompt authorized these small synthetic controls. Real corpus selection and format, volume, and sensitivity decisions remain preparation for Phase 2.

## Prevention

Retain a real server-to-browser-adapter test and repeat the built-UI create/restart/recover journey when changing sessions, storage mounting, or response contracts. Start that journey with only the ordinary required fields; test later lifecycle facts such as agency receipt separately. Keep internal route authentication explicit in test helpers; never restore a production loopback bypass to simplify tests.

## Related Issues

See `docs/personal-use.md` for exact startup and recovery commands and `test-data/personal-investigation/manifest.json` for the provisional corpus and known answers. Extraction, provider analysis, ontology migrations, cross-case discovery, and the investigation loop are outside Phase 1.
