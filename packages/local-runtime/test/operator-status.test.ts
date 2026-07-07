import { describe, expect, it } from "vitest";
import { operatorStatusDtoSchema } from "../../operator-status/src/contracts.js";
import type { OperatorStatusDto } from "../../operator-status/src/contracts.js";
import type { AgentStatusDto } from "../../agent/src/runtime-types.js";
import type { IngestionReviewDto } from "../../ingestion/src/read-api.js";
import type {
  WorkspaceDiagnosticDto,
  WorkspaceOpsEnvelope,
  WorkspaceVerifyDto
} from "../../workspace-ops/src/contracts.js";
import { buildOperatorStatusDto } from "../src/operator-status.js";

describe("operator status aggregation", () => {
  const now = () => "2026-07-06T21:00:00.000Z";

  it("reports mounted workspace, ingestion action gate, legacy samples, and PRR readiness", async () => {
    const status = await buildOperatorStatusDto({
      now,
      runtime: {
        available: true,
        storageStrategy: "portable-workspace",
        bindMode: "loopback",
        workspaceMounted: true,
        safeMessage: "Runtime ready."
      },
      workspace: async () => ({
        schemaVersion: "workspace-ops.v1",
        command: "verify workspace",
        ok: true,
        status: "ready",
        workspace: {
          workspaceId: "ws_case_001",
          label: "Case 001",
          manifestVersion: 1,
          rootUri: "file:///workspace",
          layoutContractVersion: "portable-workspace-layout.v1-provisional"
        },
        payload: {
          schemaVersion: "workspace-ops.v1",
          mountStatus: {
            status: "available",
            safeMessage: "Workspace is available.",
            nextCommandHints: [
              {
                allowedNextCommands: ["verify workspace"],
                safeReason: "Verify workspace state.",
                requiresHumanApproval: false
              }
            ]
          },
          manifest: {
            readable: true,
            valid: true,
            manifestVersion: 1,
            safeSummary: "Manifest valid."
          },
          layout: {
            contractVersion: "portable-workspace-layout.v1-provisional",
            readable: true,
            requiredRoots: []
          },
          ledger: { readable: true, eventCount: 14, highWaterMark: 14 },
          blobStore: {
            available: true,
            contentAddressedRootCount: 2,
            aggregateBytes: 2048,
            missingBlobCount: 0,
            hashMismatchCount: 0
          },
          projections: { available: true, staleCount: 0, rebuildable: true },
          jobs: { available: true, queuedCount: 0, failedCount: 0 },
          diagnostics: { visible: true, errorCount: 0, warningCount: 0 },
          backup: { manifestAvailable: false, stale: true }
        },
        diagnostics: [],
        proposedActions: []
      }),
      ingestion: async () => ({
        workspace: {
          mounted: true,
          workspaceId: "ws_case_001",
          label: "Case 001",
          capabilities: {
            canReadLedger: true,
            canAppendLedger: true,
            canWriteBlobs: true,
            canWriteDerivatives: true,
            canWriteJobState: true
          },
          review: {
            sourceCollectionId: "src_old_archive",
            label: "Old archive",
            latestScanBatchId: "scan_001",
            totals: {
              observedFiles: 8,
              uniqueContent: 6,
              duplicateOccurrences: 2,
              skipped: 0,
              bytes: 4096,
              estimatedNewBlobBytes: 2048
            },
            approvalRequired: true,
            duplicateGroups: [],
            evidenceLinks: [],
            parseJobs: [],
            diagnostics: []
          },
          diagnostics: []
        },
        jobs: { jobs: [] },
        diagnostics: { diagnostics: [] }
      }),
      legacy: async () => ({
        sourceCollectionId: "src_old_archive",
        rawImportRequiresApproval: false,
        ontologyStagingApproved: false,
        firstArtifactAsk: [
          "Read-only folder tree listing of the old Cestus root",
          "Two to five sanitized metadata or ontology files",
          "Any old manifest, index, registry, or graph export file if present"
        ],
        diagnostics: []
      }),
      prr: async () => ({
        cards: [],
        diagnostics: []
      }),
      agent: async () => agentStatus()
    });

    expect(operatorStatusDtoSchema.parse(status)).toEqual(status);
    expect(status.summary.overallState).toBe("action-required");
    expect(status.sections.map((section) => [section.sectionId, section.state])).toEqual([
      ["workspace", "ready"],
      ["ingestion", "action-required"],
      ["legacy-import", "action-required"],
      ["prr", "ready"],
      ["agent", "ready"]
    ]);
    expect(JSON.stringify(status)).not.toMatch(/token|password|private key/i);
  });

  it("turns provider failure into unavailable section state without failing the whole DTO", async () => {
    const status = await buildOperatorStatusDto({
      now,
      runtime: { available: true, safeMessage: "Runtime ready." },
      workspace: async () => {
        throw new Error("workspace unavailable");
      },
      ingestion: async () => ({
        workspace: { mounted: false, diagnostics: [] },
        jobs: { jobs: [] },
        diagnostics: { diagnostics: [] }
      }),
      legacy: async () => {
        throw new Error("legacy unavailable");
      },
      prr: async () => ({ cards: [], diagnostics: [] })
    });

    expect(operatorStatusDtoSchema.parse(status)).toEqual(status);
    expect(status.sections.find((section) => section.sectionId === "workspace")?.state).toBe(
      "unavailable"
    );
    expect(status.sections.find((section) => section.sectionId === "legacy-import")?.state).toBe(
      "unavailable"
    );
  });

  it("treats approved legacy staging with a report as ready even when generic sample ask text is present", async () => {
    const status = await buildOperatorStatusDto({
      now,
      runtime: { available: true, safeMessage: "Runtime ready." },
      workspace: readyWorkspace,
      ingestion: readyIngestion,
      legacy: async () => ({
        sourceCollectionId: "src_old_archive",
        latestReportId: "legacy_report_001",
        rawImportRequiresApproval: false,
        ontologyStagingApproved: true,
        firstArtifactAsk: [
          "Read-only folder tree listing of the old Cestus root",
          "Two to five sanitized metadata or ontology files"
        ],
        diagnostics: []
      }),
      prr: readyPrr
    });

    expect(operatorStatusDtoSchema.parse(status)).toEqual(status);
    expect(status.sections.find((section) => section.sectionId === "legacy-import")?.state).toBe(
      "ready"
    );
    expect(status.summary.overallState).not.toBe("action-required");
  });

  it("does not throw or leak unsafe provider reference text", async () => {
    const status = await buildOperatorStatusDto({
      now,
      runtime: { available: true, safeMessage: "Runtime ready." },
      workspace: readyWorkspace,
      ingestion: async () => ({
        workspace: {
          mounted: true,
          workspaceId: "ws_case_001",
          label: "Case 001",
          review: {
            sourceCollectionId: "src_token=abc123",
            label: "Old archive",
            totals: emptyIngestionTotals(),
            approvalRequired: false,
            duplicateGroups: [],
            evidenceLinks: [],
            parseJobs: [],
            diagnostics: []
          },
          diagnostics: []
        },
        jobs: { jobs: [] },
        diagnostics: { diagnostics: [] }
      }),
      legacy: readyLegacy,
      prr: readyPrr
    });

    expect(operatorStatusDtoSchema.parse(status)).toEqual(status);
    expect(JSON.stringify(status)).not.toContain("token=abc123");
    expect(JSON.stringify(status)).not.toContain("abc123");
    expect(status.sections.find((section) => section.sectionId === "ingestion")?.state).toMatch(
      /^(ready|unavailable)$/
    );
  });

  it("builds an Agent section from agent-status.v1 metrics and legal locks", async () => {
    const input = {
      now,
      runtime: { available: true, safeMessage: "Runtime ready." },
      workspace: readyWorkspace,
      ingestion: readyIngestion,
      legacy: readyLegacy,
      prr: readyPrr,
      agent: async () => agentStatus({
        pendingApprovalCount: 2,
        activeLockCount: 1,
        locks: [agentLock("lock_legal_review", "legal-escalation")],
        providers: [fakeAgentProvider("provider_fake_local"), fakeAgentProvider("provider_fake_secondary")]
      })
    };

    const status = await buildOperatorStatusDto(input);
    const section = status.sections.find((candidate) => candidate.sectionId === "agent");
    const action = status.safeActions.find((candidate) => candidate.actionId === "action_open_agents");

    expect(operatorStatusDtoSchema.parse(status)).toEqual(status);
    expect(section).toMatchObject({
      sectionId: "agent",
      label: "Agent",
      state: "blocked",
      headline: "Agent lock is active"
    });
    expect(section?.metrics).toEqual(
      expect.arrayContaining([
        { metricId: "tasks", label: "Tasks", value: "0", tone: "machine" },
        { metricId: "pending_approvals", label: "Pending approvals", value: "2", tone: "attention" },
        { metricId: "active_locks", label: "Active locks", value: "1", tone: "danger" },
        { metricId: "providers", label: "Providers", value: "2", tone: "healthy" }
      ])
    );
    expect(action).toEqual({
      actionId: "action_open_agents",
      label: "Open Agent",
      kind: "navigate",
      target: "agents",
      sourceContract: "agent-status.v1",
      requiresHumanApproval: false,
      mutatesCanonicalState: false,
      externalEffect: false,
      enabled: true
    });
  });

  it("maps Agent status states by diagnostics, approvals, and warnings", async () => {
    const cases = [
      {
        name: "error diagnostic",
        status: agentStatus({
          diagnostics: [{ severity: "error", category: "runtime", message: "Agent runtime failed safely." }]
        }),
        expected: "blocked"
      },
      {
        name: "pending approvals",
        status: agentStatus({ pendingApprovalCount: 1 }),
        expected: "action-required"
      },
      {
        name: "warning diagnostic",
        status: agentStatus({
          diagnostics: [{ severity: "warning", category: "provider", message: "Fake provider is degraded." }]
        }),
        expected: "degraded"
      },
      {
        name: "ready",
        status: agentStatus(),
        expected: "ready"
      }
    ] as const;

    for (const testCase of cases) {
      const input = {
        now,
        runtime: { available: true, safeMessage: "Runtime ready." },
        workspace: readyWorkspace,
        ingestion: readyIngestion,
        legacy: readyLegacy,
        prr: readyPrr,
        agent: async () => testCase.status
      };

      const status = await buildOperatorStatusDto(input);
      expect(
        status.sections.find((section) => section.sectionId === "agent")?.state,
        testCase.name
      ).toBe(testCase.expected);
    }
  });

  it("redacts unavailable Agent provider failures and degrades the aggregate safely", async () => {
    const input = {
      now,
      runtime: { available: true, safeMessage: "Runtime ready." },
      workspace: readyWorkspace,
      ingestion: readyIngestion,
      legacy: readyLegacy,
      prr: readyPrr,
      agent: async () => {
        throw new Error("agent provider failed with token=abc123");
      }
    };

    const status = await buildOperatorStatusDto(input);
    const section = status.sections.find((candidate) => candidate.sectionId === "agent");
    const body = JSON.stringify(status);

    expect(operatorStatusDtoSchema.parse(status)).toEqual(status);
    expect(section?.state).toBe("unavailable");
    expect(section?.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Status provider failed before returning a safe DTO."
    );
    expect(status.summary.overallState).toBe("degraded");
    expect(body).not.toContain("token=abc123");
    expect(body).not.toContain("abc123");
  });

  it("surfaces one unavailable provider in the aggregate summary", async () => {
    const status = await buildOperatorStatusDto({
      now,
      runtime: { available: true, safeMessage: "Runtime ready." },
      workspace: async () => {
        throw new Error("workspace unavailable");
      },
      ingestion: readyIngestion,
      legacy: readyLegacy,
      prr: readyPrr
    });

    expect(operatorStatusDtoSchema.parse(status)).toEqual(status);
    expect(status.sections.find((section) => section.sectionId === "workspace")?.state).toBe(
      "unavailable"
    );
    expect(status.summary.overallState).toBe("degraded");
  });

  it("maps missing drive to a blocked workspace state with a detect-drive command", async () => {
    const status = await statusFor({
      workspace: async () =>
        workspaceEnvelope({
          status: "blocked",
          ok: false,
          mountStatus: "missing",
          safeMessage: "Expected external Cestus drive is not mounted.",
          diagnostics: [
            workspaceDiagnostic(
              "diag_workspace_missing_drive",
              "error",
              "mount",
              "External drive is missing; run drive detection before starting local work.",
              ["detect drive"]
            )
          ]
        })
    });

    expectSectionStateDiagnosticAndAction(status, "workspace", {
      state: "blocked",
      diagnosticMessage: "External drive is missing; run drive detection before starting local work.",
      actionCommand: "cestus-workspace detect drive --root <root>"
    });
  });

  it("maps swapped drive to a blocked workspace state with manifest mismatch evidence", async () => {
    const status = await statusFor({
      workspace: async () =>
        workspaceEnvelope({
          status: "blocked",
          ok: false,
          mountStatus: "wrong-drive",
          safeMessage: "Mounted drive does not match the expected Cestus workspace identity.",
          diagnostics: [
            workspaceDiagnostic(
              "diag_workspace_swapped_drive",
              "error",
              "mount",
              "Mounted drive identity does not match workspace manifest.",
              ["detect drive"]
            )
          ],
          preserveReadyPayload: true,
          relatedIds: ["expected_ws_case_001", "found_ws_case_999"]
        })
    });

    const section = expectSectionStateDiagnosticAndAction(status, "workspace", {
      state: "blocked",
      diagnosticMessage: "Mounted drive identity does not match workspace manifest.",
      actionCommand: "npm run local:runtime:configure -- --storage portable-workspace --workspace <root>"
    });
    expect(section.diagnostics[0]?.refs).toContainEqual({
      label: "relatedId",
      value: "expected_ws_case_001"
    });
    expect(section.sourceEvidence.flatMap((evidence) => evidence.refs)).toEqual(
      expect.arrayContaining([
        { label: "identityRef", value: "expected_ws_case_001" },
        { label: "identityRef", value: "found_ws_case_999" }
      ])
    );
  });

  it("maps uninitialized workspace root to action-required with an explicit create command", async () => {
    const status = await statusFor({
      workspace: async () =>
        workspaceEnvelope({
          status: "blocked",
          ok: false,
          mountStatus: "wrong-drive",
          safeMessage: "Workspace manifest was not found at the selected root.",
          diagnostics: [
            workspaceDiagnostic(
              "diag_workspace_manifest_missing",
              "error",
              "manifest",
              "Workspace manifest was not found at the selected root.",
              ["detect drive"]
            )
          ]
        })
    });

    expectSectionStateDiagnosticAndAction(status, "workspace", {
      state: "action-required",
      diagnosticMessage: "Workspace manifest was not found at the selected root.",
      actionCommand: "npm run local:workspace:create -- --workspace <root> --workspace-id <id> --label <label>"
    });
  });

  it("maps stale projections to degraded workspace state with rebuild-readiness command", async () => {
    const status = await statusFor({
      workspace: async () =>
        workspaceEnvelope({
          status: "degraded",
          ok: false,
          mountStatus: "available",
          safeMessage: "Projection artifacts are stale but canonical ledger state is readable.",
          projections: { available: true, staleCount: 2, rebuildable: true },
          diagnostics: [
            workspaceDiagnostic(
              "diag_workspace_stale_projections",
              "warning",
              "projection",
              "Projection artifacts are stale relative to ledger high-water mark.",
              ["projection rebuild-readiness"]
            )
          ]
        })
    });

    expectSectionStateDiagnosticAndAction(status, "workspace", {
      state: "degraded",
      diagnosticMessage: "Projection artifacts are stale relative to ledger high-water mark.",
      actionCommand: "cestus-workspace projection rebuild-readiness --root <root>"
    });
  });

  it("maps ingestion blocked pending approval to action-required with ingestion navigation", async () => {
    const status = await statusFor({
      ingestion: async () =>
        ingestionWorkspace({
          approvalRequired: true,
          reviewDiagnostics: [
            {
              diagnosticId: "diag_ingestion_import_approval_required",
              severity: "warning",
              category: "ingestion",
              message: "Raw import approval is required before blob writes."
            }
          ]
        })
    });

    expectSectionStateDiagnosticAndAction(status, "ingestion", {
      state: "action-required",
      diagnosticMessage: "Raw import approval is required before blob writes.",
      actionTarget: "ingestion"
    });
  });

  it("maps ingestion source changed since approval to blocked with ingestion navigation", async () => {
    const status = await statusFor({
      ingestion: async () =>
        ingestionWorkspace({
          reviewDiagnostics: [
            {
              diagnosticId: "diag_ingestion_source_changed_since_approval",
              severity: "error",
              category: "validation",
              message: "Source changed since approval; no blob writes were performed."
            }
          ]
        })
    });

    expectSectionStateDiagnosticAndAction(status, "ingestion", {
      state: "blocked",
      diagnosticMessage: "Source changed since approval; no blob writes were performed.",
      actionTarget: "ingestion"
    });
  });

  it("maps legacy samples needed to action-required with the first artifact ask", async () => {
    const status = await statusFor({
      legacy: async () => ({
        sourceCollectionId: "src_old_archive",
        rawImportRequiresApproval: false,
        ontologyStagingApproved: false,
        firstArtifactAsk: [
          "Read-only folder tree listing of the old Cestus root",
          "Two to five sanitized metadata or ontology files"
        ],
        diagnostics: []
      })
    });

    expectSectionStateDiagnosticAndAction(status, "legacy-import", {
      state: "action-required",
      diagnosticMessage: "Legacy samples needed: Read-only folder tree listing of the old Cestus root",
      actionCommand: "npm run ingestion:help"
    });
  });

  it("maps legacy raw import approval required to action-required with ingestion navigation", async () => {
    const status = await statusFor({
      legacy: async () => ({
        sourceCollectionId: "src_old_archive",
        latestReportId: "legacy_report_001",
        rawImportRequiresApproval: true,
        ontologyStagingApproved: false,
        firstArtifactAsk: [],
        diagnostics: []
      })
    });

    expectSectionStateDiagnosticAndAction(status, "legacy-import", {
      state: "action-required",
      diagnosticMessage: "Legacy raw import approval required before evidence copy.",
      actionTarget: "ingestion"
    });
  });

  it("maps runtime unavailable to unavailable sections without hidden fallback readiness", async () => {
    const status = await statusFor({
      runtime: { available: false, safeMessage: "Local runtime is unavailable for operator status." }
    });

    expect(status.summary.overallState).toBe("unavailable");
    for (const section of status.sections) {
      expect(section.state).toBe("unavailable");
      expect(section.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
        "Local runtime is unavailable; operator status sections cannot be trusted."
      );
      expect(section.nextSafeActionIds).toEqual(["action_refresh_operator_status"]);
    }
  });

  it("maps PRR ready with zero open requests to ready with request navigation", async () => {
    const status = await statusFor({ prr: async () => ({ cards: [], diagnostics: [] }) });

    expectSectionStateDiagnosticAndAction(status, "prr", {
      state: "ready",
      diagnosticMessage: "PRR workspace is readable with zero open requests.",
      actionTarget: "requests"
    });
  });
});

async function statusFor(
  overrides: Partial<Parameters<typeof buildOperatorStatusDto>[0]>
): Promise<OperatorStatusDto> {
  const status = await buildOperatorStatusDto({
    now: () => "2026-07-06T21:00:00.000Z",
    runtime: { available: true, safeMessage: "Runtime ready." },
    workspace: readyWorkspace,
    ingestion: readyIngestion,
    legacy: readyLegacy,
    prr: readyPrr,
    agent: async () => agentStatus(),
    ...overrides
  });

  expect(operatorStatusDtoSchema.parse(status)).toEqual(status);
  return status;
}

function expectSectionStateDiagnosticAndAction(
  status: OperatorStatusDto,
  sectionId: OperatorStatusDto["sections"][number]["sectionId"],
  expected: {
    readonly state: OperatorStatusDto["sections"][number]["state"];
    readonly diagnosticMessage: string;
    readonly actionCommand?: string;
    readonly actionTarget?: OperatorStatusDto["safeActions"][number]["target"];
  }
) {
  const section = status.sections.find((candidate) => candidate.sectionId === sectionId);
  expect(section).toBeDefined();
  expect(section?.state).toBe(expected.state);
  expect(section?.diagnostics.map((diagnostic) => diagnostic.message)).toContain(expected.diagnosticMessage);

  const actions = status.safeActions.filter((action) => section?.nextSafeActionIds.includes(action.actionId));
  if (expected.actionCommand !== undefined) {
    expect(actions.some((action) => action.kind === "show-command" && action.command === expected.actionCommand)).toBe(
      true
    );
  }
  if (expected.actionTarget !== undefined) {
    expect(actions.some((action) => action.kind === "navigate" && action.target === expected.actionTarget)).toBe(true);
  }

  return section!;
}

async function readyWorkspace() {
  return {
    schemaVersion: "workspace-ops.v1" as const,
    command: "verify workspace" as const,
    ok: true,
    status: "ready" as const,
    workspace: {
      workspaceId: "ws_case_001",
      label: "Case 001",
      manifestVersion: 1,
      rootUri: "file:///workspace",
      layoutContractVersion: "portable-workspace-layout.v1-provisional"
    },
    payload: {
      schemaVersion: "workspace-ops.v1" as const,
      mountStatus: {
        status: "available" as const,
        safeMessage: "Workspace is available.",
        nextCommandHints: [
          {
            allowedNextCommands: ["verify workspace" as const],
            safeReason: "Verify workspace state.",
            requiresHumanApproval: false
          }
        ]
      },
      manifest: {
        readable: true,
        valid: true,
        manifestVersion: 1,
        safeSummary: "Manifest valid."
      },
      layout: {
        contractVersion: "portable-workspace-layout.v1-provisional",
        readable: true,
        requiredRoots: []
      },
      ledger: { readable: true, eventCount: 14, highWaterMark: 14 },
      blobStore: {
        available: true,
        contentAddressedRootCount: 2,
        aggregateBytes: 2048,
        missingBlobCount: 0,
        hashMismatchCount: 0
      },
      projections: { available: true, staleCount: 0, rebuildable: true },
      jobs: { available: true, queuedCount: 0, failedCount: 0 },
      diagnostics: { visible: true, errorCount: 0, warningCount: 0 },
      backup: { manifestAvailable: false, stale: true }
    },
    diagnostics: [],
    proposedActions: []
  };
}

async function readyIngestion() {
  return {
    workspace: {
      mounted: true,
      workspaceId: "ws_case_001",
      label: "Case 001",
      review: {
        sourceCollectionId: "src_old_archive",
        label: "Old archive",
        latestScanBatchId: "scan_001",
        totals: emptyIngestionTotals(),
        approvalRequired: false,
        duplicateGroups: [],
        evidenceLinks: [],
        parseJobs: [],
        diagnostics: []
      },
      diagnostics: []
    },
    jobs: { jobs: [] },
    diagnostics: { diagnostics: [] }
  };
}

async function readyLegacy() {
  return {
    sourceCollectionId: "src_old_archive",
    latestReportId: "legacy_report_001",
    rawImportRequiresApproval: false,
    ontologyStagingApproved: true,
    firstArtifactAsk: [],
    diagnostics: []
  };
}

async function readyPrr() {
  return { cards: [], diagnostics: [] };
}

function emptyIngestionTotals() {
  return {
    observedFiles: 0,
    uniqueContent: 0,
    duplicateOccurrences: 0,
    skipped: 0,
    bytes: 0,
    estimatedNewBlobBytes: 0
  };
}

function agentStatus(overrides: Partial<AgentStatusDto> = {}): AgentStatusDto {
  return {
    schemaVersion: "agent-status.v1",
    generatedAt: "2026-07-07T21:00:00.000Z",
    residentAgentId: "agent_default",
    identity: {
      residentAgentId: "agent_default",
      workspaceId: "ws_case_001",
      label: "Cestus Agent",
      policyId: "agent_policy_default",
      initializedBy: "actor_case_owner",
      allowedRunTypes: ["evidence-triage"],
      memoryProjectionVersion: "0.1.0",
      eventIds: ["evt_agent_identity"],
      causationIds: []
    },
    tasks: [],
    runs: [],
    toolRequests: [],
    activeMemory: [],
    permissions: [],
    locks: [],
    providers: [fakeAgentProvider("provider_fake_local")],
    pendingApprovalCount: 0,
    activeLockCount: 0,
    diagnostics: [],
    ...overrides
  };
}

function fakeAgentProvider(providerId: string): AgentStatusDto["providers"][number] {
  return {
    providerId,
    label: "Fake Local Model Provider",
    adapterVersion: "fake-provider.v1",
    endpointKind: "local-engine",
    modelFamilies: ["fake-local"],
    credentialKinds: ["local-no-secret"],
    supportsStructuredOutput: false,
    supportsToolCalling: false,
    safeDataNotes: "Deterministic local fake provider for operator status tests."
  };
}

function agentLock(
  lockId: string,
  kind: AgentStatusDto["locks"][number]["kind"]
): AgentStatusDto["locks"][number] {
  return {
    lockId,
    residentAgentId: "agent_default",
    kind,
    activatedBy: "actor_case_owner",
    reason: "Human review lock is active.",
    activatedAt: "2026-07-07T21:00:00.000Z",
    relatedEventIds: ["evt_lock_related"],
    state: "active",
    clearRelatedEventIds: [],
    eventIds: ["evt_lock_active"],
    causationIds: []
  };
}

async function workspaceEnvelope(input: {
  readonly status: "ready" | "degraded" | "blocked";
  readonly ok: boolean;
  readonly mountStatus: "available" | "missing" | "unmounted" | "wrong-drive" | "unreadable";
  readonly safeMessage: string;
  readonly manifest?: {
    readonly readable: boolean;
    readonly valid: boolean;
    readonly manifestVersion?: number;
    readonly safeSummary: string;
  };
  readonly projections?: {
    readonly available: boolean;
    readonly staleCount: number;
    readonly rebuildable: boolean;
  };
  readonly diagnostics: readonly WorkspaceDiagnosticDto[];
  readonly relatedIds?: readonly string[];
  readonly preserveReadyPayload?: boolean;
}): Promise<WorkspaceOpsEnvelope<WorkspaceVerifyDto>> {
  const base = await readyWorkspace();
  const isBlockedMount = input.mountStatus !== "available" && input.preserveReadyPayload !== true;
  const envelope = {
    ...base,
    ok: input.ok,
    status: input.status,
    payload: {
      ...base.payload,
      mountStatus: {
        status: input.mountStatus,
        safeMessage: input.safeMessage,
        expectedRootUri: "file:///expected-workspace",
        nextCommandHints: [
          {
            allowedNextCommands: ["detect drive" as const],
            safeReason: "Detect the mounted Cestus drive before changing state.",
            requiresHumanApproval: false
          }
        ]
      },
      manifest: input.manifest ?? (
        isBlockedMount
          ? {
              readable: false,
              valid: false,
              safeSummary: "Workspace manifest cannot be verified until the workspace drive is available."
            }
          : base.payload.manifest
      ),
      layout: isBlockedMount
        ? {
            contractVersion: "unavailable",
            readable: false,
            requiredRoots: []
          }
        : base.payload.layout,
      ledger: isBlockedMount ? { readable: false, eventCount: 0, highWaterMark: 0 } : base.payload.ledger,
      blobStore: isBlockedMount
        ? {
            available: false,
            contentAddressedRootCount: 0,
            aggregateBytes: 0,
            missingBlobCount: 0,
            hashMismatchCount: 0
          }
        : base.payload.blobStore,
      projections: input.projections ?? (
        isBlockedMount
          ? { available: false, staleCount: 0, rebuildable: false }
          : base.payload.projections
      ),
      jobs: isBlockedMount ? { available: false, queuedCount: 0, failedCount: 0 } : base.payload.jobs,
      diagnostics: {
        visible: !isBlockedMount,
        errorCount: input.diagnostics.filter((diagnostic) => diagnostic.severity === "error").length,
        warningCount: input.diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length
      }
    },
    diagnostics: input.diagnostics.map((diagnostic) => ({
      ...diagnostic,
      relatedIds: [...(input.relatedIds ?? diagnostic.relatedIds)]
    }))
  };

  if (input.mountStatus === "available") {
    return envelope;
  }

  const { workspace: _workspace, ...withoutWorkspace } = envelope;
  return withoutWorkspace;
}

function workspaceDiagnostic(
  diagnosticId: string,
  severity: "info" | "warning" | "error",
  category: WorkspaceDiagnosticDto["category"],
  message: string,
  allowedNextCommands: WorkspaceDiagnosticDto["repairHint"]["allowedNextCommands"]
): WorkspaceDiagnosticDto {
  return {
    diagnosticId,
    severity,
    category,
    message,
    durable: false,
    relatedIds: [],
    repairHint: {
      allowedNextCommands: [...allowedNextCommands],
      requiresHumanApproval: false
    }
  };
}

async function ingestionWorkspace(input: {
  readonly approvalRequired?: boolean;
  readonly reviewDiagnostics?: readonly {
    readonly diagnosticId: string;
    readonly severity: "info" | "warning" | "error";
    readonly category: IngestionReviewDto["diagnostics"][number]["category"];
    readonly message: string;
  }[];
}) {
  const base = await readyIngestion();
  return {
    ...base,
    workspace: {
      ...base.workspace,
      review: {
        ...base.workspace.review,
        approvalRequired: input.approvalRequired ?? false,
        diagnostics: input.reviewDiagnostics === undefined ? [] : [...input.reviewDiagnostics]
      }
    }
  };
}
