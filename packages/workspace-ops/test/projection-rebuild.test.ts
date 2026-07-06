import { describe, expect, it } from "vitest";
import {
  projectionRebuildDtoSchema,
  workspaceOpsEnvelopeSchema,
  workspaceOpsSchemaVersion
} from "../src/contracts.js";
import { createProvisionalWorkspaceLayout } from "../src/layout.js";
import {
  rebuildProjection,
  rebuildProjectionReadiness,
  type ProjectionArtifactFileSystem
} from "../src/projection-rebuild.js";

const layout = createProvisionalWorkspaceLayout("/workspace");

class RecordingProjectionFs implements ProjectionArtifactFileSystem {
  readonly existsCalls: string[] = [];
  readonly writes: Array<{ readonly path: string; readonly content: string }> = [];
  readonly removed: string[] = [];
  readonly promoted: Array<{ readonly from: string; readonly to: string }> = [];
  readonly availableBytesCalls: string[] = [];

  constructor(
    private readonly options: {
      readonly exists?: boolean;
      readonly failWrite?: boolean;
      readonly availableBytes?: number | undefined;
    } = {}
  ) {}

  async exists(path: string): Promise<boolean> {
    this.assertProjectionPath(path);
    this.existsCalls.push(path);
    return this.options.exists ?? true;
  }

  async writeText(path: string, content: string): Promise<void> {
    this.assertProjectionPath(path);
    if (this.options.failWrite) {
      throw new Error("private projection write failed");
    }
    this.writes.push({ path, content });
  }

  async remove(path: string): Promise<void> {
    this.assertProjectionPath(path);
    this.removed.push(path);
  }

  async promoteDirectory(from: string, to: string): Promise<void> {
    this.assertProjectionPath(from);
    this.assertProjectionPath(to);
    this.promoted.push({ from, to });
  }

  async availableBytes(path: string): Promise<number | undefined> {
    this.assertProjectionPath(path);
    this.availableBytesCalls.push(path);
    return this.options.availableBytes ?? 1_000_000;
  }

  private assertProjectionPath(path: string): void {
    if (path !== layout.projectionRoot && !path.startsWith(`${layout.projectionRoot}/`)) {
      throw new Error(`canonical projection filesystem access attempted: ${path}`);
    }
  }
}

describe("projection rebuild", () => {
  it("reports rebuild readiness with the readiness DTO mode and no artifact writes", async () => {
    const fileSystem = new RecordingProjectionFs();

    const result = await rebuildProjectionReadiness({
      layout,
      projectionName: "graph",
      fileSystem,
      eventReader: { readAll: async () => [] }
    });

    expect(result.command).toBe("projection rebuild-readiness");
    expect(result.status).toBe("ready");
    expect(result.payload).toMatchObject({
      schemaVersion: workspaceOpsSchemaVersion,
      mode: "readiness",
      requestedProjections: ["graph"],
      inputLedger: { readable: true, eventCount: 0, highWaterMark: 0 },
      readiness: { ready: true },
      artifactOutputs: [],
      failures: [],
      wroteExpendableArtifactsOnly: true
    });
    expect(result.payload?.validationResults).toContainEqual(
      expect.objectContaining({ validationId: "validation_ledger_events", status: "pass" })
    );
    expect(fileSystem.writes).toEqual([]);
    expect(fileSystem.removed).toEqual([]);
    expect(fileSystem.promoted).toEqual([]);
    expect(projectionRebuildDtoSchema.parse(result.payload)).toEqual(result.payload);
    expect(workspaceOpsEnvelopeSchema.parse(result)).toEqual(result);
  });

  it("blocks readiness for invalid ledger events without writing projection artifacts", async () => {
    const fileSystem = new RecordingProjectionFs();

    const result = await rebuildProjectionReadiness({
      layout,
      projectionName: "graph",
      fileSystem,
      eventReader: { readAll: async () => [{ not: "a knowledge event" }] }
    });

    expect(result.status).toBe("blocked");
    expect(result.payload?.mode).toBe("readiness");
    expect(result.payload?.inputLedger).toEqual({ readable: true, eventCount: 1, highWaterMark: 1 });
    expect(result.payload?.readiness.ready).toBe(false);
    expect(result.payload?.validationResults).toContainEqual(
      expect.objectContaining({ validationId: "validation_ledger_events", status: "fail" })
    );
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        diagnosticId: "diag_projection_ledger_event_validation_failed",
        repairHint: expect.objectContaining({
          allowedNextCommands: ["diagnostics inspect"],
          requiresHumanApproval: true
        })
      })
    );
    expect(result.proposedActions).toContainEqual(
      expect.objectContaining({
        kind: "append-repair-event-required",
        requiresHumanApproval: true,
        mutatesCanonicalState: true,
        allowedNextCommands: ["diagnostics inspect"]
      })
    );
    expect(fileSystem.writes).toEqual([]);
    expect(fileSystem.removed).toEqual([]);
    expect(fileSystem.promoted).toEqual([]);
    expect(workspaceOpsEnvelopeSchema.parse(result)).toEqual(result);
  });

  it("blocks rebuild on ledger read failure with a human-approved canonical repair action", async () => {
    const fileSystem = new RecordingProjectionFs();

    const result = await rebuildProjection({
      layout,
      projectionName: "graph",
      fileSystem,
      eventReader: {
        readAll: async () => {
          throw new Error("private ledger read failure");
        }
      },
      builder: {
        projectionName: "graph",
        build: async () => ({ "projection.json": "{}" })
      },
      rebuildId: "rb_ledger_failed"
    });

    expect(result.status).toBe("blocked");
    expect(result.payload?.mode).toBe("result");
    expect(result.payload?.inputLedger).toEqual({ readable: false, eventCount: 0, highWaterMark: 0 });
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        diagnosticId: "diag_projection_ledger_read_failed",
        repairHint: expect.objectContaining({
          allowedNextCommands: ["diagnostics inspect"],
          requiresHumanApproval: true
        })
      })
    );
    expect(result.proposedActions).toContainEqual(
      expect.objectContaining({
        kind: "append-repair-event-required",
        requiresHumanApproval: true,
        mutatesCanonicalState: true,
        allowedNextCommands: ["diagnostics inspect"]
      })
    );
    expect(fileSystem.writes).toEqual([]);
    expect(fileSystem.promoted).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("private ledger read failure");
    expect(workspaceOpsEnvelopeSchema.parse(result)).toEqual(result);
  });

  it("writes only expendable temp artifacts and promotes after all writes succeed", async () => {
    const fileSystem = new RecordingProjectionFs();

    const result = await rebuildProjection({
      layout,
      projectionName: "graph",
      fileSystem,
      eventReader: { readAll: async () => [] },
      builder: {
        projectionName: "graph",
        build: async () => ({ "projection.json": JSON.stringify({ nodes: [] }) })
      },
      rebuildId: "rb_001"
    });

    expect(result.command).toBe("projection rebuild");
    expect(result.status).toBe("ready");
    expect(result.payload).toMatchObject({
      schemaVersion: workspaceOpsSchemaVersion,
      mode: "result",
      requestedProjections: ["graph"],
      readiness: { ready: true },
      failures: [],
      wroteExpendableArtifactsOnly: true
    });
    expect(result.payload?.validationResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ validationId: "validation_ledger_events", status: "pass" }),
        expect.objectContaining({ validationId: "validation_projection_output", status: "pass" })
      ])
    );
    expect(result.payload?.artifactOutputs).toEqual([
      expect.objectContaining({
        projectionName: "graph",
        artifactId: "artifact_graph_projection_json",
        byteCount: JSON.stringify({ nodes: [] }).length,
        expendable: true
      })
    ]);
    expect(result.payload?.artifactOutputs[0]?.artifactHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(fileSystem.writes.map((write) => write.path)).toEqual([
      "/workspace/projections/.tmp-rb_001/projection.json"
    ]);
    expect(fileSystem.promoted).toEqual([
      { from: "/workspace/projections/.tmp-rb_001", to: "/workspace/projections/graph" }
    ]);
    expect(fileSystem.removed).not.toContain("/workspace/projections/graph");
    expect(projectionRebuildDtoSchema.parse(result.payload)).toEqual(result.payload);
    expect(workspaceOpsEnvelopeSchema.parse(result)).toEqual(result);
  });

  it("preserves prior artifacts when writes fail before promotion", async () => {
    const fileSystem = new RecordingProjectionFs({ failWrite: true });

    const result = await rebuildProjection({
      layout,
      projectionName: "graph",
      fileSystem,
      eventReader: { readAll: async () => [] },
      builder: {
        projectionName: "graph",
        build: async () => ({ "projection.json": "{}" })
      },
      rebuildId: "rb_002"
    });

    expect(result.status).toBe("degraded");
    expect(result.payload?.mode).toBe("result");
    expect(result.payload?.failures).toContainEqual(
      expect.objectContaining({
        failureId: "failure_projection_rebuild",
        retryable: true
      })
    );
    expect(fileSystem.promoted).toEqual([]);
    expect(fileSystem.removed).not.toContain("/workspace/projections/graph");
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        diagnosticId: "diag_projection_rebuild_failed",
        category: "projection",
        durable: false
      })
    );
    expect(JSON.stringify(result)).not.toContain("private projection write failed");
    expect(workspaceOpsEnvelopeSchema.parse(result)).toEqual(result);
  });

  it("rejects traversal names before projection artifact mutation", async () => {
    const fileSystem = new RecordingProjectionFs();

    const unsafeProjection = await rebuildProjection({
      layout,
      projectionName: "../ledger",
      fileSystem,
      eventReader: { readAll: async () => [] },
      builder: {
        projectionName: "../ledger",
        build: async () => ({ "projection.json": "{}" })
      },
      rebuildId: "rb_003"
    });

    const unsafeRebuild = await rebuildProjection({
      layout,
      projectionName: "graph",
      fileSystem,
      eventReader: { readAll: async () => [] },
      builder: {
        projectionName: "graph",
        build: async () => ({ "projection.json": "{}" })
      },
      rebuildId: "../rb_004"
    });

    const unsafeArtifact = await rebuildProjection({
      layout,
      projectionName: "graph",
      fileSystem,
      eventReader: { readAll: async () => [] },
      builder: {
        projectionName: "graph",
        build: async () => ({ "../ledger/ontology.sqlite": "{}" })
      },
      rebuildId: "rb_005"
    });

    expect(unsafeProjection.status).toBe("blocked");
    expect(unsafeRebuild.status).toBe("blocked");
    expect(unsafeArtifact.status).toBe("degraded");
    expect(fileSystem.writes).toEqual([]);
    expect(fileSystem.promoted).toEqual([]);
    expect(fileSystem.removed).not.toContain("/workspace/projections/graph");
  });
});
