import { describe, expect, it } from "vitest";
import {
  consumeMountedProductionPromptReadbackWitness,
  createMountedProductionPromptReadbackAuthority,
  issueMountedProductionPromptReadback
} from "../src/production-prompt-readback.js";
import { serializePromptArtifactEnvelope } from "../src/prompt-artifacts.js";
import {
  buildResolvedContextPack,
  createContextPackRegistry,
  registerContextPackPayloadParserAuthority,
  type AgentContextPackJsonValue
} from "../src/context-packs.js";
import {
  productionSpecialistPromptRegistrationFor,
  renderProductionSpecialistPrompt
} from "../src/production-specialist-prompts.js";

describe("mounted production prompt readback authority", () => {
  it("rejects structural or copied values without mounted-store membership", async () => {
    const structural = {
      schemaVersion: "agent-mounted-production-prompt-readback.v1",
      inputArtifactHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      workspaceId: "ws_readback_test",
      mountInstanceId: "process_readback_test"
    } as const;

    await expect(consumeMountedProductionPromptReadbackWitness(structural))
      .rejects.toThrow(/mounted.*prompt.*readback|required/i);
    await expect(consumeMountedProductionPromptReadbackWitness({ ...structural }))
      .rejects.toThrow(/mounted.*prompt.*readback|required/i);
  });

  it("reserves one mounted readback witness before deferred revalidation", async () => {
    const prompt = await productionPrompt();
    const canonical = Buffer.from(serializePromptArtifactEnvelope(prompt));
    const rereadStarted = deferred<void>();
    const rereadRelease = deferred<Uint8Array>();
    let rereadCount = 0;
    let deferConsumption = false;
    const authority = createMountedProductionPromptReadbackAuthority({
      currentMount: () => ({ workspaceId: "ws_readback_test", rootDir: "/workspace", blobRoot: "/workspace/blobs" })
    });
    const witness = await issueMountedProductionPromptReadback({
      serializedEnvelope: canonical,
      authoritativeResolvedContextPacks: prompt.resolvedContextPacks,
      authority,
      rereadCanonicalBytes: async () => {
        rereadCount += 1;
        if (!deferConsumption) return canonical;
        rereadStarted.resolve();
        return await rereadRelease.promise;
      }
    });
    const expected = expectedReadback(prompt);

    deferConsumption = true;
    const first = consumeMountedProductionPromptReadbackWitness(witness, expected);
    await rereadStarted.promise;
    const second = consumeMountedProductionPromptReadbackWitness(witness, expected);
    await Promise.resolve();

    // Issuance plus the first consumer only: a competing consumer must fail
    // before it can start a second mounted-byte revalidation.
    expect(rereadCount).toBe(2);
    rereadRelease.resolve(canonical);
    await expect(first).resolves.toMatchObject({ envelope: { manifest: { inputArtifactHash: prompt.manifest.inputArtifactHash } } });
    await expect(second).rejects.toThrow(/already consumed|mounted.*readback/i);
  });

  it("burns a reserved mounted readback witness after deferred revalidation fails", async () => {
    const prompt = await productionPrompt();
    const canonical = Buffer.from(serializePromptArtifactEnvelope(prompt));
    const rereadStarted = deferred<void>();
    const rereadRelease = deferred<Uint8Array>();
    let deferConsumption = false;
    const authority = createMountedProductionPromptReadbackAuthority({
      currentMount: () => ({ workspaceId: "ws_readback_test", rootDir: "/workspace", blobRoot: "/workspace/blobs" })
    });
    const witness = await issueMountedProductionPromptReadback({
      serializedEnvelope: canonical,
      authoritativeResolvedContextPacks: prompt.resolvedContextPacks,
      authority,
      rereadCanonicalBytes: async () => {
        if (!deferConsumption) return canonical;
        rereadStarted.resolve();
        return await rereadRelease.promise;
      }
    });
    const expected = expectedReadback(prompt);

    deferConsumption = true;
    const first = consumeMountedProductionPromptReadbackWitness(witness, expected);
    await rereadStarted.promise;
    rereadRelease.reject(new Error("mount changed during deferred readback"));

    await expect(first).rejects.toThrow(/mount changed/i);
    await expect(consumeMountedProductionPromptReadbackWitness(witness, expected))
      .rejects.toThrow(/already consumed|mounted.*readback/i);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function productionPrompt() {
  const registry = createContextPackRegistry();
  const registration = productionSpecialistPromptRegistrationFor("evidence-triage");
  for (const requirement of registration.contextRequirements) {
    if (requirement.requirementMode !== "always") continue;
    const parser = (payload: AgentContextPackJsonValue) => payload;
    Object.defineProperty(parser, "cestusContextPackParserId", { value: requirement.contextPackId });
    registerContextPackPayloadParserAuthority(parser);
    registry.register({
      descriptor: {
        contextPackId: requirement.contextPackId,
        version: 1,
        label: `Readback ${requirement.contextPackId}`,
        maxBytes: 16_384,
        requiredProvenanceKinds: ["event-id"],
        redactionPolicy: "safe-summary",
        sourceProjection: "agent.test"
      },
      parsePayload: parser,
      build: () => buildResolvedContextPack({
        contextPackId: requirement.contextPackId,
        version: 1,
        generatedAt: "2026-07-15T21:00:00.000Z",
        payload: fixturePayload(requirement.contextPackId),
        safeSummary: `Readback ${requirement.contextPackId}.`,
        provenanceRefs: ["evt_readback_fixture"]
      })
    });
  }
  const resolvedContextPacks = await Promise.all(registration.contextRequirements
    .filter((requirement) => requirement.requirementMode === "always")
    .map(async (requirement) => await registry.buildResolved(requirement.contextPackId)));
  return renderProductionSpecialistPrompt({
    taskId: "task_readback_test",
    runId: "run_readback_test",
    runType: "evidence-triage",
    generatedAt: "2026-07-15T21:00:00.000Z",
    scope: { kind: "workspace", refs: ["ws_readback_test"] },
    resolvedContextPacks
  });
}

function expectedReadback(prompt: Awaited<ReturnType<typeof productionPrompt>>) {
  const production = prompt.manifest.production;
  if (production?.schemaVersion !== "agent-production-prompt-binding.v1") {
    throw new Error("Expected a production V1 prompt.");
  }
  return {
    workspaceId: "ws_readback_test",
    taskId: "task_readback_test",
    runId: "run_readback_test",
    runType: "evidence-triage" as const,
    scopeApplicabilityHash: production.scopeApplicabilityHash,
    contextPackRefs: prompt.manifest.contextPackRefs
  };
}

function fixturePayload(contextPackId: string): AgentContextPackJsonValue {
  switch (contextPackId) {
    case "accepted-graph-projection.v1": return { items: { assertions: [{ assertionId: "assertion_001", evidenceId: "ev_001", safeStatement: "Evidence requires review." }], entities: [], relationships: [] } };
    case "evidence-summary.v1": return { items: [{ evidenceId: "ev_001", ingestionEventId: "evt_ingested_001", contentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111", safeNarrative: "Evidence is available." }] };
    case "governance-locks.v1": return { items: { activeLocks: [{ lockId: "lock_001", lockKind: "review", safeReason: "Human review.", activatedBy: "agent_test", activatedAt: "2026-07-15T21:00:00.000Z", relatedEventIds: ["evt_lock_001"], projectionEventIds: ["evt_lock_001"] }], governanceRestrictions: [] } };
    case "agent-memory-summary.v1": return { memory: { activeMemory: ["Preserve review caveats."], aggregateCounts: { active: 1 }, sourceEventIds: ["evt_memory_001"], artifactHashes: [] } };
    case "task-run-history.v1": return { history: { projectionHighWaterMark: 1, projectionSourceRef: "agent.test", tasks: [{ taskId: "task_readback_test", status: "queued", statusReasonCode: "Awaiting review." }], runs: [], modelInvocations: [], toolRequests: [], aggregateCounts: { tasks: 1 }, sourceEventIds: ["evt_task_001"], artifactHashes: [] } };
    case "workspace-runtime-status.v1": return { runtime: { runtimeHighWaterMark: 1, workspaceMounted: true, storageStrategy: "portable-workspace", bindPosture: "bound", authPosture: "none", projectionHighWaterMarks: { agent: 1 }, omissionCodes: [] } };
    default: throw new Error(`Unexpected readback fixture context ${contextPackId}`);
  }
}
