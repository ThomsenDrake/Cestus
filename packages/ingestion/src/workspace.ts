import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const workspaceManifestSchema = z.object({
  workspaceId: z.string().regex(/^ws_[a-zA-Z0-9_-]+$/),
  label: z.string().min(1),
  version: z.literal(1)
}).strict();

export type PortableWorkspaceManifest = z.infer<typeof workspaceManifestSchema>;

export interface CreatePortableWorkspaceInput {
  rootDir: string;
  workspaceId: string;
  label: string;
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
}

export function createPortableIngestionWorkspace(input: CreatePortableWorkspaceInput): PortableIngestionWorkspace {
  const manifest = workspaceManifestSchema.parse({
    workspaceId: input.workspaceId,
    label: input.label,
    version: 1
  });
  const workspace = workspacePaths(input.rootDir, manifest.workspaceId, manifest.label);
  mkdirSync(join(input.rootDir, "ledger"), { recursive: true });
  mkdirSync(workspace.blobRoot, { recursive: true });
  mkdirSync(workspace.derivativeRoot, { recursive: true });
  mkdirSync(workspace.jobRoot, { recursive: true });
  writeFileSync(workspace.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  return workspace;
}

export function readPortableWorkspaceManifest(manifestPath: string): PortableWorkspaceManifest {
  return workspaceManifestSchema.parse(JSON.parse(readFileSync(manifestPath, "utf8")));
}

function workspacePaths(rootDir: string, workspaceId: string, label: string): PortableIngestionWorkspace {
  return {
    workspaceId,
    label,
    rootDir,
    manifestPath: join(rootDir, "cestus-workspace.json"),
    ledgerPath: join(rootDir, "ledger", "ontology.sqlite"),
    blobRoot: join(rootDir, "blobs"),
    derivativeRoot: join(rootDir, "derivatives"),
    jobRoot: join(rootDir, "jobs")
  };
}
