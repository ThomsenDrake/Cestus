import { describe, expect, it } from "vitest";
import {
  diagnosticsInspectDtoSchema,
  workspaceOpsEnvelopeSchema,
  workspaceOpsSchemaVersion
} from "../src/contracts.js";
import { inspectWorkspaceDiagnostics } from "../src/diagnostics.js";

const durableDiagnosticEvent = {
  id: "evt_diag_projection_stale",
  type: "diagnostic.recorded",
  version: 1,
  streamId: "diagnostic_diag_projection_stale",
  sequence: 1,
  context: {
    actor: { id: "actor_system", kind: "system", label: "fixture" },
    occurredAt: "2026-07-06T12:00:00.000Z",
    correlationId: "corr_diag_projection",
    coreVersion: "0.1.0",
    packVersions: { core: "0.1.0" }
  },
  payload: {
    diagnosticId: "diag_projection_stale",
    severity: "warning",
    category: "projection",
    message: "Projection is stale.",
    repairHint: {
      contract: "projection",
      violatedPath: "projection.highWaterMark",
      allowedActions: ["projection rebuild-readiness"]
    }
  }
} as const;

const secretShapedDurableEvent = {
  ...durableDiagnosticEvent,
  id: "evt_diag_secret_raw",
  streamId: "diagnostic_diag_secret_raw",
  payload: {
    ...durableDiagnosticEvent.payload,
    diagnosticId: "diag_secret_raw",
    message: "Raw private correspondence included access_token=abc123.",
    repairHint: {
      contract: "private note",
      violatedPath: "payload.access_token=abc123",
      allowedActions: ["Copy PRIVATE-CASE-NOTE into the diagnostic."]
    }
  }
} as const;

describe("inspectWorkspaceDiagnostics", () => {
  it("distinguishes durable and derived diagnostics while redacting unsafe content", async () => {
    const result = await inspectWorkspaceDiagnostics({
      durableEvents: [durableDiagnosticEvent, secretShapedDurableEvent],
      derivedDiagnostics: [
        {
          diagnosticId: "diag_current_redacted_source",
          severity: "error",
          category: "diagnostics",
          message: "Raw private correspondence included access_token=abc123.",
          durable: false,
          relatedIds: ["evt_current_safe", "access_token=abc123"],
          repairHint: {
            allowedNextCommands: ["diagnostics inspect"],
            requiresHumanApproval: true
          }
        }
      ]
    });

    expect(result.command).toBe("diagnostics inspect");
    expect(result.status).toBe("degraded");
    expect(result.payload).toMatchObject({
      schemaVersion: workspaceOpsSchemaVersion,
      durableCount: 1,
      derivedCount: 2
    });
    expect(result.payload?.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          diagnosticId: "diag_projection_stale",
          category: "projection",
          durable: true,
          relatedIds: ["evt_diag_projection_stale"]
        }),
        expect.objectContaining({
          diagnosticId: "diag_current_redacted_source",
          category: "diagnostics",
          durable: false,
          relatedIds: ["evt_current_safe"]
        }),
        expect.objectContaining({
          diagnosticId: "diag_durable_diagnostic_event_redacted",
          category: "diagnostics",
          durable: false
        })
      ])
    );

    const json = JSON.stringify(result);
    expect(json).not.toMatch(/access_token|abc123|PRIVATE-CASE-NOTE|Raw private correspondence/);
    expect(diagnosticsInspectDtoSchema.parse(result.payload)).toEqual(result.payload);
    expect(workspaceOpsEnvelopeSchema.parse(result)).toEqual(result);
  });

  it("filters non-diagnostic events and keeps ready status for safe durable diagnostics", async () => {
    const result = await inspectWorkspaceDiagnostics({
      durableEvents: [
        { id: "evt_other", type: "evidence.ingested", payload: { message: "not a diagnostic" } },
        durableDiagnosticEvent
      ],
      derivedDiagnostics: []
    });

    expect(result.status).toBe("ready");
    expect(result.payload?.diagnostics).toHaveLength(1);
    expect(result.payload?.diagnostics[0]).toMatchObject({
      diagnosticId: "diag_projection_stale",
      durable: true
    });
    expect(diagnosticsInspectDtoSchema.parse(result.payload)).toEqual(result.payload);
    expect(workspaceOpsEnvelopeSchema.parse(result)).toEqual(result);
  });
});
