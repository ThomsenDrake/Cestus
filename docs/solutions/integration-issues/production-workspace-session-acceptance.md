---
title: Verify personal workspace sessions through production wiring
date: 2026-09-04
category: integration-issues
module: Local runtime and browser UI
problem_type: integration_issue
component: api_layer
symptoms:
  - "Loopback requests bypassed authentication."
  - "Configuration-only health and static badges implied availability."
  - "The default Command New request action did not open its builder."
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

## Solution

- `packages/local-runtime/src/auth.ts` requires a bearer or a random, server-expiring session. The bootstrap link is single-use; restart revokes sessions.
- `packages/local-runtime/src/server.ts` checks browser origin and serving host before dispatch, derives the human actor from configuration, and observes storage before protected operations. Client actor fields cannot replace this identity.
- `packages/local-runtime/src/server-workspace.ts` requires an existing portable ledger and records canonical path identities without creating missing storage. Loss or replacement latches an unavailable state until restart.
- The browser workspace status queries the server. Command navigates to Requests with a pending builder action. The Agent adapter validates the actual production response while excluding the unused orchestration projection.

The automated production-server acceptance tests are in `packages/local-runtime/test/personal-session.test.ts`. They cover authentication, hostile origins, actor impersonation, persistence after restart, missing storage, live health, and the real browser Agent adapter.

## Why This Works

Authentication, durable storage, and browser contracts are checked at their actual boundaries. A saved configuration does not prove a running backend; a running backend does not prove mounted storage; a configured provider does not prove analysis occurred.

Browser acceptance on 2026-09-04 used the actual built UI, production CLI/server, a disposable portable workspace, generated test credentials, and loopback only. It created a synthetic PRR draft from Command, recovered it after restart and a stopped-copy restore, rejected the old session after restart, and displayed unavailable storage without recreating it. Desktop and 390-pixel mobile views had no fixture rows or unsupported sync/live badges. No external provider was invoked.

Provisional timing observation on Node v26.7.0, an Intel i7-9750H (12 logical CPUs), and 16 GiB RAM: warm server startup after module loading took 21.5 ms; 20 HTTP Requests-workspace reads had median 3.3 ms and p95 4.6 ms. The workspace held one PRR draft, three ledger events, and no imported evidence. This is neither a cold-start benchmark nor a supported capacity or extraction guarantee. The separate synthetic corpus has three cases and eleven files totaling 2,911 bytes; its formats and proposed growth target remain provisional.

## Prevention

Retain a real server-to-browser-adapter test and repeat the built-UI create/restart/recover journey when changing sessions, storage mounting, or response contracts. Keep internal route authentication explicit in test helpers; never restore a production loopback bypass to simplify tests.

## Related Issues

See `docs/personal-use.md` for exact startup and recovery commands and `test-data/personal-investigation/manifest.json` for the provisional corpus and known answers. Extraction, provider analysis, ontology migrations, cross-case discovery, and the investigation loop are outside Phase 1.
