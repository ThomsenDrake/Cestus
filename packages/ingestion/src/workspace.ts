import {
  createPortableWorkspace,
  readPortableWorkspaceManifest as readCanonicalPortableWorkspaceManifest,
  type PortableWorkspaceManifest
} from "../../workspace/src/index.js";

export type { PortableWorkspaceManifest };

export interface CreatePortableWorkspaceInput {
  rootDir: string;
  workspaceId: string;
  label: string;
  createdAt?: string;
}

export interface PortableIngestionWorkspace {
  workspaceId: string;
  label: string;
  rootDir: string;
  manifestPath: string;
  ledgerPath: string;
  blobRoot: string;
  derivativeRoot: string;
  jobRoot: string;
  projectionRoot: string;
  cacheRoot: string;
  configRoot: string;
}

export function createPortableIngestionWorkspace(input: CreatePortableWorkspaceInput): PortableIngestionWorkspace {
  const workspace = createPortableWorkspace({
    rootDir: input.rootDir,
    workspaceId: input.workspaceId,
    label: input.label,
    createdBy: "cestus-ingest",
    ...(input.createdAt === undefined ? {} : { createdAt: input.createdAt })
  });

  return {
    workspaceId: workspace.workspaceId,
    label: workspace.label,
    rootDir: workspace.rootDir,
    manifestPath: workspace.manifestPath,
    ledgerPath: workspace.paths.ledgerPath,
    blobRoot: workspace.paths.blobRoot,
    derivativeRoot: workspace.paths.derivativeRoot,
    jobRoot: workspace.paths.jobRoot,
    projectionRoot: workspace.paths.projectionRoot,
    cacheRoot: workspace.paths.cacheRoot,
    configRoot: workspace.paths.configRoot
  };
}

export function readPortableWorkspaceManifest(manifestPath: string): PortableWorkspaceManifest {
  return readCanonicalPortableWorkspaceManifest({ manifestPath });
}
