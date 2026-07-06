import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { operatorStatusDtoSchema } from "../../operator-status/src/contracts.js";
import {
  createWorkspaceOpsEnvelope,
  type WorkspaceVerifyDto
} from "../../workspace-ops/src/contracts.js";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import {
  createLocalRuntimeHttpHandler,
  type CreateLocalRuntimeHttpHandlerInput,
  type LocalRuntimeHttpHandler
} from "../src/http-handler.js";
import type { OperatorStatusProviderSet } from "../src/operator-status.js";

const actor = {
  id: "actor_operator_status_route",
  kind: "human",
  label: "Operator Status Route"
} as const;
const fixedNow = () => "2026-07-06T21:00:00.000Z";
const tempDirs: string[] = [];
const handlers: LocalRuntimeHttpHandler[] = [];

afterEach(() => {
  for (const handler of handlers.splice(0)) {
    handler.close();
  }

  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("operator status HTTP route", () => {
  it("returns an operator-status.v1 DTO for GET /api/operator/status", async () => {
    const handler = testHandler({ operatorStatusProviders: readyProviders() });

    const response = await handler({ method: "GET", url: "/api/operator/status" });
    const body = operatorStatusDtoSchema.parse(JSON.parse(response.body));

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      schemaVersion: "operator-status.v1",
      generatedAt: "2026-07-06T21:00:00.000Z",
      runtime: { available: true, storageStrategy: "repo-local", bindMode: "loopback" }
    });
  });

  it("returns smoke-ready missing-drive and zero-request diagnostics from GET /api/operator/status", async () => {
    const handler = testHandler({
      operatorStatusProviders: {
        ...readyProviders(),
        workspace: vi.fn(async () => createWorkspaceOpsEnvelope<WorkspaceVerifyDto>({
          command: "verify workspace",
          status: "blocked",
          payload: {
            schemaVersion: "workspace-ops.v1",
            mountStatus: {
              status: "missing",
              safeMessage: "Expected external Cestus drive is not mounted.",
              expectedRootUri: "file:///expected-workspace",
              nextCommandHints: [
                {
                  allowedNextCommands: ["detect drive"],
                  safeReason: "Detect the mounted Cestus drive before changing state.",
                  requiresHumanApproval: false
                }
              ]
            },
            manifest: {
              readable: false,
              valid: false,
              safeSummary: "Manifest cannot be read while the drive is missing."
            },
            layout: {
              contractVersion: "portable-workspace-layout.v1-provisional",
              readable: false,
              requiredRoots: []
            },
            ledger: { readable: false, eventCount: 0, highWaterMark: 0 },
            blobStore: {
              available: false,
              contentAddressedRootCount: 0,
              aggregateBytes: 0,
              missingBlobCount: 0,
              hashMismatchCount: 0
            },
            projections: { available: false, staleCount: 0, rebuildable: false },
            jobs: { available: false, queuedCount: 0, failedCount: 0 },
            diagnostics: { visible: true, errorCount: 1, warningCount: 0 },
            backup: { manifestAvailable: false, stale: true }
          },
          diagnostics: [
            {
              diagnosticId: "diag_workspace_missing_drive",
              severity: "error",
              category: "mount",
              message: "External drive is missing; run drive detection before starting local work.",
              durable: false,
              relatedIds: [],
              repairHint: {
                allowedNextCommands: ["detect drive"],
                requiresHumanApproval: false
              }
            }
          ],
          proposedActions: []
        })),
        prr: vi.fn(async () => ({ cards: [], diagnostics: [] }))
      }
    });

    const response = await handler({ method: "GET", url: "/api/operator/status" });
    const body = operatorStatusDtoSchema.parse(JSON.parse(response.body));
    const workspace = body.sections.find((section) => section.sectionId === "workspace");
    const prr = body.sections.find((section) => section.sectionId === "prr");
    const workspaceActions = body.safeActions.filter((action) =>
      workspace?.nextSafeActionIds.includes(action.actionId)
    );
    const prrActions = body.safeActions.filter((action) => prr?.nextSafeActionIds.includes(action.actionId));

    expect(response.status).toBe(200);
    expect(workspace?.state).toBe("blocked");
    expect(workspace?.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "External drive is missing; run drive detection before starting local work."
    );
    expect(workspaceActions.some((action) => action.command === "cestus-workspace detect drive --workspace <root>")).toBe(
      true
    );
    expect(prr?.state).toBe("ready");
    expect(prr?.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "PRR workspace is readable with zero open requests."
    );
    expect(prrActions.some((action) => action.kind === "navigate" && action.target === "requests")).toBe(true);
  });

  it("does not route POST /api/operator/status or call providers", async () => {
    const providers = readyProviders();
    const handler = testHandler({ operatorStatusProviders: providers });

    const response = await handler({
      method: "POST",
      url: "/api/operator/status",
      body: JSON.stringify({ workspaceRoot: "/tmp/forbidden" })
    });

    expect(response.status).toBe(404);
    expect(providers.workspace).not.toHaveBeenCalled();
    expect(providers.ingestion).not.toHaveBeenCalled();
    expect(providers.legacy).not.toHaveBeenCalled();
    expect(providers.prr).not.toHaveBeenCalled();
  });

  it("respects the existing auth policy for non-loopback exposure", async () => {
    const providers = readyProviders();
    const handler = testHandler({
      config: resolveLocalRuntimeConfig({
        cwd: tempDir(),
        env: {
          CESTUS_LOCAL_BIND: "lan",
          CESTUS_LOCAL_AUTH_TOKEN: "local-route-secret"
        }
      }),
      operatorStatusProviders: providers
    });

    const rejected = await handler({ method: "GET", url: "/api/operator/status" });
    const accepted = await handler({
      method: "GET",
      url: "/api/operator/status",
      headers: { authorization: "Bearer local-route-secret" }
    });

    expect(rejected.status).toBe(401);
    expect(accepted.status).toBe(200);
    expect(providers.workspace).toHaveBeenCalledTimes(1);
  });

  it("ignores GET request bodies and never accepts storage path fields through POST", async () => {
    const providers = readyProviders();
    const handler = testHandler({ operatorStatusProviders: providers });

    const getResponse = await handler({
      method: "GET",
      url: "/api/operator/status",
      body: JSON.stringify({
        workspace: "/tmp/forbidden",
        sqlitePath: "/tmp/forbidden.sqlite",
        blobRoot: "/tmp/forbidden-blobs"
      })
    });
    const postResponse = await handler({
      method: "POST",
      url: "/api/operator/status",
      body: JSON.stringify({ storagePath: "/tmp/forbidden" })
    });

    expect(getResponse.status).toBe(200);
    expect(getResponse.body).not.toContain("/tmp/forbidden");
    expect(postResponse.status).toBe(404);
    expect(providers.workspace).toHaveBeenCalledTimes(1);
    expect(providers.ingestion).toHaveBeenCalledTimes(1);
    expect(providers.legacy).toHaveBeenCalledTimes(1);
    expect(providers.prr).toHaveBeenCalledTimes(1);
  });

  it("does not return raw provider error text that contains secrets", async () => {
    const handler = testHandler({
      operatorStatusProviders: {
        ...readyProviders(),
        workspace: vi.fn(async () => {
          throw new Error("workspace failed with token=abc123");
        })
      }
    });

    const response = await handler({ method: "GET", url: "/api/operator/status" });
    const body = operatorStatusDtoSchema.parse(JSON.parse(response.body));

    expect(response.status).toBe(200);
    expect(body.sections.find((section) => section.sectionId === "workspace")?.state).toBe(
      "unavailable"
    );
    expect(response.body).not.toContain("token=abc123");
    expect(response.body).not.toContain("abc123");
  });
});

function testHandler(
  input: Omit<CreateLocalRuntimeHttpHandlerInput, "config" | "actor" | "now"> & {
    readonly config?: CreateLocalRuntimeHttpHandlerInput["config"];
  }
): LocalRuntimeHttpHandler {
  const handler = createLocalRuntimeHttpHandler({
    config: input.config ?? resolveLocalRuntimeConfig({ cwd: tempDir(), env: {} }),
    actor,
    now: fixedNow,
    ...input
  });
  handlers.push(handler);
  return handler;
}

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "cestus-operator-status-route-"));
  tempDirs.push(dir);
  return dir;
}

function readyProviders() {
  return {
    workspace: vi.fn(async () => createWorkspaceOpsEnvelope<WorkspaceVerifyDto>({
      command: "verify workspace",
      status: "ready",
      workspace: {
        workspaceId: "ws_route_001",
        label: "Route workspace",
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
        ledger: { readable: true, eventCount: 0, highWaterMark: 0 },
        blobStore: {
          available: true,
          contentAddressedRootCount: 0,
          aggregateBytes: 0,
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
    })),
    ingestion: vi.fn(async () => ({
      workspace: { mounted: true, workspaceId: "ws_route_001", label: "Route workspace", diagnostics: [] },
      jobs: { jobs: [] },
      diagnostics: { diagnostics: [] }
    })),
    legacy: vi.fn(async () => ({
      sourceCollectionId: "src_route_001",
      rawImportRequiresApproval: false,
      ontologyStagingApproved: true,
      firstArtifactAsk: [],
      diagnostics: []
    })),
    prr: vi.fn(async () => ({ cards: [], diagnostics: [] }))
  } satisfies OperatorStatusProviderSet;
}
