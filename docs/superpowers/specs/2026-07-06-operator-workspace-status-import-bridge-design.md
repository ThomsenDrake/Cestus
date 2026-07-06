# Operator Workspace Status And Import Bridge Design

Date: 2026-07-06

## Purpose

This design covers the first operator-facing workspace status and import bridge in the Cestus app. The bridge turns the local app into an operational cockpit for the first solo investigator workflow without bypassing the CLI, local-runtime, ingestion, workspace-ops, legacy import, or ontology contracts.

The first screen should answer five questions quickly:

- Which Cestus workspace is mounted?
- Is the portable ontology ledger healthy enough to trust as the local source of truth?
- Can ingestion run safely, or is it blocked by mount, approval, source, job, or provider gates?
- Is legacy Cestus import ready, or does the investigator still need samples, raw import approval, or ontology staging review?
- What is the next safe action, and which authoritative command or DTO proves it?

The bridge is not an onboarding wizard, file picker, repair tool, PRR sending surface, accepted-ontology review screen, or legacy truth importer. It is a dense operational cockpit that makes current readiness, diagnostics, and safe next commands visible.

## Approved Direction

The approved direction is a **Command Cockpit Status Bridge**.

The default Command screen remains the first app surface, but its first viewport becomes a status/import cockpit. Existing tactical UI language remains intact: dark operational canvas, hard lines, signal colors, dense metadata, small safe actions, and no marketing composition. The bridge uses top-level bands for Workspace, Ingestion, Legacy Import, and PRR/Investigations readiness, with progressive detail panels for diagnostics and JSON-friendly evidence.

The UI consumes stable DTOs and command contracts. It does not reimplement mount validation, workspace verification, ingestion approval rules, stale-source checks, projection rebuild safety, PRR lifecycle rules, or legacy ontology staging rules in React.

## Scope

In scope:

- A browser-safe operator status/readiness DTO package.
- A local-runtime read-only route that aggregates status from authoritative providers.
- A UI adapter that fetches the aggregate status DTO and redacts unsafe diagnostics.
- A Command cockpit surface that renders status bands, selected detail panels, source evidence, diagnostics, and next safe commands.
- Safe navigation actions such as opening Requests or Ingestion, refreshing status, and showing exact CLI commands the investigator can run manually.
- Tests that prove browser UI imports no Node-only workspace, runtime, filesystem, SQLite, blob-store, or ingestion service code.
- Factory readiness and documentation evidence for this approved design and plan.

Out of scope:

- PRR sends, legal escalation, publication, email delivery, or external legal action.
- Destructive repair, ledger rewrite, blob deletion, workspace migration, reset, compaction, or restore execution.
- Accepting legacy ontology assertions, resolving entities, accepting relationships, or promoting legacy truth.
- Hidden local duplication of external-drive ontology data.
- Selecting, mounting, or creating portable workspaces from browser request bodies.
- Provider byte transfer or live document-AI calls.
- User-specific legacy mapping plugins.
- Team permissions, remote sync, multi-user locking, or newsroom administration.

## Current Context

The repo already has the required lower-level contracts:

- `packages/workspace` owns portable workspace creation, mount validation, canonical `ledger/ontology.sqlite`, and fail-closed diagnostics.
- `packages/workspace-ops` owns CLI/JSON-first verification, disk usage, projection rebuild readiness, diagnostics inspection, manifest export, and backup check DTOs.
- `packages/local-runtime` can mount a portable workspace in portable mode and exposes safe health diagnostics.
- `packages/ingestion` owns runtime orchestration, stale-source verification, approval-only gates, local/provider parse jobs, and browser-safe ingestion DTOs.
- `packages/ui/src/ingestion` already consumes ingestion through an HTTP adapter and keeps storage paths out of request bodies.
- `packages/ingestion/src/legacy-read-api.ts` exposes `LegacyMigrationReviewDto` for legacy import readiness.
- Existing Command, Requests, and Ingestion UI surfaces use the tactical console design language and browser-boundary tests.

The gap is the operator-facing bridge across those contracts. Existing plans intentionally leave workspace-ops UI panels and local-runtime workspace-ops endpoints to a separate approved slice. Legacy import explicitly leaves product UI and local-runtime endpoints outside its implementation plan.

## Architecture

The bridge has four layers.

1. `packages/operator-status`: a browser-safe contract package that defines the aggregate readiness DTO, status section DTOs, diagnostics, source evidence references, and inert safe command descriptors.
2. `packages/local-runtime`: a read-only operator status service and HTTP route that adapts authoritative providers into the aggregate DTO.
3. `packages/ui/src/operator-status`: a browser adapter and Command cockpit components that render the DTO without importing Node-only modules.
4. Existing domain packages remain authoritative: workspace health comes from `workspace-ops`, ingestion readiness comes from ingestion runtime DTOs, legacy readiness comes from legacy import DTOs, and PRR readiness comes from PRR read DTOs.

The aggregate route is a facade over existing contracts, not a second domain model. It may normalize statuses and copy safe summary fields, but it must preserve source references so an AI agent or investigator can trace each UI state back to the provider DTO or command.

## DTO Contract

The first shared contract is `OperatorStatusDto`.

```ts
export type OperatorReadinessState =
  | "ready"
  | "degraded"
  | "action-required"
  | "blocked"
  | "unavailable";

export interface OperatorStatusDto {
  readonly schemaVersion: "operator-status.v1";
  readonly generatedAt: string;
  readonly runtime: {
    readonly available: boolean;
    readonly storageStrategy?: string;
    readonly bindMode?: string;
    readonly workspaceMounted?: boolean;
    readonly safeMessage: string;
  };
  readonly summary: {
    readonly overallState: OperatorReadinessState;
    readonly blockedCount: number;
    readonly actionRequiredCount: number;
    readonly degradedCount: number;
    readonly nextSafeActionId?: string;
  };
  readonly sections: readonly OperatorStatusSectionDto[];
  readonly safeActions: readonly OperatorSafeActionDto[];
}
```

Each section is small enough to scan and rich enough for an agent to consume.

```ts
export interface OperatorStatusSectionDto {
  readonly sectionId: "workspace" | "ingestion" | "legacy-import" | "prr";
  readonly label: string;
  readonly state: OperatorReadinessState;
  readonly headline: string;
  readonly safeSummary: string;
  readonly metrics: readonly OperatorStatusMetricDto[];
  readonly diagnostics: readonly OperatorDiagnosticDto[];
  readonly sourceEvidence: readonly OperatorSourceEvidenceDto[];
  readonly nextSafeActionIds: readonly string[];
}
```

Safe actions are inert descriptors. The browser can refresh status, navigate to another app module, or show an exact command string. It must not execute workspace repair, import, staging, PRR send, legal escalation, provider parsing, destructive filesystem operations, or accepted ontology changes from this bridge.

```ts
export interface OperatorSafeActionDto {
  readonly actionId: string;
  readonly label: string;
  readonly kind: "navigate" | "refresh-status" | "show-command" | "open-doc";
  readonly target?: "command" | "requests" | "ingestion" | "evidence" | "ontology" | "settings";
  readonly command?: string;
  readonly sourceContract: string;
  readonly requiresHumanApproval: boolean;
  readonly mutatesCanonicalState: boolean;
  readonly externalEffect: boolean;
  readonly enabled: boolean;
  readonly disabledReason?: string;
}
```

The contract rejects any action with `mutatesCanonicalState: true`, `externalEffect: true`, or an unsafe command kind in this slice. Future team/newsroom workflows can add role-aware approval metadata in a versioned contract without changing the UI principle that irreversible actions require explicit human-gated flows outside this cockpit.

## Product Surface

The first viewport is a dense cockpit under the existing Command band.

Top-level sections:

- Workspace: mount state, workspace identity, manifest state, ledger readability, high-water mark, projection state, diagnostics, backup/disk signals, and safe next workspace commands.
- Ingestion: mounted capability flags, source collection readiness, latest dry-run, approval-only raw import gate, stale-source warnings, import execution gate, local/provider job state, and diagnostics.
- Legacy Import: first artifact ask, latest migration report, raw import readiness, ontology staging approval state, quarantine/diagnostic counts, and evidence-first guardrails.
- PRR/Investigations: PRR workspace replay status, open request count, diagnostics, draft/readiness state, and a clear note that sends and legal escalation stay locked.

Progressive disclosure:

- The top-level bands show state, one headline, one safe summary, two to four metrics, and the recommended safe action.
- Selecting a band opens a detail panel with diagnostics, source evidence references, and exact command descriptors.
- The detail panel displays JSON-friendly references such as `schemaVersion`, `command`, `sourceContract`, `eventId`, `diagnosticId`, `workspaceId`, `sourceCollectionId`, `scanBatchId`, `legacyReportId`, and `prrRequestId` when available.
- The UI does not show raw document bodies, provider credentials, auth tokens, private keys, raw correspondence, or unrestricted absolute paths.

## Failure State Matrix

The bridge must distinguish these states:

- Missing drive: workspace section is `blocked`; next safe action shows `cestus-workspace detect drive --workspace <root>` or the sibling attachment command; no local fallback is implied.
- Swapped drive or wrong workspace: workspace section is `blocked`; source evidence includes manifest identity mismatch; next safe action is select/remount workspace.
- Uninitialized but valid external root: workspace section is `action-required`; next safe action points to explicit workspace creation or attachment flow; runtime must not create a workspace from a status read.
- Stale projections: workspace section is `degraded`; next safe action can show projection rebuild-readiness because projections are expendable.
- Ingestion blocked pending approval: ingestion section is `action-required`; action opens Ingestion, where approval-only gates already exist.
- Ingestion source changed since approval: ingestion section is `blocked`; diagnostics explain stale-source verification and no blob writes.
- Legacy samples needed: legacy section is `action-required`; detail panel shows the first artifact ask from `firstLegacyArtifactAsk`.
- Legacy raw import ready but not approved: legacy section is `action-required`; action opens Ingestion or shows the legacy CLI review command, depending on available sibling contract.
- Legacy ontology staging approved: legacy section can be `degraded` or `ready` depending on diagnostics, but it must still state that approved staging creates only evidence-tied `assertion.proposed`, not accepted graph truth.
- Runtime unavailable: all sections become `unavailable` with a safe local-runtime diagnostic and no hidden fallback DTO.
- PRR runtime readable with no open requests: PRR section is `ready` with zero-count metrics and a safe action to open Requests or create a draft.

## Data Flow

1. Browser loads the Command cockpit.
2. UI adapter calls `GET /api/operator/status`.
3. Local runtime creates or receives an `OperatorStatusProviderSet`.
4. Workspace provider adapts `workspace-ops` envelopes for verify workspace, disk usage, and optional projection readiness.
5. Ingestion provider adapts existing ingestion workspace, job, and diagnostics DTOs.
6. Legacy provider adapts `LegacyMigrationReviewDto` and sibling legacy operator CLI readiness when present.
7. PRR provider adapts the replayed PRR workspace DTO from the local runtime.
8. The aggregate service computes only presentation-level section states and safe actions.
9. UI renders bands and detail panels from the DTO.

If a provider fails, the aggregate route returns a successful operator DTO with the affected section marked `unavailable` and a diagnostic. The route itself fails only when local-runtime cannot produce a safe JSON response.

## Safety Rules

- Browser request bodies for the bridge are forbidden in the first slice. Status is read-only.
- The UI never accepts workspace root, SQLite path, blob root, storage path, provider credentials, or legacy source path input for this bridge.
- Safe command strings are display-only. They may be copied or read by an investigator, but the bridge does not execute them.
- Any action descriptor that mutates canonical state, sends bytes externally, sends PRR correspondence, escalates legally, repairs canonical ledger/blob state, stages legacy ontology, or accepts ontology truth is rejected by contract tests.
- Projection rebuild readiness may appear because it is non-canonical. Projection rebuild execution remains outside this bridge unless a future approved flow adds an explicit gate.
- Diagnostics are secret-safe and raw-content-free.
- The UI must continue passing browser boundary tests that forbid imports from `packages/workspace`, `packages/workspace-ops`, `packages/local-runtime`, Node built-ins, ingestion services, SQLite, filesystem APIs, and blob stores.

## AI-Agent Legibility

The DTO names, section IDs, action IDs, commands, diagnostics, tests, and acceptance criteria are intentionally explicit. A generic coding agent should be able to inspect the aggregate DTO and know:

- which authoritative contract produced each status;
- which safe command can be suggested next;
- whether the action requires approval;
- whether the action mutates canonical state;
- whether the action has an external effect;
- which diagnostics block readiness;
- which source IDs or event IDs support the UI state.

## Sibling Coordination

This bridge depends on three sibling planning streams:

- Legacy operator CLI: supplies stable legacy operator commands and richer legacy readiness DTOs. This bridge initially consumes `LegacyMigrationReviewDto` and first artifact ask text, then adapts the sibling DTO when it lands.
- Portable workspace attachment ops: supplies attachment, detect-drive, verify, disk, projection-readiness, backup, and diagnostics command contracts. This bridge displays those command contracts and consumes `workspace-ops` envelopes instead of validating the workspace in UI code.
- Local workspace readiness smoke: supplies local smoke expectations for runtime health and status. This bridge adds `/api/operator/status` to smoke coverage once the sibling smoke contract names the exact command.

The bridge must not re-own their implementations. It adapts their stable contracts and blocks or degrades when they are unavailable.

## Testing And Verification

Implementation must be test-driven.

Required targeted tests:

- Operator status contract tests for DTO parsing, state summaries, source evidence, diagnostic safety, and rejection of canonical/external actions.
- Local-runtime status service tests for mounted, missing, swapped, stale projection, ingestion blocked, legacy samples needed, PRR ready, and runtime provider failure states.
- HTTP route tests proving `GET /api/operator/status` is read-only, auth-aware, secret-safe, and does not accept path-bearing request bodies.
- UI adapter tests proving safe parsing, redaction, runtime unavailable mapping, and no Node-only imports.
- Component tests for status bands, section selection, detail panel diagnostics, safe command rendering, refresh action, and no irreversible controls.
- App integration tests proving Command first viewport renders the cockpit and module navigation remains stable.
- Visual contract tests proving the cockpit follows tactical console rules and avoids landing-page composition.
- Factory readiness checks requiring this spec and plan.
- `npm run verify`.

Recommended manual preview after implementation:

- Desktop Command cockpit.
- Mobile Command cockpit.
- Workspace missing-drive state.
- Ingestion approval-required state.
- Legacy samples-needed state.
- Runtime unavailable state.

## Acceptance Criteria

The bridge is ready when:

- The Command screen first viewport shows Workspace, Ingestion, Legacy Import, and PRR/Investigations readiness.
- Each section has distinct ready, degraded, action-required, blocked, and unavailable states where applicable.
- The UI consumes an aggregate status DTO and never imports domain/runtime/storage modules.
- Workspace validation, ingestion approval, stale-source checks, legacy staging, PRR sends, and repair semantics remain owned by their domain packages.
- Safe actions are inert descriptors or navigation/refresh controls only.
- Missing drive, swapped drive, uninitialized workspace, stale projections, ingestion approval blocks, legacy samples needed, and runtime unavailable states have precise diagnostics and safe next commands.
- No browser code accepts workspace paths, storage paths, provider credentials, legacy source paths, raw documents, PRR send commands, legal escalation commands, or canonical repair commands.
- Tests, typecheck, UI build, factory readiness, and `npm run verify` pass.

## Stop Conditions

Stop and escalate on:

- Any plan or implementation that can write, delete, repair, migrate, compact, or copy canonical ledger or blob state from the bridge.
- Any UI action that sends PRR correspondence, escalates legally, invokes provider byte transfer, accepts legacy ontology truth, stages assertions, or executes repairs.
- Any browser import of Node-only workspace, runtime, ingestion service, SQLite, filesystem, blob-store, or mount code.
- Any need for live credentials, external services, external drives that are unavailable, or user-specific legacy samples beyond the generic readiness state.
- Any schema conflict with workspace-ops, ingestion, legacy import, PRR, ontology, or local-runtime contracts.
- Any verifier failure after two focused repair attempts.

## Approval Record

The coordinator declined visual companion work and approved a text-first durable design and implementation plan for this checkpoint. The approved product decisions are:

- Build an operational cockpit, not a landing page.
- Treat CLI/domain contracts as authoritative.
- Avoid irreversible actions in this slice.
- Use progressive disclosure through status bands and detail panels.
- Distinguish precise failure states and suggested safe commands.
- Keep the status model scalable to team/newsroom mode.
- Keep DTOs, files, tests, commands, and stop conditions AI-legible.
- Depend on sibling legacy operator CLI, portable workspace attachment ops, and local workspace readiness smoke contracts rather than re-owning those implementations.
