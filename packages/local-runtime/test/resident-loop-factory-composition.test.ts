import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createPortableWorkspace } from "../../workspace/src/index.js";
import { issueMountedArtifactAuthorityOperationForFactory } from "../src/mounted-artifact-authority-operation.js";
import { issueMountedProviderAuthority } from "../src/mounted-provider-authority.js";
import { createPortableMountedAgentArtifactStoreProducer } from "../src/portable-mounted-agent-artifact-stores.js";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import { createSqlitePrrRuntime, type LocalRuntimeHandle } from "../src/runtime-factory.js";

type FactoryCompositionApi = {
  readonly createResidentLoopFactoryComposition: (input: unknown) => {
    readonly wakeRuntime: object;
    start(): Promise<{ readonly outcome: string }>;
    bind(input: unknown): Promise<{
      readonly provider: {
        readonly workspaceId: string;
        readonly mountInstanceId: string;
        readonly admissionGenerationId: string;
        readonly policyVersion: string;
        readonly policyDigest: string;
        readonly lockStateDigest: string;
        readonly highWaterMark: string;
        readonly highWaterOrdinal: number;
      };
      readonly handoff: {
        readonly taskId: string;
        readonly attemptId: string;
        readonly runId: string;
        readonly runType: string;
        readonly retryGeneration: number;
      };
    }>;
    stop(): Promise<void>;
  };
};

const directories: string[] = [];
const handles: LocalRuntimeHandle[] = [];
const policy = Object.freeze({
  policyVersion: "policy.factory-core.v1",
  policyDigest: `sha256:${"a".repeat(64)}`,
  lockStateDigest: `sha256:${"b".repeat(64)}`
});

afterEach(() => {
  for (const handle of handles.splice(0)) handle.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("resident loop factory composition", () => {
  it("admits only the matching current W, PM, H, and Task135D authority chain", async () => {
    const api = await factoryCompositionApi();
    const first = await fixture("first");
    const composition = api.createResidentLoopFactoryComposition(compositionInput(first.handle, "first"));
    await expect(composition.start()).resolves.toMatchObject({ outcome: "accepted" });

    const operation = issueMountedArtifactAuthorityOperationForFactory(composition.wakeRuntime);
    const providerAuthority = issueMountedProviderAuthority(Object.freeze({ operation }));
    const handoff = await createPortableMountedAgentArtifactStoreProducer(operation).bind({
      taskId: "task_factory_core",
      attemptId: "attempt_factory_core",
      approvedRunId: "run_factory_core",
      runType: "evidence-triage",
      retryGeneration: 0
    });

    await expect(composition.bind(Object.freeze({
      providerAuthority,
      handoffAuthorityWitness: handoff.binding.authorityWitness
    }))).resolves.toMatchObject({
      provider: {
        workspaceId: first.workspaceId,
        admissionGenerationId: "admission_generation_1",
        policyVersion: policy.policyVersion,
        policyDigest: policy.policyDigest,
        lockStateDigest: policy.lockStateDigest
      },
      handoff: {
        taskId: "task_factory_core",
        attemptId: "attempt_factory_core",
        runId: "run_factory_core",
        runType: "evidence-triage",
        retryGeneration: 0
      }
    });

    await expect(composition.bind(Object.freeze({
      providerAuthority,
      handoffAuthorityWitness: handoff.binding.authorityWitness,
      providerData: Object.freeze({ providerId: "provider_openai_codex_untrusted" })
    }))).rejects.toThrow(/factory composition/i);
    await expect(composition.bind(new Proxy({ providerAuthority, handoffAuthorityWitness: handoff.binding.authorityWitness }, {})))
      .rejects.toThrow(/factory composition/i);

    const second = await fixture("second");
    const secondComposition = api.createResidentLoopFactoryComposition(compositionInput(second.handle, "second"));
    await secondComposition.start();
    const secondOperation = issueMountedArtifactAuthorityOperationForFactory(secondComposition.wakeRuntime);
    const secondHandoff = await createPortableMountedAgentArtifactStoreProducer(secondOperation).bind({
      taskId: "task_factory_core",
      attemptId: "attempt_factory_core",
      approvedRunId: "run_factory_core",
      runType: "evidence-triage",
      retryGeneration: 0
    });

    await expect(api.createResidentLoopFactoryComposition(compositionInput(first.handle, "cross-workspace"))
      .bind(Object.freeze({
        providerAuthority,
        handoffAuthorityWitness: secondHandoff.binding.authorityWitness
      }))).rejects.toThrow(/factory composition/i);
  });
});

async function factoryCompositionApi(): Promise<FactoryCompositionApi> {
  const imported = await import("../src/resident-loop-factory-composition.js").catch(() => undefined);
  expect(isFactoryCompositionApi(imported)).toBe(true);
  if (!isFactoryCompositionApi(imported)) throw new Error("resident loop factory composition is unavailable");
  return imported;
}

function isFactoryCompositionApi(value: unknown): value is FactoryCompositionApi {
  return value !== null && typeof value === "object" &&
    typeof Reflect.get(value, "createResidentLoopFactoryComposition") === "function";
}

async function fixture(suffix: string): Promise<{ readonly workspaceId: string; readonly handle: LocalRuntimeHandle }> {
  const root = mkdtempSync(join(tmpdir(), "cestus-factory-composition-"));
  directories.push(root);
  const workspaceId = `ws_factory_composition_${suffix}`;
  const workspaceRoot = join(root, workspaceId);
  createPortableWorkspace({
    rootDir: workspaceRoot,
    workspaceId,
    label: `Factory composition ${suffix}`,
    createdAt: "2026-07-19T00:00:00.000Z",
    createdBy: "resident-loop-factory-composition-test"
  });
  const handle = createSqlitePrrRuntime({
    config: resolveLocalRuntimeConfig({
      cwd: root,
      env: { CESTUS_LOCAL_STORAGE: "portable-workspace", CESTUS_WORKSPACE_ROOT: workspaceRoot }
    }),
    actor: { id: "actor_factory_composition", kind: "human", label: "Factory composition test" },
    now: () => "2026-07-19T00:00:00.000Z"
  });
  handles.push(handle);
  await handle.residentIdentity.ready();
  return { workspaceId, handle };
}

function compositionInput(handle: LocalRuntimeHandle, suffix: string): object {
  return Object.freeze({
    runtimeHandle: handle,
    actor: { id: "agent_factory_composition", kind: "agent", label: "Factory composition" },
    supervisorEpoch: `epoch_factory_composition_${suffix}`,
    policy,
    now: () => "2026-07-19T00:00:00.000Z",
    createSafeId: (kind: "lease" | "diagnostic" | "reconciliation") => `${kind}_factory_composition_${suffix}`
  });
}
