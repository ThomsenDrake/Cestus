# Resident Agent Cockpit Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development only after
> the visible coordinator records a complete authorization naming the approved
> Lane U design, this reviewed plan commit, the CF-1 SHA, exact task range, and
> wave stop. Steps use checkbox syntax for tracking.

**Goal:** Let one operator inspect a browser-safe, provenance-bound resident
snapshot and submit only a small set of runtime-supported requests, without
making the browser a source of authority, provider proxy, second scheduler, or
secret boundary.

**Architecture:** CF-1 alone freezes shared DTO schemas, event bindings, route
ownership, versions, idempotency semantics, and compatibility rules. After that
freeze, Task 131 implements the strict U parser/adapter from a production-shaped
route response. Task 141 consumes that parser and the merged W/R/H/P producers
to render status and submit only frozen narrow commands. The mounted append-only
ledger and rebuildable projections remain the sole runtime truth.

**Tech Stack:** strict TypeScript, Zod at CF-1-selected boundaries, Vitest,
React/Vite, existing local-runtime HTTP, and browser-safe DTOs.

## Global Constraints

- Approved Lane U design:
  docs/superpowers/specs/2026-07-12-resident-agent-cockpit-design.md@754f89466a8321f853b60f4465a989e3bff03d89.
- Governing umbrella design:
  docs/superpowers/specs/2026-07-12-resident-agent-full-vision-program-design.md@c7dc10b9dd351fc76df083df8f2222252ba73d89.
- Governing program plan:
  docs/superpowers/plans/2026-07-12-resident-agent-full-vision-program-implementation.md@0b5726ec975bdc0aae97e540472ef3be4379b358.
- agent_default is the only resident identity. A provider, credential, harness,
  browser, device, tailnet session, specialist mode, run, or process is not a
  resident, workspace, authority, or approval principal.
- React receives a parsed snapshot and derives no canonical state. A browser
  cache, UI memory, transport acknowledgment, runner return, or optimistic toast
  is never durable truth or completion.
- Secrets never enter DTOs, commands, browser persistence, URLs, logs,
  telemetry, clipboard, accessibility labels, or errors: no credentials,
  locators, cookies, headers, passwords, API keys, raw prompts/source bytes,
  raw provider payloads, raw argv, signed URL, local path, stack trace, or
  unredacted diagnostic.
- No control invokes a provider or tool, transfers bytes, sends, approves,
  exports, publishes, escalates, repairs destructively, mutates accepted graph
  state, bypasses authority, or claims an effect complete.
- Deterministic U tests are credential-free. This plan runs no provider,
  browser, tailnet, desktop setup, secret facility, or Nous call. Later
  provider acceptance is coordinator-controlled approved Nous evidence with
  safe IDs, hashes, counts, categories, and readback markers only.
- Each future worker uses TDD, fresh review, verification-before-completion,
  and a coordinator-recorded rebase to CF-1 and predecessors. No child
  self-reviews, self-integrates, or merges into neo.

## Task 115 Section-Local Documentation Contract

This table is a documentation RED/GREEN contract only. It specifies safety and
future work orders but does not freeze a wire contract before CF-1. The embedded
audit scopes itself to this section, directly removes each local substantive
row, and must reject every mutation. A broad phrase or heading elsewhere cannot
satisfy safety, provenance, no-secret, or no-effect requirements.

| Contract key | Required local statement |
| --- | --- |
| T115-CF1-ONLY | CF-1 alone freezes shared DTO versions, schemas, event bindings, route ownership, compatibility, and idempotency semantics; Task 115 proposes requirements only. |
| T115-U-FILES | Task 131 owns resident-runtime-types.ts, resident-runtime-adapter.ts, and resident-runtime-adapter.test.ts; Task 141 owns agent-supervision-routes.ts, ResidentSupervisionPanel.tsx, and resident-supervision-panel.test.ts plus its claim; Task 117 CF-1 reconciliation assigns the owner of packages/local-runtime/test/agent-supervision-routes.test.ts before Task 141 dispatch. |
| T115-SNAPSHOT-TRUTH | The cockpit renders one immutable projection snapshot and never treats browser memory, a transport acknowledgement, a runner result, or a cache as durable truth. |
| T115-PLAIN-OWN-DATA | The parser accepts only normalized plain own-data objects and ordinary dense arrays, rejecting inherited values, accessors, symbols, sparse arrays, custom array properties, cycles, boxed values, and non-plain prototypes before field reads. |
| T115-STRICT-SCHEMA | Every DTO and command boundary is a versioned discriminated union with unknown keys rejected and explicit IDs, hashes, timestamps, counts, unavailable branches, and safe categories. |
| T115-FREEZE-ONCE | The normalizer snapshots and freezes input once before append, service call, or await and never rereads caller-owned input after await. |
| T115-CROSS-RUN | Selected plan, observation, command, approval, and handoff data must equal selected workspace, resident, task, attempt, run, policy/hash, and projection bindings; cross-run or stale values fail closed. |
| T115-NO-SECRET | The browser parser rejects credential values or locators, cookies, headers, prompt text, source bytes, raw argv, signed URLs, local paths, raw provider payloads, and unredacted diagnostics without echoing them. |
| T115-UNAVAILABLE | Invalid, absent, stale, forged, or unsafe runtime data renders unavailable with a closed safe category and never falls back to a partial fixture, cached old state, or implied ready view. |
| T115-COMMAND-ALLOWLIST | A route parser accepts only frozen supported command discriminants and an exact current-snapshot supported-command binding, never a client-selected action name. |
| T115-COMMAND-NARROW | Each command includes a server-validated idempotency key, expected snapshot ID, and only frozen exact workspace/task/attempt/run/policy/projection identifiers; extra keys and authority overrides are rejected. |
| T115-COMMAND-NO-EFFECT | No U command invokes a provider or tool, transfers provider bytes, sends, approves, exports, publishes, escalates, repairs destructively, or mutates accepted graph state. |
| T115-TRUTHFUL-LABELS | Transport success is requested or pending only; paused, resumed, queued, cancellation-confirmed, setup-ready, and terminal labels require their next durable projection or readback. |
| T115-FROZEN-LABELS | Task 117 CF-1 freezes the exact command-label mapping: workspace.recheck → Recheck mounted workspace; wake.pause → Pause new wake claims; wake.resume → Resume eligible wake processing; task.retry.request → Queue retry; task.cancel.request → Request cancellation; provider.setup.open → Open local provider setup. |
| T115-PROVIDER-VIEW | Provider cards expose only P-owned capability/model labels, structural and invocation readiness categories, safe requirements, and safe projection evidence, not secret material or provider configuration. |
| T115-LOCAL-SETUP | provider.setup.open is local-desktop-only after local-origin, operator-presence, and P-owned capability checks; it opens a P-owned platform flow and never accepts a secret in the browser. |
| T115-REMOTE-SETUP-OFF | Provider setup is disabled on mobile and tailnet, and no form, URL, storage record, logger, telemetry payload, clipboard, or accessibility label can receive unsafe provider material. |
| T115-RUN-CLAIM-VISIBILITY | The snapshot visibly binds workspace authority, agent_default, wake state, exact task/attempt/run, claim/lease fact, bounded-loop budgets, policy, locks, and a safe freshness category. |
| T115-TRIGGER-VISIBILITY | Trigger views show T-owned family, policy, source high-water, dedupe/cooldown/budget category, and durable request/decision IDs while creating neither prompt nor trigger effect. |
| T115-APPROVAL-VISIBILITY | Approval views show class, safe preview/content hash, independent-human requirement, staleness/lock/source binding category, and effect posture without approving or consuming approval. |
| T115-HANDOFF-READBACK | A handoff is recorded-and-read-back only when its exact run-linked lifecycle event, material receipt/hash, manifest receipt/hash, provenance, and mounted readback all validate. |
| T115-HANDOFF-NO-INFERENCE | A chat message, blob existence, manifest scan, service return, or terminal-looking status cannot establish handoff completion or expose retry, send, or approve-handoff controls. |
| T115-DESKTOP | Desktop keeps exact selected run and freshness visible, exposes each rendered command and safe reason by keyboard, and presents cancellation as a request confirmation rather than a completed effect. |
| T115-MOBILE | Mobile renders the same parsed command authority in a single-column accessible layout with freshness and exact selected task/attempt/run visible; it depends on no hover, hidden tooltip, offscreen drag, or desktop-only shortcut. |
| T115-TAILNET-AUTH | Tailnet is an authenticated encrypted remote view of the same local runtime and mounted workspace, not a public service, second resident, team principal, or browser supervisor. |
| T115-TAILNET-REPARSE | Tailnet reconnect discards old snapshot, reparses fresh data, and remains unavailable until workspace authority and selected-run bindings validate; disconnect causes no pause, fallback write, or claim-loss behavior. |
| T115-BROWSER-INDEPENDENT | Browser close, crash, refresh, focus, route opening, polling, and network loss submit no command and do not stop supervisor, release claims, schedule work, or create alternate storage. |
| T115-131-RED | Task 131 RED runs resident-runtime-adapter tests before implementation and proves absent, stale, forged, accessor-backed, prototype-swapped, sparse, extra-key, secret-bearing, and cross-run DTOs fail closed. |
| T115-131-GREEN | Task 131 GREEN runs adapter tests, git diff --check, npm run factory:check, and npm run verify after the smallest CF-1-compatible parser and adapter change. |
| T115-141-RED | Task 141 RED runs the panel test and only the route test assigned to Task 141 by Task 117 CF-1 reconciliation before implementation; it proves unsupported, stale, mismatched, extra-key, provider-setting, prompt, tool-argument, approval-result, and authority-override commands are rejected; it rejects Run retry, Cancelled, and Start the agent while transport acknowledgments remain requested/pending until durable projection/readback. |
| T115-141-GREEN | Task 141 GREEN runs the panel test and only the Task 117-assigned route test, git diff --check, npm run factory:check, and npm run verify after truthful controls and route parsing implement all six frozen labels and reject Run retry, Cancelled, and Start the agent. |
| T115-DETERMINISTIC | U deterministic tests use credential-free plain data and test fakes only; real provider acceptance is deferred to P/R/A coordinator-controlled approved Nous evidence. |
| T115-ACCEPTANCE | Lane U maps U-01 through U-07 to strict parser, truthful command, workspace reconnect, provider-safe setup, handoff readback, responsive accessibility, and served-checkout tailnet acceptance. |
| T115-REBASE | Task 131 starts only after CF-1; Task 141 starts only after Task 117 CF-1 reconciliation assigns route-test ownership plus reviewed merged Task 131 and Tasks 137 through 140, then rebases to every recorded predecessor SHA before review. |
| T115-REVIEW | Each future U task stops after one scoped commit for a different fresh reviewer, who leads with defects, missing tests, spec drift, ownership, provenance, no-secret, and no-effect failures. |
| T115-ROLLBACK | Rollback is forward-only: append a correction or superseding projection/command state, rebuild projections, and never delete evidence, fabricate completion, or restore fallback storage. |
| T115-STOP | Stop and return structured evidence to the coordinator for data-loss or fallback risk, shared-owner/schema conflict, secret exposure, external-effect expansion, mandatory dependency failure, or two focused verifier failures. |

Run this audit from the repository root after each change to this plan. It
extracts only the contract section, validates each full row, then replaces each
one with a removal marker and requires validation to fail.

~~~bash
node --input-type=module <<'NODE'
import { readFileSync } from "node:fs";

const file = "docs/superpowers/plans/2026-07-12-resident-agent-cockpit-implementation.md";
const plan = readFileSync(file, "utf8");
const heading = "Task 115 Section-Local Documentation Contract";
const contract = [
  ["T115-CF1-ONLY", "CF-1 alone freezes shared DTO versions, schemas, event bindings, route ownership, compatibility, and idempotency semantics; Task 115 proposes requirements only."],
  ["T115-U-FILES", "Task 131 owns resident-runtime-types.ts, resident-runtime-adapter.ts, and resident-runtime-adapter.test.ts; Task 141 owns agent-supervision-routes.ts, ResidentSupervisionPanel.tsx, and resident-supervision-panel.test.ts plus its claim; Task 117 CF-1 reconciliation assigns the owner of packages/local-runtime/test/agent-supervision-routes.test.ts before Task 141 dispatch."],
  ["T115-SNAPSHOT-TRUTH", "The cockpit renders one immutable projection snapshot and never treats browser memory, a transport acknowledgement, a runner result, or a cache as durable truth."],
  ["T115-PLAIN-OWN-DATA", "The parser accepts only normalized plain own-data objects and ordinary dense arrays, rejecting inherited values, accessors, symbols, sparse arrays, custom array properties, cycles, boxed values, and non-plain prototypes before field reads."],
  ["T115-STRICT-SCHEMA", "Every DTO and command boundary is a versioned discriminated union with unknown keys rejected and explicit IDs, hashes, timestamps, counts, unavailable branches, and safe categories."],
  ["T115-FREEZE-ONCE", "The normalizer snapshots and freezes input once before append, service call, or await and never rereads caller-owned input after await."],
  ["T115-CROSS-RUN", "Selected plan, observation, command, approval, and handoff data must equal selected workspace, resident, task, attempt, run, policy/hash, and projection bindings; cross-run or stale values fail closed."],
  ["T115-NO-SECRET", "The browser parser rejects credential values or locators, cookies, headers, prompt text, source bytes, raw argv, signed URLs, local paths, raw provider payloads, and unredacted diagnostics without echoing them."],
  ["T115-UNAVAILABLE", "Invalid, absent, stale, forged, or unsafe runtime data renders unavailable with a closed safe category and never falls back to a partial fixture, cached old state, or implied ready view."],
  ["T115-COMMAND-ALLOWLIST", "A route parser accepts only frozen supported command discriminants and an exact current-snapshot supported-command binding, never a client-selected action name."],
  ["T115-COMMAND-NARROW", "Each command includes a server-validated idempotency key, expected snapshot ID, and only frozen exact workspace/task/attempt/run/policy/projection identifiers; extra keys and authority overrides are rejected."],
  ["T115-COMMAND-NO-EFFECT", "No U command invokes a provider or tool, transfers provider bytes, sends, approves, exports, publishes, escalates, repairs destructively, or mutates accepted graph state."],
  ["T115-TRUTHFUL-LABELS", "Transport success is requested or pending only; paused, resumed, queued, cancellation-confirmed, setup-ready, and terminal labels require their next durable projection or readback."],
  ["T115-FROZEN-LABELS", "Task 117 CF-1 freezes the exact command-label mapping: workspace.recheck → Recheck mounted workspace; wake.pause → Pause new wake claims; wake.resume → Resume eligible wake processing; task.retry.request → Queue retry; task.cancel.request → Request cancellation; provider.setup.open → Open local provider setup."],
  ["T115-PROVIDER-VIEW", "Provider cards expose only P-owned capability/model labels, structural and invocation readiness categories, safe requirements, and safe projection evidence, not secret material or provider configuration."],
  ["T115-LOCAL-SETUP", "provider.setup.open is local-desktop-only after local-origin, operator-presence, and P-owned capability checks; it opens a P-owned platform flow and never accepts a secret in the browser."],
  ["T115-REMOTE-SETUP-OFF", "Provider setup is disabled on mobile and tailnet, and no form, URL, storage record, logger, telemetry payload, clipboard, or accessibility label can receive unsafe provider material."],
  ["T115-RUN-CLAIM-VISIBILITY", "The snapshot visibly binds workspace authority, agent_default, wake state, exact task/attempt/run, claim/lease fact, bounded-loop budgets, policy, locks, and a safe freshness category."],
  ["T115-TRIGGER-VISIBILITY", "Trigger views show T-owned family, policy, source high-water, dedupe/cooldown/budget category, and durable request/decision IDs while creating neither prompt nor trigger effect."],
  ["T115-APPROVAL-VISIBILITY", "Approval views show class, safe preview/content hash, independent-human requirement, staleness/lock/source binding category, and effect posture without approving or consuming approval."],
  ["T115-HANDOFF-READBACK", "A handoff is recorded-and-read-back only when its exact run-linked lifecycle event, material receipt/hash, manifest receipt/hash, provenance, and mounted readback all validate."],
  ["T115-HANDOFF-NO-INFERENCE", "A chat message, blob existence, manifest scan, service return, or terminal-looking status cannot establish handoff completion or expose retry, send, or approve-handoff controls."],
  ["T115-DESKTOP", "Desktop keeps exact selected run and freshness visible, exposes each rendered command and safe reason by keyboard, and presents cancellation as a request confirmation rather than a completed effect."],
  ["T115-MOBILE", "Mobile renders the same parsed command authority in a single-column accessible layout with freshness and exact selected task/attempt/run visible; it depends on no hover, hidden tooltip, offscreen drag, or desktop-only shortcut."],
  ["T115-TAILNET-AUTH", "Tailnet is an authenticated encrypted remote view of the same local runtime and mounted workspace, not a public service, second resident, team principal, or browser supervisor."],
  ["T115-TAILNET-REPARSE", "Tailnet reconnect discards old snapshot, reparses fresh data, and remains unavailable until workspace authority and selected-run bindings validate; disconnect causes no pause, fallback write, or claim-loss behavior."],
  ["T115-BROWSER-INDEPENDENT", "Browser close, crash, refresh, focus, route opening, polling, and network loss submit no command and do not stop supervisor, release claims, schedule work, or create alternate storage."],
  ["T115-131-RED", "Task 131 RED runs resident-runtime-adapter tests before implementation and proves absent, stale, forged, accessor-backed, prototype-swapped, sparse, extra-key, secret-bearing, and cross-run DTOs fail closed."],
  ["T115-131-GREEN", "Task 131 GREEN runs adapter tests, git diff --check, npm run factory:check, and npm run verify after the smallest CF-1-compatible parser and adapter change."],
  ["T115-141-RED", "Task 141 RED runs the panel test and only the route test assigned to Task 141 by Task 117 CF-1 reconciliation before implementation; it proves unsupported, stale, mismatched, extra-key, provider-setting, prompt, tool-argument, approval-result, and authority-override commands are rejected; it rejects Run retry, Cancelled, and Start the agent while transport acknowledgments remain requested/pending until durable projection/readback."],
  ["T115-141-GREEN", "Task 141 GREEN runs the panel test and only the Task 117-assigned route test, git diff --check, npm run factory:check, and npm run verify after truthful controls and route parsing implement all six frozen labels and reject Run retry, Cancelled, and Start the agent."],
  ["T115-DETERMINISTIC", "U deterministic tests use credential-free plain data and test fakes only; real provider acceptance is deferred to P/R/A coordinator-controlled approved Nous evidence."],
  ["T115-ACCEPTANCE", "Lane U maps U-01 through U-07 to strict parser, truthful command, workspace reconnect, provider-safe setup, handoff readback, responsive accessibility, and served-checkout tailnet acceptance."],
  ["T115-REBASE", "Task 131 starts only after CF-1; Task 141 starts only after Task 117 CF-1 reconciliation assigns route-test ownership plus reviewed merged Task 131 and Tasks 137 through 140, then rebases to every recorded predecessor SHA before review."],
  ["T115-REVIEW", "Each future U task stops after one scoped commit for a different fresh reviewer, who leads with defects, missing tests, spec drift, ownership, provenance, no-secret, and no-effect failures."],
  ["T115-ROLLBACK", "Rollback is forward-only: append a correction or superseding projection/command state, rebuild projections, and never delete evidence, fabricate completion, or restore fallback storage."],
  ["T115-STOP", "Stop and return structured evidence to the coordinator for data-loss or fallback risk, shared-owner/schema conflict, secret exposure, external-effect expansion, mandatory dependency failure, or two focused verifier failures."],
];
const row = (entry) => "| " + entry[0] + " | " + entry[1] + " |";
const extract = (document) => {
  const start = document.indexOf("## " + heading + "\n");
  if (start < 0) throw new Error("missing section");
  const end = document.indexOf("\n## ", start + heading.length + 4);
  return document.slice(start, end < 0 ? document.length : end);
};
const validate = (document) => {
  const local = extract(document);
  for (const entry of contract) {
    if (!local.includes(row(entry))) throw new Error("missing exact local row " + entry[0]);
  }
};
const replaceOne = (document, before, after) => {
  const at = document.indexOf(before);
  if (at < 0) throw new Error("counterfactual setup lost scoped section");
  return document.slice(0, at) + after + document.slice(at + before.length);
};

validate(plan);
let rejected = 0;
for (const entry of contract) {
  const local = extract(plan);
  const expected = row(entry);
  const mutated = local.replace(expected, "| " + entry[0] + " | [REMOVED BY COUNTERFACTUAL] |");
  if (mutated === local) throw new Error("mutation setup failed for " + entry[0]);
  let failedClosed = false;
  try {
    validate(replaceOne(plan, local, mutated));
  } catch {
    failedClosed = true;
  }
  if (!failedClosed) throw new Error("accepted direct mutation of " + entry[0]);
  rejected += 1;
}
for (const [expected, rejectedLabel] of [
  ["task.retry.request → Queue retry", "task.retry.request → Run retry"],
  ["task.cancel.request → Request cancellation", "task.cancel.request → Cancelled"],
  ["wake.resume → Resume eligible wake processing", "wake.resume → Start the agent"],
]) {
  let failedClosed = false;
  try {
    validate(replaceOne(plan, expected, rejectedLabel));
  } catch {
    failedClosed = true;
  }
  if (!failedClosed) throw new Error("accepted rejected frozen label " + rejectedLabel);
  rejected += 1;
}
console.log("GREEN: Task 115 cockpit plan audit passed (" + rejected + " direct local mutations rejected).");
NODE
~~~

The pre-write RED was expected exit 1 because this plan file did not exist. A
forward documentation repair must remove an exact local table row, observe this
audit fail, then restore the row and record a new GREEN result.

## CF-1 Gate And Future Consumer Surface

CF-1 must resolve the future snapshot ID, parser version, error taxonomy,
route path, authenticated transport, command idempotency grammar,
producer/projection binding, compatibility parser, and one file owner for every
shared field. A mismatch, duplicate writer, absent producer binding, or
unapproved compatibility alias blocks the future U claim; U does not invent a
replacement.

The following are required eventual signatures, not pre-CF-1 exports:

~~~ts
parseResidentRuntimeStatusDto(input: unknown): ResidentRuntimeStatusDto;
parseResidentRuntimeCommandDto(input: unknown): SupportedResidentRuntimeCommandDto;
submitResidentRuntimeCommand(input: {
  readonly command: SupportedResidentRuntimeCommandDto;
  readonly expectedSnapshotId: string;
  readonly idempotencyKey: string;
}): Promise<ResidentRuntimeCommandReceiptDto>;
~~~

The CF-1 status input includes a server-issued snapshot ID, parser/schema
version, as-of instant, mounted-ledger high-water mark, agent_default, and safe
freshness. It has discriminated available/unavailable families for:

| Family | Required truth and binding |
| --- | --- |
| Workspace/wake | mounted identity and lock verification, safe reason, high-water, policy hash/revision, supervisor/pause/recovery fact from W projections |
| Run/claim/loop | exact task/attempt/run, claim/lease, retry/cancel, mode, plan/observation summaries, bounds, tools, terminal/resumable fact from L/W projections |
| Trigger | family, source high-water, policy, dedupe/cooldown/budget decision and request/decision IDs from T; display only |
| Provider | P-owned safe capability/model, feasibility/readiness, reference-presence state, requirements and projection revision only |
| Handoff | exact run linkage, lifecycle, safe summary, event/provenance references, permitted hashes, readback/resumable/diagnostic fact from H |
| Approval/effect | class, safe preview/content hash, independent-human requirement, staleness/lock/source binding, blocked/allowed classification; display only |
| Supported command | code, exact current binding, visible label and safe reason derived by runtime, never guessed by browser |

CF-1 records these exact post-freeze U rows. A later claim owns exactly its row
and forbids every other tracked file.

| Task | U-owned files | Required predecessor state |
| --- | --- | --- |
| 131 / Wave 1 | packages/ui/src/agent/resident-runtime-types.ts; packages/ui/src/agent/resident-runtime-adapter.ts; packages/ui/test/resident-runtime-adapter.test.ts; docs/agentic/claims/task-131-resident-full-vision-w1-runtime-adapter.md | CF-1 cockpit DTO/parser, owner, producer and compatibility record |
| 141 / Wave 2 | packages/local-runtime/src/agent-supervision-routes.ts; packages/ui/src/agent/ResidentSupervisionPanel.tsx; packages/ui/test/resident-supervision-panel.test.tsx; docs/agentic/claims/task-141-resident-full-vision-w2-supervision-panel.md | Task 117 CF-1 records command/route rules and reconciles the owner of packages/local-runtime/test/agent-supervision-routes.test.ts before Task 141 dispatch, then reviewed merged 131 and 137 through 140 |

Task 131 does not own a shared event, provider configuration, runtime factory,
mount, lifecycle, trigger, handoff contract, route, panel, or acceptance matrix.
Task 141 does not own default factory, shared provider configuration, scheduler,
mounted stores, trigger/loop/handoff implementations, shared contracts, or
acceptance ownership.

## Task 131: Strict Browser DTO Parser And Adapter

**Preconditions:** CF-1 is merged and names the exact schema version, producer
revision bindings, safe category vocabulary, compatibility rule, and file owner.
The assigned worker starts from the coordinator SHA. A reduced fixture or
provisional schema is never a substitute.

- [ ] **Claim and RED.** Create the Task 131 claim with CF-1 SHA, owned and
  forbidden files, exact authorization, and the focused command, then mark it
  in-progress. Write production-shaped fixtures before implementation:

  ~~~bash
  npm test -- packages/ui/test/resident-runtime-adapter.test.ts packages/ui/test/agent-adapter.test.ts
  ~~~

  RED proves valid mounted data does not parse before implementation and that
  absent/stale/forged input, run/workspace/policy/projection mismatch, inherited
  or prototype-swapped values, accessors, symbols, sparse/custom arrays, cycles,
  boxed values, unknown keys, secret-bearing data, raw provider diagnostic, and
  terminal-looking non-readback handoff all fail closed before field access.

- [ ] **Implement one narrow normalizer and adapter.** Modify only Task 131
  files. Normalize once without invoking accessors, accept only own-data plain
  records/dense arrays, snapshot and freeze accepted input, reject unknown keys
  at every nested public boundary, bound safe fields, and validate all
  family-specific durable equality bindings. Parsing errors become frozen
  unavailable categories without echoed input. Do not import executable
  registries or server adapters into a React-importable module.

- [ ] **GREEN and fresh review.**

  ~~~bash
  npm test -- packages/ui/test/resident-runtime-adapter.test.ts packages/ui/test/agent-adapter.test.ts
  git diff --check
  npm run factory:check
  npm run verify
  ~~~

  GREEN requires production-shaped success, all adversarial failure cases,
  credential-free fixtures, no browser import of a server registry, no
  simplified fallback, and clean output. Commit only Task 131 files and claim.
  A different reviewer reruns the command and verification, mutates equality
  bindings and unsafe values, checks bundle boundaries, and rejects fallback or
  non-U changes. The coordinator records rebase/merge status.

## Task 141: Truthful Supervision Routes And Cockpit Panel

**Preconditions:** Task 117 CF-1 has reconciled and recorded the owner of
`packages/local-runtime/test/agent-supervision-routes.test.ts`; Task 141 cannot
claim or run that route test unless CF-1 assigns it to Task 141. The coordinator
has also reviewed and merged 131 and 137 through 140, recorded all required
SHAs and cross-lane commands, and rebased Task 141. CF-1 names route parser,
transport/session posture, command vocabulary, idempotency, durable
producer/readback effects, and the following exact command labels. Frozen terms
supersede this proposal while preserving every safety condition.

The only future command forms are workspace.recheck, wake.pause, wake.resume,
task.retry.request, task.cancel.request, and provider.setup.open. Navigation,
refresh, reconnect, opening a handoff, filtering, copying a safe ID, and viewing
an approval are not runtime commands. A handler normalizes once before append
or await, validates exact supported-command binding, then rechecks mounted
identity, locks, policy, source/artifact state, budgets, and approval posture
at consumption; stale or swapped input fails closed.

| Command code | Exact frozen label |
| --- | --- |
| `workspace.recheck` | Recheck mounted workspace |
| `wake.pause` | Pause new wake claims |
| `wake.resume` | Resume eligible wake processing |
| `task.retry.request` | Queue retry |
| `task.cancel.request` | Request cancellation |
| `provider.setup.open` | Open local provider setup |

- [ ] **Claim and RED.**

  ~~~bash
  npm test -- packages/ui/test/resident-supervision-panel.test.tsx <Task-117-assigned-route-test-if-Task-141-owns-it>
  ~~~

  Before implementation, tests prove the absent panel/routes cannot render the
  production DTO or submit commands. Reject unlisted discriminants, extra keys,
  arbitrary action, stale snapshot, other-run ID, workspace/policy mismatch,
  forged supported command, client approval result, provider setting, path,
  prompt, tool argument, authority override, and acknowledgment rendered as
  completed pause/resume/retry/cancel/setup/handoff effect. For all six command
  codes, RED requires the exact frozen label table above and rejects `Run
  retry`, `Cancelled`, and `Start the agent`; a transport acknowledgment stays
  requested/pending until the matching durable projection/readback.

- [ ] **Implement narrow route and read-only panel.** The route accepts exact
  DTOs only and returns a safe requested/pending receipt until subsequent
  durable projection/readback. It never calls provider/tool gateway or consumes
  approval. The panel consumes Task 131 parsed snapshot, renders a control only
  if supportedCommands includes it, uses only the exact frozen labels in the
  table above, and shows safe denial reasons rather than raw errors. It has no
  generic command, approval, handoff send/retry, or browser scheduler.

- [ ] **Implement local-only provider setup and responsive/tailnet safety.**
  Render P-owned safe readiness only. Setup requires frozen local origin,
  operator presence, and P capability; it opens a P-owned desktop flow but
  cannot accept, resolve, log, store, transmit, or return a secret. Disable it
  on mobile and tailnet. Desktop preserves exact run/freshness and keyboard
  access; mobile retains same authority in one accessible column with no
  hover-only dependency; tailnet is authenticated/encrypted, reparses fresh
  data after reconnect, and is unavailable until bindings validate. Browser
  close, refresh, polling, focus, or disconnect never writes, pauses, mounts,
  schedules, or releases a claim.

- [ ] **GREEN and review.**

  ~~~bash
  npm test -- packages/ui/test/resident-supervision-panel.test.tsx <Task-117-assigned-route-test-if-Task-141-owns-it>
  git diff --check
  npm run factory:check
  npm run verify
  ~~~

  GREEN covers all six exact frozen labels, rejection of `Run retry`,
  `Cancelled`, and `Start the agent`, truthful requested/pending-to-readback
  transitions, stale/forged/cross-run failure, keyboard/narrow-width behavior,
  local-only setup, reconnect reparse, no browser effect, and browser-safe
  imports. Commit only Task 141 files and claim. A different reviewer
  independently mutates command/snapshot bindings and the label mapping, runs
  focused and full gates, and verifies CF-1 route-test ownership before
  coordinator merge.

## Dependencies, Acceptance, Rollback, And Stop

| Acceptance | Required proof and owner |
| --- | --- |
| U-01 | Task 131 production-shaped parser rejects absent, stale, forged, accessor, prototype, sparse, extra-key, secret-bearing, and cross-run input; A adds adversarial coverage. |
| U-02 | Task 141 maps every rendered control to frozen command plus durable request/readback, with no optimistic completion. |
| U-03 | W with U/A proves disconnect/reconnect has no route/UI fallback, stale reuse, or auto-resume and visibly revalidates mounted authority. |
| U-04 | P with U/A proves safe readiness only, no browser secret flow, and setup disabled on tailnet/mobile. |
| U-05 | H with U/A proves exact run/provenance/readback handoff display and rejects swapped terminal-looking data. |
| U-06 | Task 141 with A proves desktop/mobile authority parity, keyboard/narrow width, and truthful unavailable/approval/pending display. |
| U-07 | A with U/W/P performs served-checkout desktop/mobile/tailnet evidence for DTO parity, authenticated transport, reconnect reparse, local-only setup, and browser-independent resident. |

No Task 115 live-provider gate applies. Later provider behavior uses only the
coordinator-controlled approved Nous gate; a provider outage becomes safe
feasibility or resumable evidence, never a fabricated pass.

Rollback is append-only: append a versioned correction or superseding
projection/command state, rebuild projections, rebase consumers, and rerun
focused tests. Never delete evidence, fabricate completion, hide a regression
in UI cache, create fallback storage, or substitute a workspace/provider.

Stop a future child and return structured evidence for shared owner/schema
conflict, stale predecessor, mount identity/readback failure, secret exposure,
arbitrary or external-effect command path, data-loss/fallback risk, unavailable
mandatory dependency, or two focused verifier failures. The standing coordinator
records root cause, supplies bounded repair and a fresh reviewer/tactic, and
escalates only for a genuine new product, scope, safety, data-loss, credential,
or external-behavior decision.

## Plan Review Stop

Task 115 ends after this plan and claim pass documentation GREEN, whitespace,
factory, full verification, and a different fresh plan review. It authorizes no
CF-1, Task 131, Task 141, production/test/UI/route/provider change, provider
setup/invocation, browser/tailnet serving, worker dispatch, rebase, integration,
or merge into neo.
