import { describe, expect, it } from "vitest";
import {
  buildOperatorStatusSummary,
  operatorDiagnosticSchema,
  operatorNavigationTargets,
  operatorSafeActionSchema,
  operatorSectionIds,
  operatorSourceEvidenceSchema,
  operatorStatusDtoSchema,
  type OperatorStatusDto
} from "../src/contracts.js";
import * as operatorStatusExports from "../src/index.js";

describe("operator status contracts", () => {
  const readySection: OperatorStatusDto["sections"][number] = {
    sectionId: "workspace",
    label: "Workspace",
    state: "ready",
    headline: "Mounted portable workspace",
    safeSummary: "Workspace manifest, ledger, and blob roots are readable.",
    metrics: [
      { metricId: "ledger_events", label: "Ledger events", value: "42", tone: "healthy" }
    ],
    diagnostics: [],
    sourceEvidence: [
      {
        evidenceId: "src_workspace_verify",
        sourceContract: "workspace-ops.v1",
        sourceKind: "workspace-ops",
        label: "verify workspace",
        refs: [{ label: "workspaceId", value: "ws_case_001" }]
      }
    ],
    nextSafeActionIds: ["action_open_ingestion"]
  };

  const readyDto: OperatorStatusDto = {
    schemaVersion: "operator-status.v1",
    generatedAt: "2026-07-06T20:00:00.000Z",
    runtime: {
      available: true,
      storageStrategy: "portable-workspace",
      bindMode: "loopback",
      workspaceMounted: true,
      safeMessage: "Local runtime is serving a mounted portable workspace."
    },
    summary: {
      overallState: "ready",
      blockedCount: 0,
      actionRequiredCount: 0,
      degradedCount: 0,
      nextSafeActionId: "action_open_ingestion"
    },
    sections: [readySection],
    safeActions: [
      {
        actionId: "action_open_ingestion",
        label: "Open Ingestion",
        kind: "navigate",
        target: "ingestion",
        sourceContract: "operator-status.v1",
        requiresHumanApproval: false,
        mutatesCanonicalState: false,
        externalEffect: false,
        enabled: true
      }
    ]
  };

  it("accepts a scanner-friendly OperatorStatusDto with schemaVersion operator-status.v1", () => {
    expect(operatorStatusDtoSchema.parse(readyDto)).toMatchObject({
      schemaVersion: "operator-status.v1",
      summary: { overallState: "ready" },
      sections: [{ sectionId: "workspace" }]
    });
  });

  it("buildOperatorStatusSummary returns blocked state and next action from the blocked section", () => {
    const summary = buildOperatorStatusSummary([
      { sectionId: "workspace", state: "ready", nextSafeActionIds: [] },
      { sectionId: "ingestion", state: "action-required", nextSafeActionIds: ["action_open_ingestion"] },
      { sectionId: "legacy-import", state: "blocked", nextSafeActionIds: ["action_show_legacy_ask"] },
      { sectionId: "prr", state: "degraded", nextSafeActionIds: ["action_open_requests"] }
    ]);

    expect(summary).toEqual({
      overallState: "blocked",
      blockedCount: 1,
      actionRequiredCount: 1,
      degradedCount: 1,
      nextSafeActionId: "action_show_legacy_ask"
    });
  });

  it("operatorSafeActionSchema rejects actions that mutate canonical state or have external effects", () => {
    expect(() =>
      operatorSafeActionSchema.parse({
        actionId: "action_send_prr",
        label: "Send request",
        kind: "show-command",
        command: "cestus prr send prr_001",
        sourceContract: "prr",
        requiresHumanApproval: true,
        mutatesCanonicalState: true,
        externalEffect: true,
        enabled: true
      })
    ).toThrow();
  });

  it("operatorSafeActionSchema rejects forbidden commands even when action flags claim they are safe", () => {
    const forbiddenCommands = [
      "cestus prr send prr_001",
      "cestus ingest register-source --workspace <root> --source /old --source-id src_old --label Old",
      "cestus ingest approve-import --workspace <root> --source-id src_old --scan scan_001",
      "cestus ingest import --workspace <root> --source-id src_old --import import_001",
      "cestus ingest approve-provider --workspace <root> --source-id src_old --import import_001",
      "node packages/ingestion/bin/cestus-ingest.mjs approve-import --workspace <root>",
      "node packages/ingestion/bin/cestus-ingest.mjs approve-provider --workspace <root>"
    ];

    for (const [index, command] of forbiddenCommands.entries()) {
      expect(() =>
        operatorSafeActionSchema.parse({
          actionId: `action_show_forbidden_${index}`,
          label: "Show forbidden command",
          kind: "show-command",
          command,
          sourceContract: "operator-status.v1",
          requiresHumanApproval: false,
          mutatesCanonicalState: false,
          externalEffect: false,
          enabled: true
        })
      ).toThrow(/forbidden/i);
    }
  });

  it("operatorSafeActionSchema keeps display-only help and readiness commands available", () => {
    const allowedCommands = [
      "npm run ingestion:help",
      "cestus-workspace verify workspace --root <root>",
      "cestus-workspace projection rebuild-readiness --root <root>"
    ];

    for (const [index, command] of allowedCommands.entries()) {
      expect(
        operatorSafeActionSchema.parse({
          actionId: `action_show_allowed_${index}`,
          label: "Show allowed command",
          kind: "show-command",
          command,
          sourceContract: "operator-status.v1",
          requiresHumanApproval: false,
          mutatesCanonicalState: false,
          externalEffect: false,
          enabled: true
        })
      ).toMatchObject({ command });
    }
  });

  it("accepts resident-agent status vocabulary for sections, navigation, diagnostics, and evidence", () => {
    expect(operatorSectionIds).toContain("agent");
    expect(operatorNavigationTargets).toContain("agents");
    expect(
      operatorDiagnosticSchema.parse({
        diagnosticId: "diag_agent_warning",
        severity: "warning",
        category: "agent",
        message: "Agent runtime has pending operator review."
      })
    ).toMatchObject({ category: "agent" });
    expect(
      operatorSourceEvidenceSchema.parse({
        evidenceId: "src_agent_status",
        sourceContract: "agent-status.v1",
        sourceKind: "agent",
        label: "resident agent status"
      })
    ).toMatchObject({ sourceKind: "agent" });
  });

  it("operatorSafeActionSchema rejects visible commands that approve, execute, or invoke agent tools", () => {
    const forbiddenAgentCommands = [
      "cestus agent approve-tool toolreq_001",
      "cestus agent execute-tool toolreq_001",
      "cestus agent invoke-provider inv_001",
      "cestus agent approve toolreq_001",
      "cestus agent deny toolreq_001",
      "cestus agent execute toolreq_001",
      "cestus agent invoke provider_fake_local",
      "cestus agent send-message msg_001",
      "cestus agent export-report report_001",
      "cestus agent external-message-send msg_001",
      "cestus agent external-message send msg_001",
      "cestus agent provider transfer provider_fake_local",
      "cestus agent provider-transfer provider_fake_local"
    ];

    for (const [index, command] of forbiddenAgentCommands.entries()) {
      expect(() =>
        operatorSafeActionSchema.parse({
          actionId: `action_show_agent_forbidden_${index}`,
          label: "Show forbidden agent command",
          kind: "show-command",
          command,
          sourceContract: "agent-status.v1",
          requiresHumanApproval: false,
          mutatesCanonicalState: false,
          externalEffect: false,
          enabled: true
        })
      ).toThrow(/forbidden/i);
    }
  });

  it("operatorSafeActionSchema rejects incomplete action descriptors", () => {
    expect(() =>
      operatorSafeActionSchema.parse({
        actionId: "action_missing_target",
        label: "Open Requests",
        kind: "navigate",
        sourceContract: "operator-status.v1",
        requiresHumanApproval: false,
        mutatesCanonicalState: false,
        externalEffect: false,
        enabled: true
      })
    ).toThrow(/target/i);

    expect(() =>
      operatorSafeActionSchema.parse({
        actionId: "action_missing_command",
        label: "Show command",
        kind: "show-command",
        sourceContract: "operator-status.v1",
        requiresHumanApproval: false,
        mutatesCanonicalState: false,
        externalEffect: false,
        enabled: true
      })
    ).toThrow(/command/i);
  });

  it("operatorStatusDtoSchema rejects secret-shaped diagnostic and command text", () => {
    const unsafeDiagnosticMessages = [
      "token=abc123",
      "password",
      "private key",
      "bearer",
      "auth tokens"
    ];

    for (const message of unsafeDiagnosticMessages) {
      expect(() =>
        operatorStatusDtoSchema.parse({
          ...readyDto,
          sections: [
            {
              ...readySection,
              diagnostics: [
                {
                  diagnosticId: "diag_bad_secret",
                  severity: "error",
                  category: "workspace",
                  message
                }
              ]
            }
          ]
        })
      ).toThrow(/secret-safe/i);
    }

    const unsafeCommands = [
      "cestus status --token=abc123"
    ];

    for (const command of unsafeCommands) {
      expect(() =>
        operatorStatusDtoSchema.parse({
          ...readyDto,
          safeActions: [
            {
              actionId: "action_bad_command_secret",
              label: "Show unsafe command",
              kind: "show-command",
              command,
              sourceContract: "operator-status.v1",
              requiresHumanApproval: false,
              mutatesCanonicalState: false,
              externalEffect: false,
              enabled: true
            }
          ]
        })
      ).toThrow(/secret-safe/i);
    }
  });

  it("exports only the planned runtime contract surface", () => {
    expect(Object.keys(operatorStatusExports).sort()).toEqual([
      "buildOperatorStatusSummary",
      "operatorDiagnosticSchema",
      "operatorMetricSchema",
      "operatorNavigationTargets",
      "operatorReadinessStates",
      "operatorSafeActionKinds",
      "operatorSafeActionSchema",
      "operatorSectionIds",
      "operatorSourceEvidenceSchema",
      "operatorStatusDtoSchema",
      "operatorStatusSchemaVersion",
      "operatorStatusSectionSchema"
    ].sort());
  });
});
