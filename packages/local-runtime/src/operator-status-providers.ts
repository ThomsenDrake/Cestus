import { FileBlobStore } from "../../ontology/src/blob-store.js";
import { buildLegacyImportProjection } from "../../ingestion/src/legacy-projection.js";
import { buildLegacyMigrationReviewDto } from "../../ingestion/src/legacy-read-api.js";
import {
  mountedWorkspaceCapabilities,
  type MountedWorkspace
} from "../../ingestion/src/mount-contract.js";
import type {
  IngestionDiagnosticsDto,
  IngestionJobListDto,
  IngestionRuntimeDiagnosticDto,
  IngestionRuntimeError
} from "../../ingestion/src/runtime-types.js";
import type { ActorRef } from "../../prr/src/draft-events.js";
import {
  NodeWorkspaceFileSystem,
  resolveWorkspaceLayout,
  verifyWorkspace
} from "../../workspace-ops/src/index.js";
import type {
  WorkspaceOpsEnvelope,
  WorkspaceVerifyDto
} from "../../workspace-ops/src/contracts.js";
import type { ResolvedLocalRuntimeConfig } from "./config.js";
import {
  defaultLocalIngestionRuntimeFactory,
  type LocalIngestionRuntimeFactory
} from "./ingestion-runtime-factory.js";
import {
  defaultLocalAgentRuntimeFactory,
  type LocalAgentRuntimeFactory
} from "./agent-runtime-factory.js";
import type {
  OperatorIngestionStatusProviderDto,
  OperatorStatusProviderSet
} from "./operator-status.js";
import type { LocalRuntimeHandle } from "./runtime-factory.js";

export function createDefaultOperatorStatusProviders(input: {
  readonly config: ResolvedLocalRuntimeConfig;
  readonly actor: ActorRef;
  readonly handle: LocalRuntimeHandle;
  readonly now?: () => string;
  readonly ingestionRuntimeFactory?: LocalIngestionRuntimeFactory;
  readonly agentRuntimeFactory?: LocalAgentRuntimeFactory;
}): OperatorStatusProviderSet {
  return {
    workspace: () => workspaceStatus(input),
    ingestion: () => ingestionStatus(input),
    legacy: () => legacyStatus(input.handle),
    prr: () => input.handle.runtime.loadWorkspace(),
    agent: () => agentStatus(input)
  };
}

async function workspaceStatus(input: {
  readonly config: ResolvedLocalRuntimeConfig;
  readonly handle: LocalRuntimeHandle;
}): Promise<WorkspaceOpsEnvelope<WorkspaceVerifyDto>> {
  const fileSystem = new NodeWorkspaceFileSystem();
  const rootPath = input.config.storage.strategy === "portable-workspace"
    ? input.config.storage.workspaceRoot
    : input.config.cwd;
  const layout = await resolveWorkspaceLayout({
    rootPath,
    ...(input.handle.mountedWorkspace === undefined
      ? {}
      : { expectedWorkspaceId: input.handle.mountedWorkspace.workspaceId })
  }, fileSystem);

  return verifyWorkspace({
    layout,
    fileSystem,
    eventReader: {
      readAll: () => input.handle.ledger.readAll()
    }
  });
}

async function ingestionStatus(input: {
  readonly actor: ActorRef;
  readonly handle: LocalRuntimeHandle;
  readonly ingestionRuntimeFactory?: LocalIngestionRuntimeFactory;
}): Promise<OperatorIngestionStatusProviderDto> {
  const mountedWorkspace = ingestionMountedWorkspace(input.handle);
  if (mountedWorkspace === undefined) {
    return {
      workspace: {
        mounted: false,
        diagnostics: [
          ingestionDiagnostic(
            "diag_ingestion_workspace_not_mounted",
            "error",
            "ingestion.mount",
            "Portable workspace is not mounted."
          )
        ]
      },
      jobs: { jobs: [] },
      diagnostics: { diagnostics: [] }
    };
  }

  const runtimeFactory = input.ingestionRuntimeFactory ?? defaultLocalIngestionRuntimeFactory;
  const runtime = runtimeFactory({
    mountedWorkspace,
    actor: input.actor
  });
  const jobs = await listJobs(runtime);
  const diagnostics = await listDiagnostics(runtime);

  return {
    workspace: {
      mounted: true,
      workspaceId: mountedWorkspace.workspaceId,
      label: mountedWorkspace.label,
      capabilities: { ...mountedWorkspace.capabilities },
      diagnostics: []
    },
    jobs: jobs.dto,
    diagnostics: {
      diagnostics: [...jobs.diagnostics, ...diagnostics.diagnostics]
    }
  };
}

async function legacyStatus(handle: LocalRuntimeHandle) {
  const projection = buildLegacyImportProjection(await handle.ledger.readAll());
  const sourceCollectionId =
    [...projection.latestReportBySource.keys()].sort(compareCodeUnits)[0] ??
    [...projection.diagnosticsBySourceCollectionId.keys()].sort(compareCodeUnits)[0] ??
    "src_legacy_pending";

  return buildLegacyMigrationReviewDto(projection, sourceCollectionId);
}

async function agentStatus(input: {
  readonly actor: ActorRef;
  readonly handle: LocalRuntimeHandle;
  readonly now?: () => string;
  readonly agentRuntimeFactory?: LocalAgentRuntimeFactory;
}) {
  const runtimeFactory = input.agentRuntimeFactory ?? defaultLocalAgentRuntimeFactory;
  const runtime = runtimeFactory({
    handle: input.handle,
    actor: input.actor,
    now: input.now ?? (() => new Date().toISOString())
  });

  return runtime.status();
}

function ingestionMountedWorkspace(handle: LocalRuntimeHandle): MountedWorkspace | undefined {
  const workspace = handle.mountedWorkspace;
  if (workspace === undefined) {
    return undefined;
  }

  return {
    workspaceId: workspace.workspaceId,
    label: workspace.label,
    ledger: handle.ledger,
    blobStore: new FileBlobStore(workspace.paths.blobRoot),
    derivativeStore: new FileBlobStore(workspace.paths.derivativeRoot),
    jobStateRoot: workspace.paths.jobRoot,
    projectionCacheRoot: workspace.paths.projectionRoot,
    capabilities: mountedWorkspaceCapabilities({
      canReadLedger: true,
      canAppendLedger: true,
      canWriteBlobs: true,
      canWriteDerivatives: true,
      canWriteJobState: true
    })
  };
}

async function listJobs(
  runtime: ReturnType<LocalIngestionRuntimeFactory>
): Promise<{
  readonly dto: IngestionJobListDto;
  readonly diagnostics: readonly IngestionRuntimeDiagnosticDto[];
}> {
  if (typeof runtime.listJobs !== "function") {
    return {
      dto: { jobs: [] },
      diagnostics: [
        ingestionDiagnostic(
          "diag_ingestion_jobs_method_unavailable",
          "error",
          "ingestion.runtime",
          "Ingestion job listing is unavailable from the local runtime."
        )
      ]
    };
  }

  try {
    const result = await runtime.listJobs({});
    if (result.ok) {
      return {
        dto: { jobs: [...result.jobs] },
        diagnostics: []
      };
    }

    return {
      dto: { jobs: [] },
      diagnostics: diagnosticsFromRuntimeError(result, "diag_ingestion_jobs_unavailable")
    };
  } catch {
    return {
      dto: { jobs: [] },
      diagnostics: [
        ingestionDiagnostic(
          "diag_ingestion_jobs_provider_threw",
          "error",
          "ingestion.runtime",
          "Ingestion job listing threw before returning a safe DTO."
        )
      ]
    };
  }
}

async function listDiagnostics(
  runtime: ReturnType<LocalIngestionRuntimeFactory>
): Promise<IngestionDiagnosticsDto> {
  if (typeof runtime.diagnostics !== "function") {
    return {
      diagnostics: [
        ingestionDiagnostic(
          "diag_ingestion_diagnostics_method_unavailable",
          "error",
          "ingestion.runtime",
          "Ingestion diagnostics are unavailable from the local runtime."
        )
      ]
    };
  }

  try {
    const result = await runtime.diagnostics({});
    if (result.ok) {
      return { diagnostics: [...result.diagnostics] };
    }

    return {
      diagnostics: diagnosticsFromRuntimeError(result, "diag_ingestion_diagnostics_unavailable")
    };
  } catch {
    return {
      diagnostics: [
        ingestionDiagnostic(
          "diag_ingestion_diagnostics_provider_threw",
          "error",
          "ingestion.runtime",
          "Ingestion diagnostics threw before returning a safe DTO."
        )
      ]
    };
  }
}

function diagnosticsFromRuntimeError(
  result: { readonly ok: false; readonly error: IngestionRuntimeError },
  fallbackDiagnosticId: string
): readonly IngestionRuntimeDiagnosticDto[] {
  if (result.error.diagnostics.length > 0) {
    return result.error.diagnostics;
  }

  return [
    ingestionDiagnostic(
      fallbackDiagnosticId,
      "error",
      "ingestion.runtime",
      result.error.message
    )
  ];
}

function ingestionDiagnostic(
  diagnosticId: string,
  severity: IngestionRuntimeDiagnosticDto["severity"],
  category: string,
  message: string
): IngestionRuntimeDiagnosticDto {
  return {
    diagnosticId,
    severity,
    category,
    message
  };
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
