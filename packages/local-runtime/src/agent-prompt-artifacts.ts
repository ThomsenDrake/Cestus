import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildContextPackRef,
  buildPromptArtifact,
  createPromptArtifactResolver,
  parsePromptArtifactEnvelope,
  serializePromptArtifactEnvelope,
  type PromptArtifactEnvelope,
  type PromptArtifactOmission,
  type PromptArtifactResolver
} from "../../agent/src/index.js";
import type { ProviderDescriptor } from "../../agent/src/provider.js";
import type { LocalRuntimeHandle } from "./runtime-factory.js";

export interface BuildLocalRuntimeStatusPromptArtifactInput {
  readonly handle: LocalRuntimeHandle;
  readonly now: () => string;
  readonly providerDescriptors?: readonly ProviderDescriptor[];
  readonly projectionHighWaterMark?: number;
  readonly sourceEventIds?: readonly string[];
}

const promptTemplateId = "resident-agent-local-runtime-status.v1";
const promptTemplateVersion = 1;
const contextPackId = "workspace-runtime-status.v1";
const contextPackVersion = 1;
const policyVersion = "agent-prompt-artifact-policy-v1";
const contextPackSizeBudgetBytes = 16_384;

export function buildLocalRuntimeStatusPromptArtifact(
  input: BuildLocalRuntimeStatusPromptArtifactInput
): PromptArtifactEnvelope {
  const generatedAt = input.now();
  const runtimeFacts = safeRuntimeFacts(input.handle, input.providerDescriptors ?? []);
  const omissions = localRuntimePromptOmissions();
  const contextPackRef = buildContextPackRef({
    contextPackId,
    version: contextPackVersion,
    generatedAt,
    payload: {
      runtime: runtimeFacts.runtime,
      providers: runtimeFacts.providers,
      policy: {
        policyVersion,
        sizeBudgetBytes: contextPackSizeBudgetBytes
      },
      omissions: omissions.map((omission) => ({
        reason: omission.reason,
        sourceRef: omission.sourceRef,
        safeSummary: omission.safeSummary
      }))
    },
    safeSummary: "Safe local runtime status for resident-agent provider invocation.",
    provenanceRefs: provenanceRefs(input.sourceEventIds),
    ...(input.projectionHighWaterMark === undefined
      ? {}
      : { projectionHighWaterMark: input.projectionHighWaterMark }),
    ...(input.sourceEventIds === undefined || input.sourceEventIds.length === 0
      ? {}
      : { sourceEventIds: [...input.sourceEventIds] }),
    policyVersion,
    scope: runtimeFacts.scope,
    sizeBudgetBytes: contextPackSizeBudgetBytes,
    stalenessInputs: stalenessInputs(input, runtimeFacts)
  });

  const envelope = buildPromptArtifact({
    promptTemplateId,
    promptTemplateVersion,
    generatedAt,
    runType: "evidence-triage",
    safetyClass: "provider-approved",
    transferApprovalClass: "provider-byte-transfer",
    contextPackRefs: [contextPackRef],
    text: promptText(runtimeFacts),
    safeSummary: "Provider-approved local runtime status prompt assembled from safe context pack facts.",
    omissions
  });
  persistPromptArtifactEnvelope(input.handle, envelope);

  return envelope;
}

export function createLocalRuntimePromptArtifactResolver(
  artifacts: readonly PromptArtifactEnvelope[]
): PromptArtifactResolver {
  return createPromptArtifactResolver(artifacts);
}

function safeRuntimeFacts(
  handle: LocalRuntimeHandle,
  providerDescriptors: readonly ProviderDescriptor[]
): {
  readonly runtime: {
    readonly storageStrategy: string;
    readonly bindMode: string;
    readonly authRequired: boolean;
    readonly workspaceMounted: boolean;
    readonly workspaceId?: string;
  };
  readonly providers: readonly {
    readonly providerId: string;
    readonly label: string;
    readonly modelFamilies: readonly string[];
  }[];
  readonly scope: { readonly kind: string; readonly id: string };
} {
  const workspaceId = handle.mountedWorkspace?.workspaceId;
  const storageStrategy = handle.config.storage.strategy;
  const runtime = {
    storageStrategy,
    bindMode: handle.config.http.bindMode,
    authRequired: handle.config.http.authRequired,
    workspaceMounted: workspaceId !== undefined,
    ...(workspaceId === undefined ? {} : { workspaceId })
  };

  return Object.freeze({
    runtime: Object.freeze(runtime),
    providers: Object.freeze(providerDescriptors.map((provider) => Object.freeze({
      providerId: provider.providerId,
      label: provider.label,
      modelFamilies: Object.freeze([...provider.modelFamilies])
    }))),
    scope: Object.freeze(workspaceId === undefined
      ? { kind: "local-runtime", id: `runtime_${storageStrategy.replaceAll("-", "_")}` }
      : { kind: "workspace", id: workspaceId })
  });
}

function promptText(input: ReturnType<typeof safeRuntimeFacts>): string {
  const workspaceIdLine = input.runtime.workspaceId === undefined
    ? "workspace id: not mounted"
    : `workspace id: ${input.runtime.workspaceId}`;
  const providers = input.providers.length === 0
    ? "providers: none"
    : `providers: ${input.providers.map((provider) => `${provider.providerId} (${provider.label})`).join(", ")}`;

  return [
    "workspace runtime status",
    `storage strategy: ${input.runtime.storageStrategy}`,
    `bind mode: ${input.runtime.bindMode}`,
    `local access requires auth: ${String(input.runtime.authRequired)}`,
    `workspace mounted: ${String(input.runtime.workspaceMounted)}`,
    workspaceIdLine,
    providers,
    `policy version: ${policyVersion}`,
    "Use these safe context pack facts only. Do not infer from omitted local files, source content, provider runtime material, or model output."
  ].join("\n");
}

function localRuntimePromptOmissions(): readonly PromptArtifactOmission[] {
  return Object.freeze([
    Object.freeze({
      reason: "policy",
      sourceRef: "local-file-locations",
      safeSummary: "Local file locations were omitted."
    }),
    Object.freeze({
      reason: "policy",
      sourceRef: "source-content",
      safeSummary: "Source content and request bodies were omitted."
    }),
    Object.freeze({
      reason: "policy",
      sourceRef: "provider-runtime-material",
      safeSummary: "Provider runtime material was omitted."
    }),
    Object.freeze({
      reason: "policy",
      sourceRef: "model-output",
      safeSummary: "Model output text was omitted."
    })
  ]);
}

function provenanceRefs(sourceEventIds: readonly string[] | undefined): readonly string[] {
  return Object.freeze([
    "local-runtime-config.v1",
    ...(sourceEventIds ?? [])
  ]);
}

function stalenessInputs(
  input: BuildLocalRuntimeStatusPromptArtifactInput,
  facts: ReturnType<typeof safeRuntimeFacts>
) {
  return Object.freeze([
    Object.freeze({
      kind: "runtime-storage-strategy",
      ref: "local-runtime.config",
      value: facts.runtime.storageStrategy
    }),
    Object.freeze({
      kind: "runtime-bind-mode",
      ref: "local-runtime.http",
      value: facts.runtime.bindMode
    }),
    Object.freeze({
      kind: "runtime-auth-required",
      ref: "local-runtime.http",
      value: String(facts.runtime.authRequired)
    }),
    Object.freeze({
      kind: "workspace-mounted",
      ref: "local-runtime.workspace",
      value: String(facts.runtime.workspaceMounted)
    }),
    ...(facts.runtime.workspaceId === undefined
      ? []
      : [Object.freeze({
          kind: "workspace-id",
          ref: "local-runtime.workspace",
          value: facts.runtime.workspaceId
        })]),
    ...(input.projectionHighWaterMark === undefined
      ? []
      : [Object.freeze({
          kind: "projection-high-water-mark",
          ref: "agent.projection",
          value: String(input.projectionHighWaterMark)
        })])
  ]);
}

function persistPromptArtifactEnvelope(handle: LocalRuntimeHandle, envelope: PromptArtifactEnvelope): void {
  const root = promptArtifactStoreRoot(handle);
  const digest = envelope.manifest.inputArtifactHash.slice("sha256:".length);
  const dir = join(root, "sha256", digest.slice(0, 2));
  const path = join(dir, `${digest}.json`);
  const bytes = Buffer.from(serializePromptArtifactEnvelope(envelope));
  mkdirSync(dir, { recursive: true });

  try {
    writeFileSync(path, bytes, { flag: "wx" });
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code !== "EEXIST") {
      throw error;
    }
    const existing = parsePromptArtifactEnvelope(readFileSync(path));
    if (existing.manifest.inputArtifactHash !== envelope.manifest.inputArtifactHash) {
      throw new Error("Prompt artifact persistence hash mismatch");
    }
  }
}

function promptArtifactStoreRoot(handle: LocalRuntimeHandle): string {
  if (handle.mountedWorkspace !== undefined) {
    return join(handle.mountedWorkspace.paths.blobRoot, "agent-prompt-artifacts");
  }

  return join(handle.config.cwd, ".cestus", "local", "prompt-artifacts");
}
