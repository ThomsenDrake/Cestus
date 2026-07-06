import { describe, expect, it } from "vitest";
import {
  createWorkspaceOpsEnvelope,
  formatWorkspaceOpsJson,
  isSecretSafeWorkspaceText,
  secretSafeWorkspaceTextSchema,
  workspaceOpsEnvelopeSchema,
  workspaceOpsSchemaVersion
} from "../src/contracts.js";

describe("workspace ops contracts", () => {
  it("uses a stable schema version and JSON envelope", () => {
    const envelope = createWorkspaceOpsEnvelope({
      command: "verify workspace",
      status: "ready",
      payload: {
        mountStatus: { status: "available", safeMessage: "Workspace is available." }
      }
    });

    expect(envelope.schemaVersion).toBe(workspaceOpsSchemaVersion);
    expect(workspaceOpsEnvelopeSchema.parse(envelope)).toEqual(envelope);
    expect(JSON.parse(formatWorkspaceOpsJson(envelope))).toEqual(envelope);
  });

  it("marks canonical repairs as proposed actions requiring human approval", () => {
    const envelope = createWorkspaceOpsEnvelope({
      command: "verify workspace",
      status: "blocked",
      diagnostics: [
        {
          diagnosticId: "diag_workspace_blob_mismatch",
          severity: "error",
          category: "blob-integrity",
          message: "Blob hash mismatch for evidence content.",
          durable: false,
          repairHint: {
            allowedNextCommands: ["diagnostics inspect"],
            requiresHumanApproval: true
          }
        }
      ],
      proposedActions: [
        {
          actionId: "repair_workspace_blob_mismatch",
          kind: "append-repair-event-required",
          title: "Record a human-approved canonical repair event.",
          severity: "error",
          requiresHumanApproval: true,
          mutatesCanonicalState: true,
          allowedNextCommands: ["diagnostics inspect"]
        }
      ]
    });

    expect(envelope.ok).toBe(false);
    expect(envelope.proposedActions[0]).toMatchObject({
      requiresHumanApproval: true,
      mutatesCanonicalState: true
    });
  });

  it("rejects secret-shaped diagnostic text", () => {
    expect(isSecretSafeWorkspaceText("access_token=abc123")).toBe(false);
    expect(() =>
      workspaceOpsEnvelopeSchema.parse(
        createWorkspaceOpsEnvelope({
          command: "diagnostics inspect",
          status: "blocked",
          diagnostics: [
            {
              diagnosticId: "diag_secret",
              severity: "error",
              category: "diagnostics",
              message: "Found access_token=abc123",
              durable: false,
              repairHint: {
                allowedNextCommands: ["diagnostics inspect"],
                requiresHumanApproval: true
              }
            }
          ]
        })
      )
    ).toThrow("secret");
  });

  it("rejects common credential phrases even when the value has no digits", () => {
    const unsafeExamples = [
      "Bearer raw-token",
      "api key abcdef",
      "password hunter",
      "token abcdef"
    ];

    for (const example of unsafeExamples) {
      expect(isSecretSafeWorkspaceText(example)).toBe(false);
      expect(() => secretSafeWorkspaceTextSchema.parse(example)).toThrow("secret");
    }
  });

  it("rejects envelopes with contradictory ok and status fields", () => {
    const envelope = createWorkspaceOpsEnvelope({
      command: "verify workspace",
      status: "blocked"
    });

    expect(() =>
      workspaceOpsEnvelopeSchema.parse({
        ...envelope,
        ok: true
      })
    ).toThrow("ok");
  });

  it("does not format invalid workspace ops JSON envelopes", () => {
    expect(() => formatWorkspaceOpsJson({ not: "a workspace ops envelope" })).toThrow();
  });
});
