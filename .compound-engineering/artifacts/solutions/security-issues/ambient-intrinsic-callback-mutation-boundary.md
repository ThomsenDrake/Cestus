---
title: Ambient callbacks must finish before final byte validation
date: 2026-08-31
category: security-issues
module: secret commitment frame parser
problem_type: security_issue
component: service_layer
symptoms:
  - "A behavior-conforming WeakSet callback could mutate a publishable 32-byte value after its integrity comparison."
  - "Maximum-size typed-array validation exhausted transient memory by enumerating millions of index keys."
root_cause: missing_validation
resolution_type: code_fix
severity: high
related_components:
  - api_layer
  - testing_framework
tags:
  - ambient-intrinsics
  - callback-boundary
  - data-integrity
  - fail-closed
  - typed-arrays
  - resource-safety
  - exact-shape
---

# Ambient callbacks must finish before final byte validation

## Problem

The secret-commitment parser captures `WeakSet.prototype.add` and `WeakSet.prototype.has` during module evaluation and calls them through a captured apply operation (`packages/agent/src/secret-commitment-frame-parser.ts:355-374`). Capture prevents later replacement, but it does not make a pre-evaluation replacement trustworthy. A wrapper can preserve the specified `add` or `has` result while synchronously mutating the `Uint8Array` passed to it.

Parsed byte fields are mutable arrays installed on the returned frame. An integrity comparison is not a publication boundary if a behavior-tested ambient callback can still receive those arrays afterward.

## Symptoms

- The regression models a prior window in which a conforming pre-evaluation `WeakSet.prototype.add` mutation could occur after an integrity check.
- Moving only `WeakSet.add` left the same synchronous mutation path through `WeakSet.has`.
- During the remediation investigation, maximum-size frames reached `Reflect.ownKeys` over millions of typed-array indices and one overlapping baseline worker exceeded 3 GiB RSS before it was stopped (session history). The current large-array path avoids that index enumeration.

## What Didn't Work

Treating captured or behavior-tested functions as side-effect-free did not establish byte integrity. The WeakSet probe verifies `has(false)`, `add(this)`, and `has(true)`, but cannot detect unrelated mutation of the argument (`packages/agent/src/secret-commitment-frame-parser.ts:355-365`).

Moving one `add` call was also incomplete. Publication validation calls both `add` and `has`, including membership checks after registration (`packages/agent/src/secret-commitment-frame-parser.ts:904-939`). The correct review unit is every callback-capable operation after validation, not one named intrinsic.

Exhaustive exact-shape validation did not become resource-safe merely because the frame had a maximum length. Enumerating every typed-array index still scaled linearly in allocated property-key strings and reached unreasonable memory use at the actual contract limit (session history).

The parser does not promise protection from an arbitrarily delayed mutation after return. Allocation itself invokes a captured constructor that could retain the mutable object it returns (`packages/agent/src/secret-commitment-frame-parser.ts:694-722`). The enforceable guarantee covers synchronous parser evaluation through publication.

## Solution

Order publication validation so every captured or behavior-tested operation completes before one final callback-free comparison. The validator freezes and reflects over the result, validates every copied field, performs all WeakSet membership and registration operations, and completes the final membership checks (`packages/agent/src/secret-commitment-frame-parser.ts:870-939`). It then compares every copied byte directly with its source-frame byte and returns immediately, with no callback after the comparison (`packages/agent/src/secret-commitment-frame-parser.ts:940-955`).

Keep separate fresh-module regressions for `WeakSet.add` and `WeakSet.has`. Each wrapper calls the original operation, mutates a 32-byte value, preserves the operation's correct return, and is installed before importing the parser module (`packages/agent/test/secret-commitment-frame-parser-hostile.test.ts:365-397`). Both tests require parser rejection and confirm that the builders remain usable.

For typed arrays longer than the small exhaustive threshold, validate native brand, a non-resizable and non-detached native `ArrayBuffer` backing, standard shadow properties, and boundary descriptors. Then compare bounded `node:util.inspect` representations of the candidate and a clean same-backing view. `maxArrayLength: 0` suppresses numeric index expansion, `showHidden: true` exposes non-enumerable string and symbol properties, and `depth: 0` prevents recursive expansion (`packages/agent/src/secret-commitment-bytes.ts:38-46`, `packages/agent/src/secret-commitment-bytes.ts:193-232`).

## Why This Works

The terminal byte loop contains direct indexed reads and primitive comparisons only (`packages/agent/src/secret-commitment-frame-parser.ts:943-953`). All callback-capable validation precedes it, and success returns immediately. Any synchronous mutation by `add`, `has`, reflection, or an earlier ambient operation is therefore visible to the parser's last check.

The design remains fail closed. A mismatch returns `false`, exceptions return `false`, and the public implementation converts failed publication into `undefined` (`packages/agent/src/secret-commitment-frame-parser.ts:940-958`).

The large-array shape comparison is bounded with respect to typed-array indices while still distinguishing visible and hidden extra own properties from the clean view. Focused regressions cover enumerable strings and symbols, non-enumerable strings and symbols, and nested property values (`packages/agent/test/secret-commitment-bytes.test.ts:740-765`).

## Prevention

- Classify every captured function as an ambient callback with arbitrary synchronous side effects, even when it passes behavior tests.
- Place all callback-capable operations before the last validation of mutable publication data.
- Make the final validation use direct primitive reads and comparisons, then return without another callback.
- Add fresh-module regressions for each captured operation that receives a publishable object.
- Exercise maximum resource boundaries with a real frame and process-level peak-memory sampling; mocked allocation counters alone do not prove resource safety.
- Preserve exact-shape coverage for enumerable and non-enumerable string and symbol properties whenever index enumeration is replaced.

## Related Issues

- [PR #40: exact secret commitment frame parser](https://github.com/ThomsenDrake/Cestus/pull/40) introduced the parser and is the historical source of the post-merge findings.
- [PR #39: secret commitment frame builders](https://github.com/ThomsenDrake/Cestus/pull/39) defines the canonical builder contract the parser must round-trip.
- [PR #41: baseline runtime contracts](https://github.com/ThomsenDrake/Cestus/pull/41) touched earlier secret-commitment byte validation tests.

The corrective work was still unmerged when this learning was written.
