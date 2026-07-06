import { describe, expect, it } from "vitest";
import {
  buildOperatorStatusSummary,
  operatorSafeActionSchema,
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

  it("operatorStatusDtoSchema rejects secret-shaped diagnostic and command text", () => {
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
                message: "token=abc123"
              }
            ]
          }
        ]
      })
    ).toThrow(/secret-safe/i);

    expect(() =>
      operatorStatusDtoSchema.parse({
        ...readyDto,
        safeActions: [
          {
            actionId: "action_bad_command_secret",
            label: "Show unsafe command",
            kind: "show-command",
            command: "cestus status --token=abc123",
            sourceContract: "operator-status.v1",
            requiresHumanApproval: false,
            mutatesCanonicalState: false,
            externalEffect: false,
            enabled: true
          }
        ]
      })
    ).toThrow(/secret-safe/i);

    expect(() =>
      operatorStatusDtoSchema.parse({
        ...readyDto,
        sections: [
          {
            ...readySection,
            diagnostics: [
              {
                diagnosticId: "diag_bad_private_key",
                severity: "warning",
                category: "security",
                message: "private key"
              }
            ]
          }
        ]
      })
    ).toThrow(/secret-safe/i);
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
