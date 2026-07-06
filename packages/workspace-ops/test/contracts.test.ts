import { describe, expect, it } from "vitest";
import {
  backupCheckDtoSchema,
  createWorkspaceOpsEnvelope,
  diagnosticsInspectDtoSchema,
  diskUsageDtoSchema,
  formatWorkspaceOpsJson,
  isSecretSafeWorkspaceText,
  manifestExportDtoSchema,
  mountStatusSchema,
  projectionRebuildDtoSchema,
  proposedRepairActionSchema,
  secretSafeWorkspaceTextSchema,
  workspaceDiagnosticSchema,
  workspaceOpsCommandPayloadSchemas,
  workspaceOpsEnvelopeSchema,
  workspaceOpsSchemaVersion,
  workspaceRefSchema,
  workspaceVerifyDtoSchema
} from "../src/contracts.js";
import type { ProposedRepairActionInput, WorkspaceDiagnosticInput } from "../src/contracts.js";

const hash = "sha256:9f2c8b7a5f4e3d2c1b0a99887766554433221100ffeeddccbbaa998877665544";

const workspaceRef = {
  workspaceId: "ws_contracts",
  label: "Contracts workspace",
  manifestVersion: 1,
  rootUri: "workspace://contracts",
  layoutContractVersion: "layout.v1"
} as const;

const mountStatus = {
  status: "available",
  safeMessage: "Workspace is available.",
  nextCommandHints: [
    {
      allowedNextCommands: ["verify workspace"],
      safeReason: "Verify the workspace after mount detection.",
      requiresHumanApproval: false
    }
  ]
} as const;

const workspaceVerifyPayload = {
  schemaVersion: workspaceOpsSchemaVersion,
  mountStatus,
  manifest: {
    readable: true,
    valid: true,
    manifestVersion: 1,
    safeSummary: "Workspace manifest is valid."
  },
  layout: {
    contractVersion: "layout.v1",
    readable: true,
    requiredRoots: [
      {
        rootId: "ledger",
        category: "ledger",
        status: "available",
        safeUri: "workspace://contracts/ledger"
      }
    ]
  },
  ledger: { readable: true, eventCount: 12, highWaterMark: 12 },
  blobStore: {
    available: true,
    contentAddressedRootCount: 1,
    aggregateBytes: 4096,
    missingBlobCount: 0,
    hashMismatchCount: 0
  },
  projections: { available: true, staleCount: 0, rebuildable: true },
  jobs: { available: true, queuedCount: 0, failedCount: 0 },
  diagnostics: { visible: true, errorCount: 0, warningCount: 0 },
  backup: { manifestAvailable: true, latestManifestHash: hash, stale: false }
} as const;

const diagnosticInput: WorkspaceDiagnosticInput = {
  diagnosticId: "diag_contract_warning",
  severity: "warning",
  category: "backup",
  message: "Backup manifest is stale.",
  durable: false,
  relatedIds: ["evt_contract_warning"],
  repairHint: {
    allowedNextCommands: ["manifest export", "backup check"],
    requiresHumanApproval: false
  }
};

const proposedActionInput: ProposedRepairActionInput = {
  actionId: "action_export_manifest",
  kind: "export-manifest",
  title: "Export a fresh workspace manifest.",
  severity: "warning",
  requiresHumanApproval: false,
  mutatesCanonicalState: false,
  allowedNextCommands: ["manifest export", "backup check"]
};

function accessorArray<T>(value: T, onGet: () => void): T[] {
  const array: T[] = [];
  Object.defineProperty(array, "0", {
    enumerable: true,
    configurable: true,
    get() {
      onGet();
      return value;
    }
  });
  return array;
}

describe("workspace ops contracts", () => {
  it("uses a stable schema version and JSON envelope", () => {
    const envelope = createWorkspaceOpsEnvelope({
      command: "verify workspace",
      status: "ready",
      payload: workspaceVerifyPayload
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

  it("rejects secret-shaped diagnostic related ids", () => {
    expect(() =>
      createWorkspaceOpsEnvelope({
        command: "diagnostics inspect",
        status: "blocked",
        diagnostics: [
          {
            diagnosticId: "diag_related_secret",
            severity: "error",
            category: "diagnostics",
            message: "Related diagnostic reference is unsafe.",
            durable: false,
            relatedIds: ["access_token=abc123"],
            repairHint: {
              allowedNextCommands: ["diagnostics inspect"],
              requiresHumanApproval: true
            }
          }
        ]
      })
    ).toThrow("secret");
  });

  it("rejects secret-shaped strings inside generic payloads before formatting", () => {
    const unsafeEnvelope = {
      schemaVersion: workspaceOpsSchemaVersion,
      command: "verify workspace",
      ok: true,
      status: "ready",
      payload: {
        mountStatus: {
          status: "available",
          safeMessage: "access_token=abc123"
        }
      },
      diagnostics: [],
      proposedActions: []
    };

    expect(() => workspaceOpsEnvelopeSchema.parse(unsafeEnvelope)).toThrow("secret");
    expect(() => formatWorkspaceOpsJson(unsafeEnvelope)).toThrow("secret");
  });

  it("rejects secret-shaped generic payload keys before formatting", () => {
    const unsafeEnvelope = {
      schemaVersion: workspaceOpsSchemaVersion,
      command: "verify workspace",
      ok: true,
      status: "ready",
      payload: {
        "access_token=abc123": "redacted"
      },
      diagnostics: [],
      proposedActions: []
    };

    expect(() => workspaceOpsEnvelopeSchema.parse(unsafeEnvelope)).toThrow("secret");
    expect(() => formatWorkspaceOpsJson(unsafeEnvelope)).toThrow("secret");
  });

  it("rejects bare credential field names inside generic payloads before formatting", () => {
    const unsafeKeys = ["access_token", "apiKey", "clientSecret", "password"];

    for (const key of unsafeKeys) {
      const unsafeEnvelope = {
        schemaVersion: workspaceOpsSchemaVersion,
        command: "verify workspace",
        ok: true,
        status: "ready",
        payload: { [key]: "redacted" },
        diagnostics: [],
        proposedActions: []
      };

      expect(() => workspaceOpsEnvelopeSchema.parse(unsafeEnvelope)).toThrow("secret");
      expect(() => formatWorkspaceOpsJson(unsafeEnvelope)).toThrow("secret");
    }
  });

  it("rejects prototype-pollution payload keys before formatting", () => {
    const unsafeEnvelope = {
      schemaVersion: workspaceOpsSchemaVersion,
      command: "verify workspace",
      ok: true,
      status: "ready",
      payload: JSON.parse('{"__proto__":{"polluted":true},"safeMessage":"Safe message."}') as unknown,
      diagnostics: [],
      proposedActions: []
    };

    expect(() => workspaceOpsEnvelopeSchema.parse(unsafeEnvelope)).toThrow("prototype");
    expect(() => formatWorkspaceOpsJson(unsafeEnvelope)).toThrow("prototype");
  });

  it("rejects boxed string payload values before formatting", () => {
    const unsafeEnvelope = {
      schemaVersion: workspaceOpsSchemaVersion,
      command: "verify workspace",
      ok: true,
      status: "ready",
      payload: {
        safeMessage: new String("access_token=abc123")
      },
      diagnostics: [],
      proposedActions: []
    };

    expect(() => workspaceOpsEnvelopeSchema.parse(unsafeEnvelope)).toThrow();
    expect(() => formatWorkspaceOpsJson(unsafeEnvelope)).toThrow();
  });

  it("rejects custom payload serializers before formatting", () => {
    const unsafeEnvelope = {
      schemaVersion: workspaceOpsSchemaVersion,
      command: "verify workspace",
      ok: true,
      status: "ready",
      payload: {
        safeMessage: {
          toJSON() {
            return "access_token=abc123";
          }
        }
      },
      diagnostics: [],
      proposedActions: []
    };

    expect(() => workspaceOpsEnvelopeSchema.parse(unsafeEnvelope)).toThrow();
    expect(() => formatWorkspaceOpsJson(unsafeEnvelope)).toThrow();
  });

  it("rejects non-json dto payload shapes", () => {
    class CustomPayload {
      readonly value = "safe";
    }

    const cyclicPayload: Record<string, unknown> = {};
    cyclicPayload.self = cyclicPayload;

    const symbolKeyPayload: Record<string | symbol, unknown> = { safeMessage: "Safe message." };
    symbolKeyPayload[Symbol("unsafe")] = "redacted";

    const unsafePayloads = [
      { callback: () => "unsafe" },
      { missing: undefined },
      { id: Symbol("unsafe") },
      { count: 1n },
      { createdAt: new Date("2026-07-06T00:00:00.000Z") },
      { custom: new CustomPayload() },
      cyclicPayload,
      symbolKeyPayload
    ];

    for (const payload of unsafePayloads) {
      expect(() =>
        workspaceOpsEnvelopeSchema.parse({
          schemaVersion: workspaceOpsSchemaVersion,
          command: "verify workspace",
          ok: true,
          status: "ready",
          payload,
          diagnostics: [],
          proposedActions: []
        })
      ).toThrow();
    }
  });

  it("requires safe next-command hints on mount status DTOs", () => {
    const parsedMountStatus = mountStatusSchema.parse({
      status: "missing",
      safeMessage: "Workspace root is not available.",
      nextCommandHints: [
        {
          allowedNextCommands: ["detect drive"],
          safeReason: "Detect whether the workspace drive is mounted.",
          requiresHumanApproval: false
        }
      ]
    });

    expect(parsedMountStatus.nextCommandHints[0]).toMatchObject({
      allowedNextCommands: ["detect drive"],
      requiresHumanApproval: false
    });

    expect(() =>
      mountStatusSchema.parse({
        status: "missing",
        safeMessage: "Workspace root is not available."
      })
    ).toThrow("nextCommandHints");

    expect(() =>
      mountStatusSchema.parse({
        status: "missing",
        safeMessage: "Workspace root is not available.",
        nextCommandHints: [
          {
            allowedNextCommands: ["detect drive"],
            safeReason: "Found access_token=abc123",
            requiresHumanApproval: false
          }
        ]
      })
    ).toThrow("secret");
  });

  it("exports named schemas for each command payload DTO", () => {
    expect(workspaceOpsCommandPayloadSchemas).toMatchObject({
      "verify workspace": workspaceVerifyDtoSchema,
      "disk usage": diskUsageDtoSchema,
      "projection rebuild-readiness": projectionRebuildDtoSchema,
      "projection rebuild": projectionRebuildDtoSchema,
      "diagnostics inspect": diagnosticsInspectDtoSchema,
      "manifest export": manifestExportDtoSchema,
      "backup check": backupCheckDtoSchema
    });
  });

  it("parses and formats representative named command payload envelopes", () => {
    const diagnostic = workspaceDiagnosticSchema.parse({
      diagnosticId: "diag_contract_warning",
      severity: "warning",
      category: "backup",
      message: "Backup manifest is stale.",
      durable: false,
      repairHint: {
        allowedNextCommands: ["manifest export", "backup check"],
        requiresHumanApproval: false
      }
    });

    const diskUsagePayload = {
      schemaVersion: workspaceOpsSchemaVersion,
      estimatedFreeBytes: 1_000_000,
      thresholdWarnings: ["Projection root is below preferred free space."],
      roots: [
        {
          rootId: "ledger",
          category: "ledger",
          bytes: 2048,
          exists: true,
          safeUri: "workspace://contracts/ledger"
        }
      ],
      categories: [{ category: "ledger", bytes: 2048, exists: true }],
      totalBytes: 2048
    } as const;

    const projectionRebuildPayload = {
      schemaVersion: workspaceOpsSchemaVersion,
      mode: "result",
      requestedProjections: ["requests-workspace"],
      inputLedger: { readable: true, eventCount: 12, highWaterMark: 12 },
      readiness: {
        ready: true,
        checks: [
          {
            checkId: "projection_root_writable",
            status: "pass",
            safeMessage: "Projection root is writable."
          }
        ]
      },
      artifactOutputs: [
        {
          projectionName: "requests-workspace",
          artifactId: "artifact_requests_workspace",
          artifactHash: hash,
          byteCount: 512,
          expendable: true
        }
      ],
      validationResults: [
        {
          validationId: "validation_requests_workspace",
          status: "pass",
          safeMessage: "Projection output validated."
        }
      ],
      failures: [],
      wroteExpendableArtifactsOnly: true
    } as const;

    const diagnosticsInspectPayload = {
      schemaVersion: workspaceOpsSchemaVersion,
      diagnostics: [diagnostic],
      durableCount: 0,
      derivedCount: 1
    } as const;

    const manifestExportPayload = {
      schemaVersion: workspaceOpsSchemaVersion,
      workspace: workspaceRef,
      exportedAt: "2026-07-06T12:00:00.000Z",
      manifestHash: hash,
      includedSections: ["workspace", "ledger", "blobs", "projections", "diagnostics", "jobs", "backup"],
      excludedSecretBearingFields: ["provider credentials", "raw correspondence bodies"],
      ledger: { eventCount: 12, highWaterMark: 12 },
      blobStore: { contentAddressedRootCount: 1, aggregateBytes: 4096 },
      artifacts: [{ category: "projections", count: 2, bytes: 1024, artifactHash: hash }],
      diagnostics: { errorCount: 0, warningCount: 1 },
      jobs: { queuedCount: 0, failedCount: 0 },
      coverage: {
        coveredCategories: ["ledger", "blobs", "projections"],
        missingCategories: []
      },
      sectionHashes: [{ sectionId: "ledger", sectionHash: hash }]
    } as const;

    const backupCheckPayload = {
      schemaVersion: workspaceOpsSchemaVersion,
      backupManifestPresent: true,
      identityMatches: true,
      layoutContractMatches: true,
      currentWorkspaceId: "ws_contracts",
      backupWorkspaceId: "ws_contracts",
      currentLedgerHighWaterMark: 12,
      backupLedgerHighWaterMark: 10,
      coveredCategories: ["ledger", "blobs"],
      missingCategories: ["projections"],
      stale: true,
      containsSecretShapedFields: false,
      safeNextActions: [
        {
          allowedNextCommands: ["manifest export", "backup check"],
          safeReason: "Export a fresh manifest and rerun backup coverage checks.",
          requiresHumanApproval: false
        }
      ]
    } as const;

    const envelopes = [
      createWorkspaceOpsEnvelope({
        command: "verify workspace",
        status: "ready",
        workspace: workspaceRef,
        payload: workspaceVerifyDtoSchema.parse(workspaceVerifyPayload)
      }),
      createWorkspaceOpsEnvelope({
        command: "disk usage",
        status: "ready",
        workspace: workspaceRef,
        payload: diskUsageDtoSchema.parse(diskUsagePayload)
      }),
      createWorkspaceOpsEnvelope({
        command: "detect drive",
        status: "ready",
        workspace: workspaceRef,
        payload: mountStatusSchema.parse(mountStatus)
      }),
      createWorkspaceOpsEnvelope({
        command: "projection rebuild",
        status: "ready",
        workspace: workspaceRef,
        payload: projectionRebuildDtoSchema.parse(projectionRebuildPayload)
      }),
      createWorkspaceOpsEnvelope({
        command: "diagnostics inspect",
        status: "degraded",
        workspace: workspaceRef,
        payload: diagnosticsInspectDtoSchema.parse(diagnosticsInspectPayload),
        diagnostics: [diagnostic]
      }),
      createWorkspaceOpsEnvelope({
        command: "manifest export",
        status: "ready",
        workspace: workspaceRef,
        payload: manifestExportDtoSchema.parse(manifestExportPayload)
      }),
      createWorkspaceOpsEnvelope({
        command: "backup check",
        status: "degraded",
        workspace: workspaceRef,
        payload: backupCheckDtoSchema.parse(backupCheckPayload),
        diagnostics: [diagnostic]
      })
    ];

    for (const envelope of envelopes) {
      expect(workspaceOpsEnvelopeSchema.parse(envelope)).toEqual(envelope);
      expect(JSON.parse(formatWorkspaceOpsJson(envelope))).toEqual(envelope);
    }
  });

  it("keeps projection rebuild payloads limited to expendable artifacts", () => {
    expect(() =>
      projectionRebuildDtoSchema.parse({
        schemaVersion: workspaceOpsSchemaVersion,
        mode: "result",
        requestedProjections: ["requests-workspace"],
        inputLedger: { readable: true, eventCount: 12, highWaterMark: 12 },
        readiness: { ready: true, checks: [] },
        artifactOutputs: [],
        validationResults: [],
        failures: [],
        wroteExpendableArtifactsOnly: false
      })
    ).toThrow();
  });

  it("rejects envelopes whose payload does not match the named command DTO", () => {
    expect(() =>
      workspaceOpsEnvelopeSchema.parse({
        schemaVersion: workspaceOpsSchemaVersion,
        command: "disk usage",
        ok: true,
        status: "ready",
        payload: {
          schemaVersion: workspaceOpsSchemaVersion,
          safeButWrongShape: "This generic JSON is not a DiskUsageDto."
        },
        diagnostics: [],
        proposedActions: []
      })
    ).toThrow("Unrecognized key");
  });

  it("normalizes command payloads through their named DTO schemas before formatting", () => {
    const formatted = JSON.parse(
      formatWorkspaceOpsJson({
        schemaVersion: workspaceOpsSchemaVersion,
        command: "diagnostics inspect",
        ok: false,
        status: "degraded",
        payload: {
          schemaVersion: workspaceOpsSchemaVersion,
          diagnostics: [
            {
              diagnosticId: "diag_payload_default",
              severity: "warning",
              category: "diagnostics",
              message: "Derived diagnostic is inspectable.",
              durable: false,
              repairHint: {
                allowedNextCommands: ["diagnostics inspect"],
                requiresHumanApproval: false
              }
            }
          ],
          durableCount: 0,
          derivedCount: 1
        },
        diagnostics: [],
        proposedActions: []
      })
    );

    expect(formatted.payload.diagnostics[0].relatedIds).toEqual([]);
  });

  it("rejects accessor-backed array entries without invoking getters", () => {
    let getterInvoked = false;
    const thresholdWarnings: string[] = [];
    Object.defineProperty(thresholdWarnings, "0", {
      enumerable: true,
      configurable: true,
      get() {
        getterInvoked = true;
        return "Projection root is below preferred free space.";
      }
    });

    expect(() =>
      workspaceOpsEnvelopeSchema.parse({
        schemaVersion: workspaceOpsSchemaVersion,
        command: "disk usage",
        ok: true,
        status: "ready",
        payload: {
          schemaVersion: workspaceOpsSchemaVersion,
          estimatedFreeBytes: 1_000_000,
          thresholdWarnings,
          roots: [],
          categories: [],
          totalBytes: 0
        },
        diagnostics: [],
        proposedActions: []
      })
    ).toThrow("accessors");
    expect(getterInvoked).toBe(false);
  });

  it("rejects projection command payloads with mismatched modes", () => {
    const projectionPayload = {
      schemaVersion: workspaceOpsSchemaVersion,
      requestedProjections: ["requests-workspace"],
      inputLedger: { readable: true, eventCount: 12, highWaterMark: 12 },
      readiness: { ready: true, checks: [] },
      artifactOutputs: [],
      validationResults: [],
      failures: [],
      wroteExpendableArtifactsOnly: true
    } as const;

    expect(() =>
      workspaceOpsEnvelopeSchema.parse({
        schemaVersion: workspaceOpsSchemaVersion,
        command: "projection rebuild-readiness",
        ok: true,
        status: "ready",
        payload: { ...projectionPayload, mode: "result" },
        diagnostics: [],
        proposedActions: []
      })
    ).toThrow("readiness");

    expect(() =>
      workspaceOpsEnvelopeSchema.parse({
        schemaVersion: workspaceOpsSchemaVersion,
        command: "projection rebuild",
        ok: true,
        status: "ready",
        payload: { ...projectionPayload, mode: "readiness" },
        diagnostics: [],
        proposedActions: []
      })
    ).toThrow("result");
  });

  it("rejects accessor-backed arrays across the full envelope without invoking getters", () => {
    const getterInvocations = {
      diagnostics: 0,
      proposedActions: 0,
      relatedIds: 0,
      allowedNextCommands: 0
    };
    const cases = [
      {
        envelope: {
          schemaVersion: workspaceOpsSchemaVersion,
          command: "verify workspace",
          ok: false,
          status: "blocked",
          diagnostics: accessorArray(diagnosticInput, () => {
            getterInvocations.diagnostics += 1;
          }),
          proposedActions: []
        },
        invocationKey: "diagnostics"
      },
      {
        envelope: {
          schemaVersion: workspaceOpsSchemaVersion,
          command: "verify workspace",
          ok: false,
          status: "blocked",
          diagnostics: [],
          proposedActions: accessorArray(proposedActionInput, () => {
            getterInvocations.proposedActions += 1;
          })
        },
        invocationKey: "proposedActions"
      },
      {
        envelope: {
          schemaVersion: workspaceOpsSchemaVersion,
          command: "verify workspace",
          ok: false,
          status: "blocked",
          diagnostics: [
            {
              ...diagnosticInput,
              relatedIds: accessorArray("evt_contract_warning", () => {
                getterInvocations.relatedIds += 1;
              })
            }
          ],
          proposedActions: []
        },
        invocationKey: "relatedIds"
      },
      {
        envelope: {
          schemaVersion: workspaceOpsSchemaVersion,
          command: "verify workspace",
          ok: false,
          status: "blocked",
          diagnostics: [
            {
              ...diagnosticInput,
              repairHint: {
                allowedNextCommands: accessorArray("diagnostics inspect", () => {
                  getterInvocations.allowedNextCommands += 1;
                }),
                requiresHumanApproval: false
              }
            }
          ],
          proposedActions: []
        },
        invocationKey: "allowedNextCommands"
      }
    ] as const;

    for (const { envelope, invocationKey } of cases) {
      expect(() => workspaceOpsEnvelopeSchema.parse(envelope)).toThrow("accessors");
      expect(getterInvocations[invocationKey]).toBe(0);
    }
  });

  it("rejects accessor-backed helper input arrays without invoking getters", () => {
    const getterInvocations = {
      diagnostics: 0,
      proposedActions: 0
    };

    expect(() =>
      createWorkspaceOpsEnvelope({
        command: "verify workspace",
        status: "blocked",
        diagnostics: accessorArray(diagnosticInput, () => {
          getterInvocations.diagnostics += 1;
        }),
        proposedActions: []
      })
    ).toThrow("accessors");
    expect(getterInvocations.diagnostics).toBe(0);

    expect(() =>
      createWorkspaceOpsEnvelope({
        command: "verify workspace",
        status: "blocked",
        diagnostics: [],
        proposedActions: accessorArray(proposedActionInput, () => {
          getterInvocations.proposedActions += 1;
        })
      })
    ).toThrow("accessors");
    expect(getterInvocations.proposedActions).toBe(0);
  });

  it("rejects secret-shaped identifiers across output DTOs", () => {
    expect(() =>
      workspaceDiagnosticSchema.parse({
        ...diagnosticInput,
        diagnosticId: "diag_access_token_abc123"
      })
    ).toThrow("secret");

    expect(() =>
      proposedRepairActionSchema.parse({
        ...proposedActionInput,
        actionId: "repair_access_token_abc123"
      })
    ).toThrow("secret");

    expect(() =>
      workspaceRefSchema.parse({
        ...workspaceRef,
        workspaceId: "ws_access_token_abc123"
      })
    ).toThrow("secret");

    expect(() =>
      backupCheckDtoSchema.parse({
        schemaVersion: workspaceOpsSchemaVersion,
        backupManifestPresent: true,
        identityMatches: true,
        layoutContractMatches: true,
        currentWorkspaceId: "ws_access_token_abc123",
        backupWorkspaceId: "ws_contracts",
        currentLedgerHighWaterMark: 12,
        backupLedgerHighWaterMark: 10,
        coveredCategories: ["ledger"],
        missingCategories: [],
        stale: false,
        containsSecretShapedFields: false,
        safeNextActions: []
      })
    ).toThrow("secret");

    expect(() =>
      backupCheckDtoSchema.parse({
        schemaVersion: workspaceOpsSchemaVersion,
        backupManifestPresent: true,
        identityMatches: true,
        layoutContractMatches: true,
        currentWorkspaceId: "ws_contracts",
        backupWorkspaceId: "ws_access_token_abc123",
        currentLedgerHighWaterMark: 12,
        backupLedgerHighWaterMark: 10,
        coveredCategories: ["ledger"],
        missingCategories: [],
        stale: false,
        containsSecretShapedFields: false,
        safeNextActions: []
      })
    ).toThrow("secret");
  });
});
