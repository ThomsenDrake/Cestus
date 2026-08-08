# Resident Bootstrap Operator Workflow

Status: approved.

## Desired Behavior

Cestus extends the existing Ingestion workspace into the operator control
surface for one resident-agent-driven ontology bootstrap session. It preserves
the current tactical console, module rail, command band, decision rail,
browser-safe DTO boundary, append-only authority, and existing Agent and
Ontology workspaces. It does not add a separate Bootstrap module or replace
the current Cestus visual language.

The Ingestion workspace has one persistent, keyboard-operable stage strip in
this order: Source, Security, Manifest, Processing, Candidates, Boundary,
Truth, and Graph. A stage has exactly one of unavailable, blocked,
action-required, running, partially-complete, complete, abandoned, or
recovery-required. State precedence is deterministic: terminal `abandoned` or
`complete` first; otherwise `recovery-required`, `unavailable`,
`action-required`, `running`, `partially-complete`, then `blocked`. A stage is
`partially-complete` only when at least one selected artifact has a successful
terminal outcome and remaining work is blocked; the blocker remains a
diagnostic, not a second state. Its summary exposes safe counts, binding hashes, blocking
diagnostics, and at most one recommended next safe action. Loading, degraded,
stale, or incomplete state is never labeled ready, synced, live, or complete.

Only one bootstrap session may be active per workspace. Starting another is
rejected before an event or effect. Completed and abandoned sessions remain
immutable, ledger-rebuildable, read-only history. Browser state is never the
session authority; reload reconstructs the selected session, stage states,
approvals, work, terminal outcomes, and next allowed action from browser-safe
runtime projections.

The append-only session contract consists of
`ingestion.bootstrap.session.started`, `ingestion.bootstrap.stage.observed`,
`ingestion.bootstrap.session.completed`, and
`ingestion.bootstrap.session.abandoned`. Session start, completion, and
abandonment are named-human actions authenticated from the tailnet session at
consume time. The server derives the principal, resolves it to the one locally
configured named human, and requires it to equal the immutable session
operator; a resident, system process, absent/unavailable tailnet session, or
client-supplied actor field fails before append. `started` conditionally checks
that no active session exists and binds workspace, source-boundary workflow,
server-derived operator, and initial contract revisions. Stage observations
bind only authoritative underlying event/high-watermark identities and derived
state; they create no new approval. Completed/abandoned are one terminal event
and never reopen. Projection replay enforces exclusivity and derives
stage/session history.

At completion consumption, the server rereads and binds the authoritative
heads/high-watermarks for all eight stages; a browser's claimed stage state is
not authority. It appends `completed` only when all predicates hold together:
Source has one current approved exact boundary and non-stale terminal manifest;
Security has a current validated posture for every selected artifact that
requires it and no unresolved security action; Manifest has one current exact
selection and unconsumed/stale approval is absent; Processing has the bound
Specification 21 batch terminal with every selected entry accounted for and no
`prepared`, `finalizing`, or `recovery-required` obligation; Candidates has no
active extraction/invocation and every eligible committed artifact has its
immutable terminal candidate bundle or explicit terminal no-candidate result;
Boundary has no pending required revision/request decision for that candidate
set; Truth has a terminal human disposition for every applicable bundle, with
an explicitly preserved unresolved conflict allowed only where Specification 26
permits it; and Graph has a terminal human disposition for every applicable
entity/relationship bundle, with an explicitly preserved unresolved conflict
allowed only where Specification 27 permits it. A pending required ontology
decision, stale binding, missing terminal disposition, or any nonterminal work
rejects completion without an event.

At abandonment consumption, the same authenticated operator and authoritative
stage heads are required. Source must have no active scan; Security no in-flight
posture action; Manifest no active mutation; Processing no lease and no
selected entry `prepared`, `finalizing`, or `recovery-required`; Candidates no
active extraction/invocation; and Boundary, Truth, and Graph no uncommitted
terminal action. Cancellation/stop recovery must first reach that exact
Specification 21 safe state. Abandonment does not approve, reject, cancel,
retry, erase, or otherwise mutate source, security, manifest, processing,
candidate, boundary, truth, or graph product work. Pending Boundary, Truth,
and Graph decisions remain pending underlying work and their stage observations
are `abandoned`, never `complete`; later work requires a new session or its own
existing authorized route. Thus no terminal session event strands a
prepared/recovery obligation or relabels unresolved ontology decisions as
complete.

Source, Security, Manifest, and Processing operate in Ingestion. Candidates
opens a focused Agent review mode. Boundary, Truth, and Graph open focused
Ontology review modes. Every handoff binds workspace/session/stage/object and
return location. Returning restores the same session/stage without relying on
an untrusted URL to select authority. Ingestion retains a safe status summary
and deep link for each handed-off review; it does not duplicate an independent
decision model.

The Source stage asks the local runtime to enumerate attached removable
volumes and resident-recommended workspace roots. Discovery returns opaque
root IDs, safe labels, mount posture, and workspace-relative candidate paths;
it exposes no arbitrary server filesystem browser. The resident may recommend
the likely OpenPlanter root and explain safe evidence, but nothing is
preselected. The human approves exactly one directory boundary under one
discovered removable root. Whole-volume selection is not the default and
free-form remote path entry is absent. Boundary approval is exact and one-use;
any root/mount/directory identity change invalidates it.

The Security stage has independent Local redaction, Secret storage, and
Mistral OCR readiness panels. Local redaction shows the pinned LFM bundle
identity, install/verification posture, provenance, and the explicit setup
action from Specification 17. No download starts merely by opening, scanning,
or resuming the workspace. Secret storage shows the OS Secret Service as the
primary posture. If unavailable, the encrypted file fallback requires the
Specification 16 warning and two distinct human confirmations, explains that
the passphrase is required every start, never stores/displays the passphrase,
and requires no separate hardware.

Mistral readiness shows only credential-reference health, exact endpoint/model
policy, current UTC workspace page budget posture, page reservation/usage,
concurrency, and external byte-transfer posture from Specifications 20 and 23.
The credential value, authentication header, or secret-shaped provider data is
never browser-visible. Disabling the page budget is a separate explicit human
action with an impact warning but is not the insecure-store double
confirmation. Mistral unavailability blocks image, embedded-image, and PDF
artifacts; eligible text artifacts may continue independently. Before any text
success the stage is `blocked`; after at least one successful text outcome it
is `partially-complete`. It is never both and never falsely complete.

After exact source approval, safe classification/manifest preparation begins
automatically within Specifications 18-20. The Manifest stage groups
occurrences as Recommended, Review Required, Excluded, Over Limit, or Changed
During Observation. Recommendations are initially unselected. `Select
recommended` is an explicit, reversible human action. Ordinary eligible
occurrences may be bulk-selected; review-required JSON always requires an
individual decision and never enters bulk selection.

Before final manifest approval, the interface displays the exact approved
boundary, opaque public manifest ID and its keyed commitment, selected
occurrence count, protected-file count, estimated canonical storage growth,
OCR page estimate, repeated-PDF-transfer disclosure, external-transfer scope,
Mistral policy/budget posture, and named operator. The protected canonical
manifest SHA-256 is available only through Specification 19's authenticated
protected readback and never this display, DTO, event, projection, diagnostic,
or log. Final approval creates the exact one-use capability defined by
Specification 20. Changing selection, boundary, manifest identity/commitment,
model policy, budget posture, or transfer posture invalidates prior
confirmation. The UI never silently expands a recommendation or stale
approval.

The Processing stage displays per-artifact pipeline rows, not a single opaque
progress claim. A row uses safe workspace-relative occurrence identity and
shows media class, ordinary/protected lane, current operation, completed
derivatives, OCR page/window progress, resident extraction state, terminal
outcome, and safe diagnostic/recovery action. It never renders raw protected
content, raw `.env` values, private JWK material, secrets, or unredacted
previews.

The session summary separately reports ordinary/protected utilization;
completed, running, blocked, quarantined, abandoned, and recovery-required
counts; OCR pages reserved/consumed/ambiguously billed; exact resident backend,
provider/model/capability identity; and scheduler stop posture. Per-artifact
pipelining permits eligible text to reach review while media waits for OCR.
Session completion requires one durable terminal outcome for every selected
occurrence and no unresolved prepared operation.

The session-lifecycle action list is closed: authenticated named-human start,
completion, and abandonment use the server-derived tailnet identity and the
consume-time predicates above; no resident, system, or client actor may invoke
them. Processing actions otherwise derive only from Specification 21 state. A
classified transient failure may expose the single unchanged-binding retry.
Quarantine displays the resident recommendation without preselection. Ambiguous
OCR billing requires human acknowledgement before its one permitted retry.
Cancellation explains the unstarted, pre-commit, or prepared posture:
unstarted/pre-commit work terminalizes safely; prepared work completes its
atomic commit. A systemic stop schedules no new work and presents
recovery-required without falsely terminalizing unfinished work. Resume appears
only for a runtime-validated recovery action with unchanged required bindings.

Candidates summarizes Specification 24 extraction in Ingestion and deep-links
to a read-only Agent inspection mode. Each item shows safe candidate content, exact resident
backend/provider/model/capability/invocation, modality path, evidence/anchors,
confidence, transfer approval, OCR evidence, direct-image observations when
supported, conflicts, and review-only reasons. A malformed or failed model
invocation has no silent fallback/repair. Resident recommendations are
visually distinct from later human truth/graph selections. Candidate mode
creates no disposition, selection, approval, or truth event; conflicts and
review-only requirements receive their individual decisions only in the bound
Boundary, Truth, or Graph stage defined by Specifications 25-27.

Boundary deep-links to Ontology and presents the closed-world revision from
Specification 25, requested terms/rules, cardinality/identity effects, and
affected candidates/history. The resident may recommend and may request an
append of a non-authoritative boundary-change request only after explicit
human approval of that append. It cannot approve the request or revision.
Exact revision approval binds current head/hash, proposal, affected material,
candidate set, and human operator. Required but unapproved changes block
dependent truth/graph work. Breaking changes identify material that becomes
`legacy-out-of-boundary`; rollback creates another revision.

Truth deep-links to Ontology and presents Specification 26 assertion bundles:
provisional subject, predicate, tagged typed value, complete evidence/source
anchors, extraction provenance, confidence, conflict state, active boundary,
and recommendation. Ordinary compatible assertions may be explicitly bundled.
Review-only/conflicting assertions require individual decisions. Single-value
or mutually exclusive truth accepts exactly one alternative or preserves an
unresolved conflict with none; multi-value is available only when the boundary
permits it. Any selection change invalidates prior confirmation.

Graph deep-links to Ontology and presents Specification 27 entity/relationship
bundles. A provisional subject selects a deterministic new entity, one
existing entity, or unresolved conflict; the UI never offers merging two
resolved entities. Existing-entity matches and ambiguities require individual
review. Relationship cards show endpoints/type, supporting entity-reference
assertions, contradictions/evidence, dependencies, and whether the effect is a
new edge or append-only support. Deselecting any dependency removes dependent
selections visibly and changes the exact approval hash.

Truth and graph commitment each require one authenticated human confirmation
over the complete exact effect. Graph commitment is all-or-none. After commit,
the workflow links to the existing accepted-graph provenance view and clearly
distinguishes new entities, new relationships, added support, unresolved
conflicts, and legacy-out-of-boundary history. Proposed material is never
rendered as an accepted edge or accepted truth.

For this preview, one locally configured named human operator is bound to the
authenticated tailnet session. That identity is displayed on every approval,
rejection, boundary request append, cancellation, retry acknowledgement, and
security override. Client-supplied actor IDs are rejected; the server derives
the actor from the authenticated session and compares it with the action
binding. Multi-user roles are out of scope.

The workflow uses existing command-black/console surfaces, Inter text,
monospace identifiers, amber operations, red blocking/danger, cyan
navigation/provenance, and green verified completion. Desktop retains module
rail, command band, main workspace, and decision rail. On smaller screens the
stage strip scrolls horizontally and review detail stacks after its summary.
No essential control is hover-only.

State and actions remain understandable without color. Stage tabs, progress,
recommendations, selections, warnings, conflicts, and terminal outcomes have
semantic text/labels. Keyboard users can navigate tabs, artifact rows,
anchors, decisions, and dialogs. Focus returns to the initiating control.
Reduced-motion settings disable nonessential transitions.

All DTOs are strict, immutable, browser-safe projections. Paths are safe
workspace-relative display values; credential references may appear but
credentials may not. Raw ledger rows, passphrases, tokens, authorization
headers, raw protected values, provider-secret data, and credential-shaped
diagnostics fail schema validation before render. Double confirmation is only
the insecure store override. Other confirmation surfaces show operator,
bound hashes, exact effect, invalidation conditions, and external-transfer
effect where applicable.

The UI cannot start/bind a live server, broaden tailnet/public exposure, test a
real credential merely by rendering/reviewing, invoke an unrelated provider,
seed product data, send PRRs, publish, mutate accepted truth without exact
human authority, or weaken any product safety gate.

## Observable Acceptance Examples

- Ingestion renders the eight ordered tabs inside the existing OpsShell. Each
  is keyboard selectable, reports textual state, and preserves the active
  session across safe reload and Agent/Ontology round trips.
- With one active session, a second start is rejected without a ledger event.
  Start, completion, and abandonment derive the same configured named human
  from the authenticated tailnet session; resident, system, missing-session,
  stale-session, and client-supplied actor attempts append no event.
  Completed/abandoned sessions are selectable read-only and expose no mutable
  actions.
- Discovery shows removable-root candidates and an unselected resident
  OpenPlanter recommendation. It offers no arbitrary path field and does not
  preselect a whole SSD. Root identity change invalidates source approval.
- Opening Security downloads nothing. Explicit LFM setup exposes verified
  bundle posture. OS-store failure offers the warning and two confirmations;
  no passphrase value reaches a DTO or later render.
- Missing Mistral readiness blocks image/PDF rows but permits eligible text
  rows to advance. The stage is `blocked` before a success and
  `partially-complete` after one, never both or complete.
- Candidate inspection is read-only and survives reload through immutable
  Specification 24 bundles; selections/dispositions occur only in later exact
  Boundary, Truth, or Graph review.
- Manifest recommendations start unselected; explicit selection includes
  ordinary recommended entries only. Review-required JSON stays unselected
  until an individual action. The approval display exposes only the opaque
  public manifest ID and keyed commitment, never the protected canonical
  SHA-256; selection/model/budget/manifest-binding change invalidates the old
  exact approval.
- Processing reconstructs every artifact from projection state. Transient
  failure exposes at most one unchanged-binding retry; quarantine has an
  unselected recommendation; prepared cancellation finishes atomic work;
  systemic stop shows recovery-required and schedules nothing new.
- Completion rejects a stale stage head, nonterminal source/security/manifest/
  processing/candidate work, or a pending required Boundary, Truth, or Graph
  decision. Abandonment rejects active work or any prepared/recovery obligation,
  leaves pending ontology decisions pending rather than complete, and erases or
  mutates no underlying product work.
- Candidate review shows exact active resident model/backend and both OCR and
  direct-image paths where applicable. Conflict/review-only material cannot
  enter a bulk decision, and malformed output has no fallback model.
- A resident boundary request cannot append without a human approval and can
  never approve its own requested revision. A stale boundary confirmation
  produces no authority event.
- Truth accepts one exact allowed selection or preserves conflict; a client-
  supplied actor ID, stale proposal, or unpermitted multi-value selection
  produces no acceptance event.
- Graph review removes dependent relationships when an endpoint is deselected;
  refuses two-existing-entity merge; and projects an exact committed batch or
  none. Accepted results deep-link to provenance; proposals remain review
  material.
- Desktop/mobile, keyboard, no-color, focus-return, reduced-motion, loading,
  unavailable, degraded, stale, and recovery states pass component tests.
- Adversarial DTO fixtures containing a token, passphrase, Authorization
  header, raw `.env` value, private JWK, raw ledger row, absolute host path, or
  untrusted actor ID fail closed before render/action.
- Tests use synthetic roots, manifests, credentials references, provider
  results, events, and sessions. They perform no SSD read, model download,
  credential access, provider request, socket bind, PRR, publication, or
  accepted ontology mutation.

## Allowed Scope

- `packages/ui/src/App.tsx` and existing workspace navigation/shell components
  only to add stage routing, safe handoff/return context, session history, and
  existing-shell status integration. Do not add a Bootstrap module.
- `packages/ui/src/ingestion/**` for the Source, Security, Manifest,
  Processing, and bootstrap-stage summaries, strict DTOs/adapters/actions, and
  focused responsive/accessibility behavior.
- `packages/ui/src/agent/**` only for the focused resident-candidate review
  mode and safe return handoff.
- `packages/ui/src/ontology/**` only for focused Boundary, Truth, and Graph
  review modes plus accepted-provenance handoff.
- `packages/ui/src/operator-status/**` and `packages/ui/src/workspace/**` only
  where required to expose the current bootstrap state/next safe action in the
  existing command/decision surfaces.
- `packages/ui/src/styles.css` only for existing-design-system tokens or stage
  interaction behavior; no replacement visual system.
- `packages/ui/test/**` for stage navigation, state truthfulness, handoffs,
  action authority, security/manifest/processing, candidate/boundary/truth/
  graph review, strict DTO safety, responsive, and accessibility tests.
- `packages/local-runtime/src/**` only for authenticated browser-safe bootstrap
  session/stage/history/review routes, server-derived named operator identity,
  exact action forwarding, and current projections required by this UI.
- `packages/local-runtime/test/**` for route authorization, DTO redaction,
  staleness, idempotency, session exclusivity, zero-effects, and handoff tests.
- `packages/ontology/src/contracts.ts`, the existing atomic event ledger, and
  focused projections/tests only for the four version-one bootstrap-session
  events, conditional single-active-session append, terminality, and rebuild.
- `packages/ingestion/src/bootstrap-session.ts` and focused adjacent projection/
  read modules only for session start, authoritative stage observation,
  terminal completion/abandonment, exclusivity, and history; these commands
  create no import/boundary/truth approval.
- `packages/ingestion/test/bootstrap-session.test.ts` for concurrent start,
  replay, stage-state precedence, terminal immutability, and ledger rebuild.
- `packages/agent/src/**`, other `packages/ingestion/src/**`,
  `packages/ontology-bootstrap/src/**`, and other `packages/ontology/src/**` only for
  missing browser-safe read projections or exact already-authorized command
  adapters; do not change Specifications 16-27 product semantics.
- Do not modify provider/model algorithms, OCR/redaction behavior, secret
  formats, ontology definitions, ledger invariants, PRR, legal, export,
  publication, destructive operations, bind configuration, or tailnet/public
  exposure.

## Relevant Context Entry Points

- `AGENTS.md`
- `docs/agentic/software-factory.md`
- `.agents/skills/cestus-software-factory/SKILL.md`
- `docs/agentic/specifications/16-secret-commitment-backend.md`
- `docs/agentic/specifications/17-pinned-lfm-installation-runtime.md`
- `docs/agentic/specifications/18-protected-secret-redaction.md`
- `docs/agentic/specifications/19-descriptor-confined-source-scan.md`
- `docs/agentic/specifications/20-exact-import-approval-evidence-admission.md`
- `docs/agentic/specifications/21-protected-import-scheduling-recovery.md`
- `docs/agentic/specifications/22-local-artifact-derivatives-anchors.md`
- `docs/agentic/specifications/23-automatic-mistral-ocr.md`
- `docs/agentic/specifications/24-resident-multimodal-candidate-extraction.md`
- `docs/agentic/specifications/25-ontology-boundary-revision-authority.md`
- `docs/agentic/specifications/26-assertion-bundle-review-acceptance.md`
- `docs/agentic/specifications/27-entity-relationship-graph-bundles.md`
- `packages/ui/src/App.tsx`
- `packages/ui/src/workspace/OpsShell.tsx`
- `packages/ui/src/workspace/workspace-nav.ts`
- `packages/ui/src/ingestion/IngestionWorkspace.tsx`
- `packages/ui/src/agent/AgentWorkspace.tsx`
- `packages/ui/src/ontology/OntologyWorkspace.tsx`
- `packages/ui/src/operator-status/OperatorCockpit.tsx`
- `packages/ui/src/styles.css`
- `packages/local-runtime/src/http-handler.ts`
- `packages/local-runtime/src/ingestion-http-routes.ts`
- `packages/local-runtime/src/agent-http-routes.ts`
- `packages/local-runtime/src/ontology-http-routes.ts`

## Risk Lane

Red. This UI presents external byte-transfer, secret-store override, ontology
boundary, accepted truth, and graph commitment actions. Every red effect stays
behind its exact authenticated human gate; tests use synthetic projections and
must not execute the live effect.

## Targeted Verification

- `npm test -- packages/ui/test/ingestion-workspace.test.tsx packages/ui/test/ingestion-bootstrap-stages.test.tsx packages/ui/test/ingestion-source-security.test.tsx packages/ui/test/ingestion-manifest-processing.test.tsx`
- `npm test -- packages/ui/test/agent-candidate-review.test.tsx packages/ui/test/ontology-boundary-review.test.tsx packages/ui/test/ontology-truth-review.test.tsx packages/ui/test/ontology-graph-review.test.tsx`
- `npm test -- packages/ui/test/bootstrap-app-integration.test.tsx packages/ui/test/operator-app-integration.test.tsx packages/ui/test/shell.test.tsx`
- `npm test -- packages/ontology/test/contracts.test.ts packages/ingestion/test/bootstrap-session.test.ts`
- `npm test -- packages/local-runtime/test/bootstrap-operator-routes.test.ts packages/local-runtime/test/bootstrap-operator-safety.test.ts`
- `npm run typecheck`
- `npm run ui:build`
- `npm run factory:check`

Success means every command exits zero and proves truthful stage/session state,
existing-shell navigation, resident recommendations without preselection,
server-derived operator authority, exact/stale-safe actions, independent
per-artifact progress/recovery, protected DTOs, accessible responsive review,
and zero live/external/accepted-truth effects.

## Integration Verification

Build only after Specifications 16-27 are integrated. Update the candidate
normally against latest `neo`, obtain a fresh Sol `ship` verdict on the final
diff, then run `npm run verify` once on the final merged candidate. Compare
with the current recorded baseline and latest `neo` CI; reject any new or
worsened failure. Integrate with normal Git history, push only configured
`origin`, observe CI, do not open a pull request, and do not force-push. Live
tailnet binding, credential configuration/use, LFM download, provider transfer,
source-boundary approval, insecure-store override, and ontology truth/graph
decisions remain separate human-gated actions.

## Escalation Conditions

Escalate for a second active session, arbitrary remote/whole-drive default
selection, a new Bootstrap module, client-authored operator identity,
recommendation preselection, hidden/incomplete stage state, raw protected or
credential material in a DTO, weakened double confirmation, unbound/stale
approval, agent-approved boundary/truth/graph, partial graph visibility,
changed Specifications 16-27 semantics, a live external/network/product
effect during build, unavailable safe authenticated session identity, or the
same concrete failure surviving two focused repair attempts.
